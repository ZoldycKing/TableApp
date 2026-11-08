'use client'

import { dateInstant, fieldTimeZone, instantToWallClock, isComputed, parseCellValue, type Attachment, type Field } from '@tableapp/schema'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ActionResult } from '@/app/actions'
import { FileUpload } from '@/components/file-upload'
import { QuestionIcon } from '@phosphor-icons/react'
import { cellText, type TitleIndex } from '@/lib/table-export'
import type { TableRow } from '@/lib/table-store'
import { useUnsaved } from '@/lib/unsaved'
import { parseEditorValue } from '@/lib/table-editor-values'
import { useVirtualRows } from '@/lib/use-virtual-rows'
import type { RecordSummary } from '@/lib/table-record-summary'

const INPUT = 'w-full min-w-0 rounded-lg border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-base outline-none transition-colors focus:border-sage-400 focus:ring-2 focus:ring-sage-200 sm:text-sm'
const BUTTON = 'rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-500 disabled:opacity-40'

type Props = {
  rows: TableRow[]
  allRows?: TableRow[]
  fields: Field[]
  titleField?: Field
  recordSummary?: RecordSummary
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
  onSaveRow?: (rowId:string, data:Record<string,unknown>, base:Record<string,unknown>)=>Promise<ActionResult>
  newRowId?: string | null
  hideAdd?: boolean
  onCancelNew?: ()=>void
  onSavingChange?: (saving:boolean)=>void
}

/** The record and grid editors share row IDs, server writes and conflict bases. */
export function TableRecordsEditor({ rows, allRows, fields, titleField, recordSummary, selectedRowId, relatedTitles, readOnly, adding, onSelect, onAdd, onSave, onDirtyChange, registerLeaveGuard, actions, onSaveRow, newRowId, hideAdd, onCancelNew, onSavingChange }: Props) {
  const current = (allRows ?? rows).find(row => row.id === selectedRowId)
  const lastSelected = useRef<TableRow | null>(null)
  const rowButtons = useRef(new Map<string, HTMLButtonElement>())
  const listRoot = useRef<HTMLDivElement>(null)
  const [focusedRow, setFocusedRow] = useState<string | null>(null)
  const virtualKeys = useMemo(() => rows.map(row => row.id), [rows])
  const virtual = useVirtualRows(listRoot, virtualKeys, 86, [rows.findIndex(row => row.id === selectedRowId), rows.findIndex(row => row.id === focusedRow)])
  const listHeading = useRef<HTMLHeadingElement>(null)
  const previousSelection = useRef(selectedRowId)
  if (current) lastSelected.current = current
  const selected = current ?? (lastSelected.current?.id === selectedRowId ? lastSelected.current : undefined)
  const unavailable = !!selected && !current
  const preferred = recordSummary?.fieldIds.flatMap(id => { const field = fields.find(field => field.id === id && field.id !== titleField?.id); return field ? [field] : [] })
  const details = preferred?.length ? preferred.slice(0, 2) : fields.filter(field => field.id !== titleField?.id).slice(0, 2)
  const unitField = fields.find(field => field.id === recordSummary?.unitFieldId)
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
        {!readOnly && !hideAdd ? <button type="button" disabled={adding} onClick={onAdd} className={BUTTON}>{adding ? 'Добавление…' : '+ Запись'}</button> : null}
      </div>
      <div ref={listRoot} onScroll={virtual.onScroll} className="max-h-[65vh] overflow-y-auto p-2">
        {rows.length ? virtual.items.map((item, i) => { const row = rows[item.index]!, index = item.index, previous = virtual.items[i - 1]; const gap = item.start - (previous ? previous.start + previous.size : 0)
          return <Fragment key={row.id}>{gap > 0 ? <div aria-hidden="true" style={{height:gap}} /> : null}<button onFocus={() => setFocusedRow(row.id)} onKeyDown={event => {
            const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : event.key === 'Tab' && virtual.enabled ? event.shiftKey ? -1 : 1 : 0
            if (!step || index + step < 0 || index + step >= rows.length) return
            event.preventDefault(); const next = rows[index + step]!.id; setFocusedRow(next)
            requestAnimationFrame(() => { const button = rowButtons.current.get(next); button?.focus(); button?.scrollIntoView?.({ block: 'nearest' }) })
          }} data-virtual-key={row.id} ref={element => { virtual.measure(element); if (element) rowButtons.current.set(row.id, element); else rowButtons.current.delete(row.id) }} type="button" aria-current={selected?.id === row.id ? 'true' : undefined} onClick={() => onSelect(row.id)} className={`block w-full min-w-0 scroll-mt-20 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-sage-500 ${selected?.id === row.id ? 'border-sage-300 bg-sage-50' : 'border-transparent hover:bg-sand-50'}`}>
          <span className="block truncate text-sm font-medium">{titleField ? cellText(titleField, row.data[titleField.id], relatedTitles) || `Запись ${index + 1}` : `Запись ${index + 1}`}</span>
          {details.map(field => <span key={field.id} className="mt-1 flex items-baseline justify-between gap-3 text-xs text-ink-soft"><span className="min-w-0 truncate">{field.name}: </span><span className="shrink-0 font-medium text-ink">{cellText(field, row.data[field.id], relatedTitles) || '—'}{unitField && preferred?.some(item => item.id === field.id) && row.data[field.id] != null ? ` ${cellText(unitField, row.data[unitField.id], relatedTitles)}` : ''}</span></span>)}
        </button></Fragment> }) : <p className="px-3 py-8 text-sm text-ink-muted">Записей нет. {readOnly ? 'Попробуйте изменить поиск.' : 'Добавьте первую запись или измените поиск.'}</p>}
        {virtual.items.length && virtual.total > virtual.items.at(-1)!.start + virtual.items.at(-1)!.size ? <div aria-hidden="true" style={{height:virtual.total-virtual.items.at(-1)!.start-virtual.items.at(-1)!.size}} /> : null}
      </div>
    </aside>
    <div className={`min-w-0 ${selected ? '' : 'hidden lg:block'}`}>
      {selected ? <RecordForm key={selected.id} row={selected} fields={fields} titleField={titleField} relatedTitles={relatedTitles} readOnly={readOnly} creating={adding} unavailable={unavailable} onSave={onSave} onSaveRow={onSaveRow} isNew={selected.id===newRowId} onCancelNew={onCancelNew} onDirtyChange={onDirtyChange} onSavingChange={onSavingChange} registerLeaveGuard={registerLeaveGuard} onBack={() => onSelect(null)} actions={unavailable || selected.id===newRowId ? undefined : actions?.(selected)} /> : <div className="px-6 py-16 text-center text-sm text-ink-muted"><p>Выберите запись, чтобы {readOnly ? 'посмотреть все поля' : 'посмотреть и изменить её поля'}.</p>{!readOnly ? <button type="button" disabled={adding} onClick={onAdd} className={`${BUTTON} mt-4`}>Добавить запись</button> : null}</div>}
    </div>
  </section>
}

function RecordForm({ row, fields, titleField, relatedTitles, readOnly, creating, unavailable = false, onSave, onSaveRow, isNew=false, onCancelNew, onDirtyChange, onSavingChange, registerLeaveGuard, onBack, actions }: {
  row: TableRow; fields: Field[]; titleField?: Field; relatedTitles: TitleIndex; readOnly: boolean; creating?: boolean; unavailable?: boolean
  onSave: Props['onSave']; onSaveRow?: Props['onSaveRow']; isNew?:boolean; onCancelNew?:()=>void; onDirtyChange: Props['onDirtyChange']; onSavingChange?:Props['onSavingChange']; registerLeaveGuard?: Props['registerLeaveGuard']; onBack: () => void; actions?: ReactNode
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(row.data)
  const [helpField,setHelpField]=useState<Field|null>(null)
  const helpDialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{if(helpField)helpDialog.current?.showModal?.();else helpDialog.current?.close?.()},[helpField])
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
  const dirty = changed.size > 0 || saving.size > 0 || uploading || isNew
  const busy=saving.size>0||uploading
  useEffect(()=>{onSavingChange?.(busy);return()=>onSavingChange?.(false)},[busy,onSavingChange])
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
    if(readOnly)return true
    if (uploading || creating || unavailable) return false
    if(onSaveRow){
      if(savingRef.current.size)return false
      const selected=fields.filter(field=>!isComputed(field.type)&&(dirtyRef.current.has(field.id)||isNew))
      if(!selected.length)return true
      const values:Record<string,unknown>={},bases:Record<string,unknown>={},savedRevisions:Record<string,number>={}
      const invalid:Record<string,string>={}
      for(const field of selected){
        try{values[field.id]=parseEditorValue(field,draftRef.current[field.id]??null);bases[field.id]=base.current[field.id]??null;savedRevisions[field.id]=revisions.current[field.id]??0}
        catch(cause){invalid[field.id]=cause instanceof Error?cause.message:'Проверьте значение.'}
      }
      if(Object.keys(invalid).length){setErrors(invalid);return false}
      savingRef.current=new Set(selected.map(field=>field.id));setSaving(new Set(savingRef.current))
      try{
        const result=await onSaveRow(row.id,values,bases)
        if(!result.ok){setErrors({[selected[0]!.id]:result.error});return false}
        for(const field of selected){
          base.current={...base.current,[field.id]:values[field.id]}
          if((revisions.current[field.id]??0)!==savedRevisions[field.id])continue
          dirtyRef.current=new Set(dirtyRef.current);dirtyRef.current.delete(field.id)
          draftRef.current={...draftRef.current,[field.id]:values[field.id]}
        }
        setChanged(new Set(dirtyRef.current));setDraft(draftRef.current);setErrors({})
        return dirtyRef.current.size===0
      }catch{setErrors({[selected[0]!.id]:'Не удалось сохранить запись. Введённое осталось в форме.'});return false}
      finally{savingRef.current=new Set();setSaving(new Set())}
    }
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
    if(isNew&&onCancelNew){onCancelNew();return}
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
      <div className="min-w-0"><h2 ref={heading} tabIndex={-1} className="scroll-mt-20 rounded break-words text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage-400">{titleField ? cellText(titleField, row.data[titleField.id], relatedTitles) || 'Новая запись' : 'Запись'}</h2><p role="status" aria-live="polite" className="mt-1 text-xs text-ink-muted">{readOnly ? 'Только просмотр' : creating ? 'Создание записи…' : saving.size || uploading ? 'Сохранение…' : Object.keys(errors).length ? 'Запись не сохранена. Проверьте поля.' : isNew ? 'Новая запись не сохранена' : changed.size ? onSaveRow ? 'Есть несохранённые изменения' : 'Есть изменения. Сохраняются при выходе из поля.' : 'Все изменения сохранены'}</p></div>
      {!readOnly ? <div className="flex flex-wrap gap-2"><button type="submit" form={formId} disabled={unavailable || creating || (!changed.size&&!isNew) || uploading || !!onSaveRow&&saving.size>0} className="platform-primary">{onSaveRow&&saving.size?'Сохраняем…':isNew?'Сохранить запись':'Сохранить изменения'}</button><button type="button" onClick={discard} disabled={creating || (!changed.size&&!isNew) || saving.size > 0 || uploading} className="platform-secondary">Отменить изменения</button></div> : null}
    </header>
    {unavailable ? <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Эта запись удалена или больше недоступна. Ваш ввод остался здесь. Скопируйте нужные значения перед выходом; сохранить их в эту запись уже нельзя.</p> : null}
    {actions}
    <form id={formId} onSubmit={event => { event.preventDefault(); void flush.current() }}>
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      {fields.map(field => {
        const locked = readOnly || isComputed(field.type)
        const id = `record-${row.id}-${field.id}`
        const fieldError = errors[field.id]
        return <fieldset key={field.id} disabled={creating || saving.has(field.id)} onBlurCapture={event => { if (!onSaveRow && !event.currentTarget.contains(event.relatedTarget as Node | null)) void save(field) }} className={`relative min-w-0 ${field.type === 'long_text' || field.type === 'image' || field.type === 'attachment' ? 'xl:col-span-2' : ''} ${fieldError ? 'rounded-lg bg-red-50/30 p-2' : ''}`}>
          <legend id={`${id}-label`} className="px-1 text-sm font-medium">{field.name}</legend>
          {field.description?<button type="button" aria-label={`Подсказка к полю «${field.name}»`} className="absolute -top-8 right-0 inline-flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-sage-400" onClick={()=>setHelpField(field)}><QuestionIcon size={16} aria-hidden/></button>:null}
          {locked ? <p className="whitespace-pre-wrap break-words text-sm text-ink-muted">{cellText(field, row.data[field.id], relatedTitles) || 'Не заполнено'}</p> : <RecordControl id={id} field={field} value={draft[field.id]} relatedTitles={relatedTitles} invalid={!!fieldError} onChange={value => change(field, value)} onBusyChange={busy => setUploads(current => { const next = new Set(current); if (busy) next.add(field.id); else next.delete(field.id); return next })} />}
          {fieldError ? <div id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700"><p>{fieldError}</p><button type="button" onClick={() => revertField(field)} className="mt-1 underline">Вернуть сохранённое значение</button></div> : null}
        </fieldset>
      })}
    </div>
    </form>
    <dialog ref={helpDialog} aria-labelledby={`${formId}-help-title`} onCancel={()=>setHelpField(null)} onClick={event=>{if(event.target===helpDialog.current)setHelpField(null)}} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-sand-200 bg-white p-6 text-ink shadow-lift backdrop:bg-ink/30"><h2 id={`${formId}-help-title`} className="text-xl font-semibold">{helpField?.name}</h2><p className="my-5 text-sm leading-6 text-ink-soft">{helpField?.description}</p><button type="button" className="platform-primary" onClick={()=>setHelpField(null)}>Понятно</button></dialog>
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
    return <RecordMultiPicker id={id} name={field.name} options={options} selected={selected} invalid={invalid} onChange={onChange}/>
  }
  if (field.type === 'date' || field.type === 'datetime') {
    const instant = dateInstant(value, fieldTimeZone(field))
    const wall = instant === null ? null : instantToWallClock(new Date(instant), fieldTimeZone(field))
    return <input {...common} type={field.type === 'datetime' ? 'datetime-local' : 'date'} value={wall ? field.type === 'datetime' ? `${wall.date}T${wall.time}` : wall.date : ''} onChange={event => { const next = dateInstant(event.target.value, fieldTimeZone(field)); onChange(next === null ? null : new Date(next).toISOString()) }} />
  }
  return <input {...common} type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'url' ? 'url' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} value={value == null ? '' : String(value)} onChange={event => onChange(event.target.value)} />
}

function RecordMultiPicker({id,name,options,selected,invalid,onChange}:{id:string;name:string;options:{id:string;title:string}[];selected:string[];invalid:boolean;onChange:(value:string[])=>void}){
  const dialog=useRef<HTMLDialogElement>(null)
  const [search,setSearch]=useState('')
  const query=search.trim().toLocaleLowerCase('ru-RU')
  const shown=options.filter(option=>!query||option.title.toLocaleLowerCase('ru-RU').includes(query))
  return <div role="group" aria-labelledby={`${id}-label`}>
    <button type="button" aria-label={`Выбрать: ${name}`} aria-invalid={invalid} aria-describedby={invalid?`${id}-error`:undefined} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-sand-200 bg-white px-3 py-2 text-left text-sm hover:border-sage-400 focus-visible:outline-2 focus-visible:outline-sage-400" onClick={()=>{setSearch('');dialog.current?.showModal()}}><span className="flex min-w-0 flex-wrap gap-1.5">{selected.length?selected.map(value=><span key={value} className="max-w-full truncate rounded bg-sand-100 px-2 py-0.5 text-xs">{options.find(option=>option.id===value)?.title??'Запись недоступна'}</span>):<span className="text-ink-muted">Не выбрано</span>}</span><span className="shrink-0 text-xs text-sage-700">Выбрать</span></button>
    <dialog ref={dialog} aria-labelledby={`${id}-picker-title`} onClick={event=>{if(event.target===dialog.current)dialog.current?.close()}} className="m-auto max-h-[85dvh] w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-sand-200 bg-white p-6 text-ink shadow-lift backdrop:bg-ink/30"><header className="mb-5 flex items-center justify-between gap-3"><h2 id={`${id}-picker-title`} className="text-xl font-semibold">{name}</h2><button type="button" className="platform-secondary" onClick={()=>dialog.current?.close()}>Готово</button></header><input type="search" aria-label={`Поиск: ${name}`} placeholder="Найти вариант" value={search} onChange={event=>setSearch(event.target.value)} className={INPUT}/><div className="my-4 max-h-[45dvh] overflow-y-auto">{shown.length?shown.map(option=><label key={option.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-sand-50"><input type="checkbox" checked={selected.includes(option.id)} onChange={()=>onChange(selected.includes(option.id)?selected.filter(value=>value!==option.id):[...selected,option.id])} className="size-4 shrink-0 accent-sage-600"/><span className="break-words">{option.title}</span></label>):<p className="py-5 text-sm text-ink-muted">{options.length?'Ничего не найдено.':'Вариантов пока нет.'}</p>}</div><p className="text-xs text-ink-muted" role="status">Выбрано: {selected.length}</p></dialog>
  </div>
}
