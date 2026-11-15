import { describe, expect, it } from 'vitest'
import { buildTemplate } from './templates/build'
import { salon } from './templates/defs/salon'
import { buildBookingV2App } from './templates/booking-v2'
import { bookingScheduleInputSchema, bookingSchedulePlan, type BookingScheduleInput } from './builder-v2-booking-schedule'

const built = buildTemplate({ template: salon, workspaceId: 'wsp_schedule' })
const config = buildBookingV2App(built, { id: 'app_schedule', workspaceId: 'wsp_schedule', name: 'Schedule', slug: 'schedule', email: 'owner@example.com' }).booking!
const input: BookingScheduleInput = { masterId: 'row_master', mode: 'weekly', weekdays: [1, 2, 3, 4, 5], date: '', start: '09:00', end: '18:00', closed: false, breakStart: '', breakEnd: '' }

describe('one working-hours form for several weekdays', () => {
  it('creates Monday through Friday with one pair of hours and automatic names', () => {
    const result = bookingSchedulePlan(config, input, 'Оля')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(5)
    expect(result.rows.map(row => row[config.schedule.weekday])).toEqual(config.weekdays.slice(1, 6))
    expect(result.rows.every(row => row[config.schedule.start] === '09:00' && row[config.schedule.end] === '18:00' && row[config.schedule.date] === null)).toBe(true)
    expect(result.rows[0]![config.schedule.name]).toContain('Оля · Пн')
  })
  it('deduplicates weekday selections and splits each day around a break', () => {
    const result = bookingSchedulePlan(config, { ...input, weekdays: [1, 1, 2], breakStart: '13:00', breakEnd: '14:00' }, 'Оля')
    expect(result.ok && result.rows).toHaveLength(4)
    if (!result.ok) return
    expect(result.rows.map(row => [row[config.schedule.start], row[config.schedule.end]])).toEqual([['09:00', '13:00'], ['14:00', '18:00'], ['09:00', '13:00'], ['14:00', '18:00']])
  })
  it('supports a dated day off, and rejects empty days and invalid times before saving anything', () => {
    expect(bookingSchedulePlan(config, { ...input, mode: 'date', date: '2026-11-20', closed: true, start: '', end: '' }, 'Оля')).toMatchObject({ ok: true, rows: [{ [config.schedule.closed]: true, [config.schedule.date]: '2026-11-20', [config.schedule.weekday]: null }] })
    expect(bookingSchedulePlan(config, { ...input, weekdays: [] }, 'Оля')).toMatchObject({ ok: false })
    expect(bookingSchedulePlan(config, { ...input, end: '08:00' }, 'Оля')).toMatchObject({ ok: false })
    expect(bookingSchedulePlan(config, { ...input, breakStart: '13:00', breakEnd: '19:00' }, 'Оля')).toMatchObject({ ok: false })
    expect(bookingScheduleInputSchema.safeParse({ ...input, tableId: 'foreign' }).success).toBe(false)
  })
})
