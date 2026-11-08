import { describe, expect, it } from 'vitest'
import { templateExample } from './templates/presentation'
import { connectSalesInventory } from './sales-inventory-connection'
import { composeModules } from './module-composition'
import { orderStockPair } from './order-stock-config'
import { NO_RECORD_PANELS, tableRecordPanels } from './table-record-panels'

describe('record panel applicability', () => {
  it('keeps plain tables and production materials free of order and balance checks', () => {
    const production = templateExample('proizvodstvo').app
    expect(tableRecordPanels(production.production!.tables.materials, [production])).toEqual(NO_RECORD_PANELS)
    expect(tableRecordPanels('plain-table', [production, null, { invalid: true }])).toEqual(NO_RECORD_PANELS)
    expect(tableRecordPanels('plain-table', [])).toEqual(NO_RECORD_PANELS)
  })

  it('uses exact linked table IDs to distinguish stock orders from catalogue items', () => {
    const sales = templateExample('zakazy')
    const { app } = connectSalesInventory(sales.app, 'owner@example.invalid', new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))
    const pair = orderStockPair(app)!
    expect(tableRecordPanels(pair.order.tableId, [app])).toMatchObject({ orderStock: true, inventoryBalance: false, delivery: true })
    expect(tableRecordPanels(pair.inventory.tables.items, [app])).toMatchObject({ orderStock: false, inventoryBalance: true, delivery: false })
    expect(tableRecordPanels(pair.inventory.tables.movements, [app])).toEqual(NO_RECORD_PANELS)
  })

  it('retains linked delivery history candidates on either side, including a disconnected live pair', () => {
    const sales = templateExample('zakazy'), delivery = templateExample('dostavka')
    const app = composeModules(sales.app, delivery.app, new Map([...sales.views, ...delivery.views].map(view => [view.id, view])))
    expect(tableRecordPanels(sales.app.customer!.tableId, [app]).delivery).toBe(true)
    expect(tableRecordPanels(delivery.app.customer!.tableId, [app]).delivery).toBe(true)
    expect(tableRecordPanels(delivery.app.customer!.tableId, [delivery.app]).delivery).toBe(true)
  })

  it('shows customer history only on the CRM tables bound to the published definition', () => {
    const { app } = templateExample('crm')
    expect(tableRecordPanels(app.customer!.tableId, [app]).customerHistory).toBe(true)
    expect(tableRecordPanels(app.customer!.crm!.clientsTableId, [app]).customerHistory).toBe(true)
    expect(tableRecordPanels('same-name-other-table', [app])).toEqual(NO_RECORD_PANELS)
  })
})
