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
