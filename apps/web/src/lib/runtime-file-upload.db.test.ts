import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultViewConfig, newId, viewSchema, type App, type Field } from '@tableapp/schema'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null,
  viewerId: '', email: '', role: 'staff', authenticated: true }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('@/lib/app-session', async original => ({ ...await original<typeof import('./app-session')>(), currentAppAccess: async () => ({
  visitor: { authenticated: identity.authenticated, roleId: identity.authenticated ? identity.role : null,
    email: identity.authenticated ? identity.email : null, company: '', enrolled: false },
  viewer: identity.authenticated ? { id: identity.viewerId, email: identity.email, name: null, company: '', enrolled: false } : null,
}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const storage = vi.hoisted(() => ({ putFile: vi.fn(), deleteFile: vi.fn(), getFile: vi.fn(),
  fileKey: (workspaceId: string) => `${workspaceId}/test-${Math.random().toString(36).slice(2)}.png` }))
vi.mock('@/lib/storage', () => storage)

describe.skipIf(!process.env.DATABASE_URL)('runtime file uploads with independent owner and app sessions against Postgres', () => {
  let database: typeof import('@tableapp/db')
  let upload: typeof import('@/app/api/files/route')
  let download: typeof import('@/app/api/files/[...key]/route')
  let runtimeActions: typeof import('@/app/runtime-actions')
  let app: App
  const ids = { user: newId('user'), workspace: newId('workspace'), table: newId('table'), view: newId('view'),
    app: newId('app'), viewer: newId('appUser'), otherViewer: newId('appUser'), row: newId('row'), otherRow: newId('row'),
    title: newId('field'), assignee: newId('field'), photo: newId('field') }
  const slug = `runtime-files-${ids.app.slice(4)}`
  const email = `${ids.viewer}@example.invalid`, otherEmail = `${ids.otherViewer}@example.invalid`
  const member = { userId: ids.user, email: `${ids.user}@example.invalid`, name: 'Owner', workspaceId: ids.workspace,
    workspaceName: 'Synthetic upload acceptance', role: 'owner' as const }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=', 'base64')
  const columns: Field[] = [
    { id: ids.title, name: 'Request', type: 'text', options: {} },
    { id: ids.assignee, name: 'Assigned email', type: 'email', options: {} },
    { id: ids.photo, name: 'Visit photo', type: 'attachment', options: { maxCount: 5 } },
  ].map((field, index) => ({ ...field, tableId: ids.table, description: null, position: `a${index}` })) as Field[]

  beforeAll(async () => {
    database = await import('@tableapp/db')
    upload = await import('@/app/api/files/route')
    download = await import('@/app/api/files/[...key]/route')
    runtimeActions = await import('@/app/runtime-actions')
    const { db, users, workspaces, workspaceMembers, tables, fields, views, apps, appUsers } = database
    await db.insert(users).values({ id: ids.user, email: member.email })
    await db.insert(workspaces).values({ id: ids.workspace, ownerId: ids.user, name: member.workspaceName, slug })
    await db.insert(workspaceMembers).values({ workspaceId: ids.workspace, userId: ids.user, role: 'owner' })
    await db.insert(tables).values({ id: ids.table, workspaceId: ids.workspace, name: 'Requests', position: 'a', primaryFieldId: ids.title })
    await db.insert(fields).values(columns)
    const view = { id: ids.view, tableId: ids.table, name: 'Requests', type: 'grid' as const,
      position: 'a', config: defaultViewConfig('grid', newId('filter')) }
    await db.insert(views).values(view)
    const { generateApp } = await import('./app-builder')
    app = generateApp({ appId: ids.app, workspaceId: ids.workspace, name: 'Assigned requests', slug,
      table: { id: ids.table, name: 'Requests', primaryFieldId: ids.title }, fields: columns, view: viewSchema.parse(view) })
    app.rowAccessRules = [{ tableId: ids.table, fieldId: ids.assignee, match: 'email', appliesTo: ['staff'] }]
    await db.insert(apps).values({ id: app.id, workspaceId: ids.workspace, name: app.name, slug, draft: app, published: app })
    await db.insert(appUsers).values([{ id: ids.viewer, appId: ids.app, email }, { id: ids.otherViewer, appId: ids.app, email: otherEmail }])
  })
  beforeEach(async () => {
    const { db, apps, attachments, rows, workspaceUsage } = database
    identity.member = member; identity.viewerId = ids.viewer; identity.email = email; identity.role = 'staff'; identity.authenticated = true
    storage.putFile.mockReset(); storage.deleteFile.mockReset(); storage.getFile.mockReset()
    storage.deleteFile.mockResolvedValue(undefined)
    storage.putFile.mockImplementation(async (_workspace: string, file: { name: string; type: string; bytes: Uint8Array }, key: string) => ({
      ok: true, stored: { key, name: file.name, mime: file.type, size: file.bytes.length },
    }))
    storage.getFile.mockImplementation(async () => ({ mime: 'image/png', body: new ReadableStream({ start(controller) { controller.enqueue(png); controller.close() } }) }))
    await db.delete(attachments).where(eq(attachments.workspaceId, ids.workspace))
    await db.delete(rows).where(eq(rows.tableId, ids.table))
    await db.delete(workspaceUsage).where(eq(workspaceUsage.workspaceId, ids.workspace))
    await db.update(apps).set({ published: app }).where(eq(apps.id, ids.app))
    await db.insert(rows).values([
      { id: ids.row, tableId: ids.table, position: 'a', data: { [ids.title]: 'Assigned visit', [ids.assignee]: email } },
      { id: ids.otherRow, tableId: ids.table, position: 'b', data: { [ids.title]: 'Another visit', [ids.assignee]: otherEmail } },
    ])
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, ids.workspace))
    await database.db.delete(database.users).where(eq(database.users.id, ids.user))
    await database.sql.end()
  })
  async function sendFile(appId: string | null = ids.app) {
    const form = new FormData()
    form.set('file', new File([png], 'visit.png', { type: 'image/png' }))
    if (appId !== null) form.set('appId', appId)
    return upload.POST(new Request('http://localhost/api/files', { method: 'POST', body: form }))
  }
  const getFile = (key: string) => download.GET(new Request(`http://localhost/api/files/${key}?v=2`),
    { params: Promise.resolve({ key: key.split('/') }) })

  it('uploads as the runtime master despite an owner session, then attaches and downloads only through the assigned row', async () => {
    const response = await sendFile()
    expect(response.status).toBe(200)
    const { attachment } = await response.json()
    const [pending] = await database.db.select().from(database.attachments).where(eq(database.attachments.key, attachment.key))
    expect(pending).toMatchObject({ workspaceId: ids.workspace, uploadedBy: ids.viewer, state: 'ready', rowId: null, referenced: false })

    // The app save and preview must keep working when the independent owner session ends.
    identity.member = null
    expect((await getFile(attachment.key)).status).toBe(200)
    expect(await runtimeActions.appUpdateRowAction(slug, ids.table, ids.row, { [ids.photo]: [attachment] }, 0)).toEqual({ ok: true })
    const [bound] = await database.db.select().from(database.attachments).where(eq(database.attachments.key, attachment.key))
    expect(bound).toMatchObject({ tableId: ids.table, rowId: ids.row, fieldId: ids.photo, referenced: true })
    expect((await getFile(attachment.key)).status).toBe(200)

    identity.viewerId = ids.otherViewer; identity.email = otherEmail
    expect((await getFile(attachment.key)).status).toBe(403)
    expect((await runtimeActions.appUpdateRowAction(slug, ids.table, ids.otherRow, { [ids.photo]: [attachment] }, 0)).ok).toBe(false)
  })
  it.each(['guest', 'read-only'])('does not fall back to the owner session for a %s app visitor', async kind => {
    if (kind === 'guest') identity.authenticated = false
    else identity.role = 'client'
    const response = await sendFile()
    expect(response.status).toBe(403)
    expect(storage.putFile).not.toHaveBeenCalled()
    expect(await database.db.select().from(database.attachments).where(eq(database.attachments.workspaceId, ids.workspace))).toHaveLength(0)
    expect(await database.db.select().from(database.workspaceUsage).where(eq(database.workspaceUsage.workspaceId, ids.workspace))).toHaveLength(0)
  })
  it('requires a published app even when its owner is signed in', async () => {
    await database.db.update(database.apps).set({ published: null }).where(eq(database.apps.id, ids.app))
    expect((await sendFile()).status).toBe(404)
    expect(storage.putFile).not.toHaveBeenCalled()
  })
  it('keeps uploads without appId in the manual owner context', async () => {
    identity.authenticated = false
    const response = await sendFile(null)
    expect(response.status).toBe(200)
    const { attachment } = await response.json()
    const [record] = await database.db.select().from(database.attachments).where(eq(database.attachments.key, attachment.key))
    expect(record).toMatchObject({ workspaceId: ids.workspace, uploadedBy: ids.user, state: 'ready' })
  })
  it('rejects another app user attaching an unbound master upload', async () => {
    const response = await sendFile()
    expect(response.status).toBe(200)
    const { attachment } = await response.json()
    identity.member = null; identity.viewerId = ids.otherViewer; identity.email = otherEmail
    expect((await getFile(attachment.key)).status).toBe(403)
    const result = await runtimeActions.appUpdateRowAction(slug, ids.table, ids.otherRow, { [ids.photo]: [attachment] }, 0)
    expect(result).toMatchObject({ ok: false, error: 'Файл не найден или недоступен в этом рабочем пространстве' })
    const [record] = await database.db.select().from(database.attachments).where(eq(database.attachments.key, attachment.key))
    expect(record).toMatchObject({ uploadedBy: ids.viewer, rowId: null, referenced: false })
  })
})
