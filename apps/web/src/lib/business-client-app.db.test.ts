import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { newId } from '@tableapp/schema'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

describe.skipIf(!process.env.DATABASE_URL)('one client app per business in PostgreSQL', () => {
  const owner = newId('user'), first = newId('workspace'), second = newId('workspace')
  const firstApp = newId('app'), secondApp = newId('app'), anotherFirstApp = newId('app')
  let database: typeof import('@tableapp/db')
  beforeAll(async () => {
    database = await import('@tableapp/db')
    await database.db.insert(database.users).values({ id: owner, email: `${owner}@example.invalid` })
    await database.db.insert(database.workspaces).values([first, second].map(id => ({ id, ownerId: owner, name: 'Synthetic business', slug: id })))
    await database.db.insert(database.apps).values([
      { id: firstApp, workspaceId: first }, { id: secondApp, workspaceId: second }, { id: anotherFirstApp, workspaceId: first },
    ].map(app => ({ ...app, name: 'Synthetic application', slug: app.id })))
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.workspaces).where(inArray(database.workspaces.id, [first, second]))
    await database.db.delete(database.users).where(eq(database.users.id, owner))
    await database.sql.end()
  })
  it('rejects a foreign application even when both businesses have the same owner', async () => {
    await expect(database.db.insert(database.workspaceClientApps).values({ workspaceId: second, appId: firstApp })).rejects.toThrow()
    expect(await database.db.select().from(database.workspaceClientApps).where(eq(database.workspaceClientApps.workspaceId, second))).toHaveLength(0)
  })
  it('allows an explicit owned binding, tolerates a retry, and prevents a second primary app', async () => {
    await database.db.insert(database.workspaceClientApps).values({ workspaceId: first, appId: firstApp })
    await database.db.insert(database.workspaceClientApps).values({ workspaceId: first, appId: firstApp }).onConflictDoNothing()
    await expect(database.db.insert(database.workspaceClientApps).values({ workspaceId: first, appId: anotherFirstApp })).rejects.toThrow()
    const bindings = await database.db.select().from(database.workspaceClientApps).where(eq(database.workspaceClientApps.workspaceId, first))
    expect(bindings).toHaveLength(1); expect(bindings[0]!.appId).toBe(firstApp)
  })
  it('keeps the primary apps of two businesses independent', async () => {
    await database.db.insert(database.workspaceClientApps).values({ workspaceId: second, appId: secondApp })
    expect(await database.db.select().from(database.workspaceClientApps).where(inArray(database.workspaceClientApps.workspaceId, [first, second]))).toHaveLength(2)
  })
  it('cleans a deleted app binding without deleting the business or its other apps', async () => {
    await database.db.delete(database.apps).where(eq(database.apps.id, firstApp))
    expect(await database.db.select().from(database.workspaceClientApps).where(eq(database.workspaceClientApps.workspaceId, first))).toHaveLength(0)
    expect(await database.db.select().from(database.workspaces).where(eq(database.workspaces.id, first))).toHaveLength(1)
    expect(await database.db.select().from(database.apps).where(eq(database.apps.id, anotherFirstApp))).toHaveLength(1)
  })
})
