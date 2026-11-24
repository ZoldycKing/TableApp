import { attachments, db } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { reencodeImage, isImageUpload } from './file-image'
import { assertCanIncreaseUsage, noteRemoved, type Origin } from './limits'
import {
  MAX_FILE_BYTES,
  resolvedUploadMime,
  UPLOAD_RATE_LIMIT,
  type ScanStatus,
} from './file-policy'
import { scanUpload } from './file-scan'
import { lockRowUsage, RowWriteError } from './row-mutations'
import { deleteFile, fileKey, putFile } from './storage'
import { recountFileBytes } from './usage'

function attachmentDTO(record: {
  id: string
  key: string
  name: string
  mime: string
  size: number
  width: number | null
  height: number | null
  scanStatus: string
}) {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    mime: record.mime,
    size: record.size,
    width: record.width,
    height: record.height,
    scanStatus: (record.scanStatus as ScanStatus) || 'clean',
  }
}

/** Keep metadata and quota durable while S3 is accessed outside DB locks. */
export async function storeAttachment(workspaceId: string, uploadedBy: string, origin: Origin,
  file: { name: string; type: string; bytes: Uint8Array }, conversationId?: string, reservedKey?: string) {
  const detected = resolvedUploadMime(file)
  if ('error' in detected) throw new RowWriteError('invalid', detected.error)

  let payload = { name: file.name, type: detected.mime, bytes: file.bytes, width: null as number | null, height: null as number | null }
  if (isImageUpload(detected.mime)) {
    const scrubbed = await reencodeImage({ name: file.name, bytes: file.bytes, mime: detected.mime })
    if (!scrubbed.ok) throw new RowWriteError('invalid', scrubbed.error)
    payload = {
      name: scrubbed.image.name,
      type: scrubbed.image.mime,
      bytes: scrubbed.image.bytes,
      width: scrubbed.image.width,
      height: scrubbed.image.height,
    }
  }

  if (payload.bytes.byteLength > MAX_FILE_BYTES) {
    throw new RowWriteError('invalid', `Файл больше ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} МБ`)
  }

  const id = newId('attachment')
  const key = reservedKey ?? fileKey(workspaceId, payload.name)
  await db.transaction(async (tx) => {
    await lockRowUsage({ tx, workspaceId, changed: new Set() })
    const [recent] = await tx.select({ count: sql<number>`count(*)` }).from(attachments).where(and(
      eq(attachments.workspaceId, workspaceId),
      eq(attachments.uploadedBy, uploadedBy),
      gt(attachments.createdAt, new Date(Date.now() - 60000)),
    ))
    if (Number(recent?.count) >= UPLOAD_RATE_LIMIT) {
      throw new RowWriteError('invalid', 'Слишком много файлов. Повторите загрузку через минуту.')
    }
    if (conversationId) {
      // Stricter per-minute cap for chat staging (counts every recent upload by this actor).
      if (Number(recent?.count) >= 20) {
        throw new RowWriteError('invalid', 'Слишком много файлов. Повторите загрузку через минуту.')
      }
      const [pending] = await tx.select({ count: sql<number>`count(*)` }).from(attachments).where(and(
        eq(attachments.workspaceId, workspaceId),
        or(isNotNull(attachments.conversationId), eq(attachments.state, 'deleting')),
        isNull(attachments.messageId),
      ))
      if (Number(pending?.count) >= 1000) {
        throw new RowWriteError('invalid', 'Добавление файлов временно недоступно. Отправьте сообщение без вложений или свяжитесь с бизнесом.')
      }
    }
    await recountFileBytes(workspaceId, tx)
    await assertCanIncreaseUsage({ workspaceId, resource: 'fileBytes', amount: payload.bytes.byteLength, origin, tx })
    await tx.insert(attachments).values({
      id, key, workspaceId, uploadedBy, name: payload.name,
      mime: payload.type, size: payload.bytes.byteLength,
      width: payload.width, height: payload.height,
      state: 'uploading', scanStatus: 'pending', referenced: false, conversationId,
    })
  })
  try {
    const result = await putFile(workspaceId, {
      name: payload.name, type: payload.type, bytes: payload.bytes,
      width: payload.width, height: payload.height,
    }, key)
    if (!result.ok) throw new Error('File validation failed')

    const scanning = await db.update(attachments).set({ state: 'scanning', scanStatus: 'pending' })
      .where(and(eq(attachments.id, id), eq(attachments.state, 'uploading'))).returning()
    if (!scanning.length) throw new Error('Upload was cancelled')

    const scan = await scanUpload(payload.bytes)
    if (scan.status === 'infected') {
      await db.transaction(async (tx) => {
        await lockRowUsage({ tx, workspaceId, changed: new Set() })
        await tx.update(attachments).set({
          state: 'blocked', scanStatus: 'infected', size: 0, referenced: false,
        }).where(eq(attachments.id, id))
        await noteRemoved(workspaceId, 'fileBytes', payload.bytes.byteLength, tx)
      })
      try { await deleteFile(key) } catch { /* metadata already blocked; cleanup can retry */ }
      return attachmentDTO({
        id, key, name: payload.name, mime: payload.type, size: 0,
        width: null, height: null, scanStatus: 'infected',
      })
    }

    const ready = await db.update(attachments).set({
      state: 'ready',
      scanStatus: scan.status === 'skipped' ? 'skipped' : 'clean',
    }).where(and(eq(attachments.id, id), eq(attachments.state, 'scanning'))).returning()
    if (!ready.length) throw new Error('Upload was cancelled')
    const record = ready[0]!
    return attachmentDTO(record)
  } catch (error) {
    if (error instanceof RowWriteError) throw error
    // If S3 deletion fails the record stays charged and discoverable by cleanup.
    try {
      const recover = await db.transaction(async (tx) => {
        await lockRowUsage({ tx, workspaceId, changed: new Set() })
        const [record] = await tx.select().from(attachments).where(eq(attachments.id, id)).for('update')
        // A late successful PUT can outlive cleanup of an abandoned upload.
        // Restore its recovery record before attempting another S3 deletion.
        if (!record) {
          await tx.insert(attachments).values({
            id, key, workspaceId, uploadedBy, name: payload.name,
            mime: payload.type, size: payload.bytes.byteLength, state: 'deleting',
            scanStatus: 'pending', referenced: false,
          })
          await recountFileBytes(workspaceId, tx)
        } else {
          if (record.referenced || record.tableId || record.rowId || record.fieldId || record.messageId) return false
          if (record.state === 'blocked') return false
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
