import { calendarDay, dateInstant, instantToWallClock, type BookingConfig } from '@tableapp/schema'

export type BookingRow = { id: string; data: Record<string, unknown> }
export type BookingData = { services: BookingRow[]; masters: BookingRow[]; schedule: BookingRow[]; visits: BookingRow[]; clients?: BookingRow[]; timeZone: string }
export type BookingSlot = { start: string; time: string; masterId: string; masterName: string }
export function oneRelation(value: unknown): string | null {
  return Array.isArray(value) && value.length === 1 && typeof value[0] === 'string' ? value[0] : null
}
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0
export function bookingService(config: BookingConfig, data: BookingData, id: string) {
  return data.services.find(row => row.id === id && row.data[config.service.active] === true &&
    positive(row.data[config.service.minutes]) && Number(row.data[config.service.minutes]) <= 1440 &&
    typeof row.data[config.service.price] === 'number' && Number(row.data[config.service.price]) >= 0)
}
export function eligibleMasters(config: BookingConfig, data: BookingData, serviceId: string) {
  return data.masters.filter(row => row.data[config.master.active] === true &&
    (Array.isArray(row.data[config.master.services]) && (row.data[config.master.services] as unknown[]).includes(serviceId)))
}
function timeMinutes(value: unknown): number | null {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  const [hour, minute] = value.split(':').map(Number)
  return hour! * 60 + minute!
}
/** An exception replaces the whole weekday. Several windows model a lunch break. */
export function workingWindows(config: BookingConfig, data: BookingData, masterId: string, day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  const own = data.schedule.filter(row => oneRelation(row.data[config.schedule.master]) === masterId)
  const exceptions = own.filter(row => calendarDay(row.data[config.schedule.date], data.timeZone) === day)
  const applicable = exceptions.length ? exceptions : own.filter(row => !row.data[config.schedule.date] && row.data[config.schedule.weekday] === config.weekdays[weekday])
  if (applicable.some(row => row.data[config.schedule.closed] === true)) return []
  return applicable.flatMap(row => {
    const start = timeMinutes(row.data[config.schedule.start]), end = timeMinutes(row.data[config.schedule.end])
    return start !== null && end !== null && end > start ? [{ start, end }] : []
  })
}
function blocks(config: BookingConfig, row: BookingRow) {
  // Completed visits still occupy their original time; cancellation releases it.
  return row.data[config.visit.status] !== config.statuses.cancelled
}
export function slotError(config: BookingConfig, data: BookingData, input: {
  serviceId: string; masterId: string; start: unknown; minutes?: number; excludeId?: string; now?: Date
}): string | null {
  const service = bookingService(config, data, input.serviceId)
  if (!service) return 'Услуга сейчас недоступна для записи.'
  if (!eligibleMasters(config, data, input.serviceId).some(row => row.id === input.masterId)) return 'Выбранный мастер не оказывает эту услугу.'
  const start = dateInstant(input.start, data.timeZone), now = (input.now ?? new Date()).getTime()
  const minutes = input.minutes ?? Number(service.data[config.service.minutes])
  if (start === null || !positive(minutes) || minutes > 1440) return 'Выберите корректное время и длительность.'
  if (start < now + config.leadMinutes * 60_000 || start > now + config.horizonDays * 86400_000) return 'Выберите время в доступном периоде записи.'
  const wall = instantToWallClock(new Date(start), data.timeZone)!
  const clock = timeMinutes(wall.time)!
  const end = start + minutes * 60_000
  const endWall = instantToWallClock(new Date(end), data.timeZone)!
  const endClock = timeMinutes(endWall.time)! + (end % 60_000) / 60_000
  if (start % 60_000 !== 0 || clock % config.stepMinutes !== 0) return 'Выберите время из свободных интервалов.'
  if (!workingWindows(config, data, input.masterId, wall.date).some(window => clock >= window.start && endClock <= window.end && endClock > clock)) return 'Услуга не помещается в рабочее время мастера.'
  if (endWall.date !== wall.date) return 'Запись должна закончиться в тот же день.'
  for (const row of data.visits) {
    if (row.id === input.excludeId || oneRelation(row.data[config.visit.master]) !== input.masterId || !blocks(config, row)) continue
    const occupied = dateInstant(row.data[config.visit.start], data.timeZone), duration = row.data[config.visit.minutes]
    // Incomplete legacy records fail closed for their whole day.
    if (occupied === null || !positive(duration)) {
      if (occupied === null || instantToWallClock(new Date(occupied), data.timeZone)?.date === wall.date) return 'В расписании мастера есть незавершённая запись. Свяжитесь с салоном.'
    } else if (start < occupied + Number(duration) * 60_000 && end > occupied) return 'Это время уже занято. Выберите другой свободный интервал.'
  }
  return null
}
/** Only availability leaves the server, never names or contacts of other customers. */
export function freeBookingSlots(config: BookingConfig, data: BookingData, input: {
  serviceId: string; day: string; masterId?: string; minutes?: number; excludeId?: string; now?: Date
}): BookingSlot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || calendarDay(input.day) !== input.day || !bookingService(config, data, input.serviceId)) return []
  const slots: BookingSlot[] = []
  for (const master of eligibleMasters(config, data, input.serviceId)) {
    if (input.masterId && input.masterId !== master.id) continue
    for (let clock = 0; clock < 1440; clock += config.stepMinutes) {
      const time = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`
      const start = dateInstant(`${input.day}T${time}`, data.timeZone)
      if (start === null || instantToWallClock(new Date(start), data.timeZone)?.time !== time) continue
      if (!slotError(config, data, { ...input, masterId: master.id, start: new Date(start).toISOString() })) {
        slots.push({ start: new Date(start).toISOString(), time, masterId: master.id, masterName: String(master.data[config.master.name] ?? 'Мастер') })
      }
    }
  }
  return slots.sort((a, b) => a.start.localeCompare(b.start) || a.masterName.localeCompare(b.masterName))
}
