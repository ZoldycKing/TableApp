'use client'

import type { Field, ViewOf } from '@tableapp/schema'
import { useMemo, useState } from 'react'
import {
  EMPTY_COLUMN_KEY,
  buildKanbanColumns,
  columnKeyOf,
  pickStackField,
  stackCandidates,
  type KanbanColumn,
} from '@/lib/kanban'
import type { TableRow } from '@/lib/table-store'
import { CHOICE_COLORS, RowCard } from './card'

type KanbanProps = {
  readOnly?: boolean
  view: ViewOf<'kanban'>
  fields: Field[]
  shownFields: Field[]
  rows: TableRow[]
  titleField: Field | undefined
  onConfigChange: (config: ViewOf<'kanban'>['config']) => void
  onSetCell: (rowId: string, fieldId: string, value: unknown) => void
  onAddRow: () => void
}

export function KanbanView({
  readOnly = false,
  view,
  fields,
  shownFields,
  rows,
  titleField,
  onConfigChange,
  onSetCell,
  onAddRow,
}: KanbanProps) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)

  const candidates = stackCandidates(fields)
  const stackField = pickStackField(fields, view.config.stackFieldId)
  const columns = useMemo(() => buildKanbanColumns(stackField, rows), [stackField, rows])

  const detailFields = shownFields
    .filter((field) => field.id !== titleField?.id && field.id !== stackField?.id)
    .slice(0, 3)

  if (!stackField) {
    return (
      <p className="rounded-xl border border-[var(--color-border-subtle)] px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">
        Для канбана нужно поле одиночного выбора или переключатель. В этой таблице таких полей нет.
      </p>
    )
  }

  const drop = (column: KanbanColumn) => {
    if (readOnly || !dragging) return
    setOverColumn(null)
    const row = rows.find((candidate) => candidate.id === dragging)
    setDragging(null)
    if (!row) return
    const next = column.key === EMPTY_COLUMN_KEY ? null : column.value
    if (row.data[stackField.id] === next) return
    onSetCell(row.id, stackField.id, next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--color-ink-muted)]">Колонки по полю</span>
        <select
          disabled={readOnly}
          value={stackField.id}
          onChange={(event) => { if (!readOnly) onConfigChange({ ...view.config, stackFieldId: event.target.value }) }}
          className="rounded border border-[var(--color-border-subtle)] bg-white px-2 py-1 text-sm outline-none focus:border-sage-400"
        >
          {candidates.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((column) => (
          <section
            key={column.key}
            onDragOver={(event) => {
              event.preventDefault()
              setOverColumn(column.key)
            }}
            onDragLeave={() => setOverColumn((current) => (current === column.key ? null : current))}
            onDrop={() => drop(column)}
            className={`flex w-72 shrink-0 flex-col rounded-xl border p-2 transition ${
              overColumn === column.key
                ? 'border-sage-400 bg-sage-50'
                : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)]/50'
            }`}
          >
            <header className="mb-2 flex items-center justify-between gap-2 px-1">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHOICE_COLORS[column.color] ?? CHOICE_COLORS.gray}`}
              >
                {column.label}
              </span>
              <span className="text-xs text-[var(--color-ink-muted)]">{column.rows.length}</span>
            </header>

            <div className="flex flex-col gap-2">
              {column.rows.map((row) => (
                <RowCard
                  key={row.id}
                  row={row}
                  titleField={titleField}
                  detailFields={detailFields}
                  draggable={!readOnly}
                  onDragStart={() => { if (!readOnly) setDragging(row.id) }}
                  footer={
                    // Перетаскивание недоступно с клавиатуры, поэтому у колонки
                    // всегда есть явный выбор — он же работает на телефоне.
                    readOnly ? undefined : <select
                      value={columnKeyOf(stackField, row)}
                      onChange={(event) => {
                        if (readOnly) return
                        const target = columns.find((candidate) => candidate.key === event.target.value)
                        if (!target) return
                        onSetCell(row.id, stackField.id, target.key === EMPTY_COLUMN_KEY ? null : target.value)
                      }}
                      className="w-full rounded border border-[var(--color-border-subtle)] bg-white px-1.5 py-1 text-xs outline-none focus:border-sage-400"
                    >
                      {columns.map((candidate) => (
                        <option key={candidate.key} value={candidate.key}>
                          {candidate.label}
                        </option>
                      ))}
                    </select>
                  }
                />
              ))}
            </div>

            {column.rows.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-[var(--color-ink-muted)]">Пусто</p>
            ) : null}
          </section>
        ))}

        {!readOnly ? <button
          type="button"
          onClick={onAddRow}
          className="h-10 w-40 shrink-0 rounded-xl border border-dashed border-[var(--color-border-subtle)] text-sm text-[var(--color-ink-muted)] hover:border-sage-400 hover:text-sage-700"
        >
          + Строка
        </button> : null}
      </div>
    </div>
  )
}
