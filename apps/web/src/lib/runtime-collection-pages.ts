import { db, rows } from '@tableapp/db'
import { compileTableFormulas, computeDerivedRow, relatedIndexFrom } from '@tableapp/formula'
import { systemRowData, type App } from '@tableapp/schema'
import { and, asc, eq, gt, isNull, or, sql, type SQL } from 'drizzle-orm'
import { configFingerprint } from './app-config-history'
import type { RuntimeApp } from './app-runtime'
import { canOpenScreen, type Visitor } from './app-roles'
import { historyCursor, readHistoryCursor } from './history-cursor'
import { runtimeCollectionPlan } from './runtime-collection-query'
import { tryRuntimeCollectionSql } from './runtime-collection-sql'
import { loadPageRowData, loadRuntimePageMetadata, projectPageData, runtimeDataRevision, type RuntimePageMetadata } from './runtime-page-data'
import { RUNTIME_PAGE_SIZE, RUNTIME_SCAN_BATCH, runtimeQueryKey, type CollectionPage, type RuntimePageRequest } from './runtime-page-types'
import { RowWriteError } from './row-mutations'
import type { RuntimeSourceRow } from './runtime-project'

type CollectionPlan = ReturnType<typeof runtimeCollectionPlan>
type Candidate = { source: RuntimeSourceRow; derived: RuntimeSourceRow }
type Cursor = { lastRowId: string; dataRevision: string; asOf: number }
const stale = () => new RowWriteError('conflict', 'Список изменился. Обновите его и продолжите с первой страницы.')

function validRequest(request: RuntimePageRequest, cursor?: string) {
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
    request.query !== undefined && (typeof request.query !== 'string' || request.query.length > 200) ||
    request.choiceId !== undefined && request.choiceId !== null && (typeof request.choiceId !== 'string' || request.choiceId.length > 200) ||
    request.customerSection !== undefined && !['active', 'history'].includes(request.customerSection) ||
    request.bookingSection !== undefined && !['upcoming', 'history'].includes(request.bookingSection) ||
    cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 2000)) throw new RowWriteError('invalid', 'Проверьте поиск и выбранный раздел списка')
}

/** An SQL ownership prefilter narrows candidates, never replaces the authoritative per-row check. */
function ownershipWhere(plan: CollectionPlan): SQL | undefined {
  if (plan.rules.length > 0) {
    const conditions = plan.rules.flatMap(rule => {
      const value = rule.match === 'company' ? plan.viewer?.company : plan.viewer?.email
      if (!value?.trim()) return []
      // canAccessRow uses String(value), so legacy singleton arrays may own a row.
      // SQL prefiltering only ASCII strings avoids narrowing JS Unicode/trim semantics.
      return [or(sql`jsonb_typeof(${rows.data}->${rule.fieldId}) is distinct from 'string'`,
        sql`coalesce(${rows.data}->>${rule.fieldId},'') ~ '[^ -~]'`,
        sql`translate(btrim(coalesce(${rows.data}->>${rule.fieldId},''), ${' \t\n\r\f\v'}), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')=${value.trim().toLowerCase()}`)!]
    })
    return conditions.length ? or(...conditions) : sql`false`
  }
  return undefined
}

function derivedCandidates(meta: RuntimePageMetadata, source: readonly RuntimeSourceRow[], loaded: readonly RuntimeSourceRow[], asOf: number): Candidate[] {
  const byTable = new Map<string, Map<string, Record<string, unknown>>>()
  for (const row of loaded) {
    let bucket = byTable.get(row.tableId)
    if (!bucket) { bucket = new Map(); byTable.set(row.tableId, bucket) }
    bucket.set(row.id, systemRowData(row, meta.fieldsByTable.get(row.tableId) ?? []))
  }
  const options = { now: new Date(asOf) }, related = relatedIndexFrom(byTable, meta.fieldsByTable, options)
  const formulas = new Map<string, ReturnType<typeof compileTableFormulas>>()
  return source.map(row => {
    const fields = meta.fieldsByTable.get(row.tableId) ?? []
    if (!formulas.has(row.tableId)) formulas.set(row.tableId, compileTableFormulas(fields))
    return { source: row, derived: { ...row, data: computeDerivedRow(systemRowData(row, fields), fields, related, formulas.get(row.tableId)!, options) } }
  })
}

async function loadAnchor(meta: RuntimePageMetadata, plan: CollectionPlan, tableId: string, cursor: Cursor): Promise<Candidate> {
  const [row] = await meta.runner.select().from(rows).where(and(eq(rows.tableId, tableId), eq(rows.id, cursor.lastRowId), isNull(rows.deletedAt))).limit(1)
  if (!row || !plan.ownerAllowed(row as RuntimeSourceRow)) throw stale()
  const source = row as RuntimeSourceRow, loaded = await loadPageRowData(meta, [source])
  const [anchor] = derivedCandidates(meta, [source], loaded, cursor.asOf)
  const projected = projectPageData(meta, loaded, cursor.asOf)
  if (!anchor || !plan.baseAllowed(anchor.derived) || !plan.sectionAllowed(anchor.derived) || !plan.queryAllowed(anchor.derived, projected.relatedTitles)) throw stale()
  return anchor
}

async function collectionResult(meta: RuntimePageMetadata, screenId: string, tableId: string, roots: RuntimeSourceRow[],
  page: Omit<CollectionPage, 'next'>, hasNext: boolean, binding: string): Promise<RuntimeApp> {
  const runtime = projectPageData(meta, await loadPageRowData(meta, roots), page.asOf)
  const ids = roots.map(row => row.id), last = roots.at(-1)
  const next = hasNext && last ? historyCursor({ lastRowId: last.id, dataRevision: page.dataRevision, asOf: page.asOf } satisfies Cursor, binding) : null
  runtime.screens = { [screenId]: { rowIds: ids, page: { ...page, next } } }
  runtime.blocks = {}
  for (const table of Object.values(runtime.tables)) table.rows = table.id === tableId ? table.rows.filter(row => ids.includes(row.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) : []
  return runtime
}

/**
 * Scan roots in bounded batches and keep only the globally best next page.
 * Derived filters, Russian collation and relation-label search cannot be safely
 * implemented by sorting or searching only a previously limited SQL batch.
 */
export async function readRuntimeCollection(app: App, visitor: Visitor, screenId: string, request: RuntimePageRequest = {}, cursor?: string): Promise<RuntimeApp> {
  validRequest(request, cursor)
  if (typeof screenId !== 'string' || screenId.length > 200) throw new RowWriteError('invalid', 'Проверьте выбранный список')
  return db.transaction(async tx => {
    const meta = await loadRuntimePageMetadata(app, visitor, tx)
    const screen = meta.app.screens.find(screen => screen.id === screenId)
    if (!screen || (screen.type !== 'list' && screen.type !== 'tiles') || !canOpenScreen(screen, visitor)) throw new RowWriteError('denied', 'Этот список вам недоступен')
    const view = meta.views[screen.source.viewId]
    if (!view || !meta.tableRows.some(table => table.id === view.tableId)) throw new RowWriteError('missing', 'Источник списка недоступен')
    const fields = meta.fieldsByTable.get(view.tableId) ?? []
    const firstPlan = runtimeCollectionPlan(meta.app, visitor, screen, view, fields, meta.views, request, Date.now())
    if (!firstPlan.validChoice) throw new RowWriteError('denied', 'Выбранный статус недоступен в этом списке')
    const key = runtimeQueryKey(firstPlan.query)
    const binding = configFingerprint(['runtime-collection-v1', app.workspaceId, app.id, visitor, screenId, meta.fingerprint, key])
    const state = readHistoryCursor(cursor, binding) as Cursor | null
    if (state && (typeof state.lastRowId !== 'string' || !state.lastRowId || state.lastRowId.length > 200 ||
      typeof state.dataRevision !== 'string' || state.dataRevision.length !== 64 || !Number.isFinite(state.asOf) || state.asOf < 0 || state.asOf > Date.now() + 60_000)) throw stale()
    const dataRevision = await runtimeDataRevision(meta)
    if (state && state.dataRevision !== dataRevision) throw stale()
    const asOf = state?.asOf ?? Date.now()
    const plan = runtimeCollectionPlan(meta.app, visitor, screen, view, fields, meta.views, request, asOf)
    const anchor = state ? await loadAnchor(meta, plan, view.tableId, state) : null
    const fast = await tryRuntimeCollectionSql(meta, screen, view, plan, anchor?.source ?? null)
    if (fast) return collectionResult(meta, screenId, view.tableId, fast.source.slice(0, RUNTIME_PAGE_SIZE),
      { key, asOf, dataRevision, total: fast.total, matched: fast.matched, choiceCounts: {}, sectionCounts: {} }, fast.source.length > RUNTIME_PAGE_SIZE, binding)
    const top: Candidate[] = [], choiceCounts = Object.fromEntries(plan.choices.map(choice => [choice.id, 0]))
    const sectionCounts: Record<string, number> = plan.query.bookingSection ? { upcoming: 0, history: 0 } : plan.query.customerSection ? { active: 0, history: 0 } : {}
    let total = 0, matched = 0, lastId: string | null = null
    const ownership = ownershipWhere(plan)
    while (true) {
      const batch = await tx.select().from(rows).where(and(eq(rows.tableId, view.tableId), isNull(rows.deletedAt), ownership,
        lastId !== null ? gt(rows.id, lastId) : undefined)).orderBy(asc(rows.id)).limit(RUNTIME_SCAN_BATCH)
      if (!batch.length) break
      lastId = batch.at(-1)!.id
      const source = (batch as RuntimeSourceRow[]).filter(row => plan.ownerAllowed(row))
      if (source.length) {
        const loaded = await loadPageRowData(meta, source), projected = projectPageData(meta, loaded, asOf)
        for (const candidate of derivedCandidates(meta, source, loaded, asOf)) {
          const row = candidate.derived
          if (!plan.baseAllowed(row)) continue
          const section = plan.section(row)
          if (section !== null) sectionCounts[section] = (sectionCounts[section] ?? 0) + 1
          if (!plan.sectionAllowed(row)) continue
          total++
          for (const choice of plan.choices) if (plan.hasChoice(row, choice.id)) choiceCounts[choice.id] = (choiceCounts[choice.id] ?? 0) + 1
          if (!plan.queryAllowed(row, projected.relatedTitles)) continue
          matched++
          if (anchor && plan.compare(row, anchor.derived) <= 0) continue
          if (top.length === RUNTIME_PAGE_SIZE + 1 && plan.compare(row, top.at(-1)!.derived) >= 0) continue
          top.push(candidate); top.sort((a, b) => plan.compare(a.derived, b.derived))
          if (top.length > RUNTIME_PAGE_SIZE + 1) top.pop()
        }
      }
      if (batch.length < RUNTIME_SCAN_BATCH) break
    }
    return collectionResult(meta, screenId, view.tableId, top.slice(0, RUNTIME_PAGE_SIZE).map(candidate => candidate.source),
      { key, total, matched, choiceCounts, sectionCounts, asOf, dataRevision }, top.length > RUNTIME_PAGE_SIZE, binding)
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
