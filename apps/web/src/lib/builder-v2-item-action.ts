import type {AppV2} from '@tableapp/schema/app-v2'
import {builderV2ActionContext} from './builder-v2-working-scope'
import {builderV2NodeAction} from './builder-v2-button-action'
import {builderV2ExecutableWorkflow,type BuilderV2Workflow} from './builder-v2-workflow-types'
import {grantBuilderV2WorkflowWrites} from './builder-v2-form-action'
import {replaceNode,v2Id} from '@/components/builder/v2/model'
import {collectionCardScreen} from '@/components/builder/v2/collection-navigation'

/** An explicit author choice configures itemPress; adding a list alone grants no write access. */
export function configureBuilderV2ItemAction(app:AppV2,nodeId:string,roles:readonly string[]|null,edited?:BuilderV2Workflow):AppV2{
  const node=app.nodes.find(node=>node.id===nodeId),screen=app.screens.find(screen=>builderV2ActionContext(app,screen.id,nodeId)?.event==='itemPress')
  if(node?.type!=='collection'||!screen)throw new Error('Выберите список на экране или в карточке')
  const context=builderV2ActionContext(app,screen.id,nodeId)!,current=builderV2NodeAction(app,node)
  const oldId=node.events.itemPress,shared=oldId&&(app.nodes.some(other=>other.id!==node.id&&'events'in other&&Object.values(other.events).includes(oldId))||app.screens.some(screen=>screen.events.enter===oldId))
  if(!roles?.length){const next=oldId&&!shared?{...app,workflows:app.workflows.filter(flow=>flow.id!==oldId),policy:{...app.policy,workflows:app.policy.workflows.filter(grant=>grant.workflowId!==oldId)}}:app;return replaceNode(next,{...node,events:{itemPress:null}})}
  if(roles.some(id=>!app.roles.some(role=>role.id===id)))throw new Error('Выберите роль приложения')
  if(edited&&(!current||edited.id!==current.flow.id||!edited.steps.length||!builderV2ExecutableWorkflow(edited)))throw new Error('Выберите действие этого списка')
  if(oldId&&!current)throw new Error('Сначала отключите неподдерживаемое действие списка')
  const id=current&&!shared?current.flow.id:v2Id(),audience={kind:'roles' as const,roleIds:[...new Set(roles)]}
  const prior=edited??(collectionCardScreen(app,node)?undefined:current?.flow)
  const flow:BuilderV2Workflow={...(prior??{name:'Нажатие на строку',steps:[{id:v2Id(),type:'notify' as const,message:{kind:'literal' as const,value:'Готово'}}]}),id,input:{rowTableId:context.rowTableId,screenTableId:context.screenTableId,formId:null}}
  return replaceNode({...app,workflows:[...app.workflows.filter(flow=>flow.id!==id),flow],policy:{tables:grantBuilderV2WorkflowWrites(app,flow,audience.roleIds),workflows:[...app.policy.workflows.filter(grant=>grant.workflowId!==id),{workflowId:id,audience}]}},{...node,events:{itemPress:id}})
}
export function configureBuilderV2ItemWorkflow(app:AppV2,nodeId:string,flow:BuilderV2Workflow){
  const roles=[...new Set(app.policy.workflows.filter(grant=>grant.workflowId===flow.id).flatMap(grant=>grant.audience.kind==='roles'?grant.audience.roleIds:[]))]
  if(!roles.length)throw new Error('Выберите роли, которым доступно действие')
  return configureBuilderV2ItemAction(app,nodeId,roles,flow)
}
