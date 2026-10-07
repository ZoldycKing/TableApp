'use client'

import type { Field, FilterOp } from '@tableapp/schema'

const SET_OPS: FilterOp[] = ['is_any_of', 'is_none_of', 'has_any_of', 'has_all_of', 'has_none_of', 'is_exactly']

const INPUT_CLASS =
  'min-w-36 rounded border border-[var(--color-border-subtle)] px-2 py-1 text-sm outline-none focus:border-sage-400'

/** Поле ввода операнда подбирается по типу поля и выбранному оператору. */
export function FilterValueInput({
  field,
  op,
  value,
  onChange,
}: {
  field: Field | undefined
  op: FilterOp
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (!field) return null

  const hasChoices = field.type === 'single_select' || field.type === 'multi_select'

  if (hasChoices) {
    const choices = field.options.choices
    if (SET_OPS.includes(op)) {
      const selected = new Set(Array.isArray(value) ? value.map(String) : [])
      return (
        <div className="flex flex-wrap gap-1">
          {choices.map((choice) => {
            const active = selected.has(choice.id)
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => {
                  const next = new Set(selected)
                  if (active) next.delete(choice.id)
                  else next.add(choice.id)
                  onChange([...next])
                }}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  active
                    ? 'border-sage-400 bg-sage-50 text-sage-700'
                    : 'border-[var(--color-border-subtle)] text-[var(--color-ink-muted)]'
                }`}
              >
                {choice.name}
              </button>
            )
          })}
        </div>
      )
    }
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value || null)}
        className={INPUT_CLASS}
      >
        <option value="">—</option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'checkbox') {
    return (
      <select
        value={value === true ? 'true' : 'false'}
        onChange={(event) => onChange(event.target.value === 'true')}
        className={INPUT_CLASS}
      >
        <option value="true">отмечено</option>
        <option value="false">не отмечено</option>
      </select>
    )
  }

  const isDate =
    field.type === 'date' || field.type === 'datetime' ||
    field.type === 'created_time' || field.type === 'updated_time'

  if (isDate) {
    const asDate = typeof value === 'string' && value ? value.slice(0, 10) : ''
    return (
      <input
        type="date"
        value={asDate}
        onChange={(event) =>
          onChange(event.target.value ? new Date(event.target.value).toISOString() : null)
        }
        className={INPUT_CLASS}
      />
    )
  }

  const numeric = field.type === 'number' || field.type === 'rollup' || field.type === 'count'

  return (
    <input
      type={numeric ? 'number' : 'text'}
      value={value === null || value === undefined ? '' : String(value)}
      onChange={(event) => {
        const raw = event.target.value
        if (raw === '') return onChange(null)
        onChange(numeric ? Number(raw) : raw)
      }}
      placeholder="значение"
      className={INPUT_CLASS}
    />
  )
}
