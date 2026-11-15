import { describe, expect, it } from 'vitest'
import { type App, type Field, type Screen } from '@tableapp/schema'
import { buildRuntimeNavigation } from './runtime-navigation'
import { templateExample } from './templates/presentation'
import { connectSalesInventory } from './sales-inventory-connection'
import { connectProductionInventory } from './production-inventory-connection'
import { scopeModuleAccess } from './module-composition'
import { setModuleGrant } from './module-access'
import { ANONYMOUS, visibleScreensFor, visitorFor } from './app-roles'

const manager = 'manager@example.invalid', foreman = 'foreman@example.invalid'
const isCollection = (screen: Screen) => screen.type === 'list' || screen.type === 'tiles'
function business() {
  const sales = templateExample('zakazy')
  sales.app.allowlist = [{ email: manager, roleId: 'manager', company: '' }]
  const fields = new Map<string, Field>(sales.fields.map(field => [field.id, field])), views = new Map<string, { tableId: string }>(sales.views.map(view => [view.id, view]))
  const stock = connectSalesInventory(sales.app, manager, fields, views)
  for (const field of stock.fields) fields.set(field.id, field as Field)
  for (const view of stock.views) views.set(view.id, view)
  const production = connectProductionInventory(stock.app, manager, fields, views)
  for (const view of production.views) views.set(view.id, view)
  const app = production.app, module = app.modules!.find(module => module.kind === 'production')!
  app.moduleAccess = setModuleGrant(app.moduleAccess!, foreman, module.id, module.roles!.foreman!)
  return { app, views: Object.fromEntries(views) }
}
function projected(app: App, email: string | null) {
  const visitor = email ? visitorFor(app, email) : ANONYMOUS
  return { ...app, screens: visibleScreensFor(app, visitor), allowlist: [], moduleAccess: { grants: [] } }
}

describe('permission-projected work navigation', () => {
  it('groups the shared catalogue by exact module ownership and gives stock/material journals distinct labels', () => {
    const fixture = business(), app = projected(fixture.app, manager), before = JSON.stringify(app)
    app.modules = [...app.modules!].reverse()
    const model = buildRuntimeNavigation(app, fixture.views)
    expect(model.mode).toBe('work')
    expect(model.groups.map(group => group.label)).toEqual(['Продажи', 'Склад', 'Производство'])
    const sales = model.groups[0]!, stock = model.groups[1]!, production = model.groups[2]!
    const catalog = app.screens.find(screen => isCollection(screen) && 'source' in screen && screen.source.viewId === app.customer!.catalog!.viewId)!
    expect(sales.screens.map(screen => screen.id)).toContain(catalog.id)
    expect(stock.screens.map(screen => screen.id)).not.toContain(catalog.id)
    expect(stock.screens.some(screen => screen.name === 'Остатки')).toBe(true)
    expect(stock.screens.some(screen => screen.name === 'История склада')).toBe(true)
    expect(production.screens.some(screen => screen.name === 'Движения материалов')).toBe(true)
    for (const [group, title] of [[sales, 'Сводка продаж'], [stock, 'Сводка склада'], [production, 'Сводка производства']] as const) {
      for (const dashboard of group.screens.filter(screen => screen.type === 'dashboard')) {
        expect(dashboard.name).toBe(title)
        if (dashboard.tab) expect(dashboard.tab.icon).toBe('chart')
      }
    }
    expect(JSON.stringify({ ...app, modules: [...app.modules!].reverse() })).toBe(before)
  })

  it('preserves guest/client navigation even though their public catalogue names private worker roles', () => {
    const fixture = business()
    for (const email of [null, 'client@example.invalid']) {
      const app = projected(fixture.app, email), model = buildRuntimeNavigation(app, fixture.views)
      expect(model.mode).toBe('client')
      expect(model.groups).toEqual([])
      expect(model.actionsByScreen).toEqual({})
      expect(model.tabs).toEqual(app.screens.filter(screen => screen.tab))
    }
  })

  it('keeps the production-only operator within visible destinations and moves the run form into its accessible journal', () => {
    const fixture = business(), app = projected(fixture.app, foreman), model = buildRuntimeNavigation(app, fixture.views)
    const runForm = app.production!.formScreenId!, module = app.modules!.find(module => module.kind === 'production')!
    const journal = app.screens.find(screen => module.screenIds!.includes(screen.id) && isCollection(screen) && 'source' in screen && fixture.views[screen.source.viewId]?.tableId === app.production!.tables.production)!
    expect(model.work).toBe(true)
    expect(model.tabs.map(screen => screen.id)).not.toContain(runForm)
    expect(model.actionsByScreen[journal.id]!.map(screen => screen.id)).toContain(runForm)
    expect(model.activeParentByScreen[runForm]).toBe(journal.id)
    expect(model.groups.flatMap(group => group.screens).every(screen => app.screens.some(visible => visible.id === screen.id))).toBe(true)
    expect(Object.values(model.actionsByScreen).flat().every(screen => app.screens.some(visible => visible.id === screen.id))).toBe(true)
    expect(model.groups.flatMap(group => group.screens).some(screen => screen.type === 'dashboard' && module.screenIds!.includes(screen.id))).toBe(false)
  })

  it('retains a create-form tab when its journal is inaccessible so the operation remains reachable', () => {
    const fixture = business(), app = projected(fixture.app, foreman), runForm = app.production!.formScreenId!
    app.screens = app.screens.filter(screen => !(isCollection(screen) && 'source' in screen && fixture.views[screen.source.viewId]?.tableId === app.production!.tables.production))
    const model = buildRuntimeNavigation(app, fixture.views)
    expect(model.tabs.map(screen => screen.id)).toContain(runForm)
    expect(model.groups.flatMap(group => group.screens).map(screen => screen.id)).toContain(runForm)
    expect(Object.values(model.actionsByScreen).flat().map(screen => screen.id)).not.toContain(runForm)
  })

  it('does not promote hidden related lists, dashboards or create forms into sidebar destinations or header actions', () => {
    const fixture = business(), app = projected(fixture.app, manager), visibleTabs = new Set(app.screens.filter(screen => screen.tab).map(screen => screen.id))
    const hidden = app.screens.filter(screen => !screen.tab), model = buildRuntimeNavigation(app, fixture.views)
    expect(hidden.some(screen => screen.type === 'form' && screen.mode === 'create')).toBe(true)
    expect(hidden.some(screen => isCollection(screen))).toBe(true)
    expect(model.groups.flatMap(group => group.screens).every(screen => visibleTabs.has(screen.id))).toBe(true)
    expect(Object.values(model.actionsByScreen).flat().every(screen => visibleTabs.has(screen.id))).toBe(true)
    for (const screen of hidden) {
      expect(model.groups.flatMap(group => group.screens).map(screen => screen.id)).not.toContain(screen.id)
      expect(Object.values(model.actionsByScreen).flat().map(screen => screen.id)).not.toContain(screen.id)
    }
  })

  it('requires a tabbed parent and labels the default stock item action as adding a product', () => {
    const fixture = business(), app = projected(fixture.app, manager), inventory = app.modules!.find(module => module.kind === 'inventory')!
    const parent = app.screens.find(screen => inventory.screenIds!.includes(screen.id) && isCollection(screen) && 'source' in screen && fixture.views[screen.source.viewId]?.tableId === app.inventory!.tables.items)!
    const form = app.screens.find(screen => inventory.screenIds!.includes(screen.id) && screen.type === 'form' && screen.mode === 'create' && screen.tableId === app.inventory!.tables.items)!
    form.tab = { label: 'Добавить', icon: 'plus' }; form.name = 'Добавить'
    const model = buildRuntimeNavigation(app, fixture.views)
    expect(model.actionsByScreen[parent.id]!.find(screen => screen.id === form.id)!.name).toBe('Добавить товар')
    expect(model.tabs.map(screen => screen.id)).not.toContain(form.id)
    parent.tab = null
    const orphaned = buildRuntimeNavigation(app, fixture.views)
    expect(orphaned.tabs.map(screen => screen.id)).toContain(form.id)
    expect(Object.values(orphaned.actionsByScreen).flat().map(screen => screen.id)).not.toContain(form.id)
  })

  it('retains custom stock/dashboard names and keeps detail parents in their exact module', () => {
    const fixture = business(), app = projected(fixture.app, manager), inventory = app.modules!.find(module => module.kind === 'inventory')!
    const stock = app.screens.find(screen => inventory.screenIds!.includes(screen.id) && isCollection(screen) && 'source' in screen && fixture.views[screen.source.viewId]?.tableId === app.inventory!.tables.items)!
    stock.name = 'Запасы магазина'
    const dashboard = app.screens.find(screen => inventory.screenIds!.includes(screen.id) && screen.type === 'dashboard')!
    dashboard.name = 'Контроль запасов'
    const model = buildRuntimeNavigation(app, fixture.views), group = model.groups.find(group => group.kind === 'inventory')!
    expect(group.screens.find(screen => screen.id === stock.id)!.name).toBe('Запасы магазина')
    expect(group.screens.find(screen => screen.id === dashboard.id)!.name).toBe('Контроль запасов')
    if (stock.type !== 'list' && stock.type !== 'tiles') throw new Error('Missing collection')
    expect(model.activeParentByScreen[stock.onTapScreenId!]).toBe(stock.id)
    const catalogDetail = app.customer!.catalog!.detailScreenId
    expect(model.activeParentByScreen[catalogDetail]).not.toBe(stock.id)
  })

  it('reports a catalogue-to-stock detail mismatch instead of silently changing destinations', () => {
    const fixture = business(), app = projected(fixture.app, manager), catalog = app.screens.find(screen => isCollection(screen) && 'source' in screen && screen.source.viewId === app.customer!.catalog!.viewId)!
    if (catalog.type !== 'list' && catalog.type !== 'tiles') throw new Error('Missing catalogue')
    const inventory = app.modules!.find(module => module.kind === 'inventory')!, stockCard = app.screens.find(screen => screen.type === 'detail' && screen.tableId === app.inventory!.tables.items && inventory.screenIds!.includes(screen.id))!
    catalog.onTapScreenId = stockCard.id
    const model = buildRuntimeNavigation(app, fixture.views)
    expect(model.issues).toContainEqual({ code: 'catalog-detail-mismatch', screenId: catalog.id, expectedScreenId: app.customer!.catalog!.detailScreenId, actualScreenId: stockCard.id })
    const displayed = model.groups.find(group => group.kind === 'sales')!.screens.find(screen => screen.id === catalog.id)!
    expect(displayed.type === 'list' || displayed.type === 'tiles' ? displayed.onTapScreenId : null).toBe(stockCard.id)
  })

  it('keeps explicit booking setup tabs as settings and does not synthesize client checkout actions', () => {
    const salon = templateExample('salon')
    salon.app.allowlist = [{ email: manager, roleId: 'manager', company: '' }]
    const views = Object.fromEntries(salon.views.map(view => [view.id, view])), app = projected(scopeModuleAccess(salon.app, new Map(salon.views.map(view => [view.id, view]))), manager)
    const model = buildRuntimeNavigation(app, views), setupId = app.booking!.setupScreenId!
    const setup = app.screens.find(screen => screen.id === setupId)!
    if (setup.tab) expect(model.tabs.map(screen => screen.id)).toContain(setupId)
    expect(Object.values(model.actionsByScreen).flat().map(screen => screen.id)).not.toContain(setupId)
    expect(Object.values(model.actionsByScreen).flat().map(screen => screen.id)).not.toContain(app.booking!.formScreenId)
  })
})
