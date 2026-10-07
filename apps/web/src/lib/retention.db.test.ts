import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Уборка технических журналов.
 *
 * Проверяется то, из-за чего уборку боятся запускать: что она не трогает
 * свежее, не удаляет категорию без согласованного срока, не запускается
 * дважды одновременно и не заходит в документы — платежи и журнал изменений
 * строк.
 *
 * Данные синтетические и свои: записи помечены собственным адресом,
 * в конце удаляются. Чужие журналы не трогаются.
 */

const root = resolve(import.meta.dirname, '../../../..')
const envFile = resolve(root, '.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const CONNECTED = Boolean(process.env.DATABASE_URL)
const DAY = 24 * 60 * 60 * 1000

let database: typeof import('@tableapp/db')
let schema: typeof import('@tableapp/schema')
let retention: typeof import('./retention')
let mark = ''

describe.skipIf(!CONNECTED)('уборка журналов', () => {
  beforeEach(async () => {
    database = await import('@tableapp/db')
    schema = await import('@tableapp/schema')
    retention = await import('./retention')
    mark = `retention-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
  }, 30_000)

  afterEach(async () => {
    const { like } = await import('drizzle-orm')
    await database.db.delete(database.authEvents).where(like(database.authEvents.email, 'retention-%'))
  }, 30_000)

  async function addEvents(ages: number[]) {
    await database.db.insert(database.authEvents).values(
      ages.map((days) => ({
        id: schema.newId('event'),
        email: mark,
        kind: 'code_sent',
        circuit: 'member',
        ip: '127.0.0.1',
        userAgent: 'проверка',
        createdAt: new Date(Date.now() - days * DAY),
      })),
    )
  }

  async function mine(): Promise<number> {
    const { eq, sql } = await import('drizzle-orm')
    const rows = await database.db
      .select({ value: sql<number>`count(*)::int` })
      .from(database.authEvents)
      .where(eq(database.authEvents.email, mark))
    return Number(rows[0]?.value ?? 0)
  }

  it('без согласованного срока не удаляет ничего', async () => {
    await addEvents([400, 200, 1])

    const category = retention.categoryOf('auth_events')
    expect(category.keepDays, 'срок записей о входах пока не выбран владельцем').toBeNull()

    const result = await retention.purge('auth_events')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no_period')
    expect(await mine()).toBe(3)
  }, 60_000)

  it('предпросмотр считает устаревшее и ничего не меняет', async () => {
    await addEvents([400, 200, 1])

    // Срок задаём на время проверки: в продукте его выбирает владелец.
    const category = retention.categoryOf('auth_events')
    const was = category.keepDays
    category.keepDays = 90
    try {
      const state = await retention.preview('auth_events')
      expect(state.boundary).toBeInstanceOf(Date)
      expect(state.older).toBeGreaterThanOrEqual(2)
      expect(await mine(), 'предпросмотр не удаляет').toBe(3)
    } finally {
      category.keepDays = was
    }
  }, 60_000)

  it('удаляет только то, что старше границы, и пачками', async () => {
    await addEvents([400, 200, 120, 10, 1])

    const category = retention.categoryOf('auth_events')
    const was = category.keepDays
    category.keepDays = 90
    try {
      const result = await retention.purge('auth_events', { batch: 2 })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      // Три записи старше девяноста дней ушли, две свежие остались.
      expect(await mine()).toBe(2)
      expect(result.deleted).toBeGreaterThanOrEqual(3)
      expect(result.boundary.getTime()).toBeLessThan(Date.now())
    } finally {
      category.keepDays = was
    }
  }, 60_000)

  /*
   * Про два одновременных запуска.
   *
   * Запустить `purge` дважды через `Promise.all` — проверка не замка,
   * а случая: postgres.js складывает запросы в одно соединение и выполняет
   * их по очереди, так что второй запуск начинается уже после первого
   * и честно находит замок свободным. Поэтому замок держим снаружи,
   * на отдельном соединении, и смотрим, что уборка на него смотрит.
   */
  it('занятый замок останавливает уборку, записи остаются', async () => {
    const category = retention.categoryOf('auth_events')
    const was = category.keepDays
    category.keepDays = 90
    const other = await database.sql.reserve()
    try {
      await addEvents([400, 300, 200])
      await other`select pg_advisory_lock(hashtext('retention:auth_events'))`

      const result = await retention.purge('auth_events')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('busy')
      expect(await mine(), 'ни одна запись не удалена').toBe(3)
    } finally {
      await other`select pg_advisory_unlock(hashtext('retention:auth_events'))`
      other.release()
      category.keepDays = was
    }
  }, 60_000)

  it('после уборки замок отпущен, а не висит на соединении из пула', async () => {
    const category = retention.categoryOf('auth_events')
    const was = category.keepDays
    category.keepDays = 90
    const other = await database.sql.reserve()
    try {
      await addEvents([400, 1])
      const result = await retention.purge('auth_events')
      expect(result.ok).toBe(true)

      /*
       * Замок берём со стороны: если уборка сняла его не в том соединении,
       * в котором брала, он остался бы висеть и здесь было бы `false`.
       */
      const free = await other`select pg_try_advisory_lock(hashtext('retention:auth_events')) as locked`
      expect(free[0]?.locked, 'замок свободен').toBe(true)
      await other`select pg_advisory_unlock(hashtext('retention:auth_events'))`
    } finally {
      other.release()
      category.keepDays = was
    }
  }, 60_000)

  it('документы в список уборки не входят', () => {
    /*
     * Платежи — бухгалтерия, `row_changes` отвечает на вопрос «кто это
     * поменял». Смешивать их с журналом входов нельзя, поэтому их нет
     * даже как варианта.
     */
    const keys = retention.CATEGORIES.map((item) => item.key)
    expect(keys).not.toContain('payments')
    expect(keys).not.toContain('subscriptions')
    expect(keys).not.toContain('row_changes')
  })
})
