import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Подписка на настоящей базе.
 *
 * Проверяется путь денег целиком: платёж подтверждён — тариф включился;
 * заплатили ещё раз — дни сложились, а не сгорели; срок кончился —
 * пространство вернулось на бесплатный тариф, но данные остались; деньги
 * вернули — подписка закрылась.
 *
 * Без `DATABASE_URL` набор пропускается.
 */

const root = resolve(import.meta.dirname, '../../../../..')
const envFile = resolve(root, '.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const CONNECTED = Boolean(process.env.DATABASE_URL)

let database: typeof import('@tableapp/db')
let subs: typeof import('./subscription')
let schema: typeof import('@tableapp/schema')
let limits: typeof import('../limits')
let workspaceId = ''
let userId = ''

const DAY = 24 * 60 * 60 * 1000

describe.skipIf(!CONNECTED)('подписка и тариф', () => {
  beforeAll(async () => {
    database = await import('@tableapp/db')
    subs = await import('./subscription')
    schema = await import('@tableapp/schema')
    limits = await import('../limits')

    userId = schema.newId('user')
    workspaceId = schema.newId('workspace')
    await database.db.insert(database.users).values({
      id: userId, email: `pay-${Date.now()}@example.com`, name: 'Проверка оплаты',
    })
    await database.db.insert(database.workspaces).values({
      id: workspaceId, name: 'Оплата', slug: `pay-${Date.now()}`, ownerId: userId, plan: 'free',
    })
    await database.db.insert(database.workspaceMembers).values({
      workspaceId, userId, role: 'owner', acceptedAt: new Date(),
    })
  }, 30_000)

  afterAll(async () => {
    const { eq } = await import('drizzle-orm')
    if (workspaceId) await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    if (userId) await database.db.delete(database.users).where(eq(database.users.id, userId))
  }, 30_000)

  async function pay(months = 1) {
    const id = schema.newId('payment')
    await database.db.insert(database.payments).values({
      id,
      workspaceId,
      plan: 'start',
      months,
      amount: subs.priceKopecks('start', months),
      currency: subs.CURRENCY,
      status: 'pending',
      provider: 'test',
      providerId: `test_${id}`,
    })
    await subs.activate({
      workspaceId, plan: 'start', months, paymentId: id, paidAt: new Date(), providerAt: new Date(),
    })
    return id
  }

  it('подтверждённая оплата включает тариф и записывает срок', async () => {
    await pay()
    const state = await subs.subscriptionFor(workspaceId)

    expect(state.status).toBe('active')
    expect(state.plan.id).toBe('start')
    expect(state.periodEnd!.getTime()).toBeGreaterThan(Date.now() + 29 * DAY)

    // Потолки берут тот же тариф: 25 000 строк вместо двух тысяч.
    const quota = await (await import('../usage')).remainingFor(workspaceId)
    expect(quota.rowsLeft).toBe(schema.PLANS.start.limits.rows)
  }, 30_000)

  it('вторая оплата прибавляет дни, а не сжигает оставшиеся', async () => {
    const before = (await subs.subscriptionFor(workspaceId)).periodEnd!.getTime()
    await pay()
    const after = (await subs.subscriptionFor(workspaceId)).periodEnd!.getTime()

    expect(after - before).toBeGreaterThan(29 * DAY)
  }, 30_000)

  it('кончившийся срок возвращает бесплатный тариф, не трогая данные', async () => {
    const { eq } = await import('drizzle-orm')
    await database.db
      .update(database.subscriptions)
      .set({ periodEnd: new Date(Date.now() - DAY) })
      .where(eq(database.subscriptions.workspaceId, workspaceId))

    // Потолки узнают об этом сразу, не дожидаясь уборки.
    const quota = await (await import('../usage')).remainingFor(workspaceId)
    expect(quota.rowsLeft).toBe(schema.PLANS.free.limits.rows)

    const state = await subs.subscriptionFor(workspaceId)
    expect(state.status).toBe('ended')
    expect(state.plan.id).toBe('free')

    // Уборка приводит в порядок и сам тариф пространства.
    await subs.settleExpired(workspaceId)
    const [workspace] = await database.db
      .select({ plan: database.workspaces.plan })
      .from(database.workspaces)
      .where(eq(database.workspaces.id, workspaceId))
      .limit(1)
    expect(workspace!.plan).toBe('free')

    // Данные при этом на месте: пространство существует, участник тоже.
    const members = await database.db
      .select()
      .from(database.workspaceMembers)
      .where(eq(database.workspaceMembers.workspaceId, workspaceId))
    expect(members).toHaveLength(1)
  }, 30_000)

  it('возврат закрывает подписку и переводит на бесплатный тариф', async () => {
    const id = await pay()
    expect((await subs.subscriptionFor(workspaceId)).status).toBe('active')

    await subs.refund({ workspaceId, paymentId: id, providerAt: new Date() })

    const state = await subs.subscriptionFor(workspaceId)
    expect(state.status).toBe('refunded')
    expect(state.plan.id).toBe('free')

    const history = await subs.paymentHistory(workspaceId)
    expect(history.find((row) => row.id === id)?.status).toBe('refunded')
  }, 30_000)

  it('цена берётся из конфигурации тарифов, а не ниоткуда', () => {
    expect(subs.priceKopecks('start')).toBe(schema.PLANS.start.monthlyPrice * 100)
    expect(subs.priceKopecks('business', 3)).toBe(schema.PLANS.business.monthlyPrice * 300)
    expect(limits).toBeDefined()
  })
})
