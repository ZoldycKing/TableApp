import { dateInstant, type BookingConfig } from '@tableapp/schema'

export const BOOKING_SLOT_STEPS = [5, 10, 15, 20, 30, 60] as const
export type BookingSlotStep = (typeof BOOKING_SLOT_STEPS)[number]

const stepAllowed = (value: number): value is BookingSlotStep => (BOOKING_SLOT_STEPS as readonly number[]).includes(value)

export type BookingRules = {
  stepMinutes: BookingSlotStep
  leadMinutes: number
  horizonDays: number
  bufferMinutes: number
  cancelDeadlineHours: number
}

/**
 * One reading of the salon rules for slots, the server write and the teaching preview.
 * A salon saved before these fields existed keeps its previous step and lead time.
 */
export function bookingRules(config: Pick<BookingConfig, 'stepMinutes' | 'leadMinutes' | 'horizonDays'> & Partial<Pick<BookingConfig, 'slotStepMinutes' | 'minLeadMinutes' | 'bufferMinutes' | 'cancelDeadlineHours'>>): BookingRules {
  const legacyStep = config.stepMinutes ?? 15
  const namedStep = config.slotStepMinutes
  const step = namedStep === undefined || (namedStep === 15 && legacyStep !== 15 && stepAllowed(legacyStep)) ? legacyStep : namedStep
  const lead = config.minLeadMinutes ?? config.leadMinutes ?? 60
  return {
    stepMinutes: stepAllowed(step) ? step : 15,
    leadMinutes: Number.isFinite(lead) ? Math.min(10_080, Math.max(0, Math.trunc(lead))) : 60,
    horizonDays: config.horizonDays ?? 60,
    bufferMinutes: config.bufferMinutes ?? 0,
    cancelDeadlineHours: config.cancelDeadlineHours ?? 0,
  }
}

/** Half-open occupancy of one visit, including the quiet time after it. */
export function bookingOccupancy(start: number, minutes: number, bufferMinutes: number) {
  return { start, end: start + minutes * 60_000 + Math.max(0, bufferMinutes) * 60_000 }
}

export function bookingRangesOverlap(left: { start: number; end: number }, right: { start: number; end: number }) {
  return left.start < right.end && left.end > right.start
}

/** True when a client is already inside the cancel window. Exactly N hours before the start is still allowed. */
export function bookingClientChangeClosed(config: Parameters<typeof bookingRules>[0], start: unknown, now: number, timeZone: string) {
  const hours = bookingRules(config).cancelDeadlineHours
  if (hours <= 0) return false
  const instant = dateInstant(start, timeZone)
  if (instant === null || instant <= now) return false
  return now > instant - hours * 3_600_000
}

export function bookingClientChangeMessage(hours: number, phone?: string | null) {
  const text = `Отменить или перенести можно не позднее чем за ${hours} ч — позвоните нам`
  const number = phone?.trim()
  return number ? `${text}: ${number}` : text
}

export function bookingClientChangeError(config: Parameters<typeof bookingRules>[0], start: unknown, now: number, timeZone: string, phone?: string | null) {
  return bookingClientChangeClosed(config, start, now, timeZone) ? bookingClientChangeMessage(bookingRules(config).cancelDeadlineHours, phone) : null
}
