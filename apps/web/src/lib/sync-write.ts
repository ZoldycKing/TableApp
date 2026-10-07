import { mutations } from '@tableapp/db'
import { explainToCustomer, parseCellValue, type RowMetadata } from '@tableapp/schema'
import { eq, sql } from 'drizzle-orm'
import { isPlanLimitError, workspaceOfTable } from './limits'
import { createRow, deleteRow, lockRowUsage, lockedRow, mutationFields, RowWriteError, updateRow, writeRows } from './row-mutations'
import { decideMutation, MISSING_ROW, type Decision, type Mutation } from './sync-merge'

type Actor = { id: string | null; kind: string; deviceId: string }
type Access = {
  guard: (data: Record<string, unknown>, row?: RowMetadata) => boolean
  may: (op: Mutation['op']) => boolean
  mayField: (op: Mutation['op'], fieldId: string) => boolean
  stamp: (data: Record<string, unknown>) => Record<string, unknown>
  locked: (fieldId: string) => boolean
}

/** One idempotency claim, row snapshot and outcome in a single transaction. */
export async function applySyncMutation(mutation: Mutation, tableId: string, actor: Actor, access: Access) {
  const workspaceId = await workspaceOfTable(tableId)
  if (!workspaceId) return { id: mutation.id, status: 'dropped' as const, reason: 'Таблица не найдена' }
  return writeRows(workspaceId, async (context) => {
    const { tx } = context
    // A mutation may target a row which does not exist yet. Serialise its ID
    // before checking the receipt, so simultaneous retries cannot both apply.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`mutation:${mutation.id}`}, 0))`)
    const [applied] = await tx.select().from(mutations).where(eq(mutations.id, mutation.id))
    if (applied) {
      if (applied.tableId !== tableId || applied.actorId !== actor.id || applied.actorKind !== actor.kind ||
          applied.deviceId !== actor.deviceId || applied.rowId !== mutation.rowId || applied.op !== mutation.op) {
        return { id: mutation.id, status: 'dropped' as const, reason: 'Идентификатор правки уже занят' }
      }
      return { id: mutation.id, status: applied.status as Decision['status'], reason: applied.reason ?? undefined }
    }
    if (mutation.op !== 'update') await lockRowUsage(context)
    const fields = await mutationFields(context, tableId)
    const found = await lockedRow(context, tableId, mutation.rowId)
    const row = found ? { exists: true, deleted: found.deletedAt !== null,
      version: found.version, data: found.data as Record<string, unknown> } : MISSING_ROW
    const fieldIds = mutation.op === 'update' ? (mutation.fieldId ? [mutation.fieldId] : [])
      : Object.keys((mutation.next ?? {}) as Record<string, unknown>)
    let decision: Decision
    if (!access.may(mutation.op) || fieldIds.some((id) => !access.mayField(mutation.op, id))) {
      decision = { status: 'dropped', reason: 'Это действие вам недоступно' }
    } else if (row.exists && !access.guard(row.data, found)) {
      decision = { status: 'dropped', reason: 'Эта запись вам больше не доступна' }
    } else if (mutation.op === 'update' && mutation.fieldId && access.locked(mutation.fieldId)) {
      decision = { status: 'dropped', reason: 'Владельца записи сменить нельзя' }
    } else {
      decision = decideMutation(mutation, row, fields, false)
    }
    if (decision.status === 'applied') {
      const value = decision.value
      const changed = new Set<string>()
      try {
        // A rejected quota/attachment check rolls back its reservation as well.
        await tx.transaction(async (nested) => {
          // Inherited entries were locked by the outer transaction. Keep new
          // savepoint entries separate so rollback cannot leak released locks.
          const inner = { ...context, tx: nested, changed, fieldCache: new Map(context.fieldCache) }
          if (mutation.op === 'create') {
            const clean: Record<string, unknown> = {}
            for (const field of fields) {
              const incoming = (mutation.next as Record<string, unknown> | undefined)?.[field.id]
              if (incoming === undefined) continue
              try { clean[field.id] = parseCellValue(field, incoming) } catch { /* Ignore invalid input. */ }
            }
            await createRow(inner, tableId, access.stamp(clean), actor,
              { id: mutation.rowId, origin: actor.kind === 'member' ? 'manual' : 'runtime' })
          } else if (mutation.op === 'delete') {
            await deleteRow(inner, tableId, mutation.rowId, actor, { baseVersion: mutation.baseVersion, guard: access.guard })
          } else {
            await updateRow(inner, tableId, mutation.rowId, { [mutation.fieldId!]: value }, actor, { guard: access.guard })
          }
        })
        for (const id of changed) context.changed.add(id)
      } catch (error) {
        if (isPlanLimitError(error)) decision = { status: 'dropped', reason: actor.kind === 'member' ? error.message : explainToCustomer() }
        else if (error instanceof RowWriteError) decision = { status: error.code === 'conflict' ? 'conflict' : 'dropped', reason: error.message }
        else throw error
      }
    }
    await tx.insert(mutations).values({ id: mutation.id, deviceId: actor.deviceId, actorId: actor.id, actorKind: actor.kind,
      tableId, rowId: mutation.rowId, fieldId: mutation.fieldId ?? null, op: mutation.op,
      base: mutation.base ?? null, next: mutation.next ?? null, status: decision.status,
      reason: 'reason' in decision ? decision.reason : null, clientAt: mutation.clientAt ? new Date(mutation.clientAt) : null })
    return { id: mutation.id, status: decision.status, reason: 'reason' in decision ? decision.reason : undefined,
      current: 'current' in decision ? decision.current : undefined }
  })
}
