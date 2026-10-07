'use client'

import { instantToWallClock, wallClockToInstant, type Attachment, type Field } from '@tableapp/schema'
import type { KeyboardEvent, Ref } from 'react'
import { useEffect, useRef, useState } from 'react'
import { FileUpload } from '@/components/file-upload'
import { useUnsaved } from '@/lib/unsaved'

type EditorProps = {
  field: Field
  value: unknown
  /** Заголовки строк связанной таблицы: id -> как показать человеку. */
  relatedOptions?: { id: string; title: string }[]
  onCommit: (value: unknown) => void
  onCancel: () => void
}

/**
 * Дата хранится мгновением в ISO, а вводится и показывается по времени
 * продукта. Раньше поле ввода показывало срез UTC, а сохраняло время браузера:
 * дата менялась сама, если открыть ячейку и нажать «Готово».
 */
function toDateInput(value: unknown, withTime: boolean): string {
  if (!value) return ''
  const wall = instantToWallClock(String(value))
  if (!wall) return ''
  return withTime ? `${wall.date}T${wall.time}` : wall.date
}

/** Обратное преобразование: «2026-03-16T09:30» из поля ввода → мгновение. */
function fromDateInput(draft: string): string | null {
  const [datePart, timePart = ''] = draft.split('T')
  const [year, month, day] = (datePart ?? '').split('-').map(Number)
  if (!year || !month || !day) return null

  const [hour = 0, minute = 0] = timePart ? timePart.split(':').map(Number) : []
  return wallClockToInstant({ year, month, day, hour, minute }).toISOString()
}

const SHARED =
  'absolute inset-0 z-10 w-full border-2 border-sage-400 bg-white px-2 py-1 text-sm outline-none'

export function CellEditor({ field, value, relatedOptions, onCommit, onCancel }: EditorProps) {
  const [draft, setDraft] = useState(() => {
    if (field.type === 'date') return toDateInput(value, false)
    if (field.type === 'datetime') return toDateInput(value, true)
    return value === null || value === undefined ? '' : String(value)
  })

  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  /*
   * Пока ячейка открыта, живые обновления ждут: перечитывание страницы
   * заменило бы строку целиком вместе с тем, что человек уже набрал.
   * Отметка снимается сама при закрытии редактора.
   */
  useUnsaved(`cell:${field.id}`, true)

  useEffect(() => {
    const element = ref.current
    element?.focus()
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.select()
    }
  }, [])

  const commit = () => {
    if (field.type === 'number') {
      // Ввод «1 234,50» должен приниматься так же, как «1234.50».
      const normalized = draft.trim().replace(/\s/g, '').replace(',', '.')
      if (normalized === '') return onCommit(null)
      const parsed = Number(normalized)
      return onCommit(Number.isFinite(parsed) ? parsed : null)
    }
    if (field.type === 'date' || field.type === 'datetime') {
      if (draft === '') return onCommit(null)
      return onCommit(fromDateInput(draft))
    }
    return onCommit(draft === '' ? null : draft)
  }

  const handleKey = (event: KeyboardEvent) => {
    const multiline = field.type === 'long_text' && event.shiftKey
    if (event.key === 'Enter' && !multiline) {
      event.preventDefault()
      commit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  if (field.type === 'attachment' || field.type === 'image') {
    const current = Array.isArray(value) ? (value as Attachment[]) : []
    // Загрузчику нужно место, поэтому он всплывает над ячейкой, а не втискивается в неё.
    return (
      <div className="absolute left-0 top-0 z-20 min-w-64 rounded-lg border-2 border-sage-400 bg-white p-2 shadow-lg">
        <FileUpload
          value={current}
          maxCount={field.options.maxCount}
          compact
          onChange={(next) => onCommit(next)}
        />
        <button
          type="button"
          onClick={onCancel}
          className="mt-1 w-full rounded px-2 py-1 text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          Готово
        </button>
      </div>
    )
  }

  if (field.type === 'relation') {
    const selected = Array.isArray(value) ? value.map(String) : []
    const options = relatedOptions ?? []

    if (!field.options.allowMultiple) {
      return (
        <select
          ref={ref as Ref<HTMLSelectElement>}
          value={selected[0] ?? ''}
          onChange={(event) => onCommit(event.target.value ? [event.target.value] : [])}
          onBlur={onCancel}
          onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}
          className={SHARED}
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>
      )
    }

    // Несколько связей выбираются списком: нативный множественный выбор
    // работает с клавиатуры и не требует своего выпадающего меню.
    return (
      <select
        ref={ref as Ref<HTMLSelectElement>}
        multiple
        value={selected}
        onChange={(event) =>
          onCommit([...event.target.selectedOptions].map((option) => option.value))
        }
        onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}
        className={`${SHARED} h-auto min-h-32`}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'single_select') {
    return (
      <select
        ref={ref as Ref<HTMLSelectElement>}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className={SHARED}
      >
        <option value="">—</option>
        {field.options.choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'long_text') {
    return (
      <textarea
        ref={ref as Ref<HTMLTextAreaElement>}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        rows={4}
        className={`${SHARED} h-auto min-h-full resize-y`}
      />
    )
  }

  const inputType =
    field.type === 'date' ? 'date'
      : field.type === 'datetime' ? 'datetime-local'
      : field.type === 'email' ? 'email'
      : field.type === 'url' ? 'url'
      : field.type === 'phone' ? 'tel'
      : 'text'

  return (
    <input
      ref={ref as Ref<HTMLInputElement>}
      type={inputType}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKey}
      className={SHARED}
    />
  )
}
