import type { AppV2, AppV2Actor, AppV2Json } from '@tableapp/schema/app-v2'
import { authorizeAppV2Write } from '@tableapp/schema/app-v2'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { rows } from '@tableapp/db'
import { createRow, deleteRow, lockedRow, RowWriteError, updateRow, type RowTransaction } from './row-mutations'
import { recordInventoryMovement } from './inventory-movement'

export type PurchaseLineInput = { productId: string; qty: number; price: number }

type PurchaseInventory = NonNullable<AppV2['inventory']> & {
  suppliersTableId: string
  purchaseOrdersTableId: string
  purchaseLinesTableId: string
  supplierNameFieldId: string
  purchaseNameFieldId: string
  purchaseNumberFieldId: string
  purchaseSupplierFieldId: string
  purchaseWarehouseFieldId: string
  purchaseDateFieldId: string
  purchaseStatusFieldId: string
  purchaseTotalFieldId: string
  purchaseCommentFieldId: string
  purchaseLinesFieldId: string
  purchaseCountFieldId: string
  purchasePayloadFieldId: string
  purchaseCreatedAtFieldId: string
  purchaseCreatedByFieldId: string
  purchaseOrderedAtFieldId: string
  purchaseOrderedByFieldId: string
  purchaseReceivedAtFieldId: string
  purchaseReceivedByFieldId: string
  purchaseCancelledAtFieldId: string
  purchaseCancelledByFieldId: string
  lineNameFieldId: string
  lineOrderFieldId: string
  lineProductFieldId: string
  lineQtyFieldId: string
  linePriceFieldId: string
  statusDraft: string
  statusOrdered: string
  statusReceived: string
  statusCancelled: string
}

const actorKind = (actor: AppV2Actor) => ({ id: actor.id!, kind: 'app_user' as const })

function purchases(app: AppV2): PurchaseInventory {
  const inv = app.inventory
  if (!inv?.purchaseOrdersTableId || !inv.purchaseLinesTableId || !inv.suppliersTableId
    || !inv.supplierNameFieldId || !inv.purchaseNameFieldId || !inv.purchaseNumberFieldId
    || !inv.purchaseSupplierFieldId || !inv.purchaseWarehouseFieldId || !inv.purchaseDateFieldId
    || !inv.purchaseStatusFieldId || !inv.purchaseTotalFieldId || !inv.purchaseCommentFieldId
    || !inv.purchaseLinesFieldId || !inv.purchaseCountFieldId || !inv.purchasePayloadFieldId
    || !inv.purchaseCreatedAtFieldId || !inv.purchaseCreatedByFieldId
    || !inv.purchaseOrderedAtFieldId || !inv.purchaseOrderedByFieldId
    || !inv.purchaseReceivedAtFieldId || !inv.purchaseReceivedByFieldId
    || !inv.purchaseCancelledAtFieldId || !inv.purchaseCancelledByFieldId
    || !inv.lineNameFieldId || !inv.lineOrderFieldId || !inv.lineProductFieldId
    || !inv.lineQtyFieldId || !inv.linePriceFieldId
    || !inv.statusDraft || !inv.statusOrdered || !inv.statusReceived || !inv.statusCancelled) {
    throw new RowWriteError('denied', 'Закупки не настроены')
  }
  return inv as PurchaseInventory
}

function team(actor: AppV2Actor) {
  if (!actor.authenticated || !actor.id) throw new RowWriteError('denied', 'Для изменения данных нужно войти')
  if (!actor.roleIds.includes('owner') && !actor.roleIds.includes('staff')) {
    throw new RowWriteError('denied', 'Заказы поставщикам доступны кладовщику и владельцу')
  }
}

function ownerOnly(actor: AppV2Actor) {
  if (!actor.authenticated || !actor.id) throw new RowWriteError('denied', 'Для изменения данных нужно войти')
  if (!actor.roleIds.includes('owner')) throw new RowWriteError('denied', 'Это действие доступно только владельцу')
}

function relationId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const id = value.find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    return id?.trim() ?? null
  }
  return null
}

function relationIds(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

function money(value: number) {
  return Math.round(value * 100) / 100
}

function textOf(value: unknown, label: string, max = 2000) {
  if (value == null || value === '') return ''
  if (typeof value !== 'string') throw new RowWriteError('invalid', `${label} должен быть текстом`)
  const text = value.trim()
  if (text.length > max) throw new RowWriteError('invalid', `${label} не длиннее ${max} символов`)
  return text
}

function actorStamp(actor: AppV2Actor) {
  return {
    at: new Date().toISOString(),
    by: (actor.email || actor.id || '').trim() || 'unknown',
  }
}

/** Lines travel in the form as JSON and are never stored on the order row. */
export function parsePurchaseLines(value: unknown): PurchaseLineInput[] {
  let parsed: unknown = value
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) throw new RowWriteError('invalid', 'Добавьте хотя бы одну позицию')
    if (text.length > 200_000) throw new RowWriteError('invalid', 'Состав заказа слишком большой')
    try { parsed = JSON.parse(text) } catch { throw new RowWriteError('invalid', 'Не удалось прочитать состав заказа') }
  }
  const lines = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { lines?: unknown }).lines)
      ? (parsed as { lines: unknown[] }).lines
      : null
  if (!lines?.length) throw new RowWriteError('invalid', 'Добавьте хотя бы одну позицию')
  if (lines.length > 50) throw new RowWriteError('invalid', 'В заказе не больше 50 позиций')
  const seen = new Set<string>()
  return lines.map(line => {
    if (!line || typeof line !== 'object') throw new RowWriteError('invalid', 'Проверьте позиции заказа')
    const productId = typeof (line as { productId?: unknown }).productId === 'string' ? (line as { productId: string }).productId.trim() : ''
    const qty = Number((line as { qty?: unknown }).qty)
    const price = Number((line as { price?: unknown }).price)
    if (!productId) throw new RowWriteError('invalid', 'Выберите товар в каждой позиции')
    if (seen.has(productId)) throw new RowWriteError('invalid', 'Товар уже есть в заказе. Измените количество.')
    seen.add(productId)
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 1_000_000) throw new RowWriteError('invalid', 'Укажите целое количество от 1 до 1 000 000')
    if (!Number.isFinite(price) || price < 0 || price > 100_000_000) throw new RowWriteError('invalid', 'Укажите цену от 0 до 100 000 000')
    return { productId, qty, price: money(price) }
  })
}

async function liveRows(write: RowTransaction, tableId: string, ids: string[]) {
  if (!ids.length) return []
  return write.tx.select().from(rows).where(and(eq(rows.tableId, tableId), inArray(rows.id, ids), isNull(rows.deletedAt)))
}

async function nextPurchaseNumber(write: RowTransaction, inv: PurchaseInventory) {
  const existing = await write.tx.select({ data: rows.data }).from(rows)
    .where(and(eq(rows.tableId, inv.purchaseOrdersTableId), isNull(rows.deletedAt)))
  let max = 0
  for (const row of existing) {
    const value = String((row.data as Record<string, unknown>)[inv.purchaseNumberFieldId] ?? '').trim()
    const match = /^ЗК?-(\d+)$/u.exec(value) || /^З-(\d+)$/u.exec(value)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `ЗК-${String(max + 1).padStart(4, '0')}`
}

async function header(write: RowTransaction, app: AppV2, actor: AppV2Actor, values: Record<string, AppV2Json>, operation: 'create' | 'update', orderId?: string) {
  const inv = purchases(app)
  team(actor)
  const supplierId = relationId(values[inv.purchaseSupplierFieldId])
  const warehouseId = relationId(values[inv.purchaseWarehouseFieldId])
  if (!warehouseId) throw new RowWriteError('invalid', 'Выберите склад')
  const date = textOf(values[inv.purchaseDateFieldId], 'Дата', 80)
  if (!date) throw new RowWriteError('invalid', 'Укажите дату заказа')
  const comment = textOf(values[inv.purchaseCommentFieldId], 'Комментарий')
  const lines = parsePurchaseLines(values[inv.purchasePayloadFieldId]).sort((a, b) => a.productId.localeCompare(b.productId))
  const rawPayload = values[inv.purchasePayloadFieldId]
  const payload: AppV2Json = typeof rawPayload === 'string' ? rawPayload : JSON.stringify({ lines })
  const checked: Record<string, AppV2Json> = {
    [inv.purchaseSupplierFieldId]: supplierId ? [supplierId] : [],
    [inv.purchaseWarehouseFieldId]: [warehouseId],
    [inv.purchaseDateFieldId]: date,
    [inv.purchaseCommentFieldId]: comment,
    [inv.purchasePayloadFieldId]: payload,
  }
  const decision = authorizeAppV2Write(app, actor, operation === 'update' && orderId
    ? { operation: 'update', row: { id: orderId, tableId: inv.purchaseOrdersTableId, values }, values: checked }
    : { operation: 'create', tableId: inv.purchaseOrdersTableId, values: checked })
  if (!decision.ok) throw new RowWriteError('denied', decision.error)
  let supplierName = 'без поставщика'
  if (supplierId) {
    const [supplier] = await liveRows(write, inv.suppliersTableId, [supplierId])
    if (!supplier) throw new RowWriteError('invalid', 'Поставщик недоступен')
    supplierName = String((supplier.data as Record<string, unknown>)[inv.supplierNameFieldId] ?? 'Поставщик').trim() || 'Поставщик'
  }
  const [warehouse] = await liveRows(write, inv.warehousesTableId, [warehouseId])
  if (!warehouse) throw new RowWriteError('invalid', 'Склад недоступен')
  const products = await liveRows(write, inv.itemsTableId, lines.map(line => line.productId))
  if (products.length !== lines.length) throw new RowWriteError('invalid', 'Товар недоступен')
  const names = new Map(products.map(row => [row.id, String((row.data as Record<string, unknown>)[inv.itemNameFieldId] ?? 'Товар')]))
  const total = money(lines.reduce((sum, line) => sum + line.qty * line.price, 0))
  return { inv, supplierId, warehouseId, date, comment, lines, names, total, title: `Заказ · ${supplierName}`.slice(0, 180) }
}

async function replaceLines(write: RowTransaction, inv: PurchaseInventory, actor: AppV2Actor, orderId: string, previous: string[], lines: PurchaseLineInput[], names: Map<string, string>) {
  for (const id of previous) await deleteRow(write, inv.purchaseLinesTableId, id, actorKind(actor))
  const created: string[] = []
  for (const line of lines) {
    const row = await createRow(write, inv.purchaseLinesTableId, {
      [inv.lineNameFieldId]: (names.get(line.productId) ?? 'Товар').slice(0, 200),
      [inv.lineOrderFieldId]: [orderId],
      [inv.lineProductFieldId]: [line.productId],
      [inv.lineQtyFieldId]: line.qty,
      [inv.linePriceFieldId]: line.price,
    }, actorKind(actor), { origin: 'runtime' })
    created.push(row.id)
  }
  return created
}

/** Saves a draft order and its lines. The payload field itself is not stored. */
export async function createPurchaseOrder(write: RowTransaction, app: AppV2, actor: AppV2Actor, values: Record<string, AppV2Json>) {
  const draft = await header(write, app, actor, values, 'create')
  const { inv } = draft
  const number = await nextPurchaseNumber(write, inv)
  const createdStamp = actorStamp(actor)
  const created = await createRow(write, inv.purchaseOrdersTableId, {
    [inv.purchaseNameFieldId]: draft.title,
    [inv.purchaseNumberFieldId]: number,
    [inv.purchaseSupplierFieldId]: draft.supplierId ? [draft.supplierId] : [],
    [inv.purchaseWarehouseFieldId]: [draft.warehouseId],
    [inv.purchaseDateFieldId]: draft.date,
    [inv.purchaseStatusFieldId]: inv.statusDraft,
    [inv.purchaseTotalFieldId]: draft.total,
    [inv.purchaseCommentFieldId]: draft.comment,
    [inv.purchaseLinesFieldId]: [],
    [inv.purchaseCountFieldId]: draft.lines.length,
    [inv.purchaseCreatedAtFieldId]: createdStamp.at,
    [inv.purchaseCreatedByFieldId]: createdStamp.by,
  }, actorKind(actor), { origin: 'runtime' })
  const lineIds = await replaceLines(write, inv, actor, created.id, [], draft.lines, draft.names)
  await updateRow(write, inv.purchaseOrdersTableId, created.id, { [inv.purchaseLinesFieldId]: lineIds }, actorKind(actor))
  return { id: created.id }
}

/** Replaces lines of a draft or ordered purchase. Received and cancelled orders stay put. */
export async function updatePurchaseOrder(write: RowTransaction, app: AppV2, actor: AppV2Actor, values: Record<string, AppV2Json>, orderId: string | undefined) {
  const inv = purchases(app)
  team(actor)
  if (!orderId) throw new RowWriteError('invalid', 'Откройте заказ поставщику')
  const order = await lockedRow(write, inv.purchaseOrdersTableId, orderId)
  if (!order || order.deletedAt) throw new RowWriteError('missing', 'Заказ недоступен')
  const data = order.data as Record<string, unknown>
  const status = typeof data[inv.purchaseStatusFieldId] === 'string' ? data[inv.purchaseStatusFieldId] : ''
  if (status !== inv.statusDraft && status !== inv.statusOrdered) {
    throw new RowWriteError('invalid', 'Полученный или отменённый заказ нельзя изменить')
  }
  const draft = await header(write, app, actor, values, 'update', orderId)
  const previous = relationIds(data[inv.purchaseLinesFieldId])
  const lineIds = await replaceLines(write, inv, actor, orderId, previous, draft.lines, draft.names)
  await updateRow(write, inv.purchaseOrdersTableId, orderId, {
    [inv.purchaseNameFieldId]: draft.title,
    [inv.purchaseSupplierFieldId]: draft.supplierId ? [draft.supplierId] : [],
    [inv.purchaseWarehouseFieldId]: [draft.warehouseId],
    [inv.purchaseDateFieldId]: draft.date,
    [inv.purchaseTotalFieldId]: draft.total,
    [inv.purchaseCommentFieldId]: draft.comment,
    [inv.purchaseLinesFieldId]: lineIds,
    [inv.purchaseCountFieldId]: draft.lines.length,
  }, actorKind(actor))
  return { id: orderId }
}

/** Черновик → Заказано. Staff and owner. */
export async function orderPurchaseOrder(write: RowTransaction, app: AppV2, actor: AppV2Actor, orderId: string) {
  const inv = purchases(app)
  team(actor)
  const order = await lockedRow(write, inv.purchaseOrdersTableId, orderId)
  if (!order || order.deletedAt) throw new RowWriteError('missing', 'Заказ недоступен')
  const status = (order.data as Record<string, unknown>)[inv.purchaseStatusFieldId]
  if (status !== inv.statusDraft) throw new RowWriteError('invalid', 'Отметить заказанным можно только черновик')
  const stamp = actorStamp(actor)
  await updateRow(write, inv.purchaseOrdersTableId, orderId, {
    [inv.purchaseStatusFieldId]: inv.statusOrdered,
    [inv.purchaseOrderedAtFieldId]: stamp.at,
    [inv.purchaseOrderedByFieldId]: stamp.by,
  }, actorKind(actor))
  return { id: orderId }
}

/**
 * Full receipt of an ordered purchase.
 * One Приход per line into the order warehouse. A second receipt throws.
 */
export async function receivePurchaseOrder(write: RowTransaction, app: AppV2, actor: AppV2Actor, orderId: string) {
  const inv = purchases(app)
  team(actor)
  if (!actor.email) throw new RowWriteError('denied', 'Для приёмки нужно войти')
  const order = await lockedRow(write, inv.purchaseOrdersTableId, orderId)
  if (!order || order.deletedAt) throw new RowWriteError('missing', 'Заказ недоступен')
  const data = order.data as Record<string, unknown>
  const status = data[inv.purchaseStatusFieldId]
  if (status === inv.statusReceived) throw new RowWriteError('invalid', 'Этот заказ уже получен. Повторная приёмка невозможна.')
  if (status !== inv.statusOrdered) throw new RowWriteError('invalid', 'Принять можно только заказ в статусе «Заказано».')
  const warehouseId = relationId(data[inv.purchaseWarehouseFieldId])
  if (!warehouseId) throw new RowWriteError('invalid', 'В заказе не указан склад')
  const lineIds = relationIds(data[inv.purchaseLinesFieldId])
  const stored = await liveRows(write, inv.purchaseLinesTableId, lineIds)
  if (!stored.length) throw new RowWriteError('invalid', 'В заказе нет позиций')
  const lines = stored.map(row => {
    const line = row.data as Record<string, unknown>
    const productId = relationId(line[inv.lineProductFieldId])
    const qty = Number(line[inv.lineQtyFieldId])
    if (!productId || !Number.isSafeInteger(qty) || qty < 1) throw new RowWriteError('invalid', 'Проверьте позиции заказа')
    return { productId, qty }
  }).sort((a, b) => a.productId.localeCompare(b.productId))
  const comment = textOf(data[inv.purchaseCommentFieldId], 'Комментарий')
  const name = String(data[inv.purchaseNameFieldId] ?? 'Заказ')
  const number = String(data[inv.purchaseNumberFieldId] ?? '').trim()
  const note = [`Закупка · ${number || name}`, comment].filter(part => part.trim()).join('. ').slice(0, 2000)
  const when = typeof data[inv.purchaseDateFieldId] === 'string' && String(data[inv.purchaseDateFieldId]).trim()
    ? String(data[inv.purchaseDateFieldId]).trim()
    : new Date().toISOString()
  for (const line of lines) {
    await recordInventoryMovement(write, app, actor, 'receipt', {
      [inv.movementQtyFieldId]: line.qty,
      [inv.movementWarehouseFieldId]: [warehouseId],
      [inv.movementNoteFieldId]: note,
      [inv.movementDateFieldId]: when,
    }, line.productId)
  }
  const stamp = actorStamp(actor)
  await updateRow(write, inv.purchaseOrdersTableId, orderId, {
    [inv.purchaseStatusFieldId]: inv.statusReceived,
    [inv.purchaseReceivedAtFieldId]: stamp.at,
    [inv.purchaseReceivedByFieldId]: stamp.by,
  }, actorKind(actor))
  return { id: orderId }
}

/**
 * Owner cancels a received order and reverses each receipt with a write-off
 * into the order warehouse. Negative stock is refused with a clear error.
 */
export async function cancelPurchaseOrder(write: RowTransaction, app: AppV2, actor: AppV2Actor, orderId: string) {
  const inv = purchases(app)
  ownerOnly(actor)
  if (!actor.email) throw new RowWriteError('denied', 'Для отмены нужно войти')
  const order = await lockedRow(write, inv.purchaseOrdersTableId, orderId)
  if (!order || order.deletedAt) throw new RowWriteError('missing', 'Заказ недоступен')
  const data = order.data as Record<string, unknown>
  const status = data[inv.purchaseStatusFieldId]
  if (status !== inv.statusReceived) throw new RowWriteError('invalid', 'Отменить можно только полученный заказ')
  const warehouseId = relationId(data[inv.purchaseWarehouseFieldId])
  if (!warehouseId) throw new RowWriteError('invalid', 'В заказе не указан склад')
  const lineIds = relationIds(data[inv.purchaseLinesFieldId])
  const stored = await liveRows(write, inv.purchaseLinesTableId, lineIds)
  if (!stored.length) throw new RowWriteError('invalid', 'В заказе нет позиций')
  const lines = stored.map(row => {
    const line = row.data as Record<string, unknown>
    const productId = relationId(line[inv.lineProductFieldId])
    const qty = Number(line[inv.lineQtyFieldId])
    const lineName = String(line[inv.lineNameFieldId] ?? '').trim() || 'Товар'
    if (!productId || !Number.isSafeInteger(qty) || qty < 1) throw new RowWriteError('invalid', 'Проверьте позиции заказа')
    return { productId, qty, name: lineName }
  }).sort((a, b) => a.productId.localeCompare(b.productId))
  const name = String(data[inv.purchaseNameFieldId] ?? 'Заказ')
  const number = String(data[inv.purchaseNumberFieldId] ?? '').trim()
  const label = number || name
  const note = `Отмена закупки · ${label}`.slice(0, 2000)
  const when = new Date().toISOString()
  for (const line of lines) {
    await recordInventoryMovement(write, app, actor, 'write_off', {
      [inv.movementQtyFieldId]: line.qty,
      [inv.movementWarehouseFieldId]: [warehouseId],
      [inv.movementNoteFieldId]: note,
      [inv.movementDateFieldId]: when,
    }, line.productId)
  }
  const stamp = actorStamp(actor)
  await updateRow(write, inv.purchaseOrdersTableId, orderId, {
    [inv.purchaseStatusFieldId]: inv.statusCancelled,
    [inv.purchaseCancelledAtFieldId]: stamp.at,
    [inv.purchaseCancelledByFieldId]: stamp.by,
  }, actorKind(actor))
  return { id: orderId, label, deductions: lines }
}
