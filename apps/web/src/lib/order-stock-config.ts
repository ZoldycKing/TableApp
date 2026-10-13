import { customerWorkflows, type App } from '@tableapp/schema'
import { moduleForTable } from './module-access'

/** A shared catalogue with explicit product/status bindings, never matching titles or SKUs. */
export function orderStockPair(app: App) {
  const inventory = app.inventory
  if (!inventory?.operations) return null
  const order = customerWorkflows(app).find(config => config.cart?.productFieldId && config.stock && config.logistics?.kind === 'sales' &&
    config.catalog?.tableId === inventory.tables.items && moduleForTable(app, config.tableId)?.kind === 'sales')
  return order ? { order, inventory } : null
}
export type OrderStockState = { state: 'waiting' | 'reserved' | 'released' | 'issued' | 'returned'; canConfirm: boolean; canIssue: boolean; reason?: string; quantity?: number }
export type StockBalanceState = { stock: number; reserved: number; available: number }
