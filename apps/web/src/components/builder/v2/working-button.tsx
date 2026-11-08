'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { inspectBuilderV2ButtonAction, submitBuilderV2ButtonAction } from '@/app/builder-v2-button-actions'
import type { BuilderV2ActionResult, BuilderV2ButtonRequest, BuilderV2ButtonScope, BuilderV2ButtonState } from '@/lib/builder-v2-button-types'
import {WorkflowConfirmation} from './workflow-confirmation'
import type {BuilderV2WorkflowConfirmation} from '@/lib/builder-v2-workflow-types'
import { BuilderV2WorkflowFeedback } from './workflow-feedback'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

export function BuilderV2WorkingButton({appId,scope,initial,returnHref}:{appId:string;scope:BuilderV2ButtonScope;initial:BuilderV2ButtonState;returnHref:string}) {
  const [state,setState]=useState(initial),[pending,setPending]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[stale,setStale]=useState(false),[outcome,setOutcome]=useState<Extract<BuilderV2ActionResult,{ok:true}>|null>(null),[trace,setTrace]=useState<Extract<BuilderV2ActionResult,{ok:false}>['trace']>()
  const [confirmation,setConfirmation]=useState<BuilderV2WorkflowConfirmation|null>(null)
  const busy=useRef(false),attempt=useRef<BuilderV2ButtonRequest|null>(null)
  const run=async(approval?:string)=>{
    if(busy.current||outcome||stale||confirmation&&!approval)return
    busy.current=true;setPending(true);setError('')
    attempt.current??={...scope,requestId:`button_${crypto.randomUUID().replaceAll('-','')}`,revision:state.revision,fingerprint:state.fingerprint}
    if(approval&&attempt.current)attempt.current={...attempt.current,confirmation:approval}
    try{
      const result=await submitBuilderV2ButtonAction(appId,attempt.current)
      if(result.ok){setConfirmation(null);setOutcome(result);setTrace(result.trace);setUncertain(false)}
      else if(result.confirmation){setConfirmation(result.confirmation);setUncertain(false);setError('')}
      else{const unresolved=uncertain||Boolean(result.uncertain);setUncertain(unresolved);setError(result.error);setTrace(result.trace);setStale(!unresolved&&Boolean(result.stale));if(!unresolved){attempt.current=null;setConfirmation(null)}}
    }catch{setUncertain(true);setError('Не удалось подтвердить результат. Повторите запрос: действие не выполнится дважды.')}
    finally{busy.current=false;setPending(false)}
  }
  const refresh=async()=>{
    if(busy.current||uncertain)return
    busy.current=true;setPending(true)
    try{const result=await inspectBuilderV2ButtonAction(appId,scope);if(result.ok){setState(result.state);setStale(false);setError('');setTrace(undefined);attempt.current=null}else setError(result.error)}catch{setError('Не удалось обновить действие. Попробуйте ещё раз.')}
    finally{busy.current=false;setPending(false)}
  }
  return <div className={ui.form}><h1 className={ui.formTitle}>{state.actionName}</h1>{state.recordLabel&&<div className={ui.autoValue}><small>{state.tableName}</small><strong>{state.recordLabel}</strong></div>}
    {!confirmation&&error&&<p role="alert" className={ui.dataError}>{error}</p>}
    {outcome?<>{!outcome.effects?.some(effect=>effect.type==='notify'||effect.type==='copy_value')&&<p role="status" className={ui.formSuccess}>Действие выполнено</p>}<BuilderV2WorkflowFeedback appId={appId} requestKey={attempt.current?.requestId} effects={outcome.effects} trace={outcome.trace} backHref={returnHref}/><Link href={returnHref} className={styles.secondary}>{scope.itemId?'Вернуться к списку':state.recordLabel?'Вернуться к записи':'Вернуться к приложению'}</Link></>:<><p className={ui.hint}>Действие выполнит настроенные шаги.</p>{trace&&<BuilderV2WorkflowFeedback appId={appId} trace={trace}/>}<button type="button" className={styles.primary} disabled={pending} onClick={()=>void(stale?refresh():run())}>{pending?'Выполняем…':stale?'Обновить действие':uncertain?'Повторить запрос':state.actionName}</button></>}
    {confirmation&&<WorkflowConfirmation value={confirmation} pending={pending} uncertain={uncertain} error={error} onConfirm={()=>void run(confirmation.fingerprint)} onCancel={()=>{if(!busy.current&&!uncertain){setConfirmation(null);attempt.current=null;setError('')}}}/>}
  </div>
}
