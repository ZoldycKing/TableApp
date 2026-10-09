import { db, fields, rows, tables, views } from '@tableapp/db'
import { compileTableFormulas, computeDerivedRow } from '@tableapp/formula'
import { normalizeFieldOptions, normalizeView, systemRowData, type RowMetadata, type App, type Field } from '@tableapp/schema'
import { loadRelatedRows } from './queries'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { fieldPolicy, onlyReadable, rowReach, type Visitor } from './app-roles'
import { canAccessRow, rulesFor, type AccessViewer } from './row-access'
import { readingVisitor } from './customer-read-access'

export function policyDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** The same field projection and screen filters used by runtime and exports. */
export async function appReadPolicy(app: App, tableId: string, visitor: Visitor, viewer: AccessViewer) {
  const found = await db.select({ field: fields }).from(fields).innerJoin(tables, eq(fields.tableId, tables.id))
    .where(and(eq(fields.tableId, tableId), eq(tables.workspaceId, app.workspaceId))).orderBy(asc(fields.id))
  const columns = found.map(({ field }) => ({ ...field,
    options: normalizeFieldOptions(field.type as Field['type'], field.options),
  }) as unknown as Field)
  const viewRows = await db.select({ view: views }).from(views).innerJoin(tables, eq(views.tableId, tables.id))
    .where(eq(tables.workspaceId, app.workspaceId)).orderBy(asc(views.id))
  const viewMap = Object.fromEntries(viewRows.map(({ view }) => [view.id, normalizeView(view)]))
  const relationIds = [...new Set(columns.flatMap((field) => field.type === 'relation' ? [field.options.tableId] : []))]
  const related = await loadRelatedRows(columns, app.workspaceId)
  const dependencyRevisions: [string, number][] = []
  if (relationIds.length) {
    const relatedRows = await db.select({ row: rows }).from(rows).innerJoin(tables, eq(rows.tableId, tables.id))
      .where(and(eq(tables.workspaceId, app.workspaceId), inArray(rows.tableId, relationIds)))
      .orderBy(asc(rows.id))
    for (const { row } of relatedRows) {
      dependencyRevisions.push([row.id, row.syncRevision])
      if (row.deletedAt !== null) continue
    }
  }
  const reading = readingVisitor(app, tableId, visitor)
  const reach = rowReach(app, tableId, viewMap, columns, reading)
  const readable = { ...fieldPolicy(app, tableId, reading, viewMap), restricted: true }
  const rules = rulesFor(app, tableId, visitor)
  const formulas = compileTableFormulas(columns)
  const derive = (data: Record<string, unknown>, row?: RowMetadata) => computeDerivedRow(
    systemRowData({ ...(row ?? { id: '' }), data }, columns), columns, related, formulas)
  return {
    fields: columns, views: viewMap, readable,
    canRead: (data: Record<string, unknown>, row?: RowMetadata) => (reading !== visitor || canAccessRow(rules, viewer, data)) &&
      reach.kind !== 'none' && (reach.kind === 'ungated' || reach.allows(derive(data, row))),
    project: (data: Record<string, unknown>, row?: RowMetadata) => onlyReadable(derive(data, row), readable),
    fingerprint: policyDigest([app, visitor, found, viewRows, dependencyRevisions,
      [...related].map(([id, records]) => [id, [...records]])]),
  }
}
