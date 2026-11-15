import { calendarDay, dateInstant, instantToWallClock } from '@tableapp/schema'
import type { AppV2TeamCalendarData } from '@tableapp/schema/app-v2'
import type { BuilderV2DataRecord } from './builder-v2-data-types'
import { calendarDays as bookingCalendarDays, type TeamCalendarSnapshot as BookingCalendarSnapshot } from './team-calendar-core'

export type TeamCalendarRecords = { events: BuilderV2DataRecord[]; resources: BuilderV2DataRecord[]; hours: BuilderV2DataRecord[] | null }
export type TeamCalendarRequest = { screenId: string; nodeId: string; day: string; week: boolean; recordId?: string }
export type TeamCalendarResult = { ok: true; data: BookingCalendarSnapshot } | { ok: false; error: string }
export const teamCalendarMinutes = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0,2))*60+Number(value.slice(3)) : null
const relations = (value: unknown):string[] => Array.isArray(value) ? [...new Set(value.filter((id):id is string=>typeof id==='string'))] : []

/** Input has already passed row/field permissions and source view filters. */
export function teamCalendarSnapshot(config: AppV2TeamCalendarData, records: TeamCalendarRecords, query: TeamCalendarRequest, timeZone: string): BookingCalendarSnapshot {
  const days = bookingCalendarDays(query.day, query.week)
  const masters = records.resources.flatMap(row => {
    const name = row.display[config.resources.titleFieldId] || row.values[config.resources.titleFieldId]
    if (!name) return []
    const photo = config.resources.photoFieldId ? row.values[config.resources.photoFieldId] : undefined
    return [{ id: row.id, name: String(name), ...(photo ? { photo } : {}) }]
  })
  const ids = new Set(masters.map(item => item.id)), hours = config.hours
  const shifts = masters.flatMap(master => days.map(day => {
    const own = hours ? records.hours?.filter(row => relations(row.values[hours.resourceFieldId]).includes(master.id)) ?? [] : []
    const exceptions = hours?.dateFieldId ? own.filter(row => calendarDay(row.values[hours.dateFieldId!]) === day) : []
    const selected = exceptions.length ? exceptions : hours?.weekdayFieldId ? own.filter(row => (!hours.dateFieldId || !row.values[hours.dateFieldId]) && String(row.values[hours.weekdayFieldId!] ?? '') === hours.weekdays[new Date(day+'T12:00:00Z').getUTCDay()]) : []
    const closed = Boolean(hours?.closedFieldId && selected.some(row => row.values[hours.closedFieldId!] === true))
    const windows = hours && records.hours !== null ? closed ? [] : selected.flatMap(row => {
      const start = teamCalendarMinutes(row.values[hours.startFieldId]), end = teamCalendarMinutes(row.values[hours.endFieldId])
      return start !== null && end !== null && end > start ? [{ id: row.id, start, end }] : []
    }).sort((a,b)=>a.start-b.start) : null
    return { masterId: master.id, day, windows, closed, exception: Boolean(exceptions.length) }
  }))
  const visits = records.events.flatMap(row => {
    const masterIds = relations(row.values[config.resourceFieldId]).filter(id=>ids.has(id)), startInstant = dateInstant(row.values[config.startFieldId], timeZone)
    if (!masterIds.length || startInstant === null) return []
    const duration = config.durationFieldId ? row.values[config.durationFieldId] : null
    const endInstant = config.endFieldId ? dateInstant(row.values[config.endFieldId],timeZone) : typeof duration === 'number' && Number.isFinite(duration) ? startInstant+duration*60000 : null
    if (endInstant === null || endInstant <= startInstant || endInstant-startInstant > 7*86400000) return []
    const startWall = instantToWallClock(new Date(startInstant),timeZone)!, endWall = instantToWallClock(new Date(endInstant),timeZone)!
    const status = config.statusFieldId ? Object.entries(config.statusValues).find(([,id])=>id === row.values[config.statusFieldId!])?.[0] ?? '' : ''
    const amount = config.amountFieldId ? row.values[config.amountFieldId] : null
    return days.flatMap(day => {
      if (day < startWall.date || day > endWall.date || day === endWall.date && endWall.time === '00:00') return []
      return masterIds.map(masterId=>({ id: row.id, masterId, day, start: day === startWall.date ? teamCalendarMinutes(startWall.time)! : 0, end: day === endWall.date ? teamCalendarMinutes(endWall.time)! : 1440,
        service: String(row.display[config.titleFieldId] || row.values[config.titleFieldId] || 'Запись'), client: config.subtitleFieldId ? String(row.display[config.subtitleFieldId] || row.values[config.subtitleFieldId] || '') : '', status, statusLabel: config.statusFieldId ? row.display[config.statusFieldId] || undefined : undefined,
        price: typeof amount === 'number' && Number.isFinite(amount) ? amount : null }))
    })
  }).sort((a,b)=>a.day.localeCompare(b.day)||a.start-b.start||a.id.localeCompare(b.id))
  return { timeZone, days, masters, shifts, visits }
}
