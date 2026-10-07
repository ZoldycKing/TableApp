/** Значение в формуле. Даты представлены ISO-строками, как и в ячейках. */
export type Value = string | number | boolean | null

export function isBlankValue(value: Value): boolean {
  return value === null || value === undefined || value === ''
}

/**
 * Булево в текст переводится как Да/Нет: формула — пользовательский инструмент,
 * и увидеть «true» в карточке приложения он не должен.
 */
export function toText(value: Value): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  return String(value)
}

/** Десятичная запятая принимается наравне с точкой: так вводят числа в РФ. */
export function toNumber(value: Value): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.')
  if (normalized === '') return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export function toBool(value: Value): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value).trim().toLowerCase()
  return text !== '' && text !== '0' && text !== 'false' && text !== 'нет'
}

export function toDate(value: Value): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    const fromEpoch = new Date(value)
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function fromDate(date: Date): string {
  return date.toISOString()
}

export function looksNumeric(value: Value): boolean {
  return typeof value === 'number' || (typeof value === 'string' && toNumber(value) !== null && value.trim() !== '')
}
