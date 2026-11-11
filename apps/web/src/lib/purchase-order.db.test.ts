import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { appV2Schema, type AppV2Actor } from '@tableapp/schema/app-v2'
import { newId } from '@tableapp/schema'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeRows } from './row-mutations'
import { cancelPurchaseOrder, createPurchaseOrder, orderPurchaseOrder, receivePurchaseOrder, updatePurchaseOrder } from './purchase-order'

const envFile = resolve(import.meta.dirname, '../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('purchase orders', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/template-actions')
  const userId = newId('user'), workspaceId = newId('workspace')
  const email = `purchases-${userId}@example.invalid`
  let appId: string
  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/template-actions')
    await database.db.insert(database.users).values({ id: userId, email })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'Purchases', slug: `purchases-${workspaceId}` })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
  })
  beforeEach(async () => {
    identity.member = { userId, workspaceId, workspaceName: 'Purchases', email, name: 'Owner', role: 'owner' }
    await database.db.delete(database.apps).where(eq(database.apps.workspaceId, workspaceId))
    await database.db.delete(database.tables).where(eq(database.tables.workspaceId, workspaceId))
    const applied = await actions.applyTemplateAction('sklad')
    if (!applied.ok) throw new Error(applied.error)
    appId = applied.appId
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
  })

  const definition = async () => {
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, appId))
    return appV2Schema.parse(record!.draft)
  }
  const actor = (roleIds: string[]): AppV2Actor => ({ authenticated: true, roleIds, id: userId, email, company: '' })
  const dataOf = (row: { data: unknown }) => row.data as Record<string, unknown>

  it('receives an ordered purchase once, blocks a second receipt, and keeps cancel owner-only', async () => {
    const app = await definition()
    const inv = app.inventory!
    const orders = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.purchaseOrdersTableId!), isNull(database.rows.deletedAt)))
    const ordered = orders.find(row => dataOf(row)[inv.purchaseStatusFieldId!] === inv.statusOrdered)!
    const received = orders.find(row => dataOf(row)[inv.purchaseStatusFieldId!] === inv.statusReceived)!
    const lineIds = dataOf(ordered)[inv.purchaseLinesFieldId!] as string[]
    const [line] = await database.db.select().from(database.rows).where(eq(database.rows.id, lineIds[0]!))
    const productId = (dataOf(line!)[inv.lineProductFieldId!] as string[])[0]!
    const qty = Number(dataOf(line!)[inv.lineQtyFieldId!])
    const warehouseId = (dataOf(ordered)[inv.purchaseWarehouseFieldId!] as string[])[0]!
    const [product] = await database.db.select().from(database.rows).where(eq(database.rows.id, productId))
    const beforeLinks = (dataOf(product!)[inv.itemMovementsFieldId] as string[]).length
    const movementsBefore = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.movementsTableId), isNull(database.rows.deletedAt)))

    const staff = actor(['staff'])
    const owner = actor(['owner'])
    const raced = await Promise.allSettled([
      writeRows(workspaceId, context => receivePurchaseOrder(context, app, staff, ordered.id)),
      writeRows(workspaceId, context => receivePurchaseOrder(context, app, owner, ordered.id)),
    ])
    expect(raced.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    expect(raced.filter(item => item.status === 'rejected')).toHaveLength(1)
    const [got] = await database.db.select().from(database.rows).where(eq(database.rows.id, ordered.id))
    expect(dataOf(got!)[inv.purchaseStatusFieldId!]).toBe(inv.statusReceived)
    const movements = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.movementsTableId), isNull(database.rows.deletedAt)))
    const added = movements.filter(row => !movementsBefore.some(before => before.id === row.id))
    expect(added).toHaveLength(1)
    expect(dataOf(added[0]!)).toMatchObject({
      [inv.movementQtyFieldId]: qty,
      [inv.movementTypeFieldId]: inv.typeReceipt,
      [inv.movementWarehouseFieldId]: [warehouseId],
      [inv.movementItemFieldId]: [productId],
    })
    const [productAfter] = await database.db.select().from(database.rows).where(eq(database.rows.id, productId))
    const links = dataOf(productAfter!)[inv.itemMovementsFieldId] as string[]
    expect(links).toHaveLength(beforeLinks + 1)
    expect(links).toContain(added[0]!.id)
    await expect(writeRows(workspaceId, context => receivePurchaseOrder(context, app, staff, ordered.id))).rejects.toThrow(/Повторная приёмка невозможна/)

    const movementsAtCancel = movements.length
    await expect(writeRows(workspaceId, context => cancelPurchaseOrder(context, app, staff, received.id))).rejects.toThrow(/владельц/)
    await writeRows(workspaceId, context => cancelPurchaseOrder(context, app, owner, received.id))
    const [cancelled] = await database.db.select().from(database.rows).where(eq(database.rows.id, received.id))
    expect(dataOf(cancelled!)[inv.purchaseStatusFieldId!]).toBe(inv.statusCancelled)
    const movementsAfterCancel = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.movementsTableId), isNull(database.rows.deletedAt)))
    expect(movementsAfterCancel).toHaveLength(movementsAtCancel)
  })

  it('lets a storekeeper create and receive a draft, and refuses editing a received order', async () => {
    const app = await definition()
    const inv = app.inventory!
    const staff = actor(['staff'])
    const [supplier] = await database.db.select().from(database.rows).where(eq(database.rows.tableId, inv.suppliersTableId!))
    const [warehouse] = await database.db.select().from(database.rows).where(eq(database.rows.tableId, inv.warehousesTableId))
    const [product] = await database.db.select().from(database.rows).where(eq(database.rows.tableId, inv.itemsTableId))
    const values = {
      [inv.purchaseSupplierFieldId!]: [supplier!.id],
      [inv.purchaseWarehouseFieldId!]: [warehouse!.id],
      [inv.purchaseDateFieldId!]: new Date().toISOString(),
      [inv.purchaseCommentFieldId!]: 'Проверка',
      [inv.purchasePayloadFieldId!]: JSON.stringify({ lines: [{ productId: product!.id, qty: 2, price: 10.5 }] }),
    }
    const created = await writeRows(workspaceId, context => createPurchaseOrder(context, app, staff, values))
    const [order] = await database.db.select().from(database.rows).where(eq(database.rows.id, created.id))
    expect(dataOf(order!)).toMatchObject({
      [inv.purchaseStatusFieldId!]: inv.statusDraft,
      [inv.purchaseTotalFieldId!]: 21,
      [inv.purchaseCountFieldId!]: 1,
    })
    expect(dataOf(order!)).not.toHaveProperty(inv.purchasePayloadFieldId!)
    const lineIds = dataOf(order!)[inv.purchaseLinesFieldId!] as string[]
    expect(lineIds).toHaveLength(1)
    await expect(writeRows(workspaceId, context => receivePurchaseOrder(context, app, staff, created.id))).rejects.toThrow(/Заказано/)
    await writeRows(workspaceId, context => orderPurchaseOrder(context, app, staff, created.id))
    await writeRows(workspaceId, context => receivePurchaseOrder(context, app, staff, created.id))
    const [received] = await database.db.select().from(database.rows).where(eq(database.rows.id, created.id))
    expect(dataOf(received!)[inv.purchaseStatusFieldId!]).toBe(inv.statusReceived)
    await expect(writeRows(workspaceId, context => updatePurchaseOrder(context, app, staff, values, created.id))).rejects.toThrow(/нельзя изменить/)
    await expect(writeRows(workspaceId, context => receivePurchaseOrder(context, app, { ...staff, authenticated: false, id: null, email: null }, created.id))).rejects.toThrow(/войти/)
  })
})
