'use client'

import { useRef, useState, type ReactNode } from 'react'
import type { Field,View,ViewType } from '@tableapp/schema'
import { countFilters } from '@/lib/apply-view'
import { VIEW_TYPE_LABELS } from '@/lib/field-labels'
import { FilterBuilder } from './filter-builder'
import { FieldVisibilityEditor,GroupEditor,SortEditor } from './view-controls'
import { ownerInput,ownerSecondary } from '@/components/owner-ui'

function Control({ label,count=0,children }: {label:string;count?:number;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null)
  return <><button type="button" className={ownerSecondary} onClick={()=>dialog.current?.showModal()}>{label}{count>0?<span className="text-xs text-ink-muted">{count}</span>:null}</button><dialog ref={dialog} aria-label={label} onClick={event=>{if(event.target===dialog.current)dialog.current?.close()}} className="m-auto max-h-[85dvh] w-[min(42rem,calc(100vw-2rem))] overflow-auto rounded-2xl border border-sand-200 bg-white p-6 shadow-lift backdrop:bg-ink/30"><header className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">{label}</h2><button type="button" className={ownerSecondary} onClick={()=>dialog.current?.close()}>Готово</button></header>{children}</dialog></>
}
type Props={readOnly?:boolean;views:View[];activeView:View;fields:Field[];search:string;hiddenCount:number;leading?:ReactNode;onSelectView:(id:string)=>void;onCreateView:(type:ViewType)=>void;onRenameView:(name:string)=>void;onDeleteView:()=>void;onConfigChange:(config:View['config'])=>void;onSearch:(query:string)=>void}
export function TableViewToolbar({readOnly=false,views,activeView,fields,search,hiddenCount,leading,onSelectView,onCreateView,onRenameView,onDeleteView,onConfigChange,onSearch}:Props){
  const config=activeView.config
  return <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2" aria-label="Инструменты таблицы">
    {leading}
    <select aria-label="Представление таблицы" value={activeView.id} onChange={event=>onSelectView(event.target.value)} className="min-h-11 min-w-0 max-w-60 rounded-full border border-sand-200 bg-white px-3 py-2 text-sm text-sage-700">{views.map(view=><option value={view.id} key={view.id}>{view.name}</option>)}</select>
    <div className="sm:hidden"><Control label="Вид и фильтры"><MobileViewControls {...{readOnly,views,activeView,fields,search,hiddenCount,onSelectView,onCreateView,onRenameView,onDeleteView,onConfigChange,onSearch}}/></Control></div>
    <div className="hidden sm:contents"><Control label="Фильтр" count={countFilters(config)}><FilterBuilder fields={fields} group={config.filter} onChange={filter=>onConfigChange({...config,filter})}/></Control>
    <Control label="Сортировка" count={config.sorts.length}><SortEditor fields={fields} sorts={config.sorts} onChange={sorts=>onConfigChange({...config,sorts})}/></Control>
    <Control label="Группировка" count={config.groupBy.length}><GroupEditor fields={fields} groupBy={config.groupBy} onChange={groupBy=>onConfigChange({...config,groupBy})}/></Control>
    <Control label="Видимые поля" count={config.hiddenFieldIds.length}><FieldVisibilityEditor fields={fields} hiddenFieldIds={config.hiddenFieldIds} onChange={hiddenFieldIds=>onConfigChange({...config,hiddenFieldIds})}/></Control>
    {!readOnly?<Control label="Виды"><ViewManager {...{views,activeView,onRenameView,onCreateView,onDeleteView}}/></Control>:null}</div>
    <label className="ml-auto flex min-w-0 flex-1 basis-40 items-center gap-2"><span className="sr-only">Поиск по записям</span><input type="search" aria-label="Поиск по записям" value={search} onChange={event=>onSearch(event.target.value)} placeholder="Найти запись" className="min-h-11 w-full min-w-0 rounded-full border border-sand-200 bg-white px-4 py-2 text-sm outline-none focus:border-sage-400"/></label>
    {hiddenCount>0?<span className="text-xs text-ink-muted">Скрыто строк: {hiddenCount}</span>:null}
  </div>
}

function ViewManager({views,activeView,onRenameView,onCreateView,onDeleteView}:Pick<Props,'views'|'activeView'|'onRenameView'|'onCreateView'|'onDeleteView'>){
  return <><label className="block text-sm text-ink-soft">Название представления<input aria-label="Название представления" className={ownerInput} value={activeView.name} onChange={event=>onRenameView(event.target.value)}/></label><p className="mb-3 mt-6 text-sm font-medium">Добавить представление</p><div className="flex flex-wrap gap-2">{(['grid','kanban','calendar','gallery'] as ViewType[]).map(type=><button type="button" key={type} className={ownerSecondary} onClick={()=>onCreateView(type)}>{VIEW_TYPE_LABELS[type]}</button>)}</div>{views.length>1?<button type="button" onClick={onDeleteView} className="mt-6 min-h-11 rounded-lg px-3 text-sm text-red-700 hover:bg-red-50">Удалить представление</button>:null}</>
}

function MobileViewControls(props:Props){
  const [tool,setTool]=useState('filter')
  const {fields,activeView,onConfigChange}=props,config=activeView.config
  return <><label className="mb-5 block text-sm text-ink-soft">Что настроить<select aria-label="Настройка представления" value={tool} onChange={event=>setTool(event.target.value)} className={ownerInput}><option value="filter">Фильтр</option><option value="sort">Сортировка</option><option value="group">Группировка</option><option value="fields">Видимые поля</option>{!props.readOnly?<option value="views">Представления</option>:null}</select></label>
    {tool==='filter'?<FilterBuilder fields={fields} group={config.filter} onChange={filter=>onConfigChange({...config,filter})}/>:null}
    {tool==='sort'?<SortEditor fields={fields} sorts={config.sorts} onChange={sorts=>onConfigChange({...config,sorts})}/>:null}
    {tool==='group'?<GroupEditor fields={fields} groupBy={config.groupBy} onChange={groupBy=>onConfigChange({...config,groupBy})}/>:null}
    {tool==='fields'?<FieldVisibilityEditor fields={fields} hiddenFieldIds={config.hiddenFieldIds} onChange={hiddenFieldIds=>onConfigChange({...config,hiddenFieldIds})}/>:null}
    {tool==='views'?<ViewManager {...props}/>:null}
  </>
}
