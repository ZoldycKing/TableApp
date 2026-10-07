'use client'

import { FUNCTION_NAMES } from '@tableapp/formula'
import type { Field } from '@tableapp/schema'
import { useEffect, useRef, useState } from 'react'
import { checkFormulaAction } from '@/app/field-actions'

const RESULT_LABELS: Record<string, string> = {
  text: 'текст',
  number: 'число',
  checkbox: 'да/нет',
  date: 'дата',
  unknown: 'не определён',
}

const CHECK_DELAY_MS = 400

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; resultType: string }
  | { kind: 'error'; message: string }

export function FormulaEditor({
  tableId,
  fieldId,
  fields,
  expression,
  onChange,
}: {
  tableId: string
  fieldId: string | null
  fields: Field[]
  expression: string
  onChange: (expression: string) => void
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const areaRef = useRef<HTMLTextAreaElement>(null)

  /** Проверка идёт на сервере тем же компилятором, что и при сохранении. */
  useEffect(() => {
    if (expression.trim() === '') {
      setStatus({ kind: 'idle' })
      return
    }
    setStatus({ kind: 'checking' })
    const timer = setTimeout(async () => {
      const result = await checkFormulaAction(tableId, fieldId, expression)
      setStatus(result.ok ? { kind: 'ok', resultType: result.resultType } : { kind: 'error', message: result.error })
    }, CHECK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [expression, tableId, fieldId])

  const insert = (text: string) => {
    const area = areaRef.current
    if (!area) return onChange(expression + text)
    const start = area.selectionStart
    const end = area.selectionEnd
    const next = expression.slice(0, start) + text + expression.slice(end)
    onChange(next)
    // Курсор ставится после вставки, иначе продолжать набор неудобно.
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(start + text.length, start + text.length)
    })
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={areaRef}
        value={expression}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        spellCheck={false}
        placeholder="Например: {Цена} * {Количество}"
        className="w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 font-mono text-sm outline-none focus:border-sage-400"
      />

      {status.kind === 'error' ? (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
          {status.message}
        </p>
      ) : null}
      {status.kind === 'ok' ? (
        <p className="text-xs text-green-700">
          Формула верна, тип результата — {RESULT_LABELS[status.resultType] ?? status.resultType}
        </p>
      ) : null}
      {status.kind === 'checking' ? (
        <p className="text-xs text-[var(--color-ink-muted)]">Проверяем…</p>
      ) : null}

      <div className="space-y-1">
        <span className="block text-xs font-medium text-[var(--color-ink-muted)]">Поля</span>
        <div className="flex flex-wrap gap-1">
          {fields
            .filter((field) => field.id !== fieldId)
            .map((field) => (
              <button
                key={field.id}
                type="button"
                onClick={() => insert(`{${field.name}}`)}
                className="rounded border border-[var(--color-border-subtle)] px-1.5 py-0.5 text-xs hover:bg-[var(--color-surface-muted)]"
              >
                {field.name}
              </button>
            ))}
        </div>
      </div>

      <details>
        <summary className="cursor-pointer text-xs text-[var(--color-ink-muted)]">
          Доступные функции ({FUNCTION_NAMES.length})
        </summary>
        <div className="mt-1 flex flex-wrap gap-1">
          {FUNCTION_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => insert(`${name}(`)}
              className="rounded border border-[var(--color-border-subtle)] px-1.5 py-0.5 font-mono text-xs hover:bg-[var(--color-surface-muted)]"
            >
              {name}
            </button>
          ))}
        </div>
      </details>
    </div>
  )
}
