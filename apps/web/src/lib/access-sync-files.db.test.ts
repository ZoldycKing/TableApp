import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, sql as query } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultViewConfig, newId, planOf, viewSchema, type App, type Field } from '@tableapp/schema'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null,
  viewerId: '', email: '', role: 'manager', authenticated: true }))
vi.mock('@/lib/session', async (original) => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('@/lib/app-session', async (original) => ({ ...await original<typeof import('./app-session')>(), currentAppAccess: async () => ({
  visitor: { authenticated: identity.authenticated, roleId: identity.authenticated ? identity.role : null,
    email: identity.authenticated ? identity.email : null, company: '', enrolled: false },
  viewer: identity.authenticated ? { id: identity.viewerId, email: identity.email, company: '', enrolled: false } : null,
}) }))
const storage = vi.hoisted(() => ({ putFile: vi.fn(), deleteFile: vi.fn(), getFile: vi.fn(),
  fileKey: (workspaceId: string) => `${workspaceId}/test-${Math.random().toString(36).slice(2)}.txt` }))
vi.mock('@/lib/storage', () => storage)
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('sync access, cursors and file lifecycle against Postgres', () => {
  let database: typeof import('@tableapp/db')
  let sync: typeof import('@/app/api/sync/route')
  let core: typeof import('./row-mutations')
  let usage: typeof import('./usage')
  let download: typeof import('@/app/api/files/[...key]/route')
  let uploads: typeof import('./file-upload')
  const ids = { user: newId('user'), workspace: newId('workspace'), table: newId('table'), view: newId('view'), app: newId('app'),
    viewer: newId('appUser'), otherViewer: newId('appUser'), name: newId('field'), secret: newId('field'), owner: newId('field'),
    gate: newId('field'), file: newId('field'), file2: newId('field'), row: newId('row'), hidden: newId('row'), other: newId('row') }
  const slug = `sync-files-${Date.now()}-${ids.app.slice(-6).toLowerCase()}`
  const email = `${slug}@example.invalid`
  const member = { userId: ids.user, workspaceId: ids.workspace, workspaceName: 'Test', email, role: 'owner' as const, name: 'Test' }
  const columns: Field[] = [
    { id: ids.name, name: 'Name', type: 'text', options: {} }, { id: ids.secret, name: 'Secret', type: 'text', options: {} },
    { id: ids.owner, name: 'Owner', type: 'email', options: {} }, { id: ids.gate, name: 'Shown', type: 'checkbox', options: {} },
    { id: ids.file, name: 'File', type: 'attachment', options: {} }, { id: ids.file2, name: 'File 2', type: 'attachment', options: {} },
  ].map((field, index) => ({ ...field, tableId: ids.table, description: null, position: `a${index + 1}` })) as Field[]
  let app: App
  beforeAll(async () => {
    database = await import('@tableapp/db')
    sync = await import('@/app/api/sync/route')
    core = await import('./row-mutations')
    usage = await import('./usage')
    download = await import('@/app/api/files/[...key]/route')
    uploads = await import('./file-upload')
    await database.db.insert(database.users).values({ id: ids.user, email })
    await database.db.insert(database.workspaces).values({ id: ids.workspace, ownerId: ids.user, name: 'Sync test', slug })
    await database.db.insert(database.workspaceMembers).values({ workspaceId: ids.workspace, userId: ids.user, role: 'owner' })
  })
  beforeEach(async () => {
    const { db, apps, tables, fields, views, rows, attachments, workspaceUsage, appUsers } = database
    identity.member = null; identity.viewerId = ids.viewer; identity.email = email; identity.role = 'manager'; identity.authenticated = true
    storage.putFile.mockReset(); storage.deleteFile.mockReset(); storage.getFile.mockReset()
    storage.deleteFile.mockResolvedValue(undefined)
    storage.putFile.mockImplementation(async (_workspace: string, file: { name: string; type: string; bytes: Uint8Array }, key: string) => ({
      ok: true, stored: { key, name: file.name, mime: file.type, size: file.bytes.length },
    }))
    storage.getFile.mockImplementation(async () => ({ mime: 'text/plain', body: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('test')); controller.close() } }) }))
    await db.delete(apps).where(eq(apps.workspaceId, ids.workspace))
    await db.delete(attachments).where(eq(attachments.workspaceId, ids.workspace))
    await db.delete(tables).where(eq(tables.workspaceId, ids.workspace))
    await db.delete(workspaceUsage).where(eq(workspaceUsage.workspaceId, ids.workspace))
    await db.insert(tables).values({ id: ids.table, workspaceId: ids.workspace, name: 'Table', position: 'a1', primaryFieldId: ids.name })
    await db.insert(fields).values(columns)
    const view = { id: ids.view, tableId: ids.table, name: 'Shown', type: 'grid' as const, position: 'a1',
      config: { ...defaultViewConfig('grid', newId('filter')), filter: { id: newId('filter'), conjunction: 'and' as const,
        conditions: [{ id: newId('filter'), fieldId: ids.gate, op: 'is' as const, value: true }] } } }
    await db.insert(views).values(view)
    await db.insert(rows).values([
      { id: ids.row, tableId: ids.table, position: 'a1', data: { [ids.name]: 'Visible', [ids.secret]: 'PRIVATE_VALUE', [ids.owner]: email, [ids.gate]: true } },
      { id: ids.hidden, tableId: ids.table, position: 'a2', data: { [ids.name]: 'FILTERED_VALUE', [ids.owner]: email, [ids.gate]: false } },
      { id: ids.other, tableId: ids.table, position: 'a3', data: { [ids.name]: 'OTHER_OWNER_VALUE', [ids.owner]: 'other@example.invalid', [ids.gate]: true } },
    ])
    const { generateApp } = await import('./app-builder')
    app = generateApp({ appId: ids.app, workspaceId: ids.workspace, name: 'Test', slug,
      table: { id: ids.table, name: 'Table', primaryFieldId: ids.name }, fields: columns, view: viewSchema.parse(view) })
    app.rowAccessRules = [{ tableId: ids.table, fieldId: ids.owner, match: 'email', appliesTo: ['manager'] }]
    for (const screen of app.screens) {
      if (screen.type === 'list' || screen.type === 'tiles') {
        screen.titleFieldId = ids.name; screen.subtitleFieldId = null; screen.metaFieldId = null; screen.statusFieldId = null; screen.imageFieldId = null
        screen.source.searchFieldIds = [ids.name]
      }
      if (screen.type !== 'dashboard') for (const component of screen.components) {
        if ('fieldId' in component && (component.fieldId === ids.secret || component.fieldId === ids.gate)) component.roles = ['staff']
      }
    }
    await db.insert(apps).values({ id: app.id, workspaceId: ids.workspace, name: app.name, slug, draft: app, published: app })
    await db.insert(appUsers).values([{ id: ids.viewer, appId: app.id, email }, { id: ids.otherViewer, appId: app.id, email: 'other@example.invalid' }])
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, ids.workspace))
    await database.db.delete(database.users).where(eq(database.users.id, ids.user))
    await database.sql.end()
  })
  async function request(extra: Record<string, unknown> = {}) {
    return sync.POST(new Request('http://localhost/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId: ids.table, deviceId: 'test-device', appSlug: slug, mutations: [], ...extra }) }))
  }
  const row = async (id = ids.row) => (await database.db.select().from(database.rows).where(eq(database.rows.id, id)))[0]!
  const counter = async () => (await database.db.select().from(database.workspaceUsage).where(eq(database.workspaceUsage.workspaceId, ids.workspace)))[0]!
  async function attach(key: string, owner = ids.viewer, state = 'ready') {
    const id = newId('attachment')
    await database.db.insert(database.attachments).values({ id, key, workspaceId: ids.workspace, uploadedBy: owner,
      name: 'Original.txt', mime: 'text/plain', size: 4, state })
    return [{ id, key, name: 'Forged.svg', mime: 'image/svg+xml', size: 9000, width: null, height: null }]
  }
  const getFile = (key: string) => download.GET(new Request(`http://localhost/api/files/${key}`), { params: Promise.resolve({ key: key.split('/') }) })
  const updateFile = (value: unknown, rowId = ids.row, fieldId = ids.file) => core.writeRows(ids.workspace,
    (context) => core.updateRow(context, ids.table, rowId, { [fieldId]: value }, { id: identity.viewerId, kind: 'app_user' }))
  const newFile = () => uploads.storeAttachment(ids.workspace, ids.viewer, 'runtime', { name: 'Upload.txt', type: 'text/plain', bytes: Buffer.from('new file') })

  it('returns only screen-reachable owned rows and readable fields', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const result = await response.json()
    expect(result.reset).toBe(true)
    expect(result.rows.map((item: { id: string }) => item.id)).toEqual([ids.row])
    expect(result.rows[0].data[ids.name]).toBe('Visible')
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_VALUE|FILTERED_VALUE|OTHER_OWNER_VALUE/)
    expect(result.rows[0].data).not.toHaveProperty(ids.gate)
  })
  it('does not write a filtered row through a known ID', async () => {
    const response = await request({ mutations: [{ id: newId('change'), op: 'update', rowId: ids.hidden, fieldId: ids.name, base: 'FILTERED_VALUE', next: 'tampered' }] })
    const result = await response.json()
    expect(result.applied).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0]).not.toHaveProperty('current')
    expect((await row(ids.hidden)).data).toHaveProperty(ids.name, 'FILTERED_VALUE')
  })
  it('resets the snapshot when a role loses field access without row edits', async () => {
    const before = await (await request()).json()
    const changed = structuredClone(app)
    for (const screen of changed.screens) {
      if (screen.type === 'list' || screen.type === 'tiles') { screen.titleFieldId = null; screen.source.searchFieldIds = [] }
      if (screen.type !== 'dashboard') for (const component of screen.components) {
        if ('fieldId' in component && component.fieldId === ids.name) component.roles = ['staff']
        if ('source' in component && component.source.kind === 'field' && component.source.fieldId === ids.name) component.roles = ['staff']
      }
    }
    await database.db.update(database.apps).set({ published: changed }).where(eq(database.apps.id, ids.app))
    const after = await (await request({ since: before.cursor })).json()
    expect(after.reset).toBe(true)
    expect(after.rows[0].data).not.toHaveProperty(ids.name)
    expect((await row()).version).toBe(0)
  })
  it('revokes access when screen filters change without changing rows', async () => {
    const before = await (await request()).json()
    await database.db.update(database.views).set({ config: { ...defaultViewConfig('grid', newId('filter')),
      filter: { id: newId('filter'), conjunction: 'and', conditions: [{ id: newId('filter'), fieldId: ids.gate, op: 'is', value: false }] } } })
      .where(eq(database.views.id, ids.view))
    const after = await (await request({ since: before.cursor })).json()
    expect(after.reset).toBe(true)
    expect(after.rows.map((item: { id: string }) => item.id)).toEqual([ids.hidden])
  })
  it('returns a content-free tombstone when an owned row leaves the visible filter', async () => {
    const before = await (await request()).json()
    await core.writeRows(ids.workspace, (context) => core.updateRow(context, ids.table, ids.row, { [ids.gate]: false }, { id: ids.user, kind: 'member' }))
    const after = await (await request({ since: before.cursor })).json()
    expect(after.reset).toBe(false)
    expect(after.rows).toEqual([{ id: ids.row, data: {}, position: '', version: 0, deleted: true }])
  })
  it('allows read-only members to sync but rejects their writes', async () => {
    identity.member = { ...member, role: 'viewer' }
    const response = await request({ appSlug: undefined, mutations: [{ id: newId('change'), op: 'update', rowId: ids.row, fieldId: ids.name, base: 'Visible', next: 'denied' }] })
    const result = await response.json()
    expect(response.status).toBe(200)
    expect(result.rows).toHaveLength(3)
    expect(result.rejected).toHaveLength(1)
    expect((await row()).version).toBe(0)
  })
  it('paginates more than 500 rows by revision regardless of identical timestamps', async () => {
    identity.member = member
    await database.db.insert(database.rows).values(Array.from({ length: 1001 }, (_, index) => ({ id: newId('row'), tableId: ids.table,
      position: `b${index}x`, data: { [ids.name]: `Many ${index}` }, updatedAt: new Date('2020-01-01') })))
    const found: string[] = []
    let cursor: string | undefined
    for (let page = 0; page < 3; page += 1) {
      const result = await (await request({ appSlug: undefined, since: cursor })).json()
      found.push(...result.rows.map((item: { id: string }) => item.id))
      cursor = result.cursor
      expect(result.hasMore).toBe(page < 2)
    }
    expect(new Set(found).size).toBe(1004)
    expect(found).toHaveLength(1004)
    const empty = await (await request({ appSlug: undefined, since: cursor })).json()
    expect(empty.rows).toHaveLength(0)
  })
  it('delivers a row edited after the first page in the following cycle', async () => {
    identity.member = member
    await database.db.insert(database.rows).values(Array.from({ length: 501 }, (_, index) => ({ id: newId('row'), tableId: ids.table, position: `b${index}x`, data: {} })))
    const first = await (await request({ appSlug: undefined })).json()
    await core.writeRows(ids.workspace, (context) => core.updateRow(context, ids.table, ids.row, { [ids.name]: 'Changed during paging' }, { id: ids.user, kind: 'member' }))
    const last = await (await request({ appSlug: undefined, since: first.cursor })).json()
    expect(last.hasMore).toBe(false)
    const next = await (await request({ appSlug: undefined, since: last.cursor })).json()
    expect(next.rows.find((item: { id: string }) => item.id === ids.row).data[ids.name]).toBe('Changed during paging')
  })
  it('waits for in-flight writes before choosing a cursor boundary', async () => {
    identity.member = member
    let release!: () => void, signal!: () => void
    const finish = new Promise<void>((resolve) => { release = resolve })
    const ready = new Promise<void>((resolve) => { signal = resolve })
    const writer = core.writeRows(ids.workspace, async (context) => {
      await core.updateRow(context, ids.table, ids.row, { [ids.name]: 'Committed late' }, { id: ids.user, kind: 'member' })
      signal(); await finish
    })
    await Promise.race([ready, writer])
    const response = request({ appSlug: undefined })
    try {
      const deadline = Date.now() + 3000
      while (Date.now() < deadline) {
        const locks = await database.db.execute(query`select count(*)::int as waiting from pg_stat_activity where datname=current_database()
          and wait_event_type='Lock' and query like '%workspace_usage%'`)
        if (Number(locks[0]?.waiting) > 0) break
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    } finally { release() }
    await writer
    const result = await (await response).json()
    expect(result.rows.find((item: { id: string }) => item.id === ids.row).data[ids.name]).toBe('Committed late')
    const next = await (await request({ appSlug: undefined, since: result.cursor })).json()
    expect(next.rows).toHaveLength(0)
  })
  it('reads alongside another reader holding the workspace boundary', async () => {
    identity.member = member
    await usage.recountWorkspace(ids.workspace)
    let release!: () => void, signal!: () => void
    const finish = new Promise<void>((resolve) => { release = resolve })
    const ready = new Promise<void>((resolve) => { signal = resolve })
    const reader = database.db.transaction(async (tx) => {
      await tx.select({ id: database.workspaceUsage.workspaceId }).from(database.workspaceUsage)
        .where(eq(database.workspaceUsage.workspaceId, ids.workspace)).for('share')
      signal(); await finish
    })
    await Promise.race([ready, reader])
    const response = request({ appSlug: undefined })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        response,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Sync read waited for another reader')), 3000) }),
      ])
      expect(result.status).toBe(200)
      expect((await result.json()).rows).toHaveLength(3)
    } finally {
      clearTimeout(timer); release(); await reader; await response
    }
  })
  it('returns committed edits in an initial snapshot without exposing restricted fields', async () => {
    const mutationId = newId('change')
    const result = await (await request({ mutations: [{ id: mutationId, op: 'update', rowId: ids.row,
      fieldId: ids.name, base: 'Visible', next: 'Just committed' }] })).json()
    expect(result.applied).toEqual([mutationId])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].data[ids.name]).toBe('Just committed')
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_VALUE|FILTERED_VALUE|OTHER_OWNER_VALUE/)
    expect((await row()).version).toBe(1)
  })
  it('rejects a future revision before writing even if the policy has changed', async () => {
    const { decodeCursor, encodeCursor } = await import('./sync-protocol')
    const first = await (await request()).json()
    const cursor = decodeCursor(first.cursor)!
    const since = encodeCursor({ ...cursor, policy: 'outdated-policy', seen: cursor.seen + 1, after: cursor.after + 1 })
    const mutationId = newId('change')
    const response = await request({ since, mutations: [{ id: mutationId, op: 'update', rowId: ids.row,
      fieldId: ids.name, base: 'Visible', next: 'must not write' }] })
    expect(response.status).toBe(400)
    expect((await row()).version).toBe(0)
    expect(await database.db.select().from(database.mutations).where(eq(database.mutations.id, mutationId))).toHaveLength(0)
  })
  it('rejects malformed cursors before applying mutations', async () => {
    const response = await request({ since: 'v2.invalid', mutations: [{ id: newId('change'), op: 'update', rowId: ids.row, fieldId: ids.name, base: 'Visible', next: 'tampered' }] })
    expect(response.status).toBe(400)
    expect((await row()).version).toBe(0)
  })
  it('reloads field types between write transactions', async () => {
    identity.member = member
    const firstId = newId('change')
    const first = await (await request({ appSlug: undefined, mutations: [{ id: firstId, op: 'update', rowId: ids.row,
      fieldId: ids.name, base: 'Visible', next: 'Before type change' }] })).json()
    expect(first.applied).toEqual([firstId])
    await database.db.update(database.fields).set({ type: 'number' }).where(eq(database.fields.id, ids.name))
    const result = await (await request({ appSlug: undefined, mutations: [{ id: newId('change'), op: 'update', rowId: ids.row,
      fieldId: ids.name, base: 'Before type change', next: 'Not a number' }] })).json()
    expect(result.applied).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
    expect((await row()).version).toBe(1)
    expect((await row()).data).toHaveProperty(ids.name, 'Before type change')
  })
  it('rejects a cursor from another device before writing', async () => {
    const first = await (await request()).json()
    expect((await request({ since: first.cursor, deviceId: 'other-device' })).status).toBe(400)
  })
  it('restarts legacy date cursors with a full permitted snapshot', async () => {
    const result = await (await request({ since: '2099-01-01T00:00:00.000Z' })).json()
    expect(result.reset).toBe(true)
    expect(result.rows).toHaveLength(1)
  })
  it('rejects malformed payloads and oversized bodies without writes', async () => {
    for (const payload of [null, [], { tableId: 1, deviceId: 'x' }, { tableId: ids.table, deviceId: 'x', mutations: [null] },
      { tableId: ids.table, deviceId: 'x', mutations: [{ id: 'x', op: 'drop', rowId: ids.row }] }]) {
      const response = await sync.POST(new Request('http://localhost/api/sync', { method: 'POST', body: JSON.stringify(payload) }))
      expect(response.status).toBe(400)
    }
    expect((await request({ mutations: Array.from({ length: 201 }, () => ({})) })).status).toBe(413)
    const huge = new Request('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ tableId: ids.table, deviceId: 'x', padding: 'a'.repeat(1024 * 1024) }) })
    expect((await sync.POST(huge)).status).toBe(413)
    expect((await row()).version).toBe(0)
  })
  it('does not expose existing records through a create-only form', async () => {
    const changed = structuredClone(app)
    changed.screens = changed.screens.filter((screen) => screen.type === 'form' && screen.mode === 'create')
    changed.homeScreenId = changed.screens[0]!.id
    for (const screen of changed.screens) if (screen.type === 'form') screen.successScreenId = null
    await database.db.update(database.apps).set({ published: changed }).where(eq(database.apps.id, ids.app))
    const result = await (await request()).json()
    expect(result.rows).toHaveLength(0)
    const { loadRuntimeForApp } = await import('./app-runtime')
    const runtime = await loadRuntimeForApp(changed, { authenticated: true, roleId: 'manager', email, company: '', enrolled: false })
    expect(JSON.stringify(runtime)).not.toMatch(/PRIVATE_VALUE|FILTERED_VALUE|OTHER_OWNER_VALUE/)
    expect(runtime!.tables[ids.table]!.rows).toHaveLength(0)
  })
  it('applies the list filter to file downloads for signed-in viewers', async () => {
    const key = `${ids.workspace}/filtered.txt`
    const value = await attach(key)
    await updateFile(value, ids.hidden)
    const response = await getFile(key)
    expect(response.status).toBe(403)
    expect(storage.getFile).not.toHaveBeenCalled()
  })
  it('downloads a file only from its readable visible cell', async () => {
    const key = `${ids.workspace}/visible.txt`
    await updateFile(await attach(key))
    expect((await getFile(key)).status).toBe(200)
    expect(storage.getFile).toHaveBeenCalledOnce()
  })
  it('allows its uploader to preview an unbound ready file only', async () => {
    const key = `${ids.workspace}/preview.txt`
    await attach(key)
    expect((await getFile(key)).status).toBe(200)
    identity.viewerId = ids.otherViewer
    expect((await getFile(key)).status).toBe(403)
  })
  it('rejects attaching another app user’s unbound upload and pending objects', async () => {
    await expect(updateFile(await attach(`${ids.workspace}/other.txt`, ids.otherViewer))).rejects.toMatchObject({ code: 'invalid' })
    await expect(updateFile(await attach(`${ids.workspace}/pending.txt`, ids.viewer, 'uploading'))).rejects.toMatchObject({ code: 'invalid' })
    expect((await row()).version).toBe(0)
  })
  it('rejects reusing a bound key in another row or field without stealing its binding', async () => {
    const key = `${ids.workspace}/bound.txt`
    const value = await attach(key)
    await updateFile(value)
    await expect(updateFile(value, ids.hidden)).rejects.toMatchObject({ code: 'invalid' })
    await expect(updateFile(value, ids.row, ids.file2)).rejects.toMatchObject({ code: 'invalid' })
    expect((await database.db.select().from(database.attachments).where(eq(database.attachments.key, key)))[0]!.rowId).toBe(ids.row)
    await updateFile(value) // Keeping it in its existing cell is allowed.
  })
  it('stores canonical attachment metadata rather than client claims', async () => {
    await updateFile(await attach(`${ids.workspace}/canonical.txt`))
    const files = (await row()).data as Record<string, unknown[]>
    expect(files[ids.file]![0]).toMatchObject({ name: 'Original.txt', mime: 'text/plain', size: 4 })
  })
  it('counts unbound uploads during recount and avoids quota lost during S3 I/O', async () => {
    let release!: () => void, signal!: () => void
    const done = new Promise<void>((resolve) => { release = resolve })
    const ready = new Promise<void>((resolve) => { signal = resolve })
    storage.putFile.mockImplementationOnce(async (_workspace, file, key) => { signal(); await done;
      return { ok: true, stored: { key, name: file.name, mime: file.type, size: file.bytes.length } } })
    const upload = newFile()
    await Promise.race([ready, upload])
    const count = await usage.recountWorkspace(ids.workspace)
    expect(count.fileBytes).toBe(8)
    release(); await upload
    expect((await counter()).fileBytes).toBe(8)
  })
  it('rolls back file quota and metadata after a storage failure', async () => {
    storage.putFile.mockRejectedValueOnce(new Error('Synthetic S3 failure'))
    await expect(newFile()).rejects.toThrow('Не удалось сохранить')
    expect((await counter()).fileBytes).toBe(0)
    expect(await database.db.select().from(database.attachments).where(eq(database.attachments.workspaceId, ids.workspace))).toHaveLength(0)
    expect(storage.deleteFile).toHaveBeenCalledOnce()
  })
  it('compensates a successful S3 put when the ready metadata update fails', async () => {
    const update = vi.spyOn(database.db, 'update').mockImplementationOnce(() => { throw new Error('Synthetic metadata failure') })
    try { await expect(newFile()).rejects.toThrow('Не удалось сохранить') }
    finally { update.mockRestore() }
    expect(storage.putFile).toHaveBeenCalledOnce()
    expect(storage.deleteFile).toHaveBeenCalledOnce()
    expect((await counter()).fileBytes).toBe(0)
    expect(await database.db.select().from(database.attachments).where(eq(database.attachments.workspaceId, ids.workspace))).toHaveLength(0)
  })
  it('retains a charged recovery record if S3 cleanup fails, then releases it once', async () => {
    storage.putFile.mockRejectedValueOnce(new Error('Synthetic S3 failure'))
    storage.deleteFile.mockRejectedValueOnce(new Error('Synthetic cleanup failure'))
    await expect(newFile()).rejects.toThrow('Не удалось сохранить')
    const [record] = await database.db.select().from(database.attachments).where(eq(database.attachments.workspaceId, ids.workspace))
    expect(record!.state).toBe('deleting')
    expect((await counter()).fileBytes).toBe(8)
    const { cleanupFiles } = await import('./file-cleanup')
    expect((await cleanupFiles({ workspaceId: ids.workspace })).eligible).toBe(1)
    expect((await cleanupFiles({ run: true, workspaceId: ids.workspace })).deleted).toBe(1)
    expect((await counter()).fileBytes).toBe(0)
    expect((await cleanupFiles({ run: true, workspaceId: ids.workspace })).deleted).toBe(0)
  })
  it('tracks a late PUT after cleanup removes an abandoned uploading record', async () => {
    let release!: () => void, signal!: () => void
    const done = new Promise<void>((resolve) => { release = resolve })
    const ready = new Promise<void>((resolve) => { signal = resolve })
    storage.putFile.mockImplementationOnce(async (_workspace, file, key) => { signal(); await done;
      return { ok: true, stored: { key, name: file.name, mime: file.type, size: file.bytes.length } } })
    const upload = newFile()
    const outcome = upload.catch((error: Error) => error)
    await Promise.race([ready, outcome])
    const { cleanupFiles } = await import('./file-cleanup')
    expect((await cleanupFiles({ run: true, workspaceId: ids.workspace, now: new Date(Date.now() + 2 * 60 * 60 * 1000) })).deleted).toBe(1)
    storage.deleteFile.mockRejectedValueOnce(new Error('Synthetic late cleanup failure'))
    release()
    expect(await outcome).toBeInstanceOf(Error)
    const [record] = await database.db.select().from(database.attachments).where(eq(database.attachments.workspaceId, ids.workspace))
    expect(record!.state).toBe('deleting')
    expect((await counter()).fileBytes).toBe(8)
    expect((await cleanupFiles({ run: true, workspaceId: ids.workspace })).deleted).toBe(1)
    expect((await counter()).fileBytes).toBe(0)
  })
  it('admits only one concurrent file upload at the actual byte limit', async () => {
    const limit = planOf('free').limits.fileBytes
    await database.db.insert(database.attachments).values({ id: newId('attachment'), workspaceId: ids.workspace,
      key: `${ids.workspace}/synthetic-large.bin`, name: 'Synthetic', mime: 'text/plain', size: limit - 8 })
    // Simulate a fresh legacy counter that excluded unbound objects.
    await database.db.insert(database.workspaceUsage).values({ workspaceId: ids.workspace, fileBytes: 0 })
    const results = await Promise.allSettled([newFile(), newFile()])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await counter()).fileBytes).toBe(limit)
    expect(storage.putFile).toHaveBeenCalledOnce()
  })
  it('does not serve uploading/deleting objects even to workspace members', async () => {
    identity.member = member
    await attach(`${ids.workspace}/pending.txt`, ids.viewer, 'uploading')
    await attach(`${ids.workspace}/deleting.txt`, ids.viewer, 'deleting')
    expect((await getFile(`${ids.workspace}/pending.txt`)).status).toBe(404)
    expect((await getFile(`${ids.workspace}/deleting.txt`)).status).toBe(404)
    expect(storage.getFile).not.toHaveBeenCalled()
  })
})
