import { describe, expect, it } from 'vitest'
import {
  amountInWordsRu,
  computeInvoiceTotals,
  convertDocument,
  formatInvoiceDate,
  formatInvoiceMoney,
  formatInvoiceNumber,
  lineGross,
  lineTotal,
  lineVat,
  moneyLineToInvoiceLine,
  nextDocumentNumber,
  parseInvoiceLines,
  parsePayments,
  paymentsTotal,
  remainingBalance,
  resolveDocStatus,
  serializeInvoiceLines,
  summaryTotals,
  type InvoiceLine,
} from './invoices-logic'

const line = (partial: Partial<InvoiceLine>): InvoiceLine => ({
  name: 'Услуга',
  qty: 1,
  unit: 'шт',
  price: 1000,
  discount: 0,
  vatRate: 20,
  vatIncluded: true,
  ...partial,
})

describe('invoice line math', () => {
  it('computes gross with discount', () => {
    expect(lineGross(line({ qty: 2, price: 1000, discount: 10 }))).toBe(1800)
  })

  it('splits VAT when price includes VAT', () => {
    expect(lineVat(line({ price: 1200, vatRate: 20, vatIncluded: true }))).toBe(200)
    expect(lineTotal(line({ price: 1200, vatRate: 20, vatIncluded: true }))).toBe(1200)
  })

  it('adds VAT when price excludes VAT', () => {
    expect(lineVat(line({ price: 1000, vatRate: 20, vatIncluded: false }))).toBe(200)
    expect(lineTotal(line({ price: 1000, vatRate: 20, vatIncluded: false }))).toBe(1200)
  })

  it('totals subtotal, discount, VAT and total across lines', () => {
    const totals = computeInvoiceTotals([
      line({ qty: 2, price: 1000, discount: 10, vatRate: 20, vatIncluded: false }),
      line({ name: 'Материал', qty: 1, price: 500, discount: 0, vatRate: 0, vatIncluded: true }),
    ])
    expect(totals.discount).toBe(200)
    expect(totals.subtotal).toBe(2300)
    expect(totals.vat).toBe(360)
    expect(totals.total).toBe(2660)
  })

  it('parses dispatch MoneyLine JSON into invoice lines', () => {
    const lines = parseInvoiceLines(JSON.stringify([{ name: 'Выезд', amount: 1500 }]))
    expect(lines).toEqual([moneyLineToInvoiceLine({ name: 'Выезд', amount: 1500 })])
    expect(parseInvoiceLines(serializeInvoiceLines(lines))).toEqual(lines)
  })
})

describe('payments and overdue', () => {
  it('tracks paid total and remaining balance', () => {
    const payments = parsePayments(JSON.stringify([
      { date: '2026-11-01', amount: 5000, comment: 'Аванс' },
      { date: '2026-11-10', amount: 2500.5, comment: '' },
    ]))
    expect(paymentsTotal(payments)).toBe(7500.5)
    expect(remainingBalance(10000, payments)).toBe(2499.5)
  })

  it('resolves partial, paid and overdue statuses', () => {
    expect(resolveDocStatus({ status: 'draft', due: '2026-01-01', total: 1000, payments: [], today: '2026-11-19' })).toBe('draft')
    expect(resolveDocStatus({ status: 'sent', due: '2026-12-01', total: 1000, payments: [{ date: '2026-11-01', amount: 400, comment: '' }], today: '2026-11-19' })).toBe('partial')
    expect(resolveDocStatus({ status: 'sent', due: '2026-12-01', total: 1000, payments: [{ date: '2026-11-01', amount: 1000, comment: '' }], today: '2026-11-19' })).toBe('paid')
    expect(resolveDocStatus({ status: 'sent', due: '2026-11-01', total: 1000, payments: [], today: '2026-11-19' })).toBe('overdue')
  })
})

describe('numbering and conversion', () => {
  it('formats and increments document numbers', () => {
    expect(formatInvoiceNumber('СЧ-{YYYY}-{NNN}', 2026, 1)).toBe('СЧ-2026-001')
    expect(nextDocumentNumber('invoice', ['СЧ-2026-001', 'СЧ-2026-007', 'СМ-2026-099'], undefined, 2026)).toBe('СЧ-2026-008')
    expect(nextDocumentNumber('estimate', [], undefined, 2026)).toBe('СМ-2026-001')
    expect(nextDocumentNumber('act', ['АКТ-2026-001'], undefined, 2026)).toBe('АКТ-2026-002')
  })

  it('converts estimate → invoice → act', () => {
    expect(convertDocument('estimate')).toBe('invoice')
    expect(convertDocument('invoice')).toBe('act')
    expect(convertDocument('act')).toBeNull()
  })
})

describe('summary and formatting', () => {
  it('summarizes issued / paid / debt for invoices only', () => {
    expect(summaryTotals([
      { kind: 'invoice', status: 'sent', total: 10000, paid: 0 },
      { kind: 'invoice', status: 'partial', total: 5000, paid: 2000 },
      { kind: 'invoice', status: 'draft', total: 9999, paid: 0 },
      { kind: 'estimate', status: 'sent', total: 8000, paid: 0 },
      { kind: 'invoice', status: 'paid', total: 3000, paid: 3000 },
    ])).toEqual({ issued: 18000, paid: 5000, debt: 13000 })
  })

  it('formats money and dates in Russian style', () => {
    expect(formatInvoiceMoney(12500)).toBe('12 500,00 ₽')
    expect(formatInvoiceDate('2026-11-12')).toBe('12.11.2026')
  })

  it('writes amount in Russian words', () => {
    expect(amountInWordsRu(12500)).toBe('Двенадцать тысяч пятьсот рублей 00 копеек')
    expect(amountInWordsRu(1.01)).toBe('Один рубль 01 копейка')
    expect(amountInWordsRu(0)).toBe('Ноль рублей 00 копеек')
  })
})
