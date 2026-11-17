import { rows } from '@tableapp/db'
import { dateInstant } from '@tableapp/schema'
import { authorizeAppV2Write, type AppV2, type AppV2Actor, type AppV2Json, type AppV2Node } from '@tableapp/schema/app-v2'
import { and, eq, isNull } from 'drizzle-orm'
import { bookingRules } from './booking-rules'
import { calendarMoveIssue } from './team-calendar-core'
import { readTeamCalendar } from './team-calendar-read'
import { RowWriteError, updateRow, type RowTransaction } from './row-mutations'

type CalendarNode = Extract<AppV2Node, { type: 'team_calendar' }>
export type TeamCalendarMoveInput = { screenId: string; eventId: string; resourceId: string; day: string; time: string }
export type TeamCalendarMoveResult = { ok: true; unchanged?: boolean }

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour! * 60 + minute!
}

/** Saves a drag only after the same overlap and working-hours rules the grid uses, then the normal row write. */
export async function moveTeamCalendarEvent(
  context: RowTransaction,
  app: AppV2,
  actor: AppV2Actor,
  node: CalendarNode,
  input: TeamCalendarMoveInput,
  published: boolean,
): Promise<TeamCalendarMoveResult> {
  const data = node.data
  if (!data) throw new RowWriteError('invalid', 'Выберите таблицы и поля календаря в конструкторе.')
  if (node.actions.allowMove === false) throw new RowWriteError('denied', 'Перенос записей выключен в настройках календаря.')
  if (!actor.authenticated || !actor.roleIds.some(id => node.actions.manageRoleIds.includes(id))) throw new RowWriteError('denied', 'Переносить записи может только выбранная роль.')
  const snapshot = await readTeamCalendar(context.tx, app, actor, node, { screenId: input.screenId, nodeId: node.id, day: input.day, week: false }, published)
  const event = snapshot.events.find(item => item.id === input.eventId && item.day === input.day)
  if (!event) throw new RowWriteError('missing', 'Запись не найдена в расписании этого дня.')
  if (!snapshot.resources.some(item => item.id === input.resourceId)) throw new RowWriteError('denied', 'Этот сотрудник недоступен в календаре.')
  const start = minutes(input.time)
  if (event.resourceId === input.resourceId && event.start === start) return { ok: true, unchanged: true }
  const shift = snapshot.shifts.find(item => item.resourceId === input.resourceId && item.day === input.day)
  const windows = data.hours ? (shift?.windows ?? []) : null
  if (data.hours && shift?.windows === null) throw new RowWriteError('invalid', 'Не удалось проверить рабочие часы. Запись осталась на прежнем месте.')
  const issue = calendarMoveIssue({
    event,
    resourceId: input.resourceId,
    day: input.day,
    start,
    step: app.booking ? bookingRules(app.booking).stepMinutes : 15,
    windows,
    others: snapshot.events,
    buffer: app.booking ? bookingRules(app.booking).bufferMinutes : 0,
  })
  if (issue) throw new RowWriteError('invalid', issue)
  const instant = dateInstant(`${input.day}T${input.time}`, snapshot.timeZone)
  if (instant === null) throw new RowWriteError('invalid', 'Выберите корректное время.')
  const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, input.eventId), eq(rows.tableId, data.tableId), isNull(rows.deletedAt))).limit(1)
  if (!stored) throw new RowWriteError('missing', 'Запись не найдена.')
  const values: Record<string, AppV2Json> = {
    [data.resourceFieldId]: [input.resourceId],
    [data.startFieldId]: new Date(instant).toISOString(),
  }
  const dispatch = app.dispatch
  if (dispatch && data.resourceFieldId === dispatch.job.technician) {
    const [technician] = await context.tx.select().from(rows).where(and(eq(rows.id, input.resourceId), eq(rows.tableId, dispatch.mastersTableId), isNull(rows.deletedAt))).limit(1)
    if (!technician) throw new RowWriteError('missing', 'Мастер не найден.')
    const technicianValues = technician.data as Record<string, unknown>
    if (technicianValues[dispatch.master.active] !== dispatch.activeChoiceId) throw new RowWriteError('denied', 'Этот мастер неактивен и не назначается на выезды.')
    const email = String(technicianValues[dispatch.master.email] ?? '').trim().toLowerCase()
    if (!email) throw new RowWriteError('invalid', 'У мастера не указана почта для доступа к заявке.')
    values[dispatch.job.master] = String(technicianValues[dispatch.master.name] ?? '')
    values[dispatch.job.masterEmail] = email
    values[dispatch.job.date] = values[data.startFieldId]!
  }
  if (data.endFieldId) {
    const previousStart = dateInstant((stored.data as Record<string, unknown>)[data.startFieldId], snapshot.timeZone)
    const previousEnd = dateInstant((stored.data as Record<string, unknown>)[data.endFieldId], snapshot.timeZone)
    if (previousStart === null || previousEnd === null) throw new RowWriteError('invalid', 'Не удалось определить длительность записи.')
    values[data.endFieldId] = new Date(instant + (previousEnd - previousStart)).toISOString()
  }
  const decision = authorizeAppV2Write(app, actor, { operation: 'update', row: { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> }, values })
  if (!decision.ok) throw new RowWriteError('denied', decision.error)
  await updateRow(context, data.tableId, input.eventId, values, { id: actor.id, kind: published ? 'app_user' : 'member' })
  return { ok: true }
}
