import { apps, db, fields as fieldsTable, rows as rowsTable, tables, views as viewsTable } from '@tableapp/db'
import { compileTableFormulas, computeDerivedRow, relatedIndexFrom, type RelatedIndex } from '@tableapp/formula'
import type { Field, View } from '@tableapp/schema'
import { byPosition, normalizeFieldOptions, normalizeView, systemRowData, VIEW_CONFIG_SCHEMA } from '@tableapp/schema'
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { formatCell } from './format'
import { memberTableFields,projectMemberData,restrictedTables,tablePermission,type TableMember } from './table-permissions'
import { memberTableScope } from './member-table-scope'
import { memberTableView } from './member-table-view'
import { applyView } from './apply-view'
import { cellText } from './table-export'
import { TABLE_PAGE_SIZE, type EditorPage, type EditorPageRequest } from './table-page'
import { materialRecordSummary, type RecordSummary } from './table-record-summary'

/** Краткое описание другой таблицы воркспейса — для выбора цели связи. */
export type TableSummary = {
  id: string
  name: string
  primaryFieldId: string | null
  fields: Field[]
}

/** Заголовки строк связанных таблиц: их показывают вместо идентификаторов. */
export type RelatedTitles = Record<string, { id: string; title: string }[]>

export type LoadedTable = {
  id: string
  name: string
  icon: string
  workspaceId: string
  primaryFieldId: string | null
  /** Шаблон, из которого выросла таблица; null — обычная таблица. */
  templateId: string | null
  /** Сколько строк-примеров из шаблона ещё не тронули. */
  sampleCount: number
  fields: Field[]
  views: View[]
  rows: { id: string; position: string; data: Record<string, unknown>; version: number }[]
  workspaceTables: TableSummary[]
  relatedTitles: RelatedTitles
  recordSummary?: RecordSummary
  editorPage?: EditorPage
  /** A selected record may stay open after its saved values no longer match the search. */
  editorPinnedRow?: LoadedTable['rows'][number]
}

/** A tab title must obey the same workspace and table access as the editor. */
export async function loadTableTitle(tableId: string, workspaceId: string, member: TableMember): Promise<string | null> {
  if (tablePermission(member, tableId) === 'none') return null
  const [table] = await db.select({ name: tables.name }).from(tables)
    .where(and(eq(tables.id, tableId), eq(tables.workspaceId, workspaceId))).limit(1)
  return table?.name ?? null
}

/** Таблица читается только внутри своего воркспейса: чужой id ничего не откроет. */
export async function loadTable(tableId: string, workspaceId: string,member?:TableMember, page?: EditorPageRequest): Promise<LoadedTable | null> {
  if(member&&tablePermission(member,tableId)==='none')return null
  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!table || table.workspaceId !== workspaceId) return null

  const [fieldRows, viewRows] = await Promise.all([
    db.select().from(fieldsTable).where(eq(fieldsTable.tableId, tableId)),
    db.select().from(viewsTable).where(eq(viewsTable.tableId, tableId)),
  ])

  const allFields = fieldRows
    .map((field) => ({ ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) }) as unknown as Field)
    .sort(byPosition)

  const fields=member?memberTableFields(allFields,member):allFields
  const definitions = table.templateId === 'proizvodstvo' ? await db.select({ draft: sql<unknown>`${apps.draft}->'production'`, published: sql<unknown>`${apps.published}->'production'` }).from(apps).where(eq(apps.workspaceId, workspaceId)) : []
  const recordSummary = table.templateId === 'proizvodstvo' ? materialRecordSummary(tableId, fields, definitions.flatMap(item => [item.draft, item.published])) : undefined
  const views = viewRows.map(normalizeView).map(view=>member&&restrictedTables(member)?memberTableView(view,allFields,fields):view).sort(byPosition)
  const active = views.find(view => view.id === page?.viewId) ?? views[0]
  if (active && page?.config) active.config = VIEW_CONFIG_SCHEMA[active.type].parse(page.config)
  const condition = and(eq(rowsTable.tableId, tableId), isNull(rowsTable.deletedAt))
  const complex = Boolean(page && (page.search.trim() || page.mode === 'grid' && active &&
    (active.config.filter.conditions.length || active.config.sorts.length || active.config.groupBy.length)))
  const [counts, tail] = page ? await Promise.all([
    db.select({ total: sql<number>`count(*)::int`, samples: sql<number>`count(*) filter (where ${rowsTable.sample})::int` }).from(rowsTable).where(condition),
    db.select({ position: rowsTable.position }).from(rowsTable).where(condition).orderBy(desc(rowsTable.position)).limit(1),
  ]) : [[], []]
  const total = counts[0]?.total ?? 0
  let offset = page ? Math.min(Math.floor(page.offset / TABLE_PAGE_SIZE) * TABLE_PAGE_SIZE, Math.max(0, Math.ceil(total / TABLE_PAGE_SIZE) - 1) * TABLE_PAGE_SIZE) : 0
  if (page?.rowId && !complex) {
    const [selected] = await db.select({ id: rowsTable.id, position: rowsTable.position }).from(rowsTable).where(and(condition, eq(rowsTable.id, page.rowId))).limit(1)
    if (selected) {
      const [rank] = await db.select({ count: sql<number>`count(*)::int` }).from(rowsTable).where(and(condition,
        or(lt(rowsTable.position, selected.position), and(eq(rowsTable.position, selected.position), lt(rowsTable.id, selected.id)))))
      offset = Math.floor((rank?.count ?? 0) / TABLE_PAGE_SIZE) * TABLE_PAGE_SIZE
    }
  }
  const query = db.select().from(rowsTable).where(condition).orderBy(asc(rowsTable.position), asc(rowsTable.id))
  const dataRows = page && !complex ? await query.limit(TABLE_PAGE_SIZE).offset(offset) : await query
  const related = await loadRelatedRows(fields, workspaceId,member)
  const formulas = compileTableFormulas(fields)
  const workspaceTables = await loadWorkspaceTables(table.workspaceId,member)
  const relatedTitles = buildRelatedTitles(fields, related, workspaceTables)

  let computedRows = dataRows.map((row) => ({
    id: row.id, position: row.position,
    data: projectMemberData(computeDerivedRow(systemRowData(row as typeof row & { data: Record<string, unknown> }, fields), fields, related, formulas),fields),
    version: row.version,
  }))
  let matched = total
  const selectedRow = page?.rowId ? computedRows.find(row => row.id === page.rowId) : undefined
  if (page && complex) {
    if (page.mode === 'grid' && active) computedRows = applyView(computedRows, fields, active.config, page.search).rows.map(row => ({ ...row, version: row.version ?? 0 }))
    else {
      const needle = page.search.trim().toLocaleLowerCase('ru-RU')
      if (needle) computedRows = computedRows.filter(row => fields.some(field => cellText(field, row.data[field.id], relatedTitles).toLocaleLowerCase('ru-RU').includes(needle)))
    }
    matched = computedRows.length
    const selectedIndex = page.rowId ? computedRows.findIndex(row => row.id === page.rowId) : -1
    offset = selectedIndex >= 0 ? Math.floor(selectedIndex / TABLE_PAGE_SIZE) * TABLE_PAGE_SIZE : Math.min(offset, Math.max(0, Math.ceil(matched / TABLE_PAGE_SIZE) - 1) * TABLE_PAGE_SIZE)
    computedRows = computedRows.slice(offset, offset + TABLE_PAGE_SIZE)
  }
  return {
    id: table.id,
    name: table.name,
    icon: table.icon,
    workspaceId: table.workspaceId,
    primaryFieldId: table.primaryFieldId,
    templateId: table.templateId,
    sampleCount: page ? counts[0]?.samples ?? 0 : dataRows.filter((row) => row.sample).length,
    fields,
    views,
    rows: computedRows,
    workspaceTables,
    relatedTitles,
    ...(recordSummary ? { recordSummary } : {}),
    ...(page ? { editorPage: { total, matched, offset, limit: TABLE_PAGE_SIZE, lastPosition: tail[0]?.position ?? null, mode: page.mode, search: page.search, viewId: active?.id ?? '' } } : {}),
    ...(selectedRow && !computedRows.some(row => row.id === selectedRow.id) ? { editorPinnedRow: selectedRow } : {}),
  }
}

async function loadWorkspaceTables(workspaceId: string,member?:TableMember): Promise<TableSummary[]> {
  const [tableRows, fieldRows] = await Promise.all([
    db.select().from(tables).where(and(eq(tables.workspaceId, workspaceId),member?memberTableScope(member,tables.id):undefined)).orderBy(asc(tables.position)),
    db
      .select()
      .from(fieldsTable)
      .where(
        inArray(
          fieldsTable.tableId,
          db.select({ id: tables.id }).from(tables).where(and(eq(tables.workspaceId, workspaceId),member?memberTableScope(member,tables.id):undefined)),
        ),
      ),
  ])

  const byTable = new Map<string, Field[]>()
  for (const row of fieldRows) {
    const field = { ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) } as unknown as Field
    const list = byTable.get(row.tableId)
    if (list) list.push(field)
    else byTable.set(row.tableId, [field])
  }

  return tableRows.map((table) => ({
    id: table.id,
    name: table.name,
    primaryFieldId: table.primaryFieldId,
    fields: (member?memberTableFields(byTable.get(table.id)??[],member):byTable.get(table.id)??[]).sort(byPosition),
  }))
}

function buildRelatedTitles(
  fields: readonly Field[],
  related: RelatedIndex,
  workspaceTables: readonly TableSummary[],
): RelatedTitles {
  const titles: RelatedTitles = {}

  for (const field of fields) {
    if (field.type !== 'relation') continue
    const targetId = field.options.tableId
    if (titles[targetId]) continue

    const summary = workspaceTables.find((table) => table.id === targetId)
    const titleField =
      summary?.fields.find((candidate) => candidate.id === summary.primaryFieldId) ?? summary?.fields[0]

    titles[targetId] = [...(related.get(targetId) ?? new Map()).entries()].map(([id, data]) => ({
      id,
      title: titleField ? formatCell(titleField, data[titleField.id]) || 'Без названия' : id,
    }))
  }

  return titles
}

/** Строки таблиц, на которые ссылаются поля связи. Нужны для Lookup и Rollup. */
/**
 * Строки связанных таблиц вместе с их полями: поля нужны, чтобы посчитать
 * формулы связанной таблицы. Rollup по формульной колонке иначе суммирует
 * пустоту — «Итого» по позициям заказа показывало ноль при непустых позициях.
 */
export async function loadRelatedRows(fields: readonly Field[], workspaceId: string,member?:TableMember): Promise<RelatedIndex> {
  const targetIds = [
    ...new Set(
      fields
        .filter((field): field is Extract<Field, { type: 'relation' }> => field.type === 'relation')
        .map((field) => field.options.tableId),
    ),
  ]
  if (targetIds.length === 0) return new Map()

  const allowedTargets = db.select({ id: tables.id }).from(tables)
    .where(and(eq(tables.workspaceId, workspaceId), inArray(tables.id, targetIds),member?memberTableScope(member,tables.id):undefined))

  const [rows, fieldRows] = await Promise.all([
    db
      .select()
      .from(rowsTable)
      .where(and(inArray(rowsTable.tableId, allowedTargets), isNull(rowsTable.deletedAt))),
    db.select().from(fieldsTable).where(inArray(fieldsTable.tableId, allowedTargets)),
  ])

  const rowsByTable = new Map<string, Map<string, Record<string, unknown>>>()
  for (const row of rows) {
    let table = rowsByTable.get(row.tableId)
    if (!table) {
      table = new Map()
      rowsByTable.set(row.tableId, table)
    }
    table.set(row.id, row.data as Record<string, unknown>)
  }

  const fieldsByTable = new Map<string, Field[]>()
  for (const row of fieldRows) {
    const field = { ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) } as unknown as Field
    const list = fieldsByTable.get(row.tableId)
    if (list) list.push(field)
    else fieldsByTable.set(row.tableId, [field])
  }
  for (const list of fieldsByTable.values()) list.sort(byPosition)
  if(member)for(const [tableId,list]of fieldsByTable)fieldsByTable.set(tableId,memberTableFields(list,member))

  for (const row of rows) rowsByTable.get(row.tableId)!.set(row.id,
    projectMemberData(systemRowData(row as typeof row & { data: Record<string, unknown> }, fieldsByTable.get(row.tableId) ?? []),fieldsByTable.get(row.tableId)??[]))

  return relatedIndexFrom(rowsByTable, fieldsByTable)
}

/** Первая таблица воркспейса — точка входа после логина. */
export async function firstTableId(workspaceId: string): Promise<string | null> {
  const [table] = await db
    .select({ id: tables.id })
    .from(tables)
    .where(eq(tables.workspaceId, workspaceId))
    .orderBy(asc(tables.position))
    .limit(1)
  return table?.id ?? null
}
