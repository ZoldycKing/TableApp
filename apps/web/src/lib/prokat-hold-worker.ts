import {
  apps, conversationMessages, conversations, db, rows, workspaces,
} from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import type { AppV2, AppV2Json } from '@tableapp/schema/app-v2'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { createHash, randomUUID } from 'node:crypto'
import { ensureProkatHoldKit } from './prokat-hold-ensure'
import {
  isHoldEligibleStatus, isHoldExpired, PROKAT_NOT_PICKED_UP_CHAT,
  PROKAT_NOT_PICKED_UP_REASON_AUTO, resolveBookingHoldUntil,
} from './prokat-logic'
import { prokatHoldMinutes, prokatStatusName } from './prokat-persist'
import { lockedRow, checkRow, RowWriteError, updateRow, writeRows } from './row-mutations'

const batchApps = 20
const batchBookings = 40
const SYSTEM_ACTOR = { id: 'system:prokat-hold', kind: 'system' as const }

const textOf = (value: unknown) => typeof value === 'string' ? value : ''

async function postHoldChatIfAny(
  tx: Parameters<Parameters<typeof writeRows>[1]>[0]['tx'],
  input: { workspaceId: string; tableId: string; rowId: string; body: string; requestKey: string },
) {
  const [thread] = await tx.select({ id: conversations.id, closedAt: conversations.closedAt })
    .from(conversations)
    .where(and(
      eq(conversations.workspaceId, input.workspaceId),
      eq(conversations.tableId, input.tableId),
      eq(conversations.rowId, input.rowId),
      eq(conversations.kind, 'record'),
    ))
    .limit(1)
  if (!thread || thread.closedAt) return false
  const requestId = randomUUID()
  const authorId = `person_${createHash('sha256').update(`${input.workspaceId}:prokat-hold`).digest('hex')}`
  await tx.insert(conversationMessages).values({
    id: `msg_${newId('row').slice(4)}`,
    workspaceId: input.workspaceId,
    conversationId: thread.id,
    authorId,
    authorKind: 'business',
    authorName: 'Прокат',
    requestId,
    body: input.body,
  }).onConflictDoNothing()
  return true
}

/** Cancel one expired hold. Issue winning the row lock leaves status as issued — we skip. */
export async function cancelExpiredProkatHold(
  workspaceId: string,
  app: AppV2,
  bookingId: string,
  now = new Date(),
): Promise<'cancelled' | 'skipped' | 'failed'> {
  const prokat = app.prokat
  if (!prokat?.statuses.notPickedUp) return 'skipped'
  try {
    return await writeRows(workspaceId, async context => {
      const ensured = await ensureProkatHoldKit(context.tx, app)
      const kit = ensured.prokat!
      if (!kit.statuses.notPickedUp) return 'skipped' as const
      if (prokatHoldMinutes(kit) == null) return 'skipped' as const

      const stored = await lockedRow(context, kit.bookingsTableId, bookingId)
      checkRow(stored)
      const data = stored.data as Record<string, unknown>
      const statusName = prokatStatusName(kit, data[kit.booking.status])
      if (!isHoldEligibleStatus(statusName)) return 'skipped' as const

      const from = textOf(data[kit.booking.from])
      const holdUntil = resolveBookingHoldUntil({
        from,
        holdUntil: kit.booking.holdUntil ? textOf(data[kit.booking.holdUntil]) || null : null,
        holdAfterStartMinutes: prokatHoldMinutes(kit),
      })
      if (!isHoldExpired(holdUntil, now.getTime())) return 'skipped' as const

      const patch: Record<string, AppV2Json> = {
        [kit.booking.status]: kit.statuses.notPickedUp,
        [kit.booking.updatedAt]: now.toISOString(),
      }
      if (kit.booking.statusReason) patch[kit.booking.statusReason] = PROKAT_NOT_PICKED_UP_REASON_AUTO
      if (kit.booking.holdUntil && holdUntil) patch[kit.booking.holdUntil] = holdUntil

      await updateRow(context, kit.bookingsTableId, bookingId, patch, SYSTEM_ACTOR)
      await postHoldChatIfAny(context.tx, {
        workspaceId,
        tableId: kit.bookingsTableId,
        rowId: bookingId,
        body: PROKAT_NOT_PICKED_UP_CHAT,
        requestKey: `hold-cancel:${bookingId}:${holdUntil}`,
      })
      return 'cancelled' as const
    })
  } catch (error) {
    if (error instanceof RowWriteError && (error.code === 'missing' || error.code === 'conflict' || error.code === 'denied')) {
      return 'skipped'
    }
    console.error('prokat hold cancel failed', bookingId, error instanceof Error ? error.name : '')
    return 'failed'
  }
}

async function listProkatApps() {
  const found = await db.select({
    id: apps.id,
    workspaceId: apps.workspaceId,
    slug: apps.slug,
    published: apps.published,
  }).from(apps)
    .innerJoin(workspaces, eq(workspaces.id, apps.workspaceId))
    .where(isNotNull(apps.published))
    .limit(200)
  return found.flatMap(row => {
    const definition = readAppDefinition(row.published)
    if (!definition.ok || definition.formatVersion !== 2 || !definition.app.prokat) return []
    return [{ id: row.id, workspaceId: row.workspaceId, slug: row.slug, app: definition.app }]
  })
}

async function expiredBookingIds(app: AppV2, now: Date) {
  const prokat = app.prokat!
  const holdMinutes = prokatHoldMinutes(prokat)
  if (holdMinutes == null || !prokat.statuses.notPickedUp) return [] as string[]

  const eligible = [prokat.statuses.request, prokat.statuses.confirmed]
  const stored = await db.select({ id: rows.id, data: rows.data }).from(rows)
    .where(and(eq(rows.tableId, prokat.bookingsTableId), isNull(rows.deletedAt)))
    .limit(500)

  const nowMs = now.getTime()
  const hits: string[] = []
  for (const row of stored) {
    const data = row.data as Record<string, unknown>
    const status = data[prokat.booking.status]
    if (!eligible.includes(String(status))) continue
    const from = textOf(data[prokat.booking.from])
    const holdUntil = resolveBookingHoldUntil({
      from,
      holdUntil: prokat.booking.holdUntil ? textOf(data[prokat.booking.holdUntil]) || null : null,
      holdAfterStartMinutes: holdMinutes,
    })
    if (!isHoldExpired(holdUntil, nowMs)) continue
    hits.push(row.id)
    if (hits.length >= batchBookings) break
  }
  return hits
}

/** One minute tick: cancel expired holds across published Прокат apps. Idempotent. */
export async function tickProkatHoldCancellations(now = new Date()) {
  const listed = await listProkatApps()
  const totals = { apps: 0, cancelled: 0, skipped: 0, failed: 0 }
  for (const entry of listed.slice(0, batchApps)) {
    totals.apps += 1
    let app = entry.app
    try {
      app = await db.transaction(async tx => ensureProkatHoldKit(tx, entry.app))
    } catch (error) {
      console.error('prokat hold ensure failed', entry.id, error instanceof Error ? error.name : '')
      totals.failed += 1
      continue
    }
    if (prokatHoldMinutes(app.prokat!) == null) continue
    const ids = await expiredBookingIds(app, now)
    for (const bookingId of ids) {
      const result = await cancelExpiredProkatHold(entry.workspaceId, app, bookingId, now)
      totals[result] += 1
    }
  }
  return totals
}

/** Test helper: force-scan one app without listing all publications. */
export async function tickProkatHoldForApp(app: AppV2, workspaceId: string, now = new Date()) {
  const ensured = await db.transaction(async tx => ensureProkatHoldKit(tx, app))
  const ids = await expiredBookingIds(ensured, now)
  const totals = { cancelled: 0, skipped: 0, failed: 0 }
  for (const bookingId of ids) {
    const result = await cancelExpiredProkatHold(workspaceId, ensured, bookingId, now)
    totals[result] += 1
  }
  return totals
}
