import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { appSchema, fieldTimeZone, newId } from '@tableapp/schema'
import { templateExample } from './templates/presentation'
import type { BookingSetupInput } from '@/app/booking-actions'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const state = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', async original => ({ ...await original<typeof import('./session')>(), currentMember: async () => state.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('owner draft schedule preparation', () => {
  const example = templateExample('salon'), config = example.app.booking!
  const userId = newId('user'), workspaceId = newId('workspace')
  const member = { userId, email: `${userId}@example.invalid`, name: 'Owner', workspaceId, workspaceName: 'Synthetic preparation', role: 'owner' as const }
  let database: typeof import('@tableapp/db'), action: typeof import('@/app/owner-booking-actions').setupOwnerBookingMasterAction
  const serviceId = example.rows.find(row => row.tableId === config.tables.services)!.id
  const input = (suffix: string): BookingSetupInput => ({ name: 'Synthetic master', email: `master-${suffix}@example.invalid`, serviceIds: [serviceId], weekdays: [1, 3], start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00', timeZone: fieldTimeZone(example.fields.find(field => field.id === config.visit.start)!) })
  beforeAll(async () => {
    database = await import('@tableapp/db'); action = (await import('@/app/owner-booking-actions')).setupOwnerBookingMasterAction
    example.app.workspaceId = workspaceId; example.app.slug = `owner-schedule-${example.app.id.toLowerCase()}`
    await database.db.insert(database.users).values({ id: userId, email: member.email })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: member.workspaceName, slug: workspaceId, plan: 'business' })
    await database.db.insert(database.workspaceMembers).values({ workspaceId, userId, role: 'owner' })
    await database.db.insert(database.tables).values(example.built.tables.map(table => ({ ...table, workspaceId })))
    await database.db.insert(database.fields).values(example.built.fields)
    await database.db.insert(database.views).values(example.built.views)
    await database.db.insert(database.rows).values(example.built.rows)
    await database.db.insert(database.apps).values({ id: example.app.id, workspaceId, name: example.app.name, slug: example.app.slug, draft: example.app })
    state.member = member
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
    await database.sql.end()
  })
  const counts = async () => {
    const result = await database.db.select({ tableId: database.rows.tableId, count: sql<number>`count(*)::int` }).from(database.rows).where(sql`${database.rows.tableId} in (${config.tables.masters}, ${config.tables.schedule})`).groupBy(database.rows.tableId)
    return Object.fromEntries(result.map(row => [row.tableId, Number(row.count)]))
  }
  it('creates a master, working windows and draft role before publication', async () => {
    const before = await counts()
    expect(await action(example.app.id, input('draft'))).toEqual({ ok: true })
    const after = await counts()
    expect(after[config.tables.masters]).toBe(before[config.tables.masters]! + 1)
    expect(after[config.tables.schedule]).toBe(before[config.tables.schedule]! + 4)
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, example.app.id))
    expect(record!.published).toBeNull()
    expect(appSchema.parse(record!.draft).allowlist).toContainEqual({ email: 'master-draft@example.invalid', roleId: 'staff', company: '' })
  })
  it('does not replace an existing publication while adding a draft master', async () => {
    await database.db.update(database.apps).set({ published: example.app }).where(eq(database.apps.id, example.app.id))
    expect(await action(example.app.id, input('live'))).toEqual({ ok: true })
    const [record] = await database.db.select().from(database.apps).where(eq(database.apps.id, example.app.id))
    expect(record!.published).toEqual(JSON.parse(JSON.stringify(example.app)))
    expect(appSchema.parse(record!.draft).allowlist.some(entry => entry.email === 'master-live@example.invalid')).toBe(true)
  })
  it('rejects duplicates, unknown services and a too short shift without partial writes', async () => {
    const before = await counts()
    expect((await action(example.app.id, input('draft'))).ok).toBe(false)
    expect((await action(example.app.id, { ...input('foreign-service'), serviceIds: ['foreign-row'] })).ok).toBe(false)
    expect((await action(example.app.id, { ...input('short'), end: '09:10', breakStart: '', breakEnd: '' })).ok).toBe(false)
    expect(await counts()).toEqual(before)
  })
  it('rejects another business, viewers and anonymous callers before creating rows', async () => {
    const before = await counts()
    state.member = { ...member, workspaceId: 'another-business' }
    expect((await action(example.app.id, input('foreign'))).ok).toBe(false)
    state.member = { ...member, role: 'viewer' }
    expect((await action(example.app.id, input('viewer'))).ok).toBe(false)
    state.member = null
    expect((await action(example.app.id, input('anonymous'))).ok).toBe(false)
    state.member = member
    expect(await counts()).toEqual(before)
  })
})
