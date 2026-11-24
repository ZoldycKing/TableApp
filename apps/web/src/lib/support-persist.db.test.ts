import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import type { AppV2Json } from '@tableapp/schema/app-v2'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { buildSupportV2App } from './templates/support-v2'
import { builderV2Revision } from './builder-v2-revision'

const identity = vi.hoisted(() => ({ email: 'owner@example.invalid' }))
vi.mock('@/lib/app-session', () => ({ currentStaffEmail: async () => identity.email }))
vi.mock('@/lib/session', () => ({ currentAccount: async () => null }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('published support authorization', () => {
  const userId = newId('user'), workspaceId = newId('workspace')
  const built = buildTemplate({ template: findTemplate('podderzhka')!, workspaceId })
  const app = buildSupportV2App(built, { id: newId('app'), workspaceId, name: 'Обращения', slug: `podderzhka-${workspaceId.replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase()}`, email: 'owner@example.invalid' })
  app.authentication.members.push(
    { email: 'anna@example.invalid', roleIds: ['staff'], company: '' },
    { email: 'irina@example.invalid', roleIds: ['client'], company: '' },
  )
  const support = app.support!
  const revision = () => builderV2Revision(app)
  const irinaTicket = built.rows.find(row => row.tableId === support.ticketsTableId && row.data[support.ticket.number] === 'ОБР-1028')!
  const petrTicket = built.rows.find(row => row.tableId === support.ticketsTableId && row.data[support.ticket.number] === 'ОБР-1042')!
  const fresh = built.rows.find(row => row.tableId === support.ticketsTableId && row.data[support.ticket.number] === 'ОБР-1048')!
  let db: typeof import('@tableapp/db')
  let action: typeof import('@/app/support-actions')
  let read: typeof import('@/app/builder-v2-published-actions')
  beforeAll(async () => {
    db = await import('@tableapp/db')
    action = await import('@/app/support-actions')
    read = await import('@/app/builder-v2-published-actions')
    await db.db.insert(db.users).values({ id: userId, email: `${userId}@example.invalid` })
    await db.db.insert(db.workspaces).values({ id: workspaceId, name: 'Support persist', slug: workspaceId, ownerId: userId, plan: 'business' })
    await db.db.insert(db.tables).values(built.tables)
    await db.db.insert(db.fields).values(built.fields)
    await db.db.insert(db.views).values(built.views)
    await db.db.insert(db.rows).values(built.rows.map(row => ({ ...row, createdBy: userId, updatedBy: userId })))
    await db.db.insert(db.apps).values({ id: app.id, workspaceId, name: app.name, slug: app.slug, draft: app, published: app, theme: app.theme, accessMode: 'allowlist', homeScreenId: app.homeScreenId })
  })
  afterAll(async () => { if (db) { await db.db.delete(db.workspaces).where(eq(db.workspaces.id, workspaceId)); await db.db.delete(db.users).where(eq(db.users.id, userId)) } })

  it('keeps notes and foreign tickets off the client read path and rejects a forged role', async () => {
    identity.email = 'irina@example.invalid'
    const own = await read.readPublishedV2RecordAction(app.slug, { revision: revision(), screenId: support.clientTicketScreenId, recordId: irinaTicket.id })
    expect(own.ok, JSON.stringify(own)).toBe(true)
    const foreign = await read.readPublishedV2RecordAction(app.slug, { revision: revision(), screenId: support.clientTicketScreenId, recordId: petrTicket.id })
    expect(foreign.ok).toBe(false)
    const queue = await read.readPublishedV2DataAction(app.slug, { revision: revision(), screenId: support.queueScreenId, nodeId: app.nodes.find(node => node.type === 'collection' && app.sources.some(source => source.id === node.sourceId && source.tableId === support.ticketsTableId && app.screens.find(screen => screen.id === support.queueScreenId)?.rootIds.includes(node.id)))!.id })
    expect(queue.ok).toBe(false)
    const clientList = app.nodes.find(node => node.type === 'collection' && app.screens.find(screen => screen.id === support.clientListScreenId)?.rootIds.includes(node.id) && app.sources.some(source => source.id === node.sourceId && source.tableId === support.ticketsTableId))!
    const list = await read.readPublishedV2DataAction(app.slug, { revision: revision(), screenId: support.clientListScreenId, nodeId: clientList.id })
    expect(list.ok, JSON.stringify(list)).toBe(true)
    if (!list.ok) return
    expect(list.page.rows.every(row => row.values[support.ticket.clientEmail] === 'irina@example.invalid')).toBe(true)
    expect(JSON.stringify(list.page)).not.toContain('Клиенту не показывать')
    const replies = app.nodes.find(node => node.type === 'collection' && app.screens.find(screen => screen.id === support.clientTicketScreenId)?.rootIds.includes(node.id) && app.sources.some(source => source.id === node.sourceId && source.tableId === support.repliesTableId))!
    const thread = await read.readPublishedV2DataAction(app.slug, { revision: revision(), screenId: support.clientTicketScreenId, nodeId: replies.id, recordId: irinaTicket.id })
    expect(thread.ok, JSON.stringify(thread)).toBe(true)
    expect(JSON.stringify(thread)).not.toContain('в ответ клиенту это не писать')
    expect(JSON.stringify(thread)).not.toContain('Роль коллеги снята вручную')
    const forged = await action.savePublishedSupportAction(app.slug, { kind: 'note', revision: revision(), screenId: support.clientTicketScreenId, recordId: irinaTicket.id, text: 'Подмена роли', roleIds: ['owner', 'staff'] })
    expect(forged.ok).toBe(false)
    const notesAfter = await db.db.select().from(db.rows).where(eq(db.rows.tableId, support.notesTableId))
    expect(notesAfter.some(row => String((row.data as Record<string, AppV2Json>)[support.note.text]).includes('Подмена роли'))).toBe(false)
  })

  it('stores a client ticket, blocks an illegal status jump and lets the operator answer', async () => {
    identity.email = 'irina@example.invalid'
    const category = built.rows.find(row => row.tableId === support.categoriesTableId && row.data[support.category.name] === 'Вопрос по работе')!
    const created = await action.savePublishedSupportAction(app.slug, { kind: 'create', revision: revision(), screenId: support.clientListScreenId, subject: 'Учебный вопрос про срок', description: 'Это учебная проверка сохранения.', categoryId: category.id, clientEmail: 'petr@example.invalid', statusId: support.statuses.closed, roleIds: ['staff'] })
    expect(created, JSON.stringify(created)).toEqual({ ok: true, message: 'Обращение создано.' })
    const stored = await db.db.select().from(db.rows).where(eq(db.rows.tableId, support.ticketsTableId))
    const row = stored.find(item => (item.data as Record<string, AppV2Json>)[support.ticket.subject] === 'Учебный вопрос про срок')
    expect(row).toBeTruthy()
    const data = row!.data as Record<string, AppV2Json>
    expect(data[support.ticket.clientEmail]).toBe('irina@example.invalid')
    expect(data[support.ticket.status]).toBe(support.statuses.fresh)
    expect(String(data[support.ticket.number])).toMatch(/^ОБР-\d+$/)
    const jumped = await action.savePublishedSupportAction(app.slug, { kind: 'status', revision: revision(), screenId: support.clientTicketScreenId, recordId: row!.id, statusId: support.statuses.resolved })
    expect(jumped.ok).toBe(false)
    identity.email = 'anna@example.invalid'
    const illegal = await action.savePublishedSupportAction(app.slug, { kind: 'status', revision: revision(), screenId: support.ticketScreenId, recordId: fresh.id, statusId: support.statuses.resolved })
    expect(illegal.ok).toBe(false)
    const accepted = await action.savePublishedSupportAction(app.slug, { kind: 'status', revision: revision(), screenId: support.ticketScreenId, recordId: fresh.id, statusId: support.statuses.progress })
    expect(accepted, JSON.stringify(accepted)).toEqual({ ok: true, message: 'Статус сохранён.' })
    const answered = await action.savePublishedSupportAction(app.slug, { kind: 'reply', revision: revision(), screenId: support.ticketScreenId, recordId: fresh.id, text: 'Учебный ответ оператора внутри приложения.' })
    expect(answered.ok, JSON.stringify(answered)).toBe(true)
    const noted = await action.savePublishedSupportAction(app.slug, { kind: 'note', revision: revision(), screenId: support.ticketScreenId, recordId: fresh.id, text: 'Служебная пометка. Клиенту не показывать.' })
    expect(noted.ok, JSON.stringify(noted)).toBe(true)
    const [saved] = await db.db.select().from(db.rows).where(eq(db.rows.id, fresh.id))
    expect((saved!.data as Record<string, AppV2Json>)[support.ticket.status]).toBe(support.statuses.progress)
    const noteNode = app.nodes.find(node => node.type === 'collection' && app.screens.find(screen => screen.id === support.ticketScreenId)?.rootIds.includes(node.id) && app.sources.some(source => source.id === node.sourceId && source.tableId === support.notesTableId))!
    const operatorNotes = await read.readPublishedV2DataAction(app.slug, { revision: revision(), screenId: support.ticketScreenId, nodeId: noteNode.id, recordId: fresh.id })
    expect(JSON.stringify(operatorNotes)).toContain('Служебная пометка. Клиенту не показывать.')
    identity.email = 'irina@example.invalid'
    const hidden = await read.readPublishedV2DataAction(app.slug, { revision: revision(), screenId: support.clientTicketScreenId, nodeId: app.nodes.find(node => node.type === 'collection' && app.screens.find(screen => screen.id === support.clientTicketScreenId)?.rootIds.includes(node.id) && app.sources.some(source => source.id === node.sourceId && source.tableId === support.repliesTableId))!.id, recordId: fresh.id })
    expect(JSON.stringify(hidden)).toContain('Учебный ответ оператора')
    expect(JSON.stringify(hidden)).not.toContain('Служебная пометка')
  })
})
