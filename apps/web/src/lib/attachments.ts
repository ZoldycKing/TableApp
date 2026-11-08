import { attachments, db, fields as fieldsTable, rows, tables,workspaceMembers } from '@tableapp/db'
import type { Attachment, Field } from '@tableapp/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { isBuilderV2LogoKey } from './builder-v2-logo-types'

/**
 * Привязка загруженных файлов к ячейке.
 *
 * Ссылка нужна не для учёта, а для прав: по файлу находится строка, и доступ
 * к файлу решается тем же правилом, что доступ к строке. Неугадываемый ключ —
 * это не право доступа.
 */

export const ATTACHMENT_FIELD_TYPES = new Set(['attachment', 'image'])

export function isAttachmentField(field: Field): boolean {
  return ATTACHMENT_FIELD_TYPES.has(field.type)
}

function keysOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (item && typeof item === 'object' ? (item as Attachment).key : null))
    .filter((key): key is string => typeof key === 'string' && key.length > 0)
}

type Target = { tableId: string; rowId: string; fieldId: string }
type Runner = Pick<typeof db, 'select' | 'update'>
export type AttachmentAuthor = { id: string | null; kind: string }
export const INVALID_ATTACHMENT = 'Файл не найден или недоступен в этом рабочем пространстве'
export const ATTACHMENT_IN_USE = 'Файл уже прикреплён к другой ячейке. Загрузите отдельную копию'

function attachmentError(record: typeof attachments.$inferSelect, target: Target, author?: AttachmentAuthor): string | null {
  if (record.state !== 'ready') return INVALID_ATTACHMENT
  if (isBuilderV2LogoKey(record.key)) return INVALID_ATTACHMENT
  if (record.conversationId || record.messageId) return ATTACHMENT_IN_USE
  if (record.tableId || record.rowId || record.fieldId) {
    return record.tableId === target.tableId && record.rowId === target.rowId && record.fieldId === target.fieldId
      ? null : ATTACHMENT_IN_USE
  }
  if (author?.kind === 'app_user' && (!author.id || record.uploadedBy !== author.id)) return INVALID_ATTACHMENT
  return null
}

export async function validateRowAttachments(
  tableId: string,
  fields: readonly Field[],
  data: Record<string, unknown>,
  runner: Runner = db,
  author?: AttachmentAuthor,
  rowId = '',
): Promise<string | null> {
  const keys = [...new Set(fields.filter(isAttachmentField).flatMap((field) => keysOf(data[field.id])))]
  if (keys.length === 0) return null
  const [table] = await runner.select({ workspaceId: tables.workspaceId }).from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!table) return INVALID_ATTACHMENT
  const owned = await runner.select().from(attachments)
    .where(and(inArray(attachments.key, keys), eq(attachments.workspaceId, table.workspaceId)))
  if (owned.length !== keys.length) return INVALID_ATTACHMENT
  if(author?.kind==='member'&&author.id){
    const [member]=await runner.select({role:workspaceMembers.role,tableAccess:workspaceMembers.tableAccess}).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId,table.workspaceId),eq(workspaceMembers.userId,author.id))).limit(1)
    if(member&&member.role!=='owner'&&member.tableAccess!=null&&owned.some(file=>!file.tableId&&file.uploadedBy!==author.id))return INVALID_ATTACHMENT
  }
  const assigned = new Set<string>()
  for (const field of fields.filter(isAttachmentField)) {
    for (const key of keysOf(data[field.id])) {
      if (assigned.has(key)) return ATTACHMENT_IN_USE
      assigned.add(key)
      const error = attachmentError(owned.find((record) => record.key === key)!, { tableId, rowId, fieldId: field.id }, author)
      if (error) return error
    }
  }
  return null
}

/** Cell metadata comes from the attachment record, never from client claims. */
export async function canonicalAttachments(fields: readonly Field[], data: Record<string, unknown>, runner: Runner) {
  const keys = [...new Set(fields.filter(isAttachmentField).flatMap((field) => keysOf(data[field.id])))]
  if (!keys.length) return data
  const found = await runner.select().from(attachments).where(inArray(attachments.key, keys))
  const byKey = new Map(found.map((record) => [record.key, record]))
  const clean = { ...data }
  for (const field of fields.filter(isAttachmentField)) {
    if (!(field.id in data)) continue
    clean[field.id] = keysOf(data[field.id]).map((key) => {
      const record = byKey.get(key)!
      return { id: record.id, key, name: record.name, mime: record.mime, size: record.size, width: null, height: null }
    })
  }
  return clean
}

/** Отмечает файлы ячейки использованными, а выброшенные — свободными. */
export async function linkAttachments(target: Target, value: unknown, runner: Runner = db, author?: AttachmentAuthor): Promise<void> {
  const keys = keysOf(value)
  const [cell] = await runner.select({ workspaceId: tables.workspaceId }).from(tables)
    .innerJoin(fieldsTable, eq(fieldsTable.tableId, tables.id))
    .innerJoin(rows, eq(rows.tableId, tables.id))
    .where(and(eq(tables.id, target.tableId), eq(fieldsTable.id, target.fieldId), eq(rows.id, target.rowId), inArray(fieldsTable.type, [...ATTACHMENT_FIELD_TYPES]))).limit(1)
  if (!cell) throw new Error(INVALID_ATTACHMENT)
  if (keys.length > 0) {
    const owned = await runner.select().from(attachments)
      .where(and(inArray(attachments.key, keys), eq(attachments.workspaceId, cell.workspaceId))).for('update')
    if (owned.length !== new Set(keys).size) throw new Error(INVALID_ATTACHMENT)
    for (const record of owned) {
      const error = attachmentError(record, target, author)
      if (error) throw new Error(error)
    }
  }

  // Файлы, которые раньше были в этой ячейке, а теперь нет, освобождаются:
  // уборщик сможет удалить их из хранилища.
  const previous = await runner
    .select({ id: attachments.id, key: attachments.key })
    .from(attachments)
    .where(and(eq(attachments.workspaceId, cell.workspaceId), eq(attachments.tableId, target.tableId), eq(attachments.rowId, target.rowId), eq(attachments.fieldId, target.fieldId)))

  const removed = previous.filter((item) => !keys.includes(item.key)).map((item) => item.id)
  if (removed.length > 0) {
    await runner
      .update(attachments)
      .set({ referenced: false, tableId: null, rowId: null, fieldId: null })
      .where(and(inArray(attachments.id, removed), eq(attachments.workspaceId, cell.workspaceId)))
  }

  if (keys.length > 0) {
    await runner
      .update(attachments)
      .set({ referenced: true, tableId: target.tableId, rowId: target.rowId, fieldId: target.fieldId })
      .where(and(inArray(attachments.key, keys), eq(attachments.workspaceId, cell.workspaceId)))
  }
}

/** Привязка всех файловых полей строки сразу — при создании записи. */
export async function linkRowAttachments(
  tableId: string,
  rowId: string,
  fields: readonly Field[],
  data: Record<string, unknown>,
  runner: Runner = db,
  author?: AttachmentAuthor,
): Promise<void> {
  for (const field of fields) {
    if (!isAttachmentField(field)) continue
    const value = data[field.id]
    if (!(field.id in data)) continue
    await linkAttachments({ tableId, rowId, fieldId: field.id }, value, runner, author)
  }
}
