import { describe, expect, it } from 'vitest'
import type { AppV2Actor } from '@tableapp/schema/app-v2'
import { buildTemplate } from './templates/build'
import { salon } from './templates/defs/salon'
import { buildBookingV2App } from './templates/booking-v2'
import { bookingCalendarSnapshot, bookingCalendarDays, bookingVisitLanes, validBookingCalendarRequest, type BookingCalendarVisit } from './builder-v2-booking-calendar'
import type { BookingData } from './booking'

function fixture() {
  const built = buildTemplate({ template: salon, workspaceId: 'wsp_calendar' })
  const app = buildBookingV2App(built, { id: 'app_calendar', workspaceId: 'wsp_calendar', name: 'Студия', slug: 'calendar', email: 'owner@example.com' })
  const config = app.booking!
  const owner: AppV2Actor = { authenticated: true, id: 'owner', roleIds: ['owner'], email: 'owner@example.com', company: '' }
  const of = (id: string) => built.rows.filter(row => row.tableId === id).map(row => ({ id: row.id, data: row.data as Record<string, unknown> }))
  const data: BookingData = { timeZone: 'Europe/Moscow', services: of(config.tables.services), masters: of(config.tables.masters), schedule: of(config.tables.schedule), visits: [] }
  return { app, config, data, owner, request: { screenId: config.listScreenId!, day: '2026-11-16', week: false } }
}
describe('team calendar and working-hours projection', () => {
  it('shows each master once with all working windows, rather than a card per period', () => {
    const f = fixture(), result = bookingCalendarSnapshot(f.app, f.owner, f.data, f.request)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.masters).toHaveLength(3)
    expect(result.data.shifts).toHaveLength(3)
    expect(result.data.shifts[0]!.windows?.map(window => [window.start, window.end])).toEqual([[540, 780], [840, 1140]])
  })
  it('replaces recurring hours with date exceptions and respects an explicit day off', () => {
    const f = fixture(), fields = f.config.schedule, id = f.data.masters[0]!.id
    f.data.schedule.push({ id: 'row_exception', data: { [fields.master]: [id], [fields.date]: f.request.day, [fields.start]: '11:00', [fields.end]: '15:00', [fields.closed]: false } })
    const open = bookingCalendarSnapshot(f.app, f.owner, f.data, f.request)
    expect(open.ok && open.data.shifts[0]).toMatchObject({ exception: true, windows: [{ id: 'row_exception', start: 660, end: 900 }] })
    f.data.schedule.push({ id: 'row_closed', data: { [fields.master]: [id], [fields.date]: f.request.day, [fields.closed]: true } })
    const closed = bookingCalendarSnapshot(f.app, f.owner, f.data, f.request)
    expect(closed.ok && closed.data.shifts[0]).toMatchObject({ closed: true, exception: true, windows: [] })
  })
  it('bounds a week across years and rejects malformed date/range requests', () => {
    expect(bookingCalendarDays('2027-01-01', true)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
    expect(validBookingCalendarRequest({ screenId: 'scr_calendar', day: '2026-02-30', week: true })).toBe(false)
    expect(validBookingCalendarRequest({ screenId: 'scr_calendar', day: '2026-11-16', week: 'yes' as never })).toBe(false)
  })
  it('uses the studio timezone and strips private contacts and notes from every response', () => {
    const f = fixture(), visit = f.config.visit
    f.data.visits.push({ id: 'row_visit', data: { [visit.master]: [f.data.masters[0]!.id], [visit.service]: [f.data.services[0]!.id], [visit.start]: '2026-11-15T22:30:00Z', [visit.minutes]: 60, [visit.client]: 'Ирина', [visit.phone]: '+7 private', [visit.email]: 'private@example.com', [visit.note]: 'private note', [visit.price]: 2500, [visit.status]: f.config.statuses.booked } })
    const result = bookingCalendarSnapshot(f.app, f.owner, f.data, f.request)
    expect(result.ok && result.data.visits[0]).toMatchObject({ day: '2026-11-16', start: 90, end: 150, client: 'Ирина', price: 2500 })
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it('denies guests/clients, respects field restrictions and isolates the verified master', () => {
    const f = fixture(), visit = f.config.visit
    for (const role of ['client', '']) expect(bookingCalendarSnapshot(f.app, { ...f.owner, authenticated: Boolean(role), roleIds: [role] }, f.data, f.request).ok).toBe(false)
    const email = String(f.data.masters[0]!.data[f.config.master.email])
    f.data.visits = f.data.masters.map((master, i) => ({ id: `row_${i}`, data: { [visit.master]: [master.id], [visit.masterEmail]: master.data[f.config.master.email], [visit.service]: [f.data.services[0]!.id], [visit.start]: '2026-11-16T09:00:00Z', [visit.minutes]: 60, [visit.client]: `Client ${i}` } }))
    const staff = { ...f.owner, roleIds: ['staff'], email }, result = bookingCalendarSnapshot(f.app, staff, f.data, f.request)
    expect(result.ok && result.data.masters).toEqual([{ id: f.data.masters[0]!.id, name: String(f.data.masters[0]!.data[f.config.master.name]) }])
    expect(result.ok && result.data.visits).toHaveLength(1)
    expect(result.ok && result.data.shifts[0]!.windows).toBeNull()
    expect(bookingCalendarSnapshot(f.app, staff, f.data, { ...f.request, screenId: f.config.setupScreenId }).ok).toBe(false)
    f.app.policy.tables.find(rule => rule.tableId === f.config.tables.schedule)!.grants[0]!.read!.fieldIds = [f.config.schedule.master]
    expect(bookingCalendarSnapshot(f.app, f.owner, f.data, f.request)).toMatchObject({ ok: true, data: { shifts: [{ windows: null }, { windows: null }, { windows: null }] } })
  })
  it('allocates simultaneous visits to lanes and frees lanes for the next appointment', () => {
    const visit = (id: string, start: number, end: number): BookingCalendarVisit => ({ id, start, end, day: '2026-11-16', masterId: 'master', service: '', client: '', status: '', price: null })
    const lanes = bookingVisitLanes([visit('a', 540, 600), visit('b', 570, 630), visit('c', 600, 620), visit('d', 630, 660)])
    expect(lanes.map(item => [item.visit.id, item.lane, item.lanes])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 0, 2], ['d', 0, 1]])
  })
})
