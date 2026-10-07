import type { Field } from './fields'
import type { FieldIndex } from './filter-eval'
import type { GroupBy, Sort } from './filters'
import { byPosition } from './position'
import { isBlank } from './values'

/** Сортировка и группировка — часть того же движка представлений, что и фильтры. */

function scalar(field: Field | undefined, value: unknown): string | number | boolean | null {
  if (isBlank(value)) return null
  switch (field?.type) {
    case 'number':
    case 'rollup':
    case 'count': {
      const n = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(n) ? n : null
    }
    case 'checkbox':
      return Boolean(value)
    case 'date':
    case 'datetime':
    case 'created_time':
    case 'updated_time': {
      const t = new Date(String(value)).getTime()
      return Number.isNaN(t) ? null : t
    }
    case 'single_select':
    case 'multi_select': {
      // Варианты выбора сортируются в порядке, заданном редактором, а не по алфавиту.
      const choices = 'choices' in field.options ? field.options.choices : []
      const first = Array.isArray(value) ? value[0] : value
      const index = choices.findIndex((c) => c.id === first)
      return index < 0 ? null : index
    }
    default: {
      if (Array.isArray(value)) return value.length === 0 ? null : String(value[0]).toLowerCase()
      return String(value).toLowerCase()
    }
  }
}

function compareScalar(a: string | number | boolean | null, b: string | number | boolean | null): number {
  // Пустые значения всегда в конце, независимо от направления сортировки.
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? -1 : 1
  return String(a).localeCompare(String(b), 'ru')
}

export type SortableRow = { id: string; position: string; data: Record<string, unknown> }

export function compareRows(
  a: SortableRow,
  b: SortableRow,
  sorts: readonly Sort[],
  fields: FieldIndex,
): number {
  for (const sort of sorts) {
    const field = fields.get(sort.fieldId)
    const left = scalar(field, a.data[sort.fieldId])
    const right = scalar(field, b.data[sort.fieldId])

    // Пустые значения остаются в конце и при сортировке по убыванию:
    // иначе список незаполненных строк перекрывает то, ради чего сортировали.
    if (left === null || right === null) {
      if (left === null && right === null) continue
      return left === null ? 1 : -1
    }

    const result = compareScalar(left, right)
    if (result !== 0) return sort.direction === 'desc' ? -result : result
  }
  // Без явной сортировки порядок задаётся ручной позицией строки.
  return byPosition(a, b)
}

export function sortRows<T extends SortableRow>(
  rows: readonly T[],
  sorts: readonly Sort[],
  fields: FieldIndex,
): T[] {
  return [...rows].sort((a, b) => compareRows(a, b, sorts, fields))
}

export type RowGroup<T> = { key: string; value: unknown; rows: T[] }

export function groupRows<T extends SortableRow>(
  rows: readonly T[],
  groupBy: readonly GroupBy[],
  fields: FieldIndex,
): RowGroup<T>[] {
  const first = groupBy[0]
  if (!first) return [{ key: '', value: null, rows: [...rows] }]

  const field = fields.get(first.fieldId)
  const buckets = new Map<string, RowGroup<T>>()

  for (const row of rows) {
    const raw = row.data[first.fieldId] ?? null
    const key = Array.isArray(raw) ? raw.map(String).join('|') : String(raw)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { key, value: raw, rows: [] }
      buckets.set(key, bucket)
    }
    bucket.rows.push(row)
  }

  const ordered = [...buckets.values()].sort((a, b) =>
    compareScalar(scalar(field, a.value), scalar(field, b.value)),
  )
  if (first.direction !== 'desc') return ordered

  // Группа пустых значений остаётся последней и при обратном порядке.
  const empty = ordered.filter((group) => scalar(field, group.value) === null)
  const filled = ordered.filter((group) => scalar(field, group.value) !== null).reverse()
  return [...filled, ...empty]
}
