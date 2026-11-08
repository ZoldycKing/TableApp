'use client'
import {useEffect,useRef,useState} from 'react'
import {inspectBuilderV2EnterAction,inspectPublishedV2EnterAction,submitBuilderV2EnterAction,submitPublishedV2EnterAction} from '@/app/builder-v2-enter-actions'
import type {BuilderV2EnterRequest,BuilderV2EnterScope,BuilderV2EnterState,BuilderV2EnterResult} from '@/lib/builder-v2-enter-types'
import {WorkflowConfirmation} from './workflow-confirmation'
import {BuilderV2WorkflowFeedback} from './workflow-feedback'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

export function BuilderV2ScreenEnter({appId,slug,scope,initial,automatic=false,blocked=false,requestId,onDone,returnHref}:{appId:string;slug?:string;scope:BuilderV2EnterScope;initial:BuilderV2EnterState;automatic?:boolean;blocked?:boolean;requestId?:string;onDone?:()=>void;returnHref?:string}){
  const [state,setState]=useState(initial),[pending,setPending]=useState(false),[result,setResult]=useState<BuilderV2EnterResult|null>(null),[uncertain,setUncertain]=useState(false),[cancelled,setCancelled]=useState(false),[ready,setReady]=useState(!automatic),[reload,setReload]=useState(false)
  const active=useRef(true),started=useRef(false),busy=useRef(false),attempt=useRef<BuilderV2EnterRequest|null>(null),done=useRef(onDone);done.current=onDone
  const run=async(approval?:string)=>{
    if(busy.current||blocked||cancelled||result?.ok||result&&!result.ok&&(result.stale&&!uncertain||result.confirmation&&!approval))return
    busy.current=true;setPending(true)
    attempt.current??={...scope,revision:state.revision,fingerprint:state.fingerprint,requestId:requestId??`enter_${crypto.randomUUID().replaceAll('-','')}`}
    if(approval)attempt.current={...attempt.current,confirmation:approval}
    try{
      const outcome=slug?await submitPublishedV2EnterAction(slug,attempt.current):await submitBuilderV2EnterAction(appId,attempt.current)
      if(!active.current)return
      setResult(outcome)
      if(outcome.ok){setUncertain(false);if(!outcome.effects?.some(effect=>effect.type==='open_screen'||effect.type==='go_back'))done.current?.()}
      else if(outcome.confirmation)setUncertain(false)
      else setUncertain(old=>old||Boolean(outcome.uncertain))
    }catch{if(active.current){setUncertain(true);setResult({ok:false,uncertain:true,error:'Не удалось подтвердить результат. Повторите запрос: действие не выполнится дважды.'})}}
    finally{busy.current=false;if(active.current)setPending(false)}
  }
  useEffect(()=>{active.current=true;if(automatic&&!blocked&&!started.current){started.current=true;void run()}return()=>{active.current=false}},[])
  const refresh=async()=>{
    if(busy.current||uncertain)return
    busy.current=true;setPending(true)
    try{const value={...scope,revision:state.revision},loaded=slug?await inspectPublishedV2EnterAction(slug,value):await inspectBuilderV2EnterAction(appId,value);if(active.current){if(loaded.ok){setState(loaded.state);setResult(null);attempt.current=null;setReady(true)}else{setResult(loaded);setReload(Boolean(loaded.stale))}}}catch{if(active.current)setResult({ok:false,error:'Не удалось обновить действие. Повторите попытку.'})}finally{busy.current=false;if(active.current)setPending(false)}
  }
  if(blocked)return <p role="alert" className={ui.dataError}>Автоматические переходы остановлены, чтобы экран не открывался по кругу. Выберите нужный раздел в меню.</p>
  const confirmation=result&&!result.ok?result.confirmation:undefined
  return <section className={ui.screenEnter} aria-label="Действие при открытии экрана" aria-busy={pending}>
    {!automatic&&!result?.ok&&<><p className={ui.hint}>Проверка выполнит действие на текущих данных приложения.</p>{state.recordLabel&&<strong>{state.recordLabel}</strong>}</>}
    {pending&&<p role="status" className={ui.hint}>Выполняем действие экрана…</p>}
    {cancelled&&<p role="status" className={ui.hint}>Действие отменено.</p>}
    {result&&!result.ok&&!confirmation&&<><p role="alert" className={ui.dataError}>{result.error}</p><button type="button" className={styles.secondary} disabled={pending} onClick={()=>{if(reload&&!uncertain)window.location.reload();else void(result.stale&&!uncertain?refresh():run())}}>{reload&&!uncertain?'Обновить страницу':result.stale&&!uncertain?'Обновить действие':'Повторить запрос'}</button></>}
    {ready&&!result&&!cancelled&&<button type="button" className={styles.primary} disabled={pending} onClick={()=>void run()}>{automatic?'Выполнить действие':'Выполнить проверку'}</button>}
    {result?.ok&&<>{!automatic&&!result.effects?.some(effect=>effect.type==='notify')&&<p role="status" className={ui.formSuccess}>Действие выполнено.</p>}<BuilderV2WorkflowFeedback appId={appId} requestKey={attempt.current?.requestId} effects={result.effects} trace={automatic?undefined:result.trace} backHref={returnHref} requireGesture={automatic}/></>}
    {confirmation&&<WorkflowConfirmation value={confirmation} pending={pending} uncertain={uncertain} error={result&&!result.ok?result.error:''} onConfirm={()=>void run(confirmation.fingerprint)} onCancel={()=>{if(!busy.current&&!uncertain){setResult(null);setCancelled(true)}}}/>}
  </section>
}
