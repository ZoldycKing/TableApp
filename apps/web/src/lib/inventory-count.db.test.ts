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

describe.skipIf(!process.env.DATABASE_URL)('inventory counts', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/template-actions')
  let writeRows: typeof import('./row-mutations').writeRows
  let createInventoryCount: typeof import('./inventory-count').createInventoryCount
  let updateInventoryCount: typeof import('./inventory-count').updateInventoryCount
  let postInventoryCount: typeof import('./inventory-count').postInventoryCount
  let cancelInventoryCount: typeof import('./inventory-count').cancelInventoryCount
  const userId = newId('user'), workspaceId = newId('workspace')
  const email = `counts-${userId}@example.invalid`
  let appId: string
  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/template-actions')
    ;({ writeRows } = await import('./row-mutations'))
    ;({
      createInventoryCount,
      updateInventoryCount,
      postInventoryCount,
      cancelInventoryCount,
    } = await import('./inventory-count'))
    await database.db.insert(database.users).values({ id: userId, email })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'Counts', slug: `counts-${workspaceId}` })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
  })
  beforeEach(async () => {
    identity.member = { userId, workspaceId, workspaceName: 'Counts', email, name: 'Owner', role: 'owner' }
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

  const warehouseByName = async (inv: NonNullable<(Awaited<ReturnType<typeof definition>>)['inventory']>, name: string) => {
    const warehouses = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv!.warehousesTableId), isNull(database.rows.deletedAt)))
    return warehouses.find(row => dataOf(row)[inv!.warehouseNameFieldId] === name)!
  }

  const productBySku = async (inv: NonNullable<(Awaited<ReturnType<typeof definition>>)['inventory']>, sku: string) => {
    const products = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv!.itemsTableId), isNull(database.rows.deletedAt)))
    return products.find(row => dataOf(row)[inv!.itemSkuFieldId!] === sku)!
  }

  const stockAt = async (
    inv: NonNullable<(Awaited<ReturnType<typeof definition>>)['inventory']>,
    productId: string,
    warehouseId: string,
  ) => {
    const [product] = await database.db.select().from(database.rows).where(eq(database.rows.id, productId))
    const linked = (dataOf(product!)[inv!.itemMovementsFieldId] as string[]) ?? []
    const journal = linked.length
      ? await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv!.movementsTableId), isNull(database.rows.deletedAt)))
      : []
    let stock = Number(dataOf(product!)[inv!.itemOpeningFieldId] ?? 0)
    for (const movement of journal) {
      if (!linked.includes(movement.id)) continue
      const data = dataOf(movement)
      const warehouse = data[inv!.movementWarehouseFieldId]
      const match = warehouse === warehouseId || Array.isArray(warehouse) && warehouse.includes(warehouseId)
      if (!match) continue
      stock += Number(data[inv!.movementQtyFieldId] ?? 0)
    }
    return stock
  }

  it('lets staff create a draft and save actuals, but not post or cancel', async () => {
    const app = await definition()
    const inv = app.inventory!
    const staff = actor(['staff'])
    const owner = actor(['owner'])
    const warehouse = await warehouseByName(inv, 'Главный склад')
    const filter = await productBySku(inv, 'FA-120')
    const coolant = await productBySku(inv, 'R410-11')
    const created = await writeRows(workspaceId, context => createInventoryCount(context, app, staff, {
      [inv.countWarehouseFieldId!]: [warehouse.id],
      [inv.countDateFieldId!]: new Date().toISOString().slice(0, 10),
      [inv.countPayloadFieldId!]: JSON.stringify({
        lines: [
          { productId: filter.id, actualQty: 4 },
          { productId: coolant.id, actualQty: 1 },
        ],
      }),
    }))
    const [draft] = await database.db.select().from(database.rows).where(eq(database.rows.id, created.id))
    expect(dataOf(draft!)).toMatchObject({
      [inv.countStatusFieldId!]: inv.countStatusDraft,
      [inv.countNumberFieldId!]: 'ИН-0002',
      [inv.countProductCountFieldId!]: 2,
      [inv.countDiscrepancyCountFieldId!]: 1,
    })
    expect(String(dataOf(draft!)[inv.countCreatedAtFieldId!] ?? '')).toBeTruthy()
    const lineIds = dataOf(draft!)[inv.countLinesFieldId!] as string[]
    expect(lineIds).toHaveLength(2)

    await writeRows(workspaceId, context => updateInventoryCount(context, app, staff, {
      [inv.countDateFieldId!]: new Date().toISOString().slice(0, 10),
      [inv.countPayloadFieldId!]: JSON.stringify({
        lines: [
          { productId: filter.id, actualQty: 5 },
          { productId: coolant.id, actualQty: 0 },
        ],
      }),
    }, created.id))
    const [updated] = await database.db.select().from(database.rows).where(eq(database.rows.id, created.id))
    expect(dataOf(updated!)[inv.countDiscrepancyCountFieldId!]).toBe(2)
    const lines = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.inventoryCountLinesTableId!), isNull(database.rows.deletedAt)))
    const updatedLines = (dataOf(updated!)[inv.countLinesFieldId!] as string[]).map(id => lines.find(row => row.id === id)!)
    expect(updatedLines.map(row => Number(dataOf(row)[inv.countLineActualFieldId!]))).toEqual(expect.arrayContaining([5, 0]))

    await expect(writeRows(workspaceId, context => postInventoryCount(context, app, staff, created.id))).rejects.toThrow(/владельц/)
    await expect(writeRows(workspaceId, context => cancelInventoryCount(context, app, staff, created.id))).rejects.toThrow(/владельц/)
    const [stillDraft] = await database.db.select().from(database.rows).where(eq(database.rows.id, created.id))
    expect(dataOf(stillDraft!)[inv.countStatusFieldId!]).toBe(inv.countStatusDraft)

    await writeRows(workspaceId, context => postInventoryCount(context, app, owner, created.id))
    await expect(writeRows(workspaceId, context => cancelInventoryCount(context, app, staff, created.id))).rejects.toThrow(/владельц/)
  })

  it('posts one Инвентаризация movement per discrepancy, updates stock, and blocks negative stock', async () => {
    const app = await definition()
    const inv = app.inventory!
    const owner = actor(['owner'])
    const warehouse = await warehouseByName(inv, 'Главный склад')
    const filter = await productBySku(inv, 'FA-120')
    const pump = await productBySku(inv, 'PMP-2560')
    const beforeFilter = await stockAt(inv, filter.id, warehouse.id)
    const beforePump = await stockAt(inv, pump.id, warehouse.id)
    expect(beforeFilter).toBeGreaterThan(0)
    expect(beforePump).toBeGreaterThan(0)

    const created = await writeRows(workspaceId, context => createInventoryCount(context, app, owner, {
      [inv.countWarehouseFieldId!]: [warehouse.id],
      [inv.countDateFieldId!]: new Date().toISOString().slice(0, 10),
      [inv.countPayloadFieldId!]: JSON.stringify({
        lines: [
          { productId: filter.id, actualQty: beforeFilter - 1 },
          { productId: pump.id, actualQty: beforePump + 2 },
        ],
      }),
    }))
    const movementsBefore = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.movementsTableId), isNull(database.rows.deletedAt)))
    const posted = await writeRows(workspaceId, context => postInventoryCount(context, app, owner, created.id))
    expect(posted.discrepancies).toHaveLength(2)
    const [row] = await database.db.select().from(database.rows).where(eq(database.rows.id, created.id))
    expect(dataOf(row!)[inv.countStatusFieldId!]).toBe(inv.countStatusPosted)
    expect(String(dataOf(row!)[inv.countPostedAtFieldId!] ?? '')).toBeTruthy()
    expect(String(dataOf(row!)[inv.countPostedByFieldId!] ?? '')).toBeTruthy()

    const movements = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.movementsTableId), isNull(database.rows.deletedAt)))
    const added = movements.filter(item => !movementsBefore.some(before => before.id === item.id))
    expect(added).toHaveLength(2)
    for (const movement of added) {
      expect(dataOf(movement)[inv.movementTypeFieldId]).toBe(inv.typeInventory)
      expect(dataOf(movement)[inv.movementWarehouseFieldId]).toEqual([warehouse.id])
    }
    expect(added.map(item => Number(dataOf(item)[inv.movementQtyFieldId]))).toEqual(expect.arrayContaining([-1, 2]))
    expect(await stockAt(inv, filter.id, warehouse.id)).toBe(beforeFilter - 1)
    expect(await stockAt(inv, pump.id, warehouse.id)).toBe(beforePump + 2)

    const coolant = await productBySku(inv, 'R410-11')
    const beforeCoolant = await stockAt(inv, coolant.id, warehouse.id)
    expect(beforeCoolant).toBeGreaterThan(0)
    const blocked = await writeRows(workspaceId, context => createInventoryCount(context, app, owner, {
      [inv.countWarehouseFieldId!]: [warehouse.id],
      [inv.countDateFieldId!]: new Date().toISOString().slice(0, 10),
      [inv.countPayloadFieldId!]: JSON.stringify({
        lines: [{ productId: coolant.id, actualQty: 0 }],
      }),
    }))
    await writeRows(workspaceId, async context => {
      const { recordInventoryMovement } = await import('./inventory-movement')
      await recordInventoryMovement(context, app, owner, 'issue', {
        [inv.movementQtyFieldId]: beforeCoolant,
        [inv.movementWarehouseFieldId]: [warehouse.id],
        [inv.movementNoteFieldId]: 'Сняли до проведения',
        [inv.movementDateFieldId]: new Date().toISOString(),
      }, coolant.id)
    })
    expect(await stockAt(inv, coolant.id, warehouse.id)).toBe(0)
    await expect(writeRows(workspaceId, context => postInventoryCount(context, app, owner, blocked.id))).rejects.toThrow(/Недостаточно товара/)
    const [stillDraft] = await database.db.select().from(database.rows).where(eq(database.rows.id, blocked.id))
    expect(dataOf(stillDraft!)[inv.countStatusFieldId!]).toBe(inv.countStatusDraft)
  })

  it('lets an owner cancel a posted count and reverse corrections', async () => {
    const app = await definition()
    const inv = app.inventory!
    const owner = actor(['owner'])
    const warehouse = await warehouseByName(inv, 'Главный склад')
    const gloves = await productBySku(inv, 'GLV-10')
    const before = await stockAt(inv, gloves.id, warehouse.id)
    const created = await writeRows(workspaceId, context => createInventoryCount(context, app, owner, {
      [inv.countWarehouseFieldId!]: [warehouse.id],
      [inv.countDateFieldId!]: new Date().toISOString().slice(0, 10),
      [inv.countPayloadFieldId!]: JSON.stringify({
        lines: [{ productId: gloves.id, actualQty: before + 3 }],
      }),
    }))
    await writeRows(workspaceId, context => postInventoryCount(context, app, owner, created.id))
    expect(await stockAt(inv, gloves.id, warehouse.id)).toBe(before + 3)
    const movementsAtCancel = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.movementsTableId), isNull(database.rows.deletedAt)))
    await writeRows(workspaceId, context => cancelInventoryCount(context, app, owner, created.id))
    const [cancelled] = await database.db.select().from(database.rows).where(eq(database.rows.id, created.id))
    expect(dataOf(cancelled!)[inv.countStatusFieldId!]).toBe(inv.countStatusCancelled)
    expect(String(dataOf(cancelled!)[inv.countCancelledAtFieldId!] ?? '')).toBeTruthy()
    expect(String(dataOf(cancelled!)[inv.countCancelledByFieldId!] ?? '')).toBeTruthy()
    const movementsAfter = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, inv.movementsTableId), isNull(database.rows.deletedAt)))
    const reverse = movementsAfter.filter(row => !movementsAtCancel.some(beforeRow => beforeRow.id === row.id))
    expect(reverse).toHaveLength(1)
    expect(dataOf(reverse[0]!)).toMatchObject({
      [inv.movementQtyFieldId]: -3,
      [inv.movementTypeFieldId]: inv.typeInventory,
      [inv.movementWarehouseFieldId]: [warehouse.id],
      [inv.movementItemFieldId]: [gloves.id],
    })
    expect(String(dataOf(reverse[0]!)[inv.movementNoteFieldId] ?? '')).toMatch(/Отмена|сторно/i)
    expect(await stockAt(inv, gloves.id, warehouse.id)).toBe(before)
  })
})
