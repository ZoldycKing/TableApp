import { authEvents, db, importRuns, mutations, sessions, sql as pool, staffSessions } from '@tableapp/db'
import { lt, sql } from 'drizzle-orm'

/**
 * Хранение журналов.
 *
 * Что здесь есть и чего намеренно нет.
 *
 * **Есть** — технические журналы: записи о входах, применённые правки
 * из очереди устройств, ключи повторов импорта, протухшие сессии. Они растут
 * от работы сервиса, никому не принадлежат и однажды займут больше места,
 * чем сами данные.
 *
 * **Нет** — платежей, подписок и журнала изменений строк. Это не технический
 * шум: платежи — документы бухгалтерии, а `row_changes` отвечает на вопрос
 * «кто и когда это поменял», ради которого его и ведут. Смешивать их
 * с журналом входов нельзя, поэтому их здесь нет даже как варианта.
 *
 * **Сроки не выбраны.** `keepDays: null` означает, что решения владельца
 * ещё нет, и уборка такой категории отказывается работать. Произвольное
 * число здесь было бы хуже пустоты: оно выглядело бы как согласованная
 * политика.
 *
 * Про закон: общего требования к обычному сервису хранить журналы входов
 * какой-то срок в законодательстве РФ нет. Если же сервис будет признан
 * организатором распространения информации (149-ФЗ, ст. 10.1), требования
 * другие и жёсткие — уведомление Роскомнадзора, хранение сведений
 * о регистрации и авторизации на территории РФ (с 1 января 2026 года —
 * три года). Относится ли это к TableApp, решает юрист, а не этот модуль.
 */

export type CategoryKey = 'auth_events' | 'mutations' | 'import_runs' | 'expired_sessions'

export type Category = {
  key: CategoryKey
  /** Что лежит внутри — человеческими словами, для отчёта и подтверждения. */
  what: string
  /** Сколько дней хранить. `null` — срок не согласован, уборка не работает. */
  keepDays: number | null
}

/**
 * Категории и сроки.
 *
 * Менять `keepDays` здесь — и есть то решение, которое принимает владелец.
 * Пока везде `null`, кроме протухших сессий: их срок уже задан продуктом —
 * сессия живёт тридцать дней, и запись о ней после этого не значит ничего.
 */
export const CATEGORIES: Category[] = [
  {
    key: 'auth_events',
    what: 'записи о входах: время, адрес, браузер, чем кончилась попытка',
    keepDays: null,
  },
  {
    key: 'mutations',
    what: 'применённые правки из очереди устройств: что и когда записал телефон',
    keepDays: null,
  },
  {
    key: 'import_runs',
    what: 'ключи повторов импорта: по ним повторный запрос не задваивает данные',
    keepDays: null,
  },
  {
    key: 'expired_sessions',
    what: 'сессии, срок которых кончился: войти по ним уже нельзя',
    keepDays: 30,
  },
]

export function categoryOf(key: CategoryKey): Category {
  const found = CATEGORIES.find((item) => item.key === key)
  if (!found) throw new Error(`Неизвестная категория журналов: ${key}`)
  return found
}

/** Граница: всё, что старше, подлежит уборке. */
export function boundaryFor(category: Category, now = new Date()): Date | null {
  if (category.keepDays === null) return null
  return new Date(now.getTime() - category.keepDays * 24 * 60 * 60 * 1000)
}

export type Preview = {
  key: CategoryKey
  what: string
  keepDays: number | null
  boundary: Date | null
  total: number
  older: number
}

/** Сколько записей всего и сколько из них старше границы. Ничего не меняет. */
export async function preview(key: CategoryKey, now = new Date()): Promise<Preview> {
  const category = categoryOf(key)
  const boundary = boundaryFor(category, now)

  const totals = rowsOf<{ total: number }>(
    await db.execute(sql`select count(*)::int as total from ${table(key)}`),
  )
  const total = Number(totals[0]?.total ?? 0)

  if (!boundary) {
    return { key, what: category.what, keepDays: null, boundary: null, total, older: 0 }
  }

  const olders = rowsOf<{ older: number }>(
    await db.execute(
      sql`select count(*)::int as older from ${table(key)} where ${column(key)} < ${boundary.toISOString()}::timestamptz`,
    ),
  )
  const older = Number(olders[0]?.older ?? 0)

  return { key, what: category.what, keepDays: category.keepDays, boundary, total, older }
}

export type Purge =
  | { ok: true; key: CategoryKey; deleted: number; boundary: Date }
  | { ok: false; key: CategoryKey; reason: 'no_period' | 'busy' }

/**
 * Где физически лежит категория.
 *
 * Имена таблиц и столбцов нужны отдельно от описаний Drizzle: уборка работает
 * на закреплённом соединении (см. `purge`), а не через `db`, и собирает
 * запрос сама. Значения здесь — внутренние постоянные строки, снаружи в них
 * ничего не попадает.
 */
const PLACES: Record<CategoryKey, { table: string; column: string }> = {
  auth_events: { table: 'auth_events', column: 'created_at' },
  mutations: { table: 'mutations', column: 'applied_at' },
  import_runs: { table: 'import_runs', column: 'created_at' },
  expired_sessions: { table: 'sessions', column: 'expires_at' },
}

/**
 * Уборка.
 *
 * Четыре предосторожности, и каждая из них — про «не удалить лишнего»:
 *
 * 1. Нет согласованного срока — ничего не удаляем вовсе.
 * 2. Удаляем пачками и только то, что старше границы; граница считается
 *    один раз в начале, чтобы долгая уборка не поползла вперёд во времени
 *    и не задела свежие записи.
 * 3. Один запуск за раз: `pg_try_advisory_lock` отсекает второй, запущенный
 *    по ошибке из соседнего окна или по расписанию внахлёст.
 * 4. Весь запуск идёт по одному закреплённому соединению.
 *
 * Последнее — не тонкость, а условие, без которого третья предосторожность
 * не работает. Замок в Postgres принадлежит соединению, а запросы раздаются
 * из пула: замок можно взять на одном соединении, а снять попытаться
 * на другом — там снимать нечего, и замок висит до конца жизни первого
 * соединения. Дальше хуже: в своём соединении замок повторно входим,
 * поэтому следующий запуск, которому досталось то самое соединение, получит
 * «свободно» и пойдёт удалять вторым. `reserve()` закрепляет одно соединение
 * на весь запуск: замок, удаления и снятие замка происходят в одной сессии.
 */
export async function purge(
  key: CategoryKey,
  { batch = 1_000, max = 100_000, now = new Date() }: { batch?: number; max?: number; now?: Date } = {},
): Promise<Purge> {
  const category = categoryOf(key)
  const boundary = boundaryFor(category, now)
  if (!boundary) return { ok: false, key, reason: 'no_period' }

  const place = PLACES[key]
  const name = `retention:${key}`
  const held = await pool.reserve()

  try {
    const locks = await held`select pg_try_advisory_lock(hashtext(${name})) as locked`
    if (!locks[0]?.locked) return { ok: false, key, reason: 'busy' }

    try {
      let deleted = 0
      for (;;) {
        const removed = await held.unsafe(
          `delete from ${place.table}
             where ctid in (
               select ctid from ${place.table}
               where ${place.column} < $1::timestamptz
               limit $2
             )
           returning 1 as one`,
          [boundary.toISOString(), batch],
        )

        deleted += removed.length
        if (removed.length < batch || deleted >= max) break
      }
      return { ok: true, key, deleted, boundary }
    } finally {
      await held`select pg_advisory_unlock(hashtext(${name}))`
    }
  } finally {
    held.release()
  }
}

/** Таблица категории. Отдельной функцией, чтобы имя писалось один раз. */
function table(key: CategoryKey) {
  switch (key) {
    case 'auth_events':
      return authEvents
    case 'mutations':
      return mutations
    case 'import_runs':
      return importRuns
    case 'expired_sessions':
      return sessions
  }
}

/** По какому столбцу считается возраст записи. */
function column(key: CategoryKey) {
  switch (key) {
    case 'auth_events':
      return authEvents.createdAt
    case 'mutations':
      return mutations.appliedAt
    case 'import_runs':
      return importRuns.createdAt
    // У сессии возраст считается по сроку действия: протухшая сессия
    // бесполезна с этого мгновения, когда бы её ни завели.
    case 'expired_sessions':
      return sessions.expiresAt
  }
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown }).rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

/** Сессии сотрудников живут отдельной таблицей и убираются тем же правилом. */
export async function purgeStaffSessions(
  { now = new Date(), keepDays = 30 }: { now?: Date; keepDays?: number } = {},
): Promise<number> {
  const boundary = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000)
  const removed = await db
    .delete(staffSessions)
    .where(lt(staffSessions.expiresAt, boundary))
    .returning({ id: staffSessions.id })
  return removed.length
}
