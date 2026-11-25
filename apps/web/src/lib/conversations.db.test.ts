import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import { composeModules } from './module-composition'

const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)
const identity = vi.hoisted(() => ({ cookie: '', member: null as import('./session').Member | null }))
const storage = vi.hoisted(() => ({ putFile: vi.fn(), getFile: vi.fn(), deleteFile: vi.fn(), fileKey: (space: string) => `${space}/conversation-${Math.random()}.txt` }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => identity.cookie ? { value: identity.cookie } : undefined }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('@/lib/storage', () => storage)

describe.skipIf(!process.env.DATABASE_URL)('conversation persistence and access in PostgreSQL', () => {
  let database: typeof import('@tableapp/db'), service: typeof import('./conversations')
  const ownerId = newId('user'), ownerEmail = `${ownerId}@example.invalid`, clientEmail = 'irina@example.invalid'
  const staffEmail = 'assigned@example.invalid', managerEmail = 'manager@example.invalid', spaces: string[] = [], sessions: string[] = []
  beforeAll(async () => {
    database = await import('@tableapp/db'); service = await import('./conversations')
    await database.db.insert(database.users).values({ id: ownerId, email: ownerEmail })
    storage.putFile.mockResolvedValue({ ok: true }); storage.deleteFile.mockResolvedValue(undefined)
    storage.getFile.mockImplementation(async () => ({ mime: 'text/plain', body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('Controlled document')); controller.close() } }) }))
  })
  afterEach(() => { identity.cookie = ''; identity.member = null })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, spaces))
    await database.db.delete(database.staffSessions).where(inArray(database.staffSessions.id, sessions))
    await database.db.delete(database.users).where(eq(database.users.id, ownerId)); await database.sql.end()
  })
  async function business(template = 'service', composite = false) {
    const example = templateExample(template), second = composite ? templateExample('zakazy') : null, workspaceId = newId('workspace'); spaces.push(workspaceId)
    const views = [...example.views, ...second?.views ?? []], raw = second ? composeModules(example.app, second.app, new Map(views.map(view => [view.id, view]))) : example.app
    const app = { ...raw, workspaceId, slug: `chat-${workspaceId}`, communications: { enabled: true },
      allowlist: [{ email: staffEmail, roleId: 'staff', company: '' }, { email: managerEmail, roleId: 'manager', company: '' }] }
    if (app.moduleAccess) app.moduleAccess.grants = app.modules!.flatMap(module => module.kind === 'sales' ? [{ email: 'sales-worker@example.invalid', moduleId: module.id, roleId: module.roles!.staff! }] : [{ email: staffEmail, moduleId: module.id, roleId: module.roles!.staff! }, { email: managerEmail, moduleId: module.id, roleId: module.roles!.manager! }])
    const tableId = app.booking?.tables.visits ?? app.customer!.tableId, emailField = app.booking?.visit.email ?? app.customer!.emailFieldId
    const assignment = app.booking?.visit.masterEmail ?? app.customer!.assignmentFieldId!
    const source = example.rows.find(row => row.tableId === tableId)!, rowId = source.id
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId, slug: workspaceId, name: 'Controlled conversation business', plan: 'business', businessProfile: { name: 'Controlled business', phone: '', location: '' } })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId: ownerId, role: 'owner' })
    await database.db.insert(database.tables).values([...example.built.tables, ...second?.built.tables ?? []].map(table => ({ ...table, workspaceId })))
    await database.db.insert(database.fields).values([...example.fields, ...second?.fields ?? []])
    await database.db.insert(database.views).values(views)
    await database.db.insert(database.rows).values([...example.rows, ...second?.rows ?? []].map(row => row.id === rowId ? { ...row, data: { ...row.data, [emailField]: clientEmail, [assignment]: staffEmail } } : row))
    await database.db.insert(database.apps).values({ id: app.id, workspaceId, slug: app.slug, name: app.name, draft: app, published: app, publishedAt: new Date() })
    return { app, workspaceId, tableId, rowId, assignment, emailField }
  }
  type Business = Awaited<ReturnType<typeof business>>
  it('aggregates business modules with live work grants, keeping the client and platform identities separate', async () => {
    const first = await business('service', true), second = await business()
    await signIn(clientEmail); await send(first, 'Вопрос по ремонту'); await send(second, 'Чужой бизнес')
    const sales = first.app.customerSections![0]!, [sale] = await database.db.select().from(database.rows).where(eq(database.rows.tableId, sales.tableId)).limit(1)
    await database.db.update(database.rows).set({ data: { ...sale!.data as object, [sales.emailFieldId]: clientEmail, [sales.assignmentFieldId!]: 'sales-worker@example.invalid' } }).where(eq(database.rows.id, sale!.id))
    await service.sendConversation(first.app.slug, sales.tableId, sale!.id, { body: 'Вопрос по покупке', requestId: randomUUID() })
    const inbox = await import('./conversation-inbox'), clientCookie = identity.cookie
    owner(first); identity.cookie = clientCookie
    const all = await inbox.listConversationInbox({}, true)
    expect(all.items).toHaveLength(2)
    expect(all.items.every(item => [first.tableId, sales.tableId].includes(item.tableId))).toBe(true)
    expect((await inbox.listConversationInbox({ slug: first.app.slug })).items).toHaveLength(2)
    await send(first, 'INTERNAL SECRET', randomUUID(), [], true)
    expect(JSON.stringify(await inbox.listConversationInbox({ slug: first.app.slug }))).not.toContain('INTERNAL SECRET')
    identity.member = { ...identity.member!, userId: 'verified-worker', email: 'sales-worker@example.invalid', role: 'editor' }
    const assigned = await inbox.listConversationInbox({}, true)
    expect(assigned.items.map(item => item.tableId)).toEqual([sales.tableId])
    expect((await service.readConversation(first.app.slug, sales.tableId, sale!.id, undefined, true)).staff).toBe(true)
    await expectDenied(() => service.readConversation(first.app.slug, first.tableId, first.rowId, undefined, true))
    identity.member = { ...identity.member!, email: 'ungranted@example.invalid' }
    expect((await inbox.listConversationInbox({}, true)).items).toEqual([])
    await expectDenied(() => service.readConversation(first.app.slug, sales.tableId, sale!.id, undefined, true))
  })
  it('tracks only incoming public messages and never marks a concurrent reply or another person as read', async () => {
    const first = await business(), inbox = await import('./conversation-inbox')
    await signIn(clientEmail); await send(first, 'Вопрос')
    expect((await inbox.listConversationInbox({ slug: first.app.slug })).items[0]!.unread).toBe(0)
    owner(first)
    expect((await inbox.listConversationInbox({}, true)).items[0]!.unread).toBe(1)
    await send(first, 'Приватная заметка', randomUUID(), [], true)
    expect((await inbox.listConversationInbox({}, true)).items[0]!.unread).toBe(1)
    const loaded = (await read(first)).messages.at(-1)!.sequence
    await inbox.markConversationRead(first.app.slug, first.tableId, first.rowId, loaded, true)
    expect((await inbox.listConversationInbox({ unreadOnly: true }, true)).items).toEqual([])
    await send(first, 'Ответ')
    await signIn(clientEmail)
    const seen = (await read(first)).messages.at(-1)!.sequence
    expect((await inbox.listConversationInbox({ slug: first.app.slug })).items[0]!.unread).toBe(1)
    owner(first); await send(first, 'Новый ответ после загрузки')
    await signIn(clientEmail)
    await inbox.markConversationRead(first.app.slug, first.tableId, first.rowId, seen)
    expect((await inbox.listConversationInbox({ slug: first.app.slug, unreadOnly: true })).items[0]!.unread).toBe(1)
    await inbox.markConversationRead(first.app.slug, first.tableId, first.rowId, (await read(first)).messages.at(-1)!.sequence)
    await inbox.markConversationRead(first.app.slug, first.tableId, first.rowId, loaded)
    expect((await inbox.listConversationInbox({ slug: first.app.slug })).items[0]!.unread).toBe(0)
    await signIn('other@example.invalid')
    await expectDenied(() => inbox.markConversationRead(first.app.slug, first.tableId, first.rowId, seen))
    await signIn(clientEmail)
    await expectDenied(() => inbox.markConversationRead(first.app.slug, first.tableId, first.rowId, seen + 1000000))
  })
  it('filters foreign conversations in SQL so clients do not page through inaccessible threads', async () => {
    const first = await business(), inbox = await import('./conversation-inbox')
    const [source] = await database.db.select().from(database.rows).where(eq(database.rows.id, first.rowId))
    const ownCustomer = newId('businessCustomer'), foreignCustomer = newId('businessCustomer')
    await database.db.insert(database.businessCustomers).values([{ id: ownCustomer, workspaceId: first.workspaceId, email: clientEmail }, { id: foreignCustomer, workspaceId: first.workspaceId, email: 'foreign@example.invalid' }])
    const module = first.app.modules?.find(module => module.source.type === 'customer' && module.source.tableId === first.tableId) ?? (await import('./app-modules')).legacyAppModules(first.app)[0]!
    const candidates = Array.from({ length: 53 }, (_, index) => ({ id: `row_inbox_${index}_${first.workspaceId}`, index }))
    await database.db.insert(database.rows).values(candidates.map(item => ({ ...source!, id: item.id, data: { ...source!.data as object, [first.emailField]: item.index === 0 ? clientEmail : 'foreign@example.invalid' } })))
    await database.db.insert(database.conversations).values(candidates.map(item => ({ id: `con_page_${item.index === 0 ? 'a' : `z${String(item.index).padStart(3, '0')}`}_${first.workspaceId}`, workspaceId: first.workspaceId, appId: first.app.id, moduleId: module.id, tableId: first.tableId, rowId: item.id, customerId: item.index === 0 ? ownCustomer : foreignCustomer })))
    await signIn(clientEmail)
    const page = await inbox.listConversationInbox({ slug: first.app.slug })
    expect(page.items.map(item => item.rowId)).toEqual([candidates[0]!.id])
    expect(page.next).toBeNull()
    await expectDenied(() => inbox.listConversationInbox({ slug: first.app.slug, before: 'broken' }))
  })
  async function signIn(email: string) {
    identity.member = null
    const id = newId('session'); sessions.push(id)
    await database.db.insert(database.staffSessions).values({ id, email, expiresAt: new Date(Date.now() + 3600000) }); identity.cookie = id
  }
  function owner(first: Business) { identity.cookie = ''; identity.member = { userId: ownerId, email: ownerEmail, name: 'Owner', workspaceId: first.workspaceId, workspaceName: 'Controlled business', role: 'owner' } }
  const businessMode = () => identity.member?.role === 'owner'
  const send = (first: Business, body = 'Вопрос по обращению', requestId = randomUUID(), fileIds: string[] = [], internal = false) => service.sendConversation(first.app.slug, first.tableId, first.rowId, { body, requestId, fileIds, internal }, businessMode())
  const read = (first: Business, before?: number) => service.readConversation(first.app.slug, first.tableId, first.rowId, before, businessMode())
  const expectDenied = async (run: () => Promise<unknown>) => expect(run()).rejects.toThrow('недоступ')
  async function file(first: Business) {
    const { POST } = await import('@/app/api/conversations/files/route'), form = new FormData()
    for (const [key, value] of Object.entries({ slug: first.app.slug, tableId: first.tableId, rowId: first.rowId })) form.set(key, value)
    if (businessMode()) form.set('business', 'true')
    form.set('file', new File(['Controlled document'], 'document.txt', { type: 'text/plain' }))
    const result = await POST(new Request('http://localhost/api/conversations/files', { method: 'POST', body: form }))
    expect(result.status).toBe(200)
    return (await result.json()).attachment as import('@tableapp/schema').Attachment
  }
  async function download(key: string, business = businessMode()) {
    const { GET } = await import('@/app/api/files/[...key]/route')
    return GET(new Request(`http://localhost/api/files/${key}${business ? '?business=1' : ''}`), { params: Promise.resolve({ key: key.split('/') }) })
  }
  it.each(['salon', 'zakazy', 'service', 'dostavka', 'zayavki', 'nedvizhimost'])('supports client and assigned staff messages for %s', async template => {
    const first = await business(template)
    await signIn(clientEmail); await send(first, 'Мой вопрос')
    if (template === 'salon') expect((await read(first)).contextTitle).toContain('Окрашивание в один тон')
    await signIn(staffEmail); await send(first, 'Ответ сотрудника')
    await signIn(clientEmail); const page = await read(first)
    expect(page.messages.map(message => message.body)).toEqual(['Мой вопрос', 'Ответ сотрудника'])
    expect(page.messages.map(message => message.mine)).toEqual([true, false])
    await signIn('other@example.invalid'); await expectDenied(() => read(first))
  })
  it('deduplicates concurrent sends and keeps the same UUID independent across businesses', async () => {
    const first = await business(), second = await business(), token = randomUUID()
    await signIn(clientEmail)
    const result = await Promise.all([send(first, 'Первый', token), send(first, 'Первый', token), send(second, 'Второй бизнес', token)])
    expect(result[0]).toEqual(result[1]); expect(result[0]).not.toEqual(result[2]); expect((await read(first)).messages).toHaveLength(1)
    await expectDenied(() => service.readConversation(first.app.slug, second.tableId, second.rowId))
    owner(second); await expectDenied(() => read(first))
  })
  it('revokes the former assignee and does not grant another module or workspace editor conversation access', async () => {
    const first = await business('service', true)
    await signIn(clientEmail); await send(first)
    await signIn('sales-worker@example.invalid'); await expectDenied(() => read(first)); await expectDenied(() => send(first))
    await signIn(staffEmail); expect((await read(first)).staff).toBe(true)
    const [parent] = await database.db.select().from(database.rows).where(eq(database.rows.id, first.rowId))
    await database.db.update(database.rows).set({ data: { ...parent!.data as object, [first.assignment]: 'replacement@example.invalid' } }).where(eq(database.rows.id, first.rowId))
    await expectDenied(() => read(first)); await expectDenied(() => send(first))
    await signIn(managerEmail); expect((await read(first)).canManage).toBe(true)
    identity.cookie = ''; identity.member = { userId: newId('user'), email: 'ungranted-editor@example.invalid', name: 'Editor', workspaceId: first.workspaceId, workspaceName: '', role: 'editor' }
    await expectDenied(() => read(first))
    owner(first); expect((await read(first)).canManage).toBe(true)
  })
  it('stores notes separately, excluding them from client responses and writes', async () => {
    const first = await business(); await signIn(staffEmail); await send(first, 'PRIVATE NOTE', randomUUID(), [], true)
    expect((await read(first)).notes[0]!.body).toBe('PRIVATE NOTE')
    await signIn(clientEmail); const page = await read(first)
    expect(page.notes).toEqual([]); expect(JSON.stringify(page)).not.toContain('PRIVATE NOTE')
    await expectDenied(() => send(first, 'forged note', randomUUID(), [], true))
    expect((await database.db.select().from(database.conversationNotes).where(eq(database.conversationNotes.workspaceId, first.workspaceId)))).toHaveLength(1)
  })
  it('keeps the app identity separate from an owner session active in the same browser', async () => {
    const first = await business(); await signIn(clientEmail); const clientCookie = identity.cookie
    await send(first, 'Сообщение клиента')
    owner(first); await send(first, 'Только для сотрудников', randomUUID(), [], true)
    identity.cookie = clientCookie
    const clientPage = await service.readConversation(first.app.slug, first.tableId, first.rowId)
    expect(clientPage.staff).toBe(false); expect(clientPage.notes).toEqual([])
    expect(clientPage.messages[0]!.mine).toBe(true)
    expect((await service.readConversation(first.app.slug, first.tableId, first.rowId, undefined, true)).notes).toHaveLength(1)
    await expectDenied(() => service.closeConversation(first.app.slug, first.tableId, first.rowId, true))
    await service.sendConversation(first.app.slug, first.tableId, first.rowId, { body: 'Ещё один вопрос клиента', requestId: randomUUID() })
    expect((await service.readConversation(first.app.slug, first.tableId, first.rowId)).messages.every(message => message.mine)).toBe(true)
    await signIn('unrelated-client@example.invalid'); const foreignCookie = identity.cookie
    owner(first); identity.cookie = foreignCookie
    await expectDenied(() => service.readConversation(first.app.slug, first.tableId, first.rowId))
    expect((await service.readConversation(first.app.slug, first.tableId, first.rowId, undefined, true)).staff).toBe(true)
    identity.member = { ...identity.member!, role: 'editor' }
    await expectDenied(() => service.readConversation(first.app.slug, first.tableId, first.rowId, undefined, true))
  })
  it('preserves personal authorship across role changes without retaining revoked work permissions', async () => {
    const first = await business(); await signIn(clientEmail); const personal = await send(first, 'Личный вопрос')
    const [parent] = await database.db.select().from(database.rows).where(eq(database.rows.id, first.rowId))
    await database.db.update(database.rows).set({ data: { ...parent!.data as object, [first.assignment]: clientEmail } }).where(eq(database.rows.id, first.rowId))
    await database.db.update(database.apps).set({ published: { ...first.app, allowlist: [...first.app.allowlist, { email: clientEmail, roleId: 'staff', company: '' }] } }).where(eq(database.apps.id, first.app.id))
    expect((await read(first)).messages[0]!.mine).toBe(true)
    await service.changeConversationMessage(first.app.slug, first.tableId, first.rowId, personal.id, 0, 'Уточнённый личный вопрос')
    const work = await send(first, 'Служебный ответ')
    await database.db.update(database.apps).set({ published: first.app }).where(eq(database.apps.id, first.app.id))
    const page = await read(first), former = page.messages.find(message => message.id === work.id)!
    expect(page.staff).toBe(false); expect(former).toMatchObject({ mine: true, canModerate: false, canViewRevisions: false })
    await expectDenied(() => service.changeConversationMessage(first.app.slug, first.tableId, first.rowId, work.id, 0, 'Изменение после отзыва роли'))
    await expectDenied(() => service.conversationMessageHistory(first.app.slug, first.tableId, first.rowId, work.id))
  })
  it('retains versions, rejects stale edits, and restricts moderation and revision history', async () => {
    const first = await business(); await signIn(clientEmail); const message = await send(first, 'Исходный текст')
    await service.changeConversationMessage(first.app.slug, first.tableId, first.rowId, message.id, 0, 'Новый текст')
    await expect(service.changeConversationMessage(first.app.slug, first.tableId, first.rowId, message.id, 0, 'Устаревшая правка')).rejects.toThrow('изменилось')
    expect((await service.conversationMessageHistory(first.app.slug, first.tableId, first.rowId, message.id))[0]!.body).toBe('Исходный текст')
    await signIn(managerEmail); await expectDenied(() => service.conversationMessageHistory(first.app.slug, first.tableId, first.rowId, message.id))
    await expectDenied(() => service.changeConversationMessage(first.app.slug, first.tableId, first.rowId, message.id, 1, null))
    owner(first); await expectDenied(() => service.changeConversationMessage(first.app.slug, first.tableId, first.rowId, message.id, 1, 'Подмена слов клиента', true))
    await service.changeConversationMessage(first.app.slug, first.tableId, first.rowId, message.id, 1, null, true)
    await signIn(clientEmail); const page = await read(first)
    expect(page.messages[0]).toMatchObject({ deleted: true, body: '', version: 2, files: [] })
    expect(await service.conversationMessageHistory(first.app.slug, first.tableId, first.rowId, message.id)).toHaveLength(2)
  })
  it('preserves existing replies when disabled, and closing a discussion preserves history', async () => {
    const first = await business(), second = await business(); await signIn(clientEmail); await send(first)
    for (const item of [first, second]) await database.db.update(database.apps).set({ published: { ...item.app, communications: { enabled: false } } }).where(eq(database.apps.id, item.app.id))
    await send(first, 'Повторный вопрос'); expect((await read(first)).messages).toHaveLength(2)
    await expect(send(second)).rejects.toThrow('отключены')
    await expectDenied(() => service.closeConversation(first.app.slug, first.tableId, first.rowId, true))
    await signIn(managerEmail); await service.closeConversation(first.app.slug, first.tableId, first.rowId, true)
    await signIn(clientEmail); expect((await read(first)).closed).toBe(true); await expect(send(first)).rejects.toThrow('закрыта')
    await expect(service.prepareConversationUpload(first.app.slug, first.tableId, first.rowId)).rejects.toThrow('закрыта')
    await signIn(managerEmail); await service.closeConversation(first.app.slug, first.tableId, first.rowId, false)
    await signIn(clientEmail); await send(first, 'После возобновления')
  })
  it('does not expose former customer history after ownership of the parent changes', async () => {
    const first = await business(); await signIn(clientEmail); await send(first, 'История первого клиента')
    const [parent] = await database.db.select().from(database.rows).where(eq(database.rows.id, first.rowId))
    await database.db.update(database.rows).set({ data: { ...parent!.data as object, [first.emailField]: 'new-owner@example.invalid' } }).where(eq(database.rows.id, first.rowId))
    await expectDenied(() => read(first))
    await signIn('new-owner@example.invalid'); expect((await read(first)).messages).toEqual([]); await send(first, 'Новый клиент')
    expect((await read(first)).messages.map(message => message.body)).toEqual(['Новый клиент'])
  })
  it('pages messages in stable order and protects SQL ownership constraints', async () => {
    const first = await business(), second = await business(); await signIn(clientEmail); await send(first)
    const page = await read(first), [profile] = await database.db.select().from(database.businessCustomers).where(and(eq(database.businessCustomers.workspaceId, first.workspaceId), eq(database.businessCustomers.email, clientEmail)))
    await database.db.insert(database.conversationMessages).values(Array.from({ length: 55 }, (_, index) => ({ id: `msg_${randomUUID()}`, workspaceId: first.workspaceId, conversationId: page.conversationId!, authorId: profile!.id, authorKind: 'client', authorName: 'Client', body: `message ${index}`, requestId: randomUUID() })))
    const latest = await read(first), older = await read(first, latest.nextBefore!)
    expect(latest.messages).toHaveLength(50); expect(older.messages).toHaveLength(6)
    expect(new Set([...older.messages, ...latest.messages].map(message => message.id)).size).toBe(56)
    expect(older.messages.at(-1)!.sequence).toBeLessThan(latest.messages[0]!.sequence)
    await expect(database.db.insert(database.conversations).values({ id: `con_${randomUUID()}`, workspaceId: second.workspaceId, appId: second.app.id, moduleId: second.app.modules![0]!.id, tableId: first.tableId, rowId: first.rowId, customerId: profile!.id })).rejects.toThrow()
    await expect(database.db.insert(database.conversationMessages).values({ id: `msg_${randomUUID()}`, workspaceId: second.workspaceId, conversationId: page.conversationId!, authorId: profile!.id, authorKind: 'client', authorName: '', body: '', requestId: randomUUID() })).rejects.toThrow()
  })
  it('discards an unsent staged attachment from the composer without leaving an orphan', async () => {
    const first = await business(); await signIn(clientEmail); const attachment = await file(first)
    expect((await download(attachment.key)).status).toBe(200)
    const { DELETE } = await import('@/app/api/conversations/files/route')
    const removed = await DELETE(new Request('http://localhost/api/conversations/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: first.app.slug, tableId: first.tableId, rowId: first.rowId, fileId: attachment.id }),
    }))
    expect(removed.status).toBe(200)
    expect(await database.db.select().from(database.attachments).where(eq(database.attachments.id, attachment.id))).toEqual([])
    expect(storage.deleteFile).toHaveBeenCalledWith(attachment.key)
    expect((await download(attachment.key)).status).toBe(404)
    await expectDenied(() => send(first, 'После удаления', randomUUID(), [attachment.id]))
  })
  it('protects pending and attached files, denies reuse and hides deleted-message files', async () => {
    const first = await business(), other = await business(); await signIn(clientEmail); const attachment = await file(first)
    expect((await download(attachment.key)).status).toBe(200)
    await signIn(staffEmail); expect((await download(attachment.key)).status).toBe(404)
    owner(first); expect((await download(attachment.key)).status).toBe(404)
    await signIn(clientEmail); await expectDenied(() => send(other, 'Чужая привязка', randomUUID(), [attachment.id]))
    const message = await send(first, 'Документ', randomUUID(), [attachment.id])
    expect((await read(first)).messages[0]!.files[0]!.name).toBe('document.txt')
    await expectDenied(() => send(first, 'Повторное использование', randomUUID(), [attachment.id]))
    await signIn(staffEmail); expect((await download(attachment.key)).status).toBe(200)
    await signIn('other@example.invalid'); expect((await download(attachment.key)).status).toBe(404)
    owner(first); expect((await download(attachment.key)).status).toBe(200)
    identity.member = { ...identity.member!, role: 'editor', email: 'ungranted-editor@example.invalid' }; expect((await download(attachment.key)).status).toBe(404)
    await signIn(clientEmail); await service.changeConversationMessage(first.app.slug, first.tableId, first.rowId, message.id, 0, null)
    expect((await download(attachment.key)).status).toBe(404)
    const [stored] = await database.db.select().from(database.attachments).where(eq(database.attachments.id, attachment.id))
    expect(stored!.referenced).toBe(true) // Kept for retention; ordinary abandoned-upload cleanup cannot erase history.
  })
  it('allows configuration changes only in the owned draft until publication', async () => {
    const first = await business(); owner(first)
    const { setCommunicationsAction } = await import('@/app/module-actions')
    expect(await setCommunicationsAction(first.app.id, false)).toMatchObject({ ok: true })
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, first.app.id))
    expect((record!.draft as typeof first.app).communications.enabled).toBe(false)
    expect((record!.published as typeof first.app).communications.enabled).toBe(true)
    const other = await business(); owner(other)
    expect(await setCommunicationsAction(first.app.id, true)).toMatchObject({ ok: false })
  })
  it('keeps the conversation and assignment permissions when a second module is attached', async () => {
    const first = await business(); await signIn(clientEmail); const message = await send(first, 'История до подключения продаж')
    owner(first)
    const actions = await import('@/app/module-actions'), publication = await import('@/app/app-actions')
    const preview = await actions.previewModuleConnectionAction(first.app.id, 'zakazy')
    if (!preview.ok) throw new Error(preview.error)
    expect(await actions.connectModuleAction(first.app.id, 'zakazy', preview.expectedHash)).toMatchObject({ ok: true })
    const published = await publication.publishAppAction(first.app.id)
    if (!published.ok) throw new Error(published.error)
    await signIn(clientEmail); expect((await read(first)).messages[0]!.id).toBe(message.id)
    await send(first, 'Вопрос после подключения')
    await signIn(staffEmail); expect((await read(first)).messages).toHaveLength(2)
    await send(first, 'Ответ назначенного сотрудника')
  })
  it('preserves business history and file access when the original app is deleted', async () => {
    const first = await business(); await signIn(clientEmail); const document = await file(first)
    const message = await send(first, 'История исходного приложения', randomUUID(), [document.id])
    await signIn(staffEmail); const reply = await send(first, 'Ответ до переноса')
    const appId = newId('app'), app = { ...first.app, id: appId, slug: `replacement-${first.workspaceId}`, screens: first.app.screens.map(screen => ({ ...screen, appId })) }
    await database.db.insert(database.apps).values({ id: appId, workspaceId: first.workspaceId, slug: app.slug, name: app.name, draft: app, published: app, publishedAt: new Date() })
    await database.db.delete(database.apps).where(eq(database.apps.id, first.app.id))
    const [thread] = await database.db.select().from(database.conversations).where(eq(database.conversations.rowId, first.rowId))
    expect(thread).toMatchObject({ workspaceId: first.workspaceId, appId: null })
    await signIn(clientEmail)
    expect((await service.readConversation(app.slug, first.tableId, first.rowId)).messages[0]!.id).toBe(message.id)
    expect((await download(document.key)).status).toBe(200)
    await signIn(staffEmail)
    expect((await service.readConversation(app.slug, first.tableId, first.rowId)).messages.find(message => message.id === reply.id)!.mine).toBe(true)
    await service.changeConversationMessage(app.slug, first.tableId, first.rowId, reply.id, 0, 'Уточнённый ответ после переноса')
    expect((await service.conversationMessageHistory(app.slug, first.tableId, first.rowId, reply.id))[0]!.body).toBe('Ответ до переноса')
  })
  it('queues physical files for tracked cleanup when a parent record is permanently removed', async () => {
    const first = await business(); await signIn(clientEmail); const document = await file(first)
    await send(first, 'Документ', randomUUID(), [document.id])
    await database.db.delete(database.rows).where(eq(database.rows.id, first.rowId))
    const [queued] = await database.db.select().from(database.attachments).where(eq(database.attachments.id, document.id))
    expect(queued).toMatchObject({ state: 'deleting', referenced: false, conversationId: null, messageId: null })
    expect((await download(document.key)).status).toBe(404)
    const { cleanupFiles } = await import('./file-cleanup')
    expect(await cleanupFiles({ workspaceId: first.workspaceId, run: true })).toMatchObject({ deleted: 1, failed: 0 })
    expect(await database.db.select().from(database.attachments).where(eq(database.attachments.id, document.id))).toEqual([])
    expect(storage.deleteFile).toHaveBeenCalledWith(document.key)
  })
  it('recovers a late upload after its parent and recovery record have already been removed', async () => {
    const first = await business(); await signIn(clientEmail)
    let finish: (() => void) | undefined
    storage.putFile.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ ok: true }) }))
    const { POST } = await import('@/app/api/conversations/files/route'), form = new FormData()
    for (const [key, value] of Object.entries({ slug: first.app.slug, tableId: first.tableId, rowId: first.rowId })) form.set(key, value)
    form.set('file', new File(['Late controlled upload'], 'late.txt', { type: 'text/plain' }))
    const upload = POST(new Request('http://localhost/api/conversations/files', { method: 'POST', body: form }))
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await database.db.delete(database.rows).where(eq(database.rows.id, first.rowId))
    const { cleanupFiles } = await import('./file-cleanup')
    expect(await cleanupFiles({ workspaceId: first.workspaceId, run: true })).toMatchObject({ deleted: 1 })
    finish!()
    expect((await upload).status).toBe(503)
    expect(await database.db.select().from(database.attachments).where(eq(database.attachments.workspaceId, first.workspaceId))).toEqual([])
  })
  it('serializes concurrent uploads at the actor limit', async () => {
    const first = await business(); await signIn(clientEmail)
    const context = await service.prepareConversationUpload(first.app.slug, first.tableId, first.rowId)
    await database.db.insert(database.attachments).values(Array.from({ length: 19 }, () => ({ id: newId('attachment'), workspaceId: first.workspaceId, key: `${first.workspaceId}/${randomUUID()}.txt`, name: 'pending.txt', mime: 'text/plain', size: 1, uploadedBy: context.uploadedBy, conversationId: context.conversationId })))
    const { storeAttachment } = await import('./file-upload')
    const upload = () => storeAttachment(context.workspaceId, context.uploadedBy, context.origin, { name: 'note.txt', type: 'text/plain', bytes: Buffer.from('x') }, context.conversationId)
    const results = await Promise.allSettled([upload(), upload()])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(await database.db.select().from(database.attachments).where(eq(database.attachments.workspaceId, first.workspaceId))).toHaveLength(20)
    const [parent] = await database.db.select().from(database.rows).where(eq(database.rows.id, first.rowId))
    const nextRow = newId('row')
    await database.db.insert(database.rows).values({ id: nextRow, tableId: first.tableId, position: 'zzzz', data: parent!.data })
    await database.db.delete(database.rows).where(eq(database.rows.id, first.rowId))
    const next = await service.prepareConversationUpload(first.app.slug, first.tableId, nextRow)
    await expect(storeAttachment(next.workspaceId, next.uploadedBy, next.origin, { name: 'new.txt', type: 'text/plain', bytes: Buffer.from('y') }, next.conversationId)).rejects.toThrow('через минуту')
  })
})
