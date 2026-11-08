'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BuilderV2WorkflowEffect, BuilderV2WorkflowTrace as WorkflowTrace } from '@/lib/builder-v2-workflow-types'
import { PrototypeDialog } from '../prototype/dialog'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'
import {openBuilderV2Url} from './browser-navigation'
import {usePublishedV2} from './published-context'

const storageKey = (appId: string) => `tableapp-v2-notice:${appId}`
export function BuilderV2WorkflowTrace({ trace }: { trace: WorkflowTrace }) {
  const states = { done: 'Выполнено', skipped: 'Пропущено', rolled_back: 'Отменено', failed: 'Ошибка' }
  return <ol className={ui.workflowTrace}>{trace.map((item, index) => <li key={`${item.stepId}:${index}`} data-status={item.status}><strong>{item.label}</strong><small>{states[item.status]}{item.detail ? ` · ${item.detail}` : ''}</small></li>)}</ol>
}
export function BuilderV2WorkflowFeedback({appId,requestKey,effects,trace,editor=false,backHref,requireGesture=false}:{appId:string;requestKey?:string;effects?:BuilderV2WorkflowEffect[];trace?:WorkflowTrace;editor?:boolean;backHref?:string;requireGesture?:boolean}){
  const router=useRouter(),published=usePublishedV2(),applied=useRef<string|null>(null),active=useRef(true),navigation=useRef<(()=>void)|null>(null),navigated=useRef<string|null>(null)
  const copying=useRef<string|null>(null)
  const [open,setOpen]=useState(false),[copy,setCopy]=useState<{key:string;value:string;status:'pending'|'failed'|'done'|'ready'}|null>(null),[navigationError,setNavigationError]=useState(''),[manualLink,setManualLink]=useState(false)
  const messages=effects?.flatMap(effect=>effect.type==='notify'?[effect.message]:[])??[]
  useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
  const copyValue=async(value:string,key:string)=>{
    if(copying.current===key)return
    copying.current=key
    setCopy({key,value,status:'pending'})
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(value)
      if(active.current&&applied.current===key){setCopy({key,value,status:'done'});navigation.current?.()}
    }catch{if(active.current&&applied.current===key)setCopy({key,value,status:'failed'})}
    finally{if(copying.current===key)copying.current=null}
  }
  useEffect(()=>{
    if(!requestKey||!effects)return
    const key=`${published?.slug??appId}:${requestKey}`
    if(applied.current===key)return
    applied.current=key
    const destination=[...effects].reverse().find(effect=>['open_screen','go_back','open_url'].includes(effect.type))
    navigation.current=destination?()=>{
      if(!active.current||applied.current!==key||navigated.current===key)return
      try{
        const id=published?.slug??appId
        try{sessionStorage.setItem(storageKey(id),JSON.stringify({at:Date.now(),messages}))}catch{}
        if(destination.type==='open_url')openBuilderV2Url(destination.url)
        else if(destination.type==='go_back'){
          if(published){if(requireGesture)published.back(destination.screenId,{automatic:true});else published.back(destination.screenId)}
          else router.push(backHref??`/apps/${encodeURIComponent(appId)}${editor?'':'/preview'}?screen=${encodeURIComponent(destination.screenId)}`)
        }else if(destination.type==='open_screen'){
          if(published){if(requireGesture)published.navigate(destination.screenId,destination.recordId,{automatic:true});else published.navigate(destination.screenId,destination.recordId)}
          else router.push(`/apps/${encodeURIComponent(appId)}${editor?'':'/preview'}?screen=${encodeURIComponent(destination.screenId)}${destination.recordId?`&row=${encodeURIComponent(destination.recordId)}`:''}`)
        }
        navigated.current=key
      }catch(error){setNavigationError(error instanceof Error?error.message:'Не удалось открыть страницу')}
    }:null
    const value=[...effects].reverse().find(effect=>effect.type==='copy_value')
    if(value?.type==='copy_value'){if(requireGesture)setCopy({key,value:value.value,status:'ready'});else void copyValue(value.value,key)}
    else if(requireGesture&&destination?.type==='open_url')setManualLink(true)
    else navigation.current?.()
  },[requestKey,effects,appId,router,editor,backHref,published,requireGesture])
  return <>{messages.map((message,index)=><p key={index} role="status" className={ui.formSuccess}>{message}</p>)}
    {copy&&<div className={ui.copyFallback}>
      {copy.status==='failed'||copy.status==='ready'?<><p role={copy.status==='failed'?'alert':'status'} className={ui.hint}>Нажмите «Скопировать» или выделите значение и скопируйте вручную.</p><textarea aria-label="Значение для копирования" readOnly value={copy.value} onFocus={event=>event.currentTarget.select()}/></>:<p role="status" className={copy.status==='done'?ui.formSuccess:ui.hint}>{copy.status==='done'?'Скопировано':'Копируем…'}</p>}
      <div className={ui.dataControls}><button type="button" className={copy.status==='failed'?styles.secondary:styles.textButton} aria-disabled={copy.status==='pending'} onClick={()=>{if(copy.status!=='pending')void copyValue(copy.value,copy.key)}}>{copy.status==='done'?'Скопировать ещё раз':copy.status==='pending'?'Копируем…':'Скопировать'}</button>{(copy.status==='failed'||copy.status==='ready')&&navigation.current&&<button type="button" className={styles.textButton} onClick={()=>navigation.current?.()}>Продолжить</button>}</div>
    </div>}
    {manualLink&&<button type="button" className={styles.secondary} onClick={()=>navigation.current?.()}>Открыть ссылку</button>}
    {navigationError&&<p role="alert" className={ui.dataError}>{navigationError}</p>}
    {Boolean(trace?.length)&&<button type="button" className={styles.textButton} onClick={()=>setOpen(true)}>Посмотреть шаги</button>}
    {open&&<PrototypeDialog title="Как выполнилось действие" onClose={()=>setOpen(false)}><BuilderV2WorkflowTrace trace={trace??[]}/></PrototypeDialog>}
  </>
}
export function BuilderV2WorkflowNotice({ appId }: { appId: string }) {
  const [messages, setMessages] = useState<string[]>([])
  useEffect(() => { try { const key = storageKey(appId), raw = sessionStorage.getItem(key); sessionStorage.removeItem(key); if (!raw) return; const value = JSON.parse(raw); if (Number.isFinite(value.at) && Date.now() - value.at < 60000 && Date.now() >= value.at && Array.isArray(value.messages)) setMessages(value.messages.filter((item: unknown): item is string => typeof item === 'string' && item.length <= 1000).slice(0, 30)) } catch {} }, [appId])
  return messages.length ? <div className={ui.context} role="status">{messages.map((message, index) => <p key={index}>{message}</p>)}</div> : null
}
