import { describe, expect, it } from 'vitest'
import { writableFields, asRole, ANONYMOUS, visibleScreensFor } from '../app-roles'
import { generateApp } from '../app-builder'
import { checkAppReferences } from '../app-references'
import { inventoryFixture } from './inventory-fixture.test-utils'
import { prepareInventoryUpgrade } from './inventory-upgrade'

describe('warehouse preset and safe upgrade', () => {
  it('opens goods and receipts to the worker, while owner screens and prices stay private', () => {
    const { app, runtime, fields } = inventoryFixture()
    const config = app.inventory!
    expect(app.roles.find(role => role.isDefault)?.name).toBe('Кладовщик')
    expect(runtime.app.screens.filter(screen => screen.tab).map(screen => screen.name)).toEqual(['Товары'])
    expect(visibleScreensFor(app, ANONYMOUS)).toHaveLength(0)
    const price = fields.find(field => field.name === 'Цена')!
    const itemTable = runtime.tables[config.tables.items]!
    expect(itemTable.fields.map(field => field.id)).not.toContain(price.id)
    expect(itemTable.fields.map(field => field.id)).not.toContain(config.item.opening)
    expect(itemTable.rows.every(row => !(price.id in row.data))).toBe(true)
    expect(itemTable.rows[0]!.data[config.item.stock]).toBe(4)
    expect(runtime.tables[config.tables.movements]?.rows ?? []).toHaveLength(0)
    expect(writableFields(app, config.tables.items, asRole('staff'), 'update').size).toBe(0)
    expect(writableFields(app, config.tables.items, asRole('manager'), 'update').has(price.id)).toBe(true)
  })
  it('binds the card action to the configured create screen and validates all references', () => {
    const { app, fields, views, built } = inventoryFixture()
    const detail = app.screens.find(screen => screen.type === 'detail')!
    expect(detail.type === 'detail' && detail.components.some(component => component.type === 'button' && component.action.type === 'open_screen' && component.action.screenId === app.inventory!.receiptScreenId)).toBe(true)
    const catalog = { tableIds: new Set(built.tables.map(table => table.id)), fields: new Map(fields.map(field => [field.id, field])), views: new Map(views.map(view => [view.id, view])) }
    expect(checkAppReferences(app, catalog)).toBeNull()
    expect(checkAppReferences({ ...app, inventory: { ...app.inventory!, tables: { ...app.inventory!.tables, movements: 'foreign' } } }, catalog)).not.toBeNull()
    expect(checkAppReferences({ ...app, inventory: { ...app.inventory!, item: { ...app.inventory!.item, stock: app.inventory!.item.opening } } }, catalog)).not.toBeNull()
    const ownerDetail = visibleScreensFor(app, asRole('manager')).find(screen => screen.type === 'detail')!
    const workerDetail = visibleScreensFor(app, asRole('staff')).find(screen => screen.type === 'detail')!
    expect(ownerDetail.type === 'detail' && ownerDetail.components.some(component => component.type === 'button' && component.label === 'Изменить')).toBe(true)
    expect(workerDetail.type === 'detail' && workerDetail.components.some(component => component.type === 'button' && component.label === 'Изменить')).toBe(false)
  })
  it('preserves existing balance IDs, formulas, row IDs and screen IDs during legacy upgrade', () => {
    const { generated, table, fields, views, built } = inventoryFixture()
    const config = built.inventory!
    const oldFields = fields.filter(field => field.tableId === table.id && ![config.item.movements, config.item.stock].includes(field.id) && field.type !== 'rollup')
      .map(field => field.id === config.item.opening ? { ...field, name: 'Остаток' } : field)
    const legacy = generateApp({ appId: generated.id, workspaceId: generated.workspaceId, name: generated.name, slug: generated.slug, table, fields: oldFields, view: views.find(view => view.id === built.appViewId)! })
    const upgraded = prepareInventoryUpgrade(legacy, table, oldFields, views, 'a9')
    expect(upgraded.app.inventory!.item.opening).toBe(config.item.opening)
    expect(upgraded.app.inventory!.tables.items).toBe(table.id)
    expect(upgraded.tables).toHaveLength(1)
    expect(upgraded.fields.filter(field => field.tableId === table.id)).toHaveLength(3)
    expect(upgraded.app.screens.some(screen => screen.id === legacy.homeScreenId)).toBe(true)
    expect(built.rows[0]!.data[config.item.opening]).toBe(4)
    const allFields = [...oldFields.map(field => field.id === config.item.opening ? { ...field, name: 'Начальный остаток' } : field), ...upgraded.fields] as typeof fields
    expect(checkAppReferences(upgraded.app, { tableIds: new Set([table.id, ...upgraded.tables.map(table => table.id)]), fields: new Map(allFields.map(field => [field.id, field])), views: new Map([...views, ...upgraded.views].map(view => [view.id, view])) })).toBeNull()
  })
  it('refuses altered schemas and custom roles before preparing a migration', () => {
    const { generated, table, fields, views } = inventoryFixture()
    expect(() => prepareInventoryUpgrade(generated, table, fields, views, null)).toThrow('Структура склада')
    expect(() => prepareInventoryUpgrade({ ...generated, roles: [...generated.roles, { id: 'custom', name: 'Custom', isDefault: false }] }, table, fields, views, null)).toThrow('нестандартные роли')
    expect(() => prepareInventoryUpgrade({ ...generated, screens: [...generated.screens, { ...generated.screens[0]!, id: 'extra' }] }, table, fields, views, null)).toThrow('Экраны склада доработаны')
  })
})
