import { isComputed, type Field } from '@tableapp/schema'
import { cellText, type TitleIndex } from './table-export'

export type ChangeOp = 'create' | 'update' | 'delete'

export type FieldDiff = { fieldId: string; name: string; from: string; to: string }

/**
 * Разбор записи журнала на понятные строки «поле: было — стало».
 *
 * Вычисляемые поля пропускаем: их никто не менял руками, они пересчитались
 * сами, и в истории правок они только шумят. Поля, удалённые из таблицы после
 * правки, показываем по идентификатору — врать про имя хуже, чем признать,
 * что поля больше нет.
 */
export function diffChange(
  op: ChangeOp,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fields: readonly Field[],
  titles?: TitleIndex,
): FieldDiff[] {
  const index = new Map(fields.map((field) => [field.id, field]))
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  const diffs: FieldDiff[] = []

  for (const key of keys) {
    const field = index.get(key)
    if (field && isComputed(field.type)) continue

    const from = field ? cellText(field, before?.[key], titles) : plain(before?.[key])
    const to = field ? cellText(field, after?.[key], titles) : plain(after?.[key])
    if (from === to) continue
    if (op === 'create' && to === '') continue

    diffs.push({ fieldId: key, name: field?.name ?? `Удалённое поле ${key}`, from, to })
  }

  return diffs.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

function plain(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  return Array.isArray(value) ? value.map(String).join(', ') : String(value)
}

export const OP_LABELS: Record<ChangeOp, string> = {
  create: 'Строка добавлена',
  update: 'Строка изменена',
  delete: 'Строка удалена',
}
