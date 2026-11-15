import { instantToWallClock } from '@tableapp/schema'

export type SalonSummaryVisit = {
  id?: string
  masterId: string
  start: string
  status: string
  price: number | null
  service?: string
}

/** Visits, lifetime takings and the latest past visit. Cancelled rows stay out of the totals. */
export function clientVisitSummary(visits: readonly SalonSummaryVisit[], now = Date.now()) {
  const counted = visits.filter(visit => visit.status !== 'cancelled')
  const paid = counted.filter(visit => visit.status === 'completed' || visit.status === 'arrived')
  const revenue = paid.reduce((sum, visit) => sum + (visit.price ?? 0), 0)
  const past = counted
    .filter(visit => Date.parse(visit.start) <= now)
    .sort((a, b) => b.start.localeCompare(a.start) || (a.id ?? '').localeCompare(b.id ?? ''))
  const next = counted
    .filter(visit => visit.status === 'booked' && Date.parse(visit.start) > now)
    .sort((a, b) => a.start.localeCompare(b.start) || (a.id ?? '').localeCompare(b.id ?? ''))[0] ?? null
  return {
    visits: counted.length,
    revenue,
    lastVisit: past[0]?.start ?? null,
    next,
  }
}

/** Appointments and earned revenue for one person in the current calendar month. */
export function masterMonthSummary(
  visits: readonly SalonSummaryVisit[],
  masterId: string,
  timeZone: string,
  now = new Date(),
) {
  const month = instantToWallClock(now, timeZone)?.date.slice(0, 7)
  const rows = visits.filter(visit => {
    if (visit.masterId !== masterId || visit.status === 'cancelled' || !month) return false
    return instantToWallClock(visit.start, timeZone)?.date.slice(0, 7) === month
  })
  const revenue = rows
    .filter(visit => visit.status === 'completed' || visit.status === 'arrived')
    .reduce((sum, visit) => sum + (visit.price ?? 0), 0)
  return { appointments: rows.length, revenue }
}
