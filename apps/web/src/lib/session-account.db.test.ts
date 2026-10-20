import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { newId } from '@tableapp/schema'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const state = vi.hoisted(() => ({ session: '' }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => key === 'tableapp_session' && state.session ? { value: state.session } : undefined }) }))

describe.skipIf(!process.env.DATABASE_URL)('account without a business', () => {
  let database: typeof import('@tableapp/db')
  let session: typeof import('./session')
  const userId = newId('user'), validSession = newId('session'), expiredSession = newId('session')
  const email = `empty-account-${userId}@example.invalid`
  beforeAll(async () => {
    database = await import('@tableapp/db')
    session = await import('./session')
    await database.db.insert(database.users).values({ id: userId, email })
    await database.db.insert(database.sessions).values([
      { id: validSession, userId, expiresAt: new Date(Date.now() + 60000) },
      { id: expiredSession, userId, expiresAt: new Date(Date.now() - 60000) },
    ])
  })
  afterAll(async () => { if (database) { await database.db.delete(database.users).where(eq(database.users.id, userId)); await database.sql.end() } })
  it('keeps a valid signed-in account without inventing membership or a business', async () => {
    state.session = validSession
    expect(await session.currentAccount()).toEqual({ userId, email, name: null })
    expect(await session.currentMember()).toBeNull()
    expect(await session.listMemberships(userId)).toEqual([])
  })
  it('rejects expired, missing and unknown sessions', async () => {
    for (const value of [expiredSession, '', 'unknown-session']) {
      state.session = value
      expect(await session.currentAccount()).toBeNull()
    }
  })
})
