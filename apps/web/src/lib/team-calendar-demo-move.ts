import { dateInstant } from '@tableapp/schema'
import { authorizeAppV2Write, type AppV2, type AppV2Actor, type AppV2Json, type AppV2Node, type AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2DataRecord } from './builder-v2-data-types'
import { oneRelation, slotError, type BookingData } from './booking'
import { bookingRules } from './booking-rules'
import { calendarMoveIssue } from './team-calendar-core'
import { teamCalendarMinutes, teamCalendarSnapshot } from './team-calendar-model'

type CalendarNode = Extract<AppV2Node, { type: 'team_calendar' }>
export type DemoCalendarMoveResult = { ok: true; unchanged?: boolean; rows: AppV2Record[] } | { ok: false; error: string }

const bookingRows = (booking: NonNullable<AppV2['booking']>, rows: readonly AppV2Record[], timeZone: string): BookingData => {
  const of = (tableId: string) => rows.filter(row => row.tableId === tableId).map(row => ({ id: row.id, data: { ...row.values } }))
  return {
    services: of(booking.tables.services),
    masters: of(booking.tables.masters),
    schedule: of(booking.tables.schedule),
    visits: of(booking.tables.visits),
    ...(booking.clients ? { clients: of(booking.clients.tableId) } : {}),
    timeZone,
  }
}

/**
 * Moves one teaching-preview visit in memory.
 * The checks match a published move: grid overlap and working hours, then the salon slot rules.
 * Nothing is written to a draft or a published application.
 */
export function applyDemoCalendarMove(input: {
  app: AppV2
  actor: AppV2Actor
  node: CalendarNode
  rows: readonly AppV2Record[]
  format: (row: AppV2Record) => BuilderV2DataRecord
  eventId: string
  resourceId: string
  day: string
  time: string
  timeZone: string
  screenId: string
}): DemoCalendarMoveResult {
  const data = input.node.data
  if (!data) return { ok: false, error: 'Выберите таблицы и поля календаря в конструкторе.' }
  if (input.node.actions.allowMove === false) return { ok: false, error: 'Перенос записей выключен в настройках календаря.' }
  if (!input.actor.authenticated || !input.actor.roleIds.some(id => input.node.actions.manageRoleIds.includes(id))) {
    return { ok: false, error: 'Переносить записи может только выбранная роль.' }
  }
  const snapshot = teamCalendarSnapshot(data, {
    events: input.rows.filter(row => row.tableId === data.tableId).map(input.format),
    resources: input.rows.filter(row => row.tableId === data.resources.tableId).map(input.format),
    hours: data.hours ? input.rows.filter(row => row.tableId === data.hours!.tableId).map(input.format) : null,
  }, { screenId: input.screenId, nodeId: input.node.id, day: input.day, week: false }, input.timeZone)
  const event = snapshot.events.find(item => item.id === input.eventId && item.day === input.day)
  if (!event) return { ok: false, error: 'Запись не найдена в расписании этого дня.' }
  if (!snapshot.resources.some(item => item.id === input.resourceId)) return { ok: false, error: 'Этот сотрудник недоступен в календаре.' }
  const start = teamCalendarMinutes(input.time)
  if (start === null) return { ok: false, error: 'Выберите корректное время.' }
  if (event.resourceId === input.resourceId && event.start === start) return { ok: true, unchanged: true, rows: [...input.rows] }
  const shift = snapshot.shifts.find(item => item.resourceId === input.resourceId && item.day === input.day)
  const windows = data.hours ? (shift?.windows ?? []) : null
  if (data.hours && shift?.windows === null) return { ok: false, error: 'Не удалось проверить рабочие часы. Запись осталась на прежнем месте.' }
  const issue = calendarMoveIssue({
    event,
    resourceId: input.resourceId,
    day: input.day,
    start,
    step: input.app.booking ? bookingRules(input.app.booking).stepMinutes : 15,
    windows,
    others: snapshot.events,
    buffer: input.app.booking ? bookingRules(input.app.booking).bufferMinutes : 0,
  })
  if (issue) return { ok: false, error: issue }
  const instant = dateInstant(`${input.day}T${input.time}`, input.timeZone)
  if (instant === null) return { ok: false, error: 'Выберите корректное время.' }
  const row = input.rows.find(item => item.id === input.eventId && item.tableId === data.tableId)
  if (!row) return { ok: false, error: 'Запись не найдена.' }
  const patch: Record<string, AppV2Json> = {
    [data.resourceFieldId]: [input.resourceId],
    [data.startFieldId]: new Date(instant).toISOString(),
  }
  if (data.endFieldId) {
    const previousStart = dateInstant(row.values[data.startFieldId], input.timeZone)
    const previousEnd = dateInstant(row.values[data.endFieldId], input.timeZone)
    if (previousStart === null || previousEnd === null) return { ok: false, error: 'Не удалось определить длительность записи.' }
    patch[data.endFieldId] = new Date(instant + (previousEnd - previousStart)).toISOString()
  }
  const decision = authorizeAppV2Write(input.app, input.actor, { operation: 'update', row, values: patch })
  if (!decision.ok) return { ok: false, error: decision.error }
  const booking = input.app.booking
  if (booking && row.tableId === booking.tables.visits) {
    const merged = { ...row.values, ...patch }
    const serviceId = oneRelation(merged[booking.visit.service])
    const masterId = oneRelation(merged[booking.visit.master])
    if (!serviceId || !masterId) return { ok: false, error: 'Укажите услугу и мастера.' }
    const error = slotError(booking, bookingRows(booking, input.rows, input.timeZone), {
      serviceId,
      masterId,
      start: merged[booking.visit.start],
      minutes: Number(merged[booking.visit.minutes]),
      excludeId: row.id,
    })
    if (error) return { ok: false, error }
    const master = input.rows.find(item => item.id === masterId)
    patch[booking.visit.masterEmail] = String(master?.values[booking.master.email] ?? '').trim().toLowerCase()
  }
  return { ok: true, rows: input.rows.map(item => item.id === row.id ? { ...item, values: { ...item.values, ...patch } } : item) }
}
