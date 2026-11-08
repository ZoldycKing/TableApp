import type { App } from '@tableapp/schema'
import type { RuntimeApp } from './app-runtime'
import { loadWorkspaceRuntime } from './app-runtime'
import { ANONYMOUS, asRole, visibleScreensFor } from './app-roles'
import { bookingPreviewData, previewRuntime } from './preview-runtime'

export const EDITOR_PREVIEW_LIMIT = 100
export type EditorPreview = { runtime: RuntimeApp; truncated: boolean; bookingData?: ReturnType<typeof bookingPreviewData> }

/** Totals are evaluated before sampling. This result is only for the workspace editor. */
export function boundedEditorPreview(runtime: RuntimeApp): { runtime: RuntimeApp; truncated: boolean } {
  const needed = new Map<string, Set<string>>()
  const add = (tableId: string, ids: string[]) => { const set = needed.get(tableId) ?? new Set<string>(); ids.forEach(id => set.add(id)); needed.set(tableId, set) }
  let truncated = false
  const screens = Object.fromEntries(Object.entries(runtime.screens).map(([id, value]) => {
    const definition = runtime.app.screens.find(screen => screen.id === id)
    const rowIds = value.rowIds.slice(0, EDITOR_PREVIEW_LIMIT)
    if (rowIds.length < value.rowIds.length) truncated = true
    if (definition?.type === 'list' || definition?.type === 'tiles') {
      const tableId = runtime.views[definition.source.viewId]?.tableId
      if (tableId) add(tableId, rowIds)
    }
    return [id, { rowIds }]
  }))
  for (const screen of runtime.app.screens) if (screen.type === 'dashboard') for (const block of screen.blocks) {
    if (!('source' in block)) continue
    const tableId = runtime.views[block.source.viewId]?.tableId, result = runtime.blocks[block.id]
    if (!tableId || !result) continue
    if (result.kind === 'list') add(tableId, result.items.map(item => item.rowId))
    if (result.kind === 'pipeline') add(tableId, result.columns.flatMap(column => column.cards.map(card => card.rowId)))
  }
  const tables = Object.fromEntries(Object.entries(runtime.tables).map(([id, table]) => {
    const wanted = needed.get(id)
    const rows = wanted?.size ? table.rows.filter(row => wanted.has(row.id)) : table.rows.slice(0, EDITOR_PREVIEW_LIMIT)
    if (rows.length < table.rows.length) truncated = true
    return [id, { ...table, rows }]
  }))
  const titleIds = new Map(Object.entries(tables).map(([id, table]) => [id, new Set(table.rows.map(row => row.id))]))
  for (const table of Object.values(tables)) for (const field of table.fields) if (field.type === 'relation') {
    const ids = titleIds.get(field.options.tableId) ?? new Set<string>()
    for (const row of table.rows) for (const id of Array.isArray(row.data[field.id]) ? row.data[field.id] as unknown[] : []) if (typeof id === 'string') ids.add(id)
    titleIds.set(field.options.tableId, ids)
  }
  const relatedTitles = Object.fromEntries(Object.entries(runtime.relatedTitles).map(([id, titles]) => [id, titles.filter(title => titleIds.get(id)?.has(title.id))]))
  return { runtime: { ...runtime, tables, screens, relatedTitles }, truncated }
}

export async function loadEditorPreview(workspaceId: string, app: App, role: string, email = '', company = ''): Promise<EditorPreview> {
  const source = await loadWorkspaceRuntime(workspaceId, { app })
  const visitor = role === 'editor' ? null : role === 'anonymous' ? ANONYMOUS : asRole(role, email.trim() || null, company.trim(), role === 'client')
  const definition = { ...app, screens: visitor ? visibleScreensFor(app, visitor) : app.screens }
  const preview = previewRuntime(definition, source.views, source.tables, source.relatedTitles, visitor)
  return { ...boundedEditorPreview(preview), bookingData: bookingPreviewData(app, source.tables) }
}
