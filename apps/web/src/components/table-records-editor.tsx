'use client'

import { dateInstant, fieldTimeZone, instantToWallClock, isComputed, parseCellValue, type Attachment, type Field } from '@tableapp/schema'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ActionResult } from '@/app/actions'
import { FileUpload } from '@/components/file-upload'
import { FIELD_LABELS } from '@/lib/field-labels'
import { cellText, type TitleIndex } from '@/lib/table-export'
import type { TableRow } from '@/lib/table-store'
import { useUnsaved } from '@/lib/unsaved'

const INPUT = 'w-full min-w-0 rounded-lg border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-base outline-none transition-colors focus:border-sage-400 focus:ring-2 focus:ring-sage-200 sm:text-sm'
const BUTTON = 'rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-500 disabled:opacity-40'

type Props = {
  rows: TableRow[]
  allRows?: TableRow[]
  fields: Field[]
  titleField?: Field
  selectedRowId: string | null
  relatedTitles: TitleIndex
  readOnly: boolean
  adding?: boolean
  onSelect: (id: string | null) => void
  onAdd: () => void
  onSave: (rowId: string, fieldId: string, value: unknown, base: unknown) => Promise<ActionResult>
  onDirtyChange: (dirty: boolean) => void
  registerLeaveGuard?: (guard: (() => Promise<boolean>) | null) => void
  actions?: (row: TableRow) => ReactNode
}

/** The record and grid editors share row IDs, server writes and conflict bases. */
export function TableRecordsEditor({ rows, allRows, fields, titleField, selectedRowId, relatedTitles, readOnly, adding, onSelect, onAdd, onSave, onDirtyChange, registerLeaveGuard, actions }: Props) {
  const current = (allRows ?? rows).find(row => row.id === selectedRowId)
  const lastSelected = useRef<TableRow | null>(null)
  const rowButtons = useRef(new Map<string, HTMLButtonElement>())
  const listHeading = useRef<HTMLHeadingElement>(null)
  const previousSelection = useRef(selectedRowId)
  if (current) lastSelected.current = current
  const selected = current ?? (lastSelected.current?.id === selectedRowId ? lastSelected.current : undefined)
  const unavailable = !!selected && !current
  const details = fields.filter(field => field.id !== titleField?.id).slice(0, 2)
  useEffect(() => {
    const previous = previousSelection.current
    previousSelection.current = selectedRowId
    if (selectedRowId !== null || previous === null) return
    const destination = rowButtons.current.get(previous) ?? listHeading.current
    destination?.focus({ preventScroll: true })
    destination?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedRowId])
  return <section className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-soft lg:grid lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
    <aside aria-label="Записи таблицы" className={`${selected ? 'hidden lg:block' : ''} min-w-0 border-[var(--color-border-subtle)] lg:border-r`}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3">
        <h2 ref={listHeading} tabIndex={-1} className="scroll-mt-20 rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage-400">Записи <span className="font-normal text-ink-muted">{rows.length}</span></h2>
        {!readOnly ? <button type="button" disabled={adding} onClick={onAdd} className={BUTTON}>{adding ? 'Добавление…' : '+ Запись'}</button> : null}
      </div>
      <div className="max-h-[65vh] overflow-y-auto p-2">
        {rows.length ? rows.map((row, index) => <button key={row.id} ref={element => { if (element) rowButtons.current.set(row.id, element); else rowButtons.current.delete(row.id) }} type="button" aria-current={selected?.id === row.id ? 'true' : undefined} onClick={() => onSelect(row.id)} className={`mb-1 block w-full min-w-0 scroll-mt-20 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-sage-500 ${selected?.id === row.id ? 'border-sage-300 bg-sage-50' : 'border-transparent hover:bg-sand-50'}`}>
          <span className="block truncate text-sm font-medium">{titleField ? cellText(titleField, row.data[titleField.id], relatedTitles) || `Запись ${index + 1}` : `Запись ${index + 1}`}</span>
          {details.map(field => <span key={field.id} className="mt-1 block truncate text-xs text-ink-muted">{field.name}: {cellText(field, row.data[field.id], relatedTitles) || '—'}</span>)}
        </button>) : <p className="px-3 py-8 text-sm text-ink-muted">Записей нет. {readOnly ? 'Попробуйте изменить поиск.' : 'Добавьте первую запись или измените поиск.'}</p>}
      </div>
    </aside>
    <div className={`min-w-0 ${selected ? '' : 'hidden lg:block'}`}>
      {selected ? <RecordForm key={selected.id} row={selected} fields={fields} titleField={titleField} relatedTitles={relatedTitles} readOnly={readOnly} creating={adding} unavailable={unavailable} onSave={onSave} onDirtyChange={onDirtyChange} registerLeaveGuard={registerLeaveGuard} onBack={() => onSelect(null)} actions={unavailable ? undefined : actions?.(selected)} /> : <div className="px-6 py-16 text-center text-sm text-ink-muted"><p>Выберите запись, чтобы {readOnly ? 'посмотреть все поля' : 'посмотреть и изменить её поля'}.</p>{!readOnly ? <button type="button" disabled={adding} onClick={onAdd} className={`${BUTTON} mt-4`}>Добавить запись</button> : null}</div>}
    </div>
  </section>
}

function RecordForm({ row, fields, titleField, relatedTitles, readOnly, creating, unavailable = false, onSave, onDirtyChange, registerLeaveGuard, onBack, actions }: {
  row: TableRow; fields: Field[]; titleField?: Field; relatedTitles: TitleIndex; readOnly: boolean; creating?: boolean; unavailable?: boolean
  onSave: Props['onSave']; onDirtyChange: Props['onDirtyChange']; registerLeaveGuard?: Props['registerLeaveGuard']; onBack: () => void; actions?: ReactNode
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(row.data)
  const container = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    // The list disappears on phones; keep the record header and return action visible.
    if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches) {
      container.current?.scrollIntoView?.({ block: 'start' })
    }
  }, [row.id])
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [uploads, setUploads] = useState<Set<string>>(new Set())
  const uploading = uploads.size > 0
  const base = useRef(row.data)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const revisions = useRef<Record<string, number>>({})
  const dirtyRef = useRef(changed)
  const savingRef = useRef(new Set<string>())
  dirtyRef.current = changed
  const dirty = changed.size > 0 || saving.size > 0 || uploading
  useUnsaved(`record-form:${row.id}`, dirty)
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false) }, [dirty, onDirtyChange])
  useEffect(() => {
    setDraft(current => {
      const next = { ...current }
      for (const field of fields) if (!dirtyRef.current.has(field.id) && !savingRef.current.has(field.id)) next[field.id] = row.data[field.id]
      return next
    })
    for (const field of fields) if (!dirtyRef.current.has(field.id) && !savingRef.current.has(field.id)) base.current = { ...base.current, [field.id]: row.data[field.id] }
  }, [row.data, fields])

  const change = (field: Field, value: unknown) => {
    if (readOnly) return
    draftRef.current = { ...draftRef.current, [field.id]: value }
    setDraft(draftRef.current)
    revisions.current[field.id] = (revisions.current[field.id] ?? 0) + 1
    dirtyRef.current = new Set(dirtyRef.current).add(field.id)
    setChanged(new Set(dirtyRef.current))
    setErrors(current => { const next = { ...current }; delete next[field.id]; return next })
  }

  const save = async (field: Field) => {
    if (readOnly || creating || !dirtyRef.current.has(field.id) || savingRef.current.has(field.id)) return
    if (unavailable) { setErrors(current => ({ ...current, [field.id]: 'Запись больше недоступна. Введённое сохранено на экране — скопируйте его перед выходом.' })); return }
    const revision = revisions.current[field.id] ?? 0
    let value: unknown
    try {
      const raw = draftRef.current[field.id]
      if (field.type === 'number' && typeof raw === 'string' && raw.trim()) {
        const parsed = Number(raw.trim().replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(parsed)) throw new Error('Введите число, например 1 250,50.')
        value = parseCellValue(field, parsed)
      } else value = parseCellValue(field, raw === '' ? null : raw)
    } catch (error) {
      setErrors(current => ({ ...current, [field.id]: error instanceof Error ? error.message : 'Проверьте значение поля.' }))
      return
    }
    savingRef.current.add(field.id)
    setSaving(new Set(savingRef.current))
    try {
      const result = await onSave(row.id, field.id, value, base.current[field.id] ?? null)
      if (!result.ok) {
        setErrors(current => ({ ...current, [field.id]: result.error }))
        return
      }
      base.current = { ...base.current, [field.id]: value }
      if ((revisions.current[field.id] ?? 0) !== revision) return
      draftRef.current = { ...draftRef.current, [field.id]: value }
      setDraft(current => ({ ...current, [field.id]: value }))
      dirtyRef.current = new Set(dirtyRef.current)
      dirtyRef.current.delete(field.id)
      setChanged(new Set(dirtyRef.current))
      setErrors(current => { const next = { ...current }; delete next[field.id]; return next })
    } catch {
      setErrors(current => ({ ...current, [field.id]: 'Не удалось сохранить. Введённое осталось здесь — попробуйте ещё раз.' }))
    } finally {
      savingRef.current.delete(field.id)
      setSaving(new Set(savingRef.current))
    }
  }

  const flush = useRef<() => Promise<boolean>>(async () => true)
  flush.current = async () => {
    if (uploading || creating || unavailable) return false
    for (const field of fields) await save(field)
    // A blur may already have started a save before the navigation button fires.
    while (savingRef.current.size) await new Promise(resolve => setTimeout(resolve, 25))
    return dirtyRef.current.size === 0
  }
  useEffect(() => {
    registerLeaveGuard?.(() => flush.current())
    return () => registerLeaveGuard?.(null)
  }, [registerLeaveGuard])

  const discard = () => {
    draftRef.current = row.data; setDraft(row.data); base.current = row.data; dirtyRef.current = new Set(); setChanged(new Set()); setErrors({})
  }
  const revertField = (field: Field) => {
    draftRef.current = { ...draftRef.current, [field.id]: row.data[field.id] }
    setDraft(draftRef.current)
    base.current = { ...base.current, [field.id]: row.data[field.id] }
    dirtyRef.current = new Set(dirtyRef.current)
    dirtyRef.current.delete(field.id)
    setChanged(new Set(dirtyRef.current))
    setErrors(current => { const next = { ...current }; delete next[field.id]; return next })
  }
  const formId = `record-form-${row.id}`
  return <div ref={container} className="min-w-0 scroll-mt-20 p-4 sm:p-6">
    <button type="button" onClick={onBack} className={`${BUTTON} mb-4 lg:hidden`}>← Все записи</button>
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4">
      <div className="min-w-0"><h2 ref={heading} tabIndex={-1} className="scroll-mt-20 rounded break-words text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage-400">{titleField ? cellText(titleField, row.data[titleField.id], relatedTitles) || 'Новая запись' : 'Запись'}</h2><p role="status" aria-live="polite" className="mt-1 text-xs text-ink-muted">{readOnly ? 'Только просмотр' : creating ? 'Создание записи…' : saving.size || uploading ? 'Сохранение…' : Object.keys(errors).length ? 'Есть несохранённые поля. Исправьте ошибку или верните сохранённые значения.' : changed.size ? 'Есть изменения. Сохраняются при выходе из поля.' : 'Все изменения сохранены'}</p></div>
      {!readOnly ? <div className="flex flex-wrap gap-2"><button type="submit" form={formId} disabled={unavailable || creating || !changed.size || saving.size > 0 || uploading} className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-sand-50 disabled:opacity-40">Сохранить изменения</button><button type="button" onClick={discard} disabled={creating || !changed.size || saving.size > 0 || uploading} className={BUTTON}>Отменить изменения</button></div> : null}
    </header>
    {unavailable ? <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Эта запись удалена или больше недоступна. Ваш ввод остался здесь. Скопируйте нужные значения перед выходом; сохранить их в эту запись уже нельзя.</p> : null}
    {actions}
    <form id={formId} onSubmit={event => { event.preventDefault(); void (async () => { for (const field of fields) await save(field) })() }}>
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      {fields.map(field => {
        const locked = readOnly || isComputed(field.type)
        const id = `record-${row.id}-${field.id}`
        const fieldError = errors[field.id]
        return <fieldset key={field.id} disabled={creating || saving.has(field.id)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void save(field) }} className={`min-w-0 rounded-xl border p-3 ${field.type === 'long_text' || field.type === 'image' || field.type === 'attachment' ? 'xl:col-span-2' : ''} ${fieldError ? 'border-red-300 bg-red-50/30' : 'border-[var(--color-border-subtle)]'}`}>
          <legend id={`${id}-label`} className="px-1 text-sm font-medium">{field.name}</legend>
          {locked ? <p className="whitespace-pre-wrap break-words text-sm text-ink-muted">{cellText(field, row.data[field.id], relatedTitles) || 'Не заполнено'}</p> : <RecordControl id={id} field={field} value={draft[field.id]} relatedTitles={relatedTitles} invalid={!!fieldError} onChange={value => change(field, value)} onBusyChange={busy => setUploads(current => { const next = new Set(current); if (busy) next.add(field.id); else next.delete(field.id); return next })} />}
          <p className="mt-1.5 text-xs text-ink-muted">{FIELD_LABELS[field.type]}{isComputed(field.type) ? ' · считается автоматически' : ''}</p>
          {field.description ? <p className="mt-1 text-xs text-ink-muted">{field.description}</p> : null}
          {fieldError ? <div id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700"><p>{fieldError}</p><button type="button" onClick={() => revertField(field)} className="mt-1 underline">Вернуть сохранённое значение</button></div> : null}
        </fieldset>
      })}
    </div>
    </form>
  </div>
}

function RecordControl({ id, field, value, relatedTitles, invalid, onChange, onBusyChange }: {
  id: string; field: Field; value: unknown; relatedTitles: TitleIndex; invalid: boolean; onChange: (value: unknown) => void; onBusyChange: (busy: boolean) => void
}) {
  const common = { id, 'aria-labelledby': `${id}-label`, 'aria-invalid': invalid, 'aria-describedby': invalid ? `${id}-error` : undefined, className: INPUT }
  if (field.type === 'attachment' || field.type === 'image') return <FileUpload value={Array.isArray(value) ? value as Attachment[] : []} maxCount={field.options.maxCount} onChange={onChange} onBusyChange={onBusyChange} />
  if (field.type === 'checkbox') return <label className="flex min-h-10 items-center gap-2 text-sm"><input {...common} type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)} className="size-4 accent-sage-600" />{value === true ? 'Да' : 'Нет'}</label>
  if (field.type === 'long_text') return <textarea {...common} rows={4} value={value == null ? '' : String(value)} onChange={event => onChange(event.target.value)} />
  if (field.type === 'single_select') return <select {...common} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.target.value || null)}><option value="">Не выбрано</option>{field.options.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select>
  if (field.type === 'multi_select' || field.type === 'relation') {
    const options = field.type === 'relation' ? relatedTitles[field.options.tableId] ?? [] : field.options.choices.map(choice => ({ id: choice.id, title: choice.name }))
    const selected = Array.isArray(value) ? value.map(String) : []
    const multiple = field.type === 'multi_select' || field.options.allowMultiple !== false
    if (!multiple) return <select {...common} value={selected[0] ?? ''} onChange={event => onChange(event.target.value ? [event.target.value] : [])}><option value="">Не выбрано</option>{options.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}</select>
    return <div role="group" aria-labelledby={`${id}-label`} className="max-h-52 space-y-1 overflow-y-auto">{options.length ? options.map(option => <label key={option.id} className="flex min-h-9 items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-sand-50"><input type="checkbox" checked={selected.includes(option.id)} onChange={() => onChange(selected.includes(option.id) ? selected.filter(item => item !== option.id) : [...selected, option.id])} className="size-4 shrink-0 accent-sage-600" /><span className="break-words">{option.title}</span></label>) : <p className="text-sm text-ink-muted">{field.type === 'relation' ? 'В связанной таблице нет записей.' : 'Варианты не настроены.'}</p>}</div>
  }
  if (field.type === 'date' || field.type === 'datetime') {
    const instant = dateInstant(value, fieldTimeZone(field))
    const wall = instant === null ? null : instantToWallClock(new Date(instant), fieldTimeZone(field))
    return <input {...common} type={field.type === 'datetime' ? 'datetime-local' : 'date'} value={wall ? field.type === 'datetime' ? `${wall.date}T${wall.time}` : wall.date : ''} onChange={event => { const next = dateInstant(event.target.value, fieldTimeZone(field)); onChange(next === null ? null : new Date(next).toISOString()) }} />
  }
  return <input {...common} type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'url' ? 'url' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} value={value == null ? '' : String(value)} onChange={event => onChange(event.target.value)} />
}
