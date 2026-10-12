import { attachments, db } from '@tableapp/db'
import { and, asc, eq, isNull, lt, or } from 'drizzle-orm'
import { removeTrackedAttachment } from './file-upload'
import { lockRowUsage } from './row-mutations'

/** Unsubmitted files expire after one day; abandoned uploads after one hour. */
export function cleanupPredicate(now = new Date()) {
  return or(eq(attachments.state, 'deleting'),
    and(eq(attachments.state, 'uploading'), lt(attachments.createdAt, new Date(now.getTime() - 60 * 60 * 1000))),
    and(eq(attachments.state, 'ready'), eq(attachments.referenced, false), isNull(attachments.tableId),
      isNull(attachments.rowId), isNull(attachments.fieldId), isNull(attachments.messageId), lt(attachments.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))))
}
export async function cleanupFiles({ run = false, workspaceId, now = new Date(), limit = 100 }:
  { run?: boolean; workspaceId?: string; now?: Date; limit?: number } = {}) {
  const eligible = cleanupPredicate(now)
  const candidates = await db.select().from(attachments)
    .where(workspaceId ? and(eligible, eq(attachments.workspaceId, workspaceId)) : eligible)
    .orderBy(asc(attachments.createdAt)).limit(limit)
  let deleted = 0, failed = 0
  if (run) for (const candidate of candidates) {
    try {
      const claimed = await db.transaction(async (tx) => {
        await lockRowUsage({ tx, workspaceId: candidate.workspaceId, changed: new Set() })
        return tx.update(attachments).set({ state: 'deleting' })
          .where(and(eq(attachments.id, candidate.id), eligible)).returning({ id: attachments.id })
      })
      if (!claimed.length) continue // A form saved it after the preview.
      await removeTrackedAttachment(candidate.id, candidate.workspaceId, candidate.key)
      deleted += 1
    } catch { failed += 1 }
  }
  return { eligible: candidates.length, deleted, failed }
}
