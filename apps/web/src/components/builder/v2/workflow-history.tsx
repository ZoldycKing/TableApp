'use client'
import { useEffect, useRef, useState } from 'react'
import { readBuilderV2WorkflowRunsAction, type BuilderV2WorkflowHistory } from '@/app/builder-v2-workflow-actions'
import type { BuilderV2WorkflowRun, BuilderV2WorkflowHistorySource } from '@/lib/builder-v2-workflow-types'
import { BuilderV2WorkflowTrace } from './workflow-feedback'
import { PrototypeDialog } from '../prototype/dialog'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

type HistoryData=Extract<BuilderV2WorkflowHistory,{ok:true}>
type State={key:string;data:HistoryData|null;busy:boolean;error:string;reset:boolean}
export function BuilderV2WorkflowHistory({appId,onClose,initialSource='author'}:{appId:string;onClose:()=>void;initialSource?:BuilderV2WorkflowHistorySource}) {
  const [source,setSource]=useState(initialSource),[selected,setSelected]=useState<BuilderV2WorkflowRun|null>(null),[refresh,setRefresh]=useState(0)
  const key=JSON.stringify([appId,source]),generation=useRef(0),lock=useRef(false)
  const [state,setState]=useState<State>({key:'',data:null,busy:true,error:'',reset:false})
  const visible=state.key===key?state:{key,data:null,busy:true,error:'',reset:false}
  useEffect(()=>{
    const version=++generation.current;lock.current=true
    setSelected(null);setState({key,data:null,busy:true,error:'',reset:false})
    void readBuilderV2WorkflowRunsAction(appId,undefined,source).then(result=>{
      if(version!==generation.current)return
      setState(result.ok?{key,data:result,busy:false,error:'',reset:false}:{key,data:null,busy:false,error:result.error,reset:Boolean(result.reset)})
    }).catch(()=>{if(version===generation.current)setState({key,data:null,busy:false,error:'Не удалось загрузить историю. Попробуйте ещё раз.',reset:false})}).finally(()=>{if(version===generation.current)lock.current=false})
    return ()=>{generation.current++}
  },[appId,source,key,refresh])
  const more=async()=>{
    if(lock.current||visible.busy||!visible.data?.next)return
    const version=generation.current,previous=visible.data;lock.current=true;setState({...visible,busy:true,error:''})
    try{const result=await readBuilderV2WorkflowRunsAction(appId,previous.next,source);if(version!==generation.current)return
      setState(result.ok?{key,data:{...result,runs:[...previous.runs,...result.runs.filter(run=>!previous.runs.some(old=>old.id===run.id))]},busy:false,error:'',reset:false}:{key,data:previous,busy:false,error:result.error,reset:Boolean(result.reset)})
    }catch{if(version===generation.current)setState({key,data:previous,busy:false,error:'Не удалось загрузить историю. Попробуйте ещё раз.',reset:false})}finally{if(version===generation.current)lock.current=false}
  }
  const choose=(next:BuilderV2WorkflowHistorySource)=>{if(next===source)return;generation.current++;setSelected(null);setSource(next)}
  return <PrototypeDialog title={selected?'Как выполнилось действие':'История выполнений'} onClose={onClose}><div className={ui.form}>
    {selected?<><button type="button" className={styles.textButton} onClick={()=>setSelected(null)}>← К истории</button><strong>{selected.workflowName}</strong>{selected.actor&&<p className={ui.hint}>{selected.actor.name?`${selected.actor.name} · `:''}{selected.actor.email}</p>}{selected.error&&<p role="alert" className={ui.dataError}>{selected.error}</p>}<BuilderV2WorkflowTrace trace={selected.trace}/></>:<>
      <div className={ui.inspectorTabs} role="tablist" aria-label="Чьи запуски">{([['author','Мои действия'],['published','В приложении']] as const).map(([id,label])=><button key={id} type="button" role="tab" aria-selected={source===id} onClick={()=>choose(id)}>{label}</button>)}</div>
      <button type="button" className={styles.textButton} disabled={visible.busy} onClick={()=>setRefresh(value=>value+1)}>Обновить</button>
      {!visible.data&&visible.busy&&<p role="status">Загружаем историю…</p>}
      {visible.data&&!visible.data.runs.length&&<p className={ui.hint}>{source==='published'?'Пока никто не запускал действия в опубликованном приложении.':'Здесь появятся ваши запуски действий. Предпросмотр в историю не записывается.'}</p>}
      {visible.data?.runs.map(run=><article key={run.id} className={ui.workflowRun}><strong>{run.workflowName}</strong>{run.actor&&<span className={ui.runActor}>{run.actor.name?`${run.actor.name} · `:''}{run.actor.email}</span>}<span className={ui.hint}>{run.status==='succeeded'?'Выполнено':'Ошибка · изменения отменены'} · {new Date(run.createdAt).toLocaleString('ru-RU')}</span><button type="button" className={styles.textButton} onClick={()=>setSelected(run)}>Посмотреть шаги</button></article>)}
      {visible.error&&<><p role="alert" className={ui.dataError}>{visible.error}</p><button type="button" className={styles.secondary} disabled={visible.busy} onClick={()=>visible.reset||!visible.data?.next?setRefresh(value=>value+1):void more()}>{visible.reset?'Обновить список':'Повторить'}</button></>}
      {visible.data?.next&&!visible.error&&<button type="button" className={styles.secondary} disabled={visible.busy} onClick={()=>void more()}>{visible.busy?'Загружаем…':'Показать ещё'}</button>}
    </>}
  </div></PrototypeDialog>
}
