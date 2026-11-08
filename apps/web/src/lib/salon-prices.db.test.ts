import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newId } from '@tableapp/schema'
import { templateExample } from './templates/presentation'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
describe.skipIf(!process.env.DATABASE_URL)('price snapshots in PostgreSQL', () => {
  const workspaceId = newId('workspace'), userId = newId('user')
  const example = templateExample('salon')
  const services = example.table('services'), visits = example.table('visits')
  const sourcePrice = example.field('services', 'price'), price = example.field('visits', 'price'), service = example.field('visits', 'service')
  const firstService = example.rows.find(row => row.tableId === services.id)!
  let database: typeof import('@tableapp/db'), writes: typeof import('./row-mutations')
  const actor = { id: userId, kind: 'member' }
  beforeAll(async () => {
    database = await import('@tableapp/db'); writes = await import('./row-mutations')
    await database.db.insert(database.users).values({ id: userId, email: `${userId}@example.invalid` })
    await database.db.insert(database.workspaces).values({ id: workspaceId, ownerId: userId, name: 'Price snapshot tests', slug: workspaceId.toLowerCase() })
    await database.db.insert(database.workspaceMembers).values({workspaceId,userId,role:'owner'})
    await database.db.insert(database.tables).values(example.built.tables.map(table => ({ ...table, workspaceId })))
    await database.db.insert(database.fields).values(example.built.fields)
    await database.db.insert(database.rows).values(example.built.rows)
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
    await database.sql.end()
  })
  const read = async (id: string) => (await database.db.select().from(database.rows).where(eq(database.rows.id, id)))[0]!.data as Record<string, unknown>
  it('captures a linked price at create, retains history after service edits, and accepts explicit zero', async () => {
    const created = await writes.writeRows(workspaceId, context => writes.createRow(context, visits.id, { [service.id]: [firstService.id], [price.id]: null }, actor))
    expect((await read(created.id))[price.id]).toBe(2500)
    await writes.writeRows(workspaceId, context => writes.updateRow(context, services.id, firstService.id, { [sourcePrice.id]: 3000 }, actor))
    await writes.writeRows(workspaceId, context => writes.updateRow(context, visits.id, created.id, { [example.field('visits', 'client').id]: 'Changed name' }, actor))
    expect((await read(created.id))[price.id]).toBe(2500)
    const next = await writes.writeRows(workspaceId, context => writes.createRow(context, visits.id, { [service.id]: [firstService.id] }, actor))
    expect((await read(next.id))[price.id]).toBe(3000)
    const free = await writes.writeRows(workspaceId, context => writes.createRow(context, visits.id, { [service.id]: [firstService.id], [price.id]: 0 }, actor))
    expect((await read(free.id))[price.id]).toBe(0)
    const changes = await database.db.select().from(database.rowChanges).where(eq(database.rowChanges.rowId, created.id))
    expect(changes.some(change => (change.after as Record<string, unknown>)?.[price.id] === 2500)).toBe(true)
  })
  it('cannot fill a price from a table outside the workspace and rolls back the visit', async () => {
    if (service.type !== 'relation') throw new Error('wrong fixture')
    await database.db.update(database.fields).set({ options: { ...service.options, tableId: 'foreign-table' } }).where(eq(database.fields.id, service.id))
    const rowId = newId('row')
    await expect(writes.writeRows(workspaceId, context => writes.createRow(context, visits.id, { [service.id]: ['foreign-row'] }, actor, { id: rowId }))).rejects.toThrow('Таблица не найдена')
    expect(await database.db.select().from(database.rows).where(eq(database.rows.id, rowId))).toHaveLength(0)
  })
})
