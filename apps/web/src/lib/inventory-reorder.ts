import type { AppV2, AppV2Actor, AppV2Json } from '@tableapp/schema/app-v2'
import { and, eq, isNull } from 'drizzle-orm'
import { rows } from '@tableapp/db'
import { RowWriteError, type RowTransaction } from './row-mutations'
import { createPurchaseOrder, type PurchaseLineInput } from './purchase-order'
import { inventoryStockFromMovements } from './inventory-stock'

export type ReorderPick = { productId: string; qty?: number }

type ReorderInventory = NonNullable<AppV2['inventory']> & {
  purchaseOrdersTableId: string
  purchaseSupplierFieldId: string
  purchaseWarehouseFieldId: string
  purchaseDateFieldId: string
  purchasePayloadFieldId: string
  purchaseLinesTableId: string
  lineProductFieldId: string
  lineQtyFieldId: string
  linePriceFieldId: string
  lineOrderFieldId: string
  statusReceived: string
  purchaseStatusFieldId: string
  purchaseReceivedAtFieldId: string
  suppliersTableId: string
}

function reorders(app: AppV2): ReorderInventory {
  const inv = app.inventory
  if (!inv?.purchaseOrdersTableId || !inv.purchaseSupplierFieldId || !inv.purchaseWarehouseFieldId
    || !inv.purchaseDateFieldId || !inv.purchasePayloadFieldId || !inv.purchaseLinesTableId
    || !inv.lineProductFieldId || !inv.lineQtyFieldId || !inv.linePriceFieldId || !inv.lineOrderFieldId
    || !inv.statusReceived || !inv.purchaseStatusFieldId || !inv.purchaseReceivedAtFieldId
    || !inv.suppliersTableId) {
    throw new RowWriteError('denied', 'Закупки не настроены')
  }
  return inv as ReorderInventory
}

function team(actor: AppV2Actor) {
  if (!actor.authenticated || !actor.id) throw new RowWriteError('denied', 'Для изменения данных нужно войти')
  if (!actor.roleIds.includes('owner') && !actor.roleIds.includes('staff')) {
    throw new RowWriteError('denied', 'Заказы поставщикам доступны кладовщику и владельцу')
  }
}

function relationId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const id = value.find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    return id?.trim() ?? null
  }
  return null
}

/** Parses `{products:[{productId,qty?}]}` from the reorder form payload. */
export function parseReorderPicks(raw: unknown): ReorderPick[] {
  const parsed = typeof raw === 'string'
    ? (() => { try { return JSON.parse(raw) as unknown } catch { throw new RowWriteError('invalid', 'Список товаров повреждён') } })()
    : raw
  const list = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as { products?: unknown }).products)
    ? (parsed as { products: unknown[] }).products
    : Array.isArray(parsed) ? parsed : null
  if (!list?.length) throw new RowWriteError('invalid', 'Выберите товары для заказа')
  if (list.length > 100) throw new RowWriteError('invalid', 'За один раз не больше 100 товаров')
  const seen = new Set<string>()
  const picks: ReorderPick[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') throw new RowWriteError('invalid', 'Строка выбора повреждена')
    const row = item as Record<string, unknown>
    const productId = relationId(row.productId) ?? relationId(row.product) ?? (typeof row.id === 'string' ? row.id : null)
    if (!productId) throw new RowWriteError('invalid', 'Выберите товар')
    if (seen.has(productId)) continue
    seen.add(productId)
    const qtyRaw = row.qty ?? row.quantity
    const qty = qtyRaw == null || qtyRaw === '' ? undefined : typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw)
    if (qty !== undefined && (!Number.isSafeInteger(qty) || qty < 1 || qty > 1_000_000)) {
      throw new RowWriteError('invalid', 'Количество — целое число от 1 до 1 000 000')
    }
    picks.push({ productId, ...(qty !== undefined ? { qty } : {}) })
  }
  return picks
}

async function lastPurchaseHint(
  write: RowTransaction,
  inv: ReorderInventory,
  productId: string,
): Promise<{ supplierId: string | null; price: number }> {
  const lines = await write.tx.select().from(rows)
    .where(and(eq(rows.tableId, inv.purchaseLinesTableId), isNull(rows.deletedAt)))
  const matching = lines.filter(row => relationId((row.data as Record<string, unknown>)[inv.lineProductFieldId]) === productId)
  if (!matching.length) return { supplierId: null, price: 0 }
  const orderIds = [...new Set(matching.map(row => relationId((row.data as Record<string, unknown>)[inv.lineOrderFieldId])).filter((id): id is string => Boolean(id)))]
  if (!orderIds.length) return { supplierId: null, price: 0 }
  const orders = await write.tx.select().from(rows)
    .where(and(eq(rows.tableId, inv.purchaseOrdersTableId), isNull(rows.deletedAt)))
  let best: { at: string; supplierId: string | null; price: number } | null = null
  for (const order of orders) {
    if (!orderIds.includes(order.id)) continue
    const data = order.data as Record<string, unknown>
    if (data[inv.purchaseStatusFieldId] !== inv.statusReceived) continue
    const at = String(data[inv.purchaseReceivedAtFieldId] ?? data[inv.purchaseDateFieldId] ?? '')
    const line = matching.find(row => relationId((row.data as Record<string, unknown>)[inv.lineOrderFieldId]) === order.id)
    const price = Number((line?.data as Record<string, unknown> | undefined)?.[inv.linePriceFieldId] ?? 0)
    if (!best || at > best.at) {
      best = { at, supplierId: relationId(data[inv.purchaseSupplierFieldId]), price: Number.isFinite(price) ? price : 0 }
    }
  }
  return best ? { supplierId: best.supplierId, price: best.price } : { supplierId: null, price: 0 }
}

async function productSnapshot(
  write: RowTransaction,
  app: AppV2,
  productId: string,
) {
  const inv = app.inventory!
  const [row] = await write.tx.select().from(rows)
    .where(and(eq(rows.id, productId), eq(rows.tableId, inv.itemsTableId), isNull(rows.deletedAt))).limit(1)
  if (!row) throw new RowWriteError('invalid', 'Товар не найден')
  const data = row.data as Record<string, unknown>
  const linked = Array.isArray(data[inv.itemMovementsFieldId])
    ? (data[inv.itemMovementsFieldId] as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  const linkedRows = linked.length
    ? await write.tx.select({ id: rows.id, data: rows.data }).from(rows)
      .where(and(eq(rows.tableId, inv.movementsTableId), isNull(rows.deletedAt)))
    : []
  const stockMoves = linkedRows
    .filter(entry => linked.includes(entry.id))
    .map(entry => ({
      qty: Number((entry.data as Record<string, unknown>)[inv.movementQtyFieldId] ?? 0),
      warehouseId: relationId((entry.data as Record<string, unknown>)[inv.movementWarehouseFieldId]),
    }))
  const opening = Number(data[inv.itemOpeningFieldId] ?? 0)
  const stock = opening + inventoryStockFromMovements(stockMoves)
  const min = Number(data[inv.itemMinFieldId] ?? 0)
  const cost = Number(data[inv.itemCostFieldId] ?? 0)
  const warehouseId = relationId(data[inv.itemWarehouseFieldId])
  return {
    id: productId,
    name: String(data[inv.itemNameFieldId] ?? 'Товар'),
    stock: Number.isFinite(stock) ? Math.trunc(stock) : 0,
    min: Number.isFinite(min) ? Math.trunc(min) : 0,
    cost: Number.isFinite(cost) ? cost : 0,
    warehouseId,
  }
}

/** Creates draft purchase orders grouped by last supplier for selected low-stock products. */
export async function createReorderOrders(
  write: RowTransaction,
  app: AppV2,
  actor: AppV2Actor,
  values: Record<string, AppV2Json>,
) {
  team(actor)
  const inv = reorders(app)
  const payloadField = inv.reorderPayloadFieldId ?? inv.purchasePayloadFieldId
  const picks = parseReorderPicks(values[payloadField])
  const groups = new Map<string | null, PurchaseLineInput[]>()
  let defaultWarehouse: string | null = null
  for (const pick of picks) {
    const product = await productSnapshot(write, app, pick.productId)
    if (!defaultWarehouse && product.warehouseId) defaultWarehouse = product.warehouseId
    const hint = await lastPurchaseHint(write, inv, pick.productId)
    const suggested = Math.max(1, product.min - product.stock)
    const qty = pick.qty ?? suggested
    const price = hint.price > 0 ? hint.price : product.cost
    const key = hint.supplierId
    const list = groups.get(key) ?? []
    list.push({ productId: pick.productId, qty, price })
    groups.set(key, list)
  }
  if (!defaultWarehouse) throw new RowWriteError('invalid', 'У выбранных товаров нет склада')
  const today = new Date().toISOString().slice(0, 10)
  const createdIds: string[] = []
  let firstId: string | null = null
  for (const [supplierId, lines] of groups) {
    const payload = JSON.stringify({ lines })
    const formValues: Record<string, AppV2Json> = {
      [inv.purchaseWarehouseFieldId]: [defaultWarehouse],
      [inv.purchaseDateFieldId]: today,
      [inv.purchasePayloadFieldId]: payload,
      ...(supplierId ? { [inv.purchaseSupplierFieldId]: [supplierId] } : { [inv.purchaseSupplierFieldId]: [] }),
    }
    const saved = await createPurchaseOrder(write, app, actor, formValues)
    createdIds.push(saved.id)
    if (!firstId) firstId = saved.id
  }
  return { id: firstId!, ids: createdIds, groups: createdIds.length }
}
