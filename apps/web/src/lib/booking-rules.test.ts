import { bookingConfigSchema, type BookingConfig } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { templateExample } from './templates/presentation'
import { freeBookingSlots, slotError, type BookingData } from './booking'
import { bookingClientChangeError, bookingClientChangeMessage, bookingRules } from './booking-rules'
import { calendarMoveIssue } from './team-calendar-core'

const now = new Date('2026-10-09T05:00:00Z')
const example = templateExample('salon', now)
const config = example.app.booking!
const data: BookingData = {
  services: example.rows.filter(row => row.tableId === config.tables.services),
  masters: example.rows.filter(row => row.tableId === config.tables.masters),
  schedule: example.rows.filter(row => row.tableId === config.tables.schedule),
  visits: [],
  timeZone: 'Europe/Moscow',
}
const serviceId = data.services[0]!.id
const masterId = data.masters[0]!.id
const day = '2026-10-12'

describe('salon booking rules', () => {
  it('keeps the previous slots when an older config has none of the new fields', () => {
    const { slotStepMinutes: _step, minLeadMinutes: _lead, bufferMinutes: _buffer, cancelDeadlineHours: _deadline, ...legacy } = structuredClone(config)
    void _step; void _lead; void _buffer; void _deadline
    const parsed = bookingConfigSchema.parse(legacy)
    const old = legacy as BookingConfig
    const input = { serviceId, day, masterId, now }
    expect(freeBookingSlots(parsed, data, input).map(slot => slot.time)).toEqual(freeBookingSlots(old, data, input).map(slot => slot.time))
    expect(freeBookingSlots(old, data, input).some(slot => slot.time === '09:00')).toBe(true)
    expect(freeBookingSlots(old, data, input).some(slot => slot.time === '09:10')).toBe(false)
    expect(bookingRules(old)).toMatchObject({ stepMinutes: 15, leadMinutes: 60, horizonDays: 60, bufferMinutes: 0, cancelDeadlineHours: 0 })
  })

  it('offers slots on the chosen step and refuses times outside the lead and horizon', () => {
    const stepped = { ...config, slotStepMinutes: 30 as const, stepMinutes: 30, minLeadMinutes: 120, leadMinutes: 120, horizonDays: 7 }
    const slots = freeBookingSlots(stepped, data, { serviceId, day, masterId, now })
    expect(slots.every(slot => ['00', '30'].includes(slot.time.slice(3)))).toBe(true)
    expect(slots.some(slot => slot.time === '09:00')).toBe(true)
    expect(slots.some(slot => slot.time === '09:15')).toBe(false)
    expect(slotError(stepped, data, { serviceId, masterId, start: '2026-10-09T06:30:00Z', now })).toContain('периоде')
    expect(freeBookingSlots({ ...stepped, horizonDays: 2 }, data, { serviceId, day, masterId, now })).toEqual([])
    expect(freeBookingSlots({ ...config, horizonDays: 7 }, data, { serviceId, day, masterId, now }).length).toBeGreaterThan(0)
  })

  it('keeps the next slot free only after the buffer of the neighbouring visit', () => {
    const buffered = { ...config, bufferMinutes: 30 }
    const visits = [{ id: 'near', data: { [config.visit.master]: [masterId], [config.visit.start]: `${day}T07:00:00Z`, [config.visit.minutes]: 60, [config.visit.status]: config.statuses.booked } }]
    const occupied = { ...data, visits }
    expect(slotError(buffered, occupied, { serviceId, masterId, start: `${day}T08:00:00Z`, minutes: 60, now })).toContain('занято')
    expect(slotError(buffered, occupied, { serviceId, masterId, start: `${day}T08:30:00Z`, minutes: 60, now })).toBeNull()
    expect(slotError(config, occupied, { serviceId, masterId, start: `${day}T08:00:00Z`, minutes: 60, now })).toBeNull()
    expect(calendarMoveIssue({
      event: { id: 'moving', start: 14 * 60, end: 15 * 60, status: 'booked' },
      resourceId: masterId, day, start: 11 * 60, step: 30, windows: [{ start: 9 * 60, end: 19 * 60 }],
      others: [{ id: 'near', resourceId: masterId, day, start: 10 * 60, end: 11 * 60, status: 'booked' }],
      buffer: 30,
    })).toContain('занято')
    expect(calendarMoveIssue({
      event: { id: 'moving', start: 14 * 60, end: 15 * 60, status: 'booked' },
      resourceId: masterId, day, start: 11 * 60 + 30, step: 30, windows: [{ start: 9 * 60, end: 19 * 60 }],
      others: [{ id: 'near', resourceId: masterId, day, start: 10 * 60, end: 11 * 60, status: 'booked' }],
      buffer: 30,
    })).toBeNull()
  })

  it('closes client changes inside the deadline and still allows the exact boundary', () => {
    const start = '2026-10-12T07:00:00Z'
    const hours = 24
    const strict = { ...config, cancelDeadlineHours: hours }
    const boundary = Date.parse(start) - hours * 3_600_000
    expect(bookingClientChangeError(strict, start, boundary, 'Europe/Moscow')).toBeNull()
    expect(bookingClientChangeError(strict, start, boundary + 1, 'Europe/Moscow')).toBe(bookingClientChangeMessage(hours))
    expect(bookingClientChangeError(strict, start, boundary + 1, 'Europe/Moscow', ' +7 495 000-00-00 ')).toBe(`${bookingClientChangeMessage(hours)}: +7 495 000-00-00`)
    expect(bookingClientChangeError({ ...config, cancelDeadlineHours: 0 }, start, boundary + 1, 'Europe/Moscow')).toBeNull()
    expect(bookingRules({ ...config, stepMinutes: 30 })).toMatchObject({ stepMinutes: 30 })
  })
})
