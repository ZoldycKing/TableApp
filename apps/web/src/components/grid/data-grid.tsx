'use client'

import type { Field, RowGroup } from '@tableapp/schema'
import { isComputed } from '@tableapp/schema'
import type { KeyboardEvent } from 'react'
import { Fragment, useCallback, useMemo, useState } from 'react'
import { groupLabel } from '@/lib/apply-view'
import { AttachmentPreview } from '@/components/file-upload'
import { FIELD_LABELS } from '@/lib/field-labels'
import { formatCell } from '@/lib/format'
import type { TableRow } from '@/lib/table-store'
import { CellEditor } from './cell-editor'

type Selection = { rowIndex: number; columnIndex: number }

type GridProps = {
  fields: Field[]
  groups: RowGroup<TableRow>[]
  isGrouped: boolean
  groupField?: Field | undefined
  relatedTitles?: TitleIndex
  onEditField?: (field: Field) => void
  onAddField?: () => void
  onSetCell: (rowId: string, fieldId: string, value: unknown, base?: unknown) => void
  onAddRow: (afterRowId?: string) => void
  onDeleteRow: (rowId: string) => void
  onRenameField: (fieldId: string, name: string) => void
  /** Открыть строку карточкой: все поля целиком, без обрезки. */
  onOpenRow?: (rowId: string) => void
}

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

function CellContent({
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
  return <span className={numeric ? 'block text-right tabular-nums' : 'block truncate'}>{text}</span>
}

export function DataGrid({
  fields,
  groups,
  isGrouped,
  groupField,
  relatedTitles,
  onEditField,
  onAddField,
  onSetCell,
  onAddRow,
  onDeleteRow,
  onRenameField,
  onOpenRow,
}: GridProps) {

  const [selection, setSelection] = useState<Selection | null>(null)
  const [editing, setEditing] = useState<Selection | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  // Навигация ходит по плоскому списку: группировка меняет отрисовку, но не
  // порядок обхода строк стрелками.
  const flatRows = useMemo(() => groups.flatMap((group) => group.rows), [groups])
  const indexByRowId = useMemo(
    () => new Map(flatRows.map((row, index) => [row.id, index])),
    [flatRows],
  )

  const move = useCallback(
    (rowDelta: number, columnDelta: number) => {
      setSelection((current) => {
        if (!current) return current
        const rowIndex = Math.min(Math.max(current.rowIndex + rowDelta, 0), flatRows.length - 1)
        const columnIndex = Math.min(Math.max(current.columnIndex + columnDelta, 0), fields.length - 1)
        return { rowIndex, columnIndex }
      })
    },
    [flatRows.length, fields.length],
  )

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing || !selection) return
    const field = fields[selection.columnIndex]
    const row = flatRows[selection.rowIndex]
    if (!field || !row) return

    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); return move(1, 0)
      case 'ArrowUp': event.preventDefault(); return move(-1, 0)
      case 'ArrowLeft': event.preventDefault(); return move(0, -1)
      case 'ArrowRight': event.preventDefault(); return move(0, 1)
      case 'Tab':
        event.preventDefault()
        return move(0, event.shiftKey ? -1 : 1)
      case 'Enter':
      case 'F2':
        event.preventDefault()
        if (isComputed(field.type)) return
        if (field.type === 'checkbox') return onSetCell(row.id, field.id, !row.data[field.id])
        return setEditing(selection)
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        if (isComputed(field.type)) return
        return onSetCell(row.id, field.id, field.type === 'checkbox' ? false : null)
      case ' ':
        if (field.type === 'checkbox') {
          event.preventDefault()
          return onSetCell(row.id, field.id, !row.data[field.id])
        }
        return
    }
  }

  const toggleGroup = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const renderRow = (row: TableRow) => {
    const rowIndex = indexByRowId.get(row.id) ?? 0
    return (
      <tr key={row.id} className="group transition-colors hover:bg-sand-50/70">
        <td className="sticky left-0 z-10 border-b border-r border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-1 text-center text-xs text-[var(--color-ink-muted)]">
          {/*
            Кнопка открытия строки видна всегда, а не только на наведении:
            о скрытой кнопке человек не догадается, а это основной способ
            прочитать широкую строку целиком. Удаление, наоборот, показываем
            только при наведении — оно необратимое и не должно быть под рукой.
          */}
          <span className="flex items-center justify-center gap-0.5">
            <span className="w-4 tabular-nums group-hover:hidden">{rowIndex + 1}</span>
            <button
              type="button"
              onClick={() => onDeleteRow(row.id)}
              title="Удалить строку"
              className="hidden h-6 w-4 rounded text-red-600 hover:bg-red-50 group-hover:block"
            >
              ×
            </button>
            {onOpenRow ? (
              <button
                type="button"
                onClick={() => onOpenRow(row.id)}
                title="Открыть строку: все поля целиком"
                className="flex h-6 w-6 items-center justify-center rounded border border-sand-200 bg-white text-[11px] text-ink-muted transition-colors hover:border-sage-400 hover:text-ink"
              >
                ⤢
              </button>
            ) : null}
          </span>
        </td>
        {fields.map((field, columnIndex) => {
          const isSelected = selection?.rowIndex === rowIndex && selection.columnIndex === columnIndex
          const isEditing = editing?.rowIndex === rowIndex && editing.columnIndex === columnIndex
          const computed = isComputed(field.type)

          return (
            <td
              key={field.id}
              onClick={() => setSelection({ rowIndex, columnIndex })}
              onDoubleClick={() => {
                if (computed) return
                if (field.type === 'checkbox') {
                  return onSetCell(row.id, field.id, !row.data[field.id], row.data[field.id])
                }
                setEditing({ rowIndex, columnIndex })
              }}
              className={`relative h-9 overflow-hidden border-b border-r border-[var(--color-border-subtle)] px-3 align-middle ${
                computed ? 'bg-[var(--color-surface-muted)]/60' : ''
              } ${isSelected ? 'ring-2 ring-inset ring-sage-400' : ''} ${
                columnIndex === 0 ? 'sticky left-16 z-10 bg-white' : ''
              }`}
            >
              {isEditing ? (
                <CellEditor
                  field={field}
                  value={row.data[field.id]}
                  relatedOptions={titlesFor(field, relatedTitles)}
                  onCommit={(value) => {
                    // Основание — то значение, которое было в ячейке, когда
                    // редактор открывался.
                    onSetCell(row.id, field.id, value, row.data[field.id])
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <CellContent field={field} value={row.data[field.id]} relatedTitles={relatedTitles} />
              )}
            </td>
          )
        })}
        {onAddField ? (
          <td className="border-b border-r border-[var(--color-border-subtle)]" />
        ) : null}
      </tr>
    )
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKey}
      className="overflow-auto rounded-2xl border border-sand-200 bg-white shadow-soft outline-none transition-shadow focus:ring-2 focus:ring-sage-200"
    >
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-sand-100/80">
            <th className="sticky left-0 z-20 w-16 border-b border-r border-sand-200 bg-sand-100 px-2 py-2 text-xs font-normal text-ink-muted">
              #
            </th>
            {fields.map((field, index) => (
              <th
                key={field.id}
                className={`group/th min-w-48 border-b border-r border-sand-200 px-3 py-2 text-left ${
                  index === 0 ? 'sticky left-16 z-20 bg-sand-100' : ''
                }`}
              >
                <div className="flex items-center gap-1">
                  <input
                    value={field.name}
                    onChange={(event) => onRenameField(field.id, event.target.value)}
                    className="w-full min-w-0 truncate bg-transparent text-sm font-medium outline-none focus:underline"
                  />
                  {/*
                    Шестерёнка видна всегда и нормального размера: настройки
                    поля — обычное действие, а не спрятанное. Скрытую кнопку
                    человек просто не находит.
                  */}
                  {onEditField ? (
                    <button
                      type="button"
                      onClick={() => onEditField(field)}
                      title={`Настройки поля «${field.name}»`}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-sm text-[var(--color-ink-muted)] transition-colors hover:border-sand-300 hover:bg-white hover:text-ink"
                    >
                      ⚙
                    </button>
                  ) : null}
                </div>
                <span className="block truncate text-xs font-normal text-[var(--color-ink-muted)]">
                  {FIELD_LABELS[field.type]}
                  {isComputed(field.type) ? ' · считается само' : ''}
                </span>
              </th>
            ))}
            {onAddField ? (
              <th className="w-28 border-b border-r border-[var(--color-border-subtle)] p-0 text-left">
                <button
                  type="button"
                  onClick={onAddField}
                  className="h-full w-full px-3 py-3 text-left text-sm font-normal text-[var(--color-ink-muted)] hover:bg-black/5"
                >
                  + Поле
                </button>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key || 'all'}>
              {isGrouped ? (
                <tr>
                  <td
                    colSpan={fields.length + (onAddField ? 2 : 1)}
                    className="sticky left-0 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] p-0"
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium hover:bg-black/5"
                    >
                      <span aria-hidden className="text-xs text-[var(--color-ink-muted)]">
                        {collapsed.has(group.key) ? '▸' : '▾'}
                      </span>
                      {groupLabel(groupField, group.value)}
                      <span className="font-normal text-[var(--color-ink-muted)]">
                        {group.rows.length}
                      </span>
                    </button>
                  </td>
                </tr>
              ) : null}
              {collapsed.has(group.key) ? null : group.rows.map(renderRow)}
            </Fragment>
          ))}

          {flatRows.length === 0 ? (
            <tr>
              <td
                colSpan={fields.length + (onAddField ? 2 : 1)}
                className="border-b border-[var(--color-border-subtle)] px-3 py-8 text-center text-sm text-[var(--color-ink-muted)]"
              >
                Под условия представления не попала ни одна строка.
              </td>
            </tr>
          ) : null}

          <tr>
            <td colSpan={fields.length + (onAddField ? 2 : 1)} className="border-b border-[var(--color-border-subtle)] p-0">
              <button
                type="button"
                onClick={() => onAddRow()}
                className="w-full px-3 py-2 text-left text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                + Строка
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
