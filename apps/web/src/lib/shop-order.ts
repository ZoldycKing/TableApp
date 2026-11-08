import type { App } from '@tableapp/schema'
import { authorizeAppV2Write, type AppV2, type AppV2Actor, type AppV2Json } from '@tableapp/schema/app-v2'
import { createCustomerRecord } from './customer-create'
import { RowWriteError, type RowTransaction } from './row-mutations'
import { shopCustomerWorkflow } from './templates/shop-v2'

/** Places one shop order with the published catalogue price and the existing submission key. */
export async function placeShopOrder(write: RowTransaction, app: AppV2, actor: AppV2Actor, values: Record<string, AppV2Json>) {
  const shop = app.shop, config = shopCustomerWorkflow(app)
  if (!shop || !config || !actor.authenticated || !actor.id || !actor.email) throw new RowWriteError('denied', 'Подтвердите почту перед оформлением')
  const decision = authorizeAppV2Write(app, actor, { operation: 'create', tableId: shop.ordersTableId, values })
  if (!decision.ok) throw new RowWriteError('denied', decision.error)
  return createCustomerRecord(write, { workspaceId: app.workspaceId } as App, config, values, {
    viewer: { id: actor.id, email: actor.email, name: actor.name ?? null, company: actor.company ?? '', enrolled: true },
    visitor: { authenticated: true, roleId: 'client', email: actor.email, company: actor.company ?? '', enrolled: true },
    ip: null,
  })
}
