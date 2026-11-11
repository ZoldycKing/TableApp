import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { newId, positionBetween } from '@tableapp/schema'
import { appV2Schema } from '@tableapp/schema/app-v2'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('warehouse first launch in Postgres', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/template-actions')
  let prepare: typeof import('./inventory-preparation')
  const userId = newId('user'), workspaceId = newId('workspace')
  const email = `inventory-start-${userId}@example.invalid`
  let appId: string
  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/template-actions')
    prepare = await import('./inventory-preparation')
    await database.db.insert(database.users).values({ id: userId, email })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'Warehouse preparation tests', slug: `inventory-start-${workspaceId}` })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId, role: 'owner' })
  })
  beforeEach(async () => {
    const { db, apps, tables, workspaceUsage } = database
    identity.member = { userId, workspaceId, workspaceName: 'Warehouse preparation tests', email, name: 'Owner', role: 'owner' }
    await db.delete(apps).where(eq(apps.workspaceId, workspaceId))
    await db.delete(tables).where(eq(tables.workspaceId, workspaceId))
    await db.delete(workspaceUsage).where(eq(workspaceUsage.workspaceId, workspaceId))
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
  it('prepares the owner role and atomically soft-deletes all untouched warehouse examples', async () => {
    const app = await definition()
    expect(app.formatVersion).toBe(2)
    expect(app.authentication.members).toContainEqual({ email, roleIds: ['owner'], company: '' })
    const before = await prepare.inventoryPreparation(workspaceId, appId)
    expect(before!.samples).toBeGreaterThan(0)
    expect(await actions.clearInventorySamplesAction(appId)).toEqual({ ok: true })
    expect((await prepare.inventoryPreparation(workspaceId, appId))!.samples).toBe(0)
    const records = await database.db.select().from(database.rows).where(eq(database.rows.tableId, app.inventory!.itemsTableId))
    expect(records.length).toBeGreaterThan(0)
    expect(records.every(row => row.deletedAt !== null)).toBe(true)
    expect(await definition()).toEqual(app)
    expect(await actions.clearInventorySamplesAction(appId)).toEqual({ ok: true })
  })
  it('retains a sample product and its history when an actual operation uses it', async () => {
    const app = await definition(), config = app.inventory!
    const { db, rows } = database
    const [product] = await db.select().from(rows).where(eq(rows.tableId, config.itemsTableId)).limit(1)
    const real = newId('row')
    await db.insert(rows).values({ id: real, tableId: config.movementsTableId, position: positionBetween(null, null), sample: false,
      data: { [config.movementItemFieldId]: [product!.id], [config.movementQtyFieldId]: 3, [config.movementNameFieldId]: 'Своя приёмка' } })
    expect(await actions.clearInventorySamplesAction(appId)).toEqual({ ok: true })
    const [kept] = await db.select().from(rows).where(eq(rows.id, product!.id))
    expect(kept!.deletedAt).toBeNull()
    expect((await db.select().from(rows).where(and(eq(rows.id, real), isNull(rows.deletedAt))))).toHaveLength(1)
    expect((await prepare.inventoryPreparation(workspaceId, appId))!.samples).toBe(0)
  })
  it('retains edited examples and denies a viewer or a foreign app', async () => {
    const app = await definition(), { db, rows } = database
    const [product] = await db.select().from(rows).where(eq(rows.tableId, app.inventory!.itemsTableId)).limit(1)
    await db.update(rows).set({ sample: false }).where(eq(rows.id, product!.id))
    identity.member = { ...identity.member!, role: 'viewer' }
    expect((await actions.clearInventorySamplesAction(appId)).ok).toBe(false)
    identity.member = { ...identity.member!, role: 'owner' }
    expect((await actions.clearInventorySamplesAction('app_other_workspace')).ok).toBe(false)
    expect(await actions.clearInventorySamplesAction(appId)).toEqual({ ok: true })
    const [kept] = await db.select().from(rows).where(eq(rows.id, product!.id))
    expect(kept!.deletedAt).toBeNull()
    expect(kept!.sample).toBe(false)
  })
})
