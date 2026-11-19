import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildInvoicePdf } from './invoices-pdf'

const font = new Uint8Array(readFileSync('apps/web/public/template-media/dispatch/NotoSans-Regular.ttf'))

const base = {
  number: 'СЧ-2026-003',
  date: '09.11.2026',
  due: '24.11.2026',
  seller: {
    company: 'ООО «Скатта Студия»',
    inn: '7701234567',
    kpp: '770101001',
    address: 'Москва',
    bank: 'АО «Банк Пример»',
    bik: '044525225',
    account: '40702810900000001234',
    corrAccount: '30101810400000000225',
  },
  buyer: { name: 'ООО «Северный ветер»', inn: '7801112233', address: 'СПб' },
  lines: [
    { name: 'Вёрстка и сборка', qty: 1, unit: 'усл.', price: 62000, discount: 5, total: 58900 },
    { name: 'Дизайн', qty: 2, unit: 'усл.', price: 15000, discount: 0, total: 30000 },
  ],
  subtotal: 88900,
  discount: 3100,
  vat: 14816.67,
  total: 88900,
}

describe('buildInvoicePdf', () => {
  it('builds invoice PDF bytes with bank requisites and discount column', async () => {
    const pdf = await buildInvoicePdf({ ...base, kind: 'invoice' }, font)
    expect(pdf.byteLength).toBeGreaterThan(1000)
    expect(pdf[0]).toBe(0x25) // %
    expect(pdf[1]).toBe(0x50) // P
  })

  it('builds act PDF with executor/customer wording', async () => {
    const logo = { bytes: new Uint8Array(readFileSync('apps/web/public/template-media/invoices/logo.png')), mime: 'image/png' as const }
    const signature = { bytes: new Uint8Array(readFileSync('apps/web/public/template-media/invoices/signature.png')), mime: 'image/png' as const }
    const stamp = { bytes: new Uint8Array(readFileSync('apps/web/public/template-media/invoices/stamp.png')), mime: 'image/png' as const }
    const pdf = await buildInvoicePdf({
      ...base,
      kind: 'act',
      number: 'АКТ-2026-001',
      logo,
      signature,
      stamp,
    }, font)
    expect(pdf.byteLength).toBeGreaterThan(2000)
  })
})
