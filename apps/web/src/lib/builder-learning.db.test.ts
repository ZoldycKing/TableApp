import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { builderV2Revision } from './builder-v2-revision'
import { builderLearningTarget } from './builder-learning-types'

const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const env = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env)

describe.skipIf(!process.env.DATABASE_URL)('personal builder learning with server-verified progress', () => {
  let data: typeof import('@tableapp/db'), actions: typeof import('@/app/builder-learning-actions'), drafts: typeof import('@/app/builder-v2-actions'), reads: typeof import('@/app/builder-v2-data-actions')
  const userId = newId('user'), colleague = newId('user'), workspaceId = newId('workspace'), foreignWorkspace = newId('workspace'), tableId = newId('table'), title = newId('field'), amount = newId('field'), rowId = newId('row')
  const member = { userId, email: `${userId}@example.invalid`, workspaceId, workspaceName: 'Learning synthetic', name: 'Test', role: 'owner' as const }
  beforeAll(async () => {
    data = await import('@tableapp/db'); actions = await import('@/app/builder-learning-actions'); drafts = await import('@/app/builder-v2-actions'); reads = await import('@/app/builder-v2-data-actions')
    await data.db.insert(data.users).values([{ id: userId, email: member.email }, { id: colleague, email: `${colleague}@example.invalid` }])
    await data.db.insert(data.workspaces).values([{ id: workspaceId, ownerId: userId, name: 'Learning synthetic', slug: workspaceId, plan: 'business' }, { id: foreignWorkspace, ownerId: colleague, name: 'Foreign learning', slug: foreignWorkspace }])
    await data.db.insert(data.workspaceMembers).values([{ workspaceId, userId, role: 'owner' }, { workspaceId, userId: colleague, role: 'editor' }, { workspaceId: foreignWorkspace, userId: colleague, role: 'owner' }])
    await data.db.insert(data.tables).values({ id: tableId, workspaceId, name: 'Проекты', position: 'a0' })
    await data.db.insert(data.fields).values([{ id: title, tableId, name: 'Название', type: 'text', position: 'a0' }, { id: amount, tableId, name: 'Бюджет', type: 'number', position: 'a1' }])
    await data.db.update(data.tables).set({ primaryFieldId: title }).where(eq(data.tables.id, tableId))
    await data.db.insert(data.rows).values({ id: rowId, tableId, position: 'a0', data: { [title]: 'Свои данные', [amount]: 47500 } })
  })
  beforeEach(() => { identity.member = member })
  afterAll(async () => { vi.unstubAllEnvs(); if (!data) return; await data.db.delete(data.workspaces).where(inArray(data.workspaces.id, [workspaceId, foreignWorkspace])); await data.db.delete(data.users).where(inArray(data.users.id, [userId, colleague])); await data.sql.end() })
  async function app() {
    const { newBuilderV2App, loadBuilderV2Catalog } = await import('./builder-v2'), { buildBuilderV2Starter } = await import('./builder-v2-starter')
    const metadata = await loadBuilderV2Catalog(workspaceId), id = newId('app')
    const value = buildBuilderV2Starter(newBuilderV2App({ id, workspaceId, name: 'Мои проекты', slug: id.replace('_', '-'), email: member.email }), metadata.tables, tableId)
    await data.db.insert(data.apps).values({ id, workspaceId, name: value.name, slug: value.slug, theme: value.theme, draft: value })
    return value
  }
  async function stored(id: string) {
    const [record] = await data.db.select().from(data.apps).where(eq(data.apps.id, id)), read = readAppDefinition(record?.draft)
    if (!record || !read.ok || read.formatVersion !== 2) throw new Error('Invalid fixture')
    return { record, app: read.app }
  }
  async function progress(id: string) {
    const result = await actions.readBuilderLearningAction(id)
    if (!result.ok) throw new Error(result.error)
    return result.progress
  }
  const changed = (app: AppV2): AppV2 => ({ ...app, nodes: app.nodes.map(node => node.type === 'collection' ? { ...node, layout: 'cards' } : node) })
  it('starts once, preserves pause and skipped steps across reloads, and distinguishes skip from completion', async () => {
    const value = await app(), before = await stored(value.id)
    expect(await progress(value.id)).toBeNull()
    await actions.builderLearningAction(value.id, 'start')
    await actions.builderLearningAction(value.id, 'skip_list')
    await actions.builderLearningAction(value.id, 'pause')
    expect(await actions.builderLearningAction(value.id, 'start')).toMatchObject({ ok: true, progress: { paused: true, list: 'skipped', record: 'pending' } })
    expect(await progress(value.id)).toMatchObject({ paused: true, list: 'skipped', record: 'pending' })
    await actions.builderLearningAction(value.id, 'resume')
    expect(await actions.builderLearningAction(value.id, 'retry_list')).toMatchObject({ ok: true, progress: { paused: false, list: 'pending' } })
    expect((await stored(value.id)).record.draft).toEqual(before.record.draft)
    expect((await stored(value.id)).record.published).toBeNull()
    expect(await data.db.select().from(data.builderLearning).where(eq(data.builderLearning.appId, value.id))).toHaveLength(1)
  })
  it('counts only an actual saved list change, not a renamed app, failed save or unchanged retry', async () => {
    const value = await app(); await actions.builderLearningAction(value.id, 'start')
    await drafts.saveBuilderV2DraftAction(value.id, { ...value, name: 'Другое название' }, builderV2Revision(value))
    expect((await progress(value.id))?.list).toBe('pending')
    const current = (await stored(value.id)).app
    expect(await drafts.saveBuilderV2DraftAction(value.id, changed(current), '0'.repeat(64))).toMatchObject({ ok: false, conflict: true })
    expect((await progress(value.id))?.list).toBe('pending')
    expect(await drafts.saveBuilderV2DraftAction(value.id, changed(current), builderV2Revision(current))).toMatchObject({ ok: true, learning: { list: 'done' } })
    const saved = (await stored(value.id)).app
    expect(await drafts.saveBuilderV2DraftAction(value.id, saved, builderV2Revision(current))).toMatchObject({ ok: true, learning: { list: 'done' } })
  })
  it('counts a verified record from the stored list card and rejects invented or unsaved card proof', async () => {
    const value = await app(); await actions.builderLearningAction(value.id, 'start')
    const target = builderLearningTarget(value)!
    expect(await reads.readBuilderV2RecordAction(value.id, value, { screenId: target.cardScreenId, recordId: newId('row') })).toMatchObject({ ok: false })
    expect((await progress(value.id))?.record).toBe('pending')
    const { createCollectionCard } = await import('@/components/builder/v2/model'), { loadBuilderV2Catalog } = await import('./builder-v2')
    const extra = createCollectionCard(value, target.nodeId, (await loadBuilderV2Catalog(workspaceId)).tables)
    expect(await reads.readBuilderV2RecordAction(value.id, extra.app, { screenId: extra.screenId, recordId: rowId })).toMatchObject({ ok: true, learning: { record: 'pending' } })
    expect(await reads.readBuilderV2RecordAction(value.id, value, { screenId: target.cardScreenId, recordId: rowId })).toMatchObject({ ok: true, learning: { record: 'done', list: 'pending' } })
    expect((await data.db.select().from(data.rows).where(eq(data.rows.id, rowId)))[0]!.data).toEqual({ [title]: 'Свои данные', [amount]: 47500 })
  })
  it('merges pause and a concurrent saved change instead of losing either update', async () => {
    const value = await app(); await actions.builderLearningAction(value.id, 'start')
    await Promise.all([actions.builderLearningAction(value.id, 'pause'), drafts.saveBuilderV2DraftAction(value.id, changed(value), builderV2Revision(value))])
    expect(await progress(value.id)).toMatchObject({ list: 'done', paused: true })
  })
  it('isolates progress by person and app and enforces workspace access and rollout', async () => {
    const first = await app(), second = await app()
    await actions.builderLearningAction(first.id, 'start'); await actions.builderLearningAction(first.id, 'skip_record')
    expect(await progress(second.id)).toBeNull()
    identity.member = { ...member, userId: colleague, email: `${colleague}@example.invalid`, role: 'editor' }
    expect(await progress(first.id)).toBeNull()
    await actions.builderLearningAction(first.id, 'start')
    expect((await progress(first.id))?.record).toBe('pending')
    identity.member = member
    expect((await progress(first.id))?.record).toBe('skipped')
    identity.member = { ...member, workspaceId: foreignWorkspace }
    expect(await actions.readBuilderLearningAction(first.id)).toMatchObject({ ok: false })
    identity.member = { ...member, role: 'viewer' }
    expect(await actions.builderLearningAction(first.id, 'start')).toMatchObject({ ok: false })
    identity.member = member
    expect(await actions.builderLearningAction(first.id, 'complete' as never)).toMatchObject({ ok: false })
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('TABLEAPP_BUILDER_V2', '0')
    expect(await actions.builderLearningAction(first.id, 'resume')).toMatchObject({ ok: false })
    vi.unstubAllEnvs()
  })
  it('keeps skip from overwriting a real completion and cascades only the deleted app progress', async () => {
    const value = await app(); await actions.builderLearningAction(value.id, 'start')
    const target = builderLearningTarget(value)!
    await Promise.all([actions.builderLearningAction(value.id, 'skip_record'), reads.readBuilderV2RecordAction(value.id, value, { screenId: target.cardScreenId, recordId: rowId })])
    expect((await progress(value.id))?.record).toBe('done')
    await data.db.delete(data.apps).where(eq(data.apps.id, value.id))
    expect(await data.db.select().from(data.builderLearning).where(eq(data.builderLearning.appId, value.id))).toHaveLength(0)
  })
  it('confirms access only after the saved configuration is ready and completes publication only after success',async()=>{
    const value=await app();await actions.builderLearningAction(value.id,'start')
    expect(await actions.confirmBuilderLearningAccessAction(value.id,builderV2Revision(value))).toMatchObject({ok:false})
    expect((await progress(value.id))?.access).toBe('pending')
    value.policy.tables=[{tableId,grants:[{audience:{kind:'roles',roleIds:['owner']},read:{fieldIds:[title,amount],rows:{kind:'all'}}}]}]
    expect(await actions.confirmBuilderLearningAccessAction(value.id,builderV2Revision(value))).toMatchObject({ok:false})
    expect(await drafts.saveBuilderV2DraftAction(value.id,value,builderV2Revision((await stored(value.id)).app))).toMatchObject({ok:true})
    expect((await progress(value.id))?.access).toBe('pending')
    await Promise.all([actions.confirmBuilderLearningAccessAction(value.id,builderV2Revision(value)),actions.builderLearningAction(value.id,'pause')])
    expect(await progress(value.id)).toMatchObject({access:'done',paused:true,publish:'pending'})
    await actions.builderLearningAction(value.id,'skip_access');expect((await progress(value.id))?.access).toBe('done')
    await actions.builderLearningAction(value.id,'skip_publish');expect((await progress(value.id))?.publish).toBe('skipped')
    const {publishBuilderV2Action}=await import('@/app/builder-v2-publish-actions')
    expect(await publishBuilderV2Action(value.id,'0'.repeat(64))).toMatchObject({ok:false});expect((await progress(value.id))?.publish).toBe('skipped')
    expect(await publishBuilderV2Action(value.id,builderV2Revision(value))).toMatchObject({ok:true,learning:{publish:'done',access:'done',paused:true}})
    const completed=(await progress(value.id))!
    expect(await publishBuilderV2Action(value.id,builderV2Revision(value))).toMatchObject({ok:true,learning:{revision:completed.revision}})
    identity.member={...member,userId:colleague,email:`${colleague}@example.invalid`,role:'editor'};expect(await progress(value.id)).toBeNull()
  })
  it('keeps skip and retry for the new steps distinct from completion',async()=>{
    const value=await app();await actions.builderLearningAction(value.id,'start')
    for(const step of['access','publish'] as const){await actions.builderLearningAction(value.id,`skip_${step}`);expect((await progress(value.id))?.[step]).toBe('skipped');await actions.builderLearningAction(value.id,`retry_${step}`);expect((await progress(value.id))?.[step]).toBe('pending')}
    expect(await actions.builderLearningAction(value.id,'publish_done' as never)).toMatchObject({ok:false})
    identity.member={...member,role:'viewer'};expect(await actions.confirmBuilderLearningAccessAction(value.id,builderV2Revision(value))).toMatchObject({ok:false})
  })
})
