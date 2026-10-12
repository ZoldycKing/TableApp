import { orderDeliveries, rows } from '@tableapp/db'
import { and, eq, or, sql } from 'drizzle-orm'
import { sameCellValue } from './cell-conflict'
import { checkRow, lockedRow, RowWriteError, updateRow, type RowActor, type RowTransaction } from './row-mutations'

const immutable = () => new RowWriteError('invalid', 'Заказ уже передан в доставку. Его состав, адрес и контакты зафиксированы; сначала согласуйте отмену с диспетчером.')
const protectedFields = (config: typeof orderDeliveries.$inferSelect['contract']['order']) => [config.emailFieldId, config.logistics?.addressFieldId, config.profile?.nameFieldId, config.profile?.phoneFieldId,
  ...(config.logistics?.kind === 'delivery' ? [config.logistics.contentsFieldId] : []), ...(config.cart ? [config.cart.positionsFieldId] : [])].filter((id): id is string => Boolean(id))

/** Applies equally to runtime, workspace, imports and synchronization; callers already hold the workspace lock. */
export async function prepareOrderDeliveryWrite(context: RowTransaction, tableId: string, rowId: string, data: Record<string, unknown>, before: Record<string, unknown> | null, actor: RowActor) {
  const links = await context.tx.select().from(orderDeliveries).where(and(eq(orderDeliveries.workspaceId, context.workspaceId), or(eq(orderDeliveries.orderTableId, tableId), eq(orderDeliveries.deliveryTableId, tableId), sql`${orderDeliveries.contract}->'order'->'cart'->>'itemsTableId' = ${tableId}`)))
  for (const link of links) {
    if (context.orderDeliverySync?.has(link.orderRowId)) continue
    const { order, delivery } = link.contract
    const sales = order.logistics, shipping = delivery.logistics
    if (sales?.kind !== 'sales' || shipping?.kind !== 'delivery') throw new RowWriteError('conflict', 'Настройки связанной доставки повреждены')
    if (tableId === order.cart?.itemsTableId) {
      const source = await lockedRow(context, link.orderTableId, link.orderRowId)
      const ids = (source?.data as Record<string, unknown> | undefined)?.[order.cart.positionsFieldId]
      if (Array.isArray(ids) && ids.includes(rowId) && (!before || [order.cart.nameFieldId, order.cart.quantityFieldId, order.cart.itemPriceFieldId, order.cart.itemEmailFieldId].some(id => !sameCellValue(before[id], data[id])))) throw immutable()
      continue
    }
    const side = tableId === link.orderTableId && rowId === link.orderRowId ? 'order' : tableId === link.deliveryTableId && rowId === link.deliveryRowId ? 'delivery' : null
    if (!side) continue
    const config = side === 'order' ? order : delivery
    if (!before || protectedFields(config).some(id => !sameCellValue(before[id], data[id]))) throw immutable()
    const status = String(data[config.statusFieldId] ?? ''), previous = String(before[config.statusFieldId] ?? '')
    if (status === previous) continue
    const source = await lockedRow(context, link.orderTableId, link.orderRowId), destination = await lockedRow(context, link.deliveryTableId, link.deliveryRowId)
    checkRow(source); checkRow(destination)
    const deliveryStatus = String((destination.data as Record<string, unknown>)[delivery.statusFieldId] ?? '')
    let targetTable: string, targetId: string, targetStatusField: string, targetStatus: string
    if (side === 'order') {
      if (status !== order.cancelStatus) {
        if (deliveryStatus !== delivery.initialStatus || status === sales.shippedStatus || order.terminalStatuses.includes(status)) throw new RowWriteError('invalid', 'Этап отгрузки и завершения связанного заказа меняется через доставку')
        continue
      }
      if (deliveryStatus === shipping.returnedStatus) continue // Keep the completed return in history while closing the order.
      if (deliveryStatus !== delivery.initialStatus) throw new RowWriteError('invalid', 'Заказ уже передан курьеру или закрыт. Свяжитесь с диспетчером.')
      targetTable = link.deliveryTableId; targetId = link.deliveryRowId; targetStatusField = delivery.statusFieldId; targetStatus = delivery.cancelStatus
    } else {
      const next = previous === delivery.initialStatus ? [shipping.shippedStatus, delivery.cancelStatus] : previous === shipping.shippedStatus ? [shipping.deliveredStatus, shipping.returnedStatus, shipping.missedStatus] : previous === shipping.missedStatus ? [shipping.shippedStatus, shipping.returnedStatus] : []
      if (!next.includes(status)) throw new RowWriteError('invalid', 'Для связанного заказа: сначала «В пути», затем «Доставлена» или «Возврат». Закрытую доставку нельзя открыть повторно.')
      if (status === shipping.shippedStatus && (!delivery.assignmentFieldId || typeof data[delivery.assignmentFieldId] !== 'string' || !String(data[delivery.assignmentFieldId]).trim())) throw new RowWriteError('invalid', 'Назначьте курьера перед передачей заказа в путь')
      targetTable = link.orderTableId; targetId = link.orderRowId; targetStatusField = order.statusFieldId
      targetStatus = status === delivery.cancelStatus ? order.cancelStatus : status === shipping.shippedStatus || status === shipping.missedStatus ? sales.shippedStatus : status === shipping.deliveredStatus ? sales.deliveredStatus : link.orderStatusBefore
    }
    context.orderDeliverySync ??= new Set()
    context.orderDeliverySync.add(link.orderRowId)
    try { await updateRow(context, targetTable, targetId, { [targetStatusField]: targetStatus }, { ...actor, kind: 'order_delivery_sync' }) }
    finally { context.orderDeliverySync.delete(link.orderRowId) }
  }
}

/** Cancellation retains history. Deleting either half or a shipped line would orphan the agreement. */
export async function assertOrderDeliveryDeletion(context: RowTransaction, tableId: string, rowId: string) {
  const links = await context.tx.select().from(orderDeliveries).where(eq(orderDeliveries.workspaceId, context.workspaceId))
  for (const link of links) {
    if (tableId === link.orderTableId && rowId === link.orderRowId || tableId === link.deliveryTableId && rowId === link.deliveryRowId) throw new RowWriteError('invalid', 'У записи есть связанный заказ или доставка. Используйте отмену, чтобы сохранить историю.')
    const cart = link.contract.order.cart
    if (cart?.itemsTableId !== tableId) continue
    const [source] = await context.tx.select({ data: rows.data }).from(rows).where(and(eq(rows.tableId, link.orderTableId), eq(rows.id, link.orderRowId)))
    const ids = (source?.data as Record<string, unknown> | undefined)?.[cart.positionsFieldId]
    if (Array.isArray(ids) && ids.includes(rowId)) throw immutable()
  }
}
