import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Девять сценариев подписки на настоящей базе.
 *
 * Это те случаи, в которых ошибка стоит денег или доверия: продлить срок
 * дважды по одному платежу, отобрать оплаченный месяц из-за возврата другого
 * платежа, выключить пространство при понижении тарифа. Проверять такое
 * заглушками бессмысленно — защита здесь построена на условиях внутри
 * `update`, то есть на поведении Postgres.
 *
 * Без `DATABASE_URL` набор пропускается. Пространства заводятся свои
 * и удаляются после каждой проверки.
 */

const root = resolve(import.meta.dirname, '../../../../..')
const envFile = resolve(root, '.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const CONNECTED = Boolean(process.env.DATABASE_URL)
const DAY = 24 * 60 * 60 * 1000

let database: typeof import('@tableapp/db')
let schema: typeof import('@tableapp/schema')
let subs: typeof import('./subscription')
let settle: typeof import('./settle')
let usage: typeof import('../usage')
let importRun: typeof import('../import-run')

let workspaceId = ''
let userId = ''
let tableId = ''

describe.skipIf(!CONNECTED)('сценарии подписки', () => {
  beforeEach(async () => {
    database = await import('@tableapp/db')
    schema = await import('@tableapp/schema')
    subs = await import('./subscription')
    settle = await import('./settle')
    usage = await import('../usage')
    importRun = await import('../import-run')

    userId = schema.newId('user')
    workspaceId = schema.newId('workspace')
    tableId = schema.newId('table')
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    await database.db.insert(database.users).values({
      id: userId, email: `case-${stamp}@example.com`, name: 'Сценарий',
    })
    await database.db.insert(database.workspaces).values({
      id: workspaceId, name: 'Сценарий', slug: `case-${stamp}`, ownerId: userId, plan: 'free',
    })
    await database.db.insert(database.workspaceMembers).values({
      workspaceId, userId, role: 'owner', acceptedAt: new Date(),
    })
    await database.db.insert(database.tables).values({
      id: tableId, workspaceId, name: 'Данные', icon: 'table', position: 'a0',
    })
  }, 60_000)

  afterEach(async () => {
    const { eq } = await import('drizzle-orm')
    if (workspaceId) await database.db.delete(database.workspaces).where(eq(database.workspaces.id, workspaceId))
    if (userId) await database.db.delete(database.users).where(eq(database.users.id, userId))
  }, 60_000)

  /** Платёж в базе: как его заводит действие оплаты. */
  async function payment(months = 1, plan: 'start' | 'business' = 'start') {
    const id = schema.newId('payment')
    await database.db.insert(database.payments).values({
      id,
      workspaceId,
      plan,
      months,
      amount: subs.priceKopecks(plan, months),
      currency: subs.CURRENCY,
      status: 'pending',
      provider: 'test',
      providerId: `test_${id}`,
    })
    return id
  }

  /** Ответ провайдера на вопрос «что с платежом». */
  function fromGateway(id: string, patch: Partial<import('./provider').ProviderPayment> = {}) {
    return {
      providerId: `test_${id}`,
      status: 'succeeded' as const,
      confirmationUrl: null,
      amount: subs.priceKopecks('start'),
      currency: subs.CURRENCY,
      at: new Date(),
      ...patch,
    }
  }

  async function stored(id: string) {
    const { eq } = await import('drizzle-orm')
    const [row] = await database.db.select().from(database.payments).where(eq(database.payments.id, id)).limit(1)
    return row!
  }

  async function fillRows(count: number) {
    const positions = schema.positionSequence(count)
    await database.db.insert(database.rows).values(
      Array.from({ length: count }, (_, index) => ({
        id: schema.newId('row'), tableId, data: {}, position: `z${positions[index]!}`,
      })),
    )
    await usage.recountWorkspace(workspaceId)
  }

  it(
    '1. строк больше бесплатного потолка, платный срок кончился: данные целы, новое не добавить',
    async () => {
      const id = await payment()
      await settle.applyDecision(await stored(id), fromGateway(id))

      // На «Старте» 25 000 строк — наливаем больше бесплатного потолка.
      const over = schema.PLANS.free.limits.rows + 500
      await fillRows(over)

      const { eq } = await import('drizzle-orm')
      await database.db
        .update(database.subscriptions)
        .set({ periodEnd: new Date(Date.now() - DAY) })
        .where(eq(database.subscriptions.workspaceId, workspaceId))

      // Данные на месте.
      const { sql } = await import('drizzle-orm')
      const [count] = await database.db
        .select({ value: sql<number>`count(*)::int` })
        .from(database.rows)
        .where(eq(database.rows.tableId, tableId))
      expect(Number(count?.value)).toBe(over)

      // Тариф уже бесплатный, места нет.
      const quota = await usage.remainingFor(workspaceId)
      expect(quota.rowsLeft).toBe(0)

      // Новая строка не пройдёт — и скажет почему.
      const added = await importRun.runSheetImport(
        {
          runId: schema.newId('run'),
          sheet: 'Лист',
          fields: [{
            id: 'fld_src', tableId: 'tbl_src', name: 'Клиент', description: null,
            position: 'a0', type: 'text', options: {},
          }] as never,
          rows: [{ fld_src: 'ещё один' }],
          destination: { kind: 'existing', tableId, mapping: {} },
        },
        { workspaceId, userId },
      )
      expect(added.ok).toBe(false)
    },
    120_000,
  )

  it(
    '2. возврат при превышении бесплатного потолка: данные не трогаются',
    async () => {
      const id = await payment()
      await settle.applyDecision(await stored(id), fromGateway(id))

      const over = schema.PLANS.free.limits.rows + 100
      await fillRows(over)

      await settle.applyDecision(await stored(id), fromGateway(id, { status: 'refunded', refunded: subs.priceKopecks('start') }))

      const { eq, sql } = await import('drizzle-orm')
      const [count] = await database.db
        .select({ value: sql<number>`count(*)::int` })
        .from(database.rows)
        .where(eq(database.rows.tableId, tableId))

      expect(Number(count?.value), 'строки остаются').toBe(over)
      const state = await subs.subscriptionFor(workspaceId)
      expect(state.plan.id).toBe('free')
      expect(state.status).toBe('refunded')
    },
    120_000,
  )

  it('3. два платежа подряд: срок складывается', async () => {
    const first = await payment()
    await settle.applyDecision(await stored(first), fromGateway(first))
    const after1 = (await subs.subscriptionFor(workspaceId)).periodEnd!.getTime()

    const second = await payment()
    await settle.applyDecision(await stored(second), fromGateway(second))
    const after2 = (await subs.subscriptionFor(workspaceId)).periodEnd!.getTime()

    expect(after2 - after1).toBeGreaterThan(29 * DAY)
  }, 120_000)

  it(
    '4. возврат первого платежа после второго не отменяет оплаченный срок',
    async () => {
      const first = await payment()
      await settle.applyDecision(await stored(first), fromGateway(first))
      const second = await payment()
      await settle.applyDecision(await stored(second), fromGateway(second))

      const before = (await subs.subscriptionFor(workspaceId)).periodEnd!.getTime()
      await settle.applyDecision(await stored(first), fromGateway(first, { status: 'refunded', refunded: subs.priceKopecks('start') }))

      const state = await subs.subscriptionFor(workspaceId)
      expect(state.status, 'второй платёж всё ещё в силе').toBe('active')
      expect(state.plan.id).toBe('start')
      // Вернули ровно один месяц.
      expect(before - state.periodEnd!.getTime()).toBeCloseTo(30 * DAY, -4)

      const history = await subs.paymentHistory(workspaceId)
      expect(history.find((row) => row.id === first)?.status).toBe('refunded')
      expect(history.find((row) => row.id === second)?.status).toBe('succeeded')
    },
    120_000,
  )

  it('5. повторное уведомление об оплате и о возврате ничего не меняет', async () => {
    const id = await payment()
    await settle.applyDecision(await stored(id), fromGateway(id))
    const once = (await subs.subscriptionFor(workspaceId)).periodEnd!.getTime()

    const again = await settle.applyDecision(await stored(id), fromGateway(id))
    expect(again.ok && again.applied).toBe('nothing')
    expect((await subs.subscriptionFor(workspaceId)).periodEnd!.getTime()).toBe(once)

    await settle.applyDecision(await stored(id), fromGateway(id, { status: 'refunded', refunded: subs.priceKopecks('start') }))
    const back = await settle.applyDecision(await stored(id), fromGateway(id, { status: 'refunded', refunded: subs.priceKopecks('start') }))
    expect(back.ok && back.applied).toBe('nothing')
  }, 120_000)

  it('6. уведомления в обратном порядке: опоздавшая отмена не рушит оплату', async () => {
    const id = await payment()
    const paidAt = new Date()
    await settle.applyDecision(await stored(id), fromGateway(id, { at: paidAt }))

    const late = await settle.applyDecision(
      await stored(id),
      fromGateway(id, { status: 'canceled', at: new Date(paidAt.getTime() - 60_000) }),
    )

    expect(late.ok && late.applied).toBe('nothing')
    expect((await subs.subscriptionFor(workspaceId)).status).toBe('active')
    expect((await stored(id)).status).toBe('succeeded')
  }, 120_000)

  it('7. одновременная обработка одного платежа продлевает срок один раз', async () => {
    const id = await payment()
    const record = await stored(id)
    const truth = fromGateway(id)

    const [left, right] = await Promise.all([
      settle.applyDecision(record, truth),
      settle.applyDecision(record, truth),
    ])

    const applied = [left, right].filter((r) => r.ok && r.applied === 'activated')
    expect(applied, 'засчитать платёж должен ровно один запрос').toHaveLength(1)

    const end = (await subs.subscriptionFor(workspaceId)).periodEnd!.getTime()
    expect(end - Date.now()).toBeLessThan(31 * DAY)
  }, 120_000)

  it('8. неуспешный платёж не трогает действующую подписку', async () => {
    const good = await payment()
    await settle.applyDecision(await stored(good), fromGateway(good))
    const end = (await subs.subscriptionFor(workspaceId)).periodEnd!.getTime()

    const bad = await payment()
    const result = await settle.applyDecision(await stored(bad), fromGateway(bad, { status: 'canceled' }))

    expect(result.ok && result.applied).toBe('canceled')
    const state = await subs.subscriptionFor(workspaceId)
    expect(state.status).toBe('active')
    expect(state.periodEnd!.getTime()).toBe(end)
    expect((await stored(bad)).status).toBe('canceled')
  }, 120_000)

  it('9. частичный возврат не поддерживается и подписку не трогает', async () => {
    const id = await payment()
    await settle.applyDecision(await stored(id), fromGateway(id))
    const end = (await subs.subscriptionFor(workspaceId)).periodEnd!.getTime()

    const part = await settle.applyDecision(
      await stored(id),
      fromGateway(id, { status: 'succeeded', refunded: Math.round(subs.priceKopecks('start') / 2) }),
    )

    expect(part.ok).toBe(false)
    if (!part.ok) expect(part.reason).toBe('partial_refund')

    const state = await subs.subscriptionFor(workspaceId)
    expect(state.status, 'подписка остаётся как была').toBe('active')
    expect(state.periodEnd!.getTime()).toBe(end)
    expect((await stored(id)).status).toBe('succeeded')
  }, 120_000)
})
