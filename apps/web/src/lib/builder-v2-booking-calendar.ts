import { calendarDays as bookingCalendarDays, type TeamCalendarSnapshot as BookingCalendarSnapshot } from './team-calendar-core'
export { type TeamCalendarWindow as BookingCalendarWindow, type TeamCalendarEvent as BookingCalendarVisit, type TeamCalendarSnapshot as BookingCalendarSnapshot, calendarDays as bookingCalendarDays, calendarClock as bookingClock, calendarShift as bookingCalendarShift, calendarEventLanes as bookingVisitLanes } from './team-calendar-core'
import { calendarDay, dateInstant, instantToWallClock } from '@tableapp/schema'
import { canOpenAppV2Screen, projectAppV2Row, readableAppV2Fields, type AppV2, type AppV2Actor, type AppV2Json } from '@tableapp/schema/app-v2'
import { oneRelation, type BookingData, type BookingRow } from './booking'

export type BookingCalendarRequest = { screenId: string; day: string; week: boolean }
export type BookingCalendarResult = { ok: true; data: BookingCalendarSnapshot } | { ok: false; error: string }
export function canOpenBookingCalendar(app: AppV2, actor: AppV2Actor, screenId: string) {
  return Boolean(app.booking && actor.authenticated && actor.roleIds.some(role => ['owner', 'staff'].includes(role)) && [app.booking.listScreenId, app.booking.setupScreenId].includes(screenId) && canOpenAppV2Screen(app, actor, screenId))
}

export function validBookingCalendarRequest(input: BookingCalendarRequest) {
  return Boolean(input && typeof input === 'object' && typeof input.screenId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(input.screenId) && typeof input.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.day) && calendarDay(input.day) === input.day && typeof input.week === 'boolean')
}
function minutes(value: unknown) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  const [hour, minute] = value.split(':').map(Number)
  return hour! * 60 + minute!
}

/** Project on the server before producing a calendar. No contacts, notes or raw rows leave it. */
export function bookingCalendarSnapshot(app: AppV2, actor: AppV2Actor, data: BookingData, request: BookingCalendarRequest): BookingCalendarResult {
  const config = app.booking
  if (!config || !validBookingCalendarRequest(request) || !canOpenBookingCalendar(app, actor, request.screenId)) return { ok: false, error: 'Календарь недоступен.' }
  const project = (tableId: string, row: BookingRow) => projectAppV2Row(app, actor, { id: row.id, tableId, values: row.data as Record<string, AppV2Json> })
  const days = bookingCalendarDays(request.day, request.week)
  const masters = data.masters.flatMap(row => {
    const values = project(config.tables.masters, row)
    if (!values[config.master.name]) return []
    if (!actor.roleIds.includes('owner') && String(row.data[config.master.email] ?? '').trim().toLowerCase() !== actor.email?.trim().toLowerCase()) return []
    const photo = config.masterPhotoFieldId ? values[config.masterPhotoFieldId] : undefined
    return [{ id: row.id, name: String(values[config.master.name]), ...(photo ? { photo } : {}) }]
  })
  const masterIds = new Set(masters.map(master => master.id))
  const periods = data.schedule.map(row => ({ id: row.id, data: project(config.tables.schedule, row) }))
  const scheduleFields = readableAppV2Fields(app, actor, { id: '', tableId: config.tables.schedule, values: {} })
  const shifts = masters.flatMap(master => days.map(day => {
    const own = periods.filter(row => oneRelation(row.data[config.schedule.master]) === master.id)
    const exceptions = own.filter(row => calendarDay(row.data[config.schedule.date], data.timeZone) === day)
    const selected = exceptions.length ? exceptions : own.filter(row => !row.data[config.schedule.date] && row.data[config.schedule.weekday] === config.weekdays[new Date(`${day}T12:00:00Z`).getUTCDay()])
    const closed = selected.some(row => row.data[config.schedule.closed] === true)
    const required = [config.schedule.master, config.schedule.weekday, config.schedule.date, config.schedule.closed, config.schedule.start, config.schedule.end]
    const known = required.every(id => scheduleFields.has(id)) || own.some(row => required.every(id => Object.hasOwn(row.data, id)))
    const windows = known ? closed ? [] : selected.flatMap(row => {
      const start = minutes(row.data[config.schedule.start]), end = minutes(row.data[config.schedule.end])
      return start !== null && end !== null && end > start ? [{ id: row.id, start, end }] : []
    }).sort((a, b) => a.start - b.start) : null
    return { masterId: master.id, day, windows, closed, exception: exceptions.length > 0 }
  }))
  const services = new Map(data.services.map(row => [row.id, project(config.tables.services, row)[config.service.name]]))
  const visits = data.visits.flatMap(row => {
    const values = project(config.tables.visits, row)
    const masterId = oneRelation(values[config.visit.master]), startInstant = dateInstant(values[config.visit.start], data.timeZone)
    const duration = values[config.visit.minutes]
    if (!masterId || !masterIds.has(masterId) || startInstant === null || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 1440) return []
    const wall = instantToWallClock(new Date(startInstant), data.timeZone)!
    if (!days.includes(wall.date)) return []
    const start = minutes(wall.time)!
    const price = values[config.visit.price]
    return [{ id: row.id, masterId, day: wall.date, start, end: start + duration,
      service: String(services.get(oneRelation(values[config.visit.service]) ?? '') ?? 'Запись'), client: String(values[config.visit.client] ?? ''),
      status: Object.entries(config.statuses).find(([, id]) => id === values[config.visit.status])?.[0] ?? '',
      price: typeof price === 'number' && Number.isFinite(price) ? price : null }]
  }).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  return { ok: true, data: { timeZone: data.timeZone, days, masters, shifts, visits } }
}
