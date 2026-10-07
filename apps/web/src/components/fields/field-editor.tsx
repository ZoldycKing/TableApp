'use client'

import type { Field, FieldType } from '@tableapp/schema'
import { normalizeFieldOptions } from '@tableapp/schema'
import { useEffect, useState, useTransition } from 'react'
import { createFieldAction, deleteFieldAction, updateFieldAction } from '@/app/field-actions'
import { FIELD_LABELS } from '@/lib/field-labels'
import type { TableSummary } from '@/lib/queries'
import { ChoicesEditor, NumberOptions, RelationDerivedOptions, RelationOptions } from './field-options'
import { FormulaEditor } from './formula-editor'

/** Типы, которые можно выбрать руками. Системные поля создаются платформой. */
const SELECTABLE_TYPES: FieldType[] = [
  'text', 'long_text', 'number', 'date', 'datetime', 'checkbox',
  'single_select', 'multi_select', 'email', 'phone', 'url',
  'relation', 'formula', 'lookup', 'rollup', 'count',
]

const TYPE_GROUPS: { label: string; types: FieldType[] }[] = [
  { label: 'Основные', types: ['text', 'long_text', 'number', 'date', 'datetime', 'checkbox'] },
  { label: 'Выбор и контакты', types: ['single_select', 'multi_select', 'email', 'phone', 'url'] },
  { label: 'Связи и вычисления', types: ['relation', 'formula', 'lookup', 'rollup', 'count'] },
]

type Props = {
  tableId: string
  field: Field | null
  fields: Field[]
  workspaceTables: TableSummary[]
  onClose: () => void
  onSaved: () => void
}

export function FieldEditor({ tableId, field, fields, workspaceTables, onClose, onSaved }: Props) {
  const [name, setName] = useState(field?.name ?? '')
  const [type, setType] = useState<FieldType>(field?.type ?? 'text')
  const [options, setOptions] = useState<Record<string, unknown>>(
    () => (field?.options as Record<string, unknown>) ?? normalizeFieldOptions('text'),
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Смена типа сбрасывает настройки: у числа и у связи нет ничего общего.
  useEffect(() => {
    if (field && type === field.type) {
      setOptions((field.options as Record<string, unknown>) ?? {})
      return
    }
    setOptions(normalizeFieldOptions(type))
  }, [type, field])

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = field
        ? await updateFieldAction(tableId, field.id, { name, type, options })
        : await createFieldAction(tableId, { name, type, options })
      if (result.ok) onSaved()
      else setError(result.error)
    })
  }

  const remove = () => {
    if (!field) return
    setError(null)
    startTransition(async () => {
      const result = await deleteFieldAction(tableId, field.id)
      if (result.ok) onSaved()
      else setError(result.error)
    })
  }

  const typeChanged = Boolean(field && field.type !== type)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[min(26rem,100vw)] flex-col border-l border-[var(--color-border-subtle)] bg-[var(--color-surface)] shadow-xl">
        <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
          <h2 className="text-sm font-semibold">{field ? 'Настройки поля' : 'Новое поле'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            ×
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-[var(--color-ink-muted)]">Название</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например: Сумма заказа"
              className="w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm outline-none focus:border-sage-400"
            />
          </label>

          <label className="space-y-1">
            <span className="block text-xs font-medium text-[var(--color-ink-muted)]">Тип</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as FieldType)}
              className="w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm outline-none focus:border-sage-400"
            >
              {TYPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {FIELD_LABELS[candidate]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {typeChanged ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Тип меняется у существующего поля. Значения будут преобразованы, а то,
              что не переводится в новый тип, очистится.
            </p>
          ) : null}

          {type === 'number' ? <NumberOptions options={options} onChange={setOptions} /> : null}

          {type === 'single_select' || type === 'multi_select' ? (
            <ChoicesEditor
              choices={(options.choices as { id: string; name: string; color: string }[]) ?? []}
              onChange={(choices) => setOptions({ ...options, choices })}
            />
          ) : null}

          {type === 'relation' ? (
            <RelationOptions
              options={options}
              tables={workspaceTables}
              currentTableId={tableId}
              onChange={setOptions}
            />
          ) : null}

          {type === 'lookup' || type === 'rollup' || type === 'count' ? (
            <RelationDerivedOptions
              type={type}
              options={options}
              fields={fields}
              tables={workspaceTables}
              onChange={setOptions}
            />
          ) : null}

          {type === 'formula' ? (
            <FormulaEditor
              tableId={tableId}
              fieldId={field?.id ?? null}
              fields={fields}
              expression={String(options.expression ?? '')}
              onChange={(expression) => setOptions({ ...options, expression })}
            />
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center gap-2 border-t border-[var(--color-border-subtle)] px-4 py-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || name.trim() === ''}
            className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? 'Сохраняем…' : field ? 'Сохранить' : 'Создать поле'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm hover:bg-[var(--color-surface-muted)]"
          >
            Отмена
          </button>
          {field ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="ml-auto rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              Удалить
            </button>
          ) : null}
        </footer>
      </div>
    </>
  )
}

export { SELECTABLE_TYPES }
