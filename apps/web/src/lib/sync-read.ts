import { db, rows } from '@tableapp/db'
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm'
import { lockRowUsage } from './row-mutations'
import { decodeCursor, encodeCursor } from './sync-protocol'
import type { RowMetadata } from '@tableapp/schema'

type Policy = { fingerprint: string; canRead: (data: Record<string, unknown>, row?: RowMetadata) => boolean;
  project: (data: Record<string, unknown>, row?: RowMetadata) => Record<string, unknown> }

/** Cursor positions are not capabilities: access is rechecked on every page. */
export async function readSyncPage(workspaceId: string, tableId: string, scope: string, policy: Policy,
  since?: string | null, pageSize = 500) {
  const cursor = decodeCursor(since)
  if (cursor && cursor.scope !== scope) throw new Error('Курсор относится к другому пользователю, устройству или таблице')
  return db.transaction(async (tx) => {
    await lockRowUsage({ tx, workspaceId, changed: new Set() })
    const [latest] = await tx.select({ revision: sql<number>`coalesce(max(${rows.syncRevision}), 0)::bigint` })
      .from(rows).where(eq(rows.tableId, tableId))
    const maximum = Number(latest!.revision)
    if (cursor && (cursor.seen > maximum || cursor.after > maximum || (cursor.until ?? 0) > maximum ||
        cursor.after < cursor.seen || (cursor.until !== undefined && cursor.after > cursor.until))) {
      throw new Error('Некорректная позиция курсора синхронизации')
    }
    const reset = !cursor || cursor.policy !== policy.fingerprint
    const snapshot = reset || cursor?.snapshot === true
    const seen = reset ? 0 : cursor.seen
    const after = reset ? 0 : cursor.until !== undefined ? cursor.after : cursor.seen
    const until = reset ? maximum : cursor.until ?? maximum
    const found = await tx.select().from(rows)
      .where(and(eq(rows.tableId, tableId), gt(rows.syncRevision, after), lte(rows.syncRevision, until)))
      .orderBy(asc(rows.syncRevision)).limit(pageSize + 1)
    const hasMore = found.length > pageSize
    const page = found.slice(0, pageSize)
    const projected = page.flatMap((row) => {
      const data = row.data as Record<string, unknown>
      const visible = policy.canRead(data, row)
      if (snapshot && (row.deletedAt !== null || !visible)) return []
      if (!visible || row.deletedAt !== null) return [{ id: row.id, data: {}, position: '', version: 0, deleted: true }]
      return [{ id: row.id, data: policy.project(data, row), position: row.position, version: row.version, deleted: false }]
    })
    return { rows: projected, reset, hasMore, cursor: encodeCursor({ v: 2, scope, policy: policy.fingerprint,
      seen: hasMore ? seen : until, after: hasMore ? page[page.length - 1]!.syncRevision : until,
      ...(hasMore ? { until, snapshot } : {}) }) }
  })
}
