'use client'

import type { Binding, Field } from '@tableapp/schema'

const INPUT =
  'w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm outline-none focus:border-sage-400'

/** Источник значения: константа, поле строки или свойство вошедшего пользователя. */
export function BindingEditor({
  label,
  value,
  fields,
  onChange,
}: {
  label: string
  value: Binding
  fields: Field[]
  onChange: (binding: Binding) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-[var(--color-ink-muted)]">{label}</span>
      <div className="flex gap-1.5">
        <select
          value={value.kind}
          onChange={(event) => {
            const kind = event.target.value as Binding['kind']
            if (kind === 'literal') return onChange({ kind: 'literal', value: '' })
            if (kind === 'user') return onChange({ kind: 'user', property: 'email' })
            onChange({ kind: 'field', fieldId: fields[0]?.id ?? '' })
          }}
          className={`${INPUT} w-32 shrink-0`}
        >
          <option value="field">поле</option>
          <option value="literal">текст</option>
          <option value="user">вошедший</option>
        </select>

        {value.kind === 'field' ? (
          <select
            value={value.fieldId}
            onChange={(event) => onChange({ kind: 'field', fieldId: event.target.value })}
            className={INPUT}
          >
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        ) : null}

        {value.kind === 'literal' ? (
          <input
            value={String(value.value ?? '')}
            onChange={(event) => onChange({ kind: 'literal', value: event.target.value })}
            placeholder="текст"
            className={INPUT}
          />
        ) : null}

        {value.kind === 'user' ? (
          <select
            value={value.property}
            onChange={(event) =>
              onChange({ kind: 'user', property: event.target.value as 'email' | 'name' | 'id' })
            }
            className={INPUT}
          >
            <option value="email">почта</option>
            <option value="name">имя</option>
            <option value="id">идентификатор</option>
          </select>
        ) : null}
      </div>
    </label>
  )
}
