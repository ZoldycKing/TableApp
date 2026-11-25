/**
 * Prepares hold/no-show demo rows on the prokat-runtime fixture and runs one worker tick.
 * Expects /tmp/prokat-runtime.json from prokat-runtime.visual-setup.db.test.ts.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import type { AppV2 } from '@tableapp/schema/app-v2'

const envFile = resolve(import.meta.dirname, '../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const fixturePath = '/tmp/prokat-runtime.json'
if (!existsSync(fixturePath)) throw new Error('Missing /tmp/prokat-runtime.json — run prokat-runtime visual setup first')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  appId: string
  slug: string
  urls: Record<string, string>
  cookies: Record<string, string>
  rows?: Record<string, string>
  screens?: Record<string, string>
}

const { db, apps, rows, conversations, conversationMessages, businessCustomers } = await import('@tableapp/db')
const { ensureProkatHoldKit } = await import('../src/lib/prokat-hold-ensure')
const { tickProkatHoldForApp, cancelExpiredProkatHold } = await import('../src/lib/prokat-hold-worker')
const { newId } = await import('@tableapp/schema')
const { createHash, randomUUID } = await import('node:crypto')
const { PROKAT_NOT_PICKED_UP_CHAT, PROKAT_NOT_PICKED_UP_REASON_AUTO } = await import('../src/lib/prokat-logic')

const [appRow] = await db.select().from(apps).where(eq(apps.id, fixture.appId))
if (!appRow?.published) throw new Error('published app missing')
let read = readAppDefinition(appRow.published)
if (!read.ok || read.formatVersion !== 2 || !read.app.prokat) throw new Error('bad prokat')
let app = await db.transaction(async tx => ensureProkatHoldKit(tx, read.app))
const kit = app.prokat!

// Keep default 2h window for settings screenshot.
app = {
  ...app,
  prokat: { ...kit, holdAfterStartMinutes: 120 },
}
await db.update(apps).set({ published: app, draft: app }).where(eq(apps.id, fixture.appId))

const clients = await db.select().from(rows).where(and(eq(rows.tableId, kit.clientsTableId), isNull(rows.deletedAt)))
const client = clients.find(row =>
  String((row.data as Record<string, unknown>)[kit.client.email] ?? '').toLowerCase() === 'a.ivanov@mail.ru')
  ?? clients[0]!
const clientEmail = String((client.data as Record<string, unknown>)[kit.client.email] ?? '').toLowerCase()
const clientName = String((client.data as Record<string, unknown>)[kit.client.name] ?? 'Клиент')

const items = await db.select().from(rows).where(and(eq(rows.tableId, kit.itemsTableId), isNull(rows.deletedAt)))
const itemByName = (name: string) => {
  const hit = items.find(row => String((row.data as Record<string, unknown>)[kit.item.name] ?? '') === name)
  if (!hit) throw new Error(`Item not found: ${name}`)
  return hit
}
const trek = itemByName('Горный велосипед Trek Marlin 7')
const aqua = itemByName('SUP Aqua Marina Magma')
const kids = itemByName('Детский велосипед 20"')

const pastFrom = new Date(Date.now() - 3 * 3_600_000).toISOString()
const pastTo = new Date(Date.now() + 20 * 3_600_000).toISOString()
const holdUntil = new Date(Date.now() - 60_000).toISOString()
const openHoldUntil = new Date(Date.now() + 45 * 60_000).toISOString()
const openFrom = new Date(Date.now() - 30 * 60_000).toISOString()

const bookingValues = (input: {
  number: string
  title: string
  itemId: string
  statusId: string
  from: string
  to: string
  holdUntil?: string
  reason?: string
}) => {
  const values: Record<string, unknown> = {
    [kit.booking.number]: input.number,
    [kit.booking.title]: input.title,
    [kit.booking.client]: [client.id],
    [kit.booking.clientName]: clientName,
    [kit.booking.clientEmail]: clientEmail,
    [kit.booking.items]: [input.itemId],
    [kit.booking.from]: input.from,
    [kit.booking.to]: input.to,
    [kit.booking.price]: 1500,
    [kit.booking.deposit]: 5000,
    [kit.booking.lateFee]: 0,
    [kit.booking.status]: input.statusId,
    [kit.booking.issuePhotos]: '[]',
    [kit.booking.returnPhotos]: [],
    [kit.booking.createdAt]: new Date().toISOString(),
    [kit.booking.updatedAt]: new Date().toISOString(),
  }
  if (kit.booking.holdUntil && input.holdUntil) values[kit.booking.holdUntil] = input.holdUntil
  if (kit.booking.statusReason && input.reason) values[kit.booking.statusReason] = input.reason
  return values
}

// Drop prior HOLD* demo rows so re-runs stay consistent (title/item match).
const existingBookings = await db.select().from(rows).where(and(eq(rows.tableId, kit.bookingsTableId), isNull(rows.deletedAt)))
for (const row of existingBookings) {
  const number = String((row.data as Record<string, unknown>)[kit.booking.number] ?? '')
  if (!/^ПР-HOLD/.test(number)) continue
  await db.update(rows).set({ deletedAt: new Date() }).where(eq(rows.id, row.id))
}

const insertBooking = async (values: Record<string, unknown>) => {
  const id = newId('row')
  await db.insert(rows).values({
    id,
    tableId: kit.bookingsTableId,
    data: values,
    position: id,
  })
  return id
}

// Confirmed booking still within hold window — for «держится до» card.
const holdOpenId = await insertBooking(bookingValues({
  number: 'ПР-HOLD1',
  title: 'Горный велосипед Trek Marlin 7',
  itemId: trek.id,
  statusId: kit.statuses.confirmed,
  from: openFrom,
  to: pastTo,
  holdUntil: openHoldUntil,
}))

// Expired confirmed booking — worker will cancel.
const expireId = await insertBooking(bookingValues({
  number: 'ПР-HOLD2',
  title: 'SUP Aqua Marina Magma',
  itemId: aqua.id,
  statusId: kit.statuses.confirmed,
  from: pastFrom,
  to: pastTo,
  holdUntil,
}))

// Extra historical no-show so client counter shows «2 раза».
const priorNoShowId = await insertBooking(bookingValues({
  number: 'ПР-HOLD0',
  title: 'Детский велосипед 20"',
  itemId: kids.id,
  statusId: kit.statuses.notPickedUp!,
  from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
  to: new Date(Date.now() - 6 * 86_400_000).toISOString(),
  reason: PROKAT_NOT_PICKED_UP_REASON_AUTO,
}))

// Seed a chat on the expire booking so the worker posts a client message.
const [customer] = await db.select().from(businessCustomers)
  .where(and(eq(businessCustomers.workspaceId, app.workspaceId), eq(businessCustomers.email, clientEmail)))
let customerId = customer?.id
if (!customerId) {
  customerId = newId('businessCustomer')
  await db.insert(businessCustomers).values({ id: customerId, workspaceId: app.workspaceId, email: clientEmail })
}
const conversationId = `con_${newId('row').slice(4)}`
await db.insert(conversations).values({
  id: conversationId,
  workspaceId: app.workspaceId,
  appId: app.id,
  kind: 'record',
  moduleId: `mod_prokat_${kit.bookingsTableId}`,
  tableId: kit.bookingsTableId,
  rowId: expireId,
  customerId,
}).onConflictDoNothing()
await db.insert(conversationMessages).values({
  id: `msg_${newId('row').slice(4)}`,
  workspaceId: app.workspaceId,
  conversationId,
  authorId: `person_${createHash('sha256').update(`${app.workspaceId}:${clientEmail}`).digest('hex')}`,
  authorKind: 'client',
  authorName: clientName.slice(0, 80),
  requestId: randomUUID(),
  body: 'Скоро буду забирать.',
}).onConflictDoNothing()

const tick = await tickProkatHoldForApp(app, app.workspaceId)
const cancelled = await cancelExpiredProkatHold(app.workspaceId, app, expireId)
const [expiredRow] = await db.select().from(rows).where(eq(rows.id, expireId))
const expiredStatus = (expiredRow!.data as Record<string, unknown>)[kit.booking.status]

const nextFixture = {
  ...fixture,
  screens: {
    ...(fixture.screens ?? {}),
    dashboardScreenId: kit.dashboardScreenId,
    bookingScreenId: kit.bookingScreenId,
    timelineScreenId: kit.timelineScreenId,
    clientScreenId: kit.clientScreenId,
    clientsScreenId: kit.clientsScreenId,
    catalogScreenId: kit.catalogScreenId,
    itemScreenId: kit.itemScreenId,
  },
  rows: {
    ...(fixture.rows ?? {}),
    holdOpenBookingId: holdOpenId,
    notPickedUpBookingId: expireId,
    priorNoShowBookingId: priorNoShowId,
    clientId: client.id,
    settingsItemId: trek.id,
  },
  urls: {
    ...fixture.urls,
    staffDashboard: `${fixture.urls.staffDashboard.split('?')[0]}?screen=${kit.dashboardScreenId}`,
    staffHoldBooking: `${fixture.urls.staffBooking.split('?')[0]}?screen=${kit.bookingScreenId}&row=${holdOpenId}`,
    staffNotPickedUpBooking: `${fixture.urls.staffBooking.split('?')[0]}?screen=${kit.bookingScreenId}&row=${expireId}`,
    staffClientCard: `${fixture.urls.staffBookings.split('?')[0]}?screen=${kit.clientScreenId}&row=${client.id}`,
    staffTimeline: `${fixture.urls.staffTimeline.split('?')[0]}?screen=${kit.timelineScreenId}`,
    staffCatalog: fixture.urls.clientCatalog,
    staffItemSettings: `${fixture.urls.staffBookings.split('?')[0]}?screen=${kit.itemScreenId}&row=${trek.id}`,
  },
  hold: { tick, cancelled, expiredStatus, expectedNotPickedUp: kit.statuses.notPickedUp },
}

writeFileSync('/tmp/prokat-hold-e2e.json', JSON.stringify(nextFixture, null, 2))
console.log(JSON.stringify({
  ok: expiredStatus === kit.statuses.notPickedUp,
  tick,
  cancelled,
  holdOpenId,
  expireId,
  expireTitle: 'SUP Aqua Marina Magma',
  expireItem: 'SUP Aqua Marina Magma',
  clientId: client.id,
  chatHint: PROKAT_NOT_PICKED_UP_CHAT.slice(0, 40),
}, null, 2))

const { sql } = await import('@tableapp/db')
await sql.end()
process.exit(0)
