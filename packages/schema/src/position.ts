/**
 * Дробные индексы для порядка строк, полей, представлений и экранов.
 * Вставка между соседями не требует переиндексации остальных: перетаскивание
 * строки — это один UPDATE, а не пересчёт всей таблицы.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length

function digitAt(s: string, i: number): string {
  return s[i] ?? '0'
}

function indexOf(ch: string): number {
  const i = DIGITS.indexOf(ch)
  if (i < 0) throw new Error(`Недопустимый символ позиции: ${ch}`)
  return i
}

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`Позиции не упорядочены: ${a} >= ${b}`)
  }
  if (a.endsWith('0') || (b !== null && b.endsWith('0'))) {
    throw new Error('Позиция не может оканчиваться нулевым разрядом')
  }

  if (b !== null) {
    let n = 0
    while (digitAt(a, n) === digitAt(b, n)) n++
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n))
  }

  const low = a.length > 0 ? indexOf(a[0]!) : 0
  const high = b !== null ? indexOf(b[0]!) : BASE

  if (high - low > 1) {
    return DIGITS[Math.round(0.5 * (low + high))]!
  }
  if (b !== null && b.length > 1) {
    return b.slice(0, 1)
  }
  return DIGITS[low]! + midpoint(a.slice(1), null)
}

/** Позиция строго между `before` и `after`; null означает край списка. */
export function positionBetween(before: string | null, after: string | null): string {
  if (before === null && after === null) return DIGITS[Math.floor(BASE / 2)]!
  if (before === null) return midpoint('', after)
  return midpoint(before, after)
}

/** n последовательно возрастающих позиций — для первичного наполнения таблицы. */
export function positionSequence(count: number, after: string | null = null): string[] {
  const out: string[] = []
  let prev: string | null = null
  for (let i = 0; i < count; i++) {
    prev = positionBetween(prev, after)
    out.push(prev)
  }
  return out
}

export function comparePositions(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Сортировка по позиции; при равных позициях порядок разрешается по id. */
export function byPosition<T extends { position: string; id: string }>(a: T, b: T): number {
  return comparePositions(a.position, b.position) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
