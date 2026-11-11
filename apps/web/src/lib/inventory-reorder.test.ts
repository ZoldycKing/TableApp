import { describe, expect, it } from 'vitest'

describe('parseReorderPicks', () => {
  it('reads product picks and optional qty, skipping duplicate ids', async () => {
    const { RowWriteError } = await import('./row-mutations')
    const { parseReorderPicks } = await import('./inventory-reorder')
    expect(parseReorderPicks(JSON.stringify({ products: [{ productId: 'p1', qty: 4 }] }))).toEqual([{ productId: 'p1', qty: 4 }])
    expect(parseReorderPicks([{ product: 'p2' }, { id: 'p3', quantity: 2 }])).toEqual([
      { productId: 'p2' },
      { productId: 'p3', qty: 2 },
    ])
    expect(parseReorderPicks({ products: [{ productId: 'p1' }, { productId: 'p1', qty: 9 }] })).toEqual([{ productId: 'p1' }])
    expect(() => parseReorderPicks('')).toThrow(RowWriteError)
    expect(() => parseReorderPicks('{')).toThrow(/повреждён/)
    expect(() => parseReorderPicks({ products: [] })).toThrow(/Выберите товары/)
    expect(() => parseReorderPicks({ products: [{ productId: 'p1', qty: 0 }] })).toThrow(/от 1 до/)
    expect(() => parseReorderPicks({ products: [{ qty: 1 }] })).toThrow(/Выберите товар/)
  })
})
