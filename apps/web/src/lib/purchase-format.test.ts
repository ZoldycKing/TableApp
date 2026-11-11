import { describe, expect, it } from 'vitest'
import { formatPurchaseDate, purchaseMoney } from './purchase-format'

describe('purchase format helpers', () => {
  it('formats money with two fraction digits and the ruble mark', () => {
    expect(purchaseMoney(7120).replace(/\u00a0|\u202f/g, ' ')).toBe('7 120,00 ₽')
    expect(purchaseMoney(10.5).replace(/\u00a0|\u202f/g, ' ')).toBe('10,50 ₽')
    expect(purchaseMoney(0).replace(/\u00a0|\u202f/g, ' ')).toBe('0,00 ₽')
  })

  it('always keeps the year in purchase dates', () => {
    expect(formatPurchaseDate('2026-11-11')).toBe('11.11.2026')
    expect(formatPurchaseDate('11.11.2026')).toBe('11.11.2026')
    expect(formatPurchaseDate('2026-11-11T10:00:00.000Z')).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
  })
})
