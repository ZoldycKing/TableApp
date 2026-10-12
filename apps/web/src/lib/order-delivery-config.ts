import { customerWorkflows, type App } from '@tableapp/schema'
import { moduleForTable } from './module-access'

/** A published pair with explicit bindings; labels and installation order are irrelevant. */
export function orderDeliveryPair(app: App) {
  const configs = customerWorkflows(app)
  const order = configs.find(config => config.cart && config.logistics?.kind === 'sales' && moduleForTable(app, config.tableId)?.kind === 'sales')
  const delivery = configs.find(config => config.logistics?.kind === 'delivery' && moduleForTable(app, config.tableId)?.kind === 'delivery')
  return order && delivery ? { order, delivery } : null
}

export type OrderDeliveryState = {
  canCreate: boolean
  reason?: string
  linked?: { side: 'order' | 'delivery'; status: string; stage: 'waiting' | 'shipped' | 'delivered' | 'returned' | 'missed' | 'cancelled' | 'restricted'; target?: { tableId: string; rowId: string; screenId: string } }
}
