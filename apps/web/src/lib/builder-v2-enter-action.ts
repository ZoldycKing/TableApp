import type {AppV2} from '@tableapp/schema/app-v2'
import {v2Id} from '@/components/builder/v2/model'
import {builderV2ExecutableWorkflow,type BuilderV2Workflow} from './builder-v2-workflow-types'
import {grantBuilderV2WorkflowWrites} from './builder-v2-form-action'

export function builderV2EnterAction(app:AppV2,screenId:string){
  const screen=app.screens.find(screen=>screen.id===screenId),flow=app.workflows.find(flow=>flow.id===screen?.events.enter)
  return screen&&flow&&flow.input.formId===null&&flow.input.rowTableId===screen.contextTableId&&(flow.input.screenTableId??null)===screen.contextTableId&&builderV2ExecutableWorkflow(flow)?{screen,flow}:null
}
export function configureBuilderV2Enter(app:AppV2,screenId:string,roles:readonly string[]|null,edited?:BuilderV2Workflow):AppV2{
  const screen=app.screens.find(screen=>screen.id===screenId)
  if(!screen)throw new Error('Выберите экран')
  const current=builderV2EnterAction(app,screenId),flowId=screen.events.enter
  const shared=flowId&&(app.screens.some(item=>item.id!==screenId&&item.events.enter===flowId)||app.nodes.some(node=>'events'in node&&Object.values(node.events).includes(flowId)))
  if(!roles?.length){
    const next=flowId&&!shared?{...app,workflows:app.workflows.filter(flow=>flow.id!==flowId),policy:{...app.policy,workflows:app.policy.workflows.filter(grant=>grant.workflowId!==flowId)}}:app
    return {...next,screens:next.screens.map(item=>item.id===screenId?{...item,events:{enter:null}}:item)}
  }
  if(flowId&&!current)throw new Error('Сначала отключите прежнее действие экрана')
  if(roles.some(id=>!app.roles.some(role=>role.id===id)))throw new Error('Выберите роль приложения')
  if(edited&&(!current||edited.id!==current.flow.id||!builderV2ExecutableWorkflow(edited)))throw new Error('Выберите действие этого экрана')
  const id=current&&!shared?current.flow.id:v2Id(),flow:BuilderV2Workflow={...(edited??current?.flow??{name:`При открытии: ${screen.name}`.slice(0,100),steps:[{id:v2Id(),type:'notify',message:{kind:'literal',value:'Готово'}}]}),id,input:{rowTableId:screen.contextTableId,screenTableId:screen.contextTableId,formId:null}},audience={kind:'roles' as const,roleIds:[...new Set(roles)]}
  return {...app,screens:app.screens.map(item=>item.id===screenId?{...item,events:{enter:id}}:item),workflows:[...app.workflows.filter(flow=>flow.id!==id),flow],policy:{tables:grantBuilderV2WorkflowWrites(app,flow,audience.roleIds),workflows:[...app.policy.workflows.filter(grant=>grant.workflowId!==id),{workflowId:id,audience}]}}
}
export function configureBuilderV2EnterWorkflow(app:AppV2,screenId:string,flow:BuilderV2Workflow){
  const roles=[...new Set(app.policy.workflows.filter(grant=>grant.workflowId===flow.id).flatMap(grant=>grant.audience.kind==='roles'?grant.audience.roleIds:[]))]
  if(!roles.length)throw new Error('Выберите роли, которым доступно действие')
  return configureBuilderV2Enter(app,screenId,roles,flow)
}
