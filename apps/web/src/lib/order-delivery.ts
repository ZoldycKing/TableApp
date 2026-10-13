import { apps, db, orderDeliveries, orderStockReservations, rows, tables, workspaces } from '@tableapp/db'
import { appSchema, customerWorkflows } from '@tableapp/schema'
import { and, eq, isNull, or } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { appAccessFor, currentAppAccess } from './app-session'
import { canEnter, canOpenScreen } from './app-roles'
import { appReadPolicy } from './app-read-policy'
import { validateAppReferences } from './app-references'
import { currentMember } from './session'
import { acceptsModuleIntake, hasRole, workflowRole } from './module-access'
import { assertCurrentModuleState, checkRow, createRow, lockedRow, RowWriteError, updateRow, writeRows } from './row-mutations'
import { orderDeliveryPair, type OrderDeliveryState } from './order-delivery-config'
import { orderStockPair } from './order-stock-config'

const denied = () => new RowWriteError('denied', 'Заказ или доставка недоступны')
const ref = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200
export async function orderWorkflowAccess(tableId: string, rowId: string, slug?: string, business = false) {
  if (!ref(tableId) || !ref(rowId) || slug !== undefined && !ref(slug) || typeof business !== 'boolean') throw denied()
  const member = business ? await currentMember() : null
  if (business && !member || !business && !slug) throw denied()
  const records = await db.select().from(apps).where(business ? and(eq(apps.workspaceId, member!.workspaceId), slug ? eq(apps.slug, slug) : undefined) : eq(apps.slug, slug!))
  for (const record of records) {
    const parsed = appSchema.safeParse(record.published)
    if (!parsed.success) continue
    const app = { ...parsed.data, id: record.id, workspaceId: record.workspaceId, slug: record.slug }
    const config = customerWorkflows(app).find(config => config.tableId === tableId)
    if (!config || await validateAppReferences(app)) continue
    const [parent] = await db.select({ row: rows }).from(rows).innerJoin(tables, eq(rows.tableId, tables.id))
      .where(and(eq(rows.tableId, tableId), eq(rows.id, rowId), eq(tables.workspaceId, app.workspaceId), isNull(rows.deletedAt)))
    if (!parent) continue
    const [space] = await db.select({ ownerId: workspaces.ownerId }).from(workspaces).where(eq(workspaces.id, app.workspaceId))
    const owner = Boolean(business && member?.role === 'owner' && space?.ownerId === member.userId)
    const access = owner ? null : business ? await appAccessFor(app, member!.email) : await currentAppAccess(app)
    if (!owner && (!access?.viewer || !access.visitor.authenticated || !canEnter(app, access.visitor))) continue
    if (business && !owner && !['manager', 'staff'].some(role => hasRole(access!.visitor, workflowRole(app, tableId, role)))) continue
    const policy = owner ? null : await appReadPolicy(app, tableId, access!.visitor, access!.viewer!)
    if (policy && !policy.canRead(parent.row.data as Record<string, unknown>, parent.row)) continue
    const pair = orderDeliveryPair(app)
    const manager = (target: string) => owner || hasRole(access!.visitor, workflowRole(app, target, 'manager'))
    const canCreate = Boolean(pair && tableId === pair.order.tableId && manager(pair.order.tableId) && manager(pair.delivery.tableId) && (owner || app.screens.some(screen => screen.type === 'form' && screen.mode === 'create' && screen.tableId === pair.delivery.tableId && canOpenScreen(screen, access!.visitor))))
    return { app, config, parent: parent.row, pair, canCreate, owner, access, policy, actor: { id: owner ? member!.userId : access!.viewer!.id, kind: business ? 'member' : 'app_user' } }
  }
  if (business && !slug) return null
  throw denied()
}

export async function readOrderDelivery(tableId: string, rowId: string, slug?: string, business = false): Promise<OrderDeliveryState | null> {
  const access = await orderWorkflowAccess(tableId, rowId, slug, business)
  if (!access) return null
  const { app, pair } = access
  const [link] = await db.select().from(orderDeliveries).where(and(eq(orderDeliveries.workspaceId, app.workspaceId), or(and(eq(orderDeliveries.orderTableId, tableId), eq(orderDeliveries.orderRowId, rowId)), and(eq(orderDeliveries.deliveryTableId, tableId), eq(orderDeliveries.deliveryRowId, rowId)))))
  if (!link) {
    if (!pair || tableId !== pair.order.tableId || !access.canCreate) return null
    const data = access.parent.data as Record<string, unknown>, status = String(data[pair.order.statusFieldId] ?? '')
    const ready = pair.order.cancellableStatuses.includes(status)
    if (orderStockPair(app)) {
      const [stock] = await db.select({ state: orderStockReservations.state }).from(orderStockReservations).where(and(eq(orderStockReservations.workspaceId, app.workspaceId), eq(orderStockReservations.orderTableId, tableId), eq(orderStockReservations.orderRowId, rowId)))
      if (stock?.state !== 'reserved') return { canCreate: false, reason: 'Сначала подтвердите заказ и закрепите товары за ним.' }
    }
    return { canCreate: ready && acceptsModuleIntake(app, pair.delivery.tableId), reason: !ready ? 'На этом этапе передача в доставку недоступна.' : !acceptsModuleIntake(app, pair.delivery.tableId) ? 'Приём новых доставок приостановлен.' : undefined }
  }
  const side = link.orderRowId === rowId && link.orderTableId === tableId ? 'order' : 'delivery'
  const [delivery] = await db.select().from(rows).where(and(eq(rows.id, link.deliveryRowId), eq(rows.tableId, link.deliveryTableId), isNull(rows.deletedAt)))
  if (!delivery) return { canCreate: false, reason: 'Связанная доставка недоступна. Обратитесь к владельцу бизнеса.' }
  const config = link.contract.delivery, status = String((delivery.data as Record<string, unknown>)[config.statusFieldId] ?? '')
  const logistics = config.logistics
  if (logistics?.kind !== 'delivery') throw denied()
  let stage: NonNullable<OrderDeliveryState['linked']>['stage'] = status === config.cancelStatus ? 'cancelled' : status === logistics.deliveredStatus ? 'delivered' : status === logistics.returnedStatus ? 'returned' : status === logistics.missedStatus ? 'missed' : status === logistics.shippedStatus ? 'shipped' : 'waiting'
  // A related record remains a separate resource with its own live row and field policy.
  const targetTable = side === 'order' ? link.deliveryTableId : link.orderTableId, targetRow = side === 'order' ? link.deliveryRowId : link.orderRowId
  const [target] = await db.select().from(rows).where(and(eq(rows.id, targetRow), eq(rows.tableId, targetTable), isNull(rows.deletedAt)))
  const targetPolicy = access.owner ? null : await appReadPolicy(app, targetTable, access.access!.visitor, access.access!.viewer!)
  const readable = target && (!targetPolicy || targetPolicy.canRead(target.data as Record<string, unknown>, target))
  const statusPolicy = side === 'delivery' ? access.policy : targetPolicy
  if (!access.owner && (side === 'order' && !readable || !statusPolicy?.readable.fields.has(config.statusFieldId))) {
    // Without delivery access, disclose only the already readable stage of the order itself.
    const visible = access.policy!.project(access.parent.data as Record<string, unknown>, access.parent)
    const source = link.contract.order, sourceStatus = visible[source.statusFieldId]
    stage = side === 'order' && sourceStatus === source.logistics?.shippedStatus ? 'shipped' : side === 'order' && sourceStatus === source.logistics?.deliveredStatus ? 'delivered' : side === 'order' && sourceStatus === source.cancelStatus ? 'cancelled' : 'restricted'
  }
  const screen = readable ? app.screens.find(screen => screen.type === 'detail' && screen.tableId === targetTable && (access.owner || canOpenScreen(screen, access.access!.visitor))) : undefined
  return { canCreate: false, linked: { side, stage, status: ({ waiting: 'Ожидает передачи курьеру', shipped: 'В пути', delivered: 'Доставлена', returned: 'Возврат — требуется решение диспетчера', missed: 'Не застали — согласуйте повторную попытку', cancelled: 'Отменена', restricted: side === 'order' ? 'Заказ передан в доставку' : 'Доставка связана с заказом' } as const)[stage], ...(screen ? { target: { tableId: targetTable, rowId: targetRow, screenId: screen.id } } : {}) } }
}

/** The source version, snapshot, link and usage accounting commit together under the workspace lock. */
export async function handoffOrderDelivery(tableId: string, rowId: string, baseVersion: number, slug?: string, business = false) {
  if (!Number.isSafeInteger(baseVersion) || baseVersion < 0) throw denied()
  const access = await orderWorkflowAccess(tableId, rowId, slug, business)
  if (!access?.canCreate || !access.pair) throw denied()
  const { app, pair, actor } = access, { order, delivery } = pair
  const source = order.logistics!, destination = delivery.logistics!
  if (source.kind !== 'sales' || destination.kind !== 'delivery' || !order.cart || !order.profile || !delivery.profile) throw denied()
  const cart = order.cart, orderProfile = order.profile, deliveryProfile = delivery.profile
  return writeRows(app.workspaceId, async context => {
    await assertCurrentModuleState(context, app)
    const current = await lockedRow(context, tableId, rowId)
    checkRow(current)
    const data = current.data as Record<string, unknown>
    if (access.policy && !access.policy.canRead(data, current)) throw denied()
    const [existing] = await context.tx.select().from(orderDeliveries).where(and(eq(orderDeliveries.workspaceId, app.workspaceId), eq(orderDeliveries.orderTableId, tableId), eq(orderDeliveries.orderRowId, rowId)))
    if (existing) return { id: existing.deliveryRowId, duplicate: true }
    checkRow(current, { baseVersion })
    if (orderStockPair(app)) {
      const [stock] = await context.tx.select({ state: orderStockReservations.state }).from(orderStockReservations).where(and(eq(orderStockReservations.workspaceId, app.workspaceId), eq(orderStockReservations.orderTableId, tableId), eq(orderStockReservations.orderRowId, rowId)))
      if (stock?.state !== 'reserved') throw new RowWriteError('invalid', 'Сначала подтвердите заказ и закрепите товары за ним.')
    }
    const status = String(data[order.statusFieldId] ?? '')
    if (!order.cancellableStatuses.includes(status)) throw new RowWriteError('invalid', 'Передайте заказ до отгрузки, завершения или отмены')
    const read = access.policy ? access.policy.project(data, current) : data
    const contact = [source.addressFieldId, orderProfile.nameFieldId, orderProfile.phoneFieldId]
    if (contact.some(id => typeof read[id] !== 'string' || !String(read[id]).trim())) throw new RowWriteError('invalid', 'Укажите адрес, имя и телефон получателя в заказе')
    const email = String(read[order.emailFieldId] ?? '').trim().toLowerCase()
    if (!email.includes('@') || email.length > 254) throw new RowWriteError('invalid', 'Укажите почту клиента в заказе')
    const ids = read[cart.positionsFieldId]
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw new RowWriteError('invalid', 'Проверьте состав заказа перед доставкой')
    const itemPolicy = access.owner ? null : await appReadPolicy(app, cart.itemsTableId, access.access!.visitor, access.access!.viewer!)
    const contents: string[] = []
    for (const id of ids) {
      if (!ref(id)) throw denied()
      const item = await lockedRow(context, cart.itemsTableId, id)
      checkRow(item)
      const values = item.data as Record<string, unknown>
      if (String(values[cart.itemEmailFieldId] ?? '').trim().toLowerCase() !== email || itemPolicy && !itemPolicy.canRead(values, item)) throw denied()
      const visible = itemPolicy ? itemPolicy.project(values, item) : values
      const name = visible[cart.nameFieldId], qty = visible[cart.quantityFieldId]
      if (typeof name !== 'string' || !name.trim() || typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) throw new RowWriteError('invalid', 'Проверьте наименования и количества позиций заказа')
      contents.push(`${name.trim()} × ${qty}`)
    }
    const description = contents.join('; ')
    if (description.length > 8000) throw new RowWriteError('invalid', 'Состав заказа слишком длинный для задания доставки')
    const deliveryId = `row_delivery_${createHash('sha256').update(`${app.workspaceId}:${tableId}:${rowId}`).digest('hex')}`
    const created = await createRow(context, delivery.tableId, { [destination.addressFieldId]: String(read[source.addressFieldId]).trim(), [destination.contentsFieldId]: description,
      [deliveryProfile.nameFieldId]: String(read[orderProfile.nameFieldId]).trim(), [deliveryProfile.phoneFieldId]: read[orderProfile.phoneFieldId],
      [delivery.emailFieldId]: email, [delivery.statusFieldId]: delivery.initialStatus, ...(delivery.createdFieldId ? { [delivery.createdFieldId]: new Date().toISOString() } : {}),
    }, actor, { id: deliveryId, origin: 'runtime' })
    if (created.duplicate) throw new RowWriteError('conflict', 'Связь доставки изменилась. Обратитесь к владельцу бизнеса.')
    await context.tx.insert(orderDeliveries).values({ workspaceId: app.workspaceId, orderTableId: tableId, orderRowId: rowId, deliveryTableId: delivery.tableId, deliveryRowId: created.id, contract: { order, delivery }, orderStatusBefore: status })
    // Notify the source table as well: another open order card must discover its new delivery.
    await updateRow(context, tableId, rowId, {}, { ...actor, kind: 'order_delivery_handoff' })
    return { id: created.id, duplicate: false }
  })
}
