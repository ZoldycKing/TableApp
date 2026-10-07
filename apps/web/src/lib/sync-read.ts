import { db, rows, workspaceUsage } from '@tableapp/db'
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm'
import { lockRowUsage } from './row-mutations'
import { decodeCursor, encodeCursor } from './sync-protocol'
import type { RowMetadata } from '@tableapp/schema'
import type { Transaction } from './db-transaction'

type Policy = { fingerprint: string; canRead: (data: Record<string, unknown>, row?: RowMetadata) => boolean;
  project: (data: Record<string, unknown>, row?: RowMetadata) => Record<string, unknown> }

function scopedCursor(scope: string, since?: string | null) {
  const cursor = decodeCursor(since)
  if (cursor && cursor.scope !== scope) throw new Error('Курсор относится к другому пользователю, устройству или таблице')
  return cursor
}

/** Readers share a committed boundary; writers still hold the exclusive lock. */
async function maximumRevision(tx: Transaction, workspaceId: string, tableId: string) {
  const [usage] = await tx.select({ id: workspaceUsage.workspaceId }).from(workspaceUsage)
    .where(eq(workspaceUsage.workspaceId, workspaceId)).for('share')
  // A fresh workspace has no counter yet. Initialise it with the existing
  // exclusive path; never upgrade an already acquired shared row lock.
  if (!usage) await lockRowUsage({ tx, workspaceId, changed: new Set() })
  const [latest] = await tx.select({ revision: sql<number>`coalesce(max(${rows.syncRevision}), 0)::bigint` })
    .from(rows).where(eq(rows.tableId, tableId))
  return Number(latest!.revision)
}

function assertPosition(cursor: ReturnType<typeof decodeCursor>, maximum: number) {
  if (cursor && (cursor.seen > maximum || cursor.after > maximum || (cursor.until ?? 0) > maximum ||
      cursor.after < cursor.seen || (cursor.until !== undefined && cursor.after > cursor.until))) {
    throw new Error('Некорректная позиция курсора синхронизации')
  }
}

/** Validate before writes without reading or projecting a discarded page. */
export async function validateSyncCursor(workspaceId: string, tableId: string, scope: string, since?: string | null) {
  const cursor = scopedCursor(scope, since)
  if (!cursor) return // New and valid legacy cursors have no position to check.
  await db.transaction(async (tx) => {
    assertPosition(cursor, await maximumRevision(tx, workspaceId, tableId))
  })
}

/** Cursor positions are not capabilities: access is rechecked on every page. */
export async function readSyncPage(workspaceId: string, tableId: string, scope: string, policy: Policy,
  since?: string | null, pageSize = 500) {
  const cursor = scopedCursor(scope, since)
  return db.transaction(async (tx) => {
    const maximum = await maximumRevision(tx, workspaceId, tableId)
    assertPosition(cursor, maximum)
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
