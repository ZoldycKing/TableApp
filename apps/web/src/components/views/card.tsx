'use client'

import type { Field } from '@tableapp/schema'
import type { ReactNode } from 'react'
import { AttachmentPreview } from '@/components/file-upload'
import { formatCell } from '@/lib/format'
import type { TableRow } from '@/lib/table-store'

export const CHOICE_COLORS: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  amber: 'bg-amber-100 text-amber-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  lime: 'bg-lime-100 text-lime-800',
  green: 'bg-green-100 text-green-700',
  teal: 'bg-teal-100 text-teal-700',
  cyan: 'bg-cyan-100 text-cyan-700',
  blue: 'bg-blue-100 text-blue-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  violet: 'bg-violet-100 text-violet-700',
  purple: 'bg-purple-100 text-purple-700',
  pink: 'bg-pink-100 text-pink-700',
  rose: 'bg-rose-100 text-rose-700',
}

/** Значение поля так, как оно выглядит на карточке: варианты — плашкой. */
export function CardValue({
  field,
  value,
  relatedTitles,
}: {
  field: Field
  value: unknown
  /** Заголовки строк связанной таблицы. Без них связь показывается счётчиком. */
  relatedTitles?: { id: string; title: string }[]
}) {
  if (field.type === 'relation') {
    const ids = Array.isArray(value) ? value.map(String) : []
    if (ids.length === 0) return null
    if (!relatedTitles) {
      return <span className="text-sm text-[var(--color-ink-muted)]">записей: {ids.length}</span>
    }
    return (
      <span className="flex flex-wrap justify-end gap-1">
        {ids.map((id) => (
          <span key={id} className="rounded border border-[var(--color-border-subtle)] px-1.5 py-0.5 text-xs">
            {relatedTitles.find((option) => option.id === id)?.title ?? 'Строка удалена'}
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
    return text ? <span className="text-sm">{text}</span> : null
  }

  if (field.type === 'single_select' || field.type === 'multi_select') {
    const ids = Array.isArray(value) ? value : value ? [value] : []
    if (ids.length === 0) return null
    return (
      <span className="flex flex-wrap gap-1">
        {ids.map((id) => {
          const choice = field.options.choices.find((c) => c.id === id)
          if (!choice) return null
          return (
            <span
              key={choice.id}
              className={`rounded-full px-2 py-0.5 text-xs ${CHOICE_COLORS[choice.color] ?? CHOICE_COLORS.gray}`}
            >
              {choice.name}
            </span>
          )
        })}
      </span>
    )
  }

  if (field.type === 'checkbox') {
    return <span className="text-xs text-[var(--color-ink-muted)]">{value ? 'Да' : 'Нет'}</span>
  }

  const text = formatCell(field, value)
  return text ? <span className="text-sm">{text}</span> : null
}

/**
 * Карточка строки — общий элемент канбана, галереи и списков приложения.
 * Заголовок берётся из первичного поля, остальные показываются подписью и значением.
 */
export function RowCard({
  row,
  titleField,
  detailFields,
  onClick,
  draggable,
  onDragStart,
  footer,
}: {
  row: TableRow
  titleField: Field | undefined
  detailFields: Field[]
  onClick?: () => void
  draggable?: boolean
  onDragStart?: () => void
  footer?: ReactNode
}) {
  const title = titleField ? formatCell(titleField, row.data[titleField.id]) : ''

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={`rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 shadow-sm transition ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${onClick ? 'hover:border-sage-300' : ''}`}
    >
      <p className="mb-1.5 text-sm font-medium">
        {title || <span className="text-[var(--color-ink-muted)]">Без названия</span>}
      </p>
      <div className="space-y-1">
        {detailFields.map((field) => {
          const content = <CardValue field={field} value={row.data[field.id]} />
          if (!content) return null
          return (
            <div key={field.id} className="flex items-baseline gap-2">
              <span className="w-24 shrink-0 truncate text-xs text-[var(--color-ink-muted)]">
                {field.name}
              </span>
              {content}
            </div>
          )
        })}
      </div>
      {footer ? <div className="mt-2 border-t border-[var(--color-border-subtle)] pt-2">{footer}</div> : null}
    </article>
  )
}
