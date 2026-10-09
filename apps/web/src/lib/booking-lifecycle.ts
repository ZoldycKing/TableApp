import { dateInstant, type BookingConfig } from '@tableapp/schema'
import type { BookingRow } from './booking'

export type BookingSection = 'upcoming' | 'history'

/** A date moves a visit into history without inventing an outcome. */
export function bookingVisitSection(config: BookingConfig, row: BookingRow, timeZone: string, now: number): BookingSection {
  const status = row.data[config.visit.status]
  if ([config.statuses.cancelled, config.statuses.noShow, config.statuses.completed].filter(Boolean).includes(status as string)) return 'history'
  const start = dateInstant(row.data[config.visit.start], timeZone)
  const minutes = row.data[config.visit.minutes]
  const duration = typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0
  return start !== null && start + duration > now ? 'upcoming' : 'history'
}

export function canCompleteBooking(config: BookingConfig, row: BookingRow, timeZone: string, now: number): boolean {
  if (!config.statuses.completed || ![config.statuses.booked, config.statuses.arrived].includes(String(row.data[config.visit.status]))) return false
  const start = dateInstant(row.data[config.visit.start], timeZone)
  return start !== null && start <= now
}
