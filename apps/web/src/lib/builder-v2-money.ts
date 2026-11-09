/** Grouped money typing for App V2 number fields (ru-RU style spaces). */

const GROUP = ' '
const SPACE = /[\s\u00A0\u202F\u2009]/g

export function builderV2IsMoneyFieldLabel(label: string) {
  return /[₽$€£₸]|^(?:сумма|итого|цена|стоимость|amount|total|price)(?:\b|[,.\s]|$)/iu.test(label.trim())
}

/** Strip grouping spaces / NBSP and normalize decimal comma for Number(). */
export function builderV2ParseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(SPACE, '').replace(',', '.').trim()
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : Number.NaN
}

/** Format a numeric value with grouping spaces (no currency suffix). */
export function builderV2FormatMoneyGrouped(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  const negative = value < 0
  const absolute = Math.abs(value)
  const [whole = '0', fraction] = absolute.toString().split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)
  const body = fraction != null ? `${grouped},${fraction}` : grouped
  return negative ? `-${body}` : body
}

/**
 * Reformat typed text with digit groups while allowing a trailing decimal
 * separator during editing. Returns null when the keystroke is invalid.
 */
export function builderV2MoneyInputChange(raw: string, caret: number): { text: string; caret: number } | null {
  const cleaned = raw.replace(SPACE, '')
  if (!cleaned) return { text: '', caret: 0 }
  if (!/^-?\d*([.,]\d*)?$/.test(cleaned)) return null

  const negative = cleaned.startsWith('-')
  const body = negative ? cleaned.slice(1) : cleaned
  const match = body.match(/^(\d*)([.,])?(\d*)$/)
  if (!match) return null
  const whole = match[1] ?? ''
  const sep = match[2]
  const fraction = match[3]
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)
  let text = `${negative ? '-' : ''}${grouped}`
  if (sep) text += ','
  if (sep && fraction != null) text += fraction

  const digitsBefore = raw.slice(0, caret).replace(SPACE, '').replace('-', '').replace(/[.,]/g, '').length
  const sepBefore = /[.,]/.test(raw.slice(0, caret).replace(SPACE, ''))
  let seen = 0
  let nextCaret = text.length
  let passedSep = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === ',') {
      passedSep = true
      if (sepBefore && seen >= digitsBefore) { nextCaret = i + 1; break }
      continue
    }
    if (/\d/.test(ch)) {
      seen++
      if (!sepBefore && seen >= digitsBefore) { nextCaret = i + 1; break }
      if (sepBefore && passedSep && seen >= digitsBefore) { nextCaret = i + 1; break }
    }
  }
  if (digitsBefore === 0 && !sepBefore) nextCaret = text.startsWith('-') ? 1 : 0
  return { text, caret: nextCaret }
}
