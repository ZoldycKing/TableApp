import type { AppV2Json } from '@tableapp/schema/app-v2'

export type TeamCalendarWindow = { id: string; start: number; end: number }
export type TeamCalendarEvent = { id: string; masterId: string; day: string; start: number; end: number; service: string; client: string; status: string; statusLabel?: string; price: number | null }
export type TeamCalendarSnapshot = {
  timeZone: string; days: string[]; masters: { id: string; name: string; photo?: AppV2Json }[]
  shifts: { masterId: string; day: string; windows: TeamCalendarWindow[] | null; exception: boolean; closed: boolean }[]
  visits: TeamCalendarEvent[]
}
export function calendarDays(day: string, week: boolean): string[] {
  const start = new Date(`${day}T12:00:00Z`)
  if (!week) return [day]
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start); date.setUTCDate(start.getUTCDate() + index); return date.toISOString().slice(0, 10)
  })
}
export const calendarClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
/** One visible shift with breaks, even when storage uses several or overlapping periods. */
export function calendarShift(periods: readonly TeamCalendarWindow[]) {
  const merged: { start: number; end: number }[] = []
  for (const period of [...periods].sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1)
    if (previous && period.start <= previous.end) previous.end = Math.max(previous.end, period.end)
    else merged.push({ start: period.start, end: period.end })
  }
  if (!merged.length) return null
  return { start: merged[0]!.start, end: merged.at(-1)!.end, breaks: merged.slice(1).map((period, index) => ({ start: merged[index]!.end, end: period.start })) }
}
/** Overlapping appointments get separate lanes rather than covering one another. */
export function calendarEventLanes(visits: readonly TeamCalendarEvent[]) {
  const result: { visit: TeamCalendarEvent; lane: number; lanes: number }[] = []
  let group: typeof result = [], ends: number[] = [], groupEnd = -1
  const flush = () => { for (const item of group) item.lanes = ends.length; result.push(...group); group = []; ends = []; groupEnd = -1 }
  for (const visit of [...visits].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (group.length && visit.start >= groupEnd) flush()
    let lane = ends.findIndex(end => end <= visit.start)
    if (lane < 0) lane = ends.length
    ends[lane] = visit.end; groupEnd = Math.max(groupEnd, visit.end)
    group.push({ visit, lane, lanes: 1 })
  }
  flush()
  return result
}
