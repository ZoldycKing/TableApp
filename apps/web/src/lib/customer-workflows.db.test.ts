import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { TEMPLATES } from './templates/catalog'
import { templateExample } from './templates/presentation'
import { ACTIVE_WORKSPACE_COOKIE, MEMBER_SESSION_COOKIE, STAFF_SESSION_COOKIE } from './auth'

const state = vi.hoisted(() => ({ jar: new Map<string, string>(), code: '' }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => state.jar.has(name) ? { value: state.jar.get(name) } : undefined,
  set: (name: string, value: string) => state.jar.set(name, value), delete: (name: string) => state.jar.delete(name) }), headers: async () => new Headers({ 'user-agent': 'Customer workflow test' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendMagicLink: async (letter: { code: string }) => { state.code = letter.code; return { delivered: true } }, mailHintFor: () => null }))
const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('all customer template workflows in PostgreSQL', () => {
  const email = `${newId('appUser')}@example.invalid`, worker = `${newId('appUser')}@example.invalid`, other = `${newId('appUser')}@example.invalid`
  const fixtures = TEMPLATES.filter(template => template.customer && !template.internalOnly).map(template => ({ example: templateExample(template.id), workspaceId: newId('workspace'), userId: newId('user') }))
  let database: typeof import('@tableapp/db'), runtime: typeof import('./app-runtime'), actions: typeof import('@/app/runtime-actions'), decisions: typeof import('@/app/customer-actions'), mutation: typeof import('./row-mutations'), sessions: typeof import('./app-session'), intake: typeof import('@/app/intake-actions'), auth: typeof import('@/app/auth-actions')
  let customerCookie: string
  const ids = new Map<string, string>()
  beforeAll(async () => {
    database = await import('@tableapp/db'); runtime = await import('./app-runtime'); actions = await import('@/app/runtime-actions'); decisions = await import('@/app/customer-actions'); mutation = await import('./row-mutations'); sessions = await import('./app-session'); intake = await import('@/app/intake-actions'); auth = await import('@/app/auth-actions')
    for (const { example, userId, workspaceId } of fixtures) {
      example.app.workspaceId = workspaceId; example.app.slug = `workflow-${example.app.id.toLowerCase()}`
      example.app.allowlist = [{ email: worker, roleId: 'staff', company: '' }]
      await database.db.insert(database.users).values({ id: userId, email: `${userId}@example.invalid` })
      await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'PRIVATE_WORKSPACE_NAME', slug: example.app.slug, businessProfile: { name: `Бизнес ${example.template.id}`, location: '', phone: '' } })
      await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner', acceptedAt: new Date() })
      await database.db.insert(database.tables).values(example.built.tables.map(table => ({ ...table, workspaceId })))
      await database.db.insert(database.fields).values(example.built.fields); await database.db.insert(database.views).values(example.built.views); await database.db.insert(database.rows).values(example.built.rows)
      await database.db.insert(database.apps).values({ id: example.app.id, workspaceId, name: example.app.name, slug: example.app.slug, draft: example.app, published: example.app })
    }
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, fixtures.map(fixture => fixture.workspaceId)))
    await database.db.delete(database.users).where(inArray(database.users.id, fixtures.map(fixture => fixture.userId)))
    await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.email, [email, worker, other]))
    await database.db.delete(database.authTokens).where(eq(database.authTokens.email, email)); await database.db.delete(database.authEvents).where(eq(database.authEvents.email, email))
    state.jar.clear(); await database.sql.end()
  })
  function input(example: ReturnType<typeof templateExample>) {
    const config = example.app.customer!, form = example.app.screens.find(screen => screen.id === config.formScreenId)!
    if (form.type !== 'form') throw new Error('form')
    const values: Record<string, unknown> = {}
    for (const component of form.components) if (component.type === 'form_field' && component.required) {
      const field = example.fields.find(field => field.id === component.fieldId)!
      values[field.id] = field.type === 'relation' ? [example.rows.find(row => row.tableId === field.options.tableId && (!config.catalog || row.data[config.catalog.activeFieldId] === true))!.id] : field.type === 'phone' ? '+7 900 000-00-00' : `${example.template.id}: запрос клиента`
    }
    if (config.cart && config.catalog) values[config.cart.fieldId] = JSON.stringify({ requestId: randomUUID(), items: [{ id: example.rows.find(row => row.tableId === config.catalog!.tableId && row.data[config.catalog!.activeFieldId])!.id, qty: 2 }] })
    if (config.submissionFieldId) values[config.submissionFieldId] = config.cart ? JSON.parse(String(values[config.cart.fieldId])).requestId : randomUUID()
    return values
  }
  async function own(example: ReturnType<typeof templateExample>) {
    const visitor = (await sessions.currentAppAccess(example.app)).visitor
    return (await runtime.loadPublishedApp(example.app.slug, visitor))!.tables[example.app.customer!.tableId]!.rows
  }
  async function stored(rowId: string) { return (await database.db.select().from(database.rows).where(eq(database.rows.id, rowId)))[0]! }
  async function signIn(address: string) {
    const id = newId('session')
    await database.db.insert(database.staffSessions).values({ id, email: address, expiresAt: new Date(Date.now() + 3_600_000) })
    state.jar.set(STAFF_SESSION_COOKIE, id)
  }
  it('verifies email without creating an order, then shares identity across businesses without sharing records or roles', async () => {
    const first = fixtures[0]!.example, config = first.app.customer!
    for (const { example } of fixtures) {
      const guest = await runtime.loadPublishedApp(example.app.slug, (await sessions.currentAppAccess(example.app)).visitor)
      expect(guest!.app.screens.some(screen => screen.type === 'form')).toBe(false)
      expect((await intake.requestIntakeAction(example.app.slug, example.app.customer!.formScreenId, email, input(example))).ok).toBe(false)
      expect((await actions.appCreateRowAction(example.app.slug, example.app.customer!.tableId, input(example))).ok).toBe(false)
    }
    expect((await auth.requestAppLoginAction(first.app.slug, email)).ok).toBe(true)
    expect(await auth.consumeAppCodeAction(first.app.slug, 'wrong')).toMatchObject({ ok: false })
    expect(await auth.consumeAppCodeAction(first.app.slug, state.code)).toEqual({ ok: true })
    expect((await auth.consumeAppCodeAction(first.app.slug, state.code)).ok).toBe(false)
    customerCookie = state.jar.get(STAFF_SESSION_COOKIE)!
    expect(await own(first)).toHaveLength(0)
    for (const { example } of fixtures) {
      expect(await actions.appCreateRowAction(example.app.slug, example.app.customer!.tableId, input(example))).toEqual({ ok: true })
      const records = await own(example)
      expect(records).toHaveLength(1); ids.set(example.template.id, records[0]!.id)
      const access = await sessions.currentAppAccess(example.app), loaded = (await runtime.loadPublishedApp(example.app.slug, access.visitor))!
      expect(loaded.business?.name).toBe(`Бизнес ${example.template.id}`)
      expect(JSON.stringify(loaded)).not.toContain('PRIVATE_WORKSPACE_NAME')
      expect(records[0]!.data[example.app.customer!.statusFieldId]).toBe(example.app.customer!.initialStatus)
      expect((await actions.appCreateRowAction(first.app.slug, example.app.customer!.tableId, input(example))).ok).toBe(example === first)
    }
  })
  it('creates a private composition atomically, retries an order once and retains prices after catalog changes', async () => {
    state.jar.set(STAFF_SESSION_COOKIE, customerCookie)
    for (const { example } of fixtures.filter(fixture => fixture.example.app.customer!.cart)) {
      const config = example.app.customer!, cart = config.cart!, values = input(example)
      const countBefore = (await own(example)).length
      const results = await Promise.all([actions.appCreateRowAction(example.app.slug, config.tableId, values), actions.appCreateRowAction(example.app.slug, config.tableId, values)])
      expect(results).toEqual([{ ok: true }, { ok: true }]); expect(await own(example)).toHaveLength(countBefore + 1)
      const row = (await database.db.select().from(database.rows).where(eq(database.rows.tableId, config.tableId)))
        .find(row => (row.data as Record<string, unknown>)[config.submissionFieldId!] === JSON.parse(String(values[cart.fieldId])).requestId)!
      const original = (await stored(row.id)).data as Record<string, unknown>, positions = original[cart.positionsFieldId] as string[]
      expect(positions).toHaveLength(1)
      const item = (await stored(positions[0]!)).data as Record<string, unknown>
      expect(item[cart.quantityFieldId]).toBe(2); expect(item[cart.itemEmailFieldId]).toBe(email)
      const productId = JSON.parse(String(values[cart.fieldId])).items[0].id as string
      await mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, config.catalog!.tableId, productId, { [cart.priceFieldId]: 999 }, { id: null, kind: 'member' }))
      expect(((await stored(positions[0]!)).data as Record<string, unknown>)[cart.itemPriceFieldId]).toBe(item[cart.itemPriceFieldId])
      const beforeBad = (await database.db.select().from(database.rows).where(eq(database.rows.tableId, cart.itemsTableId))).length
      const bad = { ...values, [cart.fieldId]: JSON.stringify({ requestId: randomUUID(), items: [{ id: productId, qty: 1 }, { id: 'foreign-row', qty: 1 }] }) }
      bad[config.submissionFieldId!] = JSON.parse(String(bad[cart.fieldId])).requestId
      expect((await actions.appCreateRowAction(example.app.slug, config.tableId, bad)).ok).toBe(false)
      expect(await database.db.select().from(database.rows).where(eq(database.rows.tableId, cart.itemsTableId))).toHaveLength(beforeBad)
    }
  })
  it('allows only assigned workers to edit, restricts fields and rejects client edits of status or internal data', async () => {
    for (const { example } of fixtures) {
      const config = example.app.customer!, id = ids.get(example.template.id)!
      await mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, config.tableId, id, { [config.assignmentFieldId!]: worker }, { id: null, kind: 'member' }))
      await signIn(other)
      expect((await decisions.customerDecisionAction(example.app.slug, id, (await stored(id)).version, 'cancel')).ok).toBe(false)
      expect(await own(example)).toHaveLength(0)
      await signIn(worker)
      const workerRuntime = (await runtime.loadPublishedApp(example.app.slug, (await sessions.currentAppAccess(example.app)).visitor))!
      if (example.template.id === 'zayavki') {
        const financialFields = ['price', 'paid'].map(key => example.field('zayavki', key).id)
        expect(workerRuntime.tables[config.tableId]!.fields.some(field => financialFields.includes(field.id))).toBe(false)
        expect(workerRuntime.tables[config.tableId]!.rows.every(row => financialFields.every(field => !(field in row.data)))).toBe(true)
      }
      if (config.cart) {
        expect(workerRuntime.tables[config.cart.itemsTableId]!.rows).toHaveLength(1)
        expect(workerRuntime.tables[config.cart.itemsTableId]!.rows[0]!.data[config.cart.quantityFieldId]).toBe(2)
      }
      const fields = example.byTable.get(config.tableId)!, summary = fields.find(field => field.name === 'Ответ клиенту')!
      const before = await stored(id)
      expect((await actions.appUpdateRowAction(example.app.slug, config.tableId, id, { [summary.id]: 'Ответ исполнителя', [config.emailFieldId]: other }, before.version)).ok).toBe(true)
      expect(((await stored(id)).data as Record<string, unknown>)[config.emailFieldId]).toBe(email)
      state.jar.set(STAFF_SESSION_COOKIE, customerCookie)
      expect((await actions.appUpdateRowAction(example.app.slug, config.tableId, id, { [config.statusFieldId]: config.cancelStatus }, (await stored(id)).version)).ok).toBe(false)
    }
  })
  it('requires repair approval, checks stale versions and asks again after an estimate changes', async () => {
    const example = fixtures.find(fixture => fixture.example.template.id === 'service')!.example, config = example.app.customer!, approval = config.approval!, id = ids.get('service')!
    await expect(mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, config.tableId, id, { [config.statusFieldId]: approval.approvedStatus }, { id: null, kind: 'member' }))).rejects.toThrow('Дождитесь согласия')
    for (const status of approval.consentRequiredStatuses ?? []) await expect(mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, config.tableId, id, { [config.statusFieldId]: status }, { id: null, kind: 'member' }))).rejects.toThrow('Дождитесь согласия')
    await expect(mutation.writeRows(example.app.workspaceId, context => mutation.createRow(context, config.tableId, { [config.statusFieldId]: approval.approvedStatus, [approval.priceFieldId]: 5000, [approval.approvedPriceFieldId]: 5000 }, { id: null, kind: 'member' }))).rejects.toThrow('подтверждает клиент')
    await mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, config.tableId, id, { [config.statusFieldId]: approval.waitingStatus, [approval.priceFieldId]: 5000 }, { id: null, kind: 'member' }))
    state.jar.set(STAFF_SESSION_COOKIE, customerCookie)
    const before = await stored(id)
    expect((await decisions.customerDecisionAction(example.app.slug, id, before.version - 1, 'approve')).ok).toBe(false)
    expect(await decisions.customerDecisionAction(example.app.slug, id, before.version, 'approve')).toEqual({ ok: true })
    expect(((await stored(id)).data as Record<string, unknown>)[approval.approvedPriceFieldId]).toBe(5000)
    await mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, config.tableId, id, { [approval.priceFieldId]: 6000 }, { id: null, kind: 'member' }))
    const changed = await stored(id), data = changed.data as Record<string, unknown>
    expect(data[config.statusFieldId]).toBe(approval.waitingStatus); expect(data[approval.approvedPriceFieldId]).toBeNull()
    expect(await decisions.customerDecisionAction(example.app.slug, id, changed.version, 'decline')).toEqual({ ok: true })
  })
  it('links support to an owned order, rejects a foreign order, and exposes the reply only to its customer', async () => {
    const example = fixtures.find(fixture => fixture.example.template.id === 'portal')!.example, support = example.app.customerSections![0]!, parent = support.parent!, orderId = ids.get('portal')!
    state.jar.set(STAFF_SESSION_COOKIE, customerCookie)
    const value = { [parent.relationFieldId]: [orderId], [example.field('tickets', 'subject').id]: 'Уточнить выдачу', [example.field('tickets', 'text').id]: 'Можно забрать завтра?', [support.submissionFieldId!]: randomUUID() }
    expect(await actions.appCreateRowAction(example.app.slug, support.tableId, value)).toEqual({ ok: true })
    expect(await actions.appCreateRowAction(example.app.slug, support.tableId, value)).toEqual({ ok: true })
    const ownRuntime = (await runtime.loadPublishedApp(example.app.slug, (await sessions.currentAppAccess(example.app)).visitor))!
    expect(ownRuntime.tables[support.tableId]!.rows).toHaveLength(1)
    const ticket = ownRuntime.tables[support.tableId]!.rows[0]!
    expect(ticket.data[parent.relationFieldId]).toEqual([orderId])
    const foreignOrder = example.rows.find(row => row.tableId === parent.tableId && row.data[parent.emailFieldId] !== email)!
    expect((await actions.appCreateRowAction(example.app.slug, support.tableId, { ...value, [parent.relationFieldId]: [foreignOrder.id], [support.submissionFieldId!]: randomUUID() })).ok).toBe(false)
    await mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, support.tableId, ticket.id, { [support.assignmentFieldId!]: worker }, { id: null, kind: 'member' }))
    await signIn(worker)
    const answer = example.field('tickets', 'answer').id
    expect(await actions.appUpdateRowAction(example.app.slug, support.tableId, ticket.id, { [answer]: 'Да, завтра после 10:00' }, (await stored(ticket.id)).version)).toEqual({ ok: true })
    state.jar.set(STAFF_SESSION_COOKIE, customerCookie)
    expect((await runtime.loadPublishedApp(example.app.slug, (await sessions.currentAppAccess(example.app)).visitor))!.tables[support.tableId]!.rows[0]!.data[answer]).toBe('Да, завтра после 10:00')
    await signIn(other)
    expect((await runtime.loadPublishedApp(example.app.slug, (await sessions.currentAppAccess(example.app)).visitor))!.tables[support.tableId]!.rows).toHaveLength(0)
    state.jar.set(STAFF_SESSION_COOKIE, customerCookie)
  })
  it('never shares line records between two orders, even for the same customer', async () => {
    const example = fixtures.find(fixture => fixture.example.template.id === 'zakazy')!.example, config = example.app.customer!, cart = config.cart!
    const orders = await own(example), first = orders[0]!, second = orders[1]!
    await expect(mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, config.tableId, second.id, { [cart.positionsFieldId]: first.data[cart.positionsFieldId] }, { id: null, kind: 'member' }))).rejects.toThrow('принадлежит другому заказу')
  })
  it('prevents overlapping property viewings and cancellation releases the time', async () => {
    const example = fixtures.find(fixture => fixture.example.template.id === 'nedvizhimost')!.example, config = example.app.customer!, appointment = config.appointment!, id = ids.get('nedvizhimost')!
    const start = new Date(Date.now() + 5 * 86_400_000).toISOString()
    state.jar.set(STAFF_SESSION_COOKIE, customerCookie)
    expect(await actions.appCreateRowAction(example.app.slug, config.tableId, input(example))).toEqual({ ok: true })
    const otherId = (await own(example)).find(row => row.id !== id)!.id
    const patch = { [config.assignmentFieldId!]: worker, [appointment.fieldId]: start, [config.statusFieldId]: appointment.confirmedStatus }
    await mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, config.tableId, id, patch, { id: null, kind: 'member' }))
    await expect(mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, config.tableId, otherId, patch, { id: null, kind: 'member' }))).rejects.toThrow('уже назначен просмотр')
    expect(await decisions.customerDecisionAction(example.app.slug, id, (await stored(id)).version, 'cancel')).toEqual({ ok: true })
    await expect(mutation.writeRows(example.app.workspaceId, context => mutation.updateRow(context, config.tableId, otherId, patch, { id: null, kind: 'member' }))).resolves.toBeDefined()
  })
  it('retains cancellations in every customer history and rejects repeated or foreign decisions', async () => {
    state.jar.set(STAFF_SESSION_COOKIE, customerCookie)
    for (const { example } of fixtures.filter(fixture => !['service', 'nedvizhimost'].includes(fixture.example.template.id))) {
      const config = example.app.customer!, id = ids.get(example.template.id)!, before = await stored(id)
      expect(await decisions.customerDecisionAction(example.app.slug, id, before.version, 'cancel')).toEqual({ ok: true })
      expect((await own(example)).find(row => row.id === id)!.data[config.statusFieldId]).toBe(config.cancelStatus)
      expect((await decisions.customerDecisionAction(example.app.slug, id, before.version, 'cancel')).ok).toBe(false)
      const different = fixtures.find(fixture => fixture.example !== example)!.example
      expect((await decisions.customerDecisionAction(different.app.slug, id, (await stored(id)).version, 'cancel')).ok).toBe(false)
    }
  })
  it('lists only accessible sections of this business and never enumerates another email’s cabinets', async () => {
    state.jar.set(STAFF_SESSION_COOKIE, customerCookie)
    const first = fixtures[0]!.example
    const sibling = { ...first.app, id: newId('app'), name: 'Другой раздел', slug: `workflow-${newId('app').toLowerCase()}` }
    sibling.screens = sibling.screens.map(screen => ({ ...screen, appId: sibling.id }))
    const closed = { ...sibling, id: newId('app'), slug: `workflow-${newId('app').toLowerCase()}`, accessMode: 'allowlist' as const }
    closed.screens = closed.screens.map(screen => ({ ...screen, appId: closed.id }))
    for (const app of [sibling, closed]) await database.db.insert(database.apps).values({ id: app.id, workspaceId: first.app.workspaceId, name: app.name, slug: app.slug, draft: app, published: app })
    const directory = await import('./customer-apps'), auth = await import('@/app/auth-actions')
    const sections = await directory.listAccessibleApps(email, first.app.workspaceId)
    expect(sections.map(app => app.slug).sort()).toEqual([first.app.slug, sibling.slug].sort())
    expect(sections.every(app => app.businessId === first.app.workspaceId && app.businessName === `Бизнес ${first.template.id}`)).toBe(true)
    expect(await auth.appsForStaff(other)).toEqual([])
    expect((await auth.appsForStaff(email)).some(app => app.slug === closed.slug)).toBe(false)
  })
  it('saves only the current business’s public profile and denies a viewer’s changes', async () => {
    const fixture = fixtures[0]!, second = fixtures[1]!, action = await import('@/app/business-actions')
    expect((await action.saveBusinessProfileAction({ name: 'Чужой бизнес' })).ok).toBe(false)
    const sessionId = newId('session')
    await database.db.insert(database.sessions).values({ id: sessionId, userId: fixture.userId, expiresAt: new Date(Date.now() + 3_600_000) })
    state.jar.set(MEMBER_SESSION_COOKIE, sessionId); state.jar.set(ACTIVE_WORKSPACE_COOKIE, fixture.workspaceId)
    expect((await action.saveBusinessProfileAction({ name: '  ' })).ok).toBe(false)
    expect(await action.saveBusinessProfileAction({ name: 'Мой салон', phone: '+7 900 000-00-00', location: 'Первый филиал', workspaceId: second.workspaceId })).toEqual({ ok: true })
    const profile = await import('./business-profile')
    expect(await profile.loadBusinessProfile(fixture.workspaceId)).toEqual({ name: 'Мой салон', phone: '+7 900 000-00-00', location: 'Первый филиал' })
    expect((await profile.loadBusinessProfile(second.workspaceId))!.name).toBe(`Бизнес ${second.example.template.id}`)
    await database.db.update(database.workspaceMembers).set({ role: 'viewer' }).where(and(eq(database.workspaceMembers.workspaceId, fixture.workspaceId), eq(database.workspaceMembers.userId, fixture.userId)))
    expect((await action.saveBusinessProfileAction({ name: 'Не разрешено' })).ok).toBe(false)
    expect((await profile.loadBusinessProfile(fixture.workspaceId))!.name).toBe('Мой салон')
    state.jar.delete(MEMBER_SESSION_COOKIE); state.jar.delete(ACTIVE_WORKSPACE_COOKIE)
  })
})
