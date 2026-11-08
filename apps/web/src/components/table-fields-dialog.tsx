'use client'

import { useEffect, useRef } from 'react'
import type { Field } from '@tableapp/schema'
import { FIELD_LABELS } from '@/lib/field-labels'
import { ownerPrimary, ownerSecondary } from './owner-ui'

export function TableFieldsDialog({ open, fields, readOnly, onClose, onEdit, onAdd }: { open:boolean; fields:Field[]; readOnly:boolean; onClose:()=>void; onEdit:(field:Field)=>void; onAdd:()=>void }) {
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open])
  return <dialog ref={dialog} onCancel={event=>{event.preventDefault();onClose()}} onClick={event=>{if(event.target===dialog.current)onClose()}} aria-labelledby="table-fields-title" className="m-auto max-h-[85dvh] w-[min(36rem,calc(100vw-2rem))] overflow-auto rounded-2xl border border-sand-200 bg-white p-6 text-ink shadow-lift backdrop:bg-ink/30">
    <header className="mb-5 flex items-center justify-between gap-4"><h2 id="table-fields-title" className="text-xl font-semibold">Поля таблицы</h2><button type="button" aria-label="Закрыть поля таблицы" className={ownerSecondary} onClick={onClose}>Закрыть</button></header>
    <ul className="space-y-2">{fields.map(field=><li key={field.id} className="flex items-center justify-between gap-4 rounded-lg bg-sand-50 p-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{field.name}</p><p className="mt-1 text-xs text-ink-muted">{FIELD_LABELS[field.type]}</p></div>{!readOnly?<button type="button" className={ownerSecondary} onClick={()=>{onClose();onEdit(field)}} aria-label={`Настроить поле «${field.name}»`}>Настроить</button>:null}</li>)}</ul>
    {!readOnly?<button type="button" className={`${ownerPrimary} mt-5`} onClick={()=>{onClose();onAdd()}}>Добавить поле</button>:null}
  </dialog>
}
