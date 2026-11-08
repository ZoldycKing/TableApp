'use client'
import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import { builderV2DeleteAction } from '@/lib/builder-v2-delete-action'
import { nodeContext } from './model'
import { builderV2WorkingPath,builderV2ButtonContext } from '@/lib/builder-v2-working-scope'
import ui from './view.module.css'
import styles from '../prototype/prototype.module.css'
import { useState } from 'react'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { builderV2ButtonAction } from '@/lib/builder-v2-button-action'
import type { BuilderV2Workflow } from '@/lib/builder-v2-workflow-types'
import { BuilderV2WorkflowEditor } from './workflow-editor'
import { BuilderV2WorkflowHistory } from './workflow-history'

export function BuilderV2DeleteActionSettings({ app, node, screenId, tables, onConfigure, onConfigureChain, onEditChain, onWorkflow, onOpen }: { app: AppV2; node: Extract<AppV2Node, {type:'button'}>; screenId: string; tables?:readonly BuilderV2Table[]; onConfigure: (roles: string[] | null) => void; onConfigureChain?:(roles:string[]|null)=>void; onEditChain?:(flow:BuilderV2Workflow)=>string|null; onWorkflow: (id: string | null) => void; onOpen: () => void }) {
  const [stepsOpen,setStepsOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false)
  const action = builderV2DeleteAction(app, node), context = nodeContext(app, screenId, node.id), screen = app.screens.find(screen => screen.id === screenId)
  const chain=builderV2ButtonAction(app,node),chainRoles=chain?[...new Set(app.policy.workflows.filter(grant=>grant.workflowId===chain.flow.id).flatMap(grant=>grant.audience.kind==='roles'?grant.audience.roleIds:[]))]:[]
  const roles = action ? [...new Set(app.policy.workflows.filter(grant => grant.workflowId === action.flow.id).flatMap(grant => grant.audience.kind === 'roles' ? grant.audience.roleIds : []))] : []
  const available = Boolean(screen?.contextTableId && screen.contextTableId === context.rowTableId && !context.formId && builderV2WorkingPath(app, screenId, node.id))
  const buttonContext=builderV2ButtonContext(app,screenId,node.id),chainAvailable=Boolean(buttonContext&&!context.formId)
  return <section className={ui.formActionSettings} aria-label="Действие кнопки"><label>Действие<select value={action ? '__delete' : chain ? '__chain' : node.events.press ?? ''} onChange={event => {const value=event.target.value,roles=[app.roles.find(role=>role.id==='owner')?.id??app.roles[0]!.id];if(value==='__delete')onConfigure(roles);else if(value==='__chain')onConfigureChain?.(roles);else if(!value&&action)onConfigure(null);else if(!value&&chain)onConfigureChain?.(null);else onWorkflow(value||null)}}><option value="">Без действия</option>{onConfigureChain&&<option value="__chain" disabled={!chainAvailable||!app.roles.length||Boolean(node.events.press&&!chain)}>Цепочка действий</option>}{app.workflows.filter(flow => flow.id !== action?.flow.id && flow.id!==chain?.flow.id && flow.input.rowTableId === context.rowTableId && flow.input.formId === context.formId && (flow.input.screenTableId??null)===(app.screens.find(screen=>screen.id===screenId)?.contextTableId??null)).map(flow => <option key={flow.id} value={flow.id}>{flow.name}</option>)}<option value="__delete" disabled={!available || !app.roles.length || Boolean(node.events.press && !action)}>Удалить открытую запись</option></select></label>
  {chain&&<>{buttonContext?.collection&&<p className={ui.hint}>Действие выполняется для той строки списка, в которой нажали кнопку.</p>}<fieldset><legend>Кто может выполнять действие</legend>{app.roles.map(role=><label key={role.id} className={ui.inlineCheck}><input type="checkbox" checked={chainRoles.includes(role.id)} onChange={event=>{const roles=event.target.checked?[...chainRoles,role.id]:chainRoles.filter(id=>id!==role.id);onConfigureChain?.(roles.length?roles:null)}}/>{role.name}</label>)}</fieldset>{onEditChain&&tables&&<button type="button" className={styles.secondary} onClick={()=>setStepsOpen(true)}>Настроить шаги ({chain.flow.steps.length})</button>}<button type="button" className={styles.secondary} onClick={onOpen}>Открыть рабочее действие</button><button type="button" className={styles.textButton} onClick={()=>setHistoryOpen(true)}>История выполнений</button><p className={ui.hint}>После публикации пользователи с выбранной ролью смогут выполнять действие.</p></>}
  {action && <><fieldset><legend>Кто может удалять записи</legend>{app.roles.map(role => <label key={role.id} className={ui.inlineCheck}><input type="checkbox" checked={roles.includes(role.id)} onChange={event => { const next = event.target.checked ? [...roles, role.id] : roles.filter(id => id !== role.id); onConfigure(next.length ? next : null) }} />{role.name}</label>)}</fieldset><p className={ui.hint}>Удаление всегда требует подтверждения. Ограничения по владельцу записи сохраняются.</p><button type="button" className={styles.secondary} onClick={onOpen}>Открыть рабочее действие</button></>}
  {stepsOpen&&chain&&tables&&onEditChain&&<BuilderV2WorkflowEditor app={app} itemContext={Boolean(buttonContext?.collection)} workflow={chain.flow} tables={tables} onSave={onEditChain} onClose={()=>setStepsOpen(false)}/>}{historyOpen&&<BuilderV2WorkflowHistory appId={app.id} onClose={()=>setHistoryOpen(false)}/>}
  </section>
}
