import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { appSchema, instantToWallClock, newId, type App } from '@tableapp/schema'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const state = vi.hoisted(() => ({ member: null as import('./session').Member | null, cookie: '', fail: false }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => state.member }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/app-references', async original => {
  const actual = await original<typeof import('./app-references')>()
  return { ...actual, checkAppReferences: (app: App, catalog: import('./app-references').AppReferenceCatalog) => state.fail && app.modules?.length === 2 ? 'Synthetic failure after resource creation' : actual.checkAppReferences(app, catalog) }
})

describe.skipIf(!process.env.DATABASE_URL)('modular business scenarios in PostgreSQL', () => {
  let database: typeof import('@tableapp/db'), moduleActions: typeof import('@/app/module-actions'), appActions: typeof import('@/app/app-actions')
  const owner = newId('user'), ownerEmail = `${owner}@example.invalid`, spaces: string[] = [], sessions: string[] = []
  const clientEmail = 'modular-client@example.invalid'
  beforeAll(async () => {
    database = await import('@tableapp/db'); moduleActions = await import('@/app/module-actions'); appActions = await import('@/app/app-actions')
    await database.db.insert(database.users).values({ id: owner, email: ownerEmail })
  })
  afterEach(() => { state.fail = false; state.cookie = '' })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, spaces))
    await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.id, sessions))
    await database.db.delete(database.users).where(eq(database.users.id, owner)); await database.sql.end()
  })
  async function business(template = 'salon') {
    const id = newId('workspace'); spaces.push(id)
    await database.db.insert(database.workspaces).values({ id, ownerId: owner, slug: id, name: 'Synthetic business', plan: 'business', businessProfile: { name: id, location: '', phone: '' } })
    await database.db.insert(database.workspaceMembers).values({ workspaceId: id, userId: owner, role: 'editor' })
    state.member = { userId: owner, email: ownerEmail, workspaceId: id, workspaceName: 'Synthetic business', role: 'editor', name: 'Test' }
    const result = await (await import('@/app/template-actions')).applyTemplateAction(template)
    if (!result.ok) throw new Error(result.error)
    return { workspaceId: id, appId: result.appId, slug: result.appSlug }
  }
  async function definition(appId: string) {
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, appId))
    return appSchema.parse(record!.draft)
  }
  async function session(email: string) {
    const id = newId('session'); sessions.push(id)
    await database.db.insert(database.staffSessions).values({ id, email, expiresAt: new Date(Date.now() + 3_600_000) }); state.cookie = id
  }
  async function connect(appId: string, source?: string) {
    const preview = await moduleActions.previewModuleConnectionAction(appId, 'katalog', source)
    if (!preview.ok) throw new Error(preview.error)
    const result = await moduleActions.connectModuleAction(appId, 'katalog', preview.expectedHash, source, preview.sourceHash)
    if (!result.ok) throw new Error(result.error)
    return preview
  }
  async function counts(workspaceId: string) {
    const { db, tables, workspaceUsage } = database
    return { tables: (await db.select().from(tables).where(eq(tables.workspaceId, workspaceId))).length,
      usage: (await db.select().from(workspaceUsage).where(eq(workspaceUsage.workspaceId, workspaceId)))[0]!.tables }
  }
  it('keeps one profile across apps of a business, separate profiles in another business, and unchanged app-user ownership', async () => {
    const first = await business(), secondApp = await (await import('@/app/template-actions')).applyTemplateAction('katalog')
    if (!secondApp.ok) throw new Error(secondApp.error)
    const second = await business(), { appAccessFor } = await import('./app-session')
    const a = await appAccessFor(await definition(first.appId), clientEmail), b = await appAccessFor(await definition(secondApp.appId), clientEmail.toUpperCase()), c = await appAccessFor(await definition(second.appId), clientEmail)
    expect(a.viewer!.businessCustomerId).toBe(b.viewer!.businessCustomerId)
    expect(c.viewer!.businessCustomerId).not.toBe(a.viewer!.businessCustomerId)
    expect(a.viewer!.id).not.toBe(b.viewer!.id)
    const { businessCustomers, businessCustomerApps, db } = database
    await db.update(businessCustomers).set({ name: 'First business name', phone: '111' }).where(eq(businessCustomers.id, a.viewer!.businessCustomerId!))
    expect((await appAccessFor(await definition(first.appId), clientEmail)).viewer!.name).toBe('First business name')
    expect((await appAccessFor(await definition(second.appId), clientEmail)).viewer!.name).not.toBe('First business name')
    await expect(db.insert(businessCustomerApps).values({ workspaceId: second.workspaceId, customerId: a.viewer!.businessCustomerId!, appId: second.appId })).rejects.toThrow()
    await expect(db.insert(businessCustomerApps).values({ workspaceId: first.workspaceId, customerId: a.viewer!.businessCustomerId!, appId: second.appId })).rejects.toThrow()
    expect((await db.select().from(businessCustomers).where(eq(businessCustomers.email, clientEmail))).filter(profile => new Set<string>([first.workspaceId, second.workspaceId]).has(profile.workspaceId))).toHaveLength(2)
  })
  it('does not consume capacity on preflight and installs only once on concurrent retry without publishing', async () => {
    const first = await business(), before = await counts(first.workspaceId)
    const preview = await moduleActions.previewModuleConnectionAction(first.appId, 'katalog')
    if (!preview.ok) throw new Error(preview.error)
    expect(await counts(first.workspaceId)).toEqual(before)
    expect(preview.newTables).toBeGreaterThan(0)
    const results = await Promise.all([1, 2].map(() => moduleActions.connectModuleAction(first.appId, 'katalog', preview.expectedHash)))
    expect(results.every(result => result.ok)).toBe(true)
    expect((await counts(first.workspaceId)).tables).toBe(before.tables + preview.newTables)
    expect((await counts(first.workspaceId)).usage).toBe(before.usage + preview.newTables)
    const app = await definition(first.appId)
    expect(app.slug).toBe(first.slug); expect(app.modules).toHaveLength(2)
    expect((await database.db.select().from(database.apps).where(eq(database.apps.id, first.appId)))[0]!.published).toBeNull()
    expect(await database.db.select().from(database.rows).where(inArray(database.rows.tableId, Object.values(app.customer ? { records: app.customer.tableId, catalog: app.customer.catalog!.tableId, items: app.customer.cart!.itemsTableId } : {})))).toHaveLength(0)
  })
  it('rolls back tables, usage and the primary binding on an injected failure', async () => {
    const first = await business(), before = await counts(first.workspaceId), original = await definition(first.appId)
    const preview = await moduleActions.previewModuleConnectionAction(first.appId, 'katalog')
    if (!preview.ok) throw new Error(preview.error)
    state.fail = true
    expect(await moduleActions.connectModuleAction(first.appId, 'katalog', preview.expectedHash)).toMatchObject({ ok: false })
    state.fail = false
    expect(await counts(first.workspaceId)).toEqual(before)
    expect(await definition(first.appId)).toEqual(original)
    expect(await database.db.select().from(database.workspaceClientApps).where(eq(database.workspaceClientApps.workspaceId, first.workspaceId))).toHaveLength(0)
  })
  it('rejects stale settings and foreign sources without creating any resources', async () => {
    const first = await business(), before = await counts(first.workspaceId)
    const preview = await moduleActions.previewModuleConnectionAction(first.appId, 'katalog')
    if (!preview.ok) throw new Error(preview.error)
    const app = await definition(first.appId); app.name = 'Changed after preflight'
    expect((await appActions.updateAppDraftAction(first.appId, app)).ok).toBe(true)
    expect(await moduleActions.connectModuleAction(first.appId, 'katalog', preview.expectedHash)).toMatchObject({ ok: false })
    const foreign = await business('katalog')
    state.member!.workspaceId = first.workspaceId
    expect(await moduleActions.previewModuleConnectionAction(first.appId, 'katalog', foreign.appId)).toMatchObject({ ok: false })
    expect(await counts(first.workspaceId)).toEqual(before)
    expect((await definition(first.appId)).name).toBe('Changed after preflight')
  })
  it('reuses chosen unpublished tables and records and prevents two published owners of the same workflow', async () => {
    const first = await business(), source = await (await import('@/app/template-actions')).applyTemplateAction('katalog')
    if (!source.ok) throw new Error(source.error)
    const original = await definition(source.appId), before = await counts(first.workspaceId)
    const preview = await connect(first.appId, source.appId)
    expect(preview.newTables).toBe(0); expect(preview.reused).toBe(true)
    expect((await definition(first.appId)).customer).toEqual(original.customer)
    expect(await counts(first.workspaceId)).toEqual(before)
    expect((await appActions.publishAppAction(first.appId)).ok).toBe(true)
    expect(await appActions.publishAppAction(source.appId)).toMatchObject({ ok: false, error: expect.stringMatching(/управляет/) })
    const { db, rows } = database
    expect((await db.select().from(rows).where(eq(rows.tableId, original.customer!.catalog!.tableId))).length).toBeGreaterThan(0)
  })
  it('preserves master access without granting sales work; clients submit and see only their own history after pause', async () => {
    const first = await business(), original = await definition(first.appId), masterEmail = 'module-master@example.invalid'
    original.allowlist.push({ email: masterEmail, roleId: 'staff', company: '' })
    expect((await appActions.updateAppDraftAction(first.appId, original)).ok).toBe(true)
    await connect(first.appId)
    const app = await definition(first.appId), config = app.customer!
    expect((await appActions.publishAppAction(first.appId)).ok).toBe(true)
    const { appCreateRowAction, appUpdateRowAction } = await import('@/app/runtime-actions'), { writeRows, createRow } = await import('./row-mutations')
    const product = await writeRows(first.workspaceId, context => createRow(context, config.catalog!.tableId, { [config.catalog!.titleFieldId]: 'Synthetic product', [config.catalog!.activeFieldId]: true, [config.cart!.priceFieldId]: 700 }, { id: owner, kind: 'member' }))
    await session(masterEmail)
    expect(await appUpdateRowAction(first.slug, config.tableId, newId('row'), {})).toMatchObject({ ok: false })
    await session(clientEmail)
    const token = randomUUID(), values = { [config.profile!.nameFieldId]: 'Client A', [config.profile!.phoneFieldId]: '+79991234567',
      [config.submissionFieldId!]: token, [config.cart!.fieldId]: JSON.stringify({ requestId: token, items: [{ id: product.id, qty: 2 }] }) }
    const form = app.screens.find(screen => screen.id === config.formScreenId)!
    if (form.type === 'form') for (const component of form.components) if (component.type === 'form_field' && component.required && !(component.fieldId in values)) values[component.fieldId] = 'Synthetic address'
    const order = await appCreateRowAction(first.slug, config.tableId, values)
    expect(order).toMatchObject({ ok: true })
    const orders = await database.db.select().from(database.rows).where(eq(database.rows.tableId, config.tableId)); expect(orders).toHaveLength(1)
    const orderId = orders[0]!.id, stored = orders[0]!.data as Record<string, unknown>
    expect(stored[config.emailFieldId]).toBe(clientEmail)
    expect(await appCreateRowAction(first.slug, config.tableId, values)).toMatchObject({ ok: true })
    expect(await database.db.select().from(database.rows).where(eq(database.rows.tableId, config.tableId))).toHaveLength(1)
    const { loadPublishedApp } = await import('./app-runtime'), { currentAppAccess } = await import('./app-session')
    const mine = await loadPublishedApp(first.slug, (await currentAppAccess(app)).visitor)
    expect(mine!.customerProfile).toEqual({ name: 'Client A', phone: '+79991234567' })
    expect(mine!.tables[config.tableId]!.rows.map(row => row.id)).toContain(orderId)
    expect(mine!.app.moduleAccess!.grants).toEqual([]); expect(mine!.app.allowlist).toEqual([])
    await session('another-client@example.invalid')
    expect((await loadPublishedApp(first.slug, (await currentAppAccess(app)).visitor))!.tables[config.tableId]!.rows).toHaveLength(0)
    const sales = app.modules!.find(module => module.kind === 'sales')!
    expect((await moduleActions.setModuleIntakeAction(first.appId, sales.id, false)).ok).toBe(true)
    await session(clientEmail)
    const { permits } = await import('./app-roles'), { loadApp } = await import('./app-write-access')
    expect(permits((await loadApp(first.slug))!, config.tableId, 'create', (await currentAppAccess(app)).visitor)).toBe(true)
    expect((await appActions.publishAppAction(first.appId)).ok).toBe(true)
    const newToken = randomUUID()
    expect(await appCreateRowAction(first.slug, config.tableId, { ...values, [config.submissionFieldId!]: newToken, [config.cart!.fieldId]: JSON.stringify({ requestId: newToken, items: [{ id: product.id, qty: 1 }] }) })).toMatchObject({ ok: false })
    await expect(writeRows(first.workspaceId, context => createRow(context, config.tableId, {}, { id: owner, kind: 'member' }))).rejects.toThrow(/приостановлены/)
    const paused = (await loadApp(first.slug))!, history = await loadPublishedApp(first.slug, (await currentAppAccess(paused)).visitor)
    expect(history!.tables[config.tableId]!.rows.map(row => row.id)).toContain(orderId)
    const cancel = await (await import('@/app/customer-actions')).customerDecisionAction(first.slug, orderId, orders[0]!.version, 'cancel', config.tableId)
    expect(cancel).toMatchObject({ ok: true })
    expect((await definition(first.appId)).booking).toEqual(original.booking)
  })
  it('keeps booking setup, time conflicts and cancellation working with scoped administrator and master roles', async () => {
    const first = await business(); await connect(first.appId)
    const app = await definition(first.appId), config = app.booking!
    expect((await appActions.publishAppAction(first.appId)).ok).toBe(true)
    const { loadBookingData } = await import('./booking-store'), bookingActions = await import('@/app/booking-actions')
    const data = (await loadBookingData(config, first.workspaceId))!, service = data.services.find(service => service.data[config.service.active] === true)!
    const masterEmail = 'fresh-module-master@example.invalid'
    await session(ownerEmail)
    expect(await bookingActions.setupBookingMasterAction(first.slug, { name: 'Module Master', email: masterEmail, serviceIds: [service.id], weekdays: [0, 1, 2, 3, 4, 5, 6], start: '09:00', end: '18:00', breakStart: '', breakEnd: '', timeZone: data.timeZone })).toMatchObject({ ok: true })
    const changed = await definition(first.appId), { appAccessFor } = await import('./app-session'), { permits } = await import('./app-roles')
    const master = await appAccessFor(changed, masterEmail)
    expect(permits(changed, changed.customer!.tableId, 'update', master.visitor)).toBe(false)
    expect(permits(changed, config.tables.visits, 'update', master.visitor)).toBe(true)
    const refreshed = (await loadBookingData(config, first.workspaceId))!, newMaster = refreshed.masters.find(master => master.data[config.master.email] === masterEmail)!
    const day = instantToWallClock(new Date(Date.now() + 86_400_000), data.timeZone)!.date
    const available = await bookingActions.bookingAvailabilityAction(first.slug, service.id, day, newMaster.id)
    if (!available.ok) throw new Error(available.error)
    const slot = available.slots[0]!
    expect(slot).toBeDefined()
    await session(clientEmail)
    const runtimeActions = await import('@/app/runtime-actions'), values = { [config.visit.client]: 'Booked client', [config.visit.phone]: '+79991234567', [config.visit.service]: [service.id], [config.visit.master]: [newMaster.id], [config.visit.start]: slot.start }
    expect(await runtimeActions.appCreateRowAction(first.slug, config.tables.visits, values)).toMatchObject({ ok: true })
    expect(await runtimeActions.appCreateRowAction(first.slug, config.tables.visits, values)).toMatchObject({ ok: false })
    const [visit] = await database.db.select().from(database.rows).where(and(eq(database.rows.tableId, config.tables.visits), eq(database.rows.createdBy, (await appAccessFor(changed, clientEmail)).viewer!.id)))
    expect(visit).toBeDefined()
    expect(await bookingActions.cancelBookingAction(first.slug, visit!.id, visit!.version)).toMatchObject({ ok: true })
    const released = await bookingActions.bookingAvailabilityAction(first.slug, service.id, day, newMaster.id)
    expect(released.ok && released.slots.some(candidate => candidate.start === slot.start)).toBe(true)
    const profile = await database.db.select().from(database.businessCustomers).where(and(eq(database.businessCustomers.workspaceId, first.workspaceId), eq(database.businessCustomers.email, clientEmail)))
    expect(profile[0]!.name).toBe('Booked client')
  })
  it('rejects a previously authorized write when module rights change before its transaction', async () => {
    const first = await business(); await connect(first.appId)
    expect((await appActions.publishAppAction(first.appId)).ok).toBe(true)
    const app = await definition(first.appId), sales = app.modules!.find(module => module.kind === 'sales')!
    const { currentAppAccess } = await import('./app-session'), { permits } = await import('./app-roles'), { insertRow } = await import('./row-write')
    await session(ownerEmail)
    const access = await currentAppAccess(app)
    expect(permits(app, app.customer!.tableId, 'create', access.visitor)).toBe(true)
    const changed = { ...app, moduleAccess: { grants: app.moduleAccess!.grants.filter(grant => grant.moduleId !== sales.id) } }
    await database.db.update(database.apps).set({ draft: changed }).where(eq(database.apps.id, first.appId))
    expect((await appActions.publishAppAction(first.appId)).ok).toBe(true)
    const before = await counts(first.workspaceId)
    await expect(insertRow(app, app.customer!.tableId, {}, { ...access, ip: null })).rejects.toThrow(/права приложения изменились/)
    expect(await counts(first.workspaceId)).toEqual(before)
    expect(await appActions.unpublishAppAction(first.appId)).toMatchObject({ ok: true })
    await expect(insertRow(changed, changed.customer!.tableId, {}, { ...access, ip: null })).rejects.toThrow(/права приложения изменились/)
    expect((await database.db.select().from(database.workspaceUsage).where(eq(database.workspaceUsage.workspaceId, first.workspaceId)))[0]!.publishedApps).toBe(0)
  })
  it('protects required fields, relation types and used views while allowing a rename', async () => {
    const first = await business(), app = await definition(first.appId), fieldActions = await import('@/app/field-actions'), viewActions = await import('@/app/view-actions')
    const minutes = app.booking!.service.minutes
    expect(await fieldActions.deleteFieldAction(app.booking!.tables.services, minutes)).toMatchObject({ ok: false })
    expect(await fieldActions.updateFieldAction(app.booking!.tables.services, minutes, { type: 'text' })).toMatchObject({ ok: false })
    expect(await fieldActions.updateFieldAction(app.booking!.tables.services, minutes, { name: 'Продолжительность услуги' })).toMatchObject({ ok: true })
    const used = app.screens.find(screen => screen.type === 'list' && screen.access.public)!
    if (used.type !== 'list') throw new Error('No catalog')
    expect(await viewActions.deleteViewAction(app.booking!.tables.services, used.source.viewId)).toMatchObject({ ok: false })
  })
  it('refuses an over-limit addition without consuming quota or modifying the application', async () => {
    const first = await business()
    await database.db.update(database.workspaces).set({ plan: 'free' }).where(eq(database.workspaces.id, first.workspaceId))
    await database.db.insert(database.tables).values([0, 1, 2, 3].map(index => ({ id: newId('table'), workspaceId: first.workspaceId, name: 'Synthetic existing table', position: `z${index}` })))
    await (await import('./usage')).recountWorkspace(first.workspaceId)
    const before = await counts(first.workspaceId), original = await definition(first.appId)
    expect(await moduleActions.previewModuleConnectionAction(first.appId, 'katalog')).toMatchObject({ ok: false })
    expect(await counts(first.workspaceId)).toEqual(before)
    expect(await definition(first.appId)).toEqual(original)
  })
})
