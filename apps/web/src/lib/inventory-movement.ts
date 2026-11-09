import type { AppV2, AppV2Actor, AppV2InventoryOperation, AppV2Json } from '@tableapp/schema/app-v2'
import { authorizeAppV2Write } from '@tableapp/schema/app-v2'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { rows } from '@tableapp/db'
import { createRow, lockedRow, RowWriteError, updateRow, type RowTransaction } from './row-mutations'
import { inventoryGuardNegativeStock, inventorySignedDelta, inventoryStockFromMovements, INVENTORY_V2_COPY } from './inventory-stock'

function relationId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const id = value.find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    return id?.trim() ?? null
  }
  return null
}

function typeId(inv: NonNullable<AppV2['inventory']>, operation: AppV2InventoryOperation) {
  if (operation === 'receipt') return inv.typeReceipt
  if (operation === 'issue') return inv.typeIssue
  if (operation === 'write_off') return inv.typeWriteOff
  return inv.typeTransfer
}

/** Records one stock movement (or a transfer pair) with computed signed qty and negative-stock guard. */
export async function recordInventoryMovement(
  write: RowTransaction,
  app: AppV2,
  actor: AppV2Actor,
  operation: AppV2InventoryOperation,
  formValues: Record<string, AppV2Json>,
  productId: string,
) {
  const inv = app.inventory
  if (!inv) throw new RowWriteError('denied', 'Складская операция не настроена')
  if (!actor.authenticated || !actor.email || !actor.id) throw new RowWriteError('denied', 'Для изменения данных нужно войти')
  if (operation === 'write_off' && !actor.roleIds.includes('owner')) {
    throw new RowWriteError('denied', 'Списание доступно только владельцу')
  }
  const copy = INVENTORY_V2_COPY[operation]
  const qtyRaw = formValues[inv.movementQtyFieldId]
  const quantity = typeof qtyRaw === 'number' ? qtyRaw : Number(qtyRaw)
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
    throw new RowWriteError('invalid', 'Укажите целое количество от 1 до 1 000 000')
  }
  const note = typeof formValues[inv.movementNoteFieldId] === 'string' ? String(formValues[inv.movementNoteFieldId]) : ''
  if (note.length > 2000) throw new RowWriteError('invalid', 'Комментарий не длиннее 2000 символов')
  if (operation === 'write_off' && !note.trim()) throw new RowWriteError('invalid', 'Укажите причину списания')
  const warehouseId = relationId(formValues[inv.movementWarehouseFieldId])
  if (!warehouseId) throw new RowWriteError('invalid', 'Выберите склад')
  const warehouseToId = relationId(formValues[inv.movementWarehouseToFieldId])
  if (operation === 'transfer') {
    if (!warehouseToId) throw new RowWriteError('invalid', 'Выберите склад назначения')
    if (warehouseToId === warehouseId) throw new RowWriteError('invalid', 'Склад назначения должен отличаться от склада списания')
  }

  const decision = authorizeAppV2Write(app, actor, {
    operation: 'create',
    tableId: inv.movementsTableId,
    values: {
      [inv.movementQtyFieldId]: quantity,
      [inv.movementWarehouseFieldId]: [warehouseId],
      [inv.movementNoteFieldId]: note,
      ...(operation === 'transfer' && warehouseToId ? { [inv.movementWarehouseToFieldId]: [warehouseToId] } : {}),
    },
  })
  if (!decision.ok) throw new RowWriteError('denied', decision.error)

  const item = await lockedRow(write, inv.itemsTableId, productId)
  if (!item || item.deletedAt) throw new RowWriteError('denied', 'Товар недоступен')
  const itemData = item.data as Record<string, unknown>
  const name = String(itemData[inv.itemNameFieldId] ?? 'Товар')
  const linked = Array.isArray(itemData[inv.itemMovementsFieldId])
    ? (itemData[inv.itemMovementsFieldId] as unknown[]).filter((id): id is string => typeof id === 'string')
    : []
  const journal = linked.length
    ? await write.tx.select({ id: rows.id, data: rows.data }).from(rows)
      .where(and(eq(rows.tableId, inv.movementsTableId), isNull(rows.deletedAt), inArray(rows.id, linked)))
    : []
  const movements = journal.map(row => {
    const data = row.data as Record<string, unknown>
    return {
      qty: Number(data[inv.movementQtyFieldId] ?? 0),
      warehouseId: relationId(data[inv.movementWarehouseFieldId]),
    }
  })
  const opening = Number(itemData[inv.itemOpeningFieldId] ?? 0)
  const stockAt = (warehouse: string) => opening + inventoryStockFromMovements(movements, warehouse)
  const now = new Date().toISOString()
  const kind = typeId(inv, operation)
  const actorKind = { id: actor.id, kind: 'app_user' as const }
  const createdIds: string[] = []

  const writeLeg = async (args: {
    warehouse: string
    warehouseTo?: string | null
    delta: number
    before: number
    after: number
    label: string
  }) => {
    const values: Record<string, unknown> = {
      [inv.movementNameFieldId]: args.label,
      [inv.movementItemFieldId]: [productId],
      [inv.movementQtyFieldId]: args.delta,
      [inv.movementTypeFieldId]: kind,
      [inv.movementWarehouseFieldId]: [args.warehouse],
      [inv.movementDateFieldId]: now,
      [inv.movementNoteFieldId]: note,
      [inv.movementAuthorFieldId]: actor.email,
      ...(inv.movementBeforeFieldId ? { [inv.movementBeforeFieldId]: args.before } : {}),
      ...(inv.movementAfterFieldId ? { [inv.movementAfterFieldId]: args.after } : {}),
      ...(args.warehouseTo ? { [inv.movementWarehouseToFieldId]: [args.warehouseTo] } : {}),
    }
    const created = await createRow(write, inv.movementsTableId, values, actorKind, { origin: 'runtime' })
    createdIds.push(created.id)
    return created.id
  }

  if (operation === 'transfer') {
    const beforeFrom = stockAt(warehouseId)
    const outDelta = inventorySignedDelta(operation, quantity, 'out')
    const guardedOut = inventoryGuardNegativeStock(beforeFrom, outDelta, quantity)
    if (!guardedOut.ok) throw new RowWriteError('invalid', guardedOut.error)
    const beforeTo = stockAt(warehouseToId!)
    const inDelta = inventorySignedDelta(operation, quantity, 'in')
    await writeLeg({
      warehouse: warehouseId,
      warehouseTo: warehouseToId,
      delta: outDelta,
      before: beforeFrom,
      after: guardedOut.after,
      label: `${copy.name} · ${name}`,
    })
    await writeLeg({
      warehouse: warehouseToId!,
      warehouseTo: warehouseId,
      delta: inDelta,
      before: beforeTo,
      after: beforeTo + inDelta,
      label: `${copy.name} · ${name}`,
    })
  } else {
    const delta = inventorySignedDelta(operation, quantity)
    const before = stockAt(warehouseId)
    const guarded = inventoryGuardNegativeStock(before, delta, quantity)
    if (!guarded.ok) throw new RowWriteError('invalid', guarded.error)
    await writeLeg({
      warehouse: warehouseId,
      delta,
      before,
      after: guarded.after,
      label: `${copy.name} · ${name}`,
    })
  }

  await updateRow(write, inv.itemsTableId, productId, {
    [inv.itemMovementsFieldId]: [...new Set([...linked, ...createdIds])],
  }, actorKind)

  return { id: createdIds[0]!, ids: createdIds }
}
