import {authorizeAppV2Write,type AppV2,type AppV2Actor,type AppV2Node,type AppV2Record} from '@tableapp/schema/app-v2'
import {grantBuilderV2Operation} from './builder-v2-action-policy'
import {builderV2ActionContext} from './builder-v2-working-scope'
import {replaceNode} from '@/components/builder/v2/model'

export function builderV2CanMove(app:AppV2,node:AppV2Node,actor:AppV2Actor,row:AppV2Record){
  return node.type==='collection'&&node.layout==='kanban'&&Boolean(node.groupFieldId)&&actor.authenticated&&Boolean(node.kanbanMoveRoleIds?.some(id=>actor.roleIds.includes(id)))&&authorizeAppV2Write(app,actor,{operation:'update',row,values:{[node.groupFieldId!]:row.values[node.groupFieldId!]??null}}).ok
}
export function configureBuilderV2BoardMove(app:AppV2,nodeId:string,roles:readonly string[]|null):AppV2{
  const node=app.nodes.find(node=>node.id===nodeId),context=app.screens.map(screen=>builderV2ActionContext(app,screen.id,nodeId)).find(Boolean)
  if(node?.type!=='collection'||node.layout!=='kanban'||!node.groupFieldId||!context?.source)throw new Error('Выберите канбан и поле статуса')
  if(!roles?.length)return replaceNode(app,{...node,kanbanMoveRoleIds:undefined})
  if(roles.some(id=>!app.roles.some(role=>role.id===id)))throw new Error('Выберите роль приложения')
  return replaceNode({...app,policy:{...app.policy,tables:grantBuilderV2Operation(app,context.source.tableId,roles,'update',[node.groupFieldId])}},{...node,kanbanMoveRoleIds:[...new Set(roles)]})
}
