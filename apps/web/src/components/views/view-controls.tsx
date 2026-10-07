'use client'

import type { Field, GroupBy, Sort } from '@tableapp/schema'

const SELECT_CLASS =
  'rounded border border-[var(--color-border-subtle)] bg-white px-2 py-1 text-sm outline-none focus:border-sage-400'

/** Поля, по которым имеет смысл группировать: нужен конечный набор значений. */
const GROUPABLE = new Set([
  'single_select', 'multi_select', 'checkbox', 'text', 'email', 'phone',
  'member', 'created_by', 'updated_by', 'number', 'date',
])

export function SortEditor({
  fields,
  sorts,
  onChange,
}: {
  fields: Field[]
  sorts: Sort[]
  onChange: (sorts: Sort[]) => void
}) {
  const used = new Set(sorts.map((sort) => sort.fieldId))
  const available = fields.filter((field) => !used.has(field.id))

  return (
    <div className="space-y-2">
      {sorts.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Без сортировки строки идут в ручном порядке.
        </p>
      ) : null}

      {sorts.map((sort, index) => (
        <div key={sort.fieldId} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-[var(--color-ink-muted)]">
            {index === 0 ? 'Сначала' : 'Затем'}
          </span>
          <select
            value={sort.fieldId}
            onChange={(event) => {
              const next = [...sorts]
              next[index] = { ...sort, fieldId: event.target.value }
              onChange(next)
            }}
            className={SELECT_CLASS}
          >
            {[fields.find((f) => f.id === sort.fieldId), ...available]
              .filter((field): field is Field => Boolean(field))
              .map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
          </select>
          <select
            value={sort.direction}
            onChange={(event) => {
              const next = [...sorts]
              next[index] = { ...sort, direction: event.target.value as 'asc' | 'desc' }
              onChange(next)
            }}
            className={SELECT_CLASS}
          >
            <option value="asc">по возрастанию</option>
            <option value="desc">по убыванию</option>
          </select>
          <button
            type="button"
            onClick={() => onChange(sorts.filter((_, i) => i !== index))}
            className="rounded px-2 py-1 text-sm text-[var(--color-ink-muted)] hover:bg-red-50 hover:text-red-600"
          >
            ×
          </button>
        </div>
      ))}

      {available.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange([...sorts, { fieldId: available[0]!.id, direction: 'asc' }])}
          className="rounded px-2 py-1 text-sm text-sage-700 hover:bg-sage-50"
        >
          + Сортировка
        </button>
      ) : null}
    </div>
  )
}

export function GroupEditor({
  fields,
  groupBy,
  onChange,
}: {
  fields: Field[]
  groupBy: GroupBy[]
  onChange: (groupBy: GroupBy[]) => void
}) {
  const candidates = fields.filter((field) => GROUPABLE.has(field.type))
  const used = new Set(groupBy.map((group) => group.fieldId))
  const available = candidates.filter((field) => !used.has(field.id))

  return (
    <div className="space-y-2">
      {groupBy.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)]">Группировка выключена.</p>
      ) : null}

      {groupBy.map((group, index) => (
        <div key={group.fieldId} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-[var(--color-ink-muted)]">
            {index === 0 ? 'По полю' : 'Затем'}
          </span>
          <select
            value={group.fieldId}
            onChange={(event) => {
              const next = [...groupBy]
              next[index] = { ...group, fieldId: event.target.value }
              onChange(next)
            }}
            className={SELECT_CLASS}
          >
            {[candidates.find((f) => f.id === group.fieldId), ...available]
              .filter((field): field is Field => Boolean(field))
              .map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
          </select>
          <select
            value={group.direction}
            onChange={(event) => {
              const next = [...groupBy]
              next[index] = { ...group, direction: event.target.value as 'asc' | 'desc' }
              onChange(next)
            }}
            className={SELECT_CLASS}
          >
            <option value="asc">по возрастанию</option>
            <option value="desc">по убыванию</option>
          </select>
          <button
            type="button"
            onClick={() => onChange(groupBy.filter((_, i) => i !== index))}
            className="rounded px-2 py-1 text-sm text-[var(--color-ink-muted)] hover:bg-red-50 hover:text-red-600"
          >
            ×
          </button>
        </div>
      ))}

      {/* Больше трёх уровней вложенности читать невозможно. */}
      {available.length > 0 && groupBy.length < 3 ? (
        <button
          type="button"
          onClick={() => onChange([...groupBy, { fieldId: available[0]!.id, direction: 'asc' }])}
          className="rounded px-2 py-1 text-sm text-sage-700 hover:bg-sage-50"
        >
          + Группировка
        </button>
      ) : null}
    </div>
  )
}

export function FieldVisibilityEditor({
  fields,
  hiddenFieldIds,
  onChange,
}: {
  fields: Field[]
  hiddenFieldIds: string[]
  onChange: (hidden: string[]) => void
}) {
  const hidden = new Set(hiddenFieldIds)

  return (
    <div className="space-y-1">
      {fields.map((field) => (
        <label key={field.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
          <input
            type="checkbox"
            checked={!hidden.has(field.id)}
            onChange={() => {
              const next = new Set(hidden)
              if (next.has(field.id)) next.delete(field.id)
              else next.add(field.id)
              onChange([...next])
            }}
          />
          {field.name}
        </label>
      ))}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded px-2 py-1 text-xs text-sage-700 hover:bg-sage-50"
        >
          Показать все
        </button>
        <button
          type="button"
          onClick={() => onChange(fields.slice(1).map((field) => field.id))}
          className="rounded px-2 py-1 text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          Скрыть все
        </button>
      </div>
    </div>
  )
}
