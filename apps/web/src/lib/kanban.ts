import type { Field } from '@tableapp/schema'
import type { TableRow } from './table-store'

/** Колонки канбана: поле должно иметь конечный список значений. */
export const STACKABLE_TYPES = new Set(['single_select', 'checkbox'])

export const EMPTY_COLUMN_KEY = '__empty__'

export type KanbanColumn = {
  key: string
  label: string
  color: string
  value: unknown
  rows: TableRow[]
}

export function stackCandidates(fields: readonly Field[]): Field[] {
  return fields.filter((field) => STACKABLE_TYPES.has(field.type))
}

/**
 * Доску почти всегда хотят по статусу, а не по галочке, поэтому поле выбора
 * выигрывает у переключателя, даже если стоит в таблице позже.
 */
export function pickStackField(fields: readonly Field[], configuredId: string | null): Field | undefined {
  const candidates = stackCandidates(fields)
  return (
    fields.find((field) => field.id === configuredId && STACKABLE_TYPES.has(field.type)) ??
    candidates.find((field) => field.type === 'single_select') ??
    candidates[0]
  )
}

export function buildKanbanColumns(
  stackField: Field | undefined,
  rows: readonly TableRow[],
): KanbanColumn[] {
  if (!stackField) return []

  const buckets: KanbanColumn[] =
    stackField.type === 'single_select'
      ? stackField.options.choices.map((choice) => ({
          key: choice.id,
          label: choice.name,
          color: choice.color,
          value: choice.id,
          rows: [],
        }))
      : [
          { key: 'true', label: 'Да', color: 'green', value: true, rows: [] },
          { key: 'false', label: 'Нет', color: 'gray', value: false, rows: [] },
        ]

  // Колонка «без значения» нужна всегда: иначе часть строк просто исчезает с доски.
  const unset: KanbanColumn = {
    key: EMPTY_COLUMN_KEY,
    label: 'Без значения',
    color: 'gray',
    value: null,
    rows: [],
  }
  const byKey = new Map(buckets.map((column) => [column.key, column]))

  for (const row of rows) {
    const raw = row.data[stackField.id]
    const key = raw === null || raw === undefined || raw === '' ? EMPTY_COLUMN_KEY : String(raw)
    const target = byKey.get(key) ?? unset
    target.rows.push(row)
  }

  // У переключателя значение всегда определено, лишняя колонка только мешает.
  if (stackField.type === 'checkbox' && unset.rows.length === 0) return buckets
  return [...buckets, unset]
}

export function columnKeyOf(stackField: Field, row: TableRow): string {
  const raw = row.data[stackField.id]
  return raw === null || raw === undefined || raw === '' ? EMPTY_COLUMN_KEY : String(raw)
}
