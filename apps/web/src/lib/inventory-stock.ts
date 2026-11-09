import type { AppV2InventoryOperation } from '@tableapp/schema/app-v2'

export type InventoryStockMovement = {
  qty: number
  warehouseId: string | null
  warehouseToId?: string | null
  typeId?: string | null
}

/** Signed delta applied to product stock for one movement row. Transfer pairs cancel at product total. */
export function inventorySignedDelta(operation: AppV2InventoryOperation, quantity: number, leg: 'single' | 'out' | 'in' = 'single'): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return NaN
  if (operation === 'receipt' || leg === 'in') return quantity
  if (operation === 'issue' || operation === 'write_off' || leg === 'out') return -quantity
  return NaN
}

/** Sum signed movement quantities, optionally scoped to one warehouse. */
export function inventoryStockFromMovements(movements: readonly InventoryStockMovement[], warehouseId?: string): number {
  let total = 0
  for (const movement of movements) {
    if (!Number.isFinite(movement.qty)) continue
    if (!warehouseId) {
      total += movement.qty
      continue
    }
    if (movement.warehouseId === warehouseId) total += movement.qty
  }
  return total
}

export function inventoryWarehouseBalances(movements: readonly InventoryStockMovement[]): Map<string, number> {
  const balances = new Map<string, number>()
  for (const movement of movements) {
    if (!movement.warehouseId || !Number.isFinite(movement.qty)) continue
    balances.set(movement.warehouseId, (balances.get(movement.warehouseId) ?? 0) + movement.qty)
  }
  return balances
}

/** Blocks expense/write-off/transfer that would drive stock below zero. */
export function inventoryGuardNegativeStock(before: number, delta: number, requested: number): { ok: true; after: number } | { ok: false; error: string } {
  if (!Number.isSafeInteger(before) || before < 0) {
    return { ok: false, error: 'Остаток некорректен. Проверьте журнал движений.' }
  }
  if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(requested) || requested < 1) {
    return { ok: false, error: 'Укажите целое количество от 1 шт.' }
  }
  const after = before + delta
  if (after < 0) {
    return { ok: false, error: `Недостаточно товара: доступно ${before} шт., запрошено ${requested} шт.` }
  }
  if (!Number.isSafeInteger(after)) {
    return { ok: false, error: 'Количество слишком велико для складского учёта' }
  }
  return { ok: true, after }
}

export const INVENTORY_V2_COPY = {
  receipt: { name: 'Приход', action: 'Оформить приход', quantity: 'Сколько поступило, шт.' },
  issue: { name: 'Расход', action: 'Оформить расход', quantity: 'Сколько списать в расход, шт.' },
  write_off: { name: 'Списание', action: 'Списать товар', quantity: 'Сколько списать, шт.' },
  transfer: { name: 'Перемещение', action: 'Переместить', quantity: 'Сколько переместить, шт.' },
} as const
