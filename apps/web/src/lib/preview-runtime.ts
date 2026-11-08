import { customerWorkflows, fieldTimeZone, type App, type View } from '@tableapp/schema'
import type { BookingData } from './booking'
import { asRole, canOpenScreen, fieldPolicy, formFields, onlyReadable, rowReach, visibleScreensFor, type Visitor } from './app-roles'
import type { RuntimeTable, ScreenRows } from './app-runtime'
import { applyView } from './apply-view'
import { computeDashboards } from './dashboard-data'
import { canAccessRow, rulesFor } from './row-access'
import { buildTitles } from './runtime-project'
import type { RelatedTitles } from './queries'
import { readingVisitor } from './customer-read-access'

/** Private starters open with the broadest working perspective; no access is granted. */
export function defaultPreviewRole(app: App) {
  if (app.screens.some(screen => screen.access.public)) return 'anonymous'
  return app.roles.map(role => ({ id: role.id, count: visibleScreensFor(app, asRole(role.id)).length }))
    .sort((a, b) => b.count - a.count).find(role => role.count > 0)?.id ?? 'anonymous'
}

/** Owner-only availability calculation; never includes customer contacts or notes. */
export function bookingPreviewData(app: App, tables: Record<string, RuntimeTable>): BookingData | undefined {
  const config = app.booking
  if (!config) return undefined
  const of = (tableId: string, keys: string[]) => (tables[tableId]?.rows ?? []).map(row => ({ id: row.id, data: Object.fromEntries(keys.map(key => [key, row.data[key]])) }))
  const date = tables[config.tables.visits]?.fields.find(field => field.id === config.visit.start)
  return { services: of(config.tables.services, Object.values(config.service)),
    masters: of(config.tables.masters, [config.master.name, config.master.services, config.master.active]),
    schedule: of(config.tables.schedule, Object.values(config.schedule)),
    visits: of(config.tables.visits, [config.visit.master, config.visit.start, config.visit.minutes, config.visit.status]),
    timeZone: date ? fieldTimeZone(date) : 'Europe/Moscow' }
}

/** A preview can enter checkout as an allowed role without altering saved permissions. */
export function previewCheckout(app: App, screenId: string, sourceRowId: string | null) {
  const booking = app.booking?.formScreenId === screenId ? app.booking : undefined
  const customer = customerWorkflows(app).find(flow => flow.formScreenId === screenId)
  const screen = app.screens.find(screen => screen.id === screenId)
  if (!screen || !booking && !customer || screen.type !== 'form' || screen.mode !== 'create') return null
  const role = app.roles.find(role => role.isDefault && screen.access.roles.includes(role.id)) ?? app.roles.find(role => screen.access.roles.includes(role.id))
  if (!role) return null
  const selection = booking?.visit.service ?? customer?.catalog?.selectionFieldId
  return { screenId, roleId: role.id, values: selection && sourceRowId ? { [selection]: [sourceRowId] } : {} }
}

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
  const relationReadable: Record<string, ReadonlySet<string>> = {}
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
    const reading = readingVisitor(definition, tableId, visitor)
    const reach = rowReach(definition, tableId, viewsById, table.fields, reading)
    const allowed = previewVisitor === null ? table.rows : table.rows.filter(row => reading !== visitor
      ? reach.kind === 'gated' && reach.allows(row.data)
      : canAccessRow(rulesFor(definition, tableId, visitor), visitor.email ? { email: visitor.email, company: visitor.company, enrolled: visitor.enrolled } : null, row.data))
    forBlocks[tableId] = { ...table, rows: allowed }
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

    const policy = fieldPolicy(definition, tableId, reading, viewsById)
    if (policy.restricted) {
      readable[tableId] = policy.fields
      const selectable = new Set(policy.fields)
      for (const screen of definition.screens) if (screen.type === 'form' && screen.tableId === tableId) {
        for (const id of formFields(definition, screen, previewVisitor)) selectable.add(id)
      }
      relationReadable[tableId] = selectable
    }

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
      { app: definition, visitor: previewVisitor, views: viewsById, readable: relationReadable }),
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
