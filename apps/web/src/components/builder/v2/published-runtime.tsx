'use client'
import {BuilderV2ScreenEnter} from './screen-enter'
import {BuilderV2EnterNavigation} from './enter-navigation'
import {useState,useEffect,useRef,useCallback,type ReactNode} from 'react'
import {usePublishedV2Back} from './use-published-back'
import {useRouter} from 'next/navigation'
import {inspectPublishedV2DeleteAction,submitPublishedV2DeleteAction,readPublishedV2DataAction,readPublishedV2RecordAction,inspectPublishedV2FormAction,submitPublishedV2FormAction,inspectPublishedV2ButtonAction,submitPublishedV2ButtonAction} from '@/app/builder-v2-published-actions'
import type {loadPublishedV2Page} from '@/lib/builder-v2-published-page'
import {PublishedV2Context,type PublishedV2Transport} from './published-context'
import {AppV2Renderer} from './view'
import {BuilderV2AppFrame,BuilderV2Theme,BuilderV2Account} from './app-frame'
import {BuilderV2WorkflowNotice} from './workflow-feedback'
import ui from './view.module.css'
import { builderV2RecordParent } from './collection-navigation'
import { BuilderV2OrderWorkbench } from './order-workbench'
import { isBuilderV2ContactProfile } from './record-presentation'
type Data=Extract<Awaited<ReturnType<typeof loadPublishedV2Page>>,{login:false}>
export function PublishedV2Runtime({data}:{data:Data}){
  const router=useRouter(),{app,actor,revision,screenId,recordId,record,title,buttons,tables,rowActions,enter}=data,slug=app.slug,page=app.screens.find(screen=>screen.id===screenId)!
  const [dataVersion,setDataVersion]=useState(0),[notice,setNotice]=useState(''),[headerAccessory,setHeaderAccessoryState]=useState<ReactNode>(null)
  const setHeaderAccessory=useCallback((node:ReactNode)=>setHeaderAccessoryState(node),[])
  const enterNavigation=useRef(new BuilderV2EnterNavigation()),scopeKey=JSON.stringify([screenId,recordId]),visit=useRef({key:'',id:''})
  if(visit.current.key!==scopeKey)visit.current={key:scopeKey,id:`enter_${crypto.randomUUID().replaceAll('-','')}`}
  const enterBlocked=enterNavigation.current.visit(scopeKey)
  useEffect(()=>{setNotice('');setHeaderAccessory(null)},[screenId,recordId,setHeaderAccessory])
  const refresh=(message?:string)=>{if(message)setNotice(message);setDataVersion(value=>value+1);router.refresh()}
  const history=usePublishedV2Back(app,{screenId,recordId},router)
  const navigate=(screenId:string,rowId?:string,options?:{automatic?:boolean;replace?:boolean})=>{
    enterNavigation.current.prepare(Boolean(options?.automatic))
    history.beforeNavigate({screenId,recordId:rowId},options?.replace)
    const url=`/a/${encodeURIComponent(slug)}?screen=${encodeURIComponent(screenId)}${rowId?`&row=${encodeURIComponent(rowId)}`:''}`
    if(window.location.pathname+window.location.search===url)router.refresh()
    else if(options?.replace)router.replace(url)
    else router.push(url)
  }
  const transport:PublishedV2Transport={slug,revision,dataVersion,rowAction:id=>rowActions[id],invalidate:message=>{setNotice(message);setDataVersion(value=>value+1)},readData:request=>readPublishedV2DataAction(slug,{...request,revision}),readRecord:request=>readPublishedV2RecordAction(slug,{...request,revision}),inspectForm:request=>inspectPublishedV2FormAction(slug,{...request,revision}),submitForm:request=>submitPublishedV2FormAction(slug,request),inspectButton:request=>inspectPublishedV2ButtonAction(slug,{...request,revision}),submitButton:request=>submitPublishedV2ButtonAction(slug,request),inspectDelete:request=>inspectPublishedV2DeleteAction(slug,{...request,revision}),submitDelete:request=>submitPublishedV2DeleteAction(slug,request),navigate,back:(fallback,options)=>{enterNavigation.current.prepare(Boolean(options?.automatic));history.back(fallback)},refresh,tableName:tableId=>tables.find(table=>table.id===tableId)?.name??'Таблица',buttonState:id=>buttons[id],setHeaderAccessory}
  const home=(app.homeScreenId?app.screens.find(screen=>screen.id===app.homeScreenId&&!screen.contextTableId)?.id:undefined)??app.screens.find(screen=>!screen.contextTableId)?.id
  const parent = builderV2RecordParent(app, screenId)
  const backTarget = data.sectionId ?? home
  return <PublishedV2Context.Provider value={transport}>
    <BuilderV2Theme as="main" app={app} className={`${ui.preview} ${ui.published}`}>
      <BuilderV2AppFrame
        fullScreen scrollKey={recordId ?? ''} app={app} screenId={screenId} sectionId={data.sectionId} title={title}
        profile={Boolean(record && isBuilderV2ContactProfile(app, screenId, tables))}
        back={page.contextTableId && backTarget ? () => { enterNavigation.current.prepare(); history.back(backTarget) } : undefined}
        headerAction={<>{headerAccessory}<BuilderV2Account email={actor.email} authenticated={actor.authenticated} slug={slug} /></>}
        notice={<><BuilderV2WorkflowNotice appId={slug} />{notice && <p role="status" className={ui.context}>{notice}</p>}</>}
        onNavigate={id => navigate(id)}
      >
        {enter && <BuilderV2ScreenEnter key={visit.current.id} appId={app.id} slug={slug} scope={{ screenId, ...(recordId ? { recordId } : {}) }} initial={enter} automatic blocked={enterBlocked} requestId={visit.current.id} onDone={refresh} />}
        {page.contextTableId && !recordId
          ? <p className={ui.hint}>Откройте запись из списка.</p>
          : <BuilderV2OrderWorkbench app={app} parent={parent} tables={tables} recordId={recordId} record={record} onOpen={id => navigate(screenId, id, { replace: true })}>
              <AppV2Renderer key={JSON.stringify([revision,actor,screenId,recordId,record])} live app={app} actor={actor} screenId={screenId} record={record} tables={tables} businessLinks={data.businessLinks} onNavigate={navigate} statusFormId={data.statusFormId} />
            </BuilderV2OrderWorkbench>}
      </BuilderV2AppFrame>
    </BuilderV2Theme>
  </PublishedV2Context.Provider>
}
