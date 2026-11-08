import {db} from '@tableapp/db'
import type {AppV2,AppV2Actor,AppV2Json} from '@tableapp/schema/app-v2'
import {builderV2CanMove} from './builder-v2-board-policy'
import {workingBuilderV2Node} from './builder-v2-working'
import {loadBuilderV2ButtonSelection,verifyBuilderV2ButtonSelection} from './builder-v2-button-selection'
import {builderV2Revision} from './builder-v2-revision'
import {mutationFields,RowWriteError,writeRows} from './row-mutations'
import {builderV2WorkflowReceipt,commitBuilderV2Workflow} from './builder-v2-workflow-request'
import {publishedV2Context,publishedV2Definition,publishedV2Screen,withPublishedV2Read} from './builder-v2-published'
import {publishedV2Fields} from './builder-v2-published-rows'
import type {BuilderV2Table} from './builder-v2'
import type {Member} from './session'
import type {Transaction} from './db-transaction'
import type {BuilderV2BoardScope,BuilderV2BoardRequest,BuilderV2BoardInspection} from './builder-v2-board-types'

async function load(tx:Transaction,current:{app:AppV2;actor:AppV2Actor;revision:string;tables:readonly BuilderV2Table[]},scope:BuilderV2BoardScope,published:boolean,lock=false){
  const {app,actor}=current,node=app.nodes.find(node=>node.id===scope.nodeId)
  if(node?.type!=='collection'||node.layout!=='kanban'||!node.groupFieldId||!node.kanbanMoveRoleIds?.some(id=>actor.roleIds.includes(id))||!actor.authenticated)throw new RowWriteError('denied','Смена статуса недоступна для вашей роли')
  const selected=await loadBuilderV2ButtonSelection(tx,app,actor,scope,published,lock),row=selected.selected,field=current.tables.find(table=>table.id===selected.context.source?.tableId)?.fields.find(field=>field.id===node.groupFieldId)
  if(!row||field?.type!=='single_select'||!builderV2CanMove(app,node,actor,{id:row.id,tableId:row.tableId,values:row.data as Record<string,AppV2Json>})||published&&!publishedV2Fields(app,actor,row as import('./runtime-project').RuntimeSourceRow).has(field.id))throw new RowWriteError('denied','Статус этой записи нельзя изменить')
  return {...current,node,selected,field,row}
}
async function inspect(tx:Transaction,current:Awaited<ReturnType<typeof load>>,scope:BuilderV2BoardScope){
  const checked=await verifyBuilderV2ButtonSelection(tx,current.app,current.actor,current.selected),value=(current.row.data as Record<string,unknown>)[current.field.id]
  return {revision:current.revision,fingerprint:builderV2Revision(['board-move',current.app.id,[scope.screenId,scope.nodeId,scope.itemId,scope.recordId??null],current.node,current.actor,current.field,current.row.version,checked.screenSelected?.version,checked.visibilityRevision]),recordLabel:checked.label??'Запись',value:typeof value==='string'?value:null,choices:current.field.choices??[]}
}
export async function inspectBuilderV2BoardMove(appId:string,member:Member,scope:BuilderV2BoardScope):Promise<BuilderV2BoardInspection>{
  return db.transaction(async tx=>{const current=await workingBuilderV2Node(tx,appId,member,scope.screenId,scope.nodeId,false,true);return {ok:true,state:await inspect(tx,await load(tx,current,scope,false),scope)}},{isolationLevel:'repeatable read',accessMode:'read only'})
}
export async function inspectPublishedV2BoardMove(slug:string,scope:BuilderV2BoardScope&{revision:string}):Promise<BuilderV2BoardInspection>{
  return withPublishedV2Read(async tx=>{const current=await publishedV2Context(slug,tx);publishedV2Screen(current.app,current.actor,scope.screenId);if(current.revision!==scope.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите список.');return {ok:true,state:await inspect(tx,await load(tx,current,scope,true),scope)}})
}
async function move(context:Parameters<typeof commitBuilderV2Workflow>[0]['context'],current:Awaited<ReturnType<typeof load>>,request:BuilderV2BoardRequest,userId:string,published:boolean){
  const hash=builderV2Revision(['board-move',request]),receipt=await builderV2WorkflowReceipt(context,current.app.id,userId,request.requestId,hash,published)
  if(receipt)return receipt
  if(current.revision!==request.revision)return {ok:false as const,stale:true,error:'Настройки изменились. Обновите список.'}
  const fields=await mutationFields(context,current.row.tableId),actual=fields.find(field=>field.id===current.field.id)
  if(actual?.type!=='single_select'||builderV2Revision(actual.options.choices.map(({id,name})=>({id,name})))!==builderV2Revision(current.field.choices??[]))throw new RowWriteError('conflict','Поле статуса изменилось. Обновите канбан.')
  const state=await inspect(context.tx,current,request)
  if(state.fingerprint!==request.fingerprint)return {ok:false as const,stale:true,error:'Запись изменилась. Обновите список.'}
  const choice=request.value===null?null:state.choices.find(choice=>choice.id===request.value)
  if(request.value!==null&&!choice)throw new RowWriteError('invalid','Этот статус больше недоступен')
  const flow:AppV2['workflows'][number]={id:current.node.id,name:'Изменить статус',input:{rowTableId:current.row.tableId,screenTableId:current.selected.context.screenTableId,formId:null},steps:[{id:'board-status',type:'update_row',tableId:current.row.tableId,target:{kind:'current'},values:{[current.field.id]:{kind:'literal',value:request.value}}},{id:'board-notice',type:'notify',message:{kind:'literal',value:choice?`Статус изменён: ${choice.name}`:'Статус снят'}}]}
  return commitBuilderV2Workflow({context,app:current.app,actor:current.actor,userId,flow,tables:current.tables,selected:current.row,screenSelected:current.selected.screenSelected??null,nodeId:current.node.id,requestId:request.requestId,revision:current.revision,hash,published})
}
export async function moveBuilderV2Board(appId:string,member:Member,request:BuilderV2BoardRequest){
  return writeRows(member.workspaceId,async context=>{const current=await workingBuilderV2Node(context.tx,appId,member,request.screenId,request.nodeId,true,true);return move(context,await load(context.tx,current,request,false,true),request,member.userId,false)})
}
export async function movePublishedV2Board(slug:string,request:BuilderV2BoardRequest){
  const definition=await publishedV2Definition(slug);if(!definition)throw new RowWriteError('denied','Приложение недоступно')
  return writeRows(definition.app.workspaceId,async context=>{const current=await publishedV2Context(slug,context.tx,true);publishedV2Screen(current.app,current.actor,request.screenId);if(current.revision!==request.revision)return {ok:false as const,stale:true,error:'Приложение обновлено. Обновите список.'};return move(context,await load(context.tx,current,request,true,true),request,current.actor.id!,true)})
}
