import { describe, expect, it } from 'vitest'
import type { FieldType } from '@tableapp/schema'
import { appV2Schema, canOpenAppV2Screen, projectAppV2Row, validateAppV2, type AppV2Actor, type AppV2Catalog } from '@tableapp/schema/app-v2'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { buildBookingV2App } from './booking-v2'
import { bookingV2Availability, validBookingAvailabilityRequest } from '../builder-v2-booking-availability'
import { builderV2BookingWriteError } from '../builder-v2-booking-policy'
import { instantToWallClock } from '@tableapp/schema'

export function bookingFixture() {
  const built = buildTemplate({ template: findTemplate('salon')!, workspaceId: 'wsp_booking' })
  const app = buildBookingV2App(built, { id: 'app_booking', workspaceId: 'wsp_booking', name: 'Тихая студия', slug: 'studio', email: 'owner@example.com' })
  const catalog: AppV2Catalog = { workspaceId: app.workspaceId, tables: new Map(built.tables.map(table => [table.id, { workspaceId: app.workspaceId }])), fields: new Map(built.fields.map(field => [field.id, { tableId: field.tableId, type: field.type as FieldType, ...(field.type === 'relation' ? { relationTableId: String(field.options.tableId) } : {}) }])), views: new Map(built.views.map(view => [view.id, { tableId: view.tableId }])) }
  return { app, built, catalog }
}
describe('native online booking starter', () => {
  it('builds a valid editable v2 application without legacy navigation duplicates', () => {
    const { app, catalog } = bookingFixture()
    expect(appV2Schema.safeParse(app).success).toBe(true)
    expect(validateAppV2(app, catalog, { mode: 'publish' })).toEqual([])
    expect(app.screens.filter(screen => screen.navigation).map(screen => screen.name)).toEqual(['Услуги', 'Мастера', 'Расписание', 'Мои записи', 'Клиенты'])
    expect(app.screens.find(screen => screen.id === app.booking!.setupScreenId)?.navigation).toBe(false)
    expect(app.authentication.members[0]!.roleIds).toEqual(['owner'])
  })
  it('isolates private visits, internal notes and master email addresses', () => {
    const { app, built } = bookingFixture(), booking = app.booking!
    const actor = (roles: string[], email: string | null): AppV2Actor => ({ authenticated: Boolean(email), id: email ? 'user' : null, email, roleIds: roles, company: '' })
    const client = actor(['client'], 'irina@example.com'), guest = actor([], null), staff = actor(['staff'], 'olga@example.com')
    const raw = built.rows.find(row => row.tableId === booking.tables.visits && row.data[booking.visit.email] === client.email)!
    const record = { id: raw.id, tableId: raw.tableId, values: raw.data as Record<string, string> }
    expect(projectAppV2Row(app, guest, record)).toEqual({})
    expect(projectAppV2Row(app, actor(['client'], 'other@example.com'), record)).toEqual({})
    expect(projectAppV2Row(app, client, record)).toHaveProperty(booking.visit.client)
    expect(projectAppV2Row(app, client, record)).not.toHaveProperty(booking.visit.note)
    expect(projectAppV2Row(app, staff, record)).toHaveProperty(booking.visit.note)
    expect(canOpenAppV2Screen(app, client, booking.listScreenId!)).toBe(false)
    const clientRow = built.rows.find(row => row.tableId === booking.clients!.tableId)!
    for (const viewer of [guest, client, staff]) {
      expect(projectAppV2Row(app, viewer, { id: clientRow.id, tableId: clientRow.tableId, values: clientRow.data as Record<string, string> })).toEqual({})
      expect(canOpenAppV2Screen(app, viewer, booking.customersScreenId!)).toBe(false)
      expect(canOpenAppV2Screen(app, viewer, booking.customerScreenId!)).toBe(false)
      expect(builderV2BookingWriteError(app, viewer, booking.clients!.tableId, clientRow.data)).toContain('только администратор')
    }
    const master = built.rows.find(row => row.tableId === booking.tables.masters)!
    expect(projectAppV2Row(app, guest, { id: master.id, tableId: master.tableId, values: master.data as Record<string, string> })).not.toHaveProperty(booking.master.email)
  })
  it('returns free slots without leaking customer or master contact details', () => {
    const { app, built } = bookingFixture(), booking = app.booking!
    const of = (id: string) => built.rows.filter(row => row.tableId === id)
    const result = bookingV2Availability(app, { authenticated: false, id: null, email: null, roleIds: [], company: '' }, {
      services: of(booking.tables.services), masters: of(booking.tables.masters), schedule: of(booking.tables.schedule), visits: of(booking.tables.visits), timeZone: 'Europe/Moscow',
    }, { screenId: booking.formScreenId, recordId: of(booking.tables.services)[0]!.id, day: instantToWallClock(new Date(Date.now() + 86400000), 'Europe/Moscow')!.date })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.slots.length).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toContain('@example.com')
    expect(Object.keys(result.masters[0]!)).toEqual(['id', 'name'])
  })
  it('rejects malformed dates and forbids a client from changing past or finished visits', () => {
    expect(validBookingAvailabilityRequest({ screenId: 'scr_ok', recordId: 'row_ok', day: '2026-02-30' })).toBe(false)
    const { app } = bookingFixture(), booking = app.booking!
    const client: AppV2Actor = { authenticated: true, id: 'client', email: 'irina@example.com', roleIds: ['client'], company: '' }
    const before = { [booking.visit.start]: new Date(Date.now() - 60000).toISOString(), [booking.visit.status]: booking.statuses.booked }
    expect(builderV2BookingWriteError(app, client, booking.tables.visits, { [booking.visit.status]: booking.statuses.cancelled }, before)).toContain('предстоящую')
    const future = { ...before, [booking.visit.start]: new Date(Date.now() + 86400000).toISOString() }
    expect(builderV2BookingWriteError(app, client, booking.tables.visits, { [booking.visit.status]: booking.statuses.completed }, future)).toContain('только отменить')
    expect(builderV2BookingWriteError(app, client, booking.tables.visits, { [booking.visit.status]: booking.statuses.cancelled, [booking.visit.start]: future[booking.visit.start] }, future)).toContain('не должна менять')
  })
  it('validates working periods and accepts an explicit day off without working hours', () => {
    const { app } = bookingFixture(), booking = app.booking!, schedule = booking.schedule
    const owner: AppV2Actor = { authenticated: true, id: 'owner', email: 'owner@example.com', roleIds: ['owner'], company: '' }
    const values = { [schedule.master]: ['row_master'], [schedule.weekday]: booking.weekdays[1], [schedule.start]: '13:00', [schedule.end]: '09:00' }
    expect(builderV2BookingWriteError(app, owner, booking.tables.schedule, values)).toContain('рабочие часы')
    expect(builderV2BookingWriteError(app, owner, booking.tables.schedule, { ...values, [schedule.end]: '18:00' })).toBeNull()
    expect(builderV2BookingWriteError(app, owner, booking.tables.schedule, { [schedule.master]: ['row_master'], [schedule.date]: '2026-11-30', [schedule.closed]: true })).toBeNull()
  })
})
