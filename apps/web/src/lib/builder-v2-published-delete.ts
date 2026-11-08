import {appActionRuns,appWorkflowRuns,rows} from '@tableapp/db'
import {newId} from '@tableapp/schema'
import {authorizeAppV2Write,canInvokeAppV2Workflow,canOpenAppV2Screen,type AppV2Json} from '@tableapp/schema/app-v2'
import {and,eq,isNull,ne,sql} from 'drizzle-orm'
import {publishedV2Context,publishedV2Definition,publishedV2Screen,withPublishedV2Read} from './builder-v2-published'
import {publishedV2Node} from './builder-v2-published-data'
import {canReadPublishedV2Row,derivePublishedV2Rows} from './builder-v2-published-rows'
import {builderV2Json,loadBuilderV2ReadMetadata} from './builder-v2-row-data'
import {builderV2DeleteAction} from './builder-v2-delete-action'
import {builderV2Revision} from './builder-v2-revision'
import {builderV2WorkflowReceipt} from './builder-v2-workflow-request'
import {dependentRows} from './production-cascade'
import {deleteRow,mutationFields,RowWriteError,writeRows} from './row-mutations'
import type {Transaction} from './db-transaction'
import type {BuilderV2DeleteScope,BuilderV2DeleteRequest,BuilderV2DeleteInspection} from './builder-v2-delete-types'
import type {BuilderV2ActionResult} from './builder-v2-button-types'
import type {RuntimeSourceRow} from './runtime-project'

async function target(tx:Transaction,current:Awaited<ReturnType<typeof publishedV2Context>>,scope:BuilderV2DeleteScope,lock=false){
  const {app,actor}=current,screen=publishedV2Screen(app,actor,scope.screenId)
  if(!actor.authenticated||!actor.id||!screen.contextTableId)throw new RowWriteError('denied','Удаление недоступно')
  const meta=await loadBuilderV2ReadMetadata(tx,app.workspaceId,[screen.contextTableId]),query=tx.select().from(rows).where(and(eq(rows.tableId,screen.contextTableId),eq(rows.id,scope.recordId))),[row]=lock?await query.for('update'):await query
  if(!row||!canReadPublishedV2Row(app,actor,row as RuntimeSourceRow))throw new RowWriteError('missing','Запись недоступна')
  const [derived]=await derivePublishedV2Rows(meta,app,actor,[row as RuntimeSourceRow]),record={id:row.id,tableId:row.tableId,values:builderV2Json(derived!.data) as Record<string,AppV2Json>,display:derived!.display}
  const node=publishedV2Node(app,actor,screen.id,scope.nodeId,record),action=builderV2DeleteAction(app,node)
  if(!action||action.step.tableId!==screen.contextTableId||!canInvokeAppV2Workflow(app,actor,action.flow.id))throw new RowWriteError('denied','Удаление не разрешено вашей роли')
  const permission=authorizeAppV2Write(app,actor,{operation:'delete',row:{id:row.id,tableId:row.tableId,values:row.data as Record<string,AppV2Json>}})
  if(!permission.ok)throw new RowWriteError('denied','Удаление не разрешено вашей роли')
  const table=current.tables.find(table=>table.id===row.tableId),primary=table?.primaryFieldId
  return {row,meta,node,action,state:{revision:current.revision,fingerprint:builderV2Revision(['published-delete',current.revision,actor,screen.id,node,action.flow,row.id,row.version]),recordLabel:(primary?record.display[primary]:'')?.slice(0,200)||'Запись',tableName:table?.name??'Таблица'}}
}
async function checkDependencies(tx:Transaction,value:Awaited<ReturnType<typeof target>>,lock=false){
  const {row,meta}=value,message='Эту запись нельзя удалить из приложения: с ней связаны другие данные. Обратитесь к владельцу.'
  if((await dependentRows(row.tableId,row.id,tx,lock))?.rows.length)throw new RowWriteError('invalid',message)
  for(const field of meta.allFields.filter(field=>field.type==='relation'&&field.options.tableId===row.tableId)){
    const [linked]=await tx.select({id:rows.id}).from(rows).where(and(eq(rows.tableId,field.tableId),ne(rows.id,row.id),isNull(rows.deletedAt),sql`${rows.data}->${field.id} @> ${JSON.stringify([row.id])}::jsonb`)).limit(1)
    if(linked)throw new RowWriteError('invalid',message)
  }
}
export async function inspectPublishedV2Delete(slug:string,request:BuilderV2DeleteScope&{revision:string}):Promise<BuilderV2DeleteInspection>{
  return withPublishedV2Read(async tx=>{const current=await publishedV2Context(slug,tx);if(current.revision!==request.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.');const value=await target(tx,current,request);if(value.row.deletedAt)throw new RowWriteError('missing','Запись недоступна');await checkDependencies(tx,value);return {ok:true,state:value.state}})
}
export async function submitPublishedV2Delete(slug:string,request:BuilderV2DeleteRequest):Promise<BuilderV2ActionResult>{
  if(request.confirmed!==true)throw new RowWriteError('invalid','Подтвердите удаление записи')
  const definition=await publishedV2Definition(slug);if(!definition)throw new RowWriteError('missing','Приложение недоступно')
  return writeRows(definition.app.workspaceId,async context=>{
    const current=await publishedV2Context(slug,context.tx,true),{app,actor}=current
    if(current.revision!==request.revision)return {ok:false,stale:true,error:'Приложение обновлено. Обновите страницу.'}
    const screen=publishedV2Screen(app,actor,request.screenId);if(!screen.contextTableId)throw new RowWriteError('denied','Удаление недоступно')
    await mutationFields(context,screen.contextTableId)
    const value=await target(context.tx,current,request,true),hash=builderV2Revision(['published-delete',request]),receipt=await builderV2WorkflowReceipt(context,app.id,actor.id!,request.requestId,hash,true)
    if(receipt)return receipt
    if(value.row.deletedAt)throw new RowWriteError('missing','Запись недоступна')
    if(value.state.fingerprint!==request.fingerprint)return {ok:false,stale:true,error:'Запись изменилась. Обновите её перед удалением.'}
    await checkDependencies(context.tx,value,true)
    await deleteRow(context,value.row.tableId,value.row.id,{id:actor.id!,kind:'app_user'},{baseVersion:value.row.version})
    const home=app.screens.find(screen=>screen.navigation&&!screen.contextTableId&&canOpenAppV2Screen(app,actor,screen.id)),trace=[{stepId:value.action.step.id,label:'Удалить запись',status:'done' as const}],effects=[{type:'notify' as const,message:'Запись удалена'},...(home?[{type:'open_screen' as const,screenId:home.id}]:[])]
    const outcome={ok:true as const,repeated:false,rowId:value.row.id,tableId:value.row.tableId,trace,effects},log={workspaceId:app.workspaceId,appId:app.id,userId:actor.id!,requestId:request.requestId,definitionRevision:current.revision,workflowId:value.action.flow.id,eventNodeId:value.node.id}
    await context.tx.insert(appActionRuns).values({id:newId('run'),...log,payloadHash:hash,rowId:value.row.id,tableId:value.row.tableId,outcome})
    await context.tx.insert(appWorkflowRuns).values({id:newId('run'),...log,workflowName:value.action.flow.name,status:'succeeded',trace})
    return outcome
  })
}
