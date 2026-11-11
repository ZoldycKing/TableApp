import { describe, expect, it } from 'vitest'

describe('parseCountLines', () => {
  it('reads object or array payloads and rejects bad lines', async () => {
    const { RowWriteError } = await import('./row-mutations')
    const { parseCountLines } = await import('./inventory-count')
    expect(parseCountLines(JSON.stringify({ lines: [{ productId: 'p1', actualQty: 3 }] }))).toEqual([{ productId: 'p1', actualQty: 3 }])
    expect(parseCountLines([{ product: 'p2', actual: 0 }])).toEqual([{ productId: 'p2', actualQty: 0 }])
    expect(parseCountLines({ lines: [{ productId: ['p3'], qty: 7 }] })).toEqual([{ productId: 'p3', actualQty: 7 }])
    expect(() => parseCountLines('')).toThrow(RowWriteError)
    expect(() => parseCountLines('{')).toThrow(/повреждён/)
    expect(() => parseCountLines({ lines: [] })).not.toThrow()
    expect(parseCountLines({ lines: [] })).toEqual([])
    expect(() => parseCountLines({ lines: [{ productId: 'p1', actualQty: 1 }, { productId: 'p1', actualQty: 2 }] })).toThrow(/дважды/)
    expect(() => parseCountLines({ lines: [{ productId: 'p1', actualQty: 1.5 }] })).toThrow(/целое число/)
    expect(() => parseCountLines({ lines: [{ productId: 'p1', actualQty: -1 }] })).toThrow(/целое число/)
    expect(() => parseCountLines({ lines: [{ actualQty: 1 }] })).toThrow(/Выберите товар/)
  })
})
