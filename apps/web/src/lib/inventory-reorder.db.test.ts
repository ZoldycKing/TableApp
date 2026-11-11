import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { appV2Schema, type AppV2Actor } from '@tableapp/schema/app-v2'
import { newId } from '@tableapp/schema'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('inventory reorder', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/template-actions')
  let writeRows: typeof import('./row-mutations').writeRows
  let createReorderOrders: typeof import('./inventory-reorder').createReorderOrders
  let receivePurchaseOrder: typeof import('./purchase-order').receivePurchaseOrder
  const userId = newId('user'), workspaceId = newId('workspace')
  const email = `reorder-${userId}@example.invalid`
  let appId: string
  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/template-actions')
    ;({ writeRows } = await import('./row-mutations'))
    ;({ createReorderOrders } = await import('./inventory-reorder'))
    ;({ receivePurchaseOrder } = await import('./purchase-order'))
    await database.db.insert(database.users).values({ id: userId, email })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'Reorder', slug: `reorder-${workspaceId}` })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
  })
  beforeEach(async () => {
    identity.member = { userId, workspaceId, workspaceName: 'Reorder', email, name: 'Owner', role: 'owner' }
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

  const productBySku = async (inv: NonNullable<(Awaited<ReturnType<typeof definition>>)['inventory']>, sku: string) => {
    const products = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv!.itemsTableId), isNull(database.rows.deletedAt)))
    return products.find(row => dataOf(row)[inv!.itemSkuFieldId!] === sku)!
  }

  const payloadField = (inv: NonNullable<(Awaited<ReturnType<typeof definition>>)['inventory']>) =>
    inv!.reorderPayloadFieldId ?? inv!.purchasePayloadFieldId!

  it('groups selected products into draft POs by last received supplier', async () => {
    const app = await definition()
    const inv = app.inventory!
    const staff = actor(['staff'])
    const orders = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.purchaseOrdersTableId!), isNull(database.rows.deletedAt)))
    const ordered = orders.find(row => dataOf(row)[inv.purchaseStatusFieldId!] === inv.statusOrdered)!
    await writeRows(workspaceId, context => receivePurchaseOrder(context, app, staff, ordered.id))

    const thermostat = await productBySku(inv, 'KTS-011')
    const boxes = await productBySku(inv, 'BOX-403020')
    const result = await writeRows(workspaceId, context => createReorderOrders(context, app, staff, {
      [payloadField(inv)]: JSON.stringify({
        products: [{ productId: thermostat.id }, { productId: boxes.id }],
      }),
    }))
    expect(result.groups).toBe(2)
    expect(result.ids).toHaveLength(2)

    const drafts = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.purchaseOrdersTableId!), isNull(database.rows.deletedAt)))
    const created = result.ids.map(id => drafts.find(row => row.id === id)!)
    expect(created.every(row => dataOf(row)[inv.purchaseStatusFieldId!] === inv.statusDraft)).toBe(true)
    const suppliers = created.map(row => {
      const value = dataOf(row)[inv.purchaseSupplierFieldId!]
      return Array.isArray(value) ? value[0] : value
    })
    expect(new Set(suppliers).size).toBe(2)
    expect(suppliers.every(id => typeof id === 'string' && id.length > 0)).toBe(true)

    const lines = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.purchaseLinesTableId!), isNull(database.rows.deletedAt)))
    for (const order of created) {
      const lineIds = dataOf(order)[inv.purchaseLinesFieldId!] as string[]
      expect(lineIds).toHaveLength(1)
      const line = lines.find(row => row.id === lineIds[0]!)!
      const productId = (dataOf(line)[inv.lineProductFieldId!] as string[])[0]!
      expect([thermostat.id, boxes.id]).toContain(productId)
    }
  })

  it('puts a product without supplier history into a draft with empty supplier', async () => {
    const app = await definition()
    const inv = app.inventory!
    const staff = actor(['staff'])
    const coolant = await productBySku(inv, 'R410-11')
    const result = await writeRows(workspaceId, context => createReorderOrders(context, app, staff, {
      [payloadField(inv)]: JSON.stringify({ products: [{ productId: coolant.id }] }),
    }))
    expect(result.ids).toHaveLength(1)
    const [order] = await database.db.select().from(database.rows).where(eq(database.rows.id, result.id))
    expect(dataOf(order!)[inv.purchaseStatusFieldId!]).toBe(inv.statusDraft)
    expect(dataOf(order!)[inv.purchaseSupplierFieldId!]).toEqual([])
    expect(String(dataOf(order!)[inv.purchaseNameFieldId!] ?? '')).toMatch(/без поставщика/i)
  })

  it('fills qty from min-stock gap and price from last purchase when available', async () => {
    const app = await definition()
    const inv = app.inventory!
    const staff = actor(['staff'])
    const thermostat = await productBySku(inv, 'KTS-011')
    const pump = await productBySku(inv, 'PMP-2560')
    const thermoMin = Number(dataOf(thermostat)[inv.itemMinFieldId] ?? 0)
    const thermoOpening = Number(dataOf(thermostat)[inv.itemOpeningFieldId] ?? 0)
    const thermoLinks = (dataOf(thermostat)[inv.itemMovementsFieldId] as string[]) ?? []
    const pumpMin = Number(dataOf(pump)[inv.itemMinFieldId] ?? 0)
    const pumpOpening = Number(dataOf(pump)[inv.itemOpeningFieldId] ?? 0)
    const pumpLinks = (dataOf(pump)[inv.itemMovementsFieldId] as string[]) ?? []
    const movements = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.movementsTableId), isNull(database.rows.deletedAt)))
    const stockOf = (opening: number, links: string[]) =>
      opening + movements.filter(row => links.includes(row.id)).reduce((sum, row) => sum + Number(dataOf(row)[inv.movementQtyFieldId] ?? 0), 0)
    const thermoStock = stockOf(thermoOpening, thermoLinks)
    const pumpStock = stockOf(pumpOpening, pumpLinks)
    const expectedThermoQty = Math.max(1, thermoMin - thermoStock)
    const expectedPumpQty = Math.max(1, pumpMin - pumpStock)
    const pumpCost = Number(dataOf(pump)[inv.itemCostFieldId] ?? 0)

    const result = await writeRows(workspaceId, context => createReorderOrders(context, app, staff, {
      [payloadField(inv)]: JSON.stringify({
        products: [{ productId: thermostat.id }, { productId: pump.id }],
      }),
    }))
    expect(result.groups).toBe(2)
    const lines = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.purchaseLinesTableId!), isNull(database.rows.deletedAt)))
    const drafts = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.purchaseOrdersTableId!), isNull(database.rows.deletedAt)))
    const created = result.ids.map(id => drafts.find(row => row.id === id)!)
    const lineFor = (productId: string) => {
      for (const order of created) {
        for (const lineId of dataOf(order)[inv.purchaseLinesFieldId!] as string[]) {
          const line = lines.find(row => row.id === lineId)!
          if ((dataOf(line)[inv.lineProductFieldId!] as string[])[0] === productId) return { order, line }
        }
      }
      throw new Error(`missing line for ${productId}`)
    }
    const thermo = lineFor(thermostat.id)
    expect(dataOf(thermo.line)[inv.lineQtyFieldId!]).toBe(expectedThermoQty)
    expect(dataOf(thermo.line)[inv.linePriceFieldId!]).toBe(2450)
    expect((dataOf(thermo.order)[inv.purchaseSupplierFieldId!] as string[]).length).toBe(1)

    const pumpLine = lineFor(pump.id)
    expect(dataOf(pumpLine.line)[inv.lineQtyFieldId!]).toBe(expectedPumpQty)
    expect(dataOf(pumpLine.line)[inv.linePriceFieldId!]).toBe(pumpCost)
    expect(dataOf(pumpLine.order)[inv.purchaseSupplierFieldId!]).toEqual([])
  })
})
