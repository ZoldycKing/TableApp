import type { Field } from '@tableapp/schema'
import { AttachmentPreview } from '@/components/file-upload'
import { formatCell } from '@/lib/format'

const CHOICE_COLORS: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  amber: 'bg-amber-100 text-amber-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  lime: 'bg-lime-100 text-lime-800',
  green: 'bg-green-100 text-green-700',
  teal: 'bg-teal-100 text-teal-700',
  cyan: 'bg-cyan-100 text-cyan-700',
  blue: 'bg-sage-100 text-sage-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  violet: 'bg-violet-100 text-violet-700',
  purple: 'bg-purple-100 text-purple-700',
  pink: 'bg-pink-100 text-pink-700',
  rose: 'bg-rose-100 text-rose-700',
}

type TitleIndex = Record<string, { id: string; title: string }[]>

function titlesFor(field: Field, relatedTitles: TitleIndex | undefined): { id: string; title: string }[] {
  if (!relatedTitles || field.type !== 'relation') return []
  return relatedTitles[field.options.tableId] ?? []
}

export function CellContent({
  field,
  value,
  relatedTitles,
}: {
  field: Field
  value: unknown
  relatedTitles?: TitleIndex
}) {
  if (field.type === 'relation') {
    const ids = Array.isArray(value) ? value.map(String) : []
    if (ids.length === 0) return null
    const options = titlesFor(field, relatedTitles)
    return (
      /*
       * Связи в одну строку и без переноса: раньше чипы переносились,
       * растягивали строку по высоте и вылезали за узкую колонку —
       * таблица выглядела сломанной. Целиком список виден в карточке строки.
       */
      <span className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
        {ids.map((id) => (
          <span
            key={id}
            className="shrink-0 rounded border border-[var(--color-border-subtle)] px-1.5 py-0.5 text-xs"
          >
            {options.find((option) => option.id === id)?.title ?? 'Строка удалена'}
          </span>
        ))}
      </span>
    )
  }

  if (field.type === 'attachment' || field.type === 'image') {
    return <AttachmentPreview value={Array.isArray(value) ? (value as never[]) : []} />
  }

  if (field.type === 'lookup') {
    const values = Array.isArray(value) ? value : []
    const text = values.filter((item) => item !== null && item !== '').map(String).join(', ')
    return text ? <span className="block truncate text-[var(--color-ink-muted)]">{text}</span> : null
  }

  if (field.type === 'checkbox') {
    return (
      <span className="flex h-full items-center">
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
            value ? 'border-sage-600 bg-sage-600 text-white' : 'border-sand-300'
          }`}
        >
          {value ? '✓' : ''}
        </span>
      </span>
    )
  }

  if (field.type === 'single_select' && value) {
    const choice = field.options.choices.find((c) => c.id === value)
    if (!choice) return null
    return (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${CHOICE_COLORS[choice.color] ?? CHOICE_COLORS.gray}`}>
        {choice.name}
      </span>
    )
  }

  const text = formatCell(field, value)
  if (!text) return null

  const numeric = field.type === 'number' || field.type === 'rollup' || field.type === 'count'
  return <span title={text} className={numeric ? 'block truncate text-right tabular-nums' : 'block truncate'}>{text}</span>
}

