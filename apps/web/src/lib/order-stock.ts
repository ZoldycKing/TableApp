import { orderDeliveries, orderStockItems, orderStockReservations } from '@tableapp/db'
import { and, eq } from 'drizzle-orm'
import { appReadPolicy } from './app-read-policy'
import { writableFields } from './app-roles'
import { hasRole, workflowRole } from './module-access'
import { orderWorkflowAccess } from './order-delivery'
import { orderStockPair, pickupReturnStatus, type OrderStockState } from './order-stock-config'
import { stockBalance } from './order-stock-store'
import { assertCurrentModuleState, checkRow, lockedRow, RowWriteError, updateRow, writeRows } from './row-mutations'

const denied = () => new RowWriteError('denied', 'Подтверждение и выдача заказа вам недоступны')
type Access = NonNullable<Awaited<ReturnType<typeof orderWorkflowAccess>>>
const manages = (access: Access) => access.owner || hasRole(access.access!.visitor, workflowRole(access.app, access.config.tableId, 'manager')) && access.app.modules!.some(module => module.kind === 'inventory' &&
  ['manager', 'staff'].some(role => module.roles?.[role] && hasRole(access.access!.visitor, module.roles[role]!)))
const canChangeStatus = (access: Access) => access.owner || writableFields(access.app, access.config.tableId, access.access!.visitor, 'update').has(access.config.statusFieldId)
const filter = (workspaceId: string, tableId: string, rowId: string) => and(eq(orderStockReservations.workspaceId, workspaceId), eq(orderStockReservations.orderTableId, tableId), eq(orderStockReservations.orderRowId, rowId))

export async function readOrderStock(tableId: string, rowId: string, slug?: string, business = false): Promise<OrderStockState | null> {
  const access = await orderWorkflowAccess(tableId, rowId, slug, business)
  if (!access || !manages(access) || !access.owner && !access.policy!.readable.fields.has(access.config.statusFieldId)) return null
  const pair = orderStockPair(access.app)
  if (!pair || pair.order.tableId !== tableId) return null
  return writeRows(access.app.workspaceId, async context => {
    await assertCurrentModuleState(context, access.app)
    const current = await lockedRow(context, tableId, rowId); checkRow(current, { guard: data => !access.policy || access.policy.canRead(data, current) })
    const [reservation] = await context.tx.select().from(orderStockReservations).where(filter(context.workspaceId, tableId, rowId))
    const [delivery] = await context.tx.select().from(orderDeliveries).where(and(eq(orderDeliveries.workspaceId, context.workspaceId), eq(orderDeliveries.orderTableId, tableId), eq(orderDeliveries.orderRowId, rowId)))
    const status = (current.data as Record<string, unknown>)[pair.order.statusFieldId]
    // Pre-connection history is not retroactively represented as an unconfirmed allocation.
    if (!reservation && status !== pair.order.initialStatus) return null
    const state = reservation?.state ?? 'waiting'
    const items = reservation ? await context.tx.select().from(orderStockItems).where(and(eq(orderStockItems.workspaceId, context.workspaceId), eq(orderStockItems.orderTableId, tableId), eq(orderStockItems.orderRowId, rowId))) : []
    return { state, canConfirm: canChangeStatus(access) && !reservation && status === pair.order.initialStatus, canIssue: canChangeStatus(access) && state === 'reserved' && !delivery,
      canReturn: canChangeStatus(access) && state === 'issued' && !delivery && Boolean(reservation && pickupReturnStatus(pair.order, reservation.contract.order)) && status === reservation?.contract.order.logistics?.deliveredStatus,
      ...(reservation ? { quantity: items.reduce((sum, item) => sum + item.quantity, 0) } : {}), ...(delivery && state === 'reserved' ? { reason: 'Товар спишется со склада при передаче курьеру.' } : {}) }
  })
}

/** Confirmation, every allocation and the order status are one serializable workspace write. */
export async function confirmOrderStock(tableId: string, rowId: string, baseVersion: number, slug?: string, business = false) {
  if (!Number.isSafeInteger(baseVersion) || baseVersion < 0) throw denied()
  const access = await orderWorkflowAccess(tableId, rowId, slug, business), pair = access && orderStockPair(access.app)
  if (!access || !pair || pair.order.tableId !== tableId || !manages(access) || !canChangeStatus(access)) throw denied()
  const { order, inventory } = pair, cart = order.cart!
  const itemPolicy = access.owner ? null : await appReadPolicy(access.app, cart.itemsTableId, access.access!.visitor, access.access!.viewer!)
  const productPolicy = access.owner ? null : await appReadPolicy(access.app, inventory.tables.items, access.access!.visitor, access.access!.viewer!)
  return writeRows(access.app.workspaceId, async context => {
    await assertCurrentModuleState(context, access.app)
    const current = await lockedRow(context, tableId, rowId); checkRow(current, { guard: data => !access.policy || access.policy.canRead(data, current) })
    const [existing] = await context.tx.select().from(orderStockReservations).where(filter(context.workspaceId, tableId, rowId))
    if (existing) return { state: existing.state, repeated: true }
    checkRow(current, { baseVersion })
    const data = access.policy ? access.policy.project(current.data as Record<string, unknown>, current) : current.data as Record<string, unknown>
    if (data[order.statusFieldId] !== order.initialStatus) throw new RowWriteError('invalid', 'Подтвердить можно только новый заказ')
    const ids = data[cart.positionsFieldId], email = String((current.data as Record<string, unknown>)[order.emailFieldId] ?? '').trim().toLowerCase()
    if (!email.includes('@') || !Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw new RowWriteError('invalid', 'Проверьте клиента и состав заказа')
    const products = new Map<string, { qty: number; ids: string[] }>()
    for (const id of ids) {
      if (typeof id !== 'string') throw denied()
      const line = await lockedRow(context, cart.itemsTableId, id); checkRow(line)
      const raw = line.data as Record<string, unknown>
      if (String(raw[cart.itemEmailFieldId] ?? '').trim().toLowerCase() !== email || itemPolicy && !itemPolicy.canRead(raw, line)) throw denied()
      const values = itemPolicy ? itemPolicy.project(raw, line) : raw
      const selected = values[cart.productFieldId!], qty = values[cart.quantityFieldId]
      if (!Array.isArray(selected) || selected.length !== 1 || typeof selected[0] !== 'string' || typeof qty !== 'number' || !Number.isSafeInteger(qty) || qty < 1 || qty > 1_000_000) throw new RowWriteError('invalid', 'Каждая позиция должна быть связана с товаром каталога и иметь целое положительное количество.')
      const product = await lockedRow(context, inventory.tables.items, selected[0]); checkRow(product)
      if (productPolicy && !productPolicy.canRead(product.data as Record<string, unknown>, product)) throw denied()
      const entry = products.get(product.id) ?? { qty: 0, ids: [] }; entry.qty += qty; entry.ids.push(id); products.set(product.id, entry)
    }
    for (const [id, entry] of products) {
      const balance = await stockBalance(context, inventory, id)
      if (!Number.isSafeInteger(entry.qty) || entry.qty > balance.available) throw new RowWriteError('invalid', `Недостаточно товара для подтверждения: свободно ${Math.max(0, balance.available)} шт., нужно ${entry.qty} шт.`)
    }
    await context.tx.insert(orderStockReservations).values({ workspaceId: context.workspaceId, orderTableId: tableId, orderRowId: rowId, contract: { order, inventory } })
    await context.tx.insert(orderStockItems).values([...products].map(([id, entry]) => ({ workspaceId: context.workspaceId, orderTableId: tableId, orderRowId: rowId, productTableId: inventory.tables.items, productRowId: id, quantity: entry.qty, positionIds: entry.ids })))
    for (const id of products.keys()) await updateRow(context, inventory.tables.items, id, {}, access.actor)
    await updateRow(context, tableId, rowId, { [order.statusFieldId]: order.stock!.confirmedStatus }, { ...access.actor, kind: 'order_stock_confirm' })
    return { state: 'reserved' as const, repeated: false }
  })
}

export async function issueOrderStock(tableId: string, rowId: string, baseVersion: number, slug?: string, business = false) {
  if (!Number.isSafeInteger(baseVersion) || baseVersion < 0) throw denied()
  const access = await orderWorkflowAccess(tableId, rowId, slug, business), pair = access && orderStockPair(access.app)
  if (!access || !pair || !manages(access) || !canChangeStatus(access) || pair.order.tableId !== tableId) throw denied()
  return writeRows(access.app.workspaceId, async context => {
    await assertCurrentModuleState(context, access.app)
    const current = await lockedRow(context, tableId, rowId); checkRow(current, { guard: data => !access.policy || access.policy.canRead(data, current) })
    const [reservation] = await context.tx.select().from(orderStockReservations).where(filter(context.workspaceId, tableId, rowId))
    if (!reservation || !['reserved', 'issued'].includes(reservation.state)) throw new RowWriteError('invalid', 'Сначала подтвердите заказ')
    if (reservation.state === 'issued') return { repeated: true }
    checkRow(current, { baseVersion })
    await updateRow(context, tableId, rowId, { [pair.order.statusFieldId]: pair.order.logistics!.deliveredStatus }, { ...access.actor, kind: 'order_stock_pickup' })
    return { repeated: false }
  })
}

/** Full pickup return: accepted issue, compensating movements and terminal status commit together. */
export async function returnOrderStock(tableId: string, rowId: string, baseVersion: number, slug?: string, business = false) {
  if (!Number.isSafeInteger(baseVersion) || baseVersion < 0) throw denied()
  const initial = await orderWorkflowAccess(tableId, rowId, slug, business), initialPair = initial && orderStockPair(initial.app)
  if (!initial || !initialPair || initialPair.order.tableId !== tableId || !manages(initial) || !canChangeStatus(initial)) throw denied()
  return writeRows(initial.app.workspaceId, async context => {
    // Re-read live grants after waiting for the workspace write lock.
    const access = await orderWorkflowAccess(tableId, rowId, slug, business), pair = access && orderStockPair(access.app)
    if (!access || !pair || access.app.workspaceId !== context.workspaceId || pair.order.tableId !== tableId || !manages(access) || !canChangeStatus(access)) throw denied()
    await assertCurrentModuleState(context, access.app)
    const current = await lockedRow(context, tableId, rowId); checkRow(current, { guard: data => !access.policy || access.policy.canRead(data, current) })
    const [reservation] = await context.tx.select().from(orderStockReservations).where(filter(context.workspaceId, tableId, rowId))
    const [delivery] = await context.tx.select({ id: orderDeliveries.deliveryRowId }).from(orderDeliveries)
      .where(and(eq(orderDeliveries.workspaceId, context.workspaceId), eq(orderDeliveries.orderTableId, tableId), eq(orderDeliveries.orderRowId, rowId))).limit(1)
    if (delivery) throw new RowWriteError('invalid', 'Заказ связан с доставкой. Оформите возврат через доставку.')
    const returnedStatus = reservation && pickupReturnStatus(pair.order, reservation.contract.order)
    if (!reservation || !returnedStatus) throw new RowWriteError('invalid', 'Возврат самовывоза не настроен для этого заказа.')
    const status = (current.data as Record<string, unknown>)[reservation.contract.order.statusFieldId]
    if (reservation.state === 'returned' && status === returnedStatus) return { state: 'returned' as const, repeated: true }
    checkRow(current, { baseVersion })
    if (reservation.state !== 'issued' || status !== reservation.contract.order.logistics?.deliveredStatus) throw new RowWriteError('invalid', 'Возврат доступен только после выдачи заказа самовывозом.')
    const key = `${tableId}:${rowId}`
    context.orderStockReturn ??= new Set(); context.orderStockReturn.add(key)
    try {
      await updateRow(context, tableId, rowId, { [reservation.contract.order.statusFieldId]: returnedStatus }, { ...access.actor, kind: 'order_stock_pickup_return' })
    } finally { context.orderStockReturn.delete(key) }
    return { state: 'returned' as const, repeated: false }
  })
}
