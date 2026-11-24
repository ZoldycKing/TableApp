import { appConfigVersions, apps, attachments, db } from '@tableapp/db'
import { and, asc, eq, isNull, lt, notLike, or, sql } from 'drizzle-orm'
import { removeTrackedAttachment } from './file-upload'
import { lockRowUsage } from './row-mutations'
import { BUILDER_V2_LOGO_PREFIX, isBuilderV2LogoKey } from './builder-v2-logo-types'

/** Unsubmitted files expire after one day; abandoned uploads after one hour. */
export function cleanupPredicate(now = new Date()) {
  const noLogoReference = or(notLike(attachments.key, `%/${BUILDER_V2_LOGO_PREFIX}%`), sql`
    not exists (select 1 from ${apps} where ${apps.workspaceId} = ${attachments.workspaceId}
      and (${apps.draft} #>> '{theme,logoKey}' = ${attachments.key} or ${apps.published} #>> '{theme,logoKey}' = ${attachments.key}))
    and not exists (select 1 from ${appConfigVersions} where ${appConfigVersions.workspaceId} = ${attachments.workspaceId}
      and ${appConfigVersions.definition} #>> '{theme,logoKey}' = ${attachments.key})`)
  return or(eq(attachments.state, 'deleting'),
    and(or(eq(attachments.state, 'uploading'), eq(attachments.state, 'scanning')), lt(attachments.createdAt, new Date(now.getTime() - 60 * 60 * 1000))),
    and(eq(attachments.state, 'blocked'), lt(attachments.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))),
    and(eq(attachments.state, 'ready'), eq(attachments.referenced, false), isNull(attachments.tableId),
      isNull(attachments.rowId), isNull(attachments.fieldId), isNull(attachments.messageId),
      lt(attachments.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)), noLogoReference))
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
        // Recheck JSON references in a fresh statement after any concurrent save releases the logo.
        if (isBuilderV2LogoKey(candidate.key)) {
          await tx.select({ id: attachments.id }).from(attachments).where(eq(attachments.id, candidate.id)).for('update')
        }
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
