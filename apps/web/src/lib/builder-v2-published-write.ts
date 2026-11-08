import {loadBuilderV2ButtonSelection,verifyBuilderV2ButtonSelection} from './builder-v2-button-selection'
import {builderV2WorkingPath,builderV2ActionContext} from './builder-v2-working-scope'
import {db} from '@tableapp/db'
import {canInvokeAppV2Workflow,matchesAppV2Audience} from '@tableapp/schema/app-v2'
import {builderV2NodeAction} from './builder-v2-button-action'
import {builderV2DeleteAction} from './builder-v2-delete-action'
import {builderV2SaveFormAction} from './builder-v2-form-action'
import {withPublishedV2Read,publishedV2Context,publishedV2Definition,publishedV2Screen} from './builder-v2-published'
import {publishedV2Node} from './builder-v2-published-data'
import {publishedV2Row} from './builder-v2-published-rows'
import {loadBuilderV2ReadMetadata} from './builder-v2-row-data'
import {inspectPublishedV2Form} from './builder-v2-published-form'
import {builderV2WorkflowSteps} from './builder-v2-workflow-types'
import {builderV2WorkflowReceipt,commitBuilderV2Workflow} from './builder-v2-workflow-request'
import {builderV2Revision} from './builder-v2-revision'
import {mutationFields,RowWriteError,writeRows} from './row-mutations'
import type {BuilderV2ButtonScope,BuilderV2ButtonRequest,BuilderV2ActionResult} from './builder-v2-button-types'
import type {BuilderV2SubmitRequest} from './builder-v2-submit-types'
import type {BuilderV2FormRequest} from './builder-v2-form-types'
import type {Transaction} from './db-transaction'

async function publicButton(current:Awaited<ReturnType<typeof publishedV2Context>>,tx:Transaction,scope:BuilderV2ButtonScope,lock=false){
  const {app,actor}=current,screen=publishedV2Screen(app,actor,scope.screenId),context=builderV2ActionContext(app,scope.screenId,scope.nodeId),node=app.nodes.find(node=>node.id===scope.nodeId),deletion=node&&builderV2DeleteAction(app,node),action=node&&(builderV2NodeAction(app,node)??deletion)
  if(!actor.authenticated||!context||!node||!action||!canInvokeAppV2Workflow(app,actor,action.flow.id)||action.flow.input.rowTableId!==context.rowTableId||(action.flow.input.screenTableId??null)!==context.screenTableId||context.collection&&deletion)throw new RowWriteError('denied','Действие недоступно')
  const selection=await loadBuilderV2ButtonSelection(tx,app,actor,scope,true,lock)
  return {screen,node,action,deletion,selection}
}
async function publicButtonState(current:Awaited<ReturnType<typeof publishedV2Context>>,tx:Transaction,scope:BuilderV2ButtonScope,loaded:Awaited<ReturnType<typeof publicButton>>){
  const {app,actor,revision}=current,{screen,node,action,deletion}=loaded,checked=await verifyBuilderV2ButtonSelection(tx,app,actor,loaded.selection),selected=checked.selected?{stored:checked.selected,record:checked.record!}:undefined,table=current.tables.find(table=>table.id===checked.selected?.tableId)
  return {...loaded,selected,screenSelected:checked.screenSelected,state:{revision,fingerprint:builderV2Revision(['published-button',revision,actor,screen.id,node,action.flow,selected?.stored.version??null,scope.recordId??null,...(scope.itemId?[[scope.itemId,checked.screenSelected?.version,checked.visibilityRevision]]:[])]),recordLabel:checked.label,tableName:table?.name??null,actionName:action.flow.name,stepCount:builderV2WorkflowSteps(action.flow.steps).length,...(deletion?{kind:'delete' as const}:{})}}
}
export async function publishedV2ButtonState(current:Awaited<ReturnType<typeof publishedV2Context>>,tx:Transaction,scope:BuilderV2ButtonScope,lock=false){return publicButtonState(current,tx,scope,await publicButton(current,tx,scope,lock))}
export async function inspectPublishedV2Button(slug:string,scope:BuilderV2ButtonScope&{revision:string}){
  return withPublishedV2Read(async tx=>{const current=await publishedV2Context(slug,tx);if(current.revision!==scope.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.');return {ok:true as const,state:(await publishedV2ButtonState(current,tx,scope)).state}})
}
export async function inspectPublishedV2FormRequest(slug:string,request:BuilderV2FormRequest&{revision:string}){
  return withPublishedV2Read(async tx=>{const current=await publishedV2Context(slug,tx);if(current.revision!==request.revision)throw new RowWriteError('conflict','Приложение обновлено. Обновите страницу.');return inspectPublishedV2Form(current,tx,request)})
}
export async function submitPublishedV2(slug:string,kind:'form'|'button',request:BuilderV2SubmitRequest|BuilderV2ButtonRequest):Promise<BuilderV2ActionResult>{
  const definition=await publishedV2Definition(slug);if(!definition)throw new RowWriteError('missing','Приложение недоступно')
  return writeRows(definition.app.workspaceId,async context=>{
    const current=await publishedV2Context(slug,context.tx,true),{app,actor,revision}=current
    if(!actor.authenticated||!actor.id)throw new RowWriteError('denied','Для сохранения нужно войти')
    if(revision!==request.revision)return {ok:false,stale:true,error:'Приложение обновлено. Обновите страницу.'}
    if(kind==='button'){
      const buttonRequest=request as BuilderV2ButtonRequest,loaded=await publicButton(current,context.tx,buttonRequest,true)
      if(!builderV2NodeAction(app,loaded.node))throw new RowWriteError('denied','Подтвердите удаление отдельно')
      const ids=[...new Set([loaded.selection.context.rowTableId,loaded.screen.contextTableId,...builderV2WorkflowSteps(loaded.action.flow.steps).flatMap(step=>'tableId'in step?[step.tableId]:[])].filter((id):id is string=>Boolean(id)))].sort();for(const id of ids)await mutationFields(context,id)
      const hash=builderV2Revision(['published',kind,request]),receipt=await builderV2WorkflowReceipt(context,app.id,actor.id,request.requestId,hash,true)
      if(receipt)return receipt
      const state=await publicButtonState(current,context.tx,buttonRequest,loaded)
      if(state.state.fingerprint!==request.fingerprint)return {ok:false,stale:true,error:'Запись изменилась. Обновите список.'}
      return commitBuilderV2Workflow({context,app,actor,userId:actor.id,flow:loaded.action.flow,tables:current.tables,selected:loaded.selection.selected,screenSelected:loaded.selection.screenSelected??null,nodeId:loaded.node.id,requestId:request.requestId,revision,hash,published:true,confirmation:request.confirmation})
    }
    const nodeId='formId'in request?request.formId:request.nodeId,screen=publishedV2Screen(app,actor,request.screenId),node=app.nodes.find(node=>node.id===nodeId),action=node?.type==='form'?builderV2SaveFormAction(app,node):node?builderV2NodeAction(app,node):null
    if(!action||!canInvokeAppV2Workflow(app,actor,action.flow.id)||kind==='form'&&node?.type!=='form')throw new RowWriteError('denied','Действие недоступно')
    const ids=[...new Set([...(screen.contextTableId?[screen.contextTableId]:[]),...builderV2WorkflowSteps(action.flow.steps).flatMap(step=>'tableId'in step?[step.tableId]:[])])].sort();for(const id of ids)await mutationFields(context,id)
    const meta=await loadBuilderV2ReadMetadata(context.tx,app.workspaceId,ids),selected=screen.contextTableId?await publishedV2Row(meta,app,actor,screen.contextTableId,request.recordId,true,true):undefined
    if(Boolean(screen.contextTableId)!==Boolean(request.recordId))throw new RowWriteError('denied','Запись недоступна')
    const path=builderV2WorkingPath(app,screen.id,nodeId);if(!path||path.some(node=>node.visibleTo&&!matchesAppV2Audience(node.visibleTo,actor)))throw new RowWriteError('denied','Действие недоступно')
    const hash=builderV2Revision(['published',kind,request]),receipt=await builderV2WorkflowReceipt(context,app.id,actor.id,request.requestId,hash,true)
    if(receipt)return receipt
    if(selected?.stored.deletedAt)throw new RowWriteError('missing','Запись удалена или больше недоступна')
    publishedV2Node(app,actor,screen.id,nodeId,selected?.record)
    const formRequest=request as BuilderV2SubmitRequest,checked=await inspectPublishedV2Form(current,context.tx,{...formRequest,mode:'check'})
    if(!checked.ok)return checked
    if(!('state'in checked)||!checked.state||node?.type!=='form')throw new RowWriteError('invalid','Не удалось проверить форму')
    const save=builderV2SaveFormAction(app,node)!
    return commitBuilderV2Workflow({context,app,actor,userId:actor.id,flow:save.flow,tables:current.tables,selected:selected?.stored,form:{id:node.id,tableId:node.tableId,values:checked.state.values},primaryStepId:save.step.id,nodeId,requestId:request.requestId,revision,hash,published:true,confirmation:request.confirmation})
  })
}
