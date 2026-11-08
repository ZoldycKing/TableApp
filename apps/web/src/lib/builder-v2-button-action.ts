import {builderV2DeleteAction} from './builder-v2-delete-action'
import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import { nodeContext, replaceNode, v2Id } from '@/components/builder/v2/model'
import { builderV2ScreenNodes } from './builder-v2-data-types'
import { builderV2ButtonContext } from './builder-v2-working-scope'
import { builderV2ExecutableWorkflow, type BuilderV2Workflow } from './builder-v2-workflow-types'
import { grantBuilderV2WorkflowWrites } from './builder-v2-form-action'

export function builderV2ButtonAction(app: AppV2, node: AppV2Node) {
  if (node.type !== 'button'||builderV2DeleteAction(app,node)) return null
  const flow=app.workflows.find(flow=>flow.id===node.events.press)
  return flow && flow.steps.length && flow.input.formId===null && builderV2ExecutableWorkflow(flow) ? {flow} : null
}
export function builderV2NodeAction(app:AppV2,node:AppV2Node){if(node.type==='button')return builderV2ButtonAction(app,node);if(node.type!=='collection')return null;const flow=app.workflows.find(flow=>flow.id===node.events.itemPress),source=app.sources.find(source=>source.id===node.sourceId);return flow&&source&&flow.steps.length&&flow.input.formId===null&&flow.input.rowTableId===source.tableId&&builderV2ExecutableWorkflow(flow)?{flow}:null}
export function configureBuilderV2Button(app: AppV2, nodeId: string, roleIds: readonly string[] | null, edited?: BuilderV2Workflow): AppV2 {
  const node=app.nodes.find(node=>node.id===nodeId),screen=app.screens.find(screen=>builderV2ScreenNodes(app,screen.id).some(node=>node.id===nodeId))
  if (node?.type!=='button' || !screen) throw new Error('Выберите кнопку')
  const current=builderV2ButtonAction(app,node), shared=current && (app.nodes.some(item=>item.id!==node.id && 'events' in item && Object.values(item.events).includes(current.flow.id))||app.screens.some(screen=>screen.events.enter===current.flow.id))
  if (node.events.press && !current) throw new Error('Сначала отключите другое действие кнопки')
  if (!roleIds?.length) {
    const next=current&&!shared?{...app,workflows:app.workflows.filter(flow=>flow.id!==current.flow.id),policy:{...app.policy,workflows:app.policy.workflows.filter(grant=>grant.workflowId!==current.flow.id)}}:app
    return replaceNode(next,{...node,events:{press:null}})
  }
  if (roleIds.some(id=>!app.roles.some(role=>role.id===id))) throw new Error('Выберите роль приложения')
  const context=nodeContext(app,screen.id,node.id)
  if (!builderV2ButtonContext(app,screen.id,node.id) || context.formId) throw new Error('Разместите кнопку на экране, в карточке или в строке списка, вне формы')
  if (edited && (!current || edited.id!==current.flow.id || !edited.steps.length || !builderV2ExecutableWorkflow(edited))) throw new Error('Выберите действие этой кнопки')
  const id=current&&!shared?current.flow.id:v2Id(),audience={kind:'roles' as const,roleIds:[...new Set(roleIds)]}
  const flow:BuilderV2Workflow={...(edited??current?.flow??{name:node.label==='Кнопка'?'Действие кнопки':node.label,steps:[{id:v2Id(),type:'notify' as const,message:{kind:'literal' as const,value:'Готово'}}]}),id,input:{rowTableId:context.rowTableId,screenTableId:screen.contextTableId,formId:null}}
  return replaceNode({...app,workflows:[...app.workflows.filter(flow=>flow.id!==id),flow],policy:{tables:grantBuilderV2WorkflowWrites(app,flow,audience.roleIds),workflows:[...app.policy.workflows.filter(grant=>grant.workflowId!==id),{workflowId:id,audience}]}},{...node,events:{press:id}})
}
export function configureBuilderV2ButtonWorkflow(app:AppV2,nodeId:string,flow:BuilderV2Workflow) {
  const roles=[...new Set(app.policy.workflows.filter(grant=>grant.workflowId===flow.id).flatMap(grant=>grant.audience.kind==='roles'?grant.audience.roleIds:[]))]
  if (!roles.length) throw new Error('Выберите роли, которым доступно действие')
  return configureBuilderV2Button(app,nodeId,roles,flow)
}
