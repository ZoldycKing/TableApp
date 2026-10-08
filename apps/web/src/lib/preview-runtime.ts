import type { App, View } from '@tableapp/schema'
import { asRole, canOpenScreen, fieldPolicy, onlyReadable, rowReach, type Visitor } from './app-roles'
import type { RuntimeTable, ScreenRows } from './app-runtime'
import { applyView } from './apply-view'
import { computeDashboards } from './dashboard-data'
import { canAccessRow, rulesFor } from './row-access'
import { buildTitles } from './runtime-project'
import type { RelatedTitles } from './queries'

/** The editor uses the same row rules and identity as the real application. Null means the author. */
export function previewRuntime(app: App, views: View[], runtimeTables: Record<string, RuntimeTable>,
  relatedTitles: RelatedTitles, previewVisitor: Visitor | null) {
  const viewsById = Object.fromEntries(views.map((view) => [view.id, view]))
  const definition = app

  /*
   * Предпросмотр обязан отбирать так же, как сервер, — иначе он не
   * предпросмотр, а второе мнение. Поэтому строки здесь проходят тот же
   * путь: публичная выборка, затем отсечение полей. Ничего «упрощённого
   * для конструктора» тут быть не должно: владелец по этой картинке решает,
   * что можно выкладывать в интернет.
   */
  const readable: Record<string, ReadonlySet<string>> = {}
  const tables: Record<string, RuntimeTable> = {}
  const screens: Record<string, ScreenRows> = {}
  const forBlocks: Record<string, RuntimeTable> = {}

  for (const [tableId, table] of Object.entries(runtimeTables)) {
    /*
     * Отбор списков считаем и для взгляда автора: сервер его тоже считает,
     * и без этого предпросмотр показал бы пустые списки — строки-то есть,
     * а перечня идентификаторов для экрана нет.
     */
    const visitor = previewVisitor ?? asRole(definition.roles[0]?.id ?? 'client')
    const allowed = previewVisitor === null ? table.rows : table.rows.filter(row => canAccessRow(
      rulesFor(definition, tableId, visitor), visitor.email ? { email: visitor.email, company: visitor.company } : null, row.data))
    forBlocks[tableId] = { ...table, rows: allowed }
    const reach = rowReach(definition, tableId, viewsById, table.fields, visitor)
    const reachable =
      previewVisitor === null || reach.kind !== 'gated'
        ? allowed
        : allowed.filter((row) => reach.allows(row.data))

    const onScreens = new Set<string>()
    for (const screen of definition.screens) {
      if (screen.type !== 'list' && screen.type !== 'tiles') continue
      if (previewVisitor !== null && !canOpenScreen(screen, previewVisitor)) continue
      const view = viewsById[screen.source.viewId]
      if (!view || view.tableId !== tableId) continue

      const ids = applyView(reachable, table.fields, view.config).rows.map((row: { id: string }) => row.id)
      screens[screen.id] = { rowIds: ids }
      for (const id of ids) onScreens.add(id)
    }

    if (previewVisitor === null) {
      tables[tableId] = table
      continue
    }

    const policy = fieldPolicy(definition, tableId, previewVisitor, viewsById)
    if (policy.restricted) readable[tableId] = policy.fields

    const shipped =
      reach.kind === 'none'
        ? []
        : reach.kind === 'gated'
          ? reachable.filter((row) => onScreens.has(row.id))
          : reachable

    tables[tableId] = {
      ...table,
      rows: shipped.map((row) => ({ ...row, data: onlyReadable(row.data, policy) })),
    }
  }

  return {
    app: definition,
    views: viewsById,
    tables,
    screens,
    relatedTitles: previewVisitor === null ? relatedTitles : buildTitles(
      new Map(Object.values(runtimeTables).map(table => [table.id, table.primaryFieldId])),
      new Map(Object.values(runtimeTables).map(table => [table.id, table.fields])),
      new Map(Object.values(runtimeTables).map(table => [table.id, new Map(table.rows.map(row => [row.id, row.data]))])),
      { app: definition, visitor: previewVisitor, views: viewsById, readable }),
    blocks: computeDashboards(definition, {
      views: viewsById,
      // Числа считаются по неурезанным строкам: отбор полей ограничивает
      // то, что уходит наружу, а не то, что сервер вправе посчитать.
      tables: forBlocks,
      readable,
      role: previewVisitor?.roleId ?? undefined,
    }),
  }
}
