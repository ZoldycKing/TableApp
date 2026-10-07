import type { Binding, Field } from '@tableapp/schema'
import { formatCell } from '@/lib/format'
import type { TableRow } from '@/lib/table-store'

export type Viewer = { email: string; name: string | null; id: string } | null

/** Источник значения компонента: константа, поле строки или свойство вошедшего. */
export function resolveBinding(
  binding: Binding,
  row: TableRow | null,
  fields: readonly Field[],
  viewer: Viewer,
): string {
  switch (binding.kind) {
    case 'literal':
      return binding.value === null || binding.value === undefined ? '' : String(binding.value)
    case 'user':
      if (!viewer) return ''
      return binding.property === 'email' ? viewer.email : binding.property === 'id' ? viewer.id : (viewer.name ?? '')
    case 'field': {
      if (!row) return ''
      const field = fields.find((candidate) => candidate.id === binding.fieldId)
      return field ? formatCell(field, row.data[field.id]) : ''
    }
  }
}

/** Значение для записи: в отличие от отображения, здесь нужен не текст, а данные. */
export function resolveBindingValue(
  binding: Binding,
  row: TableRow | null,
  viewer: Viewer,
): unknown {
  switch (binding.kind) {
    case 'literal':
      return binding.value
    case 'user':
      if (!viewer) return null
      return binding.property === 'email' ? viewer.email : binding.property === 'id' ? viewer.id : viewer.name
    case 'field':
      return row?.data[binding.fieldId] ?? null
  }
}

export function accentClasses(accent: string): { bg: string; text: string; ring: string } {
  const map: Record<string, { bg: string; text: string; ring: string }> = {
    blue: { bg: 'bg-blue-600', text: 'text-blue-700', ring: 'ring-blue-500' },
    green: { bg: 'bg-green-600', text: 'text-green-700', ring: 'ring-green-500' },
    violet: { bg: 'bg-violet-600', text: 'text-violet-700', ring: 'ring-violet-500' },
    rose: { bg: 'bg-rose-600', text: 'text-rose-700', ring: 'ring-rose-500' },
    amber: { bg: 'bg-amber-500', text: 'text-amber-700', ring: 'ring-amber-500' },
    teal: { bg: 'bg-teal-600', text: 'text-teal-700', ring: 'ring-teal-500' },
    indigo: { bg: 'bg-indigo-600', text: 'text-indigo-700', ring: 'ring-indigo-500' },
  }
  return map[accent] ?? map.blue!
}
