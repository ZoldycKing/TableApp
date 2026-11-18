import { calendarDay, dateInstant, instantToWallClock } from '@tableapp/schema'
import { DONE_STATUS, PROJECTS_TIME_ZONE, civilDay, formatDay, isDone, todayKey } from './projects-logic'

/** Stage 2: Gantt links, time tracking, templates, recurrence, workload and client access. */

export type GanttZoom = 'day' | 'week' | 'month'
export type RepeatRule = 'daily' | 'weekly' | 'monthly' | 'custom'

export const REPEAT_OPTIONS: { rule: RepeatRule; name: string }[] = [
  { rule: 'daily', name: 'Ежедневно' },
  { rule: 'weekly', name: 'Еженедельно' },
  { rule: 'monthly', name: 'Ежемесячно' },
  { rule: 'custom', name: 'Свой интервал' },
]

export function repeatRuleFromName(name: string): RepeatRule | null {
  return REPEAT_OPTIONS.find(item => item.name === name)?.rule ?? null
}

export function repeatName(rule: RepeatRule): string {
  return REPEAT_OPTIONS.find(item => item.rule === rule)?.name ?? ''
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  if (hours && rest) return `${hours} ч ${rest} мин`
  if (hours) return `${hours} ч`
  return `${rest} мин`
}

export function formatClock(value: unknown, timeZone = PROJECTS_TIME_ZONE) {
  if (typeof value !== 'string' || !value) return ''
  const wall = instantToWallClock(new Date(value), timeZone)
  if (!wall) return ''
  return `${formatDay(wall.date)} ${wall.time.slice(0, 5)}`
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function addMonths(day: string, months: number): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number) as [number, number, number]
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1, 12))
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(dayOfMonth, last), 12)).toISOString().slice(0, 10)
}

export type DependencyLink = { id: string; fromId: string; toId: string }

/** Finish-to-start: from finishes before to starts. Rejects self-links and cycles. */
export function canLinkTasks(links: readonly DependencyLink[], fromId: string, toId: string) {
  if (!fromId || !toId || fromId === toId) return { ok: false as const, error: 'Связь должна соединять две разные задачи.' }
  if (links.some(link => link.fromId === fromId && link.toId === toId)) return { ok: false as const, error: 'Такая зависимость уже есть.' }
  const graph = new Map<string, string[]>()
  for (const link of links) {
    const list = graph.get(link.fromId) ?? []
    list.push(link.toId)
    graph.set(link.fromId, list)
  }
  const stack = [toId]
  const seen = new Set<string>()
  while (stack.length) {
    const current = stack.pop()!
    if (current === fromId) return { ok: false as const, error: 'Связь создаёт цикл.' }
    if (seen.has(current)) continue
    seen.add(current)
    for (const next of graph.get(current) ?? []) stack.push(next)
  }
  return { ok: true as const }
}

export type GanttTask = {
  id: string
  title: string
  start: string | null
  due: string | null
  status: string
  parentId: string
}

export type GanttBar = {
  id: string
  title: string
  start: string
  end: string
  dayOffset: number
  daySpan: number
  done: boolean
}

export function ganttRange(tasks: readonly GanttTask[], today: string, pad = 3) {
  const days = tasks.flatMap(task => [civilDay(task.start), civilDay(task.due)].filter((value): value is string => Boolean(value)))
  if (!days.length) return { start: addDays(today, -pad), end: addDays(today, pad + 14) }
  const sorted = [...days].sort()
  return { start: addDays(sorted[0]!, -pad), end: addDays(sorted[sorted.length - 1]!, pad) }
}

export function eachDay(start: string, end: string): string[] {
  if (start > end) return []
  const days: string[] = []
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(cursor)
    if (days.length > 800) break
  }
  return days
}

export function dayIndex(start: string, day: string) {
  const a = Date.parse(`${start}T12:00:00Z`)
  const b = Date.parse(`${day}T12:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export function ganttBars(tasks: readonly GanttTask[], rangeStart: string): GanttBar[] {
  return tasks.flatMap(task => {
    const start = civilDay(task.start) || civilDay(task.due)
    const end = civilDay(task.due) || start
    if (!start || !end) return []
    const from = start <= end ? start : end
    const to = start <= end ? end : start
    return [{
      id: task.id,
      title: task.title,
      start: from,
      end: to,
      dayOffset: dayIndex(rangeStart, from),
      daySpan: Math.max(1, dayIndex(from, to) + 1),
      done: isDone(task.status),
    }]
  })
}

export function columnWidth(zoom: GanttZoom) {
  if (zoom === 'day') return 44
  if (zoom === 'week') return 28
  return 14
}

export function moveBarDates(start: string, end: string, deltaDays: number) {
  return { start: addDays(start, deltaDays), end: addDays(end, deltaDays) }
}

export function resizeBarDates(start: string, end: string, edge: 'start' | 'end', deltaDays: number) {
  if (edge === 'start') {
    const next = addDays(start, deltaDays)
    return next <= end ? { start: next, end } : { start: end, end }
  }
  const next = addDays(end, deltaDays)
  return next >= start ? { start, end: next } : { start, end: start }
}

export type TimeEntry = {
  id: string
  taskId: string
  email: string
  startedAt: string
  endedAt: string | null
  minutes: number | null
  note: string
}

export function entryMinutes(entry: Pick<TimeEntry, 'startedAt' | 'endedAt' | 'minutes'>, now: number) {
  if (typeof entry.minutes === 'number' && Number.isFinite(entry.minutes) && entry.minutes >= 0 && entry.endedAt) {
    return Math.round(entry.minutes)
  }
  const start = Date.parse(entry.startedAt)
  if (!Number.isFinite(start)) return 0
  const end = entry.endedAt ? Date.parse(entry.endedAt) : now
  if (!Number.isFinite(end) || end < start) return 0
  return Math.max(0, Math.round((end - start) / 60_000))
}

export function totalSpentMinutes(entries: readonly TimeEntry[], taskId: string, now: number) {
  return entries.filter(entry => entry.taskId === taskId).reduce((sum, entry) => sum + entryMinutes(entry, now), 0)
}

export function projectSpentMinutes(entries: readonly TimeEntry[], taskIds: readonly string[], now: number) {
  const set = new Set(taskIds)
  return entries.filter(entry => set.has(entry.taskId)).reduce((sum, entry) => sum + entryMinutes(entry, now), 0)
}

export function activeTimerFor(entries: readonly TimeEntry[], email: string) {
  const needle = email.trim().toLowerCase()
  return entries.find(entry => entry.email === needle && !entry.endedAt) ?? null
}

export function canStartTimer(entries: readonly TimeEntry[], email: string, taskId: string) {
  const active = activeTimerFor(entries, email)
  if (active && active.taskId !== taskId) return { ok: false as const, error: 'Сначала остановите таймер на другой задаче.', active }
  if (active && active.taskId === taskId) return { ok: false as const, error: 'Таймер уже запущен.', active }
  return { ok: true as const }
}

export function startTimerStamp(now: number) {
  return new Date(now).toISOString()
}

export function stopTimerValues(startedAt: string, now: number) {
  const minutes = entryMinutes({ startedAt, endedAt: null, minutes: null }, now)
  return { endedAt: new Date(now).toISOString(), minutes }
}

export function validateManualMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 24 * 60) return { ok: false as const, error: 'Укажите время от 1 до 1440 минут.' }
  return { ok: true as const, minutes: Math.round(value) }
}

/** Next civil day for a completed recurring task. Custom uses everyDays (default 1). */
export function nextOccurrenceDay(input: {
  due: string
  rule: RepeatRule
  everyDays?: number | null
  timeZone?: string
}): string | null {
  const zone = input.timeZone ?? PROJECTS_TIME_ZONE
  const day = civilDay(input.due, zone)
  if (!day) return null
  if (input.rule === 'daily') return addDays(day, 1)
  if (input.rule === 'weekly') return addDays(day, 7)
  if (input.rule === 'monthly') return addMonths(day, 1)
  const every = input.everyDays != null && Number.isFinite(input.everyDays) ? Math.max(1, Math.min(365, Math.floor(input.everyDays))) : 1
  return addDays(day, every)
}

export function shouldSpawnOnComplete(status: string, nextStatus: string, rule: RepeatRule | null) {
  return !isDone(status) && isDone(nextStatus) && Boolean(rule)
}

export function recurrenceLabel(rule: RepeatRule | null, everyDays?: number | null) {
  if (!rule) return ''
  if (rule === 'custom') return `Каждые ${Math.max(1, everyDays ?? 1)} дн.`
  return repeatName(rule)
}

export type WorkloadCell = { day: string; minutes: number; taskCount: number; overload: boolean }

export type WorkloadPerson = {
  id: string
  name: string
  email: string
  cells: WorkloadCell[]
  totalMinutes: number
  overloaded: boolean
}

const DAY_CAPACITY = 8 * 60
const WEEK_CAPACITY = 40 * 60

export function workloadFor(input: {
  people: readonly { id: string; name: string; email: string }[]
  tasks: readonly { id: string; assigneeId: string; due: unknown; estimate: number | null; status: string }[]
  entries: readonly TimeEntry[]
  days: readonly string[]
  mode: 'day' | 'week'
  now: number
  capacityMinutes?: number
}) {
  const capacity = input.capacityMinutes ?? (input.mode === 'day' ? DAY_CAPACITY : WEEK_CAPACITY)
  const spentByTask = new Map<string, number>()
  for (const entry of input.entries) {
    spentByTask.set(entry.taskId, (spentByTask.get(entry.taskId) ?? 0) + entryMinutes(entry, input.now))
  }
  return input.people.map(person => {
    const mine = input.tasks.filter(task => task.assigneeId === person.id && !isDone(task.status))
    const cells = input.days.map(day => {
      const dayTasks = mine.filter(task => civilDay(task.due) === day)
      const minutes = dayTasks.reduce((sum, task) => {
        const spent = spentByTask.get(task.id) ?? 0
        const estimate = task.estimate != null && task.estimate > 0 ? task.estimate : 60
        return sum + Math.max(estimate, spent)
      }, 0)
      return { day, minutes, taskCount: dayTasks.length, overload: minutes > capacity }
    })
    const totalMinutes = cells.reduce((sum, cell) => sum + cell.minutes, 0)
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      cells,
      totalMinutes,
      overloaded: cells.some(cell => cell.overload),
    } satisfies WorkloadPerson
  })
}

export type TemplateTaskSnapshot = {
  key: string
  title: string
  description: string
  checklist: string
  priority: string
  stageKey: string | null
  parentKey: string | null
  startOffset: number | null
  dueOffset: number | null
  estimate: number | null
  assigneeRole: string
}

export type TemplateStageSnapshot = {
  key: string
  title: string
  goal: string
  startOffset: number | null
  endOffset: number | null
}

export type ProjectTemplatePayload = {
  version: 1
  stages: TemplateStageSnapshot[]
  tasks: TemplateTaskSnapshot[]
}

export function captureProjectTemplate(input: {
  stages: readonly { id: string; title: string; goal: string; start: unknown; end: unknown }[]
  tasks: readonly {
    id: string
    title: string
    description: string
    checklist: string
    priority: string
    stageId: string
    parentId: string
    start: unknown
    due: unknown
    estimate: number | null
    assigneeRole: string
  }[]
  anchor: string
}): ProjectTemplatePayload {
  const stageKeys = new Map(input.stages.map((stage, index) => [stage.id, `stage_${index + 1}`]))
  const taskKeys = new Map(input.tasks.filter(task => !task.parentId).map((task, index) => [task.id, `task_${index + 1}`]))
  let subIndex = 0
  for (const task of input.tasks.filter(task => task.parentId)) {
    subIndex += 1
    taskKeys.set(task.id, `sub_${subIndex}`)
  }
  const offset = (value: unknown) => {
    const day = civilDay(value)
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(input.anchor)) return null
    return dayIndex(input.anchor, day)
  }
  return {
    version: 1,
    stages: input.stages.map(stage => ({
      key: stageKeys.get(stage.id)!,
      title: stage.title,
      goal: stage.goal,
      startOffset: offset(stage.start),
      endOffset: offset(stage.end),
    })),
    tasks: input.tasks.map(task => ({
      key: taskKeys.get(task.id)!,
      title: task.title,
      description: task.description,
      checklist: task.checklist,
      priority: task.priority,
      stageKey: task.stageId ? stageKeys.get(task.stageId) ?? null : null,
      parentKey: task.parentId ? taskKeys.get(task.parentId) ?? null : null,
      startOffset: offset(task.start),
      dueOffset: offset(task.due),
      estimate: task.estimate,
      assigneeRole: task.assigneeRole,
    })),
  }
}

export function materializeTemplate(payload: ProjectTemplatePayload, startDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false as const, error: 'Укажите дату старта проекта.' }
  const dayOf = (offset: number | null) => offset == null ? null : addDays(startDate, offset)
  return {
    ok: true as const,
    stages: payload.stages.map(stage => ({
      key: stage.key,
      title: stage.title,
      goal: stage.goal,
      start: dayOf(stage.startOffset),
      end: dayOf(stage.endOffset),
    })),
    tasks: payload.tasks.map(task => ({
      key: task.key,
      title: task.title,
      description: task.description,
      checklist: task.checklist,
      priority: task.priority,
      stageKey: task.stageKey,
      parentKey: task.parentKey,
      start: dayOf(task.startOffset),
      due: dayOf(task.dueOffset),
      estimate: task.estimate,
      assigneeRole: task.assigneeRole,
    })),
  }
}

export function parseTemplatePayload(value: unknown): ProjectTemplatePayload | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = JSON.parse(value) as ProjectTemplatePayload
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.stages) || !Array.isArray(parsed.tasks)) return null
    return parsed
  } catch {
    return null
  }
}

export function serializeTemplatePayload(payload: ProjectTemplatePayload) {
  return JSON.stringify(payload)
}

export function clientReadableTaskFields(fieldIds: readonly string[], hidden: ReadonlySet<string>) {
  return fieldIds.filter(id => !hidden.has(id))
}

export function isInternalComment(value: unknown) {
  return value === true || value === 'true' || value === 1
}

export function filterClientComments<T extends { internal?: unknown }>(comments: readonly T[]) {
  return comments.filter(item => !isInternalComment(item.internal))
}

export function shareToken() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function matchesRoleFilter(input: {
  filter: '' | 'author' | 'observer' | 'assignee'
  email: string
  assigneeEmail: string
  authorEmail: string
  observerEmails: readonly string[]
}) {
  const email = input.email.trim().toLowerCase()
  if (!input.filter) return true
  if (input.filter === 'assignee') return input.assigneeEmail === email
  if (input.filter === 'author') return input.authorEmail === email
  return input.observerEmails.includes(email)
}

export function ganttArrowPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const mid = from.x + Math.max(12, (to.x - from.x) / 2)
  return `M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${to.x} ${to.y}`
}

export { addDays, addMonths, DAY_CAPACITY, WEEK_CAPACITY, DONE_STATUS, calendarDay, dateInstant, todayKey }
