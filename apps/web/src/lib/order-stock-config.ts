import { customerWorkflows, type App, type CustomerWorkflow } from '@tableapp/schema'
import { moduleForTable } from './module-access'

/** A shared catalogue with explicit product/status bindings, never matching titles or SKUs. */
export function orderStockPair(app: App) {
  const inventory = app.inventory
  if (!inventory?.operations) return null
  const order = customerWorkflows(app).find(config => config.cart?.productFieldId && config.stock && config.logistics?.kind === 'sales' &&
    config.catalog?.tableId === inventory.tables.items && moduleForTable(app, config.tableId)?.kind === 'sales')
  return order ? { order, inventory } : null
}
/** Older accepted orders without an explicit return status cannot acquire one implicitly. */
export function pickupReturnStatus(live: CustomerWorkflow, accepted: CustomerWorkflow): string | null {
  const status = live.stock?.returnedStatus
  return status && status === accepted.stock?.returnedStatus && live.tableId === accepted.tableId && live.statusFieldId === accepted.statusFieldId ? status : null
}
export type OrderStockState = { state: 'waiting' | 'reserved' | 'released' | 'issued' | 'returned'; canConfirm: boolean; canIssue: boolean; canReturn: boolean; reason?: string; quantity?: number }
export type StockBalanceState = { stock: number; reserved: number; available: number }
