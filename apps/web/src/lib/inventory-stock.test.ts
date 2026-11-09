import { describe, expect, it } from 'vitest'
import {
  inventoryGuardNegativeStock,
  inventorySignedDelta,
  inventoryStockFromMovements,
  inventoryWarehouseBalances,
} from './inventory-stock'

describe('inventory stock computation', () => {
  it('sums signed movements per product and per warehouse', () => {
    const movements = [
      { qty: 10, warehouseId: 'wh_main' },
      { qty: 4, warehouseId: 'wh_tool' },
      { qty: -3, warehouseId: 'wh_main' },
      { qty: -2, warehouseId: 'wh_main' },
      { qty: 2, warehouseId: 'wh_tool' },
    ]
    expect(inventoryStockFromMovements(movements)).toBe(11)
    expect(inventoryStockFromMovements(movements, 'wh_main')).toBe(5)
    expect(inventoryStockFromMovements(movements, 'wh_tool')).toBe(6)
    expect(Object.fromEntries(inventoryWarehouseBalances(movements))).toEqual({ wh_main: 5, wh_tool: 6 })
  })

  it('signs receipt, issue, write-off and transfer legs', () => {
    expect(inventorySignedDelta('receipt', 5)).toBe(5)
    expect(inventorySignedDelta('issue', 2)).toBe(-2)
    expect(inventorySignedDelta('write_off', 1)).toBe(-1)
    expect(inventorySignedDelta('transfer', 3, 'out')).toBe(-3)
    expect(inventorySignedDelta('transfer', 3, 'in')).toBe(3)
    expect(inventorySignedDelta('issue', 0)).toBeNaN()
  })

  it('blocks negative stock with a clear Russian error', () => {
    expect(inventoryGuardNegativeStock(4, -2, 2)).toEqual({ ok: true, after: 2 })
    expect(inventoryGuardNegativeStock(4, -5, 5)).toEqual({
      ok: false,
      error: 'Недостаточно товара: доступно 4 шт., запрошено 5 шт.',
    })
    expect(inventoryGuardNegativeStock(-1, -1, 1).ok).toBe(false)
  })
})
