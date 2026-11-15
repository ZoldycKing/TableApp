import { calendarDay } from '@tableapp/schema'
import { canOpenAppV2Screen, projectAppV2Row, readableAppV2Fields, type AppV2, type AppV2Actor, type AppV2Json } from '@tableapp/schema/app-v2'
import { bookingTeamCalendarNode } from './booking-team-calendar'
import type { BuilderV2DataRecord } from './builder-v2-data-types'
import { teamCalendarSnapshot, type TeamCalendarResult } from './team-calendar-model'
import { calendarDays, calendarClock, calendarEventLanes, calendarShift, type TeamCalendarEvent, type TeamCalendarSnapshot, type TeamCalendarWindow } from './team-calendar-core'
import type { BookingData, BookingRow } from './booking'

export type BookingCalendarWindow = TeamCalendarWindow
export type BookingCalendarVisit = TeamCalendarEvent
export type BookingCalendarSnapshot = TeamCalendarSnapshot
export const bookingCalendarDays = calendarDays
export const bookingClock = calendarClock
export const bookingCalendarShift = calendarShift
export const bookingVisitLanes = calendarEventLanes

export type BookingCalendarRequest = { screenId: string; day: string; week: boolean }
export type BookingCalendarResult = TeamCalendarResult

export function canOpenBookingCalendar(app: AppV2, actor: AppV2Actor, screenId: string) {
  return Boolean(
    app.booking
    && actor.authenticated
    && actor.roleIds.some(role => role === 'owner' || role === 'staff')
    && [app.booking.listScreenId, app.booking.setupScreenId].includes(screenId)
    && canOpenAppV2Screen(app, actor, screenId),
  )
}

export function validBookingCalendarRequest(input: BookingCalendarRequest) {
  return Boolean(
    input
    && typeof input === 'object'
    && typeof input.screenId === 'string'
    && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(input.screenId)
    && typeof input.day === 'string'
    && calendarDay(input.day) === input.day
    && typeof input.week === 'boolean',
  )
}

const record = (tableId: string, row: BookingRow, values: Record<string, AppV2Json>, display: Record<string, string> = {}): BuilderV2DataRecord =>
  ({ id: row.id, tableId, values, display })

/** In-memory salon rows go through the same snapshot as every other calendar. */
export function bookingCalendarSnapshot(app: AppV2, actor: AppV2Actor, data: BookingData, request: BookingCalendarRequest): BookingCalendarResult {
  const config = app.booking
  if (!config || !validBookingCalendarRequest(request) || !canOpenBookingCalendar(app, actor, request.screenId)) {
    return { ok: false, error: 'Календарь недоступен.' }
  }
  const node = bookingTeamCalendarNode(config, 'booking-calendar')
  const calendar = node.data!
  const project = (tableId: string, row: BookingRow) => projectAppV2Row(app, actor, { id: row.id, tableId, values: row.data as Record<string, AppV2Json> })
  const resources = data.masters.flatMap(row => {
    const values = project(config.tables.masters, row)
    const name = values[config.master.name]
    if (!name) return []
    if (!actor.roleIds.includes('owner') && String(row.data[config.master.email] ?? '').trim().toLowerCase() !== actor.email?.trim().toLowerCase()) return []
    const display = { [config.master.name]: String(name) }
    return [record(config.tables.masters, row, values, display)]
  })
  const allowed = new Set(resources.map(item => item.id))
  const services = new Map(data.services.map(row => [row.id, String(project(config.tables.services, row)[config.service.name] ?? '')]))
  const events = data.visits.flatMap(row => {
    const values = project(config.tables.visits, row)
    const linkedService = values[config.visit.service]
    const serviceId = Array.isArray(linkedService) && typeof linkedService[0] === 'string' ? linkedService[0] : undefined
    const display: Record<string, string> = {}
    if (typeof serviceId === 'string' && services.get(serviceId)) display[config.visit.service] = services.get(serviceId)!
    if (values[config.visit.client]) display[config.visit.client] = String(values[config.visit.client])
    return [record(config.tables.visits, row, values, display)]
  }).filter(row => {
    const links = row.values[config.visit.master]
    return Array.isArray(links) && links.some(id => typeof id === 'string' && allowed.has(id))
  })
  const scheduleRows = data.schedule.map(row => record(config.tables.schedule, row, project(config.tables.schedule, row)))
  const needed = [config.schedule.master, config.schedule.start, config.schedule.end]
  const known = readableAppV2Fields(app, actor, { id: '', tableId: config.tables.schedule, values: {} })
  const hours = needed.every(id => known.has(id)) || scheduleRows.some(row => needed.every(id => Object.hasOwn(row.values, id)))
    ? scheduleRows
    : null
  return {
    ok: true,
    data: teamCalendarSnapshot(calendar, { resources, events, hours }, { ...request, nodeId: node.id }, data.timeZone),
  }
}
