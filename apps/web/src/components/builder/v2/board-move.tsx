'use client'
import {createContext,useContext,useRef,useState,useEffect,type DragEvent,type ReactNode} from 'react'
import type {BuilderV2BoardRequest,BuilderV2BoardState,BuilderV2BoardScope} from '@/lib/builder-v2-board-types'
import type {BuilderV2DataRecord} from '@/lib/builder-v2-data-types'
import {usePublishedV2} from './published-context'
import {PrototypeDialog} from '../prototype/dialog'
import {ProtoIcon} from '../prototype/icons'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

const MIME='application/x-tableapp-board'
type BoardContext={enabled:boolean;pending:boolean;open:(row:BuilderV2DataRecord,trigger?:HTMLElement)=>void;drop:(event:DragEvent,target:string)=>void;start:(event:DragEvent,row:BuilderV2DataRecord)=>void}
const Context=createContext<BoardContext|null>(null)
export function BuilderV2BoardMoves({appId,nodeId,screenId,recordId,enabled,reload,focus,records,children}:{appId:string;nodeId:string;screenId:string;recordId?:string;enabled:boolean;reload:(message:string)=>void;focus:()=>void;records:readonly BuilderV2DataRecord[];children:ReactNode}){
  const published=usePublishedV2(),busy=useRef(false),attempt=useRef<BuilderV2BoardRequest|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false),[stale,setStale]=useState(false),[dialog,setDialog]=useState<{state:BuilderV2BoardState;scope:BuilderV2BoardScope;target:string|null}|null>(null)
  const returnFocus=useRef<HTMLElement|null>(null),wasOpen=useRef(false)
  useEffect(()=>{if(wasOpen.current&&!dialog){if(returnFocus.current?.isConnected)returnFocus.current.focus();else focus()}wasOpen.current=Boolean(dialog)},[dialog])
  const scope=(row:BuilderV2DataRecord):BuilderV2BoardScope=>({screenId,nodeId,itemId:row.id,...(recordId?{recordId}:{})})
  const inspect=async(value:BuilderV2BoardScope)=>{const api=await import('@/app/builder-v2-board-actions');return published?api.inspectPublishedV2BoardMoveAction(published.slug,{...value,revision:published.revision}):api.inspectBuilderV2BoardMoveAction(appId,value)}
  const send=async(value:BuilderV2BoardRequest)=>{const api=await import('@/app/builder-v2-board-actions');return published?api.movePublishedV2BoardAction(published.slug,value):api.moveBuilderV2BoardAction(appId,value)}
  const save=async(value:NonNullable<typeof dialog>)=>{
    attempt.current??={...value.scope,value:value.target,revision:value.state.revision,fingerprint:value.state.fingerprint,requestId:`board_${crypto.randomUUID().replaceAll('-','')}`}
    try{const result=await send(attempt.current);if(result.ok){const message=result.effects?.filter(effect=>effect.type==='notify').at(-1)?.message??'Статус изменён';setDialog(null);setUncertain(false);setNotice(message);setError('');attempt.current=null;focus();reload(message)}else{const unknown=uncertain||Boolean(result.uncertain);setError(result.error);setUncertain(unknown);setStale(!unknown&&Boolean(result.stale));setDialog(value);if(!unknown)attempt.current=null}}catch{setDialog(value);setUncertain(true);setError('Не удалось подтвердить смену статуса. Повторите запрос: изменение не выполнится дважды.')}
  }
  const prepare=async(row:BuilderV2DataRecord,target?:string|null)=>{
    if(!enabled||!row.canMove||busy.current||uncertain||dialog)return
    busy.current=true;setPending(true);setError('');setStale(false);setNotice('');attempt.current=null
    try{const result=await inspect(scope(row));if(!result.ok){setError(result.error);setStale(Boolean(result.stale));return}const value={state:result.state,scope:scope(row),target:target===undefined?result.state.value:target};if(target===undefined)setDialog(value);else if(target!==result.state.value)await save(value);else{focus();reload('Статус уже выбран')}}catch{setError('Не удалось проверить запись. Попробуйте ещё раз.')}finally{busy.current=false;setPending(false)}
  }
  const submit=async()=>{if(busy.current||!dialog||stale)return;busy.current=true;setPending(true);setError('');try{await save(dialog)}finally{busy.current=false;setPending(false)}}
  const close=()=>{if(!busy.current&&!uncertain){setDialog(null);setError('');setStale(false);attempt.current=null}}
  const start=(event:DragEvent,row:BuilderV2DataRecord)=>{if(!enabled||!row.canMove||pending||uncertain||dialog){event.preventDefault();return}event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(MIME,JSON.stringify({appId,nodeId,itemId:row.id}))}
  const drop=(event:DragEvent,target:string)=>{event.preventDefault();if(target==='other'||pending||uncertain||dialog)return;try{const value=JSON.parse(event.dataTransfer.getData(MIME));if(value.appId!==appId||value.nodeId!==nodeId||typeof value.itemId!=='string')return;const row=records.find(row=>row.id===value.itemId);if(!row)return;void prepare(row,target==='empty'?null:target.slice(2))}catch{setError('Выберите карточку и колонку заново')}}
  const known=dialog&&dialog.state.choices.some(choice=>choice.id===dialog.target),selected=dialog?.target===null?'empty':known?`c:${dialog?.target}`:'other'
  return <Context.Provider value={{enabled,pending:pending||uncertain,open:(row,trigger)=>{returnFocus.current=trigger??null;void prepare(row)},start,drop}}>
    {notice&&<p role="status" className={ui.formSuccess}>{notice}</p>}{!dialog&&error&&<div className={ui.dataControls}><p role="alert" className={ui.dataError}>{error}</p>{stale&&<button type="button" className={styles.textButton} onClick={()=>{setError('');setStale(false);reload('Данные обновлены')}}>Обновить канбан</button>}</div>}
    {children}
    {dialog&&<PrototypeDialog title="Изменить статус" onClose={close} closeDisabled={pending||uncertain}><div className={ui.form}><strong>{dialog.state.recordLabel}</strong><label>Новый статус<select className={ui.boardStatusSelect} value={selected} disabled={pending||uncertain||stale} onChange={event=>setDialog({...dialog,target:event.target.value==='empty'?null:event.target.value.slice(2)})}><option value="empty">Без статуса</option>{!known&&dialog.target!==null&&<option value="other" disabled>Текущий статус</option>}{dialog.state.choices.map(choice=><option key={choice.id} value={`c:${choice.id}`}>{choice.name}</option>)}</select></label>{error&&<p role="alert" className={ui.dataError}>{error}</p>}{stale?<button type="button" className={styles.secondary} onClick={()=>{close();reload('Данные обновлены')}}>Обновить канбан</button>:<div className={ui.dataControls}><button type="button" className={styles.secondary} disabled={pending||uncertain} onClick={close}>Отмена</button><button type="button" className={styles.primary} disabled={pending||!uncertain&&dialog.target===dialog.state.value} onClick={()=>void submit()}>{pending?'Сохраняем…':uncertain?'Повторить запрос':'Сохранить статус'}</button></div>}</div></PrototypeDialog>}
  </Context.Provider>
}
export function BoardMoveRow({row,label,children}:{row:BuilderV2DataRecord;label:string;children:ReactNode}){
  const board=useContext(Context),[fine,setFine]=useState(false)
  useEffect(()=>{const media=window.matchMedia?.('(pointer: fine)');if(!media)return;const update=()=>setFine(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
  if(!board?.enabled||!row.canMove)return children
  return <article className={ui.boardRecord} draggable={fine&&!board.pending} onDragStart={event=>board.start(event,row)} aria-label={`Карточка: ${label}`}>{children}<footer><span className={ui.dragHint} title="Перетащите в другую колонку" aria-hidden><ProtoIcon name="grip" size={16}/></span><button type="button" className={styles.textButton} aria-label={`Изменить статус: ${label}`} disabled={board.pending} onClick={event=>board.open(row,event.currentTarget)}>Изменить статус</button></footer></article>
}
export function BoardDropColumn({columnKey,children,...props}:{columnKey:string;children:ReactNode;className?:string;'aria-label':string;'data-active':boolean}){
  const board=useContext(Context),[over,setOver]=useState(false)
  return <section {...props} data-drop={over} onDragOver={event=>{if(board?.enabled&&!board.pending&&columnKey!=='other'&&event.dataTransfer.types.includes(MIME)){event.preventDefault();event.dataTransfer.dropEffect='move';setOver(true)}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOver(false)}} onDrop={event=>{setOver(false);board?.drop(event,columnKey)}}>{children}</section>
}
