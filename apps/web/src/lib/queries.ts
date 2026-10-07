import { db, fields as fieldsTable, rows as rowsTable, tables, views as viewsTable } from '@tableapp/db'
import { compileTableFormulas, computeDerivedRow, relatedIndexFrom, type RelatedIndex } from '@tableapp/formula'
import type { Field, View } from '@tableapp/schema'
import { byPosition, normalizeFieldOptions, normalizeView, systemRowData } from '@tableapp/schema'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { formatCell } from './format'

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
}

/** Таблица читается только внутри своего воркспейса: чужой id ничего не откроет. */
export async function loadTable(tableId: string, workspaceId: string): Promise<LoadedTable | null> {
  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!table || table.workspaceId !== workspaceId) return null

  const [fieldRows, viewRows, dataRows] = await Promise.all([
    db.select().from(fieldsTable).where(eq(fieldsTable.tableId, tableId)),
    db.select().from(viewsTable).where(eq(viewsTable.tableId, tableId)),
    db
      .select()
      .from(rowsTable)
      .where(and(eq(rowsTable.tableId, tableId), isNull(rowsTable.deletedAt)))
      .orderBy(asc(rowsTable.position)),
  ])

  const fields = fieldRows
    .map((field) => ({ ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) }) as unknown as Field)
    .sort(byPosition)

  const related = await loadRelatedRows(fields, workspaceId)
  const formulas = compileTableFormulas(fields)
  const workspaceTables = await loadWorkspaceTables(table.workspaceId)
  const relatedTitles = buildRelatedTitles(fields, related, workspaceTables)

  return {
    id: table.id,
    name: table.name,
    icon: table.icon,
    workspaceId: table.workspaceId,
    primaryFieldId: table.primaryFieldId,
    templateId: table.templateId,
    sampleCount: dataRows.filter((row) => row.sample).length,
    fields,
    views: viewRows.map(normalizeView).sort(byPosition),
    rows: dataRows.map((row) => ({
      id: row.id,
      position: row.position,
      // Lookup, Rollup, количество связей и формулы считаются на чтении и не хранятся.
      data: computeDerivedRow(systemRowData(row as typeof row & { data: Record<string, unknown> }, fields), fields, related, formulas),
      version: row.version,
    })),
    workspaceTables,
    relatedTitles,
  }
}

async function loadWorkspaceTables(workspaceId: string): Promise<TableSummary[]> {
  const [tableRows, fieldRows] = await Promise.all([
    db.select().from(tables).where(eq(tables.workspaceId, workspaceId)).orderBy(asc(tables.position)),
    db
      .select()
      .from(fieldsTable)
      .where(
        inArray(
          fieldsTable.tableId,
          db.select({ id: tables.id }).from(tables).where(eq(tables.workspaceId, workspaceId)),
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
    fields: (byTable.get(table.id) ?? []).sort(byPosition),
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
export async function loadRelatedRows(fields: readonly Field[], workspaceId: string): Promise<RelatedIndex> {
  const targetIds = [
    ...new Set(
      fields
        .filter((field): field is Extract<Field, { type: 'relation' }> => field.type === 'relation')
        .map((field) => field.options.tableId),
    ),
  ]
  if (targetIds.length === 0) return new Map()

  const allowedTargets = db.select({ id: tables.id }).from(tables)
    .where(and(eq(tables.workspaceId, workspaceId), inArray(tables.id, targetIds)))

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

  for (const row of rows) rowsByTable.get(row.tableId)!.set(row.id,
    systemRowData(row as typeof row & { data: Record<string, unknown> }, fieldsByTable.get(row.tableId) ?? []))

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
