import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const envFile = resolve(import.meta.dirname, '../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe('purchase line payload', () => {
  it('reads a JSON list and rejects a second copy of the same product', async () => {
    const { RowWriteError } = await import('./row-mutations')
    const { parsePurchaseLines } = await import('./purchase-order')
    expect(parsePurchaseLines(JSON.stringify({ lines: [{ productId: 'p1', qty: 2, price: 10.126 }] }))).toEqual([{ productId: 'p1', qty: 2, price: 10.13 }])
    expect(parsePurchaseLines([{ productId: 'p1', qty: 1, price: 0 }])).toEqual([{ productId: 'p1', qty: 1, price: 0 }])
    expect(() => parsePurchaseLines('')).toThrow(RowWriteError)
    expect(() => parsePurchaseLines({ lines: [] })).toThrow(/хотя бы одну/)
    expect(() => parsePurchaseLines({ lines: [{ productId: 'p1', qty: 1, price: 1 }, { productId: 'p1', qty: 2, price: 1 }] })).toThrow(/уже есть/)
    expect(() => parsePurchaseLines({ lines: [{ productId: 'p1', qty: 1.5, price: 1 }] })).toThrow(/целое количество/)
  })
})
