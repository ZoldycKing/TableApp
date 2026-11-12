import { calendarDay, dateInstant } from '@tableapp/schema'
import { canOpenAppV2Screen, projectAppV2Row, type AppV2, type AppV2Actor, type AppV2Json } from '@tableapp/schema/app-v2'
import { bookingService, eligibleMasters, freeBookingSlots, oneRelation, type BookingData, type BookingSlot } from './booking'

export type BookingAvailabilityRequest = { screenId: string; recordId: string; day: string; masterId?: string }
export type BookingAvailabilityResult = { ok: true; slots: BookingSlot[]; masters: { id: string; name: string }[]; timeZone: string; service: { id: string; name: string; price: number; minutes: number } } | { ok: false; error: string }

export function validBookingAvailabilityRequest(input: BookingAvailabilityRequest) {
  return Boolean(input && typeof input === 'object' && typeof input.screenId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(input.screenId) && typeof input.recordId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(input.recordId) && typeof input.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.day) && calendarDay(input.day) === input.day && (input.masterId === undefined || typeof input.masterId === 'string' && input.masterId.length <= 128))
}

/** Only free slots and public master names leave the server; never the visits that block them. */
export function bookingV2Availability(app: AppV2, actor: AppV2Actor, data: BookingData, input: BookingAvailabilityRequest): BookingAvailabilityResult {
  const config = app.booking
  if (!config || !validBookingAvailabilityRequest(input) || !canOpenAppV2Screen(app, actor, input.screenId) || ![config.formScreenId, config.rescheduleScreenId].includes(input.screenId)) return { ok: false, error: 'Запись сейчас недоступна.' }
  const reschedule = input.screenId === config.rescheduleScreenId
  const visit = reschedule ? data.visits.find(row => row.id === input.recordId) : undefined
  if (reschedule && (!visit || !Object.hasOwn(projectAppV2Row(app, actor, { id: visit.id, tableId: config.tables.visits, values: visit.data as Record<string, AppV2Json> }), config.visit.start) || visit.data[config.visit.status] !== config.statuses.booked || (dateInstant(visit.data[config.visit.start], data.timeZone) ?? 0) <= Date.now())) return { ok: false, error: 'Перенести можно только свою предстоящую запись.' }
  const serviceId = reschedule ? oneRelation(visit!.data[config.visit.service]) : input.recordId
  const service = serviceId && bookingService(config, data, serviceId)
  if (!service || !serviceId) return { ok: false, error: 'Услуга сейчас недоступна. Выберите другую услугу.' }
  const minutes = visit ? Number(visit.data[config.visit.minutes]) : Number(service.data[config.service.minutes])
  return { ok: true, timeZone: data.timeZone,
    service: { id: serviceId, name: String(service.data[config.service.name]), minutes, price: Number(visit ? visit.data[config.visit.price] : service.data[config.service.price]) },
    masters: eligibleMasters(config, data, serviceId).map(row => ({ id: row.id, name: String(row.data[config.master.name]) })),
    slots: freeBookingSlots(config, data, { serviceId, day: input.day, masterId: input.masterId || undefined, minutes, excludeId: visit?.id }),
  }
}
