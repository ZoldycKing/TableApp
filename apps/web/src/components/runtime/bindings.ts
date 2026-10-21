import { accentTones } from './accent-tones'
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
  const tone = accentTones(accent)
  return { bg: tone.solid, text: tone.text, ring: tone.ring }
}
