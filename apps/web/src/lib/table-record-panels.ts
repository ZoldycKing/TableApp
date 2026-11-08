import { appSchema, customerWorkflows } from '@tableapp/schema'
import { crmForTable } from './customer-history-config'
import { orderStockPair } from './order-stock-config'

export type TableRecordPanels = {
  orderStock: boolean
  inventoryBalance: boolean
  delivery: boolean
  customerHistory: boolean
}

export const NO_RECORD_PANELS: TableRecordPanels = {
  orderStock: false, inventoryBalance: false, delivery: false, customerHistory: false,
}

/** UI applicability only. Each panel's server actions still check the live record and access. */
export function tableRecordPanels(tableId: string, published: readonly unknown[]): TableRecordPanels {
  const panels = { ...NO_RECORD_PANELS }
  for (const definition of published) {
    const parsed = appSchema.safeParse(definition)
    if (!parsed.success) continue
    const app = parsed.data, stock = orderStockPair(app)
    panels.orderStock ||= stock?.order.tableId === tableId
    panels.inventoryBalance ||= stock?.inventory.tables.items === tableId
    // Existing delivery links must remain visible even if the live pair was disconnected.
    panels.delivery ||= customerWorkflows(app).some(config => config.tableId === tableId && Boolean(config.logistics))
    panels.customerHistory ||= Boolean(crmForTable(app, tableId))
  }
  return panels
}
