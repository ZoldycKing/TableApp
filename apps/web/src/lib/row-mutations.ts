import { db, fields as fieldsTable, rows, rowChanges, tables, workspaceUsage,workspaceMembers } from '@tableapp/db'
import { compileTableFormulas, computeRow, stripDerived } from '@tableapp/formula'
import { newId, normalizeFieldOptions, parseCellValue, positionBetween, type CustomerWorkflow, type Field } from '@tableapp/schema'
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { canonicalAttachments, linkRowAttachments, validateRowAttachments } from './attachments'
import { CELL_CONFLICT, sameCellValue } from './cell-conflict'
import type { Transaction } from './db-transaction'
import { assertCanIncreaseUsage, noteRemoved, type Origin } from './limits'
import { publishTable } from './live'
import { dependentRows } from './production-cascade'
import { recountWorkspace } from './usage'
import { withInitialValues } from './initial-values'
import { prepareBookingWrite } from './booking-store'
import { prepareCustomerWrite } from './customer-store'
import { currentModularAppError, moduleIntakeError } from './module-lifecycle'
import { prepareOrderDeliveryWrite, assertOrderDeliveryDeletion } from './order-delivery-store'
import { prepareOrderStockWrite, assertOrderStockDeletion } from './order-stock-store'
import { prepareProductionStockWrite, assertProductionStockDeletion, type ProductionStockAuthorization } from './production-stock-write'
import { memberTableFields,restrictedTables,tablePermission,type TableMember } from './table-permissions'

export class RowWriteError extends Error {
  constructor(readonly code: 'missing' | 'conflict' | 'denied' | 'invalid', message: string) {
    super(message)
    this.name = 'RowWriteError'
  }
}

export type RowActor = { id: string | null; kind: string; ip?: string | null }
export type RowTransaction = { tx: Transaction; workspaceId: string; changed: Set<string>;
  usageLocked?: boolean; fieldCache?: Map<string, Field[]>; memberAccess?:Map<string,TableMember>;customerConfigCache?: CustomerWorkflow[]; moduleStateCache?: import('@tableapp/schema').App[]; orderDeliverySync?: Set<string>; orderStockInternal?: Set<string>; orderStockReturn?: Set<string>; productionStockInternal?: ProductionStockAuthorization }
export type StoredRow = typeof rows.$inferSelect
export const ROW_CONFLICT = 'Запись изменилась после открытия формы. Обновите её и повторите действие.'

export async function assertCurrentModuleState(context: RowTransaction, app: import('@tableapp/schema').App): Promise<void> {
  const error = await currentModularAppError(context, app)
  if (error) throw new RowWriteError('conflict', error)
}

/** Notifications describe committed data only, including every cascade target. */
export async function writeRows<T>(workspaceId: string, write: (context: RowTransaction) => Promise<T>): Promise<T> {
  const changed = new Set<string>()
  const result = await db.transaction(async (tx) => {
    const context: RowTransaction = { tx, workspaceId, changed, fieldCache: new Map() }
    // Revisions must be assigned in commit order, including ordinary edits.
    await lockRowUsage(context)
    return write(context)
  })
  for (const tableId of changed) publishTable(tableId, 'rows')
  return result
}

/** Acquire this before row locks in any transaction which changes the count. */
export async function lockRowUsage(context: RowTransaction): Promise<void> {
  if (context.usageLocked) return
  const { tx, workspaceId } = context
  const inserted = await tx.insert(workspaceUsage).values({ workspaceId }).onConflictDoNothing().returning()
  await tx.select({ id: workspaceUsage.workspaceId }).from(workspaceUsage)
    .where(eq(workspaceUsage.workspaceId, workspaceId)).for('update')
  if (inserted.length) await recountWorkspace(workspaceId, tx)
  context.usageLocked = true
}

export async function mutationFields(context: RowTransaction, tableId: string): Promise<Field[]> {
  const cached = context.fieldCache?.get(tableId)
  if (cached) return cached
  const [table] = await context.tx.select({ id: tables.id }).from(tables)
    .where(and(eq(tables.id, tableId), eq(tables.workspaceId, context.workspaceId)))
  if (!table) throw new RowWriteError('missing', 'Таблица не найдена')
  const found = await context.tx.select().from(fieldsTable).where(eq(fieldsTable.tableId, tableId))
    .orderBy(asc(fieldsTable.id)).for('share')
  const fields = found.map((field) => ({ ...field,
    options: normalizeFieldOptions(field.type as Field['type'], field.options),
  }) as unknown as Field)
  // These metadata rows remain share-locked until this transaction ends.
  // Cache only within the write context, never across requests.
  context.fieldCache?.set(tableId, fields)
  return fields
}

export async function lockedRow(context: RowTransaction, tableId: string, rowId: string): Promise<StoredRow | undefined> {
  const [row] = await context.tx.select().from(rows)
    .where(and(eq(rows.id, rowId), eq(rows.tableId, tableId))).for('update')
  return row
}

export function checkRow(row: StoredRow | undefined, options: {
  baseVersion?: number; guard?: (data: Record<string, unknown>, row?: StoredRow) => boolean
} = {}): asserts row is StoredRow {
  if (!row || row.deletedAt !== null) throw new RowWriteError('missing', 'Строка не найдена')
  if (options.guard && !options.guard(row.data as Record<string, unknown>, row)) {
    throw new RowWriteError('denied', 'Эта запись вам больше не доступна')
  }
  if (options.baseVersion !== undefined && options.baseVersion !== row.version) {
    throw new RowWriteError('conflict', ROW_CONFLICT)
  }
}

async function history(context: RowTransaction, tableId: string, rowId: string, op: 'create' | 'update' | 'delete',
  actor: RowActor, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  await context.tx.insert(rowChanges).values({ id: newId('change'), tableId, rowId, op,
    actorId: actor.id, actorKind: actor.kind, actorIp: actor.ip ?? null, before, after })
  context.changed.add(tableId)
}

function parsePatch(fields: Field[], values: Record<string, unknown>) {
  const clean: Record<string, unknown> = {}
  for (const [id, value] of Object.entries(stripDerived(values, fields))) {
    const field = fields.find((column) => column.id === id)
    if (!field) throw new RowWriteError('missing', 'Поле не найдено. Обновите форму')
    try { clean[id] = parseCellValue(field, value) }
    catch { throw new RowWriteError('invalid', 'Значение не подходит типу поля') }
  }
  return clean
}

async function initialValues(context: RowTransaction, fields: Field[], data: Record<string, unknown>, creating = false) {
  return withInitialValues(fields, data, async (tableId, rowId, fieldId) => {
    // Verify tenant and field configuration before reading the linked price.
    const targetFields = await mutationFields(context, tableId)
    if (!targetFields.some(field => field.id === fieldId && field.type === 'number')) return undefined
    const [source] = await context.tx.select({ data: rows.data }).from(rows)
      .where(and(eq(rows.tableId, tableId), eq(rows.id, rowId), isNull(rows.deletedAt))).for('share')
    return (source?.data as Record<string, unknown> | undefined)?.[fieldId]
  }, { creating })
}

export async function createRow(context: RowTransaction, tableId: string, data: Record<string, unknown>, actor: RowActor,
  options: { id?: string; afterRowId?: string; origin?: Origin; beforeInsert?: (tx: Transaction) => Promise<void> } = {}) {
  await lockRowUsage(context)
  const fields = await mutationFields(context, tableId)
  await assertMemberRowWrite(context,tableId,fields,Object.keys(data),actor)
  const id = options.id ?? newId('row')
  const existing = await lockedRow(context, tableId, id)
  if (existing) {
    checkRow(existing)
    return { id, duplicate: true }
  }
  const intakeError = await moduleIntakeError(context, tableId)
  if (intakeError) throw new RowWriteError('denied', intakeError)
  let clean = await initialValues(context, fields, parsePatch(fields, data), true)
  const booking = await prepareBookingWrite(context.tx, context.workspaceId, tableId, clean, undefined, id, { context, actor, origin: options.origin })
  if (booking.error) throw new RowWriteError('invalid', booking.error)
  clean = booking.data
  clean = await prepareCustomerWrite(context, tableId, clean, null, actor, id)
  await prepareProductionStockWrite(context, tableId, id, clean, null)
  await prepareOrderStockWrite(context, tableId, id, clean, null, actor)
  await prepareOrderDeliveryWrite(context, tableId, id, clean, null, actor)
  const error = await validateRowAttachments(tableId, fields, clean, context.tx, actor, id)
  if (error) throw new RowWriteError('invalid', error)
  clean = await canonicalAttachments(fields, clean, context.tx)
  await assertCanIncreaseUsage({ workspaceId: context.workspaceId, resource: 'rows',
    origin: options.origin ?? 'manual', tx: context.tx })
  const scope = and(eq(rows.tableId, tableId), isNull(rows.deletedAt))
  let beforePosition: string | null = null
  let afterPosition: string | null = null
  if (options.afterRowId) {
    const [before] = await context.tx.select({ position: rows.position }).from(rows)
      .where(and(scope, eq(rows.id, options.afterRowId))).limit(1)
    beforePosition = before?.position ?? null
    const [after] = await context.tx.select({ position: rows.position }).from(rows)
      .where(beforePosition === null ? scope : and(scope, gt(rows.position, beforePosition)))
      .orderBy(asc(rows.position)).limit(1)
    afterPosition = after?.position ?? null
  } else {
    const [last] = await context.tx.select({ position: rows.position }).from(rows)
      .where(scope).orderBy(desc(rows.position)).limit(1)
    beforePosition = last?.position ?? null
  }
  const after = stripDerived(computeRow(clean, compileTableFormulas(fields)), fields)
  if (options.beforeInsert) await options.beforeInsert(context.tx)
  const inserted = await context.tx.insert(rows).values({ id, tableId, data: after,
    createdBy: actor.id, updatedBy: actor.id,
    position: positionBetween(beforePosition, afterPosition),
  }).onConflictDoNothing().returning({ id: rows.id })
  if (!inserted.length) throw new RowWriteError('conflict', 'Идентификатор строки уже занят')
  await linkRowAttachments(tableId, id, fields, after, context.tx, actor)
  await history(context, tableId, id, 'create', actor, null, after)
  return { id, duplicate: false }
}

export async function updateRow(context: RowTransaction, tableId: string, rowId: string,
  patch: Record<string, unknown> | ((fields: Field[], current: StoredRow) => Record<string, unknown>), actor: RowActor,
  options: { baseVersion?: number; base?: Record<string, unknown>; guard?: (data: Record<string, unknown>, row?: StoredRow) => boolean } = {}) {
  const fields = await mutationFields(context, tableId)
  await assertMemberRowWrite(context,tableId,fields,typeof patch==='function'?[]:Object.keys(patch),actor)
  const current = await lockedRow(context, tableId, rowId)
  checkRow(current, options)
  const before = current.data as Record<string, unknown>
  for (const [fieldId, base] of Object.entries(options.base ?? {})) {
    if (!sameCellValue(before[fieldId], base)) throw new RowWriteError('conflict', CELL_CONFLICT)
  }
  let changed = parsePatch(fields, typeof patch === 'function' ? patch(fields, current) : patch)
  await assertMemberRowWrite(context,tableId,fields,Object.keys(changed),actor)
  const error = await validateRowAttachments(tableId, fields, changed, context.tx, actor, rowId)
  if (error) throw new RowWriteError('invalid', error)
  changed = await canonicalAttachments(fields, changed, context.tx)
  const booking = await prepareBookingWrite(context.tx, context.workspaceId, tableId,
    await initialValues(context, fields, { ...before, ...changed }), before, rowId)
  if (booking.error) throw new RowWriteError('invalid', booking.error)
  const customerData = await prepareCustomerWrite(context, tableId, booking.data, before, actor, rowId)
  await prepareProductionStockWrite(context, tableId, rowId, customerData, before)
  await prepareOrderStockWrite(context, tableId, rowId, customerData, before, actor)
  await prepareOrderDeliveryWrite(context, tableId, rowId, customerData, before, actor)
  const after = stripDerived(computeRow(customerData, compileTableFormulas(fields)), fields)
  await context.tx.update(rows).set({ data: after, updatedBy: actor.id, version: sql`${rows.version} + 1`, syncRevision: sql`nextval('row_sync_revision_seq')`, updatedAt: new Date(), sample: false })
    .where(and(eq(rows.id, rowId), eq(rows.tableId, tableId), isNull(rows.deletedAt)))
  await linkRowAttachments(tableId, rowId, fields, changed, context.tx, actor)
  await history(context, tableId, rowId, 'update', actor, before, after)
  return after
}

export async function deleteRow(context: RowTransaction, tableId: string, rowId: string, actor: RowActor,
  options: { baseVersion?: number; guard?: (data: Record<string, unknown>, row?: StoredRow) => boolean } = {}) {
  await lockRowUsage(context)
  const fields=await mutationFields(context, tableId)
  await assertMemberRowWrite(context,tableId,fields,[],actor)
  const current = await lockedRow(context, tableId, rowId)
  checkRow(current, options)
  await assertProductionStockDeletion(context, tableId, rowId)
  await assertOrderStockDeletion(context, tableId, rowId)
  await assertOrderDeliveryDeletion(context, tableId, rowId)
  const dependent = await dependentRows(tableId, rowId, context.tx)
  const targets = [{ tableId, id: rowId, data: current.data as Record<string, unknown> },
    ...(dependent?.rows ?? []).map((row) => ({ ...row, tableId: dependent!.tableId }))]
  // Cascade targets obey their own accepted contracts before any row is removed.
  for (const target of targets.slice(1)) {
    await assertMemberRowWrite(context,target.tableId,await mutationFields(context,target.tableId),[],actor)
    await assertProductionStockDeletion(context, target.tableId, target.id)
    await assertOrderStockDeletion(context, target.tableId, target.id)
    await assertOrderDeliveryDeletion(context, target.tableId, target.id)
  }
  let removed = 0
  const now = new Date()
  for (const target of targets) {
    const affected = await context.tx.update(rows).set({ deletedAt: now, updatedAt: now, updatedBy: actor.id, version: sql`${rows.version} + 1`, syncRevision: sql`nextval('row_sync_revision_seq')` })
      .where(and(eq(rows.tableId, target.tableId), eq(rows.id, target.id), isNull(rows.deletedAt))).returning({ id: rows.id })
    if (!affected.length) continue
    removed += affected.length
    await history(context, target.tableId, target.id, 'delete', actor, target.data, null)
  }
  await noteRemoved(context.workspaceId, 'rows', removed, context.tx)
  return removed
}

/** Recheck live membership inside the transaction, including imported and offline writes. */
async function assertMemberRowWrite(context:RowTransaction,tableId:string,fields:Field[],fieldIds:string[],actor:RowActor){
  if(actor.kind!=='member')return
  if(!actor.id)throw new RowWriteError('denied','Нужно войти в систему')
  context.memberAccess??=new Map()
  let member=context.memberAccess.get(actor.id)
  if(!member){
    const [found]=await context.tx.select({role:workspaceMembers.role,tableAccess:workspaceMembers.tableAccess}).from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId,context.workspaceId),eq(workspaceMembers.userId,actor.id))).for('share')
    if(!found)throw new RowWriteError('denied','Доступ к пространству отозван')
    member=found;context.memberAccess.set(actor.id,member)
  }
  if(tablePermission(member,tableId)!=='edit')throw new RowWriteError('denied','Нет права редактировать эту таблицу')
  if(!restrictedTables(member))return
  const allowed=new Set(memberTableFields(fields,member).map(field=>field.id))
  if(fieldIds.some(id=>!allowed.has(id)))throw new RowWriteError('denied','Поле связано с недоступной таблицей')
}
