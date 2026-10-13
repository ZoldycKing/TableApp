import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { customerWorkflows, newId, type App } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import { composeModules } from './module-composition'
import { STAFF_SESSION_COOKIE } from './auth'
import { CRM_PROFILE_PREFIX } from './customer-history-types'

const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null, cookie: '' }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => name === STAFF_SESSION_COOKIE && identity.cookie ? { value: identity.cookie } : undefined }) }))
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('shared customer history and CRM directory in PostgreSQL', () => {
  let database: typeof import('@tableapp/db'), history: typeof import('./customer-history'), directory: typeof import('./customer-directory')
  const ownerId = newId('user'), ownerEmail = `${ownerId}@example.invalid`, customer = `${newId('appUser')}@example.invalid`, manager = `${newId('appUser')}@example.invalid`, worker = `${newId('appUser')}@example.invalid`
  const spaces: string[] = [], sessions: string[] = []
  beforeAll(async () => {
    database = await import('@tableapp/db'); history = await import('./customer-history'); directory = await import('./customer-directory')
    await database.db.insert(database.users).values({ id: ownerId, email: ownerEmail })
  })
  beforeEach(() => { identity.member = null; identity.cookie = '' })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, spaces))
    await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.id, sessions))
    await database.db.delete(database.users).where(eq(database.users.id, ownerId)); await database.sql.end()
  })
  async function business(kinds = ['crm', 'salon', 'zakazy', 'service', 'dostavka', 'nedvizhimost', 'zayavki']) {
    const workspaceId = newId('workspace'); spaces.push(workspaceId)
    const examples = kinds.map(id => templateExample(id)), views = examples.flatMap(example => example.views)
    examples.forEach(example => { example.app.workspaceId = workspaceId })
    let app = examples[0]!.app
    for (const example of examples.slice(1)) app = composeModules(app, example.app, new Map(views.map(view => [view.id, view])))
    // A CRM-only fixture also uses explicit module grants.
    if (!app.moduleAccess) app = (await import('./module-composition')).scopeModuleAccess(app, new Map(views.map(view => [view.id, view])))
    app.slug = `crm-history-${workspaceId}`
    app.moduleAccess!.grants = app.modules!.flatMap(module => [{ email: manager, moduleId: module.id, roleId: module.roles!.manager! },
      { email: worker, moduleId: module.id, roleId: module.roles!.staff! }])
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId, name: 'Synthetic CRM history', slug: workspaceId, plan: 'business' })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId: ownerId, role: 'owner' })
    await database.db.insert(database.tables).values(examples.flatMap(example => example.built.tables.map(table => ({ ...table, workspaceId }))))
    await database.db.insert(database.fields).values(examples.flatMap(example => example.built.fields))
    await database.db.insert(database.views).values(views)
    await database.db.insert(database.rows).values(examples.flatMap(example => example.built.rows))
    await database.db.insert(database.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app })
    expect(await (await import('./app-references')).validateAppReferences(app)).toBeNull()
    const crmConfig = customerWorkflows(app).find(config => config.crm)!, crm = crmConfig.crm!
    const [contact] = await database.db.select().from(database.rows).where(eq(database.rows.tableId, crm.clientsTableId)).limit(1)
    await database.db.update(database.rows).set({ data: { ...contact!.data as object, [crm.emailFieldId]: customer, [crm.nameFieldId]: 'Ирина', [crm.phoneFieldId]: '+7 900 000-00-00' } }).where(eq(database.rows.id, contact!.id))
    const selected: string[] = []
    for (const config of customerWorkflows(app)) {
      const [row] = await database.db.select().from(database.rows).where(eq(database.rows.tableId, config.tableId)).limit(1)
      if (!row) continue
      if (config.crm) {
        const deals = await database.db.select().from(database.rows).where(eq(database.rows.tableId, config.tableId))
        for (const deal of deals) if (deal.id !== row.id) await database.db.update(database.rows).set({ data: { ...deal.data as object, [config.crm.relationFieldId]: [], [config.emailFieldId]: 'other@example.invalid' } }).where(eq(database.rows.id, deal.id))
      }
      selected.push(row.id)
      await database.db.update(database.rows).set({ data: { ...row.data as object, [config.emailFieldId]: customer, [config.assignmentFieldId!]: worker,
        ...(config.crm ? { [config.crm.relationFieldId]: [contact!.id], [config.emailFieldId]: 'stale-legacy-email@example.invalid' } : {}) } }).where(eq(database.rows.id, row.id))
    }
    if (app.booking) {
      const [row] = await database.db.select().from(database.rows).where(eq(database.rows.tableId, app.booking.tables.visits)).limit(1)
      selected.push(row!.id)
      await database.db.update(database.rows).set({ data: { ...row!.data as object, [app.booking.visit.email]: customer, [app.booking.visit.masterEmail]: worker } }).where(eq(database.rows.id, row!.id))
    }
    return { app, workspaceId, crmConfig, crm, contactId: contact!.id, selected }
  }
  type Business = Awaited<ReturnType<typeof business>>
  const anchor = (space: Business) => ({ tableId: space.crm.clientsTableId, rowId: space.contactId, slug: space.app.slug })
  async function signIn(email: string) {
    const id = newId('session'); sessions.push(id)
    await database.db.insert(database.staffSessions).values({ id, email, expiresAt: new Date(Date.now() + 3_600_000) }); identity.cookie = id
  }
  function owner(space: Business) { identity.member = { userId: ownerId, email: ownerEmail, workspaceId: space.workspaceId, workspaceName: 'Synthetic CRM', role: 'owner', name: 'Owner' } }
  async function publish(app: App) { await database.db.update(database.apps).set({ draft: app, published: app }).where(eq(database.apps.id, app.id)) }

  it('groups all enabled scenarios in one business, preferring the explicit CRM relation over stale email', async () => {
    const space = await business(), foreign = await business()
    await signIn(manager)
    const page = (await history.readCustomerHistory(anchor(space)))!
    expect(page.customer).toEqual({ name: 'Ирина', email: customer, phone: '+7 900 000-00-00' })
    expect(page.items.map(item => item.kind).sort()).toEqual(['booking', 'crm', 'delivery', 'field_service', 'property', 'repair', 'sales'])
    expect(page.items.map(item => item.id).sort()).toEqual(space.selected.sort())
    expect(page.items.every(item => !foreign.selected.includes(item.id))).toBe(true)
    expect(page.items.some(item => item.status)).toBe(true)
    expect(page.items.every(item => item.statusColor)).toBe(true)
    const deal = { tableId: space.crmConfig.tableId, rowId: space.selected.find(id => page.items.find(item => item.id === id)?.kind === 'crm')!, slug: space.app.slug }
    expect((await history.readCustomerHistory(deal))!.items.map(item => item.id).sort()).toEqual(page.items.map(item => item.id).sort())
  })
  it('includes a separately published application only with its own current work grant', async () => {
    const space = await business(['crm']), repair = templateExample('service'), config = repair.app.customer!
    repair.app.workspaceId = space.workspaceId; repair.app.slug = `separate-history-${newId('app')}`
    repair.app.allowlist = [{ email: manager, roleId: 'manager', company: '' }]
    await database.db.insert(database.tables).values(repair.built.tables.map(table => ({ ...table, workspaceId: space.workspaceId })))
    await database.db.insert(database.fields).values(repair.built.fields); await database.db.insert(database.views).values(repair.built.views)
    const source = repair.built.rows.find(row => row.tableId === config.tableId)!
    await database.db.insert(database.rows).values(repair.built.rows.map(row => row.id === source.id ? { ...row, data: { ...row.data, [config.emailFieldId]: customer } } : row))
    await database.db.insert(database.apps).values({ id: repair.app.id, workspaceId: space.workspaceId, name: repair.app.name, slug: repair.app.slug, draft: repair.app, published: repair.app })
    await signIn(manager)
    expect((await history.readCustomerHistory(anchor(space)))!.items.find(item => item.id === source.id)?.slug).toBe(repair.app.slug)
    repair.app.allowlist = []; await publish(repair.app)
    expect((await history.readCustomerHistory(anchor(space)))!.items.some(item => item.id === source.id)).toBe(false)
  })
  it('separates actual customer orders from internal deals before pagination', async () => {
    const space = await business(['crm', 'salon', 'service'])
    await signIn(manager)
    const page = (await history.readCustomerHistory({ ...anchor(space), ordersOnly: true }))!
    expect(page.items.map(item => item.kind).sort()).toEqual(['booking', 'repair'])
    expect(page.kinds.map(item => item.id).sort()).toEqual(['booking', 'repair'])
    expect((await history.readCustomerHistory(anchor(space)))!.items).toHaveLength(3)
    await expect(history.readCustomerHistory({ ...anchor(space), ordersOnly: 'true' as unknown as boolean })).rejects.toThrow('недоступна')
  })
  it('filters customer messages using an authorized source card and rechecks each target grant', async () => {
    const space = await business(['crm', 'salon', 'service']), foreign = await business(['crm'])
    const inbox = await import('./conversation-inbox'), profileId = newId('businessCustomer'), otherId = newId('businessCustomer')
    await database.db.insert(database.businessCustomers).values([{ id: profileId, workspaceId: space.workspaceId, email: customer }, { id: otherId, workspaceId: space.workspaceId, email: 'other-messages@example.invalid' }])
    const ownThreads: string[] = []
    for (const rowId of space.selected.slice(1)) {
      const [row] = await database.db.select().from(database.rows).where(eq(database.rows.id, rowId))
      const module = space.app.modules!.find(module => module.source.type === 'booking' ? row!.tableId === space.app.booking!.tables.visits : module.source.type === 'customer' && module.source.tableId === row!.tableId)!
      const id = `con_${newId('row')}`; ownThreads.push(id)
      await database.db.insert(database.conversations).values({ id, workspaceId: space.workspaceId, appId: space.app.id, moduleId: module.id, tableId: row!.tableId, rowId, customerId: profileId })
    }
    const repair = customerWorkflows(space.app).find(config => !config.crm)!, source = (await database.db.select().from(database.rows).where(eq(database.rows.id, space.selected[1]!)))[0]!
    const otherRowId = newId('row'), otherThread = `con_${newId('row')}`
    await database.db.insert(database.rows).values({ id: otherRowId, tableId: repair.tableId, position: 'other-message', data: { ...source.data as object, [repair.emailFieldId]: 'other-messages@example.invalid', [repair.assignmentFieldId!]: worker } })
    const repairModule = space.app.modules!.find(module => module.source.type === 'customer' && module.source.tableId === repair.tableId)!
    await database.db.insert(database.conversations).values({ id: otherThread, workspaceId: space.workspaceId, appId: space.app.id, moduleId: repairModule.id, tableId: repair.tableId, rowId: otherRowId, customerId: otherId })
    await signIn(manager)
    const input = { slug: space.app.slug, customer: { tableId: space.crm.clientsTableId, rowId: space.contactId } }
    expect((await inbox.listConversationInbox({ slug: space.app.slug })).items).toHaveLength(3)
    expect((await inbox.listConversationInbox(input)).items.map(item => item.id).sort()).toEqual(ownThreads.sort())
    expect((await inbox.listConversationInbox({ ...input, customer: { ...input.customer, rowId: `${CRM_PROFILE_PREFIX}${profileId}` } })).items).toHaveLength(2)
    await expect(inbox.listConversationInbox({ ...input, customer: { tableId: foreign.crm.clientsTableId, rowId: foreign.contactId } })).rejects.toThrow('недоступна')
    const limited = structuredClone(space.app); limited.moduleAccess!.grants = limited.moduleAccess!.grants.filter(grant => grant.email !== manager || grant.moduleId !== repairModule.id)
    await publish(limited)
    expect((await inbox.listConversationInbox(input)).items).toHaveLength(1)
    await publish(space.app); await signIn(worker)
    await expect(inbox.listConversationInbox(input)).rejects.toThrow('недоступна')
    await signIn(customer)
    await expect(inbox.listConversationInbox(input)).rejects.toThrow('недоступна')
    owner(space)
    await expect(inbox.listConversationInbox(input)).rejects.toThrow('недоступна')
    expect((await inbox.listConversationInbox({ customer: input.customer }, true)).items).toHaveLength(2)
  })
  it('requires current grants in every target module and never borrows platform owner access for an app customer', async () => {
    const space = await business(), limited = structuredClone(space.app)
    limited.moduleAccess!.grants = limited.moduleAccess!.grants.filter(grant => grant.email !== manager || limited.modules!.find(module => module.id === grant.moduleId)?.kind === 'crm')
    await publish(limited); await signIn(manager)
    expect((await history.readCustomerHistory(anchor(space)))!.items.map(item => item.kind)).toEqual(['crm'])
    owner(space); await signIn(customer)
    await expect(history.readCustomerHistory(anchor(space))).rejects.toThrow('недоступна')
    expect((await history.readCustomerHistory({ ...anchor(space), slug: undefined }, true))!.items).toHaveLength(7)
    identity.member = { ...identity.member!, userId: 'not-the-owner', email: worker, role: 'editor' }
    await expect(history.readCustomerHistory({ ...anchor(space), slug: undefined }, true)).rejects.toThrow('недоступна')
  })
  it('allows an assigned worker to group from a deal without granting the contact directory or unrelated assigned records', async () => {
    const space = await business(['crm', 'service']), dealId = space.selected[0]!
    await signIn(worker)
    const input = { tableId: space.crmConfig.tableId, rowId: dealId, slug: space.app.slug }
    const page = (await history.readCustomerHistory(input))!
    expect(page.items.map(item => item.kind).sort()).toEqual(['crm', 'repair'])
    expect(page.customer.email).toBeNull()
    await expect(directory.readCustomerDirectory({ tableId: space.crm.clientsTableId, slug: space.app.slug })).rejects.toThrow('недоступен')
    const repair = customerWorkflows(space.app).find(config => !config.crm)!, repairId = space.selected[1]!
    const [stored] = await database.db.select().from(database.rows).where(eq(database.rows.id, repairId))
    await database.db.update(database.rows).set({ data: { ...stored!.data as object, [repair.assignmentFieldId!]: 'someone-else@example.invalid' } }).where(eq(database.rows.id, repairId))
    expect((await history.readCustomerHistory(input))!.items.map(item => item.kind)).toEqual(['crm'])
  })
  it('projects contact/profile and history fields, treating hidden search columns as unavailable', async () => {
    const space = await business(['crm', 'service']), changed = structuredClone(space.app), repair = customerWorkflows(changed).find(config => !config.crm)!
    const hidden = new Set([space.crm.phoneFieldId, repair.statusFieldId, repair.createdFieldId!])
    for (const screen of changed.screens) {
      if ('components' in screen) screen.components = screen.components.filter(component => !('fieldId' in component && hidden.has(component.fieldId)) && !((component.type === 'text' || component.type === 'heading') && component.source.kind === 'field' && hidden.has(component.source.fieldId)))
      if (screen.type === 'list' || screen.type === 'tiles') {
        if (hidden.has(screen.statusFieldId ?? '')) screen.statusFieldId = null
        if (hidden.has(screen.subtitleFieldId ?? '')) screen.subtitleFieldId = null
      }
    }
    await publish(changed); await signIn(manager)
    const page = (await history.readCustomerHistory(anchor(space)))!
    expect(page.customer.phone).toBeNull()
    expect(page.items.find(item => item.kind === 'repair')?.status).toBeNull()
    expect(page.items.find(item => item.kind === 'repair')?.statusColor).toBeNull()
    expect(page.items.find(item => item.kind === 'repair')?.when).toBeNull()
    expect((await directory.readCustomerDirectory({ tableId: space.crm.clientsTableId, slug: space.app.slug, query: '900 000' })).items).toHaveLength(0)
  })
  it('lists verified business profiles without copying rows and prefers matching readable manual contacts', async () => {
    const space = await business(['crm']), foreign = await business(['crm'])
    const profileId = newId('businessCustomer'), onlyProfile = newId('businessCustomer')
    await database.db.insert(database.businessCustomers).values([
      { id: profileId, workspaceId: space.workspaceId, email: customer, name: 'Новый профиль' },
      { id: onlyProfile, workspaceId: space.workspaceId, email: 'profile-only@example.invalid', name: 'Анна', phone: '+7 900 111-22-33' },
      { id: newId('businessCustomer'), workspaceId: foreign.workspaceId, email: 'foreign-only@example.invalid', name: 'Чужой клиент' },
    ])
    const count = (await database.db.select({ id: database.rows.id }).from(database.rows).where(eq(database.rows.tableId, space.crm.clientsTableId))).length
    await signIn(manager)
    const page = await directory.readCustomerDirectory({ tableId: space.crm.clientsTableId, slug: space.app.slug })
    expect(page.items.find(item => item.email === customer)?.id).toBe(space.contactId)
    expect(page.items.find(item => item.name === 'Анна')?.id).toBe(`${CRM_PROFILE_PREFIX}${onlyProfile}`)
    expect(page.items.some(item => item.email === 'foreign-only@example.invalid')).toBe(false)
    const detail = (await history.readCustomerHistory({ ...anchor(space), rowId: `${CRM_PROFILE_PREFIX}${onlyProfile}` }))!
    expect(detail.customer.name).toBe('Анна'); expect(detail.items).toEqual([])
    expect((await database.db.select().from(database.rows).where(eq(database.rows.tableId, space.crm.clientsTableId))).length).toBe(count)
    await signIn(worker)
    await expect(history.readCustomerHistory({ ...anchor(space), rowId: `${CRM_PROFILE_PREFIX}${onlyProfile}` })).rejects.toThrow('недоступна')
    owner(space)
    await expect(history.readCustomerHistory({ ...anchor(foreign), slug: undefined }, true)).rejects.toThrow('недоступна')
  })
  it('keeps an opaque cursor across inaccessible candidate pages, rejects tampering and rechecks revoked grants', async () => {
    const space = await business(['crm', 'service']), repair = customerWorkflows(space.app).find(config => !config.crm)!
    const input = { tableId: space.crmConfig.tableId, rowId: space.selected[0]!, slug: space.app.slug, kind: 'repair' }
    const source = (await database.db.select().from(database.rows).where(eq(database.rows.id, space.selected[1]!)))[0]!
    await database.db.insert(database.rows).values(Array.from({ length: 51 }, (_, i) => ({ id: newId('row'), tableId: repair.tableId, position: `z${i}`,
      data: { ...source.data as object, [repair.emailFieldId]: customer, [repair.assignmentFieldId!]: 'not-you@example.invalid' } })))
    await signIn(worker)
    const first = (await history.readCustomerHistory(input))!
    expect(first.items).toEqual([]); expect(first.next).toBeTruthy(); expect(first.next).not.toContain('1000')
    const second = (await history.readCustomerHistory({ ...input, before: first.next! }))!
    expect(second.items.map(item => item.id)).toEqual([source.id])
    await expect(history.readCustomerHistory({ ...input, before: `${first.next!}x` })).rejects.toThrow('устарела')
    await expect(history.readCustomerHistory({ ...input, before: first.next!, kind: 'crm' })).rejects.toThrow('устарела')
    await expect(history.readCustomerHistory({ ...input, before: first.next!, ordersOnly: true })).rejects.toThrow('устарела')
    const revoked = structuredClone(space.app); revoked.moduleAccess!.grants = revoked.moduleAccess!.grants.filter(grant => grant.email !== worker)
    await publish(revoked)
    await expect(history.readCustomerHistory({ ...input, before: first.next! })).rejects.toThrow('недоступна')
    await publish(space.app); await signIn(manager)
    const contacts = await directory.readCustomerDirectory({ tableId: space.crm.clientsTableId, slug: space.app.slug, query: '%_\\' })
    expect(contacts.items).toEqual([])
    await database.db.update(database.rows).set({ deletedAt: new Date() }).where(and(eq(database.rows.id, input.rowId), eq(database.rows.tableId, input.tableId)))
    await expect(history.readCustomerHistory(input)).rejects.toThrow('недоступна')
  })
})
