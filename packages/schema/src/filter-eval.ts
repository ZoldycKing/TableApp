import type { Field } from './fields'
import type { FilterCondition, FilterGroup } from './filters'
import { isGroup, isUnary } from './filters'
import { isBlank } from './values'
import { calendarDay, dateInstant, fieldTimeZone } from './time'

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

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (isBlank(value)) return []
  return [value]
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
    const zone = fieldTimeZone(field)
    const a = dateInstant(cell, zone)
    if (a === null) return false
    const day = calendarDay(cell, zone)!
    if (op === 'is_within') {
      if (!operand || typeof operand !== 'object' || Array.isArray(operand)) return false
      const range = operand as { from?: unknown; to?: unknown }
      const bound = (value: unknown, end: boolean) => {
        if (isBlank(value)) return true
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          const other = calendarDay(value, zone)
          return other !== null && (end ? day <= other : day >= other)
        }
        const instant = dateInstant(value, zone)
        return instant !== null && (end ? a <= instant : a >= instant)
      }
      return bound(range.from, false) && bound(range.to, true)
    }
    const b = dateInstant(operand, zone)
    const otherDay = calendarDay(operand, zone)
    if (b === null || otherDay === null) return false
    const before = field.type === 'date' || (typeof operand === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(operand)) ? day < otherDay : a < b
    const after = field.type === 'date' || (typeof operand === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(operand)) ? day > otherDay : a > b
    switch (op) {
      case 'is': return day === otherDay
      case 'is_not': return day !== otherDay
      case 'is_before': return before
      case 'is_after': return after
      case 'is_on_or_before': return before || day === otherDay
      case 'is_on_or_after': return after || day === otherDay
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
