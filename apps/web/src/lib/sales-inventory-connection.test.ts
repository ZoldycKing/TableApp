import { describe, expect, it } from 'vitest'
import { type Field } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import { connectSalesInventory } from './sales-inventory-connection'
import { checkAppReferences } from './app-references'
import { canOpenScreen, visitorFor, permits } from './app-roles'
import { orderStockPair } from './order-stock-config'

describe('sales warehouse installation', () => {
  it('reuses exact catalogue IDs, creates only a private journal and keeps warehouse work separate from customer access', () => {
    const sales = templateExample('zakazy'), before = JSON.stringify(sales.app)
    const result = connectSalesInventory(sales.app, 'owner@example.invalid', new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))
    const pair = orderStockPair(result.app)!
    expect(pair.inventory.tables.items).toBe(sales.app.customer!.catalog!.tableId)
    expect(pair.inventory.item.name).toBe(sales.app.customer!.catalog!.titleFieldId)
    expect(result.tables).toHaveLength(1)
    expect(result.tables[0]!.id).toBe(pair.inventory.tables.movements)
    expect(JSON.stringify(sales.app)).toBe(before)
    const catalog = { tableIds: new Set([...sales.built.tables, ...result.tables].map(table => table.id)), fields: new Map([...sales.fields, ...result.fields as Field[]].map(field => [field.id, field])), views: new Map([...sales.views, ...result.views].map(view => [view.id, view])) }
    expect(checkAppReferences(result.app, catalog)).toBeNull()
    const client = visitorFor(result.app, 'client@example.invalid'), module = result.app.modules!.find(module => module.kind === 'inventory')!
    expect(result.app.screens.filter(screen => module.screenIds!.includes(screen.id) && canOpenScreen(screen, client))).toEqual([])
    expect(permits(result.app, pair.inventory.tables.movements, 'create', client)).toBe(false)
  })
})
