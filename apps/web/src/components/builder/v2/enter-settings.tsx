'use client'
import {useState} from 'react'
import type {AppV2} from '@tableapp/schema/app-v2'
import type {BuilderV2Table} from '@/lib/builder-v2'
import {builderV2EnterAction} from '@/lib/builder-v2-enter-action'
import {BuilderV2WorkflowEditor} from './workflow-editor'
import {BuilderV2WorkflowHistory} from './workflow-history'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

export function BuilderV2EnterSettings({app,screenId,tables,onConfigure,onWorkflow,onOpen,canOpen}:{app:AppV2;screenId:string;tables:readonly BuilderV2Table[];onConfigure:(roles:string[]|null)=>void;onWorkflow:(flow:AppV2['workflows'][number])=>string|null;onOpen:()=>void;canOpen:boolean}){
  const [open,setOpen]=useState(false),[history,setHistory]=useState(false),action=builderV2EnterAction(app,screenId),screen=app.screens.find(screen=>screen.id===screenId)!,roles=action?[...new Set(app.policy.workflows.filter(grant=>grant.workflowId===action.flow.id).flatMap(grant=>grant.audience.kind==='roles'?grant.audience.roleIds:[]))]:[]
  return <section className={ui.formActionSettings} aria-label="Действие при открытии экрана"><label>При открытии<select value={action?'run':screen.events.enter?'unsupported':''} onChange={event=>onConfigure(event.target.value==='run'?[app.roles.find(role=>role.id==='owner')?.id??app.roles[0]!.id]:null)}><option value="">Ничего не делать</option><option value="run" disabled={!app.roles.length}>Выполнить действие</option>{screen.events.enter&&!action&&<option value="unsupported" disabled>Требует настройки</option>}</select></label>
    {action&&<><fieldset><legend>Для каких ролей</legend>{app.roles.map(role=><label className={ui.inlineCheck} key={role.id}><input type="checkbox" checked={roles.includes(role.id)} onChange={event=>onConfigure(event.target.checked?[...roles,role.id]:roles.filter(id=>id!==role.id))}/>{role.name}</label>)}</fieldset><button type="button" className={styles.secondary} onClick={()=>setOpen(true)}>Настроить шаги ({action.flow.steps.length})</button><button type="button" className={styles.textButton} disabled={!canOpen} onClick={onOpen}>Проверить действие</button><button type="button" className={styles.textButton} onClick={()=>setHistory(true)}>История выполнений</button><p className={ui.hint}>Запускается после открытия экрана. Обновление данных не запускает его повторно.</p>{!canOpen&&<p className={ui.hint}>Для проверки откройте карточку записи.</p>}</>}
    {open&&action&&<BuilderV2WorkflowEditor app={app} workflow={action.flow} tables={tables} onSave={onWorkflow} onClose={()=>setOpen(false)}/>}{history&&<BuilderV2WorkflowHistory appId={app.id} onClose={()=>setHistory(false)}/>}
  </section>
}
