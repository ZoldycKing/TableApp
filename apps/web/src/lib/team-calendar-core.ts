import type { AppV2Json } from '@tableapp/schema/app-v2'

export type TeamCalendarWindow = { id: string; start: number; end: number }
export type TeamCalendarEvent = {
  id: string
  resourceId: string
  day: string
  start: number
  end: number
  title: string
  subtitle: string
  status: string
  statusLabel?: string
  amount: number | null
}
export type TeamCalendarShift = {
  resourceId: string
  day: string
  windows: TeamCalendarWindow[] | null
  exception: boolean
  closed: boolean
}
export type TeamCalendarSnapshot = {
  timeZone: string
  days: string[]
  resources: { id: string; name: string; photo?: AppV2Json }[]
  shifts: TeamCalendarShift[]
  events: TeamCalendarEvent[]
  /** Rows skipped because time, duration or the employee link could not be read. */
  omitted: number
}

export function shiftIsoDay(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

export function calendarDays(day: string, week: boolean): string[] {
  if (!week) return [day]
  const start = new Date(`${day}T12:00:00Z`)
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, index) => shiftIsoDay(start.toISOString().slice(0, 10), index))
}

export const calendarClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** One visible shift with breaks, even when storage uses several or overlapping periods. */
export function calendarShift(periods: readonly TeamCalendarWindow[]) {
  const merged: { start: number; end: number }[] = []
  for (const period of [...periods].sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1)
    if (previous && period.start <= previous.end) previous.end = Math.max(previous.end, period.end)
    else merged.push({ start: period.start, end: period.end })
  }
  if (!merged.length) return null
  return {
    start: merged[0]!.start,
    end: merged.at(-1)!.end,
    breaks: merged.slice(1).map((period, index) => ({ start: merged[index]!.end, end: period.start })),
  }
}

/** Overlapping appointments get separate lanes rather than covering one another. */
export function calendarEventLanes(events: readonly TeamCalendarEvent[]) {
  const result: { event: TeamCalendarEvent; lane: number; lanes: number }[] = []
  let group: typeof result = []
  let ends: number[] = []
  let groupEnd = -1
  const flush = () => {
    for (const item of group) item.lanes = ends.length
    result.push(...group)
    group = []
    ends = []
    groupEnd = -1
  }
  for (const event of [...events].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (group.length && event.start >= groupEnd) flush()
    let lane = ends.findIndex(end => end <= event.start)
    if (lane < 0) lane = ends.length
    ends[lane] = event.end
    groupEnd = Math.max(groupEnd, event.end)
    group.push({ event, lane, lanes: 1 })
  }
  flush()
  return result
}

/** Visible day window: working hours and appointments, plus an hour of context, snapped to the hour. */
export function calendarGridBounds(
  windows: readonly { start: number; end: number }[],
  events: readonly { start: number; end: number }[],
) {
  const pad = 60
  const starts = [8 * 60, ...windows.map(window => window.start - pad), ...events.map(event => event.start - pad)]
  const ends = [20 * 60, ...windows.map(window => window.end + pad), ...events.map(event => event.end + pad)]
  const start = Math.max(0, Math.floor(Math.min(...starts) / 60) * 60)
  const end = Math.min(24 * 60, Math.ceil(Math.max(...ends) / 60) * 60)
  const span = Math.max(60, end - start)
  return { start, end, span }
}

const DAY_MINUTES = 24 * 60

/** Money for the visits on screen: the chosen day or week, without cancellations and no-shows. */
export function calendarPeriodAmount(events: readonly { id: string; day: string; status: string; amount: number | null }[], days: readonly string[]): number {
  const allowed = new Set(days)
  const seen = new Set<string>()
  let sum = 0
  for (const event of events) {
    if (seen.has(event.id) || !allowed.has(event.day) || event.status === 'cancelled' || event.status === 'noShow') continue
    seen.add(event.id)
    sum += event.amount ?? 0
  }
  return sum
}

/** Why a drag cannot be saved. Null means the new place is allowed, including dropping it back where it was. */
export function calendarMoveIssue(input: {
  event: { id: string; start: number; end: number; status: string }
  resourceId: string
  day: string
  start: number
  step: number
  windows: readonly { start: number; end: number }[] | null
  others: readonly { id: string; resourceId: string; day: string; start: number; end: number; status: string }[]
  /** Quiet minutes after each appointment. The painted block stays the real duration. */
  buffer?: number
}): string | null {
  if (input.event.status === 'cancelled') return 'Отменённую запись нельзя переносить.'
  const duration = input.event.end - input.event.start
  if (duration <= 0) return 'Не удалось определить длительность записи.'
  const step = input.step > 0 ? input.step : 15
  if (input.start % step !== 0) return 'Выберите время по шагу сетки.'
  const end = input.start + duration
  if (input.start < 0 || end > DAY_MINUTES) return 'Запись должна закончиться в тот же день.'
  if (input.windows && !input.windows.some(window => input.start >= window.start && end <= window.end)) {
    return 'Это время вне рабочих часов. Запись осталась на прежнем месте.'
  }
  const buffer = Math.max(0, input.buffer ?? 0)
  const occupied = input.others.some(other =>
    other.id !== input.event.id
    && other.resourceId === input.resourceId
    && other.day === input.day
    && other.status !== 'cancelled'
    && input.start < other.end + buffer
    && end + buffer > other.start)
  if (occupied) return 'Это время уже занято. Запись осталась на прежнем месте.'
  return null
}

/** Top and height as fractions of the visible window. A longer appointment is a taller block. */
export function calendarBlockFrame(bounds: { start: number; end: number }, from: number, to: number) {
  const span = Math.max(60, bounds.end - bounds.start)
  const clipped = Math.min(Math.max(to, from), bounds.end)
  return {
    top: (from - bounds.start) / span,
    height: Math.max(0, clipped - from) / span,
  }
}
