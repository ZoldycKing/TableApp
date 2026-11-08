import { db } from '@tableapp/db'
import { canInvokeAppV2Workflow } from '@tableapp/schema/app-v2'
import { builderV2Revision } from './builder-v2-revision'
import { builderV2NodeAction } from './builder-v2-button-action'
import { builderV2WorkflowSteps } from './builder-v2-workflow-types'
import { workingBuilderV2Node } from './builder-v2-working'
import { mutationFields, RowWriteError, writeRows } from './row-mutations'
import { builderV2WorkflowReceipt, commitBuilderV2Workflow } from './builder-v2-workflow-request'
import {loadBuilderV2ButtonSelection,verifyBuilderV2ButtonSelection} from './builder-v2-button-selection'
import {builderV2ActionContext} from './builder-v2-working-scope'
import type { Transaction } from './db-transaction'
import type { Member } from './session'
import type { BuilderV2ActionResult, BuilderV2ButtonInspection, BuilderV2ButtonRequest, BuilderV2ButtonScope } from './builder-v2-button-types'

async function workingButton(tx:Transaction,appId:string,member:Member,scope:BuilderV2ButtonScope,lock=false){
  const current=await workingBuilderV2Node(tx,appId,member,scope.screenId,scope.nodeId,lock,true),action=builderV2NodeAction(current.app,current.node),context=builderV2ActionContext(current.app,scope.screenId,scope.nodeId)
  if(!action||!context||action.flow.input.rowTableId!==context.rowTableId||(action.flow.input.screenTableId??null)!==context.screenTableId||!canInvokeAppV2Workflow(current.app,current.actor,action.flow.id))throw new RowWriteError('denied','Действие не разрешено для вашей роли')
  const selection=await loadBuilderV2ButtonSelection(tx,current.app,current.actor,scope,false,lock)
  return {...current,action,selection}
}
async function buttonState(tx:Transaction,current:Awaited<ReturnType<typeof workingButton>>,scope:BuilderV2ButtonScope){
  const checked=await verifyBuilderV2ButtonSelection(tx,current.app,current.actor,current.selection),row=checked.selected,table=current.tables.find(table=>table.id===row?.tableId)
  return {row,screenSelected:checked.screenSelected,state:{revision:current.revision,fingerprint:builderV2Revision(['button',current.app.id,current.screen.id,current.node,current.action.flow,row?[row.id,row.version]:null,current.actor,...(scope.itemId?[[scope.itemId,checked.screenSelected?.id,checked.screenSelected?.version,checked.visibilityRevision]]:[])]),recordLabel:checked.label?.slice(0,200)??null,tableName:table?.name??null,actionName:current.action.flow.name,stepCount:builderV2WorkflowSteps(current.action.flow.steps).length}}
}
export async function inspectBuilderV2Button(appId:string,member:Member,scope:BuilderV2ButtonScope):Promise<BuilderV2ButtonInspection> {
  return db.transaction(async tx=>({ok:true,state:(await buttonState(tx,await workingButton(tx,appId,member,scope),scope)).state}),{isolationLevel:'repeatable read',accessMode:'read only'})
}
export async function submitBuilderV2Button(appId:string,member:Member,request:BuilderV2ButtonRequest):Promise<BuilderV2ActionResult> {
  return writeRows(member.workspaceId,async context=>{
    const current=await workingButton(context.tx,appId,member,request,true),hash=builderV2Revision(['button',request.screenId,request.nodeId,request.recordId??null,request.revision,request.fingerprint,...(request.itemId?[request.itemId]:[]),...(request.confirmation?[request.confirmation]:[])])
    const receipt=await builderV2WorkflowReceipt(context,appId,member.userId,request.requestId,hash)
    if(receipt) return receipt
    if(current.revision!==request.revision) return {ok:false,stale:true,error:'Настройки приложения изменились. Обновите действие.'}
    const tableIds=[...new Set([...[current.selection.context.rowTableId,current.screen.contextTableId].filter((id):id is string=>Boolean(id)),...builderV2WorkflowSteps(current.action.flow.steps).flatMap(step=>'tableId' in step?[step.tableId]:[])])].sort()
    for(const id of tableIds) await mutationFields(context,id)
    const {row,screenSelected,state}=await buttonState(context.tx,current,request)
    if(state.fingerprint!==request.fingerprint) return {ok:false,stale:true,error:'Запись изменилась после открытия. Обновите её перед выполнением.'}
    return commitBuilderV2Workflow({context,app:current.app,actor:current.actor,userId:member.userId,flow:current.action.flow,tables:current.tables,selected:row,screenSelected:screenSelected??null,nodeId:current.node.id,requestId:request.requestId,revision:current.revision,hash,confirmation:request.confirmation})
  })
}
