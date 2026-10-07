import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { newId } from '@tableapp/schema'
import { MAX_CODE_ATTEMPTS, THROTTLE_WINDOW_MS } from './auth'
import { createTotpSecret, hashRecoveryCode, totpAt, verifyTotp } from './totp'

const envFile = resolve(import.meta.dirname, '../../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const identity = vi.hoisted(() => ({ member: null as import('./session').Member | null }))
vi.mock('@/lib/session', () => ({ currentMember: async () => identity.member }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!process.env.DATABASE_URL)('TOTP settings against Postgres', () => {
  let database: typeof import('@tableapp/db')
  let actions: typeof import('@/app/security-actions')
  const userId = newId('user')
  const email = `totp-settings-${userId}@example.invalid`
  const member = { userId, email, name: 'Test', workspaceId: 'synthetic', workspaceName: 'Test', role: 'owner' as const }
  const code = (secret: string) => totpAt(secret, Math.floor(Date.now() / 30_000))
  const incorrect = (secret: string) => {
    for (let i = 0; i < 10; i++) {
      const candidate = String(i).padStart(6, '0')
      if (!verifyTotp(secret, candidate)) return candidate
    }
    throw new Error('No incorrect synthetic code')
  }

  beforeAll(async () => {
    database = await import('@tableapp/db')
    actions = await import('@/app/security-actions')
    await database.db.insert(database.users).values({ id: userId, email })
  })
  beforeEach(async () => {
    identity.member = member
    await database.db.update(database.users).set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: null }).where(eq(database.users.id, userId))
    await database.db.delete(database.authEvents).where(eq(database.authEvents.email, email))
  })
  afterAll(async () => {
    if (!database) return
    await database.db.delete(database.authEvents).where(eq(database.authEvents.email, email))
    await database.db.delete(database.users).where(eq(database.users.id, userId))
    await database.sql.end()
  })

  async function seedActive() {
    const secret = createTotpSecret()
    await database.db.update(database.users).set({ totpSecret: secret, totpEnabledAt: new Date(), recoveryCodes: [hashRecoveryCode('ABCDE-12345')] }).where(eq(database.users.id, userId))
    return secret
  }
  async function current() {
    const [user] = await database.db.select().from(database.users).where(eq(database.users.id, userId))
    return user!
  }
  async function events() {
    return database.db.select().from(database.authEvents).where(eq(database.authEvents.email, email))
  }

  it('enables an initial factor and stores only hashes of recovery codes', async () => {
    const secret = createTotpSecret()
    const result = await actions.enableTotpAction(secret, code(secret))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    const user = await current()
    expect(user.totpSecret).toBe(secret)
    expect(user.totpEnabledAt).not.toBeNull()
    expect(result.recovery).toHaveLength(8)
    expect(user.recoveryCodes).toEqual(result.recovery.map(hashRecoveryCode))
    expect((await events()).map((event) => event.kind)).toEqual(['totp_on'])
  })
  it('rejects replacement using only a valid code for the replacement secret', async () => {
    await seedActive()
    const before = await current()
    const replacement = createTotpSecret()
    const result = await actions.enableTotpAction(replacement, code(replacement))
    expect(result.ok).toBe(false)
    expect(await current()).toEqual(before)
    expect(await events()).toHaveLength(0)
  })
  it('does not regenerate recovery codes when enable is repeated for an active secret', async () => {
    const secret = await seedActive()
    const before = await current()
    expect((await actions.enableTotpAction(secret, code(secret))).ok).toBe(false)
    expect(await current()).toEqual(before)
  })
  it('permits a new setup after disabling with the current factor', async () => {
    const secret = await seedActive()
    expect((await actions.disableTotpAction(incorrect(secret))).ok).toBe(false)
    expect((await current()).totpSecret).toBe(secret)
    expect((await actions.disableTotpAction(code(secret))).ok).toBe(true)
    expect((await current()).recoveryCodes).toBeNull()
    const replacement = createTotpSecret()
    expect((await actions.enableTotpAction(replacement, code(replacement))).ok).toBe(true)
    expect((await current()).totpSecret).toBe(replacement)
    expect((await events()).map((event) => event.kind).sort()).toEqual(['totp_off', 'totp_on', 'totp_settings_failed'])
  })
  it('does not accept a replacement factor code as proof for disabling the current one', async () => {
    const secret = await seedActive()
    let replacement = createTotpSecret()
    while (verifyTotp(secret, code(replacement))) replacement = createTotpSecret()
    const before = await current()
    expect((await actions.disableTotpAction(code(replacement))).ok).toBe(false)
    expect(await current()).toEqual(before)
  })
  it('allows exactly one concurrent initial setup', async () => {
    const secrets = [createTotpSecret(), createTotpSecret()]
    const results = await Promise.all(secrets.map((secret) => actions.enableTotpAction(secret, code(secret))))
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    const winner = results.findIndex((result) => result.ok)
    expect((await current()).totpSecret).toBe(secrets[winner])
    expect((await events()).map((event) => event.kind)).toEqual(['totp_on'])
  })
  it('blocks further attempts after five parallel incorrect codes', async () => {
    const secret = await seedActive()
    const results = await Promise.all(Array.from({ length: MAX_CODE_ATTEMPTS + 3 }, () => actions.disableTotpAction(incorrect(secret))))
    expect(results.every((result) => !result.ok)).toBe(true)
    expect(results.filter((result) => result.error?.includes('Слишком много'))).toHaveLength(3)
    expect(await events()).toHaveLength(MAX_CODE_ATTEMPTS)
    expect((await actions.disableTotpAction(code(secret))).error).toContain('Слишком много')
    expect((await current()).totpSecret).toBe(secret)
    // The budget is persistent; it does not depend on a process-local counter.
    expect((await events()).every((event) => event.kind === 'totp_settings_failed')).toBe(true)
  })
  it('allows verification after the failed-attempt window expires', async () => {
    const secret = await seedActive()
    await database.db.insert(database.authEvents).values(Array.from({ length: MAX_CODE_ATTEMPTS }, () => ({
      id: newId('event'), email, kind: 'totp_settings_failed', createdAt: new Date(Date.now() - THROTTLE_WINDOW_MS - 60_000),
    })))
    expect((await actions.disableTotpAction(code(secret))).ok).toBe(true)
  })
  it('rejects malformed setup secrets and codes without changing the account', async () => {
    const before = await current()
    expect((await actions.enableTotpAction('!', '123456')).ok).toBe(false)
    expect((await actions.enableTotpAction('A', '123456')).ok).toBe(false)
    expect((await actions.enableTotpAction(createTotpSecret(), null as never)).ok).toBe(false)
    expect(await current()).toEqual(before)
  })
  it('fails closed for an inconsistent active factor', async () => {
    await database.db.update(database.users).set({ totpEnabledAt: new Date(), totpSecret: null }).where(eq(database.users.id, userId))
    const secret = createTotpSecret()
    const before = await current()
    expect((await actions.enableTotpAction(secret, code(secret))).ok).toBe(false)
    expect(await current()).toEqual(before)
  })
  it('requires authentication for setup, enable and disable', async () => {
    identity.member = null
    const secret = createTotpSecret()
    await expect(actions.startTotpSetupAction()).rejects.toThrow('Нужен вход')
    await expect(actions.enableTotpAction(secret, code(secret))).rejects.toThrow('Нужен вход')
    await expect(actions.disableTotpAction(code(secret))).rejects.toThrow('Нужен вход')
    expect(await events()).toHaveLength(0)
  })
})
