import type { AppV2, AppV2Actor, AppV2Json } from '@tableapp/schema/app-v2'
import { authorizeAppV2Write } from '@tableapp/schema/app-v2'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { rows } from '@tableapp/db'
import { createRow, deleteRow, lockedRow, RowWriteError, updateRow, type RowTransaction } from './row-mutations'
import { inventoryGuardNegativeStock, inventoryStockFromMovements } from './inventory-stock'

export type CountLineInput = { productId: string; actualQty: number }
export type CountDiscrepancy = {
  productId: string
  name: string
  systemQty: number
  actualQty: number
  diff: number
  amount: number
  cost: number
}

type CountInventory = NonNullable<AppV2['inventory']> & {
  inventoryCountsTableId: string
  inventoryCountLinesTableId: string
  typeInventory: string
  countNameFieldId: string
  countNumberFieldId: string
  countWarehouseFieldId: string
  countDateFieldId: string
  countStatusFieldId: string
  countAuthorFieldId: string
  countLinesFieldId: string
  countProductCountFieldId: string
  countDiscrepancyCountFieldId: string
  countShortageFieldId: string
  countSurplusFieldId: string
  countPayloadFieldId: string
  countCreatedAtFieldId: string
  countCreatedByFieldId: string
  countPostedAtFieldId: string
  countPostedByFieldId: string
  countCancelledAtFieldId: string
  countCancelledByFieldId: string
  countLineNameFieldId: string
  countLineCountFieldId: string
  countLineProductFieldId: string
  countLineSystemFieldId: string
  countLineActualFieldId: string
  countLineDiffFieldId: string
  countLineAmountFieldId: string
  countStatusDraft: string
  countStatusPosted: string
  countStatusCancelled: string
}

const actorKind = (actor: AppV2Actor) => ({ id: actor.id!, kind: 'app_user' as const })

function counts(app: AppV2): CountInventory {
  const inv = app.inventory
  if (!inv?.inventoryCountsTableId || !inv.inventoryCountLinesTableId || !inv.typeInventory
    || !inv.countNameFieldId || !inv.countNumberFieldId || !inv.countWarehouseFieldId
    || !inv.countDateFieldId || !inv.countStatusFieldId || !inv.countAuthorFieldId
    || !inv.countLinesFieldId || !inv.countProductCountFieldId || !inv.countDiscrepancyCountFieldId
    || !inv.countShortageFieldId || !inv.countSurplusFieldId || !inv.countPayloadFieldId
    || !inv.countCreatedAtFieldId || !inv.countCreatedByFieldId
    || !inv.countPostedAtFieldId || !inv.countPostedByFieldId
    || !inv.countCancelledAtFieldId || !inv.countCancelledByFieldId
    || !inv.countLineNameFieldId || !inv.countLineCountFieldId || !inv.countLineProductFieldId
    || !inv.countLineSystemFieldId || !inv.countLineActualFieldId
    || !inv.countLineDiffFieldId || !inv.countLineAmountFieldId
    || !inv.countStatusDraft || !inv.countStatusPosted || !inv.countStatusCancelled) {
    throw new RowWriteError('denied', 'Инвентаризация не настроена')
  }
  return inv as CountInventory
}

function team(actor: AppV2Actor) {
  if (!actor.authenticated || !actor.id) throw new RowWriteError('denied', 'Для изменения данных нужно войти')
  if (!actor.roleIds.includes('owner') && !actor.roleIds.includes('staff')) {
    throw new RowWriteError('denied', 'Инвентаризация доступна кладовщику и владельцу')
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

/** Parses `{lines:[{productId,actualQty}]}` or JSON string from the form payload. */
export function parseCountLines(raw: unknown): CountLineInput[] {
  const parsed = typeof raw === 'string'
    ? (() => { try { return JSON.parse(raw) as unknown } catch { throw new RowWriteError('invalid', 'Состав пересчёта повреждён') } })()
    : raw
  const list = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as { lines?: unknown }).lines)
    ? (parsed as { lines: unknown[] }).lines
    : Array.isArray(parsed) ? parsed : null
  if (!list) throw new RowWriteError('invalid', 'Укажите позиции пересчёта')
  if (list.length > 200) throw new RowWriteError('invalid', 'В пересчёте не больше 200 позиций')
  const seen = new Set<string>()
  const lines: CountLineInput[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') throw new RowWriteError('invalid', 'Позиция пересчёта повреждена')
    const row = item as Record<string, unknown>
    const productId = relationId(row.productId) ?? relationId(row.product)
    if (!productId) throw new RowWriteError('invalid', 'Выберите товар в позиции')
    if (seen.has(productId)) throw new RowWriteError('invalid', 'Один товар нельзя указать дважды')
    seen.add(productId)
    const qtyRaw = row.actualQty ?? row.actual ?? row.qty
    const actualQty = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw)
    if (!Number.isSafeInteger(actualQty) || actualQty < 0 || actualQty > 1_000_000) {
      throw new RowWriteError('invalid', 'Факт — целое число от 0 до 1 000 000')
    }
    lines.push({ productId, actualQty })
  }
  return lines
}

async function nextNumber(write: RowTransaction, inv: CountInventory) {
  const existing = await write.tx.select({ data: rows.data }).from(rows)
    .where(and(eq(rows.tableId, inv.inventoryCountsTableId), isNull(rows.deletedAt)))
  let max = 0
  for (const row of existing) {
    const raw = String((row.data as Record<string, unknown>)[inv.countNumberFieldId] ?? '')
    const match = /^ИН-(\d+)$/.exec(raw)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `ИН-${String(max + 1).padStart(4, '0')}`
}

async function warehouseLabel(write: RowTransaction, inv: CountInventory, warehouseId: string) {
  const [row] = await write.tx.select({ data: rows.data }).from(rows)
    .where(and(eq(rows.id, warehouseId), eq(rows.tableId, inv.warehousesTableId), isNull(rows.deletedAt))).limit(1)
  if (!row) throw new RowWriteError('invalid', 'Склад не найден')
  return String((row.data as Record<string, unknown>)[inv.warehouseNameFieldId] ?? 'Склад')
}

async function productStockAtWarehouse(
  write: RowTransaction,
  inv: CountInventory,
  productId: string,
  warehouseId: string,
) {
  const item = await lockedRow(write, inv.itemsTableId, productId)
  if (!item || item.deletedAt) throw new RowWriteError('denied', 'Товар недоступен')
  const data = item.data as Record<string, unknown>
  const linked = Array.isArray(data[inv.itemMovementsFieldId])
    ? (data[inv.itemMovementsFieldId] as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  const journal = linked.length
    ? await write.tx.select({ id: rows.id, data: rows.data }).from(rows)
      .where(and(eq(rows.tableId, inv.movementsTableId), isNull(rows.deletedAt), inArray(rows.id, linked)))
    : []
  const movements = journal.map(row => {
    const movement = row.data as Record<string, unknown>
    return {
      qty: Number(movement[inv.movementQtyFieldId] ?? 0),
      warehouseId: relationId(movement[inv.movementWarehouseFieldId]),
    }
  })
  const opening = Number(data[inv.itemOpeningFieldId] ?? 0)
  const stock = opening + inventoryStockFromMovements(movements, warehouseId)
  return {
    item,
    data,
    linked,
    name: String(data[inv.itemNameFieldId] ?? 'Товар'),
    cost: Number(data[inv.itemCostFieldId] ?? 0),
    stock: Number.isFinite(stock) ? stock : 0,
  }
}

async function productsForWarehouse(write: RowTransaction, inv: CountInventory, warehouseId: string) {
  const all = await write.tx.select().from(rows)
    .where(and(eq(rows.tableId, inv.itemsTableId), isNull(rows.deletedAt)))
  return all.filter(row => {
    const warehouse = (row.data as Record<string, unknown>)[inv.itemWarehouseFieldId]
    return relationId(warehouse) === warehouseId
  })
}

function summarize(lines: { systemQty: number; actualQty: number; amount: number }[]) {
  let discrepancyCount = 0, shortage = 0, surplus = 0
  for (const line of lines) {
    const diff = line.actualQty - line.systemQty
    if (diff !== 0) discrepancyCount += 1
    if (line.amount < 0) shortage += -line.amount
    if (line.amount > 0) surplus += line.amount
  }
  return {
    productCount: lines.length,
    discrepancyCount,
    shortage: money(shortage),
    surplus: money(surplus),
  }
}

async function replaceLines(
  write: RowTransaction,
  inv: CountInventory,
  actor: AppV2Actor,
  countId: string,
  warehouseId: string,
  inputs: CountLineInput[] | null,
) {
  const kind = actorKind(actor)
  const existing = await write.tx.select().from(rows)
    .where(and(eq(rows.tableId, inv.inventoryCountLinesTableId), isNull(rows.deletedAt)))
  for (const row of existing) {
    const data = row.data as Record<string, unknown>
    if (relationId(data[inv.countLineCountFieldId]) === countId) {
      await deleteRow(write, inv.inventoryCountLinesTableId, row.id, kind)
    }
  }
  const products = inputs
    ? null
    : await productsForWarehouse(write, inv, warehouseId)
  const source = inputs ?? products!.map(row => ({ productId: row.id, actualQty: -1 }))
  if (!source.length) throw new RowWriteError('invalid', 'На этом складе нет товаров для пересчёта')
  const createdIds: string[] = []
  const metrics: { systemQty: number; actualQty: number; amount: number }[] = []
  for (const entry of source) {
    const loaded = await productStockAtWarehouse(write, inv, entry.productId, warehouseId)
    const systemQty = Math.max(0, Math.trunc(loaded.stock))
    const actualQty = entry.actualQty < 0 ? systemQty : entry.actualQty
    const diff = actualQty - systemQty
    const amount = money(diff * (Number.isFinite(loaded.cost) ? loaded.cost : 0))
    const created = await createRow(write, inv.inventoryCountLinesTableId, {
      [inv.countLineNameFieldId]: loaded.name.slice(0, 180),
      [inv.countLineCountFieldId]: [countId],
      [inv.countLineProductFieldId]: [entry.productId],
      [inv.countLineSystemFieldId]: systemQty,
      [inv.countLineActualFieldId]: actualQty,
      [inv.countLineAmountFieldId]: amount,
    }, kind, { origin: 'runtime' })
    createdIds.push(created.id)
    metrics.push({ systemQty, actualQty, amount })
  }
  return { lineIds: createdIds, ...summarize(metrics) }
}

async function loadDiscrepancies(write: RowTransaction, inv: CountInventory, countId: string): Promise<CountDiscrepancy[]> {
  const lines = await write.tx.select().from(rows)
    .where(and(eq(rows.tableId, inv.inventoryCountLinesTableId), isNull(rows.deletedAt)))
  const result: CountDiscrepancy[] = []
  for (const row of lines) {
    const data = row.data as Record<string, unknown>
    if (relationId(data[inv.countLineCountFieldId]) !== countId) continue
    const productId = relationId(data[inv.countLineProductFieldId])
    if (!productId) continue
    const systemQty = Number(data[inv.countLineSystemFieldId] ?? 0)
    const actualQty = Number(data[inv.countLineActualFieldId] ?? 0)
    const diff = actualQty - systemQty
    if (diff === 0) continue
    const amount = Number(data[inv.countLineAmountFieldId] ?? 0)
    const cost = diff !== 0 ? money(amount / diff) : 0
    result.push({
      productId,
      name: String(data[inv.countLineNameFieldId] ?? 'Товар'),
      systemQty,
      actualQty,
      diff,
      amount: money(amount),
      cost,
    })
  }
  return result
}

async function writeCorrection(
  write: RowTransaction,
  inv: CountInventory,
  actor: AppV2Actor,
  args: {
    productId: string
    warehouseId: string
    delta: number
    note: string
  },
) {
  const loaded = await productStockAtWarehouse(write, inv, args.productId, args.warehouseId)
  const before = loaded.stock
  const after = before + args.delta
  if (after < 0) {
    const guarded = inventoryGuardNegativeStock(before, args.delta, Math.abs(args.delta) || 1)
    if (!guarded.ok) throw new RowWriteError('invalid', guarded.error)
  }
  if (!Number.isSafeInteger(after) || after < 0) {
    throw new RowWriteError('invalid', `Недостаточно товара «${loaded.name}»: доступно ${before} шт.`)
  }
  const kind = actorKind(actor)
  const created = await createRow(write, inv.movementsTableId, {
    [inv.movementNameFieldId]: `Инвентаризация · ${loaded.name}`.slice(0, 180),
    [inv.movementItemFieldId]: [args.productId],
    [inv.movementQtyFieldId]: args.delta,
    [inv.movementTypeFieldId]: inv.typeInventory,
    [inv.movementWarehouseFieldId]: [args.warehouseId],
    [inv.movementDateFieldId]: new Date().toISOString(),
    [inv.movementNoteFieldId]: args.note.slice(0, 2000),
    [inv.movementAuthorFieldId]: actor.email,
    ...(inv.movementBeforeFieldId ? { [inv.movementBeforeFieldId]: before } : {}),
    ...(inv.movementAfterFieldId ? { [inv.movementAfterFieldId]: after } : {}),
  }, kind, { origin: 'runtime' })
  await updateRow(write, inv.itemsTableId, args.productId, {
    [inv.itemMovementsFieldId]: [...new Set([...loaded.linked, created.id])],
  }, kind)
  return created.id
}

/** Creates a draft count for a warehouse, seeding every product of that warehouse. */
export async function createInventoryCount(
  write: RowTransaction,
  app: AppV2,
  actor: AppV2Actor,
  values: Record<string, AppV2Json>,
) {
  team(actor)
  const inv = counts(app)
  const warehouseId = relationId(values[inv.countWarehouseFieldId])
  if (!warehouseId) throw new RowWriteError('invalid', 'Выберите склад')
  const date = textOf(values[inv.countDateFieldId], 'Дата') || new Date().toISOString().slice(0, 10)
  const warehouseName = await warehouseLabel(write, inv, warehouseId)
  const number = await nextNumber(write, inv)
  const now = new Date().toISOString()
  const permission = authorizeAppV2Write(app, actor, {
    operation: 'create',
    tableId: inv.inventoryCountsTableId,
    values: { [inv.countWarehouseFieldId]: [warehouseId], [inv.countDateFieldId]: date },
  })
  if (!permission.ok) throw new RowWriteError('denied', permission.error)
  const created = await createRow(write, inv.inventoryCountsTableId, {
    [inv.countNameFieldId]: `Инвентаризация · ${warehouseName}`.slice(0, 180),
    [inv.countNumberFieldId]: number,
    [inv.countWarehouseFieldId]: [warehouseId],
    [inv.countDateFieldId]: date,
    [inv.countStatusFieldId]: inv.countStatusDraft,
    [inv.countAuthorFieldId]: actor.email ?? '',
    [inv.countLinesFieldId]: [],
    [inv.countProductCountFieldId]: 0,
    [inv.countDiscrepancyCountFieldId]: 0,
    [inv.countShortageFieldId]: 0,
    [inv.countSurplusFieldId]: 0,
    [inv.countCreatedAtFieldId]: now,
    [inv.countCreatedByFieldId]: actor.email ?? '',
  }, actorKind(actor), { origin: 'runtime' })
  const payloadRaw = values[inv.countPayloadFieldId]
  const inputs = payloadRaw == null || payloadRaw === '' ? null : parseCountLines(payloadRaw)
  const seeded = await replaceLines(write, inv, actor, created.id, warehouseId, inputs)
  await updateRow(write, inv.inventoryCountsTableId, created.id, {
    [inv.countLinesFieldId]: seeded.lineIds,
    [inv.countProductCountFieldId]: seeded.productCount,
    [inv.countDiscrepancyCountFieldId]: seeded.discrepancyCount,
    [inv.countShortageFieldId]: seeded.shortage,
    [inv.countSurplusFieldId]: seeded.surplus,
  }, actorKind(actor))
  return { id: created.id, label: number }
}

/** Updates actual quantities on a draft count. */
export async function updateInventoryCount(
  write: RowTransaction,
  app: AppV2,
  actor: AppV2Actor,
  values: Record<string, AppV2Json>,
  countId?: string,
) {
  team(actor)
  const inv = counts(app)
  if (!countId) throw new RowWriteError('invalid', 'Откройте инвентаризацию')
  const current = await lockedRow(write, inv.inventoryCountsTableId, countId)
  if (!current || current.deletedAt) throw new RowWriteError('missing', 'Инвентаризация недоступна')
  const data = current.data as Record<string, unknown>
  if (data[inv.countStatusFieldId] !== inv.countStatusDraft) {
    throw new RowWriteError('invalid', 'Менять можно только черновик')
  }
  const warehouseId = relationId(data[inv.countWarehouseFieldId])
  if (!warehouseId) throw new RowWriteError('invalid', 'В документе нет склада')
  const date = textOf(values[inv.countDateFieldId], 'Дата') || String(data[inv.countDateFieldId] ?? '')
  const lines = parseCountLines(values[inv.countPayloadFieldId])
  const permission = authorizeAppV2Write(app, actor, {
    operation: 'update',
    row: { id: countId, tableId: inv.inventoryCountsTableId, values: data as Record<string, AppV2Json> },
    values: { [inv.countDateFieldId]: date },
  })
  if (!permission.ok) throw new RowWriteError('denied', permission.error)
  const seeded = await replaceLines(write, inv, actor, countId, warehouseId, lines)
  await updateRow(write, inv.inventoryCountsTableId, countId, {
    [inv.countDateFieldId]: date,
    [inv.countLinesFieldId]: seeded.lineIds,
    [inv.countProductCountFieldId]: seeded.productCount,
    [inv.countDiscrepancyCountFieldId]: seeded.discrepancyCount,
    [inv.countShortageFieldId]: seeded.shortage,
    [inv.countSurplusFieldId]: seeded.surplus,
  }, actorKind(actor), { baseVersion: current.version })
  return { id: countId, label: String(data[inv.countNumberFieldId] ?? 'Инвентаризация') }
}

/** Posts a draft: one inventory correction movement per discrepancy. Owner only. */
export async function postInventoryCount(
  write: RowTransaction,
  app: AppV2,
  actor: AppV2Actor,
  countId: string,
) {
  ownerOnly(actor)
  const inv = counts(app)
  const current = await lockedRow(write, inv.inventoryCountsTableId, countId)
  if (!current || current.deletedAt) throw new RowWriteError('missing', 'Инвентаризация недоступна')
  const data = current.data as Record<string, unknown>
  if (data[inv.countStatusFieldId] !== inv.countStatusDraft) {
    throw new RowWriteError('invalid', 'Провести можно только черновик')
  }
  const warehouseId = relationId(data[inv.countWarehouseFieldId])
  if (!warehouseId) throw new RowWriteError('invalid', 'В документе нет склада')
  const number = String(data[inv.countNumberFieldId] ?? '')
  const discrepancies = await loadDiscrepancies(write, inv, countId)
  for (const line of discrepancies) {
    await writeCorrection(write, inv, actor, {
      productId: line.productId,
      warehouseId,
      delta: line.diff,
      note: `${number}: учёт ${line.systemQty} → факт ${line.actualQty}`,
    })
  }
  const now = new Date().toISOString()
  await updateRow(write, inv.inventoryCountsTableId, countId, {
    [inv.countStatusFieldId]: inv.countStatusPosted,
    [inv.countPostedAtFieldId]: now,
    [inv.countPostedByFieldId]: actor.email ?? '',
  }, actorKind(actor), { baseVersion: current.version })
  return { id: countId, label: number || 'Инвентаризация', discrepancies }
}

/** Cancels a posted count by reversing corrections. Owner only. */
export async function cancelInventoryCount(
  write: RowTransaction,
  app: AppV2,
  actor: AppV2Actor,
  countId: string,
) {
  ownerOnly(actor)
  const inv = counts(app)
  const current = await lockedRow(write, inv.inventoryCountsTableId, countId)
  if (!current || current.deletedAt) throw new RowWriteError('missing', 'Инвентаризация недоступна')
  const data = current.data as Record<string, unknown>
  if (data[inv.countStatusFieldId] !== inv.countStatusPosted) {
    throw new RowWriteError('invalid', 'Отменить можно только проведённую инвентаризацию')
  }
  const warehouseId = relationId(data[inv.countWarehouseFieldId])
  if (!warehouseId) throw new RowWriteError('invalid', 'В документе нет склада')
  const number = String(data[inv.countNumberFieldId] ?? '')
  const discrepancies = await loadDiscrepancies(write, inv, countId)
  for (const line of discrepancies) {
    await writeCorrection(write, inv, actor, {
      productId: line.productId,
      warehouseId,
      delta: -line.diff,
      note: `Отмена ${number}: сторно ${line.diff > 0 ? '+' : ''}${line.diff}`,
    })
  }
  const now = new Date().toISOString()
  await updateRow(write, inv.inventoryCountsTableId, countId, {
    [inv.countStatusFieldId]: inv.countStatusCancelled,
    [inv.countCancelledAtFieldId]: now,
    [inv.countCancelledByFieldId]: actor.email ?? '',
  }, actorKind(actor), { baseVersion: current.version })
  return {
    id: countId,
    label: number || 'Инвентаризация',
    deductions: discrepancies.map(line => ({
      productId: line.productId,
      name: line.name,
      qty: Math.abs(line.diff),
    })),
  }
}

export async function previewInventoryCountPost(
  write: RowTransaction,
  app: AppV2,
  countId: string,
) {
  const inv = counts(app)
  return loadDiscrepancies(write, inv, countId)
}
