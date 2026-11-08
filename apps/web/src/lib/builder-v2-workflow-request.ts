import { builderActionRuns, builderWorkflowRuns,appActionRuns,appWorkflowRuns,rows } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, eq,isNull } from 'drizzle-orm'
import { RowWriteError, type RowTransaction } from './row-mutations'
import { BuilderV2WorkflowError, BuilderV2WorkflowConfirmationRequired, executeBuilderV2Workflow } from './builder-v2-workflow'
import type { BuilderV2ActionResult } from './builder-v2-button-types'
import {learningAfterFormSave} from './builder-learning'

export async function builderV2WorkflowReceipt(context: RowTransaction, appId: string, userId: string, requestId: string, hash: string,published=false): Promise<Extract<BuilderV2ActionResult,{ok:true}> | null> {
  const table=published?appActionRuns:builderActionRuns
  const [receipt] = await context.tx.select().from(table).where(and(eq(table.appId, appId), eq(table.userId, userId), eq(table.requestId, requestId)))
  if (!receipt) return null
  if (receipt.workspaceId !== context.workspaceId || receipt.payloadHash !== hash) throw new RowWriteError('conflict', 'Этот запрос уже использован с другими значениями. Обновите страницу.')
  return { ...(receipt.outcome as Extract<BuilderV2ActionResult,{ok:true}> | null), ok:true, ...(receipt.rowId ? {rowId:receipt.rowId} : {}), ...(receipt.tableId ? {tableId:receipt.tableId} : {}), repeated:true }
}

/** Shared transaction boundary for form-submit and button-press workflows. */
export async function commitBuilderV2Workflow(options: Omit<Parameters<typeof executeBuilderV2Workflow>[0], 'write'> & { context: RowTransaction; nodeId: string; requestId: string; revision: string; hash: string }): Promise<BuilderV2ActionResult> {
  const {context, app, userId, flow, nodeId, requestId, revision, hash} = options, {tx} = context
  const runs=options.published?appActionRuns:builderActionRuns,journal=options.published?appWorkflowRuns:builderWorkflowRuns
  const log = {workspaceId:app.workspaceId,appId:app.id,userId,requestId,definitionRevision:revision,workflowId:flow.id,workflowName:flow.name,eventNodeId:nodeId}
  let outcome: Extract<BuilderV2ActionResult,{ok:true}>
  try {
    outcome = await tx.transaction(async inner => {
      const nested = {...context,tx:inner,changed:new Set<string>(),fieldCache:new Map(context.fieldCache),memberAccess:new Map(context.memberAccess)}
      const result = await executeBuilderV2Workflow({...options,write:nested})
      return {...result,changed:nested.changed}
    }).then(result => { result.changed.forEach(id=>context.changed.add(id)); const {changed:_,...saved}=result; return {ok:true,repeated:false,...saved} })
  } catch (error) {
    if(error instanceof BuilderV2WorkflowConfirmationRequired)return {ok:false,error:error.message,confirmation:error.confirmation}
    if (!(error instanceof BuilderV2WorkflowError)) throw error
    await tx.insert(journal).values({id:newId('run'),...log,status:'failed',error:error.message,trace:error.trace})
    return {ok:false,error:error.message,stale:error.stale,trace:error.trace}
  }
  const {workflowName:_,...receiptLog}=log
  await tx.insert(runs).values({id:newId('run'),...receiptLog,payloadHash:hash,tableId:outcome.tableId ?? null,rowId:outcome.rowId ?? null,outcome})
  await tx.insert(journal).values({id:newId('run'),...log,status:'succeeded',trace:outcome.trace ?? []})
  if(!options.published&&options.form&&options.primaryStepId&&outcome.rowId&&outcome.tableId===options.form.tableId){const [active]=await tx.select({id:rows.id}).from(rows).where(and(eq(rows.id,outcome.rowId),isNull(rows.deletedAt)));if(active)await learningAfterFormSave(tx,app,{workspaceId:app.workspaceId,userId},options.form.id)}
  return outcome
}
