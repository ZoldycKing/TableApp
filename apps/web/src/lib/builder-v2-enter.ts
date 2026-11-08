import {db} from '@tableapp/db'
import {canInvokeAppV2Workflow} from '@tableapp/schema/app-v2'
import {builderV2EnterAction} from './builder-v2-enter-action'
import {publishedV2Context,publishedV2Definition,publishedV2Screen,withPublishedV2Read} from './builder-v2-published'
import {publishedV2Row} from './builder-v2-published-rows'
import {workingBuilderV2Screen,workingBuilderV2Record} from './builder-v2-working'
import {builderV2Revision} from './builder-v2-revision'
import {builderV2WorkflowSteps} from './builder-v2-workflow-types'
import {builderV2WorkflowReceipt,commitBuilderV2Workflow} from './builder-v2-workflow-request'
import {loadBuilderV2ReadMetadata,deriveBuilderV2Rows} from './builder-v2-row-data'
import {builderV2CalculationPlan} from './builder-v2-read-plan'
import {RowWriteError,mutationFields,writeRows,type StoredRow} from './row-mutations'
import {canEdit,type Member} from './session'
import {restrictedTables} from './table-permissions'
import type {Transaction} from './db-transaction'
import type {BuilderV2EnterRequest,BuilderV2EnterScope,BuilderV2EnterState} from './builder-v2-enter-types'

async function entry(tx:Transaction,source:string|Member,appId:string,scope:BuilderV2EnterScope,lock=false){
  const published=typeof source==='string'
  if(!published&&(!canEdit(source)||restrictedTables(source)))throw new RowWriteError('denied','Проверка действия доступна редактору пространства')
  const current=published?await publishedV2Context(source,tx,lock):await workingBuilderV2Screen(tx,appId,source,scope.screenId,lock),{app,actor,revision,tables}=current
  const screen=publishedV2Screen(app,actor,scope.screenId),action=builderV2EnterAction(app,screen.id)
  if(!actor.authenticated||!actor.id||!action||!canInvokeAppV2Workflow(app,actor,action.flow.id))throw new RowWriteError('denied','Действие при открытии недоступно вашей роли')
  if(Boolean(screen.contextTableId)!==Boolean(scope.recordId))throw new RowWriteError('denied','Откройте нужную запись из списка')
  return {app,actor,revision,tables,screen,flow:action.flow,published}
}
type Current=Awaited<ReturnType<typeof entry>>
async function state(tx:Transaction,current:Current,scope:BuilderV2EnterScope,lock=false,includeDeleted=false){
  let selected:StoredRow|undefined,label:string|null=null
  const {app,actor,screen,flow,revision}=current,table=current.tables.find(table=>table.id===screen.contextTableId)
  if(screen.contextTableId){
    if(current.published){const loaded=await publishedV2Row(await loadBuilderV2ReadMetadata(tx,app.workspaceId,[screen.contextTableId]),app,actor,screen.contextTableId,scope.recordId,lock,includeDeleted);selected=loaded.stored;label=table?.primaryFieldId?loaded.record.display[table.primaryFieldId]??'Запись':'Запись'}
    else{selected=await workingBuilderV2Record(tx,screen.contextTableId,scope.recordId,lock,includeDeleted);const meta=await loadBuilderV2ReadMetadata(tx,app.workspaceId,[screen.contextTableId]),primary=meta.primaryByTable.get(screen.contextTableId),plan=builderV2CalculationPlan(meta.fieldsByTable,meta.primaryByTable,new Map([[screen.contextTableId,new Set(primary?[primary]:[])]])),[record]=await deriveBuilderV2Rows(meta,[selected as import('./runtime-project').RuntimeSourceRow],plan,Date.now());label=primary?record?.display[primary]??'Запись':'Запись'}
  }
  const result:BuilderV2EnterState={revision,fingerprint:builderV2Revision(['screen-enter',current.published,revision,actor,screen.id,flow,selected?[selected.id,selected.version]:null]),recordLabel:label?.slice(0,200)??null,tableName:table?.name??null,actionName:flow.name,stepCount:builderV2WorkflowSteps(flow.steps).length}
  return {selected,state:result}
}
export async function publishedV2EnterState(current:Awaited<ReturnType<typeof publishedV2Context>>,tx:Transaction,scope:BuilderV2EnterScope){
  const action=builderV2EnterAction(current.app,scope.screenId)
  if(!current.actor.authenticated||!action||!canInvokeAppV2Workflow(current.app,current.actor,action.flow.id))return undefined
  return (await state(tx,{...current,screen:publishedV2Screen(current.app,current.actor,scope.screenId),flow:action.flow,published:true},scope)).state
}
export async function inspectBuilderV2Enter(appId:string,member:Member,scope:BuilderV2EnterScope){return db.transaction(async tx=>({ok:true as const,state:(await state(tx,await entry(tx,member,appId,scope),scope)).state}),{isolationLevel:'repeatable read',accessMode:'read only'})}
export async function inspectPublishedV2Enter(slug:string,scope:BuilderV2EnterScope&{revision:string}){return withPublishedV2Read(async tx=>{const current=await entry(tx,slug,'',scope);if(current.revision!==scope.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.');return {ok:true as const,state:(await state(tx,current,scope)).state}})}
export async function submitBuilderV2Enter(appId:string,source:Member|string,request:BuilderV2EnterRequest){
  const workspaceId=typeof source==='string'?(await publishedV2Definition(source))?.app.workspaceId:source.workspaceId
  if(!workspaceId)throw new RowWriteError('missing','Приложение недоступно')
  return writeRows(workspaceId,async context=>{
    const current=await entry(context.tx,source,appId,request,true),{app,actor,revision,screen,flow,published}=current
    if(revision!==request.revision)return {ok:false as const,stale:true,error:'Настройки приложения изменились. Обновите страницу.'}
    const hash=builderV2Revision(['screen-enter',request])
    const ids=[...new Set([...(screen.contextTableId?[screen.contextTableId]:[]),...builderV2WorkflowSteps(flow.steps).flatMap(step=>'tableId'in step?[step.tableId]:[])])].sort();for(const id of ids)await mutationFields(context,id)
    const checked=await state(context.tx,current,request,true,true),receipt=await builderV2WorkflowReceipt(context,app.id,actor.id!,request.requestId,hash,published)
    if(receipt)return receipt
    if(checked.selected?.deletedAt)throw new RowWriteError('missing','Запись удалена или больше недоступна')
    if(checked.state.fingerprint!==request.fingerprint)return {ok:false as const,stale:true,error:'Запись изменилась. Обновите страницу перед выполнением.'}
    return commitBuilderV2Workflow({context,app,actor,userId:actor.id!,flow,tables:current.tables,selected:checked.selected,nodeId:screen.id,requestId:request.requestId,revision,hash,published,confirmation:request.confirmation})
  })
}
