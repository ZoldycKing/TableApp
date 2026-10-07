import type { Field } from './fields'
import type { FilterCondition, FilterGroup } from './filters'
import { isGroup, isUnary } from './filters'
import { isBlank } from './values'

/**
 * Вычисление фильтра в памяти. Один и тот же код исполняется в редакторе базы,
 * в рантайме приложения и на сервере — расхождений в семантике быть не должно.
 *
 * Для больших таблиц серверная часть дополнительно компилирует фильтр в SQL;
 * этот интерпретатор остаётся эталоном, по которому компилятор проверяется тестами.
 */

export type FieldIndex = ReadonlyMap<string, Field>

export function indexFields(fields: readonly Field[]): FieldIndex {
  return new Map(fields.map((f) => [f.id, f]))
}

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(text).join(', ')
  return String(value)
}

function norm(value: unknown): string {
  return text(value).trim().toLowerCase()
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function time(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const t = new Date(String(value)).getTime()
  return Number.isNaN(t) ? null : t
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (isBlank(value)) return []
  return [value]
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  )
}

const DATE_OPS = new Set(['is_before', 'is_after', 'is_on_or_before', 'is_on_or_after', 'is_within'])
const SET_OPS = new Set(['has_any_of', 'has_all_of', 'has_none_of', 'is_exactly', 'is_any_of', 'is_none_of'])

function evalCondition(condition: FilterCondition, row: Record<string, unknown>, fields: FieldIndex): boolean {
  const field = fields.get(condition.fieldId)
  // Условие на удалённое поле игнорируется, а не роняет весь фильтр.
  if (!field) return true

  const cell = row[condition.fieldId] ?? null
  const op = condition.op
  const operand = condition.value

  if (op === 'is_empty') return isBlank(cell)
  if (op === 'is_not_empty') return !isBlank(cell)
  if (!isUnary(op) && operand === null && !SET_OPS.has(op)) return true

  const isDateField = field.type === 'date' || field.type === 'datetime' || field.type === 'created_time' || field.type === 'updated_time'

  if (isDateField || DATE_OPS.has(op)) {
    const a = time(cell)
    const b = time(operand)
    if (a === null || b === null) return false
    switch (op) {
      case 'is': return sameDay(a, b)
      case 'is_not': return !sameDay(a, b)
      case 'is_before': return a < b
      case 'is_after': return a > b
      case 'is_on_or_before': return a <= b || sameDay(a, b)
      case 'is_on_or_after': return a >= b || sameDay(a, b)
      case 'is_within': {
        const range = operand as { from?: unknown; to?: unknown }
        const from = time(range?.from)
        const to = time(range?.to)
        return (from === null || a >= from) && (to === null || a <= to)
      }
      default: return false
    }
  }

  if (field.type === 'checkbox') {
    return Boolean(cell) === Boolean(operand)
  }

  const numericField =
    field.type === 'number' || field.type === 'rollup' || field.type === 'count'

  if (numericField || ['gt', 'gte', 'lt', 'lte'].includes(op)) {
    const a = num(cell)
    const b = num(operand)
    if (a === null || b === null) {
      // Формульное поле может вернуть текст — тогда сравниваем как текст.
      if (field.type !== 'formula') return false
    } else {
      switch (op) {
        case 'is': return a === b
        case 'is_not': return a !== b
        case 'gt': return a > b
        case 'gte': return a >= b
        case 'lt': return a < b
        case 'lte': return a <= b
        default: return false
      }
    }
  }

  if (SET_OPS.has(op)) {
    const have = asArray(cell).map(norm)
    const want = asArray(operand).map(norm)
    switch (op) {
      case 'is_any_of':
      case 'has_any_of':
        return want.some((w) => have.includes(w))
      case 'is_none_of':
      case 'has_none_of':
        return !want.some((w) => have.includes(w))
      case 'has_all_of':
        return want.every((w) => have.includes(w))
      case 'is_exactly':
        return have.length === want.length && want.every((w) => have.includes(w))
      default:
        return false
    }
  }

  const haystack = norm(cell)
  const needle = norm(operand)
  switch (op) {
    case 'is': return haystack === needle
    case 'is_not': return haystack !== needle
    case 'contains': return needle === '' || haystack.includes(needle)
    case 'does_not_contain': return needle === '' || !haystack.includes(needle)
    default: return false
  }
}

export function evalFilter(
  node: FilterGroup | null | undefined,
  row: Record<string, unknown>,
  fields: FieldIndex,
): boolean {
  if (!node || node.conditions.length === 0) return true
  const results = node.conditions.map((child) =>
    isGroup(child) ? evalFilter(child, row, fields) : evalCondition(child, row, fields),
  )
  return node.conjunction === 'and' ? results.every(Boolean) : results.some(Boolean)
}

/** Пересечение фильтра представления и дополнительного фильтра экрана. */
export function combineFilters(a: FilterGroup | null, b: FilterGroup | null): FilterGroup | null {
  if (!a) return b
  if (!b) return a
  return { id: `${a.id}+${b.id}`, conjunction: 'and', conditions: [a, b] }
}
