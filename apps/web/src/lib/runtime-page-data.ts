import { createHash } from 'node:crypto'
import { compileTableFormulas } from '@tableapp/formula'
import { db, fields, rows, tables, views } from '@tableapp/db'
import { fieldsOfFilter, normalizeFieldOptions, normalizeView, type App, type Field, type View } from '@tableapp/schema'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { fieldPolicy, formFields, visibleScreensFor, type Visitor } from './app-roles'
import { readingVisitor } from './customer-read-access'
import type { Transaction } from './db-transaction'
import { projectRuntime, type RuntimeSourceRow } from './runtime-project'
import { RowWriteError } from './row-mutations'

type Runner = typeof db | Transaction
export type RuntimePageMetadata = {
  app: App
  visitor: Visitor
  views: Record<string, View>
  tableRows: { id: string; name: string; primaryFieldId: string | null }[]
  fieldsByTable: Map<string, Field[]>
  primaryByTable: Map<string, string | null>
  fingerprint: string
  runner: Runner
  neededFields: Map<string, Set<string>>
}

/** Definitions are read without business rows. Related table IDs remain a server-only dependency graph. */
export async function loadRuntimePageMetadata(app: App, visitor: Visitor, runner: Runner = db): Promise<RuntimePageMetadata> {
  const visible = { ...app, screens: visibleScreensFor(app, visitor) }
  const owned = runner.select({ id: tables.id }).from(tables).where(eq(tables.workspaceId, app.workspaceId))
  const viewIds = [...new Set(visible.screens.flatMap(screen => 'source' in screen ? [screen.source.viewId]
    : screen.type === 'dashboard' ? screen.blocks.flatMap(block => 'source' in block ? [block.source.viewId] : []) : []))]
  const viewRows = viewIds.length ? await runner.select().from(views).where(and(inArray(views.id, viewIds), inArray(views.tableId, owned))) : []
  const viewMap = Object.fromEntries(viewRows.map(view => [view.id, normalizeView(view)]))
  const tableIds = new Set(visible.screens.flatMap(screen => 'tableId' in screen ? [screen.tableId] : 'source' in screen
    ? [viewMap[screen.source.viewId]?.tableId ?? ''] : screen.blocks.flatMap(block => 'source' in block ? [viewMap[block.source.viewId]?.tableId ?? ''] : [])).filter(Boolean))
  const exposedTableIds = new Set(tableIds)
  const fieldsByTable = new Map<string, Field[]>(), tableRows: RuntimePageMetadata['tableRows'] = []
  const loaded = new Set<string>()
  while ([...tableIds].some(id => !loaded.has(id))) {
    const pending = [...tableIds].filter(id => !loaded.has(id))
    pending.forEach(id => loaded.add(id))
    const [tableBatch, fieldBatch] = await Promise.all([
      runner.select({ id: tables.id, name: tables.name, primaryFieldId: tables.primaryFieldId }).from(tables).where(and(eq(tables.workspaceId, app.workspaceId), inArray(tables.id, pending))),
      runner.select().from(fields).where(and(inArray(fields.tableId, pending), inArray(fields.tableId, owned))),
    ])
    tableRows.push(...tableBatch)
    for (const record of fieldBatch) {
      const field = { ...record, options: normalizeFieldOptions(record.type as Field['type'], record.options) } as unknown as Field
      const list = fieldsByTable.get(field.tableId) ?? []; list.push(field); fieldsByTable.set(field.tableId, list)
      if (field.type === 'relation') tableIds.add(field.options.tableId)
    }
  }
  const primaryByTable = new Map(tableRows.map(table => [table.id, table.primaryFieldId]))
  const neededFields = new Map<string, Set<string>>()
  for (const [tableId, columns] of fieldsByTable) {
    const needed = new Set(fieldPolicy(visible, tableId, readingVisitor(visible, tableId, visitor), viewMap).fields)
    for (const screen of visible.screens) {
      if (screen.type === 'form' && screen.tableId === tableId) for (const id of formFields(visible, screen, visitor)) needed.add(id)
      if ((screen.type === 'list' || screen.type === 'tiles') && viewMap[screen.source.viewId]?.tableId === tableId) {
        for (const id of fieldsOfFilter(viewMap[screen.source.viewId]!.config.filter)) needed.add(id)
        for (const id of fieldsOfFilter(screen.source.extraFilter)) needed.add(id)
        for (const sort of viewMap[screen.source.viewId]!.config.sorts) needed.add(sort.fieldId)
      }
    }
    for (const rule of visible.rowAccessRules.filter(rule => rule.tableId === tableId)) needed.add(rule.fieldId)
    const formulas = compileTableFormulas(columns)
    let changed = true
    while (changed) {
      const before = needed.size
      for (const id of [...needed]) {
        for (const dependency of formulas.get(id)?.dependencies ?? []) needed.add(dependency)
        const field = columns.find(field => field.id === id)
        if (field && (field.type === 'lookup' || field.type === 'rollup' || field.type === 'count')) needed.add(field.options.relationFieldId)
      }
      changed = needed.size !== before
    }
    neededFields.set(tableId, needed)
  }
  const fingerprint = createHash('sha256').update(JSON.stringify([app, visitor, tableRows.sort((a,b) => a.id.localeCompare(b.id)), viewRows.sort((a,b) => a.id.localeCompare(b.id)),
    [...fieldsByTable].sort(([a],[b]) => a.localeCompare(b)).map(([id,list]) => [id,list.sort((a,b) => a.id.localeCompare(b.id))])])).digest('hex')
  return { app: visible, visitor, views: viewMap, tableRows: tableRows.filter(table => exposedTableIds.has(table.id)), fieldsByTable, primaryByTable, fingerprint, runner, neededFields }
}

/** Fetch exact related IDs in bounded queries; never enumerate a whole relation target for a collection page. */
export async function loadPageRowData(meta: RuntimePageMetadata, candidates: readonly RuntimeSourceRow[]): Promise<RuntimeSourceRow[]> {
  const found = new Map(candidates.map(row => [`${row.tableId}:${row.id}`, row]))
  const wanted = new Map<string, Set<string>>()
  for (const row of candidates) for (const field of meta.fieldsByTable.get(row.tableId) ?? []) {
    if (field.type !== 'relation' || !meta.neededFields.get(row.tableId)?.has(field.id) || !meta.primaryByTable.has(field.options.tableId)) continue
    const value = row.data[field.id]
    const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : typeof value === 'string' ? [value] : []
    const group = wanted.get(field.options.tableId) ?? new Set<string>()
    for (const id of ids) if (!found.has(`${field.options.tableId}:${id}`)) group.add(id)
    wanted.set(field.options.tableId, group)
  }
  // This is a limit on one page's explicit calculation graph, rather than a silent truncation.
  if ([...wanted.values()].reduce((sum, ids) => sum + ids.size, 0) > 20_000) throw new RowWriteError('invalid', 'У этих записей слишком много связанных данных. Уменьшите количество связей и повторите загрузку.')
  for (const [tableId, ids] of wanted) {
    const pending = [...ids]
    for (let offset = 0; offset < pending.length; offset += 200) {
      const batch = await meta.runner.select().from(rows).where(and(eq(rows.tableId, tableId), inArray(rows.id, pending.slice(offset, offset + 200)), isNull(rows.deletedAt))).orderBy(asc(rows.id))
      for (const row of batch) found.set(`${row.tableId}:${row.id}`, row as RuntimeSourceRow)
    }
  }
  return [...found.values()]
}

export function projectPageData(meta: RuntimePageMetadata, sourceRows: readonly RuntimeSourceRow[], asOf: number) {
  return projectRuntime(meta.app, meta.visitor, meta.views, meta.tableRows, meta.fieldsByTable, [...sourceRows], meta.primaryByTable, { now: new Date(asOf) })
}

/** Tombstones and related tables participate, so a continuation never mixes mutable sort keys or dependencies. */
export async function runtimeDataRevision(meta: RuntimePageMetadata): Promise<string> {
  const ids = [...meta.primaryByTable.keys()]
  const summary = ids.length ? await meta.runner.select({ tableId: rows.tableId, count: sql<number>`count(*)`, revision: sql<number>`max(${rows.syncRevision})` })
    .from(rows).where(inArray(rows.tableId, ids)).groupBy(rows.tableId).orderBy(asc(rows.tableId)) : []
  return createHash('sha256').update(JSON.stringify([meta.fingerprint, summary])).digest('hex')
}
