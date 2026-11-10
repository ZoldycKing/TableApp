'use client'
import {useEffect,useState,useRef,type ReactNode} from 'react'
import {APP_TIME_ZONE} from '@tableapp/schema'
import type {AppV2,AppV2Node} from '@tableapp/schema/app-v2'
import type {BuilderV2Table} from '@/lib/builder-v2'
import type {BuilderV2DataPage,BuilderV2ReadScope} from '@/lib/builder-v2-data-types'
import {builderCalendarToday} from '@/lib/builder-v2-calendar'
import {BuilderV2BoardMoves,BoardDropColumn} from './board-move'
import {usePublishedV2} from './published-context'
import {useBuilderV2NodeData} from './use-data'
import {CalendarNavigation,type BuilderCalendarWindow} from './calendar-navigation'
import { ProtoIcon } from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

export function BuilderV2DataNode({app,node,live,scope,table,heading=true,allowWrites=false,searchPlaceholder,onPage,children}:{app:AppV2;node:AppV2Node;live:boolean;scope?:BuilderV2ReadScope;table?:BuilderV2Table;heading?:boolean;allowWrites?:boolean;searchPlaceholder?:string;onPage?:(page:BuilderV2DataPage|undefined,pending:boolean)=>void;children:(page?:BuilderV2DataPage)=>ReactNode}){
  const region=useRef<HTMLDivElement>(null),published=usePublishedV2()
  const [search,setSearch]=useState(''),[activeColumn,setActiveColumn]=useState(''),[boardNotice,setBoardNotice]=useState('')
  const source='sourceId'in node?app.sources.find(source=>source.id===node.sourceId):undefined,calendar=node.type==='collection'&&node.layout==='calendar',board=node.type==='collection'&&node.layout==='kanban'
  const dateField=calendar?table?.fields.find(field=>field.id===node.dateFieldId):undefined,timeZone=dateField?.timeZone??APP_TIME_ZONE
  const today=builderCalendarToday(timeZone),[window,setWindow]=useState<BuilderCalendarWindow>({month:today.slice(0,7),day:today,undated:false})
  const query=calendar?{calendarMonth:window.undated?'undated':window.month,...(!window.undated?{calendarDay:window.day}:{})}:{}
  const needsRecord=Boolean(source?.screenTableId&&!scope?.recordId),data=useBuilderV2NodeData(app,node,live&&!needsRecord,source?.searchFieldIds.length?search:'',scope,query)
  useEffect(()=>{onPage?.(data.page,live&&data.loading&&!data.page)},[data.page,data.loading,live,onPage])
  useEffect(()=>{setSearch('');setActiveColumn('');setBoardNotice('')},[source?.tableId])
  useEffect(()=>{const day=builderCalendarToday(timeZone);setWindow({month:day.slice(0,7),day,undated:false})},[source?.tableId,dateField?.id,timeZone])
  const columns=data.page?.board?.columns,chosen=columns?.some(column=>column.key===activeColumn)?activeColumn:columns?.find(column=>column.total>0)?.key??columns?.[0]?.key
  if(needsRecord)return <p className={ui.hint}>Откройте запись из списка, чтобы увидеть её содержимое.</p>
  if(!live&&!calendar&&!board)return children()
  return <div ref={region} className={ui.liveData} data-builder-collection={node.type==='collection'?node.id:undefined} tabIndex={node.type==='collection'?-1:undefined} role={node.type==='collection'?'region':undefined} aria-label={node.type==='collection'?node.name:undefined}>
    {node.type==='collection'&&Boolean(source?.searchFieldIds.length)&&live&&<div className={`${ui.dataControls} ${ui.searchControl}`}><ProtoIcon name="search" size={16} /><input type="search" className={ui.search} aria-label={`Поиск: ${node.name}`} placeholder={searchPlaceholder ?? (node.layout === 'catalog' ? 'Поиск по каталогу' : 'Найти в списке')} maxLength={200} value={search} onChange={event=>setSearch(event.target.value)}/></div>}
    {calendar&&heading&&<h3 className={ui.heading}>{node.name}</h3>}
    {calendar&&<CalendarNavigation value={window} onChange={setWindow} data={data.page?.calendar} timeZone={timeZone}/>}
    {board&&boardNotice&&<p role="status" className={ui.formSuccess}>{boardNotice}</p>}
    {board?columns?<BuilderV2BoardMoves appId={app.id} nodeId={node.id} screenId={scope?.screenId??''} recordId={scope?.recordId} records={data.page!.rows} enabled={live&&allowWrites} focus={()=>region.current?.focus()} reload={message=>{if(published?.invalidate)published.invalidate(message);else{setBoardNotice(message);data.reload()}}}><section className={ui.board} aria-label={`Канбан: ${node.name}`}>
      {heading&&<h3 className={ui.heading}>{node.name}</h3>}
      <label className={ui.boardMobileSelect}>Статус<select value={chosen} onChange={event=>setActiveColumn(event.target.value)}>{columns.map(column=><option key={column.key} value={column.key}>{column.name} · {column.total}</option>)}</select></label>
      <div className={ui.boardColumns}>{columns.map(column=><BoardDropColumn key={column.key} columnKey={column.key} className={ui.boardColumn} aria-label={`Колонка: ${column.name}`} data-active={column.key===chosen}><header><h3>{column.name}</h3><span aria-label={`Записей: ${column.total}`}>{column.total}</span></header>{children({...data.page!,rows:column.rows,total:column.total,next:null,board:undefined,search,clearSearch:()=>setSearch('')})}<footer>{column.rows.length<column.total&&<span className={ui.hint}>Показано {column.rows.length} из {column.total}</span>}{column.next&&!data.stale&&<button type="button" className={styles.textButton} disabled={data.loading} onClick={()=>void data.loadMore(column.key)}>{column.rows.length?'Показать ещё':'Загрузить записи'}</button>}</footer></BoardDropColumn>)}</div>
    </section></BuilderV2BoardMoves>:data.loading&&live?<p role="status" className={ui.hint}>Загружаем канбан…</p>:!live?<p className={ui.hint}>Записи появятся в колонках по выбранному статусу.</p>:null:data.page?children({...data.page,search,clearSearch:()=>setSearch('')}):!live?children():data.loading?<div className={ui.loadingData} role="status"><span>Загружаем данные…</span><i aria-hidden="true" /><i aria-hidden="true" /></div>:null}
    {data.error&&<div className={ui.dataControls}><p className={ui.dataError} role="alert">{data.error}</p><button type="button" className={styles.secondary} disabled={data.loading} onClick={data.stale||!data.page||node.type==='chart'?data.reload:()=>void data.loadMore(data.errorColumn)}>{data.stale?'Обновить список':'Повторить загрузку'}</button></div>}
    {node.type==='collection'&&data.page&&!board&&(data.page.rows.length<data.page.total||Boolean(data.page.next&&!data.stale))&&<div className={ui.dataControls}>{data.page.rows.length<data.page.total&&<span className={ui.hint} aria-live="polite" aria-atomic="true">Показано {data.page.rows.length} из {data.page.total}</span>}{data.page.next&&!data.stale&&<button type="button" className={styles.secondary} disabled={data.loading} onClick={()=>void data.loadMore()}>{data.loading?'Загружаем…':'Показать ещё'}</button>}</div>}
  </div>
}
