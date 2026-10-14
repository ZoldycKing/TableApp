import { db, rows, businessCustomers } from '@tableapp/db'
import { configFingerprint } from './app-config-history'
import type { App } from '@tableapp/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Visitor } from './app-roles'
import { canOpenScreen } from './app-roles'
import type { RuntimeApp } from './app-runtime'
import { loadBusinessProfile } from './business-profile'
import { listAccessibleApps } from './customer-apps'
import { loadPageRowData, loadRuntimePageMetadata, projectPageData } from './runtime-page-data'
import type { RuntimeSourceRow } from './runtime-project'
import { RowWriteError } from './row-mutations'

/** Only live external app visitors use bounded collections; editor previews and staff retain their full runtime. */
export const usesRuntimePages = (app: App, visitor: Visitor) => Boolean(app.moduleAccess && app.catalogScreenIds && (!visitor.authenticated || visitor.roleId === 'client'))

export async function runtimePageEnvelope(app: App, visitor: Visitor, runtime: RuntimeApp, loadedScreenIds: string[], loadedRows?: Record<string, string[]>) {
  const [profile] = visitor.email && visitor.roleId === 'client' ? await db.select({ name: businessCustomers.name, phone: businessCustomers.phone }).from(businessCustomers)
    .where(and(eq(businessCustomers.workspaceId, app.workspaceId), eq(businessCustomers.email, visitor.email.trim().toLowerCase()))).limit(1) : []
  return { ...runtime, business: await loadBusinessProfile(app.workspaceId), businessApps: visitor.email
    ? (await listAccessibleApps(visitor.email, app.workspaceId)).map(item => ({ slug: item.slug, name: item.name })) : [],
    ...(profile ? { customerProfile: profile } : {}),
    lazy: { revision: configFingerprint({ app, visitor }), loadedScreenIds, paged: true, ...(loadedRows ? { loadedRows } : {}) },
    app: { ...runtime.app, allowlist: [], ...(runtime.app.moduleAccess ? { moduleAccess: { grants: [] } } : {}) },
  } satisfies RuntimeApp
}

/** These IDs are deliberately absent from collection rowIds: a selected card does not expand a list. */
export async function readRuntimeSelectedRows(app: App, visitor: Visitor, screenId: string, rowIds: string[]): Promise<RuntimeApp> {
  const screen = app.screens.find(screen => screen.id === screenId)
  if (!screen || !canOpenScreen(screen, visitor) || !(['detail', 'list', 'tiles'].includes(screen.type) || screen.type === 'form' && screen.mode === 'edit')) throw new RowWriteError('denied', 'Карточка недоступна')
  return db.transaction(async tx => {
    const meta = await loadRuntimePageMetadata(app, visitor, tx), asOf = Date.now()
    const tableId = 'tableId' in screen ? screen.tableId : 'source' in screen ? meta.views[screen.source.viewId]?.tableId : null
    if (!tableId || !meta.tableRows.some(table => table.id === tableId)) throw new RowWriteError('denied', 'Карточка недоступна')
    const candidates = await tx.select().from(rows).where(and(eq(rows.tableId, tableId), inArray(rows.id, rowIds), isNull(rows.deletedAt)))
    const first = projectPageData(meta, await loadPageRowData(meta, candidates as RuntimeSourceRow[]), asOf)
    const allowed = new Set(first.tables[tableId]?.rows.map(row => row.id) ?? [])
    const runtime = projectPageData(meta, await loadPageRowData(meta, (candidates as RuntimeSourceRow[]).filter(row => allowed.has(row.id))), asOf)
    runtime.screens = {}
    runtime.blocks = {}
    return runtime
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

export function mergeRuntimeSlices(base: RuntimeApp, addition: RuntimeApp): RuntimeApp {
  const merged: RuntimeApp = { ...base, tables: { ...base.tables }, screens: { ...base.screens, ...addition.screens }, relatedTitles: { ...base.relatedTitles }, blocks: { ...base.blocks, ...addition.blocks } }
  for (const [id, table] of Object.entries(addition.tables)) {
    const prior = merged.tables[id]
    merged.tables[id] = { ...table, rows: [...new Map([...(prior?.rows ?? []), ...table.rows].map(row => [row.id, row])).values()] }
  }
  for (const [id, titles] of Object.entries(addition.relatedTitles)) merged.relatedTitles[id] = [...new Map([...(merged.relatedTitles[id] ?? []), ...titles].map(title => [title.id, title])).values()]
  return merged
}
