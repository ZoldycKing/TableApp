import { calendarDay, dateInstant, instantToWallClock } from '@tableapp/schema'
import { DISPATCH_TIME_ZONE } from './dispatch-logic'

/** Stage 2 field-service rules: timer, checklist, recurrence, billing and address display. */

export type RepeatRule = 'weekly' | 'biweekly' | 'monthly' | 'quarterly'

export const REPEAT_OPTIONS: { rule: RepeatRule; name: string }[] = [
  { rule: 'weekly', name: 'Еженедельно' },
  { rule: 'biweekly', name: 'Раз в 2 недели' },
  { rule: 'monthly', name: 'Ежемесячно' },
  { rule: 'quarterly', name: 'Раз в квартал' },
]

export function repeatRuleFromName(name: string): RepeatRule | null {
  return REPEAT_OPTIONS.find(item => item.name === name)?.rule ?? null
}

export function repeatName(rule: RepeatRule): string {
  return REPEAT_OPTIONS.find(item => item.rule === rule)?.name ?? ''
}

export type ChecklistItem = { label: string; done: boolean }

export function checklistFromTemplate(text: string): ChecklistItem[] {
  const seen = new Set<string>()
  const items: ChecklistItem[] = []
  for (const line of text.split(/\r?\n/)) {
    const label = line.trim().slice(0, 200)
    if (!label || seen.has(label)) continue
    seen.add(label)
    items.push({ label, done: false })
    if (items.length >= 30) break
  }
  return items
}

export function parseChecklist(value: unknown): ChecklistItem[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    const items: ChecklistItem[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const label = 'label' in item && typeof item.label === 'string' ? item.label.trim().slice(0, 200) : ''
      if (!label) continue
      items.push({ label, done: 'done' in item && item.done === true })
      if (items.length >= 30) break
    }
    return items
  } catch {
    return []
  }
}

export function serializeChecklist(items: readonly ChecklistItem[]): string {
  return JSON.stringify(items.map(item => ({ label: item.label, done: item.done })))
}

export function checklistProgress(items: readonly ChecklistItem[]) {
  return { done: items.filter(item => item.done).length, total: items.length }
}

export function toggleChecklistItem(items: readonly ChecklistItem[], index: number): ChecklistItem[] {
  return items.map((item, position) => position === index ? { ...item, done: !item.done } : item)
}

/** Warns while unfinished points remain. An empty checklist does not warn. */
export function completionChecklistWarning(items: readonly ChecklistItem[]): string | null {
  const { done, total } = checklistProgress(items)
  if (!total || done >= total) return null
  const left = total - done
  return `Остались пункты чек-листа: ${left} из ${total}.`
}

export function startVisit(now: number) {
  return { onSiteAt: new Date(now).toISOString() }
}

export function elapsedMinutes(onSiteAt: string | null | undefined, end: number): number | null {
  if (!onSiteAt) return null
  const start = Date.parse(onSiteAt)
  if (!Number.isFinite(start) || end < start) return null
  return Math.max(0, Math.round((end - start) / 60_000))
}

export function stopVisit(onSiteAt: string | null | undefined, now: number) {
  const minutes = elapsedMinutes(onSiteAt, now)
  return { doneAt: new Date(now).toISOString(), actualMinutes: minutes ?? 0 }
}

export function correctActualMinutes(value: number): { ok: true; minutes: number } | { ok: false; error: string } {
  if (!Number.isFinite(value) || value < 0 || value > 24 * 60) return { ok: false, error: 'Укажите фактическое время в минутах, не больше суток.' }
  return { ok: true, minutes: Math.round(value) }
}

/** Stored minutes win. Otherwise the timer runs until doneAt, or until now while the visit is open. */
export function actualMinutesOf(input: { onSiteAt?: string | null; doneAt?: string | null; actualMinutes?: number | null; now: number }): number | null {
  if (typeof input.actualMinutes === 'number' && Number.isFinite(input.actualMinutes) && input.actualMinutes >= 0) return Math.round(input.actualMinutes)
  return elapsedMinutes(input.onSiteAt, input.doneAt ? Date.parse(input.doneAt) : input.now)
}

export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  if (hours && rest) return `${hours} ч ${rest} мин`
  if (hours) return `${hours} ч`
  return `${rest} мин`
}

export type MoneyLine = { name: string; amount: number }

export function parseMoneyLines(value: unknown): MoneyLine[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    const lines: MoneyLine[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const name = 'name' in item && typeof item.name === 'string' ? item.name.trim().slice(0, 200) : ''
      const amount = 'amount' in item && typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : NaN
      if (!name || amount < 0) continue
      lines.push({ name, amount: Math.round(amount * 100) / 100 })
      if (lines.length >= 30) break
    }
    return lines
  } catch {
    return []
  }
}

export function serializeMoneyLines(lines: readonly MoneyLine[]): string {
  return JSON.stringify(lines.map(line => ({ name: line.name, amount: line.amount })))
}

export function billingTotal(works: readonly MoneyLine[], materials: readonly MoneyLine[]): number {
  const sum = [...works, ...materials].reduce((total, line) => total + line.amount, 0)
  return Math.round(sum * 100) / 100
}

export function formatRub(amount: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)
}

/** Hide the client-card address column when the visit is at the client's own address. */
export function distinctJobAddress(jobAddress: string, clientAddress: string): string | null {
  const job = jobAddress.trim()
  const client = clientAddress.trim()
  if (!job || job === client) return null
  return job
}

function addMonths(day: string, months: number): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number) as [number, number, number]
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1, 12))
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(dayOfMonth, last), 12)).toISOString().slice(0, 10)
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Occurrences from the first visit through the nearer of the horizon, the until-date and the count.
 * The first item is the seed visit. Horizon is three months when a shorter limit is not set.
 */
export function recurrenceOccurrences(input: {
  start: string
  rule: RepeatRule
  until?: string | null
  count?: number | null
  horizonMonths?: number
  timeZone?: string
}): string[] {
  const zone = input.timeZone ?? DISPATCH_TIME_ZONE
  const startAt = dateInstant(input.start, zone)
  const wall = startAt === null ? null : instantToWallClock(new Date(startAt), zone)
  if (!wall) return []
  const horizonMonths = input.horizonMonths ?? 3
  const horizon = addMonths(wall.date, horizonMonths)
  const until = input.until && /^\d{4}-\d{2}-\d{2}$/.test(input.until) ? input.until : null
  const limit = until && until < horizon ? until : horizon
  const cap = input.count != null && Number.isFinite(input.count) ? Math.max(1, Math.min(36, Math.floor(input.count))) : 36
  const stepDays = input.rule === 'weekly' ? 7 : input.rule === 'biweekly' ? 14 : 0
  const stepMonths = input.rule === 'monthly' ? 1 : input.rule === 'quarterly' ? 3 : 0
  const dates = [wall.date]
  for (let index = 1; dates.length < cap; index += 1) {
    const next = stepDays ? addDays(wall.date, index * stepDays) : addMonths(wall.date, index * stepMonths)
    if (next > limit) break
    dates.push(next)
  }
  return dates.flatMap(date => {
    const instant = dateInstant(`${date}T${wall.time}`, zone)
    return instant === null ? [] : [new Date(instant).toISOString()]
  })
}

export type SeriesJob = { id: string; seriesId: string; when: unknown; status: string }

const closed = new Set(['Выполнено', 'Готово', 'Отменена', 'Отменено', 'Отменён'])

/** One visit, or this visit plus later open visits of the same series. */
export function seriesEditIds(jobs: readonly SeriesJob[], jobId: string, scope: 'one' | 'series', timeZone = DISPATCH_TIME_ZONE): string[] {
  const current = jobs.find(job => job.id === jobId)
  if (!current) return []
  if (scope === 'one' || !current.seriesId.trim()) return [current.id]
  const day = calendarDay(current.when, timeZone)
  return jobs.filter(job => {
    if (job.seriesId !== current.seriesId || closed.has(job.status)) return false
    if (job.id === current.id) return true
    const other = calendarDay(job.when, timeZone)
    return Boolean(day && other && other >= day)
  }).map(job => job.id)
}
