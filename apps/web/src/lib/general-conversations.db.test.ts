import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { customerWorkflows, newId } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import { GENERAL_CONVERSATION_SELF as SELF, GENERAL_CONVERSATION_TABLE as GENERAL } from './conversation-types'
import { CRM_PROFILE_PREFIX } from './customer-history-types'

const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)
const identity = vi.hoisted(() => ({ cookie: '', member: null as import('./session').Member | null }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => identity.cookie ? { value: identity.cookie } : undefined }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))

describe.skipIf(!process.env.DATABASE_URL)('general business conversations in PostgreSQL', () => {
  let database: typeof import('@tableapp/db'), service: typeof import('./conversations'), inbox: typeof import('./conversation-inbox'), grants: typeof import('./general-conversation-access')
  const ownerId = newId('user'), coownerId = newId('user'), editorId = newId('user'), viewerId = newId('user'), outsiderId = newId('user')
  const ownerEmail = `${ownerId}@example.invalid`, editorEmail = `${editorId}@example.invalid`, viewerEmail = `${viewerId}@example.invalid`
  const clientEmail = 'new-customer@example.invalid', spaces: string[] = [], sessions: string[] = []
  beforeAll(async () => {
    database = await import('@tableapp/db'); service = await import('./conversations'); inbox = await import('./conversation-inbox'); grants = await import('./general-conversation-access')
    await database.db.insert(database.users).values([
      { id: ownerId, email: ownerEmail, name: 'Владелец' }, { id: coownerId, email: `${coownerId}@example.invalid`, name: 'Совладелец' },
      { id: editorId, email: editorEmail, name: 'Оператор' }, { id: viewerId, email: viewerEmail, name: 'Зритель' }, { id: outsiderId, email: `${outsiderId}@example.invalid` },
    ])
  })
  afterEach(() => { identity.cookie = ''; identity.member = null })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, spaces))
    if (sessions.length) await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.id, sessions))
    await database.db.delete(database.users).where(inArray(database.users.id, [ownerId, coownerId, editorId, viewerId, outsiderId])); await database.sql.end()
  })

  async function business(template = 'zakazy') {
    const example = templateExample(template), workspaceId = newId('workspace'); spaces.push(workspaceId)
    const app = { ...example.app, workspaceId, slug: `general-${workspaceId}`, communications: { enabled: true },
      allowlist: [{ email: editorEmail, roleId: 'staff', company: '' }, { email: viewerEmail, roleId: 'staff', company: '' }] }
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId, slug: workspaceId, name: 'General business', businessProfile: { name: 'General business', phone: '', location: '' } })
    await database.db.insert(database.workspaceMembers).values([
      { workspaceId, userId: ownerId, role: 'owner' }, { workspaceId, userId: coownerId, role: 'owner' },
      { workspaceId, userId: editorId, role: 'editor' }, { workspaceId, userId: viewerId, role: 'viewer' },
    ])
    await database.db.insert(database.tables).values(example.built.tables.map(table => ({ ...table, workspaceId })))
    await database.db.insert(database.fields).values(example.fields); await database.db.insert(database.views).values(example.views)
    await database.db.insert(database.apps).values({ id: app.id, workspaceId, slug: app.slug, name: app.name, draft: app, published: app, publishedAt: new Date() })
    return { app, workspaceId, example }
  }
  type Business = Awaited<ReturnType<typeof business>>
  async function signIn(email = clientEmail) {
    identity.member = null
    const id = newId('session'); sessions.push(id)
    await database.db.insert(database.staffSessions).values({ id, email, expiresAt: new Date(Date.now() + 3600000) }); identity.cookie = id
  }
  function member(first: Business, userId = ownerId, role: import('./roles').MemberRole = 'owner', email = ownerEmail) {
    identity.cookie = ''; identity.member = { userId, email, name: 'Member', workspaceId: first.workspaceId, workspaceName: 'General business', role }
  }
  const send = (first: Business, body: string, target = SELF, business = false, requestId = randomUUID(), internal = false, fileIds: string[] = []) => service.sendConversation(first.app.slug, GENERAL, target, { body, requestId, internal, fileIds }, business)
  const read = (first: Business, target = SELF, business = false, before?: number) => service.readConversation(first.app.slug, GENERAL, target, before, business)
  async function customer(first: Business, email = clientEmail) {
    const [found] = await database.db.select().from(database.businessCustomers).where(and(eq(database.businessCustomers.workspaceId, first.workspaceId), eq(database.businessCustomers.email, email)))
    return found!
  }

  it('allows a verified first question without any order, row, enrolment or existing customer and deduplicates retries', async () => {
    const first = await business(); await signIn()
    expect((await read(first)).messages).toEqual([])
    expect(await customer(first)).toBeUndefined()
    const requestId = randomUUID(), one = await send(first, 'Можно уточнить наличие?', SELF, false, requestId)
    expect(await send(first, 'Можно уточнить наличие?', SELF, false, requestId)).toEqual(one)
    const profile = await customer(first)
    const [thread] = await database.db.select().from(database.conversations).where(eq(database.conversations.customerId, profile.id))
    expect(thread).toMatchObject({ kind: 'general', workspaceId: first.workspaceId, moduleId: null, tableId: null, rowId: null })
    expect((await read(first)).messages.map(message => message.body)).toEqual(['Можно уточнить наличие?'])
    expect(await database.db.select({ id: database.rows.id }).from(database.rows).where(inArray(database.rows.tableId, first.example.built.tables.map(table => table.id)))).toEqual([])
    expect(await database.db.select({ id: database.appUsers.id }).from(database.appUsers).where(eq(database.appUsers.appId, first.app.id))).toEqual([])
    expect((await inbox.listConversationInbox({ slug: first.app.slug })).items[0]).toMatchObject({ kind: 'general', tableId: GENERAL, rowId: profile.id, detailScreenId: '' })
  })

  it('isolates general conversations and business profiles by business and verified customer', async () => {
    const first = await business(), second = await business(); await signIn()
    await send(first, 'Первый бизнес'); await send(second, 'Второй бизнес')
    const a = await customer(first), b = await customer(second)
    expect(a.id).not.toBe(b.id)
    await database.db.update(database.businessCustomers).set({ name: 'Только у первого', phone: '111' }).where(eq(database.businessCustomers.id, a.id))
    expect(await customer(second)).toMatchObject({ name: null, phone: null })
    await expect(read(first, b.id)).rejects.toThrow('недоступ')
    await signIn('other-customer@example.invalid')
    await expect(read(first, a.id)).rejects.toThrow('недоступ')
    expect((await inbox.listConversationInbox({ slug: first.app.slug })).items).toEqual([])
    identity.cookie = ''
    await expect(read(first)).rejects.toThrow('недоступ')
    member(second)
    await expect(read(first, a.id, true)).rejects.toThrow('недоступ')
  })

  it('requires explicit live editor grants in both identity circuits and immediately revokes downgraded or removed members', async () => {
    const first = await business(); await signIn(); await send(first, 'Нужна консультация')
    const profile = await customer(first)
    member(first, editorId, 'editor', editorEmail)
    await expect(read(first, profile.id, true)).rejects.toThrow('недоступ')
    await signIn(editorEmail)
    await expect(read(first, profile.id)).rejects.toThrow('недоступ')
    await expect(read(first)).rejects.toThrow('недоступ')
    member(first, coownerId, 'owner', `${coownerId}@example.invalid`)
    const list = await grants.getGeneralMessageAccess()
    expect(list.operators).toEqual([{ userId: editorId, email: editorEmail, name: 'Оператор', allowed: false }])
    await grants.setGeneralMessageAccess(editorId, true)
    await expect(grants.setGeneralMessageAccess(viewerId, true)).rejects.toThrow('недоступ')
    await expect(grants.setGeneralMessageAccess(outsiderId, true)).rejects.toThrow('недоступ')
    member(first, editorId, 'editor', editorEmail)
    expect((await read(first, profile.id, true)).staff).toBe(true)
    await expect(grants.setGeneralMessageAccess(editorId, false)).rejects.toThrow('недоступ')
    await signIn(editorEmail)
    expect((await read(first, profile.id)).staff).toBe(true)
    await database.db.update(database.workspaceMembers).set({ role: 'viewer' }).where(and(eq(database.workspaceMembers.workspaceId, first.workspaceId), eq(database.workspaceMembers.userId, editorId)))
    await expect(read(first, profile.id)).rejects.toThrow('недоступ')
    await database.db.update(database.workspaceMembers).set({ role: 'editor' }).where(and(eq(database.workspaceMembers.workspaceId, first.workspaceId), eq(database.workspaceMembers.userId, editorId)))
    member(first); await grants.setGeneralMessageAccess(editorId, false)
    await signIn(editorEmail); await expect(read(first, profile.id)).rejects.toThrow('недоступ')
    member(first); await grants.setGeneralMessageAccess(editorId, true)
    await database.db.delete(database.workspaceMembers).where(and(eq(database.workspaceMembers.workspaceId, first.workspaceId), eq(database.workspaceMembers.userId, editorId)))
    expect(await database.db.select().from(database.generalMessageOperators).where(eq(database.generalMessageOperators.workspaceId, first.workspaceId))).toEqual([])
    await signIn(editorEmail); await expect(read(first, profile.id)).rejects.toThrow('недоступ')
  })

  it('keeps private notes and revisions private, tracks unread and resumes a closed general conversation for a new client question', async () => {
    const first = await business(); await signIn(); const sent = await send(first, 'Первый вопрос'), profile = await customer(first)
    member(first)
    expect((await inbox.listConversationInbox({}, true)).items[0]!.unread).toBe(1)
    const firstSequence = (await read(first, profile.id, true)).messages[0]!.sequence
    await inbox.markConversationRead(first.app.slug, GENERAL, profile.id, firstSequence, true)
    await send(first, 'PRIVATE_NOTE', profile.id, true, randomUUID(), true)
    const answer = await send(first, 'Ответ бизнеса', profile.id, true)
    await service.closeConversation(first.app.slug, GENERAL, profile.id, true, true)
    await signIn()
    const page = await read(first)
    expect(page.closed).toBe(true); expect(page.notes).toEqual([])
    expect((await inbox.listConversationInbox({ slug: first.app.slug })).items[0]!.unread).toBe(1)
    await expect(service.conversationMessageHistory(first.app.slug, GENERAL, SELF, answer.id)).rejects.toThrow('недоступ')
    await service.changeConversationMessage(first.app.slug, GENERAL, SELF, sent.id, 0, 'Уточнение вопроса')
    expect((await service.conversationMessageHistory(first.app.slug, GENERAL, SELF, sent.id))[0]!.body).toBe('Первый вопрос')
    await send(first, 'Новый вопрос')
    expect((await read(first)).closed).toBe(false)
    expect((await read(first)).messages).toHaveLength(3)
    expect(JSON.stringify(await inbox.listConversationInbox({ slug: first.app.slug }))).not.toContain('PRIVATE_NOTE')
  })

  it('rechecks explicit grants for attached files and never exposes another customer or deleted-message attachments', async () => {
    const first = await business(); await signIn()
    const prepared = await service.prepareConversationUpload(first.app.slug, GENERAL, SELF), fileId = newId('attachment')
    await database.db.insert(database.attachments).values({ id: fileId, workspaceId: first.workspaceId, key: `${first.workspaceId}/${fileId}.txt`, name: 'Вопрос.txt', mime: 'text/plain', size: 1,
      uploadedBy: prepared.uploadedBy, conversationId: prepared.conversationId, state: 'ready' })
    const [file] = await database.db.select().from(database.attachments).where(eq(database.attachments.id, fileId))
    expect(await service.canReadConversationFile(file!)).toBe(true)
    const sent = await send(first, '', SELF, false, randomUUID(), false, [fileId]), profile = await customer(first)
    const [attached] = await database.db.select().from(database.attachments).where(eq(database.attachments.id, fileId))
    await signIn('other-customer@example.invalid'); expect(await service.canReadConversationFile(attached!)).toBe(false)
    member(first); await grants.setGeneralMessageAccess(editorId, true)
    await signIn(editorEmail); expect(await service.canReadConversationFile(attached!)).toBe(true)
    member(first); await grants.setGeneralMessageAccess(editorId, false)
    await signIn(editorEmail); expect(await service.canReadConversationFile(attached!)).toBe(false)
    await signIn(); await service.changeConversationMessage(first.app.slug, GENERAL, SELF, sent.id, 0, null)
    expect(await service.canReadConversationFile(attached!)).toBe(false)
    expect((await read(first, profile.id)).messages[0]!.files).toEqual([])
  })

  it('blocks new general sends and uploads when disabled while keeping existing history readable', async () => {
    const first = await business(); await signIn(); await send(first, 'Сохранённый вопрос')
    const disabled = { ...first.app, communications: { enabled: false } }
    await database.db.update(database.apps).set({ draft: disabled, published: disabled }).where(eq(database.apps.id, first.app.id))
    expect((await read(first)).messages[0]!.body).toBe('Сохранённый вопрос')
    await expect(send(first, 'Новое сообщение')).rejects.toThrow('отключены')
    await expect(service.prepareConversationUpload(first.app.slug, GENERAL, SELF)).rejects.toThrow('отключены')
    expect((await inbox.listConversationInbox({ slug: first.app.slug })).items).toHaveLength(1)
  })

  it('shares one general thread across apps of a business and returns the requested app target', async () => {
    const first = await business(), appId = newId('app')
    const secondApp = { ...first.app, id: appId, slug: `${first.app.slug}-second`, screens: first.app.screens.map(screen => ({ ...screen, appId })) }
    await database.db.insert(database.apps).values({ id: appId, workspaceId: first.workspaceId, name: secondApp.name, slug: secondApp.slug, draft: secondApp, published: secondApp, publishedAt: new Date() })
    await signIn(); const one = await send(first, 'Вопрос в первом приложении')
    await service.sendConversation(secondApp.slug, GENERAL, SELF, { body: 'Продолжение в другом приложении', requestId: randomUUID() })
    const profiles = await database.db.select().from(database.businessCustomers).where(eq(database.businessCustomers.workspaceId, first.workspaceId))
    const threads = await database.db.select().from(database.conversations).where(eq(database.conversations.workspaceId, first.workspaceId))
    expect(profiles).toHaveLength(1); expect(threads).toHaveLength(1)
    expect((await service.readConversation(secondApp.slug, GENERAL, SELF)).messages.map(message => message.id)).toContain(one.id)
    expect((await inbox.listConversationInbox({ slug: secondApp.slug })).items[0]!.slug).toBe(secondApp.slug)
  })

  it('paginates mixed general and record threads by one cursor and preserves the customer history filter', async () => {
    const first = await business(), config = customerWorkflows(first.app)[0]!
    const source = first.example.rows.find(row => row.tableId === config.tableId)!
    await database.db.insert(database.rows).values({ ...source, data: { ...source.data, [config.emailFieldId]: clientEmail } })
    const customers = Array.from({ length: 52 }, (_, index) => ({ id: newId('businessCustomer'), workspaceId: first.workspaceId,
      email: index === 0 ? clientEmail : `paging-${index}@example.invalid`, name: `Клиент ${index}` }))
    await database.db.insert(database.businessCustomers).values(customers)
    const threads = customers.map(profile => ({ id: `con_${newId('row').slice(4)}`, workspaceId: first.workspaceId, appId: first.app.id, kind: 'general' as const, customerId: profile.id }))
    await database.db.insert(database.conversations).values(threads)
    await database.db.insert(database.conversationMessages).values(threads.map((thread, index) => ({ id: `msg_${newId('row').slice(4)}`, workspaceId: first.workspaceId, conversationId: thread.id,
      authorId: 'synthetic-client', authorKind: 'client', authorName: 'Клиент', requestId: randomUUID(), body: `Вопрос ${index}` })))
    member(first)
    await service.sendConversation(first.app.slug, config.tableId, source.id, { body: 'Ответ по заказу', requestId: randomUUID() }, true)
    const page = await inbox.listConversationInbox({}, true)
    expect(page.items).toHaveLength(50); expect(page.next).toBeTruthy()
    expect(page.items[0]!.tableId).toBe(config.tableId)
    const next = await inbox.listConversationInbox({ before: page.next! }, true)
    expect(next.items).toHaveLength(3); expect(next.next).toBeNull()
    expect(new Set([...page.items, ...next.items].map(item => item.id)).size).toBe(53)
    const crmExample = templateExample('crm'), crmConfig = customerWorkflows(crmExample.app).find(workflow => workflow.crm)!
    const crmApp = { ...crmExample.app, workspaceId: first.workspaceId, slug: `general-crm-${first.workspaceId}` }
    await database.db.insert(database.tables).values(crmExample.built.tables.map(table => ({ ...table, workspaceId: first.workspaceId })))
    await database.db.insert(database.fields).values(crmExample.fields); await database.db.insert(database.views).values(crmExample.views)
    await database.db.insert(database.apps).values({ id: crmApp.id, workspaceId: first.workspaceId, name: crmApp.name, slug: crmApp.slug, draft: crmApp, published: crmApp })
    const filtered = await inbox.listConversationInbox({ customer: { tableId: crmConfig.crm!.clientsTableId, rowId: `${CRM_PROFILE_PREFIX}${customers[0]!.id}` } }, true)
    expect(filtered.items).toHaveLength(2)
    expect(filtered.items.some(item => item.kind === 'general')).toBe(true)
    expect(filtered.items.some(item => item.tableId === config.tableId)).toBe(true)
  })

  it('enforces the general-vs-record target and tenant constraints in PostgreSQL', async () => {
    const first = await business(), second = await business(); await signIn(); await send(first, 'Вопрос'); await send(second, 'Второй')
    const own = await customer(first), foreign = await customer(second)
    await expect(database.db.insert(database.conversations).values({ id: `con_${randomUUID()}`, workspaceId: first.workspaceId, customerId: own.id, kind: 'record' })).rejects.toThrow()
    await expect(database.db.insert(database.conversations).values({ id: `con_${randomUUID()}`, workspaceId: first.workspaceId, customerId: own.id, kind: 'general', moduleId: 'fake' })).rejects.toThrow()
    await expect(database.db.insert(database.conversations).values({ id: `con_${randomUUID()}`, workspaceId: first.workspaceId, customerId: foreign.id, kind: 'general' })).rejects.toThrow()
    await expect(database.db.insert(database.conversations).values({ id: `con_${randomUUID()}`, workspaceId: first.workspaceId, customerId: own.id, kind: 'general' })).rejects.toThrow()
  })
})
