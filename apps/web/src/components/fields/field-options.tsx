'use client'

import type { Field, FieldType, RollupFn } from '@tableapp/schema'
import { COLORS, newId } from '@tableapp/schema'
import { CHOICE_COLORS } from '@/components/views/card'
import type { TableSummary } from '@/lib/queries'

const INPUT =
  'w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm outline-none focus:border-blue-500'
const LABEL = 'block text-xs font-medium text-[var(--color-ink-muted)]'

type Choice = { id: string; name: string; color: string }

export function ChoicesEditor({
  choices,
  onChange,
}: {
  choices: Choice[]
  onChange: (choices: Choice[]) => void
}) {
  const palette = COLORS.filter((color) => color !== 'gray')

  return (
    <div className="space-y-1.5">
      <span className={LABEL}>Варианты</span>
      {choices.map((choice, index) => (
        <div key={choice.id} className="flex items-center gap-1.5">
          <select
            value={choice.color}
            onChange={(event) => {
              const next = [...choices]
              next[index] = { ...choice, color: event.target.value }
              onChange(next)
            }}
            className={`w-24 rounded px-1.5 py-1 text-xs ${CHOICE_COLORS[choice.color] ?? CHOICE_COLORS.gray}`}
          >
            {COLORS.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
          <input
            value={choice.name}
            onChange={(event) => {
              const next = [...choices]
              next[index] = { ...choice, name: event.target.value }
              onChange(next)
            }}
            className={INPUT}
          />
          <button
            type="button"
            onClick={() => onChange(choices.filter((_, i) => i !== index))}
            className="rounded px-2 py-1 text-sm text-[var(--color-ink-muted)] hover:bg-red-50 hover:text-red-600"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...choices,
            { id: newId('choice'), name: '', color: palette[choices.length % palette.length]! },
          ])
        }
        className="rounded px-2 py-1 text-sm text-blue-700 hover:bg-blue-50"
      >
        + Вариант
      </button>
    </div>
  )
}

export function NumberOptions({
  options,
  onChange,
}: {
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1">
        <span className={LABEL}>Формат</span>
        <select
          value={String(options.format ?? 'plain')}
          onChange={(event) => onChange({ ...options, format: event.target.value })}
          className={INPUT}
        >
          <option value="plain">обычное число</option>
          <option value="currency">деньги</option>
          <option value="percent">проценты</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className={LABEL}>Знаков после запятой</span>
        <input
          type="number"
          min={0}
          max={8}
          value={Number(options.precision ?? 0)}
          onChange={(event) => onChange({ ...options, precision: Number(event.target.value) })}
          className={INPUT}
        />
      </label>
    </div>
  )
}

export function RelationOptions({
  options,
  tables,
  currentTableId,
  onChange,
}: {
  options: Record<string, unknown>
  tables: TableSummary[]
  currentTableId: string
  onChange: (options: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-2">
      <label className="space-y-1">
        <span className={LABEL}>Таблица</span>
        <select
          value={String(options.tableId ?? '')}
          onChange={(event) => onChange({ ...options, tableId: event.target.value })}
          className={INPUT}
        >
          <option value="">— выберите таблицу —</option>
          {tables.map((table) => (
            <option key={table.id} value={table.id}>
              {table.name}
              {table.id === currentTableId ? ' (эта же)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(options.allowMultiple)}
          onChange={(event) => onChange({ ...options, allowMultiple: event.target.checked })}
        />
        Можно выбрать несколько строк
      </label>
    </div>
  )
}

const ROLLUP_LABELS: Record<RollupFn, string> = {
  sum: 'сумма',
  count: 'количество',
  min: 'минимум',
  max: 'максимум',
  avg: 'среднее',
  and: 'все отмечены',
  or: 'хотя бы один отмечен',
  concat: 'перечислить через запятую',
}

/** Настройки Lookup, Rollup и количества связей: все три опираются на поле связи. */
export function RelationDerivedOptions({
  type,
  options,
  fields,
  tables,
  onChange,
}: {
  type: FieldType
  options: Record<string, unknown>
  fields: Field[]
  tables: TableSummary[]
  onChange: (options: Record<string, unknown>) => void
}) {
  const relations = fields.filter(
    (field): field is Extract<Field, { type: 'relation' }> => field.type === 'relation',
  )
  const relation = relations.find((field) => field.id === options.relationFieldId)
  const targetTable = relation ? tables.find((table) => table.id === relation.options.tableId) : undefined
  const targetFields = (targetTable?.fields ?? []).filter((field) => field.type !== 'relation')

  if (relations.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Сначала добавьте в таблицу поле типа «Связь» — без него брать значения неоткуда.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <label className="space-y-1">
        <span className={LABEL}>Через поле связи</span>
        <select
          value={String(options.relationFieldId ?? '')}
          onChange={(event) => onChange({ ...options, relationFieldId: event.target.value, targetFieldId: '' })}
          className={INPUT}
        >
          <option value="">— выберите связь —</option>
          {relations.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </select>
      </label>

      {type !== 'count' ? (
        <label className="space-y-1">
          <span className={LABEL}>
            Поле в таблице {targetTable ? `«${targetTable.name}»` : 'связи'}
          </span>
          <select
            value={String(options.targetFieldId ?? '')}
            onChange={(event) => onChange({ ...options, targetFieldId: event.target.value })}
            disabled={!relation}
            className={INPUT}
          >
            <option value="">— выберите поле —</option>
            {targetFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {type === 'rollup' ? (
        <label className="space-y-1">
          <span className={LABEL}>Что посчитать</span>
          <select
            value={String(options.fn ?? 'sum')}
            onChange={(event) => onChange({ ...options, fn: event.target.value })}
            className={INPUT}
          >
            {(Object.keys(ROLLUP_LABELS) as RollupFn[]).map((fn) => (
              <option key={fn} value={fn}>
                {ROLLUP_LABELS[fn]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  )
}
