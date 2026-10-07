import type { Field, RowGroup, View, ViewConfig } from '@tableapp/schema'
import { byPosition, evalFilter, groupRows, indexFields, sortRows } from '@tableapp/schema'
import type { TableRow } from './table-store'

/**
 * Применение конфигурации представления к данным.
 * Это и есть общий движок: та же функция обслуживает грид, канбан, календарь,
 * галерею и — позже — экраны мобильного приложения.
 */

export function visibleFields(fields: readonly Field[], config: ViewConfig): Field[] {
  const hidden = new Set(config.hiddenFieldIds)
  const order = new Map(config.fieldOrder.map((id, index) => [id, index]))
  const shown = fields.filter((field) => !hidden.has(field.id))

  return [...shown].sort((a, b) => {
    const ai = order.get(a.id)
    const bi = order.get(b.id)
    // Поля, которых нет в порядке представления, идут следом в порядке таблицы.
    if (ai !== undefined && bi !== undefined) return ai - bi
    if (ai !== undefined) return -1
    if (bi !== undefined) return 1
    return byPosition(a, b)
  })
}

function matchesSearch(row: TableRow, fields: readonly Field[], query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return fields.some((field) => {
    const value = row.data[field.id]
    if (value === null || value === undefined) return false
    const text = Array.isArray(value) ? value.map(String).join(' ') : String(value)
    return text.toLowerCase().includes(needle)
  })
}

export type AppliedView = {
  rows: TableRow[]
  groups: RowGroup<TableRow>[]
  isGrouped: boolean
  hiddenCount: number
}

export function applyView(
  allRows: readonly TableRow[],
  fields: readonly Field[],
  config: ViewConfig,
  search = '',
): AppliedView {
  const index = indexFields(fields)

  const filtered = allRows.filter(
    (row) => evalFilter(config.filter, row.data, index) && matchesSearch(row, fields, search),
  )
  const sorted = sortRows(filtered, config.sorts, index)
  const isGrouped = config.groupBy.length > 0

  return {
    rows: sorted,
    groups: isGrouped
      ? groupRows(sorted, config.groupBy, index)
      : [{ key: '', value: null, rows: sorted }],
    isGrouped,
    hiddenCount: allRows.length - filtered.length,
  }
}

/** Заголовок группы: варианты выбора показываются именем, даты — датой. */
export function groupLabel(field: Field | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '' || value === 'null') return 'Пусто'
  if (!field) return String(value)

  if (field.type === 'single_select' || field.type === 'multi_select') {
    const ids = Array.isArray(value) ? value : [value]
    const names = ids
      .map((id) => field.options.choices.find((c) => c.id === id)?.name)
      .filter((name): name is string => Boolean(name))
    return names.length > 0 ? names.join(', ') : 'Пусто'
  }
  if (field.type === 'checkbox') return value === true || value === 'true' ? 'Да' : 'Нет'
  return String(value)
}

export function countFilters(config: ViewConfig): number {
  const walk = (group: ViewConfig['filter']): number =>
    group.conditions.reduce(
      (total, node) => total + ('conjunction' in node ? walk(node) : 1),
      0,
    )
  return walk(config.filter)
}

export function describeView(view: View): string {
  const parts: string[] = []
  const filters = countFilters(view.config)
  if (filters > 0) parts.push(`фильтров: ${filters}`)
  if (view.config.sorts.length > 0) parts.push(`сортировок: ${view.config.sorts.length}`)
  if (view.config.groupBy.length > 0) parts.push('с группировкой')
  return parts.join(' · ')
}
