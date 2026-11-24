/**
 * Нормативы идут календарными часами, круглосуточно. Рабочий календарь
 * в этот этап не входит. Срок решения по умолчанию — пример Glide:
 * срочный 4 ч, высокий 8 ч, обычный 24 ч, низкий 48 ч. Первый ответ задан
 * отдельно учебными значениями и не является рыночным стандартом.
 *
 * Смена приоритета перезапускает ещё открытые часы с бюджета нового
 * приоритета. Уже записанное нарушение остаётся. Пауза «Ждём клиента»
 * не расходует остаток. Первый ответ — только публичный ответ оператора.
 */
import { instantToWallClock, wallClockToInstant } from '@tableapp/schema'
import type { SupportStatusName } from './support-logic'

export type SupportSlaPriority = 'urgent' | 'high' | 'normal' | 'low'

export type SupportSlaPolicy = {
  calendarHours: true
  riskMinutes: number
  firstResponseMinutes: Record<SupportSlaPriority, number>
  resolutionMinutes: Record<SupportSlaPriority, number>
}

export const SUPPORT_SLA_STARTER: SupportSlaPolicy = {
  calendarHours: true,
  riskMinutes: 120,
  firstResponseMinutes: { urgent: 60, high: 120, normal: 480, low: 1440 },
  resolutionMinutes: { urgent: 240, high: 480, normal: 1440, low: 2880 },
}

export type SupportSlaEvent = {
  at: number
  kind: 'created' | 'status' | 'priority' | 'public_reply'
  status?: string
  priority?: string
}

export type SupportSlaBreach = { kind: 'first' | 'resolution'; at: number; priority: SupportSlaPriority }
export type SupportSlaClose = { at: number; met: boolean; spentMs: number }

export type SupportSlaClock = {
  known: boolean
  met: boolean
  paused: boolean
  overdue: boolean
  risk: boolean
  dueAt: number | null
  remainingMs: number | null
}

export type SupportSlaView = {
  known: boolean
  priority: SupportSlaPriority | null
  status: string
  paused: boolean
  open: boolean
  first: SupportSlaClock
  resolution: SupportSlaClock
  breaches: SupportSlaBreach[]
  firstCloses: SupportSlaClose[]
  resolutionCloses: SupportSlaClose[]
  currentOverdue: boolean
  currentRisk: boolean
  createdAt: number | null
}

const NAMES: Record<string, SupportSlaPriority> = { 'Срочный': 'urgent', 'Высокий': 'high', 'Обычный': 'normal', 'Низкий': 'low' }

export function supportSlaPriority(name: string): SupportSlaPriority | null {
  return NAMES[name] ?? null
}

export function supportSlaPriorityName(priority: SupportSlaPriority) {
  if (priority === 'urgent') return 'Срочный'
  if (priority === 'high') return 'Высокий'
  if (priority === 'normal') return 'Обычный'
  return 'Низкий'
}

const UNKNOWN: SupportSlaClock = { known: false, met: false, paused: false, overdue: false, risk: false, dueAt: null, remainingMs: null }

type Clock = { met: boolean; stopped: boolean; paused: boolean; runningFrom: number | null; spentMs: number; budgetMs: number }

function blank(): SupportSlaView {
  return {
    known: false, priority: null, status: '', paused: false, open: false,
    first: UNKNOWN, resolution: UNKNOWN, breaches: [], firstCloses: [], resolutionCloses: [],
    currentOverdue: false, currentRisk: false, createdAt: null,
  }
}

function start(at: number, budgetMs: number, paused: boolean): Clock {
  return { met: false, stopped: false, paused, runningFrom: paused ? null : at, spentMs: 0, budgetMs }
}

function spent(clock: Clock, at: number) {
  return clock.spentMs + (clock.runningFrom == null ? 0 : Math.max(0, at - clock.runningFrom))
}

function freeze(clock: Clock, at: number) {
  if (clock.runningFrom == null) return
  clock.spentMs += Math.max(0, at - clock.runningFrom)
  clock.runningFrom = null
}

function show(clock: Clock | null, now: number, riskMs: number, active: boolean): SupportSlaClock {
  if (!clock) return UNKNOWN
  const live = active && !clock.stopped
  const used = spent(clock, now)
  const remainingMs = !live ? null : clock.budgetMs - used
  const overdue = remainingMs != null && !clock.paused && remainingMs <= 0
  const risk = remainingMs != null && !clock.paused && remainingMs > 0 && remainingMs <= riskMs
  const dueAt = !live || clock.runningFrom == null ? null : clock.runningFrom + (clock.budgetMs - clock.spentMs)
  return { known: true, met: clock.met, paused: live && clock.paused, overdue, risk, dueAt, remainingMs }
}

function isStatus(value: string | undefined): value is SupportStatusName {
  return value === 'Новое' || value === 'В работе' || value === 'Ждём клиента' || value === 'Решено' || value === 'Закрыто'
}

const RANK = { created: 0, priority: 1, status: 2, public_reply: 3 }

/** Без события создания расчёт не выдумывает время ответа. */
export function supportSlaView(events: readonly SupportSlaEvent[], policy: SupportSlaPolicy | null, now: number): SupportSlaView {
  if (!policy) return blank()
  const ordered = [...events].filter(event => Number.isFinite(event.at)).sort((a, b) => a.at - b.at || RANK[a.kind] - RANK[b.kind])
  const created = ordered.find(event => event.kind === 'created')
  if (!created) return blank()
  let priority = supportSlaPriority(created.priority ?? '') ?? 'normal'
  let status: SupportStatusName = isStatus(created.status) ? created.status : 'Новое'
  let open = status !== 'Решено' && status !== 'Закрыто'
  let first: Clock | null = start(created.at, policy.firstResponseMinutes[priority] * 60_000, status === 'Ждём клиента')
  let resolution: Clock | null = start(created.at, policy.resolutionMinutes[priority] * 60_000, status === 'Ждём клиента')
  const breaches: SupportSlaBreach[] = []
  const firstCloses: SupportSlaClose[] = []
  const resolutionCloses: SupportSlaClose[] = []

  const restart = (clock: Clock, at: number, budgetMs: number, kind: 'first' | 'resolution') => {
    if (clock.met || clock.stopped) return clock
    freeze(clock, at)
    if (clock.spentMs > clock.budgetMs) breaches.push({ kind, at, priority })
    return start(at, budgetMs, status === 'Ждём клиента')
  }
  const closeFirst = (at: number, answered: boolean) => {
    if (!first || first.stopped) return
    freeze(first, at)
    const missed = first.spentMs > first.budgetMs
    if (missed) breaches.push({ kind: 'first', at, priority })
    first.met = answered && !missed
    first.stopped = true
    first.paused = false
    first.runningFrom = null
    firstCloses.push({ at, met: first.met, spentMs: first.spentMs })
  }
  const closeResolution = (at: number) => {
    if (!resolution || resolution.stopped) return
    freeze(resolution, at)
    const met = resolution.spentMs <= resolution.budgetMs
    if (!met) breaches.push({ kind: 'resolution', at, priority })
    resolution.met = met
    resolution.stopped = true
    resolution.paused = false
    resolution.runningFrom = null
    resolutionCloses.push({ at, met, spentMs: resolution.spentMs })
  }

  for (const event of ordered) {
    if (event.at < created.at || event.kind === 'created') continue
    if (event.kind === 'priority') {
      const next = supportSlaPriority(event.priority ?? '')
      if (!next || next === priority || !open) continue
      if (first) first = restart(first, event.at, policy.firstResponseMinutes[next] * 60_000, 'first')
      if (resolution) resolution = restart(resolution, event.at, policy.resolutionMinutes[next] * 60_000, 'resolution')
      priority = next
      continue
    }
    if (event.kind === 'public_reply') {
      if (open) closeFirst(event.at, true)
      continue
    }
    if (event.kind !== 'status' || !isStatus(event.status) || event.status === status) continue
    const next = event.status
    const terminal = next === 'Решено' || next === 'Закрыто'
    if (terminal && open) {
      closeFirst(event.at, false)
      closeResolution(event.at)
      open = false
      status = next
      continue
    }
    if (!open && !terminal) {
      const waiting = next === 'Ждём клиента'
      if (!first?.met) first = start(event.at, policy.firstResponseMinutes[priority] * 60_000, waiting)
      resolution = start(event.at, policy.resolutionMinutes[priority] * 60_000, waiting)
      open = true
      status = next
      continue
    }
    if (!open) continue
    if (next === 'Ждём клиента') {
      if (first && !first.stopped) { freeze(first, event.at); first.paused = true }
      if (resolution && !resolution.stopped) { freeze(resolution, event.at); resolution.paused = true }
      status = next
      continue
    }
    if (status === 'Ждём клиента') {
      if (first && !first.stopped) { first.paused = false; first.runningFrom = event.at }
      if (resolution && !resolution.stopped) { resolution.paused = false; resolution.runningFrom = event.at }
    }
    status = next
  }

  const riskMs = policy.riskMinutes * 60_000
  const paused = open && status === 'Ждём клиента'
  const firstView = show(first, now, riskMs, open)
  const resolutionView = show(resolution, now, riskMs, open)
  const currentOverdue = open && !paused && (firstView.overdue || resolutionView.overdue)
  const currentRisk = open && !paused && !currentOverdue && (firstView.risk || resolutionView.risk)
  return {
    known: true, priority, status, paused, open, first: firstView, resolution: resolutionView,
    breaches, firstCloses, resolutionCloses, currentOverdue, currentRisk, createdAt: created.at,
  }
}

export type SupportQueueScope = 'all' | 'open' | 'unassigned' | 'mine' | 'risk' | 'overdue' | 'hot' | 'waiting' | 'closed'

export function supportQueueMatch(input: { status: string; assigneeEmail: string; sla: SupportSlaView; manualOverdue: boolean }, scope: SupportQueueScope, actorEmail: string) {
  const open = input.sla.known ? input.sla.open : input.status !== 'Решено' && input.status !== 'Закрыто'
  if (scope === 'all') return true
  if (scope === 'open') return open
  if (scope === 'unassigned') return open && !input.assigneeEmail.trim()
  if (scope === 'mine') return input.assigneeEmail.trim().toLowerCase() === actorEmail.trim().toLowerCase() && input.assigneeEmail.trim() !== ''
  if (scope === 'waiting') return input.status === 'Ждём клиента'
  if (scope === 'closed') return input.status === 'Решено' || input.status === 'Закрыто'
  if (scope === 'overdue') return input.sla.known ? input.sla.currentOverdue : input.manualOverdue
  if (scope === 'hot') {
    if (input.sla.known) return input.sla.currentOverdue || input.sla.currentRisk
    return input.manualOverdue
  }
  return input.sla.known ? input.sla.currentRisk : false
}

export type SupportAgeBucket = 'lt4h' | '4to12h' | '12to24h' | '1to3d' | 'gt3d'

export const SUPPORT_HEAT_AGES: { id: SupportAgeBucket; label: string; shortLabel: string }[] = [
  { id: 'lt4h', label: 'до 4 ч', shortLabel: '<4 ч' },
  { id: '4to12h', label: '4–12 ч', shortLabel: '4–12' },
  { id: '12to24h', label: '12–24 ч', shortLabel: '12–24' },
  { id: '1to3d', label: '1–3 дня', shortLabel: '1–3 д' },
  { id: 'gt3d', label: 'больше 3 дней', shortLabel: '>3 д' },
]

export function supportSlaPriorityShort(priority: SupportSlaPriority) {
  if (priority === 'urgent') return 'Сроч.'
  if (priority === 'high') return 'Высок.'
  if (priority === 'normal') return 'Обычн.'
  return 'Низк.'
}

export function supportHeatAgeBucket(ageMs: number): SupportAgeBucket {
  if (ageMs < 4 * 3_600_000) return 'lt4h'
  if (ageMs < 12 * 3_600_000) return '4to12h'
  if (ageMs < 24 * 3_600_000) return '12to24h'
  if (ageMs < 3 * 24 * 3_600_000) return '1to3d'
  return 'gt3d'
}

export type SupportHeatCell = { count: number; breached: number }
export type SupportHeatRow = { priority: SupportSlaPriority; cells: Record<SupportAgeBucket, SupportHeatCell>; total: SupportHeatCell }

export type SupportDashboard = {
  open: number
  unassigned: number
  risk: number
  overdue: number
  resolvedToday: number
  resolvedYesterday: number
  openYesterday: number
  overdueYesterday: number
  resolvedInPeriod: number
  avgFirstResponseMs: number | null
  avgResolutionMs: number | null
  avgFirstYesterdayMs: number | null
  avgResolutionYesterdayMs: number | null
  firstMet: number
  firstClosed: number
  resolutionMet: number
  resolutionClosed: number
  age: { priority: SupportSlaPriority; count: number; oldestMs: number }[]
  heat: SupportHeatRow[]
  openByAssignee: Record<string, number>
}

function dayBounds(now: number) {
  const wall = instantToWallClock(new Date(now), 'Europe/Moscow')
  if (!wall) {
    const dayMs = 24 * 60 * 60 * 1000
    const todayStart = now - (now % dayMs)
    return { todayStart, yesterdayStart: todayStart - dayMs }
  }
  const [year, month, day] = wall.date.split('-').map(Number) as [number, number, number]
  const todayStart = wallClockToInstant({ year, month, day, hour: 0, minute: 0, second: 0 }, 'Europe/Moscow').getTime()
  return { todayStart, yesterdayStart: todayStart - 24 * 60 * 60 * 1000 }
}

export function supportDashboard(items: readonly { assigneeEmail: string; sla: SupportSlaView }[], now: number, periodMs: number): SupportDashboard {
  const from = now - periodMs
  const { todayStart, yesterdayStart } = dayBounds(now)
  const result: SupportDashboard = {
    open: 0, unassigned: 0, risk: 0, overdue: 0, resolvedToday: 0, resolvedYesterday: 0,
    openYesterday: 0, overdueYesterday: 0, resolvedInPeriod: 0,
    avgFirstResponseMs: null, avgResolutionMs: null, avgFirstYesterdayMs: null, avgResolutionYesterdayMs: null,
    firstMet: 0, firstClosed: 0, resolutionMet: 0, resolutionClosed: 0, age: [], heat: [], openByAssignee: {},
  }
  let firstSum = 0, firstCount = 0, resolveSum = 0, resolveCount = 0
  let firstYSum = 0, firstYCount = 0, resolveYSum = 0, resolveYCount = 0
  const age = new Map<SupportSlaPriority, { count: number; oldestMs: number }>()
  const heat = new Map<SupportSlaPriority, SupportHeatRow>()
  const blankCell = (): SupportHeatCell => ({ count: 0, breached: 0 })
  const blankRow = (priority: SupportSlaPriority): SupportHeatRow => ({
    priority,
    cells: { lt4h: blankCell(), '4to12h': blankCell(), '12to24h': blankCell(), '1to3d': blankCell(), gt3d: blankCell() },
    total: blankCell(),
  })
  const inside = (at: number) => at >= from && at <= now
  for (const item of items) {
    const sla = item.sla
    if (!sla.known) continue
    if (sla.open) {
      result.open += 1
      if (!item.assigneeEmail.trim()) result.unassigned += 1
      else result.openByAssignee[item.assigneeEmail.trim().toLowerCase()] = (result.openByAssignee[item.assigneeEmail.trim().toLowerCase()] ?? 0) + 1
      if (sla.currentRisk) result.risk += 1
      if (sla.currentOverdue) result.overdue += 1
      if (sla.createdAt != null && sla.createdAt < todayStart) result.openYesterday += 1
      if (sla.currentOverdue && sla.createdAt != null && sla.createdAt < yesterdayStart) result.overdueYesterday += 1
      if (sla.priority && sla.createdAt != null) {
        const ageMs = Math.max(0, now - sla.createdAt)
        const bucket = age.get(sla.priority) ?? { count: 0, oldestMs: 0 }
        bucket.count += 1
        bucket.oldestMs = Math.max(bucket.oldestMs, ageMs)
        age.set(sla.priority, bucket)
        const row = heat.get(sla.priority) ?? blankRow(sla.priority)
        const cell = row.cells[supportHeatAgeBucket(ageMs)]
        cell.count += 1
        row.total.count += 1
        if (sla.currentOverdue) { cell.breached += 1; row.total.breached += 1 }
        heat.set(sla.priority, row)
      }
    }
    for (const close of sla.firstCloses) {
      if (close.at >= yesterdayStart && close.at < todayStart) { firstYSum += close.spentMs; firstYCount += 1 }
      if (!inside(close.at)) continue
      result.firstClosed += 1
      firstSum += close.spentMs
      firstCount += 1
      if (close.met) result.firstMet += 1
    }
    for (const close of sla.resolutionCloses) {
      if (close.at >= todayStart && close.at <= now) result.resolvedToday += 1
      if (close.at >= yesterdayStart && close.at < todayStart) { result.resolvedYesterday += 1; resolveYSum += close.spentMs; resolveYCount += 1 }
      if (!inside(close.at)) continue
      result.resolutionClosed += 1
      result.resolvedInPeriod += 1
      resolveSum += close.spentMs
      resolveCount += 1
      if (close.met) result.resolutionMet += 1
    }
  }
  result.avgFirstResponseMs = firstCount ? firstSum / firstCount : null
  result.avgResolutionMs = resolveCount ? resolveSum / resolveCount : null
  result.avgFirstYesterdayMs = firstYCount ? firstYSum / firstYCount : null
  result.avgResolutionYesterdayMs = resolveYCount ? resolveYSum / resolveYCount : null
  result.age = (['urgent', 'high', 'normal', 'low'] as const).flatMap(priority => {
    const bucket = age.get(priority)
    return bucket ? [{ priority, ...bucket }] : []
  })
  result.heat = (['urgent', 'high', 'normal', 'low'] as const).map(priority => heat.get(priority) ?? blankRow(priority))
  return result
}

export function supportSlaLabel(view: SupportSlaView) {
  if (!view.known) return ''
  if (!view.open) return view.resolution.met ? 'Норматив соблюдён' : view.resolutionCloses.length ? 'Норматив нарушен' : ''
  if (view.paused) return 'Норматив на паузе'
  if (view.first.overdue && view.resolution.overdue) return 'Ответ и решение просрочены'
  if (view.first.overdue) return 'Ответ просрочен'
  if (view.resolution.overdue) return 'Решение просрочено'
  if (view.currentRisk) return 'Скоро срок'
  return ''
}
