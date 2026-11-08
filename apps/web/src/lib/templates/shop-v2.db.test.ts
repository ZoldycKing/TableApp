import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { newId } from '@tableapp/schema'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBuilderV2Catalog } from '../builder-v2'
import { placeShopOrder } from '../shop-order'
import { writeRows } from '../row-mutations'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('../session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('../session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('installed shop v2 orders', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/template-actions')
  const userId = newId('user'), workspaceId = newId('workspace')
  const email = `shop-v2-${userId}@example.invalid`
  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/template-actions')
    await database.db.insert(database.users).values({ id: userId, email })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'Shop v2', slug: `shop-v2-${workspaceId}` })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
  })
  beforeEach(async () => {
    identity.member = { userId, workspaceId, workspaceName: 'Shop v2', email, name: 'Owner', role: 'owner' }
    await database.db.delete(database.apps).where(eq(database.apps.workspaceId, workspaceId))
    await database.db.delete(database.tables).where(eq(database.tables.workspaceId, workspaceId))
  })
  afterAll(async () => {
    if (!database) return
    const { deleteFile } = await import('../storage')
    const files = await database.db.select({ key: database.attachments.key }).from(database.attachments).where(eq(database.attachments.workspaceId, workspaceId))
    await Promise.all(files.map(file => deleteFile(file.key)))
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
  })

  it('installs owned tables, sample relations and a valid v2 draft, then places one order for one submission', async () => {
    const installed = await actions.applyTemplateAction('zakazy')
    if (!installed.ok) throw new Error(installed.error)
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, installed.appId))
    const read = readAppDefinition(record!.draft)
    if (!read.ok || read.formatVersion !== 2 || !read.app.shop) throw new Error('Shop draft is not builder v2')
    const { catalog } = await loadBuilderV2Catalog(workspaceId)
    expect(validateAppV2Definition(read.app, catalog, { mode: 'publish' })).toEqual({ ok: true, app: read.app })
    const shop = read.app.shop
    const products = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, shop.catalogTableId), isNull(database.rows.deletedAt)))
    const files = await database.db.select().from(database.attachments).where(eq(database.attachments.tableId, shop.catalogTableId))
    expect(files).toHaveLength(products.length)
    const product = products.find(row => (row.data as Record<string, unknown>)[shop.activeFieldId] === true)!
    const price = (product.data as Record<string, unknown>)[shop.priceFieldId]
    const token = randomUUID()
    const create = read.app.policy.tables.find(rule => rule.tableId === shop.ordersTableId)!.grants.find(grant => grant.audience.kind === 'roles' && grant.audience.roleIds.includes('client'))!.create!
    const values: Record<string, string> = {
      [shop.cartFieldId]: JSON.stringify({ requestId: token, items: [{ id: product.id, qty: 2 }] }),
      [shop.submissionFieldId]: token,
    }
    for (const id of create.fieldIds) {
      const type = catalog.fields.get(id)?.type
      if (values[id] != null) continue
      values[id] = type === 'phone' ? '+79990000000' : type === 'email' ? 'buyer@example.invalid' : 'Ирина'
    }
    const buyer = { authenticated: true, roleIds: ['client'], id: userId, email: 'buyer@example.invalid', name: 'Ирина', company: '' }
    const place = () => writeRows(workspaceId, context => placeShopOrder(context, read.app, buyer, values))
    const first = await place(), second = await place()
    expect(second.id).toBe(first.id)
    const orders = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, shop.ordersTableId), isNull(database.rows.deletedAt)))
    const created = orders.filter(row => !row.sample)
    expect(created.map(row => row.id)).toEqual([first.id])
    expect((created[0]!.data as Record<string, unknown>)[shop.emailFieldId]).toBe('buyer@example.invalid')
    expect((created[0]!.data as Record<string, unknown>)[shop.statusFieldId]).toBe(shop.initialStatus)
    expect(created[0]!.data).not.toHaveProperty(shop.cartFieldId)
    const lineIds = (created[0]!.data as Record<string, unknown>)[shop.positionsFieldId] as string[]
    expect(lineIds).toHaveLength(1)
    const [line] = await database.db.select().from(database.rows).where(eq(database.rows.id, lineIds[0]!))
    expect(line!.data).toMatchObject({ [shop.itemPriceFieldId]: price, [shop.itemQtyFieldId]: 2, [shop.productFieldId]: [product.id], [shop.itemEmailFieldId]: 'buyer@example.invalid' })
    await expect(writeRows(workspaceId, context => placeShopOrder(context, read.app, { ...buyer, email: 'other@example.invalid' }, values))).rejects.toThrow(/Обновите форму/)
    await database.db.update(database.rows).set({ data: { ...(product.data as object), [shop.activeFieldId]: false } }).where(eq(database.rows.id, product.id))
    const blocked = randomUUID()
    await expect(writeRows(workspaceId, context => placeShopOrder(context, read.app, buyer, { ...values, [shop.submissionFieldId]: blocked, [shop.cartFieldId]: JSON.stringify({ requestId: blocked, items: [{ id: product.id, qty: 1 }] }) }))).rejects.toThrow(/недоступен/)
    const preparation = await import('../template-preparation')
    expect((await preparation.templatePreparation(workspaceId, installed.appId))!.samples).toBeGreaterThan(0)
    expect(await actions.clearTemplateSamplesAction(installed.appId)).toEqual({ ok: true })
    const remaining = await database.db.select().from(database.rows).where(and(inArray(database.rows.tableId, installed.tableIds), isNull(database.rows.deletedAt)))
    expect(remaining.some(row => row.id === first.id)).toBe(true)
    expect(remaining.some(row => row.id === product.id)).toBe(true)
  })
})
