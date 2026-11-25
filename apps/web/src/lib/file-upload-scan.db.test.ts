import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { newId } from '@tableapp/schema'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const storage = vi.hoisted(() => ({
  getFile: vi.fn(),
  putFile: vi.fn(),
  fileKey: (workspaceId: string) => `${workspaceId}/scan-${Math.random().toString(16).slice(2)}.bin`,
  deleteFile: vi.fn(),
}))
const scan = vi.hoisted(() => ({ scanUpload: vi.fn() }))
const image = vi.hoisted(() => ({
  reencodeImage: vi.fn(async (file: { name: string; bytes: Uint8Array }) => ({
    ok: true as const,
    image: { bytes: file.bytes, mime: 'image/png', width: 1, height: 1, name: 'photo.png' },
  })),
  isImageUpload: (mime: string) => mime.startsWith('image/'),
}))

vi.mock('@/lib/storage', () => storage)
vi.mock('@/lib/file-scan', async (original) => ({
  ...await original<typeof import('./file-scan')>(),
  scanUpload: scan.scanUpload,
}))
vi.mock('@/lib/file-image', () => image)

describe.skipIf(!process.env.DATABASE_URL)('upload antivirus and access flow', () => {
  let database: typeof import('@tableapp/db')
  let uploads: typeof import('./file-upload')
  let download: typeof import('@/app/api/files/[...key]/route')
  let session: typeof import('./session')
  const userId = newId('user'), otherId = newId('user'), workspaceId = newId('workspace')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=', 'base64')

  beforeAll(async () => {
    database = await import('@tableapp/db')
    uploads = await import('./file-upload')
    download = await import('@/app/api/files/[...key]/route')
    session = await import('./session')
    await database.db.insert(database.users).values([
      { id: userId, email: `scan-${userId}@example.invalid` },
      { id: otherId, email: `scan-${otherId}@example.invalid` },
    ])
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'Scan test', slug: `scan-${workspaceId}` })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId, role: 'owner' })
  })
  beforeEach(() => {
    storage.putFile.mockReset()
    storage.deleteFile.mockReset()
    storage.getFile.mockReset()
    scan.scanUpload.mockReset()
    storage.deleteFile.mockResolvedValue(undefined)
    storage.putFile.mockImplementation(async (owner: string, file: { name: string; type: string; bytes: Uint8Array }, key: string) => ({
      ok: true, stored: { key, name: file.name, mime: file.type, size: file.bytes.byteLength },
    }))
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
    await database.db.delete(database.users).where(eq(database.users.id, otherId))
    await database.sql.end()
  })

  it('marks a clean scan as ready and downloadable for the owner', async () => {
    scan.scanUpload.mockResolvedValue({ status: 'clean' })
    const attachment = await uploads.storeAttachment(workspaceId, userId, 'manual', { name: 'photo.png', type: 'image/png', bytes: png })
    expect(attachment.scanStatus).toBe('clean')
    const [record] = await database.db.select().from(database.attachments).where(eq(database.attachments.id, attachment.id))
    expect(record!.state).toBe('ready')
    expect(record!.scanStatus).toBe('clean')
    expect(record!.width).toBe(1)
    storage.getFile.mockResolvedValueOnce({
      mime: 'image/png',
      body: new ReadableStream({ start(controller) { controller.enqueue(png); controller.close() } }),
    })
    vi.spyOn(session, 'currentMember').mockResolvedValue({
      userId, email: 'a@b.c', name: 'Owner', workspaceId, workspaceName: 'Scan test', role: 'owner',
    })
    const response = await download.GET(new Request(`http://localhost/api/files/${attachment.key}`), {
      params: Promise.resolve({ key: attachment.key.split('/') }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toMatch(/^inline;/)
  })

  it('blocks infected uploads, deletes the object and refuses download', async () => {
    scan.scanUpload.mockResolvedValue({ status: 'infected', signature: 'Eicar-Test-Signature' })
    const attachment = await uploads.storeAttachment(workspaceId, userId, 'manual', { name: 'photo.png', type: 'image/png', bytes: png })
    expect(attachment.scanStatus).toBe('infected')
    expect(storage.deleteFile).toHaveBeenCalledWith(attachment.key)
    const [record] = await database.db.select().from(database.attachments).where(eq(database.attachments.id, attachment.id))
    expect(record!.state).toBe('blocked')
    expect(record!.size).toBe(0)
    vi.spyOn(session, 'currentMember').mockResolvedValue({
      userId, email: 'a@b.c', name: 'Owner', workspaceId, workspaceName: 'Scan test', role: 'owner',
    })
    const response = await download.GET(new Request(`http://localhost/api/files/${attachment.key}`), {
      params: Promise.resolve({ key: attachment.key.split('/') }),
    })
    expect(response.status).toBe(404)
    expect(storage.getFile).not.toHaveBeenCalled()
  })

  it('keeps skipped scans available when ClamAV is off', async () => {
    scan.scanUpload.mockResolvedValue({ status: 'skipped' })
    const attachment = await uploads.storeAttachment(workspaceId, userId, 'manual', { name: 'photo.png', type: 'image/png', bytes: png })
    expect(attachment.scanStatus).toBe('skipped')
    const [record] = await database.db.select().from(database.attachments).where(eq(database.attachments.id, attachment.id))
    expect(record!.state).toBe('ready')
  })

  it('rejects download for another workspace member without rights to a pending cell file', async () => {
    scan.scanUpload.mockResolvedValue({ status: 'clean' })
    const attachment = await uploads.storeAttachment(workspaceId, userId, 'manual', { name: 'photo.png', type: 'image/png', bytes: png })
    vi.spyOn(session, 'currentMember').mockResolvedValue(null)
    const response = await download.GET(new Request(`http://localhost/api/files/${attachment.key}`), {
      params: Promise.resolve({ key: attachment.key.split('/') }),
    })
    expect(response.status).toBe(404)
    expect(storage.getFile).not.toHaveBeenCalled()
  })
})
