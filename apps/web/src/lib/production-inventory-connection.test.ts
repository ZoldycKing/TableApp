import { appSchema, compatibleModuleKinds, type App, type Field, type View } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { checkAppReferences } from './app-references'
import { asRole, canOpenScreen, permits, visibleScreensFor, visitorFor } from './app-roles'
import { moduleContract } from './app-modules'
import { composeModules } from './module-composition'
import { connectProductionInventory } from './production-inventory-connection'
import { connectSalesInventory } from './sales-inventory-connection'
import { projectRuntime } from './runtime-project'
import { templateExample } from './templates/presentation'

function warehouse() {
  const sales = templateExample('zakazy')
  sales.app.allowlist = [{ email: 'sales@example.invalid', roleId: 'staff', company: '' }, { email: 'owner@example.invalid', roleId: 'manager', company: '' }]
  const stock = connectSalesInventory(sales.app, 'owner@example.invalid', new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))
  return { app: stock.app, tableRows: [...sales.built.tables, ...stock.tables], tableIds: new Set([...sales.built.tables, ...stock.tables].map(table => table.id)),
    fields: new Map([...sales.fields, ...stock.fields as Field[]].map(field => [field.id, field])),
    views: new Map([...sales.views, ...stock.views].map(view => [view.id, view])) }
}

function connected() {
  const base = warehouse(), result = connectProductionInventory(base.app, 'owner@example.invalid', base.fields, base.views)
  const catalog = { tableIds: new Set([...base.tableIds, ...result.tables.map(table => table.id)]),
    fields: new Map([...base.fields, ...result.fields.map(field => [field.id, field as Field] as const)]),
    views: new Map([...base.views, ...result.views.map(view => [view.id, view] as const)]) }
  return { base, result, catalog }
}

describe('production connection to the sales warehouse', () => {
  it('creates four empty private resources and reuses the exact shared product binding without changing existing accounting', () => {
    const base = warehouse(), before = JSON.stringify(base.app), fieldBefore = JSON.stringify([...base.fields]), viewBefore = JSON.stringify([...base.views])
    const result = connectProductionInventory(base.app, 'owner@example.invalid', base.fields, base.views)
    const production = result.app.production!, inventory = result.app.inventory!
    expect(result.tables).toHaveLength(4)
    expect(new Set(result.tables.map(table => table.id))).toEqual(new Set(Object.values(production.tables)))
    expect(production.stock?.itemsTableId).toBe(inventory.tables.items)
    const materialStock = result.fields.find(field => field.id === production.stock?.materialStockFieldId)!
    expect(materialStock.tableId).toBe(production.tables.materials); expect(materialStock.type).toBe('formula')
    expect(result.app.inventory).toEqual(base.app.inventory); expect(result.app.customer).toEqual(base.app.customer)
    expect(result.app.catalogScreenIds).toEqual(base.app.catalogScreenIds); expect(result.app.homeScreenId).toBe(base.app.homeScreenId)
    expect(result.fields.some(field => field.tableId === inventory.tables.items)).toBe(false)
    for (const id of [production.run.product, production.norm.product]) {
      const field = result.fields.find(field => field.id === id)!
      expect(field.type).toBe('relation'); expect(field.options.tableId).toBe(inventory.tables.items)
    }
    const productScreens = result.app.screens.filter(screen => 'tableId' in screen ? screen.tableId === inventory.tables.items && result.app.modules!.find(module => module.kind === 'production')!.screenIds!.includes(screen.id)
      : 'source' in screen && result.views.some(view => view.id === screen.source.viewId && view.tableId === inventory.tables.items))
    expect(productScreens).toHaveLength(2)
    for (const screen of productScreens) {
      expect(screen.access.public).toBe(false)
      if (screen.type === 'detail') expect(screen.components.map(component => 'source' in component && component.source.kind === 'field' ? component.source.fieldId : '')).toEqual([inventory.item.name])
      if (screen.type === 'list') expect(screen.titleFieldId).toBe(inventory.item.name)
    }
    expect(JSON.stringify(base.app)).toBe(before); expect(JSON.stringify([...base.fields])).toBe(fieldBefore); expect(JSON.stringify([...base.views])).toBe(viewBefore)
  })

  it('gives only the owner the new director role, preserves assignments and keeps production work separate from sales, warehouse and customers', () => {
    const { base, result, catalog } = connected(), app = result.app, production = app.production!, module = app.modules!.find(module => module.kind === 'production')!
    expect(checkAppReferences(app, catalog)).toBeNull()
    expect(module.dependsOn).toEqual([app.modules!.find(module => module.kind === 'inventory')!.id])
    expect(app.moduleAccess!.grants.filter(grant => grant.moduleId !== module.id)).toEqual(base.app.moduleAccess!.grants)
    expect(app.moduleAccess!.grants.filter(grant => grant.moduleId === module.id)).toEqual([{ email: 'owner@example.invalid', moduleId: module.id, roleId: module.roles!.director! }])
    const owner = visitorFor(app, 'owner@example.invalid'), foreman = asRole(module.roles!.foreman!), sales = visitorFor(app, 'sales@example.invalid'), client = visitorFor(app, 'client@example.invalid')
    expect(permits(app, production.tables.production, 'create', owner)).toBe(true)
    expect(permits(app, production.tables.production, 'create', foreman)).toBe(true)
    expect(permits(app, production.tables.norms, 'create', foreman)).toBe(false)
    expect(permits(app, app.inventory!.tables.movements, 'create', foreman)).toBe(false)
    expect(app.roles.find(role => role.id === module.roles!.foreman)?.isDefault).toBe(false)
    for (const visitor of [sales, client, asRole(app.modules!.find(module => module.kind === 'inventory')!.roles!.manager!)]) {
      expect(app.screens.filter(screen => module.screenIds!.includes(screen.id) && canOpenScreen(screen, visitor))).toEqual([])
      expect(permits(app, production.tables.production, 'create', visitor)).toBe(false)
    }
    expect(moduleContract(app, module)?.writeTables.includes(app.inventory!.tables.items)).toBe(false)
  })

  it('rejects incomplete prerequisite modules, repeat installation and an invalid explicit title binding', () => {
    const sales = templateExample('zakazy')
    expect(() => connectProductionInventory(sales.app, 'owner@example.invalid', new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))).toThrow('Сначала подключите продажи и склад')
    const { base, result, catalog } = connected()
    expect(() => connectProductionInventory(result.app, 'owner@example.invalid', catalog.fields, catalog.views)).toThrow('производство должно быть новым')
    const missingTitle = new Map(base.fields); missingTitle.delete(base.app.inventory!.item.name)
    expect(() => connectProductionInventory(base.app, 'owner@example.invalid', missingTitle, base.views)).toThrow('явную привязку названия')
    expect(compatibleModuleKinds(['sales', 'production'])).toBe(false)
    expect(compatibleModuleKinds(['inventory', 'production'])).toBe(false)
    expect(compatibleModuleKinds(['sales', 'inventory', 'production'])).toBe(true)
  })

  it('projects product titles for a foreman relation input without sales, warehouse or customer fields', () => {
    const { base, result, catalog } = connected(), app = result.app, inventory = app.inventory!
    const module = app.modules!.find(module => module.kind === 'production')!, foreman = asRole(module.roles!.foreman!, 'foreman@example.invalid')
    const visible = { ...app, screens: visibleScreensFor(app, foreman) }, tables = [...base.tableRows, ...result.tables]
    const fields = [...catalog.fields.values()], byTable = new Map(tables.map(table => [table.id, fields.filter(field => field.tableId === table.id)]))
    const now = new Date('2026-10-14T00:00:00Z'), price = app.customer!.cart!.priceFieldId
    const runtime = projectRuntime(visible, foreman, Object.fromEntries(catalog.views) as Record<string, View>, tables, byTable,
      [{ id: 'product-one', tableId: inventory.tables.items, position: 'a', version: 1, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null,
        data: { [inventory.item.name]: 'Изделие цеха', [price]: 2500, [inventory.item.opening]: 23 } }],
      new Map(tables.map(table => [table.id, table.primaryFieldId])))
    const products = runtime.tables[inventory.tables.items]!
    expect(products.fields.map(field => field.id)).toEqual([inventory.item.name])
    expect(products.rows[0]?.data).toEqual({ [inventory.item.name]: 'Изделие цеха' })
    expect(runtime.relatedTitles[inventory.tables.items]).toEqual([{ id: 'product-one', title: 'Изделие цеха' }])
    expect(runtime.tables[app.production!.tables.materials]!.fields.some(field => field.id === app.production!.stock!.materialStockFieldId)).toBe(true)
    expect(runtime.tables[app.customer!.tableId]?.rows ?? []).toEqual([])
    expect(runtime.app.screens.some(screen => screen.id === app.customer!.formScreenId)).toBe(false)
  })

  it('rejects a second product directory, lost dependencies and exposing production screens to customers', () => {
    const { result, catalog } = connected()
    const mutations = [
      (app: App) => { app.production!.stock = null },
      (app: App) => { app.production!.stock!.itemsTableId = app.production!.tables.materials },
      (app: App) => { app.production!.stock!.materialStockFieldId = app.inventory!.item.stock },
      (app: App) => { app.modules!.find(module => module.kind === 'production')!.dependsOn = [] },
      (app: App) => { app.screens.find(screen => screen.id === app.production!.formScreenId)!.access.roles.push('client') },
      (app: App) => { app.screens.find(screen => screen.id === app.production!.formScreenId)!.access.public = true },
    ]
    for (const mutation of mutations) {
      const app = structuredClone(result.app); mutation(app)
      expect(Boolean(checkAppReferences(app, catalog))).toBe(true)
    }
    const wrongProduct = new Map(catalog.fields), field = wrongProduct.get(result.app.production!.run.product)!
    if (field.type === 'relation') wrongProduct.set(field.id, { ...field, options: { ...field.options, tableId: result.app.production!.tables.materials } })
    expect(Boolean(checkAppReferences(result.app, { ...catalog, fields: wrongProduct }))).toBe(true)
    const wrongStock = new Map(catalog.fields), stock = wrongStock.get(result.app.production!.stock!.materialStockFieldId)!
    if (stock.type === 'formula') wrongStock.set(stock.id, { ...stock, options: { ...stock.options, expression: '0' } })
    expect(Boolean(checkAppReferences(result.app, { ...catalog, fields: wrongStock }))).toBe(true)
  })

  it('keeps old standalone production definitions valid and requires the connector for composition', () => {
    const example = templateExample('proizvodstvo'), old = structuredClone(example.app) as unknown as { production: { stock?: unknown } }
    delete old.production.stock
    const parsed = appSchema.parse(old)
    expect(parsed.production!.stock).toBeNull()
    expect(checkAppReferences(parsed, { tableIds: new Set(example.built.tables.map(table => table.id)), fields: new Map(example.fields.map(field => [field.id, field])), views: new Map(example.views.map(view => [view.id, view])) })).toBeNull()
    const base = warehouse(), views = new Map([...base.views, ...example.views.map(view => [view.id, view] as const)])
    expect(() => composeModules(base.app, parsed, views)).toThrow('Производство подключается к общему каталогу')
  })
})
