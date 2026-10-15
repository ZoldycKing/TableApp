import { apps, appUsers, orderStockItems, orderStockReservations, rows, users, workspaceMembers } from '@tableapp/db'
import { appSchema, type InventoryConfig } from '@tableapp/schema'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { sameCellValue } from './cell-conflict'
import { checkRow, createRow, lockedRow, mutationFields, RowWriteError, updateRow, type RowActor, type RowTransaction } from './row-mutations'
import { orderStockPair } from './order-stock-config'
import { inventoryBinding } from './order-stock-contract'

type Reservation = typeof orderStockReservations.$inferSelect
type Item = typeof orderStockItems.$inferSelect
const keyOf = (tableId: string, rowId: string) => `${tableId}:${rowId}`
const frozen = () => new RowWriteError('invalid', 'Заказ подтверждён. Его товары, количества и цены зафиксированы. Для изменения состава отмените заказ и оформите новый.')

export async function stockBalance(context: RowTransaction, config: InventoryConfig, itemId: string, data?: Record<string, unknown>, override?: { id: string; data: Record<string, unknown> | null }) {
  await mutationFields(context, config.tables.items); await mutationFields(context, config.tables.movements)
  if (!data) { const item = await lockedRow(context, config.tables.items, itemId); checkRow(item); data = item.data as Record<string, unknown> }
  const ids = data[config.item.movements]
  if (ids != null && (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length)) throw new RowWriteError('invalid', 'Проверьте связь товара с журналом движений')
  const links = (ids ?? []) as string[]
  const journal = links.length ? await context.tx.select().from(rows).where(and(eq(rows.tableId, config.tables.movements), inArray(rows.id, links), isNull(rows.deletedAt))) : []
  for (const movement of journal) {
    const values = override?.id === movement.id ? override.data : movement.data as Record<string, unknown>
    if (values === null) continue
    const target = values?.[config.movement.item]
    if (!Array.isArray(target) || target.length !== 1 || target[0] !== itemId) throw new RowWriteError('invalid', 'Движение склада должно относиться к этому товару.')
  }
  const stock = Number(data[config.item.opening] ?? 0) + journal.reduce((sum, movement) => {
    const values = override?.id === movement.id ? override.data : movement.data as Record<string, unknown>
    return sum + Number(values?.[config.movement.qty] ?? 0)
  }, 0)
  const [held] = await context.tx.select({ amount: sql<number>`coalesce(sum(${orderStockItems.quantity}),0)` }).from(orderStockItems)
    .innerJoin(orderStockReservations, and(eq(orderStockReservations.workspaceId, orderStockItems.workspaceId), eq(orderStockReservations.orderTableId, orderStockItems.orderTableId), eq(orderStockReservations.orderRowId, orderStockItems.orderRowId)))
    .where(and(eq(orderStockItems.workspaceId, context.workspaceId), eq(orderStockItems.productTableId, config.tables.items), eq(orderStockItems.productRowId, itemId), eq(orderStockReservations.state, 'reserved')))
  const reserved = Number(held?.amount ?? 0)
  if (!Number.isSafeInteger(stock) || stock < 0 || !Number.isSafeInteger(reserved)) throw new RowWriteError('invalid', 'Остаток некорректен. Проверьте начальный запас и журнал движений.')
  return { stock, reserved, available: stock - reserved }
}

async function configs(context: RowTransaction, tableId: string, rowId: string) {
  if (!context.moduleStateCache) {
    const records = await context.tx.select({ published: apps.published }).from(apps).where(eq(apps.workspaceId, context.workspaceId))
    context.moduleStateCache = records.flatMap(record => { const parsed = appSchema.safeParse(record.published); return parsed.success ? [parsed.data] : [] })
  }
  const accepted = await context.tx.select().from(orderStockReservations).where(and(eq(orderStockReservations.workspaceId, context.workspaceId), or(and(eq(orderStockReservations.orderTableId, tableId), eq(orderStockReservations.orderRowId, rowId)),
    sql`${orderStockReservations.contract}->'order'->'cart'->>'itemsTableId'=${tableId} and exists(select 1 from order_stock_items i where i.workspace_id=${context.workspaceId} and i.order_table_id=${orderStockReservations.orderTableId} and i.order_row_id=${orderStockReservations.orderRowId} and i.position_ids ? ${rowId})`)))
  const historical = await context.tx.selectDistinct({ inventory: sql<InventoryConfig>`${orderStockReservations.contract}->'inventory'` }).from(orderStockReservations).where(and(eq(orderStockReservations.workspaceId, context.workspaceId),
    sql`(${orderStockReservations.contract}->'inventory'->'tables'->>'items'=${tableId} or ${orderStockReservations.contract}->'inventory'->'tables'->>'movements'=${tableId})`))
  const inventories = [...context.moduleStateCache.flatMap(app => { const pair = orderStockPair(app); return pair ? [pair.inventory] : [] }), ...historical.map(record => record.inventory)]
  return { accepted, pairs: context.moduleStateCache.flatMap(app => { const pair = orderStockPair(app); return pair ? [pair] : [] }), inventories: [...new Map(inventories.map(config => [inventoryBinding(config), config])).values()] }
}

async function move(context: RowTransaction, reservation: Reservation, item: Item, returning: boolean, actor: RowActor) {
  const config = reservation.contract.inventory, ops = config.operations!
  const product = await lockedRow(context, item.productTableId, item.productRowId); checkRow(product)
  const data = product.data as Record<string, unknown>, balance = await stockBalance(context, config, item.productRowId, data)
  const after = balance.stock + (returning ? item.quantity : -item.quantity)
  if (!Number.isSafeInteger(after) || after < balance.reserved) throw new RowWriteError('invalid', 'Недостаточно свободного товара для выдачи заказа')
  const movementId = `row_stock_${createHash('sha256').update(`${context.workspaceId}:${item.orderTableId}:${item.orderRowId}:${item.productRowId}:${returning}`).digest('hex').slice(0, 40)}`
  const ids = Array.isArray(data[config.item.movements]) ? data[config.item.movements] as string[] : []
  const name = String(data[config.item.name] ?? 'Товар')
  const [staff] = actor.id ? await context.tx.select({ email: appUsers.email }).from(appUsers).innerJoin(apps, eq(apps.id, appUsers.appId)).where(and(eq(appUsers.id, actor.id), eq(apps.workspaceId, context.workspaceId))).limit(1) : []
  const [member] = !staff && actor.id ? await context.tx.select({ email: users.email }).from(users).innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id)).where(and(eq(users.id, actor.id), eq(workspaceMembers.workspaceId, context.workspaceId))).limit(1) : []
  context.orderStockInternal ??= new Set(); context.orderStockInternal.add(movementId)
  try {
    await createRow(context, config.tables.movements, { [config.movement.name]: `${returning ? 'Возврат заказа' : 'Выдача заказа'} · ${name}`,
      [config.movement.item]: [item.productRowId], [config.movement.qty]: returning ? item.quantity : -item.quantity,
      [config.movement.date]: new Date().toISOString(), [config.movement.note]: `Заказ ${item.orderRowId}`, [config.movement.author]: staff?.email ?? member?.email ?? '',
      [ops.fields.kind]: returning ? ops.kinds.returnIn : ops.kinds.issue, [ops.fields.before]: balance.stock, [ops.fields.after]: after }, { ...actor, kind: returning ? 'order_stock_return' : 'order_stock_issue' }, { id: movementId, origin: 'runtime' })
    await updateRow(context, item.productTableId, item.productRowId, { [config.item.movements]: [...new Set([...ids, movementId])] }, actor)
    await context.tx.update(orderStockItems).set(returning ? { returnMovementId: movementId } : { issueMovementId: movementId })
      .where(and(eq(orderStockItems.workspaceId, context.workspaceId), eq(orderStockItems.orderTableId, item.orderTableId), eq(orderStockItems.orderRowId, item.orderRowId), eq(orderStockItems.productRowId, item.productRowId)))
  } finally { context.orderStockInternal.delete(movementId) }
}

async function transition(context: RowTransaction, reservation: Reservation, state: Reservation['state'], actor: RowActor) {
  const items = await context.tx.select().from(orderStockItems).where(and(eq(orderStockItems.workspaceId, context.workspaceId), eq(orderStockItems.orderTableId, reservation.orderTableId), eq(orderStockItems.orderRowId, reservation.orderRowId)))
  await context.tx.update(orderStockReservations).set({ state, updatedAt: new Date() }).where(and(eq(orderStockReservations.workspaceId, context.workspaceId), eq(orderStockReservations.orderTableId, reservation.orderTableId), eq(orderStockReservations.orderRowId, reservation.orderRowId)))
  for (const item of items) {
    if (state === 'issued' || state === 'returned') await move(context, reservation, item, state === 'returned', actor)
    else await updateRow(context, item.productTableId, item.productRowId, {}, actor)
  }
}

/** Every writer, including imports, owner edits and sync, obeys the same accepted reservation. */
export async function prepareOrderStockWrite(context: RowTransaction, tableId: string, rowId: string, data: Record<string, unknown>, before: Record<string, unknown> | null, actor: RowActor) {
  const { accepted, pairs, inventories } = await configs(context, tableId, rowId)
  for (const config of inventories) {
    if (tableId === config.tables.items) {
      const fixed = await context.tx.select({ issue: orderStockItems.issueMovementId, returned: orderStockItems.returnMovementId }).from(orderStockItems).where(and(eq(orderStockItems.workspaceId, context.workspaceId), eq(orderStockItems.productTableId, tableId), eq(orderStockItems.productRowId, rowId)))
      const links = data[config.item.movements]
      if (fixed.some(item => [item.issue, item.returned].some(id => id && (!Array.isArray(links) || !links.includes(id))))) throw new RowWriteError('invalid', 'Не удаляйте из товара движения подтверждённого заказа. Используйте возврат для сохранения истории.')
      const balance = await stockBalance(context, config, rowId, data)
      if (balance.available < 0) throw new RowWriteError('invalid', `Товар зарезервирован под заказы. На складе должно оставаться не меньше ${balance.reserved} шт. для их выдачи.`)
    } else if (tableId === config.tables.movements && before) {
      if (context.orderStockInternal?.has(rowId)) continue
      const consumed = await context.tx.select({ id: orderStockItems.orderRowId }).from(orderStockItems).where(and(eq(orderStockItems.workspaceId, context.workspaceId), sql`(${orderStockItems.issueMovementId}=${rowId} or ${orderStockItems.returnMovementId}=${rowId})`)).limit(1)
      if (consumed.length && !sameCellValue(before, data)) throw new RowWriteError('invalid', 'Движение связано с заказом. Используйте возврат, чтобы сохранить историю.')
      const products = await context.tx.select().from(rows).where(and(eq(rows.tableId, config.tables.items), isNull(rows.deletedAt), sql`${rows.data}->${config.item.movements} ? ${rowId}`))
      for (const product of products) if ((await stockBalance(context, config, product.id, product.data as Record<string, unknown>, { id: rowId, data })).available < 0) throw new RowWriteError('invalid', 'Изменение движения уменьшит остаток ниже резерва заказов')
    }
  }
  for (const reservation of accepted) {
    const { order } = reservation.contract, cart = order.cart!
    if (tableId === cart.itemsTableId) {
      const items = await context.tx.select().from(orderStockItems).where(and(eq(orderStockItems.workspaceId, context.workspaceId), eq(orderStockItems.orderTableId, reservation.orderTableId), eq(orderStockItems.orderRowId, reservation.orderRowId)))
      if (items.some(item => item.positionIds.includes(rowId)) && (!before || [cart.nameFieldId, cart.quantityFieldId, cart.itemPriceFieldId, cart.itemEmailFieldId, cart.productFieldId!].some(id => !sameCellValue(before[id], data[id])))) throw frozen()
    }
    if (tableId !== reservation.orderTableId || rowId !== reservation.orderRowId) continue
    if (!before || [order.emailFieldId, cart.positionsFieldId].some(id => !sameCellValue(before[id], data[id]))) throw frozen()
    const status = String(data[order.statusFieldId] ?? ''), previous = String(before[order.statusFieldId] ?? '')
    const returnStatuses = new Set([order.stock?.returnedStatus, pairs.find(pair => pair.order.tableId === tableId)?.order.stock?.returnedStatus].filter(Boolean))
    if (status !== previous && returnStatuses.has(status) && !context.orderStockReturn?.has(keyOf(tableId, rowId))) throw new RowWriteError('invalid', 'Оформите возврат самовывоза из карточки заказа. Ручная смена статуса не возвращает товар на склад.')
    if (status !== previous && order.stock?.returnedStatus && previous === order.stock.returnedStatus) throw new RowWriteError('invalid', 'Заказ уже возвращён. Сохраните историю и оформите новый заказ.')
    if (context.orderStockReturn?.has(keyOf(tableId, rowId)) && reservation.state === 'issued') { await transition(context, reservation, 'returned', actor); continue }
    if (status === previous) continue
    if (status === order.cancelStatus) {
      if (reservation.state === 'issued') throw new RowWriteError('invalid', 'Заказ уже выдан. Сначала оформите возврат товара.')
      if (reservation.state === 'reserved') await transition(context, reservation, 'released', actor)
    } else if (status === order.logistics?.shippedStatus || status === order.logistics?.deliveredStatus) {
      if (reservation.state === 'reserved') await transition(context, reservation, 'issued', actor)
      else if (reservation.state !== 'issued') throw new RowWriteError('invalid', 'Этот заказ отменён или возвращён. Для новой выдачи оформите новый заказ.')
    } else if (reservation.state !== 'reserved' || status === order.initialStatus) throw new RowWriteError('invalid', 'Нельзя вернуть подтверждённый заказ в начало. Сохраните историю и оформите новый заказ.')
  }
  if (!accepted.some(reservation => reservation.orderTableId === tableId && reservation.orderRowId === rowId)) {
    const pair = pairs.find(pair => pair.order.tableId === tableId)
    if (pair && (!before || !sameCellValue(before[pair.order.statusFieldId], data[pair.order.statusFieldId])) && [pair.order.stock!.confirmedStatus, pair.order.stock!.returnedStatus, pair.order.logistics!.shippedStatus, pair.order.logistics!.deliveredStatus].includes(String(data[pair.order.statusFieldId] ?? ''))) throw new RowWriteError('invalid', 'Сначала подтвердите заказ и зарезервируйте товары из его карточки.')
  }
}

export async function assertOrderStockDeletion(context: RowTransaction, tableId: string, rowId: string) {
  const { accepted, inventories } = await configs(context, tableId, rowId)
  const items = await context.tx.select().from(orderStockItems).where(and(eq(orderStockItems.workspaceId, context.workspaceId), or(and(eq(orderStockItems.productTableId, tableId), eq(orderStockItems.productRowId, rowId)), sql`${orderStockItems.positionIds} ? ${rowId}`, eq(orderStockItems.issueMovementId, rowId), eq(orderStockItems.returnMovementId, rowId))))
  if (accepted.some(reservation => reservation.orderTableId === tableId && reservation.orderRowId === rowId) || items.some(item => item.productTableId === tableId && item.productRowId === rowId || item.positionIds.includes(rowId) || item.issueMovementId === rowId || item.returnMovementId === rowId)) throw new RowWriteError('invalid', 'Запись связана с подтверждённым заказом. Используйте отмену, возврат или отключение товара, чтобы сохранить историю.')
  for (const config of inventories.filter(config => config.tables.movements === tableId)) {
    const products = await context.tx.select().from(rows).where(and(eq(rows.tableId, config.tables.items), isNull(rows.deletedAt), sql`${rows.data}->${config.item.movements} ? ${rowId}`))
    for (const product of products) if ((await stockBalance(context, config, product.id, product.data as Record<string, unknown>, { id: rowId, data: null })).available < 0) throw new RowWriteError('invalid', 'Удаление движения уменьшит остаток ниже резерва заказов')
  }
}
