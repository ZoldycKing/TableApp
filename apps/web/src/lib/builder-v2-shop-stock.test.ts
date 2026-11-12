import { describe, expect, it } from 'vitest'
import { builderV2ShopStockLabel, builderV2ShopStockState } from './builder-v2-shop-stock'

describe('shop stock availability', () => {
  it('shows an exact remaining quantity below the threshold, including four units by default', () => {
    expect(builderV2ShopStockState(4, true)).toBe('low')
    expect(builderV2ShopStockLabel('low', 4)).toBe('Осталось 4 шт.')
    expect(builderV2ShopStockState(5, true)).toBe('in')
    expect(builderV2ShopStockLabel('in', 5)).toBe('В наличии')
  })
  it('uses the business threshold with a strict lower boundary', () => {
    expect(builderV2ShopStockState(9, true, 10)).toBe('low')
    expect(builderV2ShopStockState(10, true, 10)).toBe('in')
    expect(builderV2ShopStockState(1, true, 1)).toBe('in')
  })
  it('keeps unavailable products unavailable and does not invent unknown quantities', () => {
    expect(builderV2ShopStockState(0, true, 10)).toBe('out')
    expect(builderV2ShopStockState(20, false, 10)).toBe('out')
    expect(builderV2ShopStockState(null, true, 10)).toBe('in')
    expect(builderV2ShopStockLabel('out', 0)).toBe('Нет в наличии')
  })
})
