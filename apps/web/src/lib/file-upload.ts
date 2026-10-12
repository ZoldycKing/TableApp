import { attachments, db } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { assertCanIncreaseUsage, noteRemoved, type Origin } from './limits'
import { lockRowUsage, RowWriteError } from './row-mutations'
import { deleteFile, fileKey, putFile } from './storage'
import { recountFileBytes } from './usage'

/** Keep metadata and quota durable while S3 is accessed outside DB locks. */
export async function storeAttachment(workspaceId: string, uploadedBy: string, origin: Origin,
  file: { name: string; type: string; bytes: Uint8Array }, conversationId?: string) {
  const id = newId('attachment')
  const key = fileKey(workspaceId, file.name)
  await db.transaction(async (tx) => {
    await lockRowUsage({ tx, workspaceId, changed: new Set() })
    if (conversationId) {
      const [recent] = await tx.select({ count: sql<number>`count(*)` }).from(attachments).where(and(eq(attachments.workspaceId, workspaceId), eq(attachments.uploadedBy, uploadedBy), gt(attachments.createdAt, new Date(Date.now() - 60000))))
      const [pending] = await tx.select({ count: sql<number>`count(*)` }).from(attachments).where(and(eq(attachments.workspaceId, workspaceId), or(isNotNull(attachments.conversationId), eq(attachments.state, 'deleting')), isNull(attachments.messageId)))
      if (Number(recent?.count) >= 20) throw new RowWriteError('invalid', 'Слишком много файлов. Повторите загрузку через минуту.')
      if (Number(pending?.count) >= 1000) throw new RowWriteError('invalid', 'Добавление файлов временно недоступно. Отправьте сообщение без вложений или свяжитесь с бизнесом.')
    }
    await recountFileBytes(workspaceId, tx)
    await assertCanIncreaseUsage({ workspaceId, resource: 'fileBytes', amount: file.bytes.byteLength, origin, tx })
    await tx.insert(attachments).values({ id, key, workspaceId, uploadedBy, name: file.name,
      mime: file.type, size: file.bytes.byteLength, state: 'uploading', referenced: false, conversationId })
  })
  try {
    const result = await putFile(workspaceId, file, key)
    if (!result.ok) throw new Error('File validation failed')
    const ready = await db.update(attachments).set({ state: 'ready' })
      .where(and(eq(attachments.id, id), eq(attachments.state, 'uploading'))).returning()
    if (!ready.length) throw new Error('Upload was cancelled')
    return { id, key, name: file.name, mime: file.type, size: file.bytes.byteLength, width: null, height: null }
  } catch {
    // If S3 deletion fails the record stays charged and discoverable by cleanup.
    try {
      const recover = await db.transaction(async (tx) => {
        await lockRowUsage({ tx, workspaceId, changed: new Set() })
        const [record] = await tx.select().from(attachments).where(eq(attachments.id, id)).for('update')
        // A late successful PUT can outlive cleanup of an abandoned upload.
        // Restore its recovery record before attempting another S3 deletion.
        if (!record) {
          await tx.insert(attachments).values({ id, key, workspaceId, uploadedBy, name: file.name,
            mime: file.type, size: file.bytes.byteLength, state: 'deleting', referenced: false })
          await recountFileBytes(workspaceId, tx)
        } else {
          if (record.referenced || record.tableId || record.rowId || record.fieldId || record.messageId) return false
          await tx.update(attachments).set({ state: 'deleting' }).where(eq(attachments.id, id))
        }
        return true
      })
      if (recover) await removeTrackedAttachment(id, workspaceId, key)
    } catch { /* A pending/deleting record is durable recovery work. */ }
    throw new Error('Не удалось сохранить файл. Попробуйте ещё раз')
  }
}

export async function removeTrackedAttachment(id: string, workspaceId: string, key: string): Promise<void> {
  const [record] = await db.select().from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.workspaceId, workspaceId), eq(attachments.key, key), eq(attachments.state, 'deleting')))
  if (!record) return
  await deleteFile(key)
  await db.transaction(async (tx) => {
    await lockRowUsage({ tx, workspaceId, changed: new Set() })
    const deleted = await tx.delete(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.workspaceId, workspaceId), eq(attachments.state, 'deleting'))).returning({ size: attachments.size })
    if (deleted.length) await noteRemoved(workspaceId, 'fileBytes', deleted[0]!.size, tx)
  })
}
