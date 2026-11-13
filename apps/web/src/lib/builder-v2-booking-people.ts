import { dateInstant, instantToWallClock } from '@tableapp/schema'
import { canOpenAppV2Screen, projectAppV2Row, type AppV2, type AppV2Actor, type AppV2Json } from '@tableapp/schema/app-v2'
import { oneRelation, type BookingData, type BookingRow } from './booking'
import { bookingCalendarSnapshot, type BookingCalendarSnapshot } from './builder-v2-booking-calendar'

export type BookingPersonVisit = { id: string; clientId: string; masterId: string; service: string; start: string; minutes: number; status: string; price: number | null; note: string }
export type BookingClient = { id: string; name: string; phone: string; email: string }
export type BookingTeamSnapshot = {
  timeZone: string; day: string; masters: { id: string; name: string; description: string; photo?: AppV2Json; services: string[] }[]
  clients: BookingClient[]; visits: BookingPersonVisit[]; shifts: BookingCalendarSnapshot['shifts']
}
export type BookingTeamResult = { ok: true; data: BookingTeamSnapshot } | { ok: false; error: string }
export function canOpenBookingPeople(app: AppV2, actor: AppV2Actor, screenId: string) {
  const b = app.booking
  return Boolean(b && actor.authenticated && actor.roleIds.includes('owner') && [b.mastersScreenId, b.masterScreenId, b.visitScreenId].includes(screenId) && canOpenAppV2Screen(app, actor, screenId))
}
/** Derived from readable visits. Never merge people by their name or expose this directory to a customer/master. */
export function bookingTeamSnapshot(app: AppV2, actor: AppV2Actor, data: BookingData, screenId: string, now = new Date()): BookingTeamResult {
  const b = app.booking
  if (!b || !canOpenBookingPeople(app, actor, screenId)) return { ok: false, error: 'Клиенты и рабочие данные команды недоступны.' }
  const project = (tableId: string, row: BookingRow) => projectAppV2Row(app, actor, { id: row.id, tableId, values: row.data as Record<string, AppV2Json> })
  const text = (value: unknown) => typeof value === 'string' ? value : ''
  const serviceNames = new Map(data.services.map(row => [row.id, text(project(b.tables.services, row)[b.service.name])]))
  const masters = data.masters.flatMap(row => {
    const v = project(b.tables.masters, row), name = text(v[b.master.name])
    if (!name) return []
    const photo = b.masterPhotoFieldId ? v[b.masterPhotoFieldId] : undefined
    return [{ id: row.id, name, description: b.masterDescriptionFieldId ? text(v[b.masterDescriptionFieldId]) : '', ...(photo ? { photo } : {}), services: (Array.isArray(v[b.master.services]) ? v[b.master.services] as string[] : []).map(id => serviceNames.get(id) ?? '').filter(Boolean) }]
  })
  const clients: BookingClient[] = [], identities = new Map<string, string>(), visits: BookingPersonVisit[] = []
  for (const row of [...data.visits].sort((a, c) => a.id.localeCompare(c.id))) {
    const v = project(b.tables.visits, row), name = text(v[b.visit.client]), start = dateInstant(v[b.visit.start], data.timeZone)
    if (!name || start === null) continue
    const email = text(v[b.visit.email]).trim().toLowerCase(), phone = text(v[b.visit.phone]), digits = phone.replace(/\D/g, '')
    const identity = email ? `email:${email}` : digits.length >= 7 ? `phone:${digits}` : `visit:${row.id}`
    let clientId = identities.get(identity)
    if (!clientId) { clientId = row.id; identities.set(identity, clientId); clients.push({ id: clientId, name, phone, email }) }
    const price = v[b.visit.price], duration = v[b.visit.minutes]
    visits.push({ id: row.id, clientId, masterId: oneRelation(v[b.visit.master]) ?? '', service: serviceNames.get(oneRelation(v[b.visit.service]) ?? '') || 'Визит', start: new Date(start).toISOString(), minutes: typeof duration === 'number' ? duration : 0, status: Object.entries(b.statuses).find(([, id]) => id === v[b.visit.status])?.[0] ?? '', price: typeof price === 'number' && Number.isFinite(price) ? price : null, note: text(v[b.visit.note]) })
  }
  visits.sort((a, c) => a.start.localeCompare(c.start) || a.id.localeCompare(c.id))
  const day = instantToWallClock(now, data.timeZone)!.date
  const calendar = bookingCalendarSnapshot(app, actor, data, { screenId: b.listScreenId!, day, week: false })
  return { ok: true, data: { timeZone: data.timeZone, day, masters, clients, visits, shifts: calendar.ok ? calendar.data.shifts : [] } }
}
