import type { RuntimeApp } from './app-runtime'

type Merge = { screenId?: string; append?: boolean; rowsOnly?: boolean; requestedRows?: readonly string[] }

/** Page membership stays separate from cached rows needed by details and the basket. */
export function mergeRuntimePageCache(current: RuntimeApp, incoming: RuntimeApp, merge: Merge = {}): RuntimeApp {
  const tables = { ...current.tables }
  let missingTable: string | undefined
  let missingRows = new Set<string>()
  for (const [id, table] of Object.entries(incoming.tables)) {
    const rows = new Map((tables[id]?.rows ?? []).map(row => [row.id, row]))
    for (const row of table.rows) rows.set(row.id, row)
    tables[id] = { ...table, rows: [...rows.values()] }
  }
  if (merge.rowsOnly && merge.screenId && merge.requestedRows) {
    const screen = incoming.app.screens.find(screen => screen.id === merge.screenId)
    const tableId = screen && ('tableId' in screen ? screen.tableId : 'source' in screen ? incoming.views[screen.source.viewId]?.tableId : undefined)
    if (tableId && tables[tableId]) {
      const returned = new Set((incoming.tables[tableId]?.rows ?? []).map(row => row.id))
      const missing = new Set(merge.requestedRows.filter(id => !returned.has(id)))
      missingTable = tableId; missingRows = missing
      tables[tableId] = { ...tables[tableId]!, rows: tables[tableId]!.rows.filter(row => !missing.has(row.id)) }
    }
  }
  const screens = { ...current.screens }
  if (!merge.rowsOnly) {
    for (const [id, collection] of Object.entries(incoming.screens)) {
      if (merge.screenId && id !== merge.screenId || !merge.screenId && screens[id]?.page) continue
      screens[id] = merge.append && id === merge.screenId
        ? { ...collection, rowIds: [...new Set([...(screens[id]?.rowIds ?? []), ...collection.rowIds])] }
        : collection
    }
  }
  const relatedTitles = { ...current.relatedTitles }
  for (const [id, titles] of Object.entries(incoming.relatedTitles)) {
    relatedTitles[id] = [...new Map([...(relatedTitles[id] ?? []), ...titles].map(item => [item.id, item])).values()]
  }
  if (missingTable && relatedTitles[missingTable]) relatedTitles[missingTable] = relatedTitles[missingTable]!.filter(title => !missingRows.has(title.id))
  const loadedRows = { ...current.lazy?.loadedRows }
  for (const [id, rows] of Object.entries(incoming.lazy?.loadedRows ?? {})) loadedRows[id] = [...new Set([...(loadedRows[id] ?? []), ...rows])]
  if (merge.rowsOnly && merge.screenId && merge.requestedRows) loadedRows[merge.screenId] = [...new Set([...(loadedRows[merge.screenId] ?? []), ...merge.requestedRows])]
  return { ...current, ...incoming, views: { ...current.views, ...incoming.views }, tables, screens, relatedTitles,
    blocks: { ...current.blocks, ...incoming.blocks },
    ...(current.lazy || incoming.lazy ? { lazy: { ...current.lazy!, ...incoming.lazy,
      loadedScreenIds: [...new Set([...(current.lazy?.loadedScreenIds ?? []), ...(incoming.lazy?.loadedScreenIds ?? [])])], loadedRows } } : {}) }
}
