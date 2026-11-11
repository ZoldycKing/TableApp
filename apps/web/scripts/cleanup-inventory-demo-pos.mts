/**
 * Soft-delete purchase-order leftovers that reorder/e2e flows leave on the
 * inventory visual demo (sklad-3). Keeps only the three seed numbers.
 */
import { readFileSync } from 'node:fs'
import { and, eq, isNull } from 'drizzle-orm'
import { db, apps, rows } from '@tableapp/db'
import { readAppDefinition } from '@tableapp/schema/app-definition'

const fixturePath = process.argv[2] || '/tmp/inventory-visual-stage3a.json'
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { appId: string }
const [app] = await db.select().from(apps).where(eq(apps.id, fixture.appId))
if (!app) throw new Error(`app ${fixture.appId} not found`)
const read = readAppDefinition(app.published)
if (!read.ok || read.formatVersion !== 2 || !read.app.inventory?.purchaseOrdersTableId) {
  throw new Error('published inventory bindings missing')
}
const inv = read.app.inventory
const keep = new Set(['ЗК-0001', 'ЗК-0002', 'ЗК-0003'])
const numberId = inv.purchaseNumberFieldId!
const dateId = inv.purchaseDateFieldId!
const createdAtId = inv.purchaseCreatedAtFieldId
const orderField = inv.lineOrderFieldId
const now = new Date()
const pastIso = new Date(Date.now() - 2 * 86_400_000).toISOString()

const orders = await db.select().from(rows).where(and(eq(rows.tableId, inv.purchaseOrdersTableId!), isNull(rows.deletedAt)))
const keepIds = new Set<string>()
let deleted = 0
let fixed = 0
for (const row of orders) {
  const data = { ...(row.data as Record<string, unknown>) }
  const number = String(data[numberId] ?? '')
  if (!keep.has(number)) {
    await db.update(rows).set({ deletedAt: now }).where(eq(rows.id, row.id))
    deleted += 1
    continue
  }
  keepIds.add(row.id)
  if (number === 'ЗК-0001') {
    const date = String(data[dateId] ?? '')
    const ms = Date.parse(date)
    if (!Number.isFinite(ms) || ms > Date.now()) {
      data[dateId] = pastIso
      if (createdAtId) data[createdAtId] = pastIso
      await db.update(rows).set({ data }).where(eq(rows.id, row.id))
      fixed += 1
    }
  }
}

let orphanLines = 0
if (inv.purchaseLinesTableId && orderField) {
  const lines = await db.select().from(rows).where(and(eq(rows.tableId, inv.purchaseLinesTableId), isNull(rows.deletedAt)))
  for (const line of lines) {
    const data = line.data as Record<string, unknown>
    const raw = data[orderField]
    const orderId = typeof raw === 'string' ? raw
      : Array.isArray(raw) ? raw.find((id): id is string => typeof id === 'string') : undefined
    if (orderId && !keepIds.has(orderId)) {
      await db.update(rows).set({ deletedAt: now }).where(eq(rows.id, line.id))
      orphanLines += 1
    }
  }
}

console.log(JSON.stringify({ ok: true, deleted, fixed, orphanLines, kept: [...keepIds].length }, null, 2))
process.exit(0)
