'use client'
import {useState} from 'react'
import type {AppV2,AppV2Node} from '@tableapp/schema/app-v2'
import type {BuilderV2Table} from '@/lib/builder-v2'
import type {BuilderV2Workflow} from '@/lib/builder-v2-workflow-types'
import {builderV2NodeAction} from '@/lib/builder-v2-button-action'
import {collectionCardScreen} from './collection-navigation'
import {BuilderV2WorkflowEditor} from './workflow-editor'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

export function CollectionActionSettings({app,node,tables,onCard,onConfigure,onWorkflow,onOpen}:{app:AppV2;node:Extract<AppV2Node,{type:'collection'}>;tables:readonly BuilderV2Table[];onCard:(id:string|null|'create')=>void;onConfigure?:(roles:string[]|null)=>void;onWorkflow?:(flow:BuilderV2Workflow)=>string|null;onOpen?:()=>void}){
  const [open,setOpen]=useState(false),card=collectionCardScreen(app,node),action=builderV2NodeAction(app,node),chain=!card&&action,tableId=app.sources.find(source=>source.id===node.sourceId)?.tableId
  const roles=action?[...new Set(app.policy.workflows.filter(grant=>grant.workflowId===action.flow.id).flatMap(grant=>grant.audience.kind==='roles'?grant.audience.roleIds:[]))]:[]
  return <section className={ui.formActionSettings} aria-label="Нажатие на строку"><label>При нажатии<select value={card??(chain?'__chain':node.events.itemPress?'__unsupported':'')} onChange={event=>{
    const value=event.target.value
    if(value==='__chain')onConfigure?.([app.roles.find(role=>role.id==='owner')?.id??app.roles[0]!.id])
    else if(!value&&onConfigure)onConfigure(null)
    else onCard(value||null)
  }}><option value="">Без действия</option>{onConfigure&&<option value="__chain" disabled={!app.roles.length}>Цепочка действий</option>}{node.events.itemPress&&!action&&<option value="__unsupported" disabled>Требует настройки</option>}{app.screens.filter(screen=>screen.contextTableId===tableId).map(screen=><option key={screen.id} value={screen.id}>{screen.name}</option>)}</select></label>
    {chain?<><fieldset><legend>Кто может выполнять действие</legend>{app.roles.map(role=><label key={role.id} className={ui.inlineCheck}><input type="checkbox" checked={roles.includes(role.id)} onChange={event=>{const next=event.target.checked?[...roles,role.id]:roles.filter(id=>id!==role.id);onConfigure?.(next.length?next:null)}}/>{role.name}</label>)}</fieldset>
      {onWorkflow&&<button type="button" className={styles.secondary} onClick={()=>setOpen(true)}>Настроить шаги ({action.flow.steps.length})</button>}{onOpen&&<button type="button" className={styles.textButton} onClick={onOpen}>Проверить на строке</button>}<p className={ui.hint}>Нажатие на строку выполнит эти шаги. Кнопки внутри строки работают отдельно.</p>
    </>:<button type="button" className={styles.secondary} onClick={()=>onCard('create')}>Создать карточку записи</button>}
    {open&&chain&&onWorkflow&&<BuilderV2WorkflowEditor app={app} workflow={action.flow} itemContext tables={tables} onSave={onWorkflow} onClose={()=>setOpen(false)}/>}
  </section>
}
