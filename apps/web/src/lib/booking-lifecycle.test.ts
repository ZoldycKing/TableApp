import { describe, expect, it } from 'vitest'
import { bookingConfigSchema } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import { bookingVisitSection, canCompleteBooking } from './booking-lifecycle'

describe('visit outcomes and customer history', () => {
  const now = Date.parse('2026-10-09T10:00:00Z'), config = templateExample('salon', new Date(now)).app.booking!
  const row = (status: string, start: string, minutes = 60) => ({ id: 'visit', data: {
    [config.visit.status]: status, [config.visit.start]: start, [config.visit.minutes]: minutes,
  } })
  it('keeps future and ongoing visits together, and closed outcomes in history regardless of their date', () => {
    expect(bookingVisitSection(config, row(config.statuses.booked, '2026-10-09T11:00:00Z'), 'Europe/Moscow', now)).toBe('upcoming')
    expect(bookingVisitSection(config, row(config.statuses.arrived, '2026-10-09T09:30:00Z'), 'Europe/Moscow', now)).toBe('upcoming')
    for (const status of [config.statuses.completed!, config.statuses.cancelled, config.statuses.noShow]) {
      expect(bookingVisitSection(config, row(status, '2026-10-09T11:00:00Z'), 'Europe/Moscow', now)).toBe('history')
    }
  })
  it('moves an elapsed visit into history without changing its unconfirmed outcome, using the salon time zone', () => {
    const visit = row(config.statuses.booked, '2026-10-09T12:00', 60)
    const before = structuredClone(visit)
    expect(bookingVisitSection(config, visit, 'Europe/Moscow', now)).toBe('history')
    expect(visit).toEqual(before)
    expect(bookingVisitSection(config, row(config.statuses.booked, 'invalid'), 'Europe/Moscow', now)).toBe('history')
  })
  it('permits manual completion only for an appointment that has begun and still has an active status', () => {
    for (const status of [config.statuses.booked, config.statuses.arrived]) {
      expect(canCompleteBooking(config, row(status, '2026-10-09T09:00:00Z'), 'Europe/Moscow', now)).toBe(true)
      expect(canCompleteBooking(config, row(status, '2026-10-09T11:00:00Z'), 'Europe/Moscow', now)).toBe(false)
    }
    for (const status of [config.statuses.completed!, config.statuses.cancelled, config.statuses.noShow]) {
      expect(canCompleteBooking(config, row(status, '2026-10-09T09:00:00Z'), 'Europe/Moscow', now)).toBe(false)
    }
    expect(canCompleteBooking(config, row(config.statuses.booked, 'invalid'), 'Europe/Moscow', now)).toBe(false)
  })
  it('continues to read older booking definitions without a completed outcome', () => {
    const legacy = structuredClone(config)
    delete legacy.statuses.completed
    expect(bookingConfigSchema.safeParse(legacy).success).toBe(true)
    expect(canCompleteBooking(legacy, row(config.statuses.booked, '2026-10-09T09:00:00Z'), 'Europe/Moscow', now)).toBe(false)
  })
})
