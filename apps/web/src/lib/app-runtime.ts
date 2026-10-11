import { projectRuntime, buildTitles, type RuntimeSourceRow } from './runtime-project'
import { apps, businessCustomers, db, fields as fieldsTable, rows as rowsTable, tables, views as viewsTable } from '@tableapp/db'
import { compileTableFormulas, computeDerivedRow, relatedIndexFrom } from '@tableapp/formula'
import type { App, Field, View } from '@tableapp/schema'
import { appSchema, byPosition, normalizeFieldOptions, normalizeView, systemRowData } from '@tableapp/schema'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { asRole, visibleScreensFor, type Visitor } from './app-roles'
import type { DashboardResults } from './dashboard-data'
import type { RelatedTitles } from './queries'
import type { TableRow } from './table-store'
import { validateAppReferences } from './app-references'
import { loadBusinessProfile } from './business-profile'
import type { BusinessProfile } from '@tableapp/schema'
import { listAccessibleApps } from './customer-apps'
import { configFingerprint } from './app-config-history'

export type RuntimeTable = {
  id: string
  name: string
  primaryFieldId: string | null
  fields: Field[]
  rows: TableRow[]
}

/** Строки одного списка: уже отобранные и уже упорядоченные. */
export type ScreenRows = { rowIds: string[] }

export type RuntimeApp = {
  /** Present only in the live client pilot. Missing rows on other screens have not been loaded yet. */
  lazy?: { revision: string; loadedScreenIds: string[] }
  customerProfile?: { name: string | null; phone: string | null }
  business?: BusinessProfile | null
  businessApps?: { slug: string; name: string }[]
  /** Shared server clock for initial rendering of time-sensitive client screens. */
  loadedAt?: number
  app: App
  views: Record<string, View>
  tables: Record<string, RuntimeTable>
  relatedTitles: RelatedTitles
  /**
   * Что показывает каждый список и каждая плитка — по идентификатору экрана.
   *
   * Отбор и порядок посчитаны здесь, на сервере, и наружу уходит их результат,
   * а не правило. Браузеру нечего решать: он берёт строки по этим
   * идентификаторам в этом порядке.
   *
   * Так было не всегда. Раньше отбор повторялся на устройстве, и это значило
   * две вещи сразу: строка, убранная владельцем из списка фильтром, всё равно
   * уезжала в браузер и лежала в исходном коде страницы; а колонку, по которой
   * шёл фильтр, приходилось отдавать вместе со строками — фильтр по
   * себестоимости делал себестоимость читаемой для всех, кому открыт список.
   */
  screens: Record<string, ScreenRows>
  /**
   * Готовые итоги блоков сводки по идентификатору блока.
   *
   * Считаются здесь, на сервере, а не в компоненте: число — такие же данные,
   * как и строки, из которых оно получено, и считать его в браузере значит
   * сначала отправить туда эти строки.
   */
  blocks: DashboardResults
}

/**
 * Представления, на которые ссылается приложение.
 *
 * Сводка считает свои блоки по тем же представлениям, что и списки: иначе
 * число в плитке и строки в списке отбирались бы по разным правилам.
 */
function referencedViews(app: App): string[] {
  const ids = new Set<string>()
  for (const screen of app.screens) {
    if (screen.type === 'list' || screen.type === 'tiles') {
      ids.add(screen.source.viewId)
      continue
    }
    if (screen.type === 'dashboard') {
      for (const block of screen.blocks) {
        if ('source' in block) ids.add(block.source.viewId)
      }
    }
  }
  return [...ids].filter(Boolean)
}

/** Таблицы, на которые опираются экраны приложения. */
function referencedTables(app: App, views: Record<string, View>): string[] {
  const ids = new Set<string>()
  for (const screen of app.screens) {
    if (screen.type === 'list' || screen.type === 'tiles') {
      const view = views[screen.source.viewId]
      if (view) ids.add(view.tableId)
      continue
    }
    if (screen.type === 'dashboard') {
      for (const block of screen.blocks) {
        if (!('source' in block)) continue
        const view = views[block.source.viewId]
        if (view) ids.add(view.tableId)
      }
      continue
    }
    ids.add(screen.tableId)
  }
  return [...ids]
}


export type AppMeta = {
  business?: BusinessProfile | null
  id: string
  name: string
  slug: string
  accent: string
  accessMode: string
  /** Полное определение: по нему считается роль посетителя ещё до загрузки данных. */
  app: App
}

async function definition(record: { id: string; workspaceId: string }, value: unknown): Promise<App | null> {
  const parsed = appSchema.safeParse(value)
  if (!parsed.success) return null
  const app = { ...parsed.data, id: record.id, workspaceId: record.workspaceId }
  return await validateAppReferences(app) ? null : app
}

/** Лёгкое описание приложения: нужно до загрузки данных, чтобы решить вопрос входа. */
export async function loadAppMeta(slug: string): Promise<AppMeta | null> {
  const [record] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!record?.published) return null
  const app = await definition(record, record.published)
  if (!app) return null
  return {
    id: record.id,
    name: app.name,
    business: await loadBusinessProfile(app.workspaceId),
    slug: app.slug,
    accent: app.theme.accent,
    accessMode: app.accessMode,
    app,
  }
}

export async function loadPublishedApp(
  slug: string,
  visitor: Visitor,
  request?: { screenId: string | null },
): Promise<RuntimeApp | null> {
  const [record] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!record?.published) return null

  const app = await definition(record, record.published)
  if (!app) return null

  /*
   * Экраны, закрытые этой роли, отбрасываются до загрузки данных: то, что
   * человеку не положено, не прячется в интерфейсе, а вовсе не читается
   * из базы и не уезжает в браузер.
   */
  const visible = { ...app, screens: visibleScreensFor(app, visitor) }
  const lazy = request?.screenId !== null && Boolean(request && app.moduleAccess && app.catalogScreenIds && (!visitor.authenticated || visitor.roleId === 'client'))
  const selected = request?.screenId === null ? [] : lazy ? [...new Set([request?.screenId ?? app.homeScreenId!, ...app.catalogScreenIds!])] : undefined
  if (selected?.some(id => !visible.screens.some(screen => screen.id === id))) return null
  const runtime = await loadRuntimeForApp(visible, visitor, selected)
  if (!runtime) return null
  const loadedTables = new Set((selected ?? []).flatMap(id => {
    const screen = visible.screens.find(screen => screen.id === id)
    return screen?.type === 'list' || screen?.type === 'tiles' ? [runtime.views[screen.source.viewId]?.tableId ?? ''] : screen?.type === 'detail' ? [screen.tableId] : []
  }))
  const loadedScreenIds = [...new Set([...(selected ?? []), ...visible.screens.filter(screen => screen.type === 'detail' && loadedTables.has(screen.tableId)).map(screen => screen.id)])]
  const [profile] = visitor.email && visitor.roleId === 'client' ? await db.select({ name: businessCustomers.name, phone: businessCustomers.phone }).from(businessCustomers)
    .where(and(eq(businessCustomers.workspaceId, app.workspaceId), eq(businessCustomers.email, visitor.email.trim().toLowerCase()))).limit(1) : []
  // Invitations and private staff grants are server inputs, never public runtime data.
  return { ...runtime, ...(profile ? { customerProfile: profile } : {}), ...(lazy ? { lazy: { revision: configFingerprint({ app, visitor }), loadedScreenIds } } : {}), app: { ...runtime.app, allowlist: [], ...(runtime.app.moduleAccess ? { moduleAccess: { grants: [] } } : {}) } }
}

/** Черновик для предпросмотра в конструкторе: тот же рантайм, неопубликованное определение. */
export async function loadDraftRuntime(appId: string): Promise<RuntimeApp | null> {
  const [record] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1)
  if (!record) return null
  const app = await definition(record, record.draft)
  if (!app) return null
  // Предпросмотр показывают редактору, поэтому правила видимости строк к нему
  // не применяются: иначе собственное приложение выглядело бы пустым.
  return loadRuntimeForApp({ ...app, rowAccessRules: [] }, asRole('manager'))
}


export async function loadRuntimeForApp(
  app: App,
  visitor: Visitor,
  dataScreenIds?: string[],
): Promise<RuntimeApp | null> {
  const scopedTables = db.select({ id: tables.id }).from(tables).where(eq(tables.workspaceId, app.workspaceId))
  const viewIds = referencedViews(app)

  const viewRows = viewIds.length
    ? await db.select().from(viewsTable).where(and(inArray(viewsTable.id, viewIds), inArray(viewsTable.tableId, scopedTables)))
    : []
  const views = Object.fromEntries(viewRows.map((view) => [view.id, normalizeView(view)]))

  const tableIds = referencedTables(app, views)
  if (tableIds.length === 0) {
    return { app, views, tables: {}, screens: {}, relatedTitles: {}, blocks: {} }
  }

  const [tableRows, fieldRows] = await Promise.all([
    db.select().from(tables).where(and(inArray(tables.id, tableIds), eq(tables.workspaceId, app.workspaceId))),
    db.select().from(fieldsTable).where(and(inArray(fieldsTable.tableId, tableIds), inArray(fieldsTable.tableId, scopedTables))),
  ])

  const fieldsByTable = new Map<string, Field[]>()
  for (const row of fieldRows) {
    const field = { ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) } as unknown as Field
    const list = fieldsByTable.get(row.tableId)
    if (list) list.push(field)
    else fieldsByTable.set(row.tableId, [field])
  }

  // Keep the full, permission-projected screen/field metadata for navigation.
  // Read business rows only for opened screens and their calculation/form dependencies.
  const dataScreens = dataScreenIds === undefined ? app.screens : app.screens.filter(screen => dataScreenIds.includes(screen.id))
  const rowTables = new Set(referencedTables({ ...app, screens: dataScreens.filter(screen => screen.type !== 'form' || screen.mode !== 'create') }, views))
  const dependencyTables = new Set(referencedTables({ ...app, screens: dataScreens }, views))
  const dataTables = new Set(rowTables)
  for (const id of dependencyTables) for (const field of fieldsByTable.get(id) ?? []) if (field.type === 'relation') dataTables.add(field.options.tableId)

  // Таблицы связей подгружаются даже если экранов у них нет: без них
  // не посчитать Lookup и Rollup и не показать название связанной строки.
  const relationTargets = new Set<string>()
  for (const list of fieldsByTable.values()) {
    for (const field of list) {
      if (field.type === 'relation') relationTargets.add(field.options.tableId)
    }
  }
  const allTableIds = [...new Set([...tableIds, ...relationTargets])]

  // У таблицы связи может не быть ни одного экрана, но её поля всё равно нужны:
  // без них не из чего построить заголовок связанной строки.
  const missingFieldTables = allTableIds.filter((id) => !fieldsByTable.has(id))
  if (missingFieldTables.length > 0) {
    const extra = await db.select().from(fieldsTable).where(and(inArray(fieldsTable.tableId, missingFieldTables), inArray(fieldsTable.tableId, scopedTables)))
    for (const row of extra) {
      const field = { ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) } as unknown as Field
      const list = fieldsByTable.get(row.tableId)
      if (list) list.push(field)
      else fieldsByTable.set(row.tableId, [field])
    }
  }

  const primaryByTable = new Map(
    (await db.select({ id: tables.id, primaryFieldId: tables.primaryFieldId }).from(tables).where(and(inArray(tables.id, allTableIds), eq(tables.workspaceId, app.workspaceId))))
      .map((table) => [table.id, table.primaryFieldId]),
  )

  const rowDataIds = dataScreenIds === undefined ? allTableIds : [...dataTables]
  const dataRows = rowDataIds.length ? await db
    .select()
    .from(rowsTable)
    .where(and(inArray(rowsTable.tableId, rowDataIds), inArray(rowsTable.tableId, scopedTables), isNull(rowsTable.deletedAt)))
    .orderBy(asc(rowsTable.position)) : []

  const projected = projectRuntime(app, visitor, views, tableRows, fieldsByTable, dataRows as RuntimeSourceRow[], primaryByTable)
  if (dataScreenIds !== undefined) {
    for (const table of Object.values(projected.tables)) if (!rowTables.has(table.id)) table.rows = []
    for (const screen of app.screens) if (!dataScreenIds.includes(screen.id)) delete projected.screens[screen.id]
  }
  return { ...projected, business: await loadBusinessProfile(app.workspaceId),
    businessApps: visitor.email ? (await listAccessibleApps(visitor.email, app.workspaceId)).map(item => ({ slug: item.slug, name: item.name })) : [] }
}

/**
 * Данные всего воркспейса для конструктора приложений.
 * Предпросмотр должен работать и для экрана, который редактор только что
 * направил на другую таблицу, поэтому грузим всё, а не только задействованное.
 */
export async function loadWorkspaceRuntime(workspaceId: string): Promise<{
  tables: Record<string, RuntimeTable>
  views: View[]
  relatedTitles: RelatedTitles
}> {
  const tableRows = await db.select().from(tables).where(eq(tables.workspaceId, workspaceId))
  if (tableRows.length === 0) return { tables: {}, views: [], relatedTitles: {} }

  const ids = tableRows.map((table) => table.id)
  const [fieldRows, viewRows, dataRows] = await Promise.all([
    db.select().from(fieldsTable).where(inArray(fieldsTable.tableId, ids)),
    db.select().from(viewsTable).where(inArray(viewsTable.tableId, ids)).orderBy(asc(viewsTable.position)),
    db
      .select()
      .from(rowsTable)
      .where(and(inArray(rowsTable.tableId, ids), isNull(rowsTable.deletedAt)))
      .orderBy(asc(rowsTable.position)),
  ])

  const fieldsByTable = new Map<string, Field[]>()
  for (const row of fieldRows) {
    const field = { ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) } as unknown as Field
    const list = fieldsByTable.get(row.tableId)
    if (list) list.push(field)
    else fieldsByTable.set(row.tableId, [field])
  }

  const rawByTable = new Map<string, Map<string, Record<string, unknown>>>()
  for (const row of dataRows) {
    let bucket = rawByTable.get(row.tableId)
    if (!bucket) {
      bucket = new Map()
      rawByTable.set(row.tableId, bucket)
    }
    bucket.set(row.id, systemRowData(row as typeof row & { data: Record<string, unknown> }, fieldsByTable.get(row.tableId) ?? []))
  }

  const related = relatedIndexFrom(rawByTable, fieldsByTable)

  const result: Record<string, RuntimeTable> = {}
  for (const table of tableRows) {
    const fields = (fieldsByTable.get(table.id) ?? []).sort(byPosition)
    const formulas = compileTableFormulas(fields)
    result[table.id] = {
      id: table.id,
      name: table.name,
      primaryFieldId: table.primaryFieldId,
      fields,
      rows: dataRows
        .filter((row) => row.tableId === table.id)
        .map((row) => ({
          id: row.id,
          version: row.version,
          position: row.position,
          data: computeDerivedRow(systemRowData(row as typeof row & { data: Record<string, unknown> }, fields), fields, related, formulas),
        })),
    }
  }

  const primaryByTable = new Map(tableRows.map((table) => [table.id, table.primaryFieldId]))

  return {
    tables: result,
    views: viewRows.map(normalizeView),
    relatedTitles: buildTitles(primaryByTable, fieldsByTable, rawByTable),
  }
}
