import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import type { Member } from './session'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const state = vi.hoisted(() => ({ member: null as Member | null }))
vi.mock('./session', () => ({ currentMember: async () => state.member }))

describe.skipIf(!process.env.DATABASE_URL)('business overview metadata against Postgres', () => {
  let database: typeof import('@tableapp/db')
  let load: typeof import('./business-overview-data').loadBusinessOverview
  let member: Member
  const ids = {
    user: newId('user'), otherUser: newId('user'), own: newId('workspace'), other: newId('workspace'),
    table: newId('table'), otherTable: newId('table'), field: newId('field'), app: newId('app'), otherApp: newId('app'),
  }
  const stamp = `business-overview-${Date.now()}-${ids.user}`
  beforeAll(async () => {
    database = await import('@tableapp/db')
    load = (await import('./business-overview-data')).loadBusinessOverview
    const { db, users, workspaces, workspaceMembers, tables, fields, rows, apps } = database
    await db.insert(users).values([{ id: ids.user, email: `${stamp}@example.invalid` }, { id: ids.otherUser, email: `${stamp}-other@example.invalid` }])
    await db.insert(workspaces).values([
      { id: ids.own, ownerId: ids.user, name: 'Internal', slug: `${stamp}-own`, businessProfile: { name: 'Свой бизнес', location: '', phone: '' } },
      { id: ids.other, ownerId: ids.otherUser, name: 'FOREIGN_BUSINESS', slug: `${stamp}-other` },
    ])
    await db.insert(workspaceMembers).values({ userId: ids.user, workspaceId: ids.own, role: 'owner' })
    await db.insert(tables).values([
      { id: ids.table, workspaceId: ids.own, name: 'Товары', position: 'a0', updatedAt: new Date('2026-01-01') },
      { id: ids.otherTable, workspaceId: ids.other, name: 'FOREIGN_TABLE', position: 'a0' },
    ])
    await db.insert(fields).values({ id: ids.field, tableId: ids.table, name: 'Наименование', type: 'text', position: 'a0', updatedAt: new Date('2026-01-02') })
    await db.insert(rows).values([
      { id: newId('row'), tableId: ids.table, position: 'a0', data: { [ids.field]: 'PRIVATE_ROW_CONTENT' }, updatedAt: new Date('2026-01-03') },
      { id: newId('row'), tableId: ids.table, position: 'a1', data: { [ids.field]: 'PRIVATE_DELETED_CONTENT' }, deletedAt: new Date(), updatedAt: new Date('2026-01-04') },
      { id: newId('row'), tableId: ids.otherTable, position: 'a0', data: { secret: 'FOREIGN_ROW' } },
    ])
    await db.insert(apps).values([
      { id: ids.app, workspaceId: ids.own, name: 'Магазин', slug: `${stamp}-app`, draft: { private: 'PRIVATE_DRAFT' }, published: { private: 'PRIVATE_PUBLISHED' } },
      { id: ids.otherApp, workspaceId: ids.other, name: 'FOREIGN_APP', slug: `${stamp}-other-app`, draft: { private: 'FOREIGN_DRAFT' } },
    ])
    member = { userId: ids.user, workspaceId: ids.own, workspaceName: 'Internal', email: `${stamp}@example.invalid`, name: null, role: 'owner' }
  })
  beforeEach(() => { state.member = member })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, [ids.own, ids.other]))
    await database.db.delete(database.users).where(inArray(database.users.id, [ids.user, ids.otherUser]))
    await database.sql.end()
  })
  it('projects live counts and last edit without row contents or application snapshots', async () => {
    const result = await load()
    expect(result?.businessName).toBe('Свой бизнес')
    expect(result?.tables).toEqual([{ id: ids.table, name: 'Товары', icon: 'table', rowCount: 1, fieldCount: 1, updatedAt: '2026-01-04T00:00:00.000Z' }])
    expect(result?.apps).toEqual([expect.objectContaining({ id: ids.app, name: 'Магазин', published: true, hasUnpublishedChanges: true })])
    for (const secret of ['PRIVATE_', 'FOREIGN_', 'draft', 'rowData', member.email]) expect(JSON.stringify(result)).not.toContain(secret)
  })
  it('selects metadata from the active business only after business switching', async () => {
    // A resolved authenticated member is the only source of the workspace id.
    state.member = { ...member, userId: ids.otherUser, workspaceId: ids.other, workspaceName: 'FOREIGN_BUSINESS', role: 'viewer' }
    const result = await load()
    expect(result?.tables.map(table => table.id)).toEqual([ids.otherTable])
    expect(result?.apps.map(app => app.id)).toEqual([ids.otherApp])
    expect(result?.role).toBe('viewer')
    expect(JSON.stringify(result)).not.toContain(ids.table)
  })
  it('returns no overview for an anonymous visitor', async () => {
    state.member = null
    expect(await load()).toBeNull()
  })
})
