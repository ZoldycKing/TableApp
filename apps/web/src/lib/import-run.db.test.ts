import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Импорт под нагрузкой.
 *
 * Эти проверки идут по настоящей базе, потому что проверять здесь нечего,
 * если не запускать два запроса одновременно: уникальный ключ, блокировка
 * на индексе и занятие места в тарифе — всё это поведение Postgres, а не
 * нашего кода, и подменить его заглушкой значит проверить заглушку.
 *
 * Без `DATABASE_URL` набор пропускается: на машине без поднятой базы он
 * обязан молчать, а не падать.
 *
 * Данные свои: отдельное пространство заводится в начале и удаляется
 * в конце. Чужие таблицы не трогаются.
 */

const root = resolve(import.meta.dirname, '../../../..')
const envFile = resolve(root, '.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const CONNECTED = Boolean(process.env.DATABASE_URL)

type Db = typeof import('@tableapp/db')
type Run = typeof import('./import-run')
type Schema = typeof import('@tableapp/schema')

let database: Db
let runner: Run
let schema: Schema
let workspaceId = ''
let userId = ''

/** Колонки «как из файла»: разбор уже сделан, сюда приходит готовое. */
function sheet(count: number, prefix: string) {
  const fieldId = 'fld_source_name'
  return {
    fields: [
      {
        id: fieldId,
        tableId: 'tbl_source',
        name: 'Клиент',
        description: null,
        position: 'a0',
        type: 'text',
        options: {},
      },
    ] as never,
    rows: Array.from({ length: count }, (_, index) => ({ [fieldId]: `${prefix} ${index + 1}` })),
  }
}

describe.skipIf(!CONNECTED)('импорт листа под нагрузкой', () => {
  beforeAll(async () => {
    database = await import('@tableapp/db')
    runner = await import('./import-run')
    schema = await import('@tableapp/schema')

    userId = schema.newId('user')
    workspaceId = schema.newId('workspace')

    await database.db.insert(database.users).values({
      id: userId,
      email: `import-load-${Date.now()}@example.com`,
      name: 'Проверка импорта',
    })
    await database.db.insert(database.workspaces).values({
      id: workspaceId,
      name: 'Проверка импорта',
      slug: `import-load-${Date.now()}`,
      ownerId: userId,
      plan: 'free',
    })
    await database.db.insert(database.workspaceMembers).values({
      workspaceId,
      userId,
      role: 'owner',
      acceptedAt: new Date(),
    })
  }, 30_000)

  afterAll(async () => {
    if (!workspaceId) return
    const { db, workspaces, users } = database
    const { eq } = await import('drizzle-orm')
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId))
    await db.delete(users).where(eq(users.id, userId))
  }, 30_000)

  it(
    'два одновременных запроса одного листа дают одну таблицу, а не две',
    async () => {
      const runId = schema.newId('run')
      const data = sheet(3, 'Клиент')

      const [first, second] = await Promise.all([
        runner.runSheetImport(
          { runId, sheet: 'Продажи', ...data, destination: { kind: 'new', name: 'Продажи' } },
          { workspaceId, userId },
        ),
        runner.runSheetImport(
          { runId, sheet: 'Продажи', ...data, destination: { kind: 'new', name: 'Продажи' } },
          { workspaceId, userId },
        ),
      ])

      expect(first.ok && second.ok, 'оба запроса должны ответить без ошибки').toBe(true)
      if (!first.ok || !second.ok) return

      // Ровно один из двух записал, второй узнал о первом и ничего не создал.
      expect([first.repeat, second.repeat].filter(Boolean)).toHaveLength(1)
      expect(first.tableId).toBe(second.tableId)
      expect(first.added).toBe(3)
      expect(second.added).toBe(3)

      const { db, tables, rows } = database
      const { eq, and, isNull } = await import('drizzle-orm')
      const made = await db.select().from(tables).where(eq(tables.workspaceId, workspaceId))
      expect(made, 'таблица должна быть одна').toHaveLength(1)

      const written = await db
        .select()
        .from(rows)
        .where(and(eq(rows.tableId, made[0]!.id), isNull(rows.deletedAt)))
      expect(written, 'строк ровно столько, сколько в листе').toHaveLength(3)
    },
    60_000,
  )

  it(
    'при нехватке места проходит один импорт, второй отказывает и ничего не оставляет',
    async () => {
      const { db, tables, rows, workspaceUsage } = database
      const { eq, and, isNull, sql } = await import('drizzle-orm')

      // Доводим пространство почти до потолка бесплатного тарифа настоящими
      // строками: подделанный счётчик не годится — отказ пересчитывает расход
      // начисто и увидел бы правду.
      const limit = schema.PLANS.free.limits.rows
      const first = await db
        .select({ id: tables.id })
        .from(tables)
        .where(eq(tables.workspaceId, workspaceId))
        .limit(1)
      const tableId = first[0]!.id

      const [counted] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(rows)
        .innerJoin(tables, eq(tables.id, rows.tableId))
        .where(and(eq(tables.workspaceId, workspaceId), isNull(rows.deletedAt)))

      const filler = limit - Number(counted?.value ?? 0) - 2
      const positions = schema.positionSequence(filler)
      await db.insert(rows).values(
        Array.from({ length: filler }, (_, index) => ({
          id: schema.newId('row'),
          tableId,
          data: {},
          position: `z${positions[index]!}`,
        })),
      )

      // Счётчик расхода обновляем, как это делает любая настоящая запись:
      // строки мы вставили в обход учёта, и без пересчёта снимок врал бы.
      const { recountWorkspace } = await import('./usage')
      await recountWorkspace(workspaceId)

      const data = sheet(2, 'Поздний клиент')
      const [left, right] = await Promise.all([
        runner.runSheetImport(
          { runId: schema.newId('run'), sheet: 'Левый', ...data, destination: { kind: 'new', name: 'Левый' } },
          { workspaceId, userId },
        ),
        runner.runSheetImport(
          { runId: schema.newId('run'), sheet: 'Правый', ...data, destination: { kind: 'new', name: 'Правый' } },
          { workspaceId, userId },
        ),
      ])

      const passed = [left, right].filter((result) => result.ok)
      const refused = [left, right].filter((result) => !result.ok)
      expect(passed, 'место осталось ровно под один лист').toHaveLength(1)
      expect(refused).toHaveLength(1)
      expect(refused[0]!.ok ? '' : refused[0]!.error).toMatch(/строк/i)

      // Отказ не оставляет ни таблицы, ни занятого места.
      const after = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(rows)
        .innerJoin(tables, eq(tables.id, rows.tableId))
        .where(and(eq(tables.workspaceId, workspaceId), isNull(rows.deletedAt)))
      expect(Number(after[0]?.value)).toBe(limit)

      const [usage] = await db
        .select()
        .from(workspaceUsage)
        .where(eq(workspaceUsage.workspaceId, workspaceId))
      expect(usage?.rows, 'счётчик не должен держать место под то, что не записалось').toBe(limit)

      const tablesNow = await db.select().from(tables).where(eq(tables.workspaceId, workspaceId))
      expect(tablesNow, 'таблица отказавшего листа не создаётся').toHaveLength(2)
    },
    120_000,
  )

  it(
    'повтор после отказа по месту проходит, когда место освободилось',
    async () => {
      const { db, tables, rows } = database
      const { eq, inArray } = await import('drizzle-orm')

      const runId = schema.newId('run')
      const data = sheet(2, 'После уборки')
      const plan = {
        runId,
        sheet: 'Повтор',
        ...data,
        destination: { kind: 'new' as const, name: 'Повтор' },
      }

      const refused = await runner.runSheetImport(plan, { workspaceId, userId })
      expect(refused.ok, 'места не осталось — отказ ожидаем').toBe(false)

      // Освобождаем место: удаляем десяток строк-заполнителей.
      const spare = await db
        .select({ id: rows.id })
        .from(rows)
        .innerJoin(tables, eq(tables.id, rows.tableId))
        .where(eq(tables.workspaceId, workspaceId))
        .limit(10)
      await db.delete(rows).where(inArray(rows.id, spare.map((row) => row.id)))

      const again = await runner.runSheetImport(plan, { workspaceId, userId })
      expect(again.ok, 'тот же ключ запуска после отказа обязан пройти').toBe(true)
      if (!again.ok) return
      expect(again.repeat).toBe(false)
      expect(again.added).toBe(2)
    },
    120_000,
  )
})
