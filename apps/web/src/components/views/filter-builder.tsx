'use client'

import type { Field, FilterCondition, FilterGroup, FilterOp } from '@tableapp/schema'
import { isGroup, isUnary, newId, operatorsFor } from '@tableapp/schema'
import { OP_LABELS } from '@/lib/field-labels'
import { FilterValueInput } from './filter-value-input'

const SELECT_CLASS =
  'rounded border border-[var(--color-border-subtle)] bg-white px-2 py-1 text-sm outline-none focus:border-sage-400'

type Props = {
  fields: Field[]
  group: FilterGroup
  onChange: (group: FilterGroup) => void
  onRemove?: () => void
  depth?: number
}

function newCondition(fields: Field[]): FilterCondition {
  const field = fields[0]
  const op = field ? (operatorsFor(field.type)[0] ?? 'is') : 'is'
  return { id: newId('filter'), fieldId: field?.id ?? '', op, value: null }
}

export function FilterBuilder({ fields, group, onChange, onRemove, depth = 0 }: Props) {
  const replace = (index: number, node: FilterCondition | FilterGroup) => {
    const conditions = [...group.conditions]
    conditions[index] = node
    onChange({ ...group, conditions })
  }

  const remove = (index: number) => {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== index) })
  }

  return (
    <div className={depth > 0 ? 'rounded-lg border border-[var(--color-border-subtle)] p-2' : ''}>
      {group.conditions.length === 0 ? (
        <p className="px-1 py-2 text-sm text-[var(--color-ink-muted)]">Условий нет — показаны все строки.</p>
      ) : null}

      <div className="space-y-2">
        {group.conditions.map((node, index) => (
          <div key={isGroup(node) ? node.id : node.id} className="flex flex-wrap items-start gap-2">
            <div className="w-16 shrink-0 pt-1 text-xs text-[var(--color-ink-muted)]">
              {index === 0 ? (
                'Где'
              ) : index === 1 ? (
                <select
                  value={group.conjunction}
                  onChange={(event) =>
                    onChange({ ...group, conjunction: event.target.value as 'and' | 'or' })
                  }
                  className={`${SELECT_CLASS} w-full px-1 py-0.5 text-xs`}
                >
                  <option value="and">и</option>
                  <option value="or">или</option>
                </select>
              ) : (
                <span className="pl-1">{group.conjunction === 'and' ? 'и' : 'или'}</span>
              )}
            </div>

            {isGroup(node) ? (
              <div className="min-w-0 flex-1">
                <FilterBuilder
                  fields={fields}
                  group={node}
                  depth={depth + 1}
                  onChange={(next) => replace(index, next)}
                  onRemove={() => remove(index)}
                />
              </div>
            ) : (
              <ConditionRow
                fields={fields}
                condition={node}
                onChange={(next) => replace(index, next)}
                onRemove={() => remove(index)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() =>
            onChange({ ...group, conditions: [...group.conditions, newCondition(fields)] })
          }
          className="rounded px-2 py-1 text-sm text-sage-700 hover:bg-sage-50"
        >
          + Условие
        </button>
        {depth < 2 ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...group,
                conditions: [
                  ...group.conditions,
                  { id: newId('group'), conjunction: 'and', conditions: [newCondition(fields)] },
                ],
              })
            }
            className="rounded px-2 py-1 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
          >
            + Группа условий
          </button>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            Удалить группу
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ConditionRow({
  fields,
  condition,
  onChange,
  onRemove,
}: {
  fields: Field[]
  condition: FilterCondition
  onChange: (condition: FilterCondition) => void
  onRemove: () => void
}) {
  const field = fields.find((f) => f.id === condition.fieldId)
  const operators = field ? operatorsFor(field.type) : []

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <select
        value={condition.fieldId}
        onChange={(event) => {
          const next = fields.find((f) => f.id === event.target.value)
          // Смена поля может сделать оператор невозможным — берём первый допустимый.
          const ops = next ? operatorsFor(next.type) : []
          const op = ops.includes(condition.op) ? condition.op : (ops[0] ?? 'is')
          onChange({ ...condition, fieldId: event.target.value, op, value: null })
        }}
        className={SELECT_CLASS}
      >
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      <select
        value={condition.op}
        onChange={(event) => onChange({ ...condition, op: event.target.value as FilterOp, value: null })}
        className={SELECT_CLASS}
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op] ?? op}
          </option>
        ))}
      </select>

      {isUnary(condition.op) ? null : (
        <FilterValueInput
          field={field}
          op={condition.op}
          value={condition.value}
          onChange={(value) => onChange({ ...condition, value })}
        />
      )}

      <button
        type="button"
        onClick={onRemove}
        title="Удалить условие"
        className="rounded px-2 py-1 text-sm text-[var(--color-ink-muted)] hover:bg-red-50 hover:text-red-600"
      >
        ×
      </button>
    </div>
  )
}
