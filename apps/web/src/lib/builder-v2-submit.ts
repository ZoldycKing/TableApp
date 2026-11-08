import { db } from '@tableapp/db'
import { authorizeAppV2Write, canInvokeAppV2Workflow, type AppV2Json } from '@tableapp/schema/app-v2'
import { builderV2Revision } from './builder-v2'
import { builderV2SaveFormAction } from './builder-v2-form-action'
import { inspectBuilderV2Form } from './builder-v2-form'
import type { BuilderV2FormRequest, BuilderV2FormScope } from './builder-v2-form-types'
import type { BuilderV2SubmitRequest, BuilderV2SubmitResult } from './builder-v2-submit-types'
import type { Member } from './session'
import type { Transaction } from './db-transaction'
import { mutationFields, RowWriteError, writeRows, type StoredRow } from './row-mutations'
import { workingBuilderV2Node, workingBuilderV2Record } from './builder-v2-working'
import { builderV2WorkflowReceipt, commitBuilderV2Workflow } from './builder-v2-workflow-request'
import { builderV2WorkflowSteps } from './builder-v2-workflow-types'

/** This first execution surface is private to full workspace editors, with additional app-role checks. */
async function workingForm(tx: Transaction, appId: string, member: Member, scope: BuilderV2FormScope, lock = false) {
  const current = await workingBuilderV2Node(tx, appId, member, scope.screenId, scope.formId, lock), { app, actor, node: form, screen } = current
  if (form.type !== 'form' || form.mode === 'edit' && screen.contextTableId !== form.tableId) throw new RowWriteError('invalid', 'Разместите форму редактирования в карточке её таблицы')
  const action = builderV2SaveFormAction(app, form)
  if (!action || !canInvokeAppV2Workflow(app, actor, action.flow.id)) throw new RowWriteError('denied', 'Сохранение формы не разрешено для вашей роли')
  return { ...current, form, action }
}
function authorizeForm(current: Awaited<ReturnType<typeof workingForm>>, values: Record<string, AppV2Json>, row?: StoredRow) {
  if (current.form.mode === 'edit' && !row) throw new RowWriteError('missing', 'Сначала откройте запись из списка')
  const decision = authorizeAppV2Write(current.app, current.actor, current.form.mode === 'edit' && row ? { operation: 'update', row: { id: row.id, tableId: row.tableId, values: row.data as Record<string, AppV2Json> }, values } : { operation: 'create', tableId: current.form.tableId, values })
  if (!decision.ok) throw new RowWriteError('denied', decision.error)
  return decision
}

export async function inspectWorkingBuilderV2Form(appId: string, member: Member, request: BuilderV2FormRequest) {
  return db.transaction(async tx => {
    const current = await workingForm(tx, appId, member, request)
    const row = current.form.mode === 'edit' ? await workingBuilderV2Record(tx, current.form.tableId, request.recordId) : undefined
    authorizeForm(current, Object.fromEntries(Object.keys(current.action.step.values).map(id => [id, null])), row)
    const result = await inspectBuilderV2Form(current.app, member, request, { transaction: tx, actor: current.actor })
    return result.ok && 'state' in result ? { ok: true as const, state: { ...result.state, revision: current.revision } } : result
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}

export async function submitBuilderV2Form(appId: string, member: Member, request: BuilderV2SubmitRequest): Promise<BuilderV2SubmitResult> {
  return writeRows(member.workspaceId, async context => {
    const { tx } = context, current = await workingForm(tx, appId, member, request, true)
    const hash = builderV2Revision([request.screenId, request.formId, request.recordId ?? null, request.revision, request.fingerprint, request.values,...(request.confirmation?[request.confirmation]:[])])
    const receipt = await builderV2WorkflowReceipt(context, appId, member.userId, request.requestId, hash)
    if (receipt) {
      if (!receipt.rowId || !receipt.tableId) throw new RowWriteError('conflict', 'Результат запроса относится к другому действию')
      return {...receipt,rowId:receipt.rowId,tableId:receipt.tableId}
    }
    if (current.revision !== request.revision) return { ok: false, stale: true, error: 'Настройки приложения изменились. Обновите форму перед сохранением.' }
    const tableIds = [...new Set([current.form.tableId, ...(current.screen.contextTableId ? [current.screen.contextTableId] : []), ...builderV2WorkflowSteps(current.action.flow.steps).flatMap(step => 'tableId' in step ? [step.tableId] : [])])].sort()
    for (const id of tableIds) await mutationFields(context, id)
    const selected = current.screen.contextTableId ? await workingBuilderV2Record(tx, current.screen.contextTableId, request.recordId, true) : undefined
    const row = current.form.mode === 'edit' ? selected : undefined
    authorizeForm(current, Object.fromEntries(Object.keys(current.action.step.values).map(id => [id, null])), row)
    const checked = await inspectBuilderV2Form(current.app, member, { ...request, mode: 'check' }, { transaction: tx, actor: current.actor })
    if (!checked.ok) return checked
    if (!('state' in checked)) throw new RowWriteError('invalid', 'Не удалось проверить форму')
    const values = Object.fromEntries(Object.keys(current.action.step.values).map(id => [id, checked.state.values[id]!]))
    authorizeForm(current, values, row)
    const outcome = await commitBuilderV2Workflow({context, app:current.app, actor:current.actor, userId:member.userId, flow:current.action.flow, tables:current.tables, selected, form:{id:current.form.id,tableId:current.form.tableId,values:checked.state.values},primaryStepId:current.action.step.id,nodeId:current.form.id,requestId:request.requestId,revision:current.revision,hash,confirmation:request.confirmation})
    if (!outcome.ok) return outcome
    if (!outcome.rowId || !outcome.tableId) throw new RowWriteError('invalid','Действие не сохранило форму')
    return {...outcome,rowId:outcome.rowId,tableId:outcome.tableId}
  })
}
