'use client'

import type { Action, Attachment, Component, Field } from '@tableapp/schema'
import { evalFilter, indexFields } from '@tableapp/schema'
import { formatCell } from '@/lib/format'
import type { RelatedTitles } from '@/lib/queries'
import type { TableRow } from '@/lib/table-store'
import { CardValue } from '@/components/views/card'
import { fileUrl, isImage } from '@/components/file-upload'
import { accentClasses, resolveBinding, type Viewer } from './bindings'
import { CheckMark, StatusPill } from './ui'

export type ComponentContext = {
  fields: Field[]
  row: TableRow | null
  viewer: Viewer
  accent: string
  relatedTitles: RelatedTitles
  relatedRows: (relationFieldId: string) => { id: string; title: string; row: TableRow | null }[]
  onAction: (action: Action) => void
  onOpenRow?: (screenId: string, rowId: string) => void
}

const HEADING_SIZES = { s: 'text-base', m: 'text-lg', l: 'text-2xl' } as const
const TEXT_STYLES = {
  body: 'text-sm',
  caption: 'text-xs text-[var(--color-ink-muted)]',
  quote: 'border-l-2 border-[var(--color-border-subtle)] pl-3 text-sm italic',
} as const

export function ComponentView({ component, ctx, desktopButton, desktopEmphasis = false }: {
  component: Component; ctx: ComponentContext; desktopButton?: 'compact' | 'secondary'; desktopEmphasis?: boolean
}) {
  // Условие видимости проверяется тем же движком фильтров, что и в представлениях.
  if (component.visibleWhen && ctx.row) {
    if (!evalFilter(component.visibleWhen, ctx.row.data, indexFields(ctx.fields))) return null
  }

  switch (component.type) {
    case 'heading': {
      const text = resolveBinding(component.source, ctx.row, ctx.fields, ctx.viewer)
      if (!text) return null
      return <h2 className={`font-semibold tracking-tight ${HEADING_SIZES[component.size]}`}>{text}</h2>
    }

    case 'text': {
      const text = resolveBinding(component.source, ctx.row, ctx.fields, ctx.viewer)
      if (!text) return null
      return <p className={TEXT_STYLES[component.style]}>{text}</p>
    }

    case 'divider':
      return <hr className="border-[var(--color-border-subtle)]" />

    case 'image': {
      const field = ctx.fields.find((candidate) => candidate.id === component.fieldId)
      const value = field && ctx.row ? ctx.row.data[field.id] : null
      const items = (Array.isArray(value) ? value : []) as Attachment[]
      const first = items.find((item) => isImage(item.mime))
      if (!first) return null
      const aspect =
        component.aspect === 'square' ? 'aspect-square'
          : component.aspect === 'tall' ? 'aspect-[3/4]'
          : component.aspect === 'auto' ? '' : 'aspect-video'
      return (
        <img
          src={fileUrl(first.key)}
          alt={first.name}
          className={`w-full rounded-xl object-cover ${aspect}`}
        />
      )
    }

    case 'field': {
      const field = ctx.fields.find((candidate) => candidate.id === component.fieldId)
      if (!field || !ctx.row) return null
      const raw = ctx.row.data[field.id]
      const text = formatCell(field, raw)
      // Галочка — единственный тип, у которого «пусто» значит «нет»,
      // а не «не заполнено»: её показываем всегда.
      if (!text && !component.showWhenEmpty && field.type !== 'checkbox') return null

      return (
        <div className={`flex items-baseline justify-between gap-4 border-b border-sand-200 py-3 last:border-0 ${desktopEmphasis ? '@min-[860px]:justify-start @min-[860px]:gap-3 @min-[860px]:py-1' : ''}`}>
          <span className="shrink-0 text-[13px] text-ink-muted">{component.label ?? field.name}</span>
          <span className={`min-w-0 text-right text-sm font-medium ${desktopEmphasis ? '@min-[860px]:text-3xl @min-[860px]:font-semibold @min-[860px]:tabular-nums @min-[860px]:[&>span]:text-3xl' : ''}`}>
            <FieldValue field={field} value={raw} ctx={ctx} />
          </span>
        </div>
      )
    }

    case 'button': {
      const accent = accentClasses(ctx.accent)
      const styles: Record<string, string> = {
        primary: `${accent.bg} text-white`,
        secondary: 'border border-[var(--color-border-subtle)]',
        danger: 'bg-red-600 text-white',
        ghost: 'text-[var(--color-ink-muted)]',
      }
      return (
        <button
          type="button"
          onClick={() => ctx.onAction(component.action)}
          className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium ${styles[component.style] ?? styles.primary} ${desktopButton ? '@min-[860px]:min-h-11 @min-[860px]:w-auto @min-[860px]:transition-colors @min-[860px]:focus-visible:outline-2 @min-[860px]:focus-visible:outline-ink @min-[860px]:focus-visible:outline-offset-2' : ''} ${desktopButton === 'secondary' ? '@min-[860px]:border @min-[860px]:border-sand-200 @min-[860px]:bg-white @min-[860px]:text-ink @min-[860px]:hover:bg-sand-50' : ''}`}
        >
          {component.label}
        </button>
      )
    }

    case 'related_list': {
      const items = ctx.relatedRows(component.relationFieldId)
      if (items.length === 0) return null
      return (
        <div className="space-y-1.5">
          {items.slice(0, component.limit).map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!component.onTapScreenId}
              onClick={() =>
                component.onTapScreenId &&
                (ctx.onOpenRow ? ctx.onOpenRow(component.onTapScreenId, item.id) : ctx.onAction({ id: 'inline', type: 'open_screen', screenId: component.onTapScreenId }))
              }
              className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-left text-sm disabled:cursor-default"
            >
              {item.title}
            </button>
          ))}
        </div>
      )
    }

    case 'gallery': {
      const field = ctx.fields.find((candidate) => candidate.id === component.fieldId)
      const value = field && ctx.row ? ctx.row.data[field.id] : null
      const items = ((Array.isArray(value) ? value : []) as Attachment[]).filter((item) =>
        isImage(item.mime),
      )
      if (items.length === 0) return null
      return (
        <div
          className={`grid gap-2 ${
            component.columns === 1 ? 'grid-cols-1'
              : component.columns === 3 ? 'grid-cols-3'
              : component.columns === 4 ? 'grid-cols-4' : 'grid-cols-2'
          }`}
        >
          {items.map((item) => (
            <img key={item.key} src={fileUrl(item.key)} alt={item.name} className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      )
    }

    case 'card': {
      const title = component.titleFieldId
        ? ctx.fields.find((candidate) => candidate.id === component.titleFieldId)
        : undefined
      if (!title || !ctx.row) return null
      return (
        <div className="rounded-xl border border-[var(--color-border-subtle)] p-3">
          <p className="text-sm font-medium">{formatCell(title, ctx.row.data[title.id])}</p>
        </div>
      )
    }

    default:
      return null
  }
}

/**
 * Значение поля в карточке.
 *
 * Галочка рисуется галочкой, а выбор — плашкой: словами «Нет» и «В работе»
 * карточка превращается в выписку из таблицы, по которой глаз не скользит.
 */
function FieldValue({
  field,
  value,
  ctx,
}: {
  field: Field
  value: unknown
  ctx: ComponentContext
}) {
  if (field.type === 'checkbox') return <CheckMark value={value} />

  if (field.type === 'single_select' || field.type === 'multi_select') {
    return (
      <span className="flex flex-wrap justify-end gap-1">
        <StatusPill field={field} value={value} />
      </span>
    )
  }

  if (field.type === 'long_text') {
    const text = formatCell(field, value)
    // Длинный текст — единственное, что читают слева направо целиком.
    return text ? <span className="block whitespace-pre-line text-left font-normal">{text}</span> : null
  }

  return (
    <CardValue
      field={field}
      value={value}
      relatedTitles={field.type === 'relation' ? ctx.relatedTitles[field.options.tableId] : undefined}
    />
  )
}
