import { builderActionRuns, db } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { authorizeAppV2Write, canInvokeAppV2Workflow, type AppV2Json } from '@tableapp/schema/app-v2'
import { and, eq } from 'drizzle-orm'
import { builderV2Revision } from './builder-v2-revision'
import { builderV2DeleteAction } from './builder-v2-delete-action'
import { workingBuilderV2Node, workingBuilderV2Record } from './builder-v2-working'
import { deleteRow, mutationFields, RowWriteError, writeRows } from './row-mutations'
import { dependentRows } from './production-cascade'
import type { Transaction } from './db-transaction'
import type { Member } from './session'
import type { BuilderV2DeleteRequest, BuilderV2DeleteScope, BuilderV2DeleteInspection } from './builder-v2-delete-types'
import type { BuilderV2SubmitResult } from './builder-v2-submit-types'

async function workingDelete(tx: Transaction, appId: string, member: Member, scope: BuilderV2DeleteScope, lock = false) {
  const current = await workingBuilderV2Node(tx, appId, member, scope.screenId, scope.nodeId, lock), action = builderV2DeleteAction(current.app, current.node)
  if (!action || action.step.tableId !== current.screen.contextTableId || !canInvokeAppV2Workflow(current.app, current.actor, action.flow.id)) throw new RowWriteError('denied', 'Удаление не разрешено для вашей роли')
  return { ...current, action }
}
async function deletionState(tx: Transaction, current: Awaited<ReturnType<typeof workingDelete>>, scope: BuilderV2DeleteScope, lock = false) {
  const row = await workingBuilderV2Record(tx, current.action.step.tableId, scope.recordId, lock)
  const permission = authorizeAppV2Write(current.app, current.actor, { operation: 'delete', row: { id: row.id, tableId: row.tableId, values: row.data as Record<string, AppV2Json> } })
  if (!permission.ok) throw new RowWriteError('denied', permission.error)
  // Generic deletion must not silently remove a second table through a legacy cascade.
  if ((await dependentRows(row.tableId, row.id, tx, lock))?.rows.length) throw new RowWriteError('invalid', 'У записи есть зависимые данные. Удаление доступно через соответствующий раздел учёта.')
  const table = current.tables.find(table => table.id === row.tableId), label = table?.primaryFieldId ? (row.data as Record<string, unknown>)[table.primaryFieldId] : null
  return { row, state: { revision: current.revision, fingerprint: builderV2Revision([current.app.id, current.screen.id, current.node, current.action.flow, row.id, row.version, current.actor]), recordLabel: typeof label === 'string' || typeof label === 'number' ? String(label).slice(0, 200) || 'Без названия' : 'Без названия', tableName: table?.name ?? 'Таблица' } }
}
export async function inspectBuilderV2Delete(appId: string, member: Member, scope: BuilderV2DeleteScope): Promise<BuilderV2DeleteInspection> {
  return db.transaction(async tx => ({ ok: true, state: (await deletionState(tx, await workingDelete(tx, appId, member, scope), scope)).state }), { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
export async function submitBuilderV2Delete(appId: string, member: Member, request: BuilderV2DeleteRequest): Promise<BuilderV2SubmitResult> {
  return writeRows(member.workspaceId, async context => {
    const { tx } = context, current = await workingDelete(tx, appId, member, request, true)
    if (request.confirmed !== true) throw new RowWriteError('invalid', 'Подтвердите удаление записи')
    const hash = builderV2Revision(['delete', request.screenId, request.nodeId, request.recordId, request.revision, request.fingerprint, request.confirmed])
    const [receipt] = await tx.select().from(builderActionRuns).where(and(eq(builderActionRuns.appId, appId), eq(builderActionRuns.userId, member.userId), eq(builderActionRuns.requestId, request.requestId)))
    if (receipt) {
      if (receipt.workspaceId !== member.workspaceId || receipt.payloadHash !== hash) throw new RowWriteError('conflict', 'Этот запрос уже использован с другими значениями. Обновите запись.')
      if (!receipt.rowId || !receipt.tableId) throw new RowWriteError('conflict', 'Результат запроса относится к другому действию')
      return { ok: true, rowId: receipt.rowId, tableId: receipt.tableId, repeated: true }
    }
    if (current.revision !== request.revision) return { ok: false, stale: true, error: 'Настройки приложения изменились. Обновите запись.' }
    await mutationFields(context, current.action.step.tableId)
    const { row, state } = await deletionState(tx, current, request, true)
    if (request.fingerprint !== state.fingerprint) return { ok: false, stale: true, error: 'Запись изменилась после открытия. Обновите её перед удалением.' }
    await deleteRow(context, row.tableId, row.id, { id: member.userId, kind: 'member' }, { baseVersion: row.version })
    await tx.insert(builderActionRuns).values({ id: newId('run'), workspaceId: member.workspaceId, appId, userId: member.userId, requestId: request.requestId, definitionRevision: current.revision, workflowId: current.action.flow.id, eventNodeId: current.node.id, payloadHash: hash, tableId: row.tableId, rowId: row.id })
    return { ok: true, rowId: row.id, tableId: row.tableId, repeated: false }
  })
}
