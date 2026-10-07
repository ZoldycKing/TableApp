import { strict as assert } from 'node:assert'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
process.loadEnvFile(resolve(import.meta.dirname, '../../../.env'))
const { db, sql, users, workspaces, workspaceMembers, sessions, tables, fields, rows, views, attachments, workspaceUsage } = await import('@tableapp/db')
const { defaultViewConfig, newId } = await import('@tableapp/schema')
const { eq } = await import('drizzle-orm')
const { cleanupFiles } = await import('../src/lib/file-cleanup')
const { removeTrackedAttachment } = await import('../src/lib/file-upload')
const id = { user: newId('user'), workspace: newId('workspace'), table: newId('table'), field: newId('field'),
  system: newId('field'), created: newId('field'), editor: newId('field'), date: newId('field') }
const sessionId = randomBytes(32).toString('base64url')
const cookie = `tableapp_session=${sessionId}; tableapp_workspace=${id.workspace}`
const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:3101'
let uploaded: { id: string; key: string } | undefined
try {
  await db.insert(users).values({ id: id.user, email: `stage4-${id.user}@example.invalid` })
  await db.insert(workspaces).values({ id: id.workspace, name: 'Stage4 HTTP smoke', slug: `stage4-${id.workspace}`, ownerId: id.user })
  await db.insert(workspaceMembers).values({ userId: id.user, workspaceId: id.workspace, role: 'owner' })
  await db.insert(sessions).values({ id: sessionId, userId: id.user, expiresAt: new Date(Date.now() + 300000) })
  await db.insert(tables).values({ id: id.table, workspaceId: id.workspace, name: 'HTTP smoke', position: 'a1', primaryFieldId: id.field })
  await db.insert(fields).values([
    { id: id.field, tableId: id.table, name: 'Text', type: 'text', position: 'a1' },
    { id: id.system, tableId: id.table, name: 'Record ID', type: 'row_id', position: 'a2' },
    { id: id.created, tableId: id.table, name: 'Created', type: 'created_time', position: 'a3' },
    { id: id.editor, tableId: id.table, name: 'Editor', type: 'updated_by', position: 'a4' },
    { id: id.date, tableId: id.table, name: 'Date', type: 'date', position: 'a5' },
  ])
  await db.insert(views).values({ id: newId('view'), tableId: id.table, name: 'All', type: 'grid', position: 'a1', config: defaultViewConfig('grid', newId('filter')) })
  await db.insert(rows).values(Array.from({ length: 501 }, (_, index) => ({ id: newId('row'), tableId: id.table, position: `a${index}`,
    data: { [id.field]: `Row ${index}`, [id.system]: 'FORGED_SYSTEM_ID', [id.date]: '2026-03-13T21:00:00Z' } })))
  const sync = (extra: Record<string, unknown> = {}) => fetch(`${base}/api/sync`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ tableId: id.table, deviceId: 'http-smoke', mutations: [], ...extra }) })
  const firstResponse = await sync()
  assert.equal(firstResponse.status, 200)
  assert.match(firstResponse.headers.get('cache-control')!, /no-store/)
  const first = await firstResponse.json()
  assert.equal(first.reset, true); assert.equal(first.rows.length, 500); assert.equal(first.hasMore, true)
  assert.equal(first.rows[0].data[id.system], first.rows[0].id)
  assert.match(first.rows[0].data[id.created], /^\d{4}-\d{2}-\d{2}T/)
  const second = await (await sync({ since: first.cursor })).json()
  assert.equal(second.rows.length, 1); assert.equal(second.hasMore, false)
  assert.equal(new Set([...first.rows, ...second.rows].map((row) => row.id)).size, 501)
  const mutation = { id: 'http-edit', op: 'update', rowId: first.rows[0].id, fieldId: id.field, base: first.rows[0].data[id.field], next: 'Changed' }
  const changed = await (await sync({ since: second.cursor, mutations: [mutation] })).json()
  assert.deepEqual(changed.applied, ['http-edit']); assert.equal(changed.rows.length, 1); assert.equal(changed.rows[0].data[id.field], 'Changed')
  assert.equal(changed.rows[0].data[id.editor], id.user)
  const exported = await fetch(`${base}/t/${id.table}/export?format=csv`, { headers: { cookie } })
  assert.equal(exported.status, 200)
  const csv = await exported.text()
  assert.ok(csv.includes(first.rows[0].id)); assert.ok(csv.includes('14.03.2026')); assert.ok(!csv.includes('FORGED_SYSTEM_ID'))
  for (const role of ['anonymous', 'client', 'staff', 'manager']) {
    const demo = await fetch(`${base}/demo?role=${role}`)
    assert.equal(demo.status, 200)
    const html = await demo.text()
    assert.ok(html.includes('Услуги и цены'))
    // Use cell values absent from field help text, which mentions example titles.
    if (role === 'anonymous') assert.ok(!html.includes('Если можно, сохраните данные с диска.'))
    if (role === 'client' || role === 'staff') assert.ok(html.includes('Если можно, сохраните данные с диска.'))
    if (role === 'client') assert.ok(!html.includes('Забрать до конца недели, иначе на склад.'))
    if (role === 'staff') assert.ok(html.includes('Забрать до конца недели, иначе на склад.'))
  }
  const denied = await fetch(`${base}/api/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tableId: id.table, deviceId: 'unknown' }) })
  assert.equal(denied.status, 403)
  const form = new FormData(); form.append('file', new File(['Stage4 real MinIO smoke'], 'smoke.txt', { type: 'text/plain' }))
  const upload = await fetch(`${base}/api/files`, { method: 'POST', headers: { cookie }, body: form })
  assert.equal(upload.status, 200)
  const body = await upload.json(); assert.equal(body.ok, true); uploaded = body.attachment
  const [record] = await db.select().from(attachments).where(eq(attachments.id, uploaded!.id))
  assert.equal(record!.state, 'ready')
  const download = await fetch(`${base}/api/files/${uploaded!.key}`, { headers: { cookie } })
  assert.equal(download.status, 200); assert.equal(await download.text(), 'Stage4 real MinIO smoke')
  assert.equal((await fetch(`${base}/api/files/${uploaded!.key}`)).status, 403)
  await db.update(workspaceMembers).set({ role: 'viewer' }).where(eq(workspaceMembers.workspaceId, id.workspace))
  const revoked = await (await sync({ since: changed.cursor, mutations: [{ ...mutation, id: 'denied-edit', base: 'Changed', next: 'Forbidden' }] })).json()
  assert.equal(revoked.reset, true); assert.equal(revoked.rejected[0].status, 'dropped')
  await db.update(attachments).set({ createdAt: new Date(Date.now() - 2 * 86400000) }).where(eq(attachments.id, uploaded!.id))
  const cleanup = await cleanupFiles({ run: true, workspaceId: id.workspace })
  assert.equal(cleanup.deleted, 1); assert.equal(cleanup.failed, 0)
  const [usage] = await db.select().from(workspaceUsage).where(eq(workspaceUsage.workspaceId, id.workspace))
  assert.equal(usage!.fileBytes, 0)
  const { getFile } = await import('../src/lib/storage')
  assert.equal(await getFile(uploaded!.key), null)
  uploaded = undefined
  console.log(JSON.stringify({ status: 'passed', http: true, postgres: true, minio: true, rows: 501,
    checked: ['pagination', 'incremental write', 'system fields', 'date export', 'demo roles', 'access denied', 'role revocation', 'upload/download', 'cleanup', 'quota release'] }))
} finally {
  if (uploaded) {
    await db.update(attachments).set({ state: 'deleting' }).where(eq(attachments.id, uploaded.id))
    await removeTrackedAttachment(uploaded.id, id.workspace, uploaded.key)
  }
  await db.delete(workspaces).where(eq(workspaces.id, id.workspace))
  await db.delete(users).where(eq(users.id, id.user))
  await sql.end()
}
