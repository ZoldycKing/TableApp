import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import type { Attachment } from '@tableapp/schema'
import type { AppV2Json } from '@tableapp/schema/app-v2'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { builderV2Revision } from '../builder-v2-revision'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const userId = 'usr_invcreatephoto'
const workspaceId = 'wsp_invcreatephoto'
const ownerEmail = 'owner-inv-photo@example.invalid'
const identity = vi.hoisted(() => ({
  member: null as import('../session').Member | null,
  email: null as string | null,
}))
vi.mock('@/lib/session', async original => ({
  ...await original<typeof import('../session')>(),
  currentMember: async () => identity.member,
  currentAccount: async () => null,
}))
vi.mock('@/lib/app-session', async original => ({
  ...await original<typeof import('../app-session')>(),
  currentStaffEmail: async () => identity.email,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/live', () => ({ publishTable: vi.fn() }))
const storage = vi.hoisted(() => ({
  putFile: vi.fn(async (_workspace: string, file: { name: string; type: string; bytes: Uint8Array }, key: string) => ({
    ok: true as const,
    stored: { key, name: file.name, mime: file.type, size: file.bytes.length },
  })),
  deleteFile: vi.fn(async () => {}),
  getFile: vi.fn(async () => ({ mime: 'image/png', body: new Uint8Array([1, 2, 3]) })),
  fileKey: (workspace: string) => `${workspace}/${crypto.randomUUID()}.png`,
}))
vi.mock('@/lib/storage', () => storage)

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=', 'base64')

describe.skipIf(!process.env.DATABASE_URL)('inventory create modal photo upload', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/template-actions')
  let forms: typeof import('../builder-v2-published-write')
  let route: typeof import('@/app/api/builder-v2/files/route')
  let slug = ''
  let revision = ''
  let inv: NonNullable<import('@tableapp/schema/app-v2').AppV2['inventory']>
  let unitChoiceId = ''
  let warehouseId = ''

  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/template-actions')
    forms = await import('../builder-v2-published-write')
    route = await import('@/app/api/builder-v2/files/route')
    const { SESSION_TTL_MS } = await import('../auth')
    await database.db.delete(database.apps).where(eq(database.apps.workspaceId, workspaceId))
    await database.db.delete(database.tables).where(eq(database.tables.workspaceId, workspaceId))
    await database.db.delete(database.workspaceMembers).where(eq(database.workspaceMembers.workspaceId, workspaceId))
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.sessions).where(eq(database.sessions.userId, userId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
    await database.db.insert(database.users).values({ id: userId, email: ownerEmail })
    await database.db.insert(database.workspaces).values({
      id: workspaceId, ownerId: userId, name: 'Inventory Create Photo', slug: 'inv-create-photo', plan: 'business',
    })
    await database.db.insert(database.workspaceMembers).values({ userId, workspaceId, role: 'owner' })
    await database.db.insert(database.sessions).values({
      id: 'ses_invcreatephoto', userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    identity.member = {
      userId, workspaceId, workspaceName: 'Inventory Create Photo', email: ownerEmail, name: 'Owner', role: 'owner',
    }
    identity.email = ownerEmail
    const installed = await actions.applyTemplateAction('sklad')
    expect(installed.ok).toBe(true)
    if (!installed.ok) throw new Error('install failed')
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, installed.appId))
    const read = readAppDefinition(record!.draft)
    if (!read.ok || read.formatVersion !== 2 || !read.app.inventory) throw new Error('bad inventory')
    inv = read.app.inventory
    slug = installed.appSlug
    const published = {
      ...read.app,
      authentication: {
        ...read.app.authentication,
        members: [{ email: ownerEmail, roleIds: ['owner'] as string[], company: '' }],
      },
    }
    await database.db.update(database.apps).set({ published, draft: published, publishedAt: new Date() })
      .where(eq(database.apps.id, installed.appId))
    revision = builderV2Revision(published)
    const unitField = (await database.db.select().from(database.fields).where(eq(database.fields.id, inv.itemUnitFieldId)))[0]!
    const choices = (unitField.options as { choices?: { id: string; name: string }[]; defaultChoiceId?: string })
    unitChoiceId = choices.defaultChoiceId
      ?? choices.choices?.find(choice => choice.name === 'шт.')?.id
      ?? ''
    expect(unitChoiceId).toBeTruthy()
    const [warehouse] = await database.db.select().from(database.rows)
      .where(and(eq(database.rows.tableId, inv.warehousesTableId), isNull(database.rows.deletedAt)))
    warehouseId = warehouse!.id
  })

  it('accepts create-form inspect from the items list, defaults unit to шт., and keeps an uploaded photo on the saved row', async () => {
    const scope = { screenId: inv.itemsScreenId, formId: inv.createItemFormId }
    const initial = await forms.inspectPublishedV2FormRequest(slug, { ...scope, revision, mode: 'initial' })
    expect(initial).toMatchObject({ ok: true })
    if (!initial.ok || !('state' in initial) || !initial.state) throw new Error(JSON.stringify(initial))
    expect(initial.state.values[inv.itemUnitFieldId]).toBe(unitChoiceId)
    expect(initial.state.revision).toBe(revision)

    const body = new FormData()
    body.set('file', new File([png], 'modal-photo.png', { type: 'image/png' }))
    body.set('context', JSON.stringify({
      kind: 'published',
      slug,
      ...scope,
      fieldId: inv.itemPhotoFieldId,
      revision,
      fingerprint: initial.state.fingerprint,
    }))
    const upload = await route.POST(new Request('http://localhost/api/builder-v2/files', { method: 'POST', body }))
    expect(upload.status).toBe(200)
    const { attachment } = await upload.json() as { attachment: Attachment }

    const values: Record<string, AppV2Json> = {
      [inv.itemNameFieldId]: 'Тестовый товар с фото',
      [inv.itemSkuFieldId]: 'TEST-PHOTO-1',
      [inv.itemPhotoFieldId]: [attachment] as unknown as AppV2Json,
      [inv.itemBarcodeFieldId]: null,
      [inv.itemCategoryFieldId]: null,
      [inv.itemUnitFieldId]: unitChoiceId,
      [inv.itemMinFieldId]: 1,
      [inv.itemCostFieldId]: null,
      [inv.itemWarehouseFieldId]: [warehouseId],
    }
    const saved = await forms.submitPublishedV2(slug, 'form', {
      ...scope,
      revision,
      fingerprint: initial.state.fingerprint,
      values,
      requestId: `submit_${crypto.randomUUID().replaceAll('-', '')}`,
    })
    expect(saved.ok).toBe(true)
    if (!saved.ok || !saved.rowId) throw new Error(JSON.stringify(saved))

    const [row] = await database.db.select().from(database.rows).where(eq(database.rows.id, saved.rowId))
    const photos = (row!.data as Record<string, unknown>)[inv.itemPhotoFieldId!]
    expect(photos).toEqual([expect.objectContaining({ name: 'modal-photo.png', mime: 'image/png', key: attachment.key })])
    expect((row!.data as Record<string, unknown>)[inv.itemNameFieldId]).toBe('Тестовый товар с фото')
  })
})
