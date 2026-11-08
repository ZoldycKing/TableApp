'use client'

import { dateInstant, fieldTimeZone, instantToWallClock, type Attachment, type Field } from '@tableapp/schema'
import type { KeyboardEvent, Ref } from 'react'
import { useEffect, useRef, useState } from 'react'
import { FileUpload } from '@/components/file-upload'
import { useUnsaved } from '@/lib/unsaved'

type EditorProps = {
  field: Field
  value: unknown
  /** Заголовки строк связанной таблицы: id -> как показать человеку. */
  relatedOptions?: { id: string; title: string }[]
  onCommit: (value: unknown, navigate?: 'next' | 'previous' | 'below' | 'above' | 'save') => void
  onCancel: () => void
}

/**
 * Дата хранится мгновением в ISO, а вводится и показывается по времени
 * продукта. Раньше поле ввода показывало срез UTC, а сохраняло время браузера:
 * дата менялась сама, если открыть ячейку и нажать «Готово».
 */
function toDateInput(value: unknown, withTime: boolean, zone: string): string {
  if (!value) return ''
  const instant = dateInstant(value, zone)
  const wall = instant === null ? null : instantToWallClock(new Date(instant), zone)
  if (!wall) return ''
  return withTime ? `${wall.date}T${wall.time}` : wall.date
}

/** Обратное преобразование: «2026-03-16T09:30» из поля ввода → мгновение. */
function fromDateInput(draft: string, zone: string): string | null {
  const instant = dateInstant(draft, zone)
  return instant === null ? null : new Date(instant).toISOString()
}

const SHARED =
  'absolute inset-0 z-10 w-full border-2 border-sage-400 bg-white px-2 py-1 text-sm outline-none'

export function CellEditor({ field, value, relatedOptions, onCommit, onCancel }: EditorProps) {
  const [error, setError] = useState('')
  const [selectedValues,setSelectedValues]=useState<string[]>(Array.isArray(value)?value.map(String):[])
  const [draft, setDraft] = useState(() => {
    if (field.type === 'date') return toDateInput(value, false, fieldTimeZone(field))
    if (field.type === 'datetime') return toDateInput(value, true, fieldTimeZone(field))
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

  const commit = (navigate?: 'next' | 'previous' | 'below' | 'above' | 'save') => {
    if(field.type==='multi_select'||field.type==='relation'&&field.options.allowMultiple)return onCommit(selectedValues,navigate)
    if (field.type === 'number') {
      // Ввод «1 234,50» должен приниматься так же, как «1234.50».
      const normalized = draft.trim().replace(/\s/g, '').replace(',', '.')
      if (normalized === '') return onCommit(null, navigate)
      const parsed = Number(normalized)
      if (!Number.isFinite(parsed)) { setError('Введите число.'); return }
      return onCommit(parsed, navigate)
    }
    if (field.type === 'date' || field.type === 'datetime') {
      if (draft === '') return onCommit(null, navigate)
      const parsed = fromDateInput(draft, fieldTimeZone(field))
      if (parsed !== null) onCommit(parsed, navigate)
      else setError('Проверьте дату.')
      return
    }
    return onCommit(draft === '' ? null : draft, navigate)
  }

  const handleKey = (event: KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'Tab') { event.preventDefault(); commit(event.shiftKey ? 'previous' : 'next'); return }
    const multiline = field.type === 'long_text' && event.shiftKey
    if (event.key === 'Enter' && !multiline) {
      event.preventDefault()
      commit(event.ctrlKey || event.metaKey ? 'save' : event.shiftKey ? 'above' : 'below')
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
    const selected = selectedValues
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
        onChange={(event) => setSelectedValues([...event.target.selectedOptions].map((option) => option.value))}
        onBlur={()=>commit()}
        onKeyDown={handleKey}
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

  if(field.type==='multi_select')return <select ref={ref as Ref<HTMLSelectElement>} aria-label={field.name} multiple value={selectedValues} onChange={event=>setSelectedValues([...event.target.selectedOptions].map(option=>option.value))} onBlur={()=>commit()} onKeyDown={handleKey} className={`${SHARED} h-auto min-h-32`}>{field.options.choices.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</select>

  if (field.type === 'single_select') {
    return (
      <select
        ref={ref as Ref<HTMLSelectElement>}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit()}
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
        onBlur={() => commit()}
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

  return <>
    <input
      ref={ref as Ref<HTMLInputElement>}
      type={inputType}
      value={draft}
      onChange={(event) => { setDraft(event.target.value); setError('') }}
      aria-label={field.name}
      aria-invalid={!!error}
      onBlur={() => commit()}
      onKeyDown={handleKey}
      className={SHARED}
    />
    {error ? <span role="alert" className="absolute left-0 top-full z-30 w-max max-w-64 rounded-lg border border-red-200 bg-white p-2 text-xs text-red-700 shadow-soft">{error}</span> : null}
  </>
}
