import { rows, views } from '@tableapp/db'
import { compareRows, evalFilter, fieldTimeZone, fieldsOfFilter, indexFields, normalizeView } from '@tableapp/schema'
import { matchesAppV2Audience, readableAppV2Fields, type AppV2, type AppV2Actor, type AppV2Node } from '@tableapp/schema/app-v2'
import { and, asc, eq, gt, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { builderV2CalculationPlan } from './builder-v2-read-plan'
import { deriveBuilderV2Rows, loadBuilderV2ReadMetadata, projectBuilderV2Record } from './builder-v2-row-data'
import { derivePublishedV2Rows, publishedV2Fields } from './builder-v2-published-rows'
import { publishedV2Node, publishedV2ReadSql } from './builder-v2-published-data'
import type { RuntimeSourceRow } from './runtime-project'
import { RowWriteError } from './row-mutations'
import type { BuilderV2DataRecord } from './builder-v2-data-types'
import { TEAM_CALENDAR_ROW_LIMIT, teamCalendarSnapshot, type TeamCalendarRequest } from './team-calendar-model'
import { calendarDays, shiftIsoDay } from './team-calendar-core'

type Source = { tableId: string; viewId: string | null }
type CalendarNode = Extract<AppV2Node, { type: 'team_calendar' }>

const hasKeys = (row: BuilderV2DataRecord, ids: readonly string[]) => ids.every(id => Object.hasOwn(row.values, id))

/** Hours are readable when the actor's grants cover the shift itself, not only a closed or date flag. */
export function teamCalendarHoursReadable(app: AppV2, actor: AppV2Actor, tableId: string, fieldIds: readonly string[], rows: readonly BuilderV2DataRecord[]) {
  const probe = readableAppV2Fields(app, actor, { id: '', tableId, values: {} })
  if (fieldIds.every(id => probe.has(id))) return true
  return rows.some(row => hasKeys(row, fieldIds))
}

function dateWindow(fieldId: string, from: string, to: string): SQL {
  const cell = sql`${rows.data}->>${fieldId}`
  return sql`left(${cell}, 10) >= ${from} and left(${cell}, 10) <= ${to}`
}

function hoursWindow(dateFieldId: string, days: readonly string[]): SQL {
  const cell = sql`btrim(${rows.data}->>${dateFieldId})`
  const listed = days.map(day => sql`${day}`)
  return sql`(${rows.data}->>${dateFieldId} is null or ${cell} = '' or ${cell} in (${sql.join(listed, sql`, `)}))`
}

function linkedTo(fieldId: string, ids: readonly string[]): SQL | undefined {
  if (!ids.length || ids.length > 40) return undefined
  const matches = ids.map(id => sql`${rows.data}->${fieldId} @> ${JSON.stringify([id])}::jsonb`)
  return or(...matches) ?? sql`false`
}

function emailEquals(fieldId: string, email: string): SQL {
  return sql`lower(btrim(${rows.data}->>${fieldId})) = ${email.trim().toLowerCase()}`
}

/** Three table readers in one snapshot. Only the requested dates, people and fields leave the database. */
export async function readTeamCalendar(
  tx: Transaction,
  app: AppV2,
  actor: AppV2Actor,
  node: CalendarNode,
  query: TeamCalendarRequest,
  published: boolean,
  rowLimit = TEAM_CALENDAR_ROW_LIMIT,
) {
  const data = node.data
  if (!data) throw new RowWriteError('invalid', 'Выберите таблицы и поля календаря в конструкторе.')
  const screen = app.screens.find(item => item.id === query.screenId)
  if (!screen || screen.contextTableId) throw new RowWriteError('denied', 'Добавьте календарь на отдельный экран, без карточки записи.')
  if (node.visibleTo && !matchesAppV2Audience(node.visibleTo, actor)) throw new RowWriteError('denied', 'Календарь недоступен.')
  const roots = [data.tableId, data.resources.tableId, ...(data.hours ? [data.hours.tableId] : [])]
  const meta = await loadBuilderV2ReadMetadata(tx, app.workspaceId, roots)
  if (published) publishedV2Node(app, actor, screen.id, node.id)
  const asOf = Date.now()
  const days = calendarDays(query.day, query.week)
  const manage = actor.roleIds.some(id => node.actions.manageRoleIds.includes(id))
  const ownEmail = !manage && data.resources.ownerEmailFieldId && actor.email?.trim()
    ? data.resources.ownerEmailFieldId
    : null

  const read = async (
    source: Source,
    required: string[],
    window?: SQL,
    extra?: SQL,
  ): Promise<BuilderV2DataRecord[]> => {
    const [storedView] = source.viewId
      ? await tx.select().from(views).where(and(eq(views.id, source.viewId), eq(views.tableId, source.tableId)))
      : []
    if (source.viewId && !storedView) throw new RowWriteError('missing', 'Представление календаря удалено. Выберите другое.')
    const view = storedView ? normalizeView(storedView) : null
    const fields = meta.fieldsByTable.get(source.tableId) ?? []
    const needed = new Set([
      ...required,
      ...fieldsOfFilter(view?.config.filter),
      ...(view?.config.sorts ?? []).map(sort => sort.fieldId),
    ])
    const plan = builderV2CalculationPlan(meta.fieldsByTable, meta.primaryByTable, new Map([[source.tableId, needed]]))
    const result: { record: BuilderV2DataRecord; order: Awaited<ReturnType<typeof deriveBuilderV2Rows>>[number] }[] = []
    let after: string | undefined
    let total = 0
    while (true) {
      const batch = await tx.select().from(rows).where(and(
        eq(rows.tableId, source.tableId),
        isNull(rows.deletedAt),
        after ? gt(rows.id, after) : undefined,
        window,
        extra,
        published ? publishedV2ReadSql(app, actor, source.tableId) : undefined,
      )).orderBy(asc(rows.id)).limit(200)
      if (!batch.length) break
      total += batch.length
      if (total > rowLimit) {
        throw new RowWriteError('invalid', `Для одного календаря поддерживается до ${rowLimit.toLocaleString('ru-RU')} строк в выбранном периоде. Сузьте даты или представление.`)
      }
      after = batch.at(-1)!.id
      const permitted = published ? new Map(batch.map(row => [row.id, publishedV2Fields(app, actor, row as RuntimeSourceRow)])) : null
      const projected = published
        ? await derivePublishedV2Rows(meta, app, actor, batch as RuntimeSourceRow[], asOf)
        : await deriveBuilderV2Rows(meta, batch as RuntimeSourceRow[], plan, asOf)
      for (const row of projected) {
        if (view && !evalFilter(view.config.filter, row.data, indexFields(fields))) continue
        const visible = required.filter(id => !published || permitted?.get(row.id)?.has(id))
        result.push({ record: projectBuilderV2Record(meta, row, new Set(visible)), order: row })
      }
      if (batch.length < 200) break
    }
    return result
      .sort((a, b) => view?.config.sorts.length
        ? compareRows(a.order, b.order, view.config.sorts, indexFields(fields))
        : a.order.position.localeCompare(b.order.position) || a.order.id.localeCompare(b.order.id))
      .map(item => item.record)
  }

  const resourceFields = [
    data.resources.titleFieldId,
    ...(data.resources.photoFieldId ? [data.resources.photoFieldId] : []),
    ...(ownEmail ? [ownEmail] : []),
  ]
  const resources = await read(
    data.resources,
    resourceFields,
    undefined,
    ownEmail && actor.email ? emailEquals(ownEmail, actor.email) : undefined,
  )
  const eventFields = [
    data.titleFieldId, data.subtitleFieldId, data.startFieldId, data.durationFieldId,
    data.endFieldId, data.resourceFieldId, data.statusFieldId, data.amountFieldId,
  ].filter((id): id is string => Boolean(id))
  const events = resources.length
    ? await read(
      data,
      eventFields,
      dateWindow(data.startFieldId, shiftIsoDay(days[0]!, -8), days.at(-1)!),
      linkedTo(data.resourceFieldId, resources.map(row => row.id)),
    )
    : []
  const hoursConfig = data.hours
  let hours: BuilderV2DataRecord[] | null = null
  if (hoursConfig) {
    const core = [hoursConfig.resourceFieldId, hoursConfig.startFieldId, hoursConfig.endFieldId]
    const optional = [hoursConfig.weekdayFieldId, hoursConfig.dateFieldId, hoursConfig.closedFieldId].filter((id): id is string => Boolean(id))
    const loaded = await read(
      hoursConfig,
      [...core, ...optional],
      hoursConfig.dateFieldId ? hoursWindow(hoursConfig.dateFieldId, days) : undefined,
      linkedTo(hoursConfig.resourceFieldId, resources.map(row => row.id)),
    )
    const readable = !published || teamCalendarHoursReadable(app, actor, hoursConfig.tableId, core, loaded)
    hours = readable ? loaded.filter(row => hasKeys(row, core)) : null
  }
  const startField = meta.fieldsByTable.get(data.tableId)?.find(field => field.id === data.startFieldId)
  const timeZone = startField ? fieldTimeZone(startField) : 'Europe/Moscow'
  return teamCalendarSnapshot(data, { events, resources, hours }, query, timeZone)
}
