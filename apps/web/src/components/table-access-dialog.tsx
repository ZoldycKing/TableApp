'use client'

import { useEffect,useRef,useState,useTransition } from 'react'
import type { ActionResult } from '@/app/actions'
import { TABLE_PERMISSION_LABELS,type TableAccess,type TablePermission } from '@/lib/table-permissions'
import { ownerPrimary,ownerSecondary,ownerInput } from './owner-ui'

export type AccessTable={id:string;name:string}

export function TableAccessDialog({name,role,tables,initialAccess,onSave,onClose,saveLabel='Сохранить доступ'}:{name:string;role:string;tables:AccessTable[];initialAccess?:TableAccess|null;onSave:(access:TableAccess|null)=>Promise<ActionResult>;onClose:()=>void;saveLabel?:string}){
  const dialog=useRef<HTMLDialogElement>(null)
  const [all,setAll]=useState(initialAccess==null)
  const [access,setAccess]=useState<TableAccess>(()=>Object.fromEntries(tables.map(table=>[table.id,initialAccess?.[table.id]==='edit'&&role==='viewer'?'view':initialAccess?.[table.id]??'none'])))
  const [error,setError]=useState<string|null>(null)
  const [pending,startTransition]=useTransition()
  useEffect(()=>{
    const previous=document.activeElement,overflow=document.body.style.overflow
    dialog.current?.showModal()
    document.body.style.overflow='hidden'
    return()=>{document.body.style.overflow=overflow;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus()}
  },[])
  const save=()=>startTransition(async()=>{
    setError(null)
    try{const result=await onSave(all?null:access);if(!result.ok)setError(result.error);else onClose()}
    catch{setError('Не удалось сохранить доступ. Проверьте соединение и повторите попытку.')}
  })
  return <dialog ref={dialog} aria-labelledby="table-access-title" onCancel={event=>{if(pending)event.preventDefault();else onClose()}} onClick={event=>{if(event.target===dialog.current&&!pending)onClose()}} className="m-auto max-h-[90dvh] w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-sand-200 bg-white p-5 text-ink shadow-lift backdrop:bg-ink/30 open:flex open:flex-col sm:p-6">
    <header className="mb-6 shrink-0"><h2 id="table-access-title" className="text-xl font-semibold">Доступ к таблицам</h2><p className="mt-2 break-all text-sm text-ink-muted">{name}</p></header>
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={event=>{event.preventDefault();save()}}>
      <div className="min-h-0 flex-1 overflow-y-auto"><fieldset disabled={pending} className="min-w-0">
        <legend className="sr-only">Какие таблицы доступны участнику</legend>
        <div className="mb-5 flex flex-wrap gap-2">{[{value:true,label:'Все таблицы'},{value:false,label:'Выбранные таблицы'}].map(option=><label key={option.label} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${all===option.value?'border-sage-300 bg-sage-50 text-sage-700':'border-sand-200'}`}><input type="radio" name="table-scope" checked={all===option.value} onChange={()=>setAll(option.value)} className="size-4 accent-sage-600"/>{option.label}</label>)}</div>
        {all?<p className="mb-6 text-sm leading-6 text-ink-soft">{role==='viewer'?'Участник видит все таблицы, но не меняет данные.':'Участник может редактировать все таблицы и настраивать приложения.'}</p>:<>
          <ul className="divide-y divide-sand-200 border-y border-sand-200">{tables.map(table=><li key={table.id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><label htmlFor={`table-access-${table.id}`} className="min-w-0 break-words text-sm font-medium">{table.name}</label><select id={`table-access-${table.id}`} aria-label={`Доступ: ${table.name}`} value={access[table.id]??'none'} onChange={event=>setAccess(current=>({...current,[table.id]:event.target.value as TablePermission}))} className={`${ownerInput} !mt-0 sm:w-48`}>{(['none','view','edit'] as const).filter(level=>role!=='viewer'||level!=='edit').map(level=><option key={level} value={level}>{TABLE_PERMISSION_LABELS[level]}</option>)}</select></li>)}</ul>
          {!tables.length?<p className="py-4 text-sm text-ink-muted">В пространстве пока нет таблиц.</p>:null}
          <p className="mt-4 text-xs leading-5 text-ink-muted">Новые таблицы закрыты, пока вы не дадите к ним доступ. Настройка полей и приложений остаётся у участников с полным доступом.</p>
        </>}
      </fieldset></div>
      {error?<p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>:null}
      <footer className="mt-4 flex shrink-0 flex-wrap gap-2 border-t border-sand-200 pt-4"><button type="submit" disabled={pending} className={ownerPrimary}>{pending?'Сохраняем…':saveLabel}</button><button type="button" disabled={pending} className={ownerSecondary} onClick={onClose}>Отмена</button></footer>
    </form>
  </dialog>
}
