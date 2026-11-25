import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { MAX_FILE_BYTES } from './file-policy'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
const storage = vi.hoisted(() => ({ getFile: vi.fn(), putFile: vi.fn(), fileKey: (workspaceId: string) => `${workspaceId}/test-${Math.random()}.bin`, deleteFile: vi.fn() }))
vi.mock('@/lib/session', async (original) => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('@/lib/storage', () => storage)

describe.skipIf(!process.env.DATABASE_URL)('file API security against Postgres', () => {
  let database: typeof import('@tableapp/db')
  let upload: typeof import('@/app/api/files/route')
  let download: typeof import('@/app/api/files/[...key]/route')
  const userId = newId('user'), workspaceId = newId('workspace')
  const email = `file-security-${userId}@example.invalid`
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=', 'base64')
  const legacyKey = `${workspaceId}/legacy.svg`
  const member = { userId, email, name: 'Test', workspaceId, workspaceName: 'File test', role: 'editor' as const }

  beforeAll(async () => {
    database = await import('@tableapp/db')
    upload = await import('@/app/api/files/route')
    download = await import('@/app/api/files/[...key]/route')
    await database.db.insert(database.users).values({ id: userId, email })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'File test', slug: `file-security-${workspaceId}` })
    await database.db.insert(database.attachments).values({ id: newId('attachment'), workspaceId, key: legacyKey, name: 'legacy.svg', mime: 'image/svg+xml', size: 1, uploadedBy: userId, referenced: false })
  })
  beforeEach(() => {
    identity.member = member
    storage.getFile.mockReset()
    storage.putFile.mockReset()
    storage.deleteFile.mockReset()
    storage.deleteFile.mockResolvedValue(undefined)
    storage.putFile.mockImplementation(async (owner: string, file: { name: string; type: string; bytes: Uint8Array }, key: string) => ({
      ok: true, stored: { key, name: file.name, mime: file.type, size: file.bytes.byteLength },
    }))
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
    await database.sql.end()
  })
  async function sendFile(name: string, type: string, bytes: Uint8Array) {
    const form = new FormData()
    form.set('file', new File([bytes as BlobPart], name, { type }))
    return upload.POST(new Request('http://localhost/api/files', { method: 'POST', body: form }))
  }
  async function sendDownload(key: string) {
    return download.GET(new Request(`http://localhost/api/files/${key}?v=2`), { params: Promise.resolve({ key: key.split('/') }) })
  }
  function storedFile(mime: string, body = 'Synthetic file') {
    storage.getFile.mockResolvedValueOnce({ mime, body: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(body)); controller.close() } }) })
  }

  it('rejects SVG before writing an attachment, calling storage or reserving quota', async () => {
    const { db, attachments, workspaceUsage } = database
    const before = await db.select().from(workspaceUsage).where(eq(workspaceUsage.workspaceId, workspaceId))
    const response = await sendFile('image.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('SVG')
    expect(storage.putFile).not.toHaveBeenCalled()
    expect(await db.select().from(attachments).where(eq(attachments.workspaceId, workspaceId))).toHaveLength(1)
    expect(await db.select().from(workspaceUsage).where(eq(workspaceUsage.workspaceId, workspaceId))).toEqual(before)
  })
  it('rejects SVG disguised with an image MIME and extension', async () => {
    const response = await sendFile('photo.png', 'image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))
    expect(response.status).toBe(400)
    expect(storage.putFile).not.toHaveBeenCalled()
  })
  it('rejects SVG filename even with valid PNG content', async () => {
    const response = await sendFile('photo.SVG', 'image/png', png)
    expect(response.status).toBe(400)
    expect(storage.putFile).not.toHaveBeenCalled()
  })
  it('checks oversized file metadata without reading its bytes', async () => {
    const form = new FormData()
    form.set('file', new File([], 'photo.png', { type: 'image/png' }))
    const file = form.get('file') as File
    Object.defineProperty(file, 'size', { value: MAX_FILE_BYTES + 1 })
    const read = vi.spyOn(file, 'arrayBuffer')
    const response = await upload.POST({ formData: async () => form } as Request)
    expect(response.status).toBe(400)
    expect(read).not.toHaveBeenCalled()
    expect(storage.putFile).not.toHaveBeenCalled()
  })
  it('returns a readable 400 error for malformed multipart data', async () => {
    const response = await upload.POST(new Request('http://localhost/api/files', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'invalid' }))
    expect(response.status).toBe(400)
    expect(storage.putFile).not.toHaveBeenCalled()
  })
  it('uploads a raster image and returns the stored attachment ID', async () => {
    const response = await sendFile('photo.png', 'image/png', png)
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.ok).toBe(true)
    const [record] = await database.db.select().from(database.attachments).where(eq(database.attachments.key, payload.attachment.key))
    expect(record!.id).toBe(payload.attachment.id)
    expect(record!.workspaceId).toBe(workspaceId)
    expect(record!.mime).toBe('image/png')
    expect(record!.size).toBeGreaterThan(0)
    expect(record!.width).toBeTruthy()
    expect(record!.height).toBeTruthy()
    expect(storage.putFile).toHaveBeenCalledOnce()
    expect(storage.putFile.mock.calls[0]![0]).toBe(workspaceId)
  })
  it('downloads a legacy SVG with sandbox, nosniff and no caching', async () => {
    storedFile('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>/* synthetic */</script></svg>')
    const response = await sendDownload(legacyKey)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment;/)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Security-Policy')).toContain('sandbox;')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.text()).toContain('<svg')
  })
  it('does not trust image MIME when database and object metadata disagree', async () => {
    const key = `${workspaceId}/${newId('attachment')}.png`
    await database.db.insert(database.attachments).values({ id: newId('attachment'), workspaceId, key, name: 'photo.png', mime: 'image/png', size: 1 })
    storedFile('image/svg+xml')
    const response = await sendDownload(key)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment;/)
  })
  it('keeps an authorized scrubbed raster image inline', async () => {
    const key = `${workspaceId}/${newId('attachment')}.png`
    await database.db.insert(database.attachments).values({
      id: newId('attachment'), workspaceId, key, name: 'photo.png', mime: 'image/png', size: 1, width: 1, height: 1,
    })
    storedFile('image/png')
    const response = await sendDownload(key)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Content-Disposition')).toMatch(/^inline;/)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
  it('forces attachment disposition for legacy images without scrubbing metadata', async () => {
    const key = `${workspaceId}/${newId('attachment')}.png`
    await database.db.insert(database.attachments).values({ id: newId('attachment'), workspaceId, key, name: 'photo.png', mime: 'image/png', size: 1 })
    storedFile('image/png')
    const response = await sendDownload(key)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment;/)
  })
  it('still requires access before fetching a legacy SVG', async () => {
    identity.member = null
    const response = await sendDownload(legacyKey)
    expect(response.status).toBe(404)
    expect(storage.getFile).not.toHaveBeenCalled()
  })
  it('requires an editing session before upload', async () => {
    identity.member = null
    expect((await sendFile('photo.png', 'image/png', png)).status).toBe(401)
    identity.member = { ...member, role: 'viewer' }
    expect((await sendFile('photo.png', 'image/png', png)).status).toBe(403)
    expect(storage.putFile).not.toHaveBeenCalled()
  })
})
