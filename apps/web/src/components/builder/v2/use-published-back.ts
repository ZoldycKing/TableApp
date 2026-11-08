'use client'
import {useEffect,useRef} from 'react'
import type {AppV2} from '@tableapp/schema/app-v2'

type Destination={screenId:string;recordId?:string}
const same=(a:Destination,b:Destination)=>a.screenId===b.screenId&&a.recordId===b.recordId
const key='tableappV2PublishedBack'

/** Browser Back is used only for an entry created by this app's own navigation. */
export function usePublishedV2Back(app:AppV2,current:Destination,router:{back:()=>void;replace:(url:string)=>void}){
  const pending=useRef<{from:Destination;to:Destination}|null>(null)
  const scope=`${app.slug}:/a/${encodeURIComponent(app.slug)}`
  useEffect(()=>{
    const next=pending.current
    if(!next)return
    pending.current=null
    if(!same(next.to,current))return
    window.history.replaceState({...window.history.state,[key]:{scope,from:next.from,to:next.to}},'',window.location.href)
  },[scope,current.screenId,current.recordId])
  const beforeNavigate=(to:Destination,replace=false)=>{
    if(same(current,to))return
    const marker=window.history.state?.[key]
    if(!replace)pending.current={from:current,to}
    else pending.current=marker?.scope===scope&&marker.to&&same(marker.to,current)&&marker.from?{from:marker.from,to}:null
  }
  const back=(fallbackScreenId:string)=>{
    const marker=window.history.state?.[key]
    const from=marker?.from as Destination|undefined
    const screen=from&&app.screens.find(screen=>screen.id===from.screenId)
    if(marker?.scope===scope&&marker.to&&same(marker.to,current)&&screen&&Boolean(screen.contextTableId)===Boolean(from?.recordId))router.back()
    else router.replace(`/a/${encodeURIComponent(app.slug)}?screen=${encodeURIComponent(fallbackScreenId)}`)
  }
  return {beforeNavigate,back}
}
