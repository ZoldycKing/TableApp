/** Invoices / estimates / acts — totals, statuses, numbering, Russian amount-in-words. */

export type DocKind = 'estimate' | 'invoice' | 'act'
export type DocStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue'

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  estimate: 'Смета',
  invoice: 'Счёт',
  act: 'Акт',
}

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  draft: 'Черновик',
  sent: 'Отправлен',
  partial: 'Частично оплачен',
  paid: 'Оплачен',
  overdue: 'Просрочен',
}

export const DOC_STATUS_FROM_LABEL: Record<string, DocStatus> = {
  Черновик: 'draft',
  Отправлен: 'sent',
  'Частично оплачен': 'partial',
  Оплачен: 'paid',
  Просрочен: 'overdue',
}

export const DOC_KIND_FROM_LABEL: Record<string, DocKind> = {
  Смета: 'estimate',
  Счёт: 'invoice',
  Акт: 'act',
}

/** Line compatible with a future link from dispatch MoneyLine ({ name, amount }). */
export type InvoiceLine = {
  name: string
  qty: number
  unit: string
  price: number
  /** Discount percent 0–100. */
  discount: number
  /** VAT rate percent, e.g. 0 / 10 / 20. */
  vatRate: number
  /** When true, price already includes VAT («с НДС»). */
  vatIncluded: boolean
}

export type InvoiceTotals = {
  /** Sum of line amounts before VAT split (after discount). */
  subtotal: number
  discount: number
  vat: number
  total: number
}

export type PaymentEntry = {
  date: string
  amount: number
  comment: string
}

export type NumberingConfig = {
  estimate: string
  invoice: string
  act: string
}

export const DEFAULT_NUMBERING: NumberingConfig = {
  estimate: 'СМ-{YYYY}-{NNN}',
  invoice: 'СЧ-{YYYY}-{NNN}',
  act: 'АКТ-{YYYY}-{NNN}',
}

const VAT_RATES = [0, 5, 7, 10, 20, 22] as const
export type VatRate = (typeof VAT_RATES)[number]
export const SELECTABLE_VAT_RATES: readonly VatRate[] = VAT_RATES

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function emptyInvoiceLine(): InvoiceLine {
  return { name: '', qty: 1, unit: 'шт', price: 0, discount: 0, vatRate: 20, vatIncluded: true }
}

/** Convert dispatch-style `{ name, amount }` into one invoice line (qty 1, no discount, VAT 20 included). */
export function moneyLineToInvoiceLine(line: { name: string; amount: number }, vatRate: number = 20): InvoiceLine {
  return {
    name: String(line.name ?? '').trim(),
    qty: 1,
    unit: 'шт',
    price: Number(line.amount) || 0,
    discount: 0,
    vatRate,
    vatIncluded: true,
  }
}

export function parseInvoiceLines(value: unknown): InvoiceLine[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 80).map(item => {
      if (!item || typeof item !== 'object') return emptyInvoiceLine()
      const row = item as Record<string, unknown>
      // Dispatch MoneyLine shape: { name, amount }
      if ('amount' in row && !('price' in row) && !('qty' in row)) {
        return moneyLineToInvoiceLine({ name: String(row.name ?? ''), amount: Number(row.amount) || 0 })
      }
      const vatRate = Number(row.vatRate)
      return {
        name: String(row.name ?? '').trim(),
        qty: Math.max(0, Number(row.qty) || 0),
        unit: String(row.unit ?? 'шт').trim() || 'шт',
        price: Math.max(0, Number(row.price) || 0),
        discount: Math.min(100, Math.max(0, Number(row.discount) || 0)),
        vatRate: SELECTABLE_VAT_RATES.includes(vatRate as VatRate) ? (vatRate as VatRate) : 20,
        vatIncluded: row.vatIncluded !== false,
      }
    })
  } catch {
    return []
  }
}

export function serializeInvoiceLines(lines: readonly InvoiceLine[]): string {
  return JSON.stringify(lines.map(line => ({
    name: line.name.trim(),
    qty: line.qty,
    unit: line.unit.trim() || 'шт',
    price: roundMoney(line.price),
    discount: roundMoney(line.discount),
    vatRate: line.vatRate,
    vatIncluded: line.vatIncluded,
  })))
}

export function parsePayments(value: unknown): PaymentEntry[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 100).map(item => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      return {
        date: String(row.date ?? '').slice(0, 10),
        amount: roundMoney(Math.max(0, Number(row.amount) || 0)),
        comment: String(row.comment ?? '').trim().slice(0, 200),
      }
    })
  } catch {
    return []
  }
}

export function serializePayments(payments: readonly PaymentEntry[]): string {
  return JSON.stringify(payments.map(item => ({
    date: item.date,
    amount: roundMoney(item.amount),
    comment: item.comment.trim().slice(0, 200),
  })))
}

/** Gross after discount for one line (qty × price × (1 − discount%)). */
export function lineGross(line: InvoiceLine): number {
  const base = Math.max(0, line.qty) * Math.max(0, line.price)
  const discounted = base * (1 - Math.min(100, Math.max(0, line.discount)) / 100)
  return roundMoney(discounted)
}

export function lineDiscountAmount(line: InvoiceLine): number {
  const base = Math.max(0, line.qty) * Math.max(0, line.price)
  return roundMoney(base - lineGross(line))
}

export function lineVat(line: InvoiceLine): number {
  const gross = lineGross(line)
  const rate = Math.max(0, line.vatRate)
  if (rate <= 0 || gross <= 0) return 0
  if (line.vatIncluded) return roundMoney(gross * rate / (100 + rate))
  return roundMoney(gross * rate / 100)
}

export function lineTotal(line: InvoiceLine): number {
  const gross = lineGross(line)
  if (line.vatIncluded || line.vatRate <= 0) return gross
  return roundMoney(gross + lineVat(line))
}

export function computeInvoiceTotals(lines: readonly InvoiceLine[]): InvoiceTotals {
  let subtotal = 0
  let discount = 0
  let vat = 0
  let total = 0
  for (const line of lines) {
    const base = Math.max(0, line.qty) * Math.max(0, line.price)
    discount = roundMoney(discount + (base - lineGross(line)))
    subtotal = roundMoney(subtotal + lineGross(line))
    vat = roundMoney(vat + lineVat(line))
    total = roundMoney(total + lineTotal(line))
  }
  return { subtotal, discount, vat, total }
}

export function paymentsTotal(payments: readonly PaymentEntry[]): number {
  return roundMoney(payments.reduce((sum, item) => sum + Math.max(0, item.amount), 0))
}

export function remainingBalance(total: number, payments: readonly PaymentEntry[]): number {
  return roundMoney(Math.max(0, total - paymentsTotal(payments)))
}

/** Auto status from payments + due date. Draft stays draft until sent. */
export function resolveDocStatus(input: {
  status: DocStatus
  due: string | null | undefined
  total: number
  payments: readonly PaymentEntry[]
  today?: string
}): DocStatus {
  if (input.status === 'draft') return 'draft'
  const paid = paymentsTotal(input.payments)
  if (input.total > 0 && paid >= input.total - 0.001) return 'paid'
  if (paid > 0) return 'partial'
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  if (input.due && input.due < today) return 'overdue'
  if (input.status === 'overdue' || input.status === 'partial' || input.status === 'paid') return 'sent'
  return input.status === 'sent' ? 'sent' : 'sent'
}

export function formatInvoiceNumber(template: string, year: number, sequence: number): string {
  const nnn = String(Math.max(1, sequence)).padStart(3, '0')
  return template
    .replaceAll('{YYYY}', String(year))
    .replaceAll('{YY}', String(year).slice(-2))
    .replaceAll('{NNN}', nnn)
    .replaceAll('{NN}', String(Math.max(1, sequence)).padStart(2, '0'))
}

export function nextDocumentNumber(
  kind: DocKind,
  existing: readonly string[],
  config: NumberingConfig = DEFAULT_NUMBERING,
  year = new Date().getFullYear(),
): string {
  const template = config[kind]
  const prefix = template.split('{')[0] ?? ''
  const yearToken = String(year)
  let max = 0
  for (const value of existing) {
    if (!value.startsWith(prefix) || !value.includes(yearToken)) continue
    const match = value.match(/(\d+)\s*$/)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return formatInvoiceNumber(template, year, max + 1)
}

export function convertDocument(kind: DocKind): DocKind | null {
  if (kind === 'estimate') return 'invoice'
  if (kind === 'invoice') return 'act'
  return null
}

export function summaryTotals(docs: readonly { status: DocStatus; kind: DocKind; total: number; paid: number }[]) {
  let issued = 0
  let paid = 0
  let debt = 0
  for (const doc of docs) {
    if (doc.kind !== 'invoice') continue
    if (doc.status === 'draft') continue
    issued = roundMoney(issued + doc.total)
    paid = roundMoney(paid + Math.min(doc.total, doc.paid))
    debt = roundMoney(debt + Math.max(0, doc.total - doc.paid))
  }
  return { issued, paid, debt }
}

export function formatInvoiceMoney(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const amount = value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0|\u202f/g, ' ')
  return `${amount} ₽`
}

export function formatInvoiceDate(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  const display = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if (display) return `${display[1]}.${display[2]}.${display[3]}`
  const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) return `${ymd[3]}.${ymd[2]}.${ymd[1]}`
  return value
}

const ONES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const ONES_FEM = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

function triadWords(value: number, feminine: boolean): string {
  const n = Math.floor(value) % 1000
  if (n <= 0) return ''
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const o = n % 10
  const parts: string[] = []
  if (h) parts.push(HUNDREDS[h]!)
  if (t === 1) parts.push(TEENS[o]!)
  else {
    if (t) parts.push(TENS[t]!)
    if (o) parts.push((feminine ? ONES_FEM : ONES)[o]!)
  }
  return parts.join(' ')
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/** «Двенадцать тысяч пятьсот рублей 00 копеек» */
export function amountInWordsRu(amount: number): string {
  const safe = Math.max(0, roundMoney(amount))
  const rubles = Math.floor(safe)
  const kopecks = Math.round((safe - rubles) * 100)
  if (rubles === 0) {
    return `Ноль рублей ${String(kopecks).padStart(2, '0')} ${plural(kopecks, 'копейка', 'копейки', 'копеек')}`
  }
  const billions = Math.floor(rubles / 1_000_000_000)
  const millions = Math.floor((rubles % 1_000_000_000) / 1_000_000)
  const thousands = Math.floor((rubles % 1_000_000) / 1000)
  const rest = rubles % 1000
  const parts: string[] = []
  if (billions) {
    parts.push(triadWords(billions, false))
    parts.push(plural(billions, 'миллиард', 'миллиарда', 'миллиардов'))
  }
  if (millions) {
    parts.push(triadWords(millions, false))
    parts.push(plural(millions, 'миллион', 'миллиона', 'миллионов'))
  }
  if (thousands) {
    parts.push(triadWords(thousands, true))
    parts.push(plural(thousands, 'тысяча', 'тысячи', 'тысяч'))
  }
  if (rest) parts.push(triadWords(rest, false))
  const text = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  const capitalized = text ? text[0]!.toUpperCase() + text.slice(1) : 'Ноль'
  return `${capitalized} ${plural(rubles, 'рубль', 'рубля', 'рублей')} ${String(kopecks).padStart(2, '0')} ${plural(kopecks, 'копейка', 'копейки', 'копеек')}`
}
