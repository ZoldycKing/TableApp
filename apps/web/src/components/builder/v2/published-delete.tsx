'use client'
import {useEffect,useRef,useState} from 'react'
import type {AppV2Node} from '@tableapp/schema/app-v2'
import type {BuilderV2DeleteState,BuilderV2DeleteRequest} from '@/lib/builder-v2-delete-types'
import type {BuilderV2ActionResult} from '@/lib/builder-v2-button-types'
import {usePublishedV2} from './published-context'
import {BuilderV2WorkflowFeedback} from './workflow-feedback'
import {PrototypeDialog} from '../prototype/dialog'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
export function PublishedV2Delete({node,screenId,recordId}:{node:Extract<AppV2Node,{type:'button'}>;screenId:string;recordId?:string}){
  const runtime=usePublishedV2()!,[state,setState]=useState<BuilderV2DeleteState|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[stale,setStale]=useState(false),[uncertain,setUncertain]=useState(false),[result,setResult]=useState<Extract<BuilderV2ActionResult,{ok:true}>|null>(null),busy=useRef(false),attempt=useRef<BuilderV2DeleteRequest|null>(null)
  const trigger=useRef<HTMLButtonElement>(null),wasOpen=useRef(false)
  useEffect(()=>{if(wasOpen.current&&!state)trigger.current?.focus();wasOpen.current=Boolean(state)},[state])
  const inspect=async()=>{if(busy.current||!recordId)return;busy.current=true;setPending(true);setError('');try{const next=await runtime.inspectDelete({screenId,nodeId:node.id,recordId});if(next.ok){setState(next.state);setStale(false)}else{setError(next.error);setStale(Boolean(next.stale))}}catch{setError('Не удалось проверить удаление. Попробуйте ещё раз.')}finally{busy.current=false;setPending(false)}}
  const remove=async()=>{if(busy.current||!state||!recordId||result||stale)return;busy.current=true;setPending(true);setError('');attempt.current??={screenId,nodeId:node.id,recordId,revision:state.revision,fingerprint:state.fingerprint,confirmed:true,requestId:`delete_${crypto.randomUUID().replaceAll('-','')}`};try{const next=await runtime.submitDelete(attempt.current);if(next.ok){setResult(next);setState(null);setUncertain(false)}else{const unknown=uncertain||Boolean(next.uncertain);setError(next.error);setUncertain(unknown);setStale(!unknown&&Boolean(next.stale));if(!unknown)attempt.current=null}}catch{setUncertain(true);setError('Не удалось подтвердить удаление. Повторите запрос: действие не выполнится дважды.')}finally{busy.current=false;setPending(false)}}
  const close=()=>{if(!busy.current&&!uncertain){setState(null);setError('')}}
  return <div className={ui.form}>{!state&&error&&<p role="alert" className={ui.dataError}>{error}</p>}{result?<><p role="status" className={ui.formSuccess}>Запись удалена</p><BuilderV2WorkflowFeedback appId="published" requestKey={attempt.current?.requestId} effects={result.effects}/></>:stale&&!state?<button type="button" className={styles.secondary} onClick={()=>runtime.refresh()}>Обновить данные</button>:<button ref={trigger} type="button" className={styles.danger} disabled={pending||!recordId} onClick={()=>void inspect()}>{pending?'Проверяем…':node.label}</button>}
  {state&&<PrototypeDialog title="Удалить запись?" onClose={close} closeDisabled={pending||uncertain}><div className={ui.form}><p>«{state.recordLabel}» исчезнет из таблицы «{state.tableName}» и приложения.</p>{error&&<p role="alert" className={ui.dataError}>{error}</p>}{stale?<button type="button" className={styles.secondary} onClick={()=>runtime.refresh()}>Обновить запись</button>:<div className={ui.dataControls}><button type="button" className={styles.secondary} disabled={pending||uncertain} onClick={close}>Отмена</button><button type="button" className={styles.danger} disabled={pending} onClick={()=>void remove()}>{pending?'Удаляем…':uncertain?'Повторить удаление':'Удалить запись'}</button></div>}</div></PrototypeDialog>}
  </div>
}
