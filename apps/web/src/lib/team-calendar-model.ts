import { calendarDay, dateInstant, instantToWallClock } from '@tableapp/schema'
import type { AppV2TeamCalendarData } from '@tableapp/schema/app-v2'
import type { BuilderV2DataRecord } from './builder-v2-data-types'
import { calendarDays, type TeamCalendarSnapshot } from './team-calendar-core'

export type TeamCalendarRecords = {
  events: BuilderV2DataRecord[]
  resources: BuilderV2DataRecord[]
  /** Null means working hours are not configured or the actor cannot read them. */
  hours: BuilderV2DataRecord[] | null
}
export type TeamCalendarRequest = {
  screenId: string
  nodeId: string
  day: string
  week: boolean
  recordId?: string
}
export type TeamCalendarResult = { ok: true; data: TeamCalendarSnapshot } | { ok: false; error: string }

export const TEAM_CALENDAR_ROW_LIMIT = 20_000
const MAX_SPAN_MS = 7 * 86_400_000

export const teamCalendarMinutes = (value: unknown) => {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
}

const relations = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))] : []

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))

/** A stored weekday matches only a configured non-empty value. Blank does not mean Sunday. */
export function teamCalendarWeekdayMatch(stored: unknown, expected: string | undefined): boolean {
  if (!expected || stored === null || stored === undefined || stored === '') return false
  return String(stored) === expected
}

/** Input has already passed row and field permissions and source view filters. */
export function teamCalendarSnapshot(
  config: AppV2TeamCalendarData,
  records: TeamCalendarRecords,
  query: TeamCalendarRequest,
  timeZone: string,
): TeamCalendarSnapshot {
  const days = calendarDays(query.day, query.week)
  const skipped = new Set<string>()
  const resources = records.resources.flatMap(row => {
    const name = row.display[config.resources.titleFieldId] || row.values[config.resources.titleFieldId]
    if (!name) return []
    const photo = config.resources.photoFieldId ? row.values[config.resources.photoFieldId] : undefined
    return [{ id: row.id, name: String(name), ...(photo ? { photo } : {}) }]
  })
  const ids = new Set(resources.map(item => item.id))
  const hours = config.hours
  const shifts = resources.flatMap(resource => days.map(day => {
    const own = hours
      ? records.hours?.filter(row => relations(row.values[hours.resourceFieldId]).includes(resource.id)) ?? []
      : []
    const exceptions = hours?.dateFieldId
      ? own.filter(row => calendarDay(row.values[hours.dateFieldId!]) === day)
      : []
    const weekday = hours?.weekdayFieldId ? hours.weekdays[new Date(`${day}T12:00:00Z`).getUTCDay()] : undefined
    const selected = exceptions.length
      ? exceptions
      : hours?.weekdayFieldId
        ? own.filter(row => {
          if (hours.dateFieldId && calendarDay(row.values[hours.dateFieldId])) return false
          return teamCalendarWeekdayMatch(row.values[hours.weekdayFieldId!], weekday)
        })
        : []
    const closed = Boolean(hours?.closedFieldId && selected.some(row => row.values[hours.closedFieldId!] === true))
    const windows = hours && records.hours !== null
      ? closed
        ? []
        : selected.flatMap(row => {
          const start = teamCalendarMinutes(row.values[hours.startFieldId])
          const end = teamCalendarMinutes(row.values[hours.endFieldId])
          if (start === null || end === null || end <= start) {
            if (row.values[hours.startFieldId] != null || row.values[hours.endFieldId] != null) skipped.add(row.id)
            return []
          }
          return [{ id: row.id, start, end }]
        }).sort((a, b) => a.start - b.start)
      : null
    return {
      resourceId: resource.id,
      day,
      windows,
      closed,
      exception: exceptions.length > 0,
    }
  }))
  const events = records.events.flatMap(row => {
    const linked = relations(row.values[config.resourceFieldId])
    const resourceIds = linked.filter(id => ids.has(id))
    const startInstant = dateInstant(row.values[config.startFieldId], timeZone)
    if (!linked.length || startInstant === null) {
      skipped.add(row.id)
      return []
    }
    if (!resourceIds.length) return []
    const duration = config.durationFieldId ? row.values[config.durationFieldId] : null
    const endInstant = config.endFieldId
      ? dateInstant(row.values[config.endFieldId], timeZone)
      : typeof duration === 'number' && Number.isFinite(duration)
        ? startInstant + duration * 60_000
        : null
    if (endInstant === null || endInstant <= startInstant || endInstant - startInstant > MAX_SPAN_MS) {
      skipped.add(row.id)
      return []
    }
    const startWall = instantToWallClock(new Date(startInstant), timeZone)
    const endWall = instantToWallClock(new Date(endInstant), timeZone)
    if (!startWall || !endWall) {
      skipped.add(row.id)
      return []
    }
    const first = days[0]!
    const last = days.at(-1)!
    if (endWall.date < first || startWall.date > last) return []
    const status = config.statusFieldId
      ? Object.entries(config.statusValues).find(([, id]) => id === row.values[config.statusFieldId!])?.[0] ?? ''
      : ''
    const amount = config.amountFieldId ? row.values[config.amountFieldId] : null
    const title = text(row.display[config.titleFieldId] || row.values[config.titleFieldId] || 'Запись')
    const subtitle = config.subtitleFieldId
      ? text(row.display[config.subtitleFieldId] || row.values[config.subtitleFieldId] || '')
      : ''
    const placed = days.flatMap(day => {
      if (day < startWall.date || day > endWall.date || (day === endWall.date && endWall.time === '00:00')) return []
      const start = day === startWall.date ? teamCalendarMinutes(startWall.time) : 0
      const end = day === endWall.date ? teamCalendarMinutes(endWall.time) : 1440
      if (start === null || end === null || end <= start) return []
      return resourceIds.map(resourceId => ({
        id: row.id,
        resourceId,
        day,
        start,
        end,
        title,
        subtitle,
        status,
        statusLabel: config.statusFieldId ? row.display[config.statusFieldId] || undefined : undefined,
        amount: typeof amount === 'number' && Number.isFinite(amount) ? amount : null,
      }))
    })
    if (!placed.length) skipped.add(row.id)
    return placed
  }).sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start || a.id.localeCompare(b.id))
  return { timeZone, days, resources, shifts, events, omitted: skipped.size }
}
