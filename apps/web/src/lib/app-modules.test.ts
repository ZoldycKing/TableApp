import { describe, expect, it } from 'vitest'
import { appSchema, appModuleSchema, type App, type AppModule, type Field } from '@tableapp/schema'
import { appModules, checkAppModules, checkModuleModelTransition, legacyAppModules, moduleContract } from './app-modules'
import { checkAppReferences } from './app-references'
import { templateExample } from './templates/presentation'
import { TEMPLATES } from './templates/catalog'

function fixture(id: string) {
  const example = templateExample(id)
  const catalog = { tableIds: new Set(example.built.tables.map(table => table.id)), fields: new Map(example.fields.map(field => [field.id, field])), views: new Map(example.views.map(view => [view.id, view])) }
  return { app: example.app, catalog, example }
}

describe('module contracts and legacy compatibility', () => {
  it.each(TEMPLATES.map(template => template.id))('describes %s without a second copy of settings or a change of permissions', id => {
    const { app, catalog } = fixture(id)
    if (id === 'proekty' || id === 'podderzhka' || id === 'prokat') {
      expect(app.modules ?? []).toHaveLength(0)
      expect(checkAppReferences(app, catalog)).toBeNull()
      return
    }
    expect(app.modules?.length).toBeGreaterThan(0)
    expect(checkAppReferences(app, catalog)).toBeNull()
    const before = JSON.stringify(app)
    for (const module of appModules(app)) expect(moduleContract(app, module)).not.toBeNull()
    expect(JSON.stringify(app)).toBe(before)
    const legacy = structuredClone(app); delete legacy.modules
    const loaded = appSchema.parse(legacy)
    expect(loaded.modules).toBeUndefined()
    expect(appModules(loaded)).toEqual(legacyAppModules(loaded))
    expect(checkAppReferences(loaded, catalog)).toBeNull()
    expect(loaded.roles).toEqual(app.roles); expect(loaded.rowAccessRules).toEqual(app.rowAccessRules); expect(loaded.screens).toEqual(app.screens)
  })
  it('preserves the identity of a module after a rename, serialization, and an adapter retry', () => {
    const { app, catalog } = fixture('salon')
    app.name = 'Новый бренд'; app.screens.forEach(screen => { screen.name = 'Другой заголовок' })
    for (const field of catalog.fields.values()) field.name = `Новое имя ${field.id}`
    expect(checkAppReferences(app, catalog)).toBeNull()
    expect(appModules(appSchema.parse(JSON.parse(JSON.stringify(app))))).toEqual(app.modules)
    const legacy = { ...app, modules: undefined }
    expect(legacyAppModules(legacy)).toEqual(legacyAppModules(legacy))
    expect(legacyAppModules(legacy)[0]!.id).toBe(app.modules![0]!.id)
  })
  it('rejects unknown manifest properties, empty bindings, and malformed versions', () => {
    const module = fixture('salon').app.modules![0]!
    expect(appModuleSchema.safeParse({ ...module, workspaceId: 'foreign' }).success).toBe(false)
    expect(appModuleSchema.safeParse({ ...module, source: { type: 'customer', tableId: '' } }).success).toBe(false)
    expect(appModuleSchema.safeParse({ ...module, version: 0 }).success).toBe(false)
    expect(appModuleSchema.safeParse({ ...module, version: 1.5 }).success).toBe(false)
  })
  it('fails closed on an unknown module version, a lost source, or incomplete declarations', () => {
    for (const change of [
      (app: App) => { app.modules![0]!.version = 2 },
      (app: App) => { app.booking = undefined },
      (app: App) => { app.modules = [] },
      (app: App) => { app.modules!.push(structuredClone(app.modules![0]!)) },
      (app: App) => { app.modules!.push({ ...app.modules![0]!, id: 'other' }) },
    ]) {
      const { app, catalog } = fixture('salon'); change(app)
      expect(checkAppModules(app, catalog)).not.toBeNull()
    }
  })
  it('rejects foreign resources and changed field types or relation targets', () => {
    for (const change of [
      (app: App, fields: Map<string, Field>) => { app.booking!.tables.services = 'foreign' },
      (app: App, fields: Map<string, Field>) => { fields.delete(app.booking!.service.minutes) },
      (app: App) => { app.booking!.service.minutes = '' },
      (app: App, fields: Map<string, Field>) => { const id = app.booking!.service.minutes; fields.set(id, { ...fields.get(id)!, type: 'text' } as Field) },
      (app: App, fields: Map<string, Field>) => { const relation = fields.get(app.booking!.visit.service)!; if (relation.type === 'relation') relation.options.tableId = app.booking!.tables.masters },
    ]) {
      const { app, catalog } = fixture('salon'); change(app, catalog.fields)
      expect(checkAppModules(app, catalog)).not.toBeNull()
    }
  })
  it('requires production and its norms to use the same owned product catalog', () => {
    const { app, catalog } = fixture('proizvodstvo')
    const field = catalog.fields.get(app.production!.norm.product)!
    if (field.type === 'relation') field.options.tableId = app.production!.tables.materials
    expect(checkAppModules(app, catalog)).toMatch(/один каталог/)
  })
  it('keeps production summary fields outside its write contract', () => {
    const { app, catalog } = fixture('proizvodstvo')
    const module = app.modules!.find(item => item.kind === 'production')!
    const current = moduleContract(app, module)
    const legacy = structuredClone(app)
    delete legacy.production!.material.stock
    delete legacy.production!.material.min
    expect(moduleContract(legacy, module)).toEqual(current)
    expect(checkAppModules(app, catalog)).toBeNull()
    expect(checkAppReferences(app, catalog)).toBeNull()
  })
  it('allows legacy reads and explicit adoption but rejects dropping a saved manifest', () => {
    const { app } = fixture('salon'), legacy = { ...app, modules: undefined }
    expect(checkModuleModelTransition(legacy, legacy)).toBeNull()
    expect(checkModuleModelTransition(app, legacy)).toBeNull()
    expect(checkModuleModelTransition(legacy, app, null)).toMatch(/список модулей/)
    expect(checkModuleModelTransition(legacy, legacy, app)).toMatch(/список модулей/)
  })
  it('does not guess a compatible table from its name or move bindings to another business', () => {
    const first = fixture('zakazy'), second = fixture('zakazy')
    expect(checkAppModules(first.app, second.catalog)).not.toBeNull()
    const module = first.app.modules![0]!
    module.source = { type: 'customer', tableId: second.app.customer!.tableId }
    expect(checkAppModules(first.app, first.catalog)).not.toBeNull()
  })
  it('requires support to depend on the existing own-order scenario and rejects missing or cyclic dependencies', () => {
    const { app, catalog } = fixture('portal'), modules = app.modules!
    const support = modules.find(module => module.kind === 'support')!, parent = modules.find(module => module.kind === 'requests')!
    expect(support.dependsOn).toEqual([parent.id]); expect(checkAppModules(app, catalog)).toBeNull()
    support.dependsOn = []; expect(checkAppModules(app, catalog)).toMatch(/требует/)
    support.dependsOn = ['missing']; expect(checkAppModules(app, catalog)).toMatch(/зависимость/)
    support.dependsOn = [parent.id]; parent.dependsOn = [support.id]
    expect(checkAppModules(app, catalog)).toMatch(/цикл/)
  })
  it('rejects a specialized scenario relabelled as a generic form', () => {
    const { app, catalog } = fixture('zakazy')
    app.modules![0]!.kind = 'requests'
    expect(checkAppModules(app, catalog)).toMatch(/не соответствует/)
  })
  it('blocks new combinations until separate work permissions and runtime composition are ready', () => {
    const salon = fixture('salon'), sales = fixture('zakazy')
    salon.app.customer = sales.app.customer; salon.app.modules!.push(sales.app.modules![0]!)
    for (const id of sales.catalog.tableIds) salon.catalog.tableIds.add(id)
    for (const [id, field] of sales.catalog.fields) salon.catalog.fields.set(id, field)
    const before = JSON.stringify(salon.app.roles)
    expect(checkAppModules(salon.app, salon.catalog)).toMatch(/ещё не поддерживается/)
    expect(JSON.stringify(salon.app.roles)).toBe(before)
  })
  it('does not silently enable new composition checks on an already published custom legacy app', () => {
    const salon = fixture('salon'), sales = fixture('zakazy')
    salon.app.customer = sales.app.customer; delete salon.app.modules
    const before = JSON.stringify(salon.app)
    expect(appModules(salon.app).map(module => module.kind)).toEqual(['booking', 'sales'])
    expect(checkAppModules(salon.app, salon.catalog)).toBeNull()
    expect(JSON.stringify(salon.app)).toBe(before)
  })
  it('rejects two lifecycle owners for the same table', () => {
    const { app, catalog } = fixture('proizvodstvo')
    app.inventory = { tables: { items: app.production!.tables.materials, movements: app.production!.tables.movements }, item: { name: '', opening: '', movements: '', stock: '', image: null, sku: null }, movement: { name: '', item: '', qty: '', date: '', note: '', author: '' }, receiptScreenId: null, operations: null }
    app.modules!.push({ id: 'inventory', kind: 'inventory', version: 1, source: { type: 'inventory' }, dependsOn: [] } satisfies AppModule)
    expect(checkAppModules(app, catalog)).toMatch(/правила для одних записей/)
  })
})
