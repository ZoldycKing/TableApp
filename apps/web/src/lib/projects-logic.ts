import { calendarDay, instantToWallClock } from '@tableapp/schema'

export const PROJECTS_TIME_ZONE = 'Europe/Moscow'
export const DONE_STATUS = 'Готово'

export const TASK_STATUSES = ['К работе', 'В работе', 'На проверке', 'Готово'] as const
export const PRIORITIES = ['Низкий', 'Средний', 'Высокий', 'Срочный'] as const
export const BUCKETS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'overdue', label: 'Просрочено' },
  { id: 'week', label: 'На неделе' },
  { id: 'later', label: 'Позже' },
] as const

export type TaskBucket = (typeof BUCKETS)[number]['id']
export type DueFilter = '' | TaskBucket
export type EventKind = 'created' | 'status' | 'comment'

export type TaskFacts = {
  id: string
  status: string
  priority: string
  due: unknown
  assigneeId: string
  assigneeEmail: string
  projectId: string
  sort: number
}

export function civilDay(value: unknown, timeZone = PROJECTS_TIME_ZONE) {
  return calendarDay(value, timeZone)
}

export function todayKey(now: number, timeZone = PROJECTS_TIME_ZONE) {
  return instantToWallClock(new Date(now), timeZone)?.date ?? ''
}

/** Sunday of the Moscow week that contains `today` (`YYYY-MM-DD`). */
export function weekEndKey(today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return today
  const date = new Date(`${today}T12:00:00Z`)
  const mondayIndex = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() + (6 - mondayIndex))
  return date.toISOString().slice(0, 10)
}

export function isDone(status: string) {
  return status === DONE_STATUS
}

export function isOverdue(task: Pick<TaskFacts, 'status' | 'due'>, now: number, timeZone = PROJECTS_TIME_ZONE) {
  if (isDone(task.status)) return false
  const day = civilDay(task.due, timeZone)
  const today = todayKey(now, timeZone)
  return Boolean(day && today && day < today)
}

/** Open tasks only. Finished work leaves the employee list. */
export function taskBucket(task: Pick<TaskFacts, 'status' | 'due'>, now: number, timeZone = PROJECTS_TIME_ZONE): TaskBucket | null {
  if (isDone(task.status)) return null
  const day = civilDay(task.due, timeZone)
  const today = todayKey(now, timeZone)
  if (!day || !today) return 'later'
  if (day < today) return 'overdue'
  if (day === today) return 'today'
  if (day <= weekEndKey(today)) return 'week'
  return 'later'
}

export function matchesDue(task: Pick<TaskFacts, 'status' | 'due'>, filter: DueFilter, now: number, timeZone = PROJECTS_TIME_ZONE) {
  if (!filter) return true
  if (filter === 'overdue') return isOverdue(task, now, timeZone)
  const bucket = taskBucket(task, now, timeZone)
  if (bucket) return bucket === filter
  const day = civilDay(task.due, timeZone)
  const today = todayKey(now, timeZone)
  if (!day || !today) return filter === 'later'
  if (filter === 'today') return day === today
  if (filter === 'week') return day > today && day <= weekEndKey(today)
  return day > weekEndKey(today)
}

/** Share of tasks in «Готово», as a whole percent. */
export function progressPercent(statuses: readonly string[]) {
  if (!statuses.length) return 0
  return Math.round((statuses.filter(isDone).length / statuses.length) * 100)
}

export function formatDay(value: unknown, timeZone = PROJECTS_TIME_ZONE) {
  const day = civilDay(value, timeZone)
  if (!day) return ''
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${year}`
}

export function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value)
}

export function reorderColumn(ids: readonly string[], movedId: string, beforeId: string | null) {
  const rest = ids.filter(id => id !== movedId)
  if (!beforeId) return [...rest, movedId]
  const index = rest.indexOf(beforeId)
  if (index < 0) return [...rest, movedId]
  return [...rest.slice(0, index), movedId, ...rest.slice(index)]
}

export function sortsFor(ids: readonly string[]) {
  return ids.map((id, index) => ({ id, sort: (index + 1) * 10 }))
}

export function eventText(kind: EventKind, title: string, from = '', to = '') {
  if (kind === 'created') return `Создана задача «${title}»`
  if (kind === 'comment') return `Комментарий к задаче «${title}»`
  return `Статус задачи «${title}»: ${from} → ${to}`
}

export function priorityRank(priority: string) {
  const order = ['Срочный', 'Высокий', 'Средний', 'Низкий']
  const index = order.indexOf(priority)
  return index < 0 ? order.length : index
}
