import {
  appUsers,
  apps,
  attachments,
  db,
  rows as rowsTable,
  tables,
  workspaceUsage,
  workspaces,
} from '@tableapp/db'
import type { Plan, UsageKind } from '@tableapp/schema'
import { activePlan } from './plan'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Transaction } from './db-transaction'

/**
 * Сколько пространство расходует.
 *
 * Считается **на пространство целиком**, а не по таблице и не по приложению:
 * человек покупает место для своего дела, а не квоту на каждую сущность.
 *
 * Здесь одно место, которое знает, как считать. Это выбор, и вот его причина.
 * Строки появляются в шести местах — сетка владельца, вставка пачкой,
 * офлайн-очередь, импорт, шаблон и запись из приложения, — и удаляются
 * в четырёх. Держать инкремент в каждом значит иметь десять шансов забыть,
 * а разошедшийся счётчик хуже пересчитанного: он показывает неправду
 * и не жалуется.
 *
 * Поэтому — полный пересчёт, а снимок в базе нужен, чтобы будущая проверка
 * тарифа не считала всё заново на каждой вставке: далеко от потолка верим
 * снимку, близко — пересчитываем начисто и решаем точно.
 *
 * Служебные сущности в расход не входят, и не потому, что их кто-то помнит
 * исключить: счёт идёт по `rows` через `tables` к пространству, а сессии,
 * журнал изменений, события входа, очередь мутаций и отложенные заявки лежат
 * в своих таблицах и до этого запроса не доходят.
 */

export type Usage = {
  rows: number
  tables: number
  publishedApps: number
  fileBytes: number
  /** Для статистики. На стоимость не влияет и влиять не должен. */
  appUsers: number
  countedAt: Date
}

export type TableUsage = { id: string; name: string; rows: number }

const EMPTY: Omit<Usage, 'countedAt'> = {
  rows: 0,
  tables: 0,
  publishedApps: 0,
  fileBytes: 0,
  appUsers: 0,
}

/** Насколько старым снимком готовы пользоваться там, где точность не нужна. */
export const USAGE_MAX_AGE_MS = 5 * 60 * 1000

function count(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Полный пересчёт. Единственное место, которое знает, что считать.
 *
 * Четыре запроса вместо одного с четырьмя подзапросами: так каждый из них
 * идёт по своему индексу, и план запроса читается глазами. Их немного,
 * и выполняются они не на каждое действие человека.
 */
export async function recountWorkspace(workspaceId: string, tx?: Transaction): Promise<Usage> {
  if (!tx) return db.transaction((transaction) => recountWorkspace(workspaceId, transaction))
  // Lock BEFORE counting: a reservation and its rows must commit together,
  // and a recount must not overwrite the counter with a pre-lock snapshot.
  await tx.insert(workspaceUsage).values({ workspaceId, ...EMPTY, countedAt: new Date() }).onConflictDoNothing()
  await tx.select({ id: workspaceUsage.workspaceId }).from(workspaceUsage)
    .where(eq(workspaceUsage.workspaceId, workspaceId)).for('update')
  const [rowCount, tableCount, appCount, fileSize, userCount] = await Promise.all([
    /*
     * Удалённые в корзину не считаем: строка, которую человек убрал, место
     * ещё занимает, но продавать ему это место значит брать деньги за то,
     * от чего он уже отказался.
     */
    tx
      .select({ value: sql<number>`count(*)::int` })
      .from(rowsTable)
      .innerJoin(tables, eq(tables.id, rowsTable.tableId))
      .where(and(eq(tables.workspaceId, workspaceId), isNull(rowsTable.deletedAt))),

    tx
      .select({ value: sql<number>`count(*)::int` })
      .from(tables)
      .where(eq(tables.workspaceId, workspaceId)),

    // Черновик потолок не расходует: пока приложение не опубликовано,
    // им никто не пользуется, и платить за него не за что.
    tx
      .select({ value: sql<number>`count(*)::int` })
      .from(apps)
      .where(and(eq(apps.workspaceId, workspaceId), isNotNull(apps.published))),

    // Pending and unbound objects consume storage until cleanup removes them.
    tx
      .select({ value: sql<number>`coalesce(sum(${attachments.size}), 0)::bigint` })
      .from(attachments)
      .where(eq(attachments.workspaceId, workspaceId)),

    tx
      .select({ value: sql<number>`count(*)::int` })
      .from(appUsers)
      .innerJoin(apps, eq(apps.id, appUsers.appId))
      .where(eq(apps.workspaceId, workspaceId)),
  ])

  const usage: Usage = {
    rows: count(rowCount[0]?.value),
    tables: count(tableCount[0]?.value),
    publishedApps: count(appCount[0]?.value),
    fileBytes: count(fileSize[0]?.value),
    appUsers: count(userCount[0]?.value),
    countedAt: new Date(),
  }

  await tx
    .insert(workspaceUsage)
    .values({ workspaceId, ...usage })
    .onConflictDoUpdate({ target: workspaceUsage.workspaceId, set: usage })

  return usage
}

/** Caller holds the workspace usage lock; repair legacy counters before an upload. */
export async function recountFileBytes(workspaceId: string, tx: Transaction): Promise<void> {
  const [size] = await tx.select({ value: sql<number>`coalesce(sum(${attachments.size}), 0)::bigint` })
    .from(attachments).where(eq(attachments.workspaceId, workspaceId))
  await tx.update(workspaceUsage).set({ fileBytes: count(size?.value) })
    .where(eq(workspaceUsage.workspaceId, workspaceId))
}

/**
 * Расход пространства.
 *
 * `maxAgeMs: 0` означает «пересчитать сейчас» — так делает страница расхода
 * и так будет делать проверка тарифа рядом с потолком. Со снимком работают
 * там, где неточность в несколько минут ничего не решает.
 */
export async function usageFor(
  workspaceId: string,
  { maxAgeMs = USAGE_MAX_AGE_MS }: { maxAgeMs?: number } = {},
): Promise<Usage> {
  if (maxAgeMs <= 0) return recountWorkspace(workspaceId)

  const [stored] = await db
    .select()
    .from(workspaceUsage)
    .where(eq(workspaceUsage.workspaceId, workspaceId))
    .limit(1)

  if (!stored) return recountWorkspace(workspaceId)
  if (Date.now() - stored.countedAt.getTime() > maxAgeMs) return recountWorkspace(workspaceId)

  return {
    rows: stored.rows,
    tables: stored.tables,
    publishedApps: stored.publishedApps,
    fileBytes: stored.fileBytes,
    appUsers: stored.appUsers,
    countedAt: stored.countedAt,
  }
}

/**
 * Пересчёт после того, что меняет расход пачкой.
 *
 * Зовётся после импорта и разворачивания шаблона. Ошибку глушим намеренно:
 * импорт уже прошёл, строки на месте, и уронить его отчёт из-за счётчика —
 * значит сказать человеку, что не получилось, когда получилось. Снимок
 * поправится при следующем открытии страницы расхода.
 */
export async function noteBulkChange(workspaceId: string): Promise<void> {
  try {
    await recountWorkspace(workspaceId)
  } catch (error) {
    console.error('[usage] не удалось пересчитать расход', { workspaceId, error })
  }
}

/**
 * Сколько ещё поместится.
 *
 * Нужно там, где человеку показывают сводку до действия: импорт книги
 * из пяти листов должен сказать заранее, что все пять не влезут, а не
 * остановиться на третьем. Это **не разрешение**: место занимает проверка
 * тарифа в момент записи, и она же остаётся последним словом.
 */
export async function remainingFor(workspaceId: string): Promise<{ rowsLeft: number; tablesLeft: number }> {
  const [plan, usage] = await Promise.all([activePlan(workspaceId), recountWorkspace(workspaceId)])

  return {
    rowsLeft: Math.max(plan.limits.rows - usage.rows, 0),
    tablesLeft: Math.max(plan.limits.tables - usage.tables, 0),
  }
}

export type WorkspacePlan = { plan: Plan; usage: Usage; byTable: TableUsage[] }

/**
 * Всё, что нужно странице расхода: тариф, числа и разбивка по таблицам.
 *
 * Разбивка отвечает на единственный вопрос, который человек задаёт, увидев
 * «74%»: а что именно столько занимает. Без неё остаётся только гадать,
 * что удалять.
 */
export async function workspaceUsageReport(workspaceId: string): Promise<WorkspacePlan> {
  const [usage, byTable] = await Promise.all([
    recountWorkspace(workspaceId),
    db
      .select({
        id: tables.id,
        name: tables.name,
        rows: sql<number>`count(${rowsTable.id})::int`,
      })
      .from(tables)
      .leftJoin(
        rowsTable,
        and(eq(rowsTable.tableId, tables.id), isNull(rowsTable.deletedAt)),
      )
      .where(eq(tables.workspaceId, workspaceId))
      .groupBy(tables.id, tables.name)
      .orderBy(sql`count(${rowsTable.id}) desc`),
  ])

  return {
    plan: await activePlan(workspaceId),
    usage,
    byTable: byTable.map((row) => ({ ...row, rows: count(row.rows) })),
  }
}

/**
 * Занять место — проверив и заняв одним действием.
 *
 * Это и есть ответ на гонку. Раньше проверка и запись были двумя шагами:
 * два запроса при 1999 из 2000 оба читали 1999, оба видели «место есть»
 * и оба вставляли строку. Теперь условие живёт внутри `update`, и Postgres
 * сам блокирует строку счётчика: второй запрос дождётся первого и увидит
 * уже 2000.
 *
 * Возвращает `null`, когда не поместилось **или** снимка ещё нет. Разбирать
 * эти случаи здесь нечем — и не нужно: вызывающий пересчитывает начисто
 * и пробует ещё раз. Так же лечится и расхождение счётчика: если он уехал
 * вверх из-за пропущенного уменьшения, первый же отказ приводит к пересчёту,
 * и человек получает верный ответ, а не ложный запрет.
 *
 * Внутри транзакции вызывающего бронь откатывается вместе с ней: строка
 * не записалась — место не занято.
 */
const COLUMN: Record<UsageKind, string> = {
  rows: 'rows',
  tables: 'tables',
  publishedApps: 'published_apps',
  fileBytes: 'file_bytes',
} as const

function columnOf(resource: UsageKind) {
  return sql.raw(COLUMN[resource])
}

/** Транзакция вызывающего или сама база: бронь работает и так, и так. */
export type Runner = Pick<typeof db, 'execute'>

function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  const rows = (result as { rows?: unknown }).rows
  return Array.isArray(rows) ? rows : []
}

export async function reserve(
  runner: Runner,
  workspaceId: string,
  resource: UsageKind,
  amount: number,
  ceiling: number,
): Promise<number | null> {
  const column = columnOf(resource)
  const result = await runner.execute(sql`
    update workspace_usage
       set ${column} = ${column} + ${amount}
     where workspace_id = ${workspaceId}
       and ${column} + ${amount} <= ${ceiling}
    returning ${column} as used
  `)

  const [row] = rowsOf(result) as { used?: unknown }[]
  return row ? count(row.used) : null
}

/**
 * Освободить место.
 *
 * Зовётся при удалении. Ниже нуля не опускаемся: отрицательный счётчик
 * означал бы, что кто-то освободил больше, чем занимал, и дальше он врал бы
 * в пользу превышения — то есть в сторону, которую владелец не заметит.
 */
export async function release(
  runner: Runner,
  workspaceId: string,
  resource: UsageKind,
  amount: number,
): Promise<void> {
  const column = columnOf(resource)
  await runner.execute(sql`
    update workspace_usage
       set ${column} = greatest(${column} - ${amount}, 0)
     where workspace_id = ${workspaceId}
  `)
}

/** Пустой расход: у пространства без единой таблицы считать нечего. */
export const NO_USAGE: Usage = { ...EMPTY, countedAt: new Date(0) }
