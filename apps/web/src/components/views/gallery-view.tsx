'use client'

import type { Field, ViewOf } from '@tableapp/schema'
import type { TableRow } from '@/lib/table-store'
import { RowCard } from './card'

type GalleryProps = {
  readOnly?: boolean
  view: ViewOf<'gallery'>
  fields: Field[]
  shownFields: Field[]
  rows: TableRow[]
  titleField: Field | undefined
  onConfigChange: (config: ViewOf<'gallery'>['config']) => void
  onAddRow: () => void
}

const IMAGE_TYPES = new Set(['image', 'attachment'])

const CARD_COLUMNS: Record<string, string> = {
  small: 'grid-cols-2 md:grid-cols-4 xl:grid-cols-6',
  medium: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  large: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
}

export function GalleryView({
  readOnly = false,
  view,
  fields,
  shownFields,
  rows,
  titleField,
  onConfigChange,
  onAddRow,
}: GalleryProps) {
  const covers = fields.filter((field) => IMAGE_TYPES.has(field.type))
  const coverField = fields.find((field) => field.id === view.config.coverFieldId) ?? covers[0]
  const detailFields = shownFields.filter((field) => field.id !== titleField?.id).slice(0, 4)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--color-ink-muted)]">Размер карточек</span>
        <select
          disabled={readOnly}
          value={view.config.cardSize}
          onChange={(event) =>
            !readOnly && onConfigChange({ ...view.config, cardSize: event.target.value as 'small' | 'medium' | 'large' })
          }
          className="rounded border border-[var(--color-border-subtle)] bg-white px-2 py-1 text-sm outline-none focus:border-sage-400"
        >
          <option value="small">мелкие</option>
          <option value="medium">средние</option>
          <option value="large">крупные</option>
        </select>

        {covers.length > 0 ? (
          <>
            <span className="text-[var(--color-ink-muted)]">Обложка</span>
            <select
              disabled={readOnly}
              value={coverField?.id ?? ''}
              onChange={(event) =>
                !readOnly && onConfigChange({ ...view.config, coverFieldId: event.target.value || null })
              }
              className="rounded border border-[var(--color-border-subtle)] bg-white px-2 py-1 text-sm outline-none focus:border-sage-400"
            >
              <option value="">без обложки</option>
              {covers.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-[var(--color-border-subtle)] px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">
          Под условия представления не попала ни одна строка.
        </p>
      ) : (
        <div className={`grid gap-3 ${CARD_COLUMNS[view.config.cardSize] ?? CARD_COLUMNS.medium}`}>
          {rows.map((row) => (
            <RowCard key={row.id} row={row} titleField={titleField} detailFields={detailFields} />
          ))}
        </div>
      )}

      {!readOnly ? <button
        type="button"
        onClick={onAddRow}
        className="rounded-lg border border-dashed border-[var(--color-border-subtle)] px-4 py-2 text-sm text-[var(--color-ink-muted)] hover:border-sage-400 hover:text-sage-700"
      >
        + Строка
      </button> : null}
    </div>
  )
}
