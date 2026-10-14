import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { appSchema, newId } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import { connectSalesInventory } from './sales-inventory-connection'
import { orderStockPair } from './order-stock-config'
import { STAFF_SESSION_COOKIE } from './auth'

const identity = vi.hoisted(() => ({ cookie: '', member: null as import('./session').Member | null }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === STAFF_SESSION_COOKIE && identity.cookie ? { value: identity.cookie } : undefined }) }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('production attachment to the shared business app in PostgreSQL', () => {
  let database: typeof import('@tableapp/db')
  const ownerId = newId('user'), ownerEmail = `${ownerId}@example.invalid`, managerEmail = `${newId('user')}@example.invalid`, clientEmail = `${newId('user')}@example.invalid`
  const spaces: string[] = [], sessions: string[] = []
  beforeAll(async () => {
    database = await import('@tableapp/db')
    await database.db.insert(database.users).values({ id: ownerId, email: ownerEmail })
  })
  beforeEach(() => { identity.cookie = ''; identity.member = null })
  afterAll(async () => {
    if (!database) return
    if (spaces.length) await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, spaces))
    if (sessions.length) await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.id, sessions))
    await database.db.delete(database.users).where(eq(database.users.id, ownerId))
    await database.sql.end()
  })

  async function business() {
    const workspaceId = newId('workspace'); spaces.push(workspaceId)
    const sales = templateExample('zakazy')
    sales.app.workspaceId = workspaceId; sales.app.slug = `production-install-${workspaceId}`
    sales.app.allowlist = [{ email: managerEmail, roleId: 'manager', company: '' }]
    const stock = connectSalesInventory(sales.app, managerEmail, new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))
    const app = stock.app, pair = orderStockPair(app)!
    const product = sales.built.rows.find(row => row.tableId === pair.inventory.tables.items)!
    product.data[pair.inventory.item.opening] = 5
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId, name: 'Synthetic production shop', slug: workspaceId, plan: 'business', businessProfile: { name: 'Synthetic production shop', location: '', phone: '' } })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId: ownerId, role: 'owner' })
    await database.db.insert(database.tables).values([...sales.built.tables.map(table => ({ ...table, workspaceId })), ...stock.tables])
    await database.db.insert(database.fields).values([...sales.built.fields, ...stock.fields])
    await database.db.insert(database.views).values([...sales.built.views, ...stock.views])
    await database.db.insert(database.rows).values(sales.built.rows)
    await database.db.insert(database.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app })
    return { app, pair, productId: product.id, workspaceId }
  }
  type Business = Awaited<ReturnType<typeof business>>
  function owner(space: Business) {
    identity.member = { userId: ownerId, email: ownerEmail, workspaceId: space.workspaceId, workspaceName: '', role: 'owner', name: 'Owner' }
  }
  async function signIn(email: string) {
    const id = newId('session'); sessions.push(id)
    await database.db.insert(database.staffSessions).values({ id, email, expiresAt: new Date(Date.now() + 3_600_000) })
    identity.cookie = id
  }
  async function reserve(space: Business) {
    const writes = await import('./row-mutations'), config = space.pair.order, token = randomUUID()
    await signIn(clientEmail)
    const author = { ...await (await import('./app-session')).currentAppAccess(space.app), ip: null }
    const order = await writes.writeRows(space.workspaceId, context => import('./customer-create').then(module => module.createCustomerRecord(context, space.app, config, {
      [config.cart!.fieldId]: JSON.stringify({ requestId: token, items: [{ id: space.productId, qty: 2 }] }), [config.submissionFieldId!]: token,
      [config.profile!.nameFieldId]: 'Ирина', [config.profile!.phoneFieldId]: '+7 900 000-00-00', [config.logistics!.addressFieldId]: 'Адрес для проверки',
    }, author)))
    await signIn(managerEmail)
    const [saved] = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, config.tableId), eq(database.rows.id, order.id)))
    await (await import('./order-stock')).confirmOrderStock(config.tableId, order.id, saved!.version, space.app.slug)
    return order.id
  }
  async function resources(space: Business) {
    return database.db.select({ id: database.tables.id }).from(database.tables).where(eq(database.tables.workspaceId, space.workspaceId))
  }
  async function record(space: Business) {
    return (await database.db.select().from(database.apps).where(eq(database.apps.id, space.app.id)))[0]!
  }

  it('installs into a draft while preserving products, published app and accepted reservations', async () => {
    const space = await business(), orderId = await reserve(space)
    const before = await record(space), tableCount = (await resources(space)).length
    const products = await database.db.select().from(database.rows).where(eq(database.rows.tableId, space.pair.inventory.tables.items))
    const reservations = await database.db.select().from(database.orderStockReservations).where(eq(database.orderStockReservations.workspaceId, space.workspaceId))
    const allocations = await database.db.select().from(database.orderStockItems).where(eq(database.orderStockItems.workspaceId, space.workspaceId))
    expect(reservations).toMatchObject([{ orderRowId: orderId, state: 'reserved' }])
    owner(space)
    const actions = await import('@/app/module-actions')
    const preview = await actions.previewModuleConnectionAction(space.app.id, 'proizvodstvo')
    expect(preview).toMatchObject({ ok: true, newTables: 4, reused: false })
    if (!preview.ok) throw new Error(preview.error)
    expect((await resources(space)).length).toBe(tableCount)
    expect(await actions.connectModuleAction(space.app.id, 'proizvodstvo', preview.expectedHash)).toMatchObject({ ok: true, already: false })
    const installed = await record(space), draft = appSchema.parse(installed.draft)
    expect(installed.published).toEqual(before.published)
    expect(draft.id).toBe(space.app.id); expect(draft.slug).toBe(space.app.slug)
    expect(draft.inventory).toEqual(space.app.inventory)
    expect(draft.customer).toEqual(space.app.customer)
    expect(draft.production).not.toBeNull()
    expect(await (await import('./app-references')).validateAppReferences(draft)).toBeNull()
    expect(await database.db.select().from(database.rows).where(eq(database.rows.tableId, space.pair.inventory.tables.items))).toEqual(products)
    expect(await database.db.select().from(database.orderStockReservations).where(eq(database.orderStockReservations.workspaceId, space.workspaceId))).toEqual(reservations)
    expect(await database.db.select().from(database.orderStockItems).where(eq(database.orderStockItems.workspaceId, space.workspaceId))).toEqual(allocations)
    expect(await database.db.select().from(database.rows).where(inArray(database.rows.tableId, Object.values(draft.production!.tables)))).toEqual([])
    expect((await resources(space)).length).toBe(tableCount + preview.newTables)
    expect(await actions.connectModuleAction(space.app.id, 'proizvodstvo', preview.expectedHash)).toMatchObject({ ok: true, already: true })
    expect((await resources(space)).length).toBe(tableCount + preview.newTables)
    expect(await (await import('@/app/app-actions')).publishAppAction(space.app.id)).toMatchObject({ ok: true })
    expect(appSchema.parse((await record(space)).published).production).toEqual(draft.production)
  })

  it('rejects existing-production reuse and stale previews without changing configuration or resources', async () => {
    const space = await business(), before = await record(space), tableCount = (await resources(space)).length
    owner(space)
    const actions = await import('@/app/module-actions')
    expect(await actions.previewModuleConnectionAction(space.app.id, 'proizvodstvo', 'existing-production')).toMatchObject({ ok: false, error: expect.stringContaining('Перенос существующего производства') })
    expect((await record(space)).draft).toEqual(before.draft)
    const preview = await actions.previewModuleConnectionAction(space.app.id, 'proizvodstvo')
    if (!preview.ok) throw new Error(preview.error)
    const changed = { ...appSchema.parse(before.draft), name: 'Updated production shop' }
    await database.db.update(database.apps).set({ draft: changed }).where(eq(database.apps.id, space.app.id))
    expect(await actions.connectModuleAction(space.app.id, 'proizvodstvo', preview.expectedHash)).toMatchObject({ ok: false, error: expect.stringContaining('Настройки изменились') })
    expect((await record(space)).draft).toEqual(changed)
    expect((await resources(space)).length).toBe(tableCount)
  })
})
