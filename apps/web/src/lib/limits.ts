import { db, tables, workspaces } from '@tableapp/db'
import {
  LIMIT_CODE,
  explain,
  graceReserve,
  graceUsed,
  planOf,
  type PlanLimitDetails,
  type UsageKind,
} from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import { activePlan as planFor } from './plan'
import { recountWorkspace, release, reserve, type Runner } from './usage'

/**
 * Можно ли увеличить расход.
 *
 * Единственное место, где это решается. По коду разбросаны только вызовы,
 * а правила живут здесь — иначе `if (used >= limit)` расползается по десяти
 * файлам и расходится в них по смыслу.
 *
 * Пять правил заложены в устройство, а не в дисциплину того, кто пишет вызов:
 *
 * 1. **Блокируем только рост.** Читать, править и удалять существующее можно
 *    всегда, даже далеко за потолком. Выгрузка — тоже всегда: забрать свои
 *    данные человек вправе в любой момент, и особенно тогда, когда упёрся.
 *
 * 2. **Существующее не выключается.** Ни при превышении, ни при понижении
 *    тарифа. Владелец с пятью приложениями, перешедший на тариф с тремя,
 *    не гасит два работающих — он просто не публикует шестое. Пространство
 *    может оставаться над потолком сколько угодно.
 *
 * 3. **Ручной ввод и резерв — разные вещи.** Аварийный резерв строк тратится
 *    только тем, что приходит из опубликованного приложения само: заказами
 *    клиентов и подтверждёнными заявками с витрины. Руками и импортом его
 *    не потратить — иначе это не аварийный запас, а прибавка к тарифу.
 *
 * 4. **Проверка и занятие места — одно действие.** Иначе два одновременных
 *    запроса при 1999 из 2000 оба прочитают 1999 и оба вставят строку.
 *    Условие живёт внутри `update`, и второй запрос дожидается первого.
 *
 * 5. **Отказ несёт числа, а не текст.** Код и подробности; фразу складывает
 *    тот, кто показывает, а журнал получает разбираемую запись.
 */

/**
 * Откуда идёт запись.
 *
 * Различие не техническое, а деловое: за `manual` стоит владелец, который
 * видит страницу расхода и может решить вопрос; за `runtime` — его клиент,
 * который про чужой тариф ничего не знает и знать не должен.
 */
export type Origin = 'manual' | 'runtime'

export class PlanLimitError extends Error {
  constructor(readonly details: PlanLimitDetails) {
    super(explain(details))
    this.name = 'PlanLimitError'
  }
}

export function isPlanLimitError(error: unknown): error is PlanLimitError {
  return error instanceof PlanLimitError
}

export type IncreaseRequest = {
  workspaceId: string
  resource: UsageKind
  /** Сколько добавляем. У импорта — весь файл: либо всё, либо ничего. */
  amount?: number
  origin?: Origin
  /**
   * Транзакция вызывающего.
   *
   * Если передана, занятое место откатится вместе с ней: строка не записалась
   * — место не занято. Без неё бронь остаётся за вызывающим, и расхождение
   * при сбое лечится ближайшим пересчётом.
   */
  tx?: Runner
}

/**
 * Занять место или отказать.
 *
 * Бросает `PlanLimitError` с подробностями. Не возвращает флаг намеренно:
 * забытая проверка возвращённого значения — это тихо пропущенный потолок,
 * а забытый `try` виден сразу.
 */
export async function assertCanIncreaseUsage(request: IncreaseRequest): Promise<void> {
  const { workspaceId, resource, amount = 1, origin = 'manual', tx } = request
  if (amount <= 0) return

  const plan = await planFor(workspaceId)
  const limit = plan.limits[resource]

  /*
   * Резерв есть только у строк и только для записей из приложения. У таблиц,
   * приложений и файлов аварийного запаса нет: за каждым из них стоит
   * осознанное действие владельца, а не поток чужих заказов.
   */
  const reserveSize = resource === 'rows' && origin === 'runtime' ? graceReserve(limit) : 0
  const ceiling = limit + reserveSize

  const runner = tx ?? db
  let used = await reserve(runner, workspaceId, resource, amount, ceiling)
  if (used !== null) return

  /*
   * Не поместилось — или снимка ещё нет, или он разошёлся с правдой.
   * Пересчитываем начисто и пробуем ещё раз: цена лишнего пересчёта —
   * один запрос на отказ, цена ложного запрета — остановленная работа.
   */
  const fresh = await recountWorkspace(workspaceId)
  used = await reserve(runner, workspaceId, resource, amount, ceiling)
  if (used !== null) return

  const current = Number(fresh[resource])
  const exhausted = resource === 'rows' && origin === 'runtime'

  throw new PlanLimitError({
    code: exhausted ? 'PLAN_ROW_GRACE_EXHAUSTED' : LIMIT_CODE[resource],
    plan: plan.id,
    resource,
    used: current,
    limit,
    requested: amount,
    ...(resource === 'rows'
      ? { graceUsed: graceUsed(current, limit), graceLimit: graceReserve(limit) }
      : {}),
    nextPlan: nextOf(plan.id),
  })
}

/**
 * Занять место внутри транзакции вызывающего — без пересчёта под замком.
 *
 * Нужно там, где за одну операцию пишется много строк: импорт книги.
 * Разница с `assertCanIncreaseUsage` в том, кто держит занятое место.
 * Там оно занимается отдельным запросом и живёт само по себе: пока идёт
 * запись, второй такой же запрос видит уже занятое место — но если первый
 * запрос ещё не дописал, пересчёт у второго насчитает старое число и затрёт
 * чужую бронь. На границе тарифа это давало перебор: два одновременных
 * импорта по две строки проходили при одном свободном месте.
 *
 * Здесь место занято строкой счётчика внутри транзакции: второй запрос
 * ждёт на замке и видит правду. Пересчёт сюда не заходит намеренно —
 * он идёт отдельным соединением и, позванный под замком, дождался бы
 * нашей же незакрытой транзакции. Поэтому пересчитывает и повторяет
 * вызывающий, между транзакциями.
 */
export async function reserveInTx(tx: Runner, request: Omit<IncreaseRequest, 'tx'>): Promise<boolean> {
  const { workspaceId, resource, amount = 1, origin = 'manual' } = request
  if (amount <= 0) return true
  const ceiling = await ceilingFor(workspaceId, resource, origin)
  return (await reserve(tx, workspaceId, resource, amount, ceiling)) !== null
}

/** Потолок с учётом аварийного резерва: он есть только у строк из приложения. */
async function ceilingFor(workspaceId: string, resource: UsageKind, origin: Origin): Promise<number> {
  const limit = (await planFor(workspaceId)).limits[resource]
  return limit + (resource === 'rows' && origin === 'runtime' ? graceReserve(limit) : 0)
}

/**
 * Отказ по тарифу словами и числами — для тех, кто занимает место сам.
 *
 * Фраза та же, что у `assertCanIncreaseUsage`: человек не должен угадывать,
 * почему один отказ выглядит иначе, чем другой.
 */
export async function limitRefusal(
  workspaceId: string,
  resource: UsageKind,
  amount: number,
  origin: Origin = 'manual',
): Promise<PlanLimitError> {
  const plan = await planFor(workspaceId)
  const limit = plan.limits[resource]
  const fresh = await recountWorkspace(workspaceId)
  const current = Number(fresh[resource])
  const exhausted = resource === 'rows' && origin === 'runtime'

  return new PlanLimitError({
    code: exhausted ? 'PLAN_ROW_GRACE_EXHAUSTED' : LIMIT_CODE[resource],
    plan: plan.id,
    resource,
    used: current,
    limit,
    requested: amount,
    ...(resource === 'rows' ? { graceUsed: graceUsed(current, limit), graceLimit: graceReserve(limit) } : {}),
    nextPlan: nextOf(plan.id),
  })
}

/**
 * То же, но без исключения.
 *
 * Серверные действия отвечают человеку значением, а не падением, и оборачивать
 * каждое в `try` значило бы девять раз написать одно и то же. Подробности
 * отказа едут вместе с фразой: интерфейсу они пригодятся, а журналу нужны.
 */
export type Allowed = { ok: true } | { ok: false; error: string; details: PlanLimitDetails }

export async function mayIncrease(request: IncreaseRequest): Promise<Allowed> {
  try {
    await assertCanIncreaseUsage(request)
    return { ok: true }
  } catch (error) {
    if (isPlanLimitError(error)) return { ok: false, error: error.message, details: error.details }
    throw error
  }
}

/** Следующий тариф по идентификатору: подробности носят идентификатор, не объект. */
function nextOf(planId: PlanLimitDetails['plan']): PlanLimitDetails['nextPlan'] {
  const order: PlanLimitDetails['plan'][] = ['free', 'start', 'business', 'scale']
  return order[order.indexOf(planId) + 1] ?? null
}

/**
 * То же, но когда на руках только таблица.
 *
 * Так приходит запись из приложения и офлайн-очередь: пространство там
 * не передают, а искать его по таблице — один поход по индексу.
 */
export async function assertCanAddRowTo(
  tableId: string,
  origin: Origin,
  amount = 1,
  tx?: Runner,
): Promise<void> {
  const workspaceId = await workspaceOfTable(tableId)
  // Таблицы нет — отказывать не за что: разберётся тот, кто её искал.
  if (!workspaceId) return
  await assertCanIncreaseUsage({ workspaceId, resource: 'rows', amount, origin, tx })
}

/** Табличный вариант без исключения: для очереди, отвечающей поштучно. */
export async function mayAddRowTo(tableId: string, origin: Origin, amount = 1): Promise<Allowed> {
  const workspaceId = await workspaceOfTable(tableId)
  if (!workspaceId) return { ok: true }
  return mayIncrease({ workspaceId, resource: 'rows', amount, origin })
}

export async function workspaceOfTable(tableId: string): Promise<string | null> {
  const [owner] = await db
    .select({ workspaceId: tables.workspaceId })
    .from(tables)
    .where(eq(tables.id, tableId))
    .limit(1)
  return owner?.workspaceId ?? null
}

/**
 * Освободить место после удаления.
 *
 * Не обязательна для правильности: счётчик, уехавший вверх, чинится первым
 * же отказом — он приводит к пересчёту. Но без неё человек, удаливший сотню
 * строк, упирался бы в потолок до ближайшего пересчёта и не понимал, почему.
 */
export async function noteRemoved(
  workspaceId: string,
  resource: UsageKind,
  amount = 1,
  tx?: Runner,
): Promise<void> {
  if (amount <= 0) return
  await release(tx ?? db, workspaceId, resource, amount)
}
