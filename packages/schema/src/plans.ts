/**
 * Тарифы.
 *
 * Это конфигурация, а не бизнес-правило. Цены и потолки меняются после первых
 * платящих клиентов, и менять их нужно здесь одним списком, не трогая ни учёт,
 * ни проверки. Поэтому ниже нет ни одной цифры, вшитой в код где-то ещё: всё,
 * что знает о тарифах остальная система, — это идентификатор тарифа и вот эта
 * таблица.
 *
 * Чего здесь нет намеренно — числа людей. Пользователей приложения считаем,
 * но за них не берём: платить за каждого сотрудника — ровно то, из-за чего
 * малый бизнес уходит от зарубежных сервисов. Считается общий объём данных,
 * а не количество тех, кто с ними работает.
 *
 * Таблицы тоже не главный экономический параметр, а защитный потолок. Брать
 * деньги за таблицы значит наказывать человека за нормальную структуру базы:
 * он начнёт складывать три сущности в одну, и приложение из этого уже
 * не соберётся.
 */

export type PlanId = 'free' | 'start' | 'business' | 'scale'

export type PlanLimits = {
  /** Строки пользовательских таблиц во всём пространстве. Главный счётчик. */
  rows: number
  /** Опубликованные приложения. Черновик потолок не расходует. */
  publishedApps: number
  /** Таблицы: защитный потолок, а не предмет торга. */
  tables: number
  /** Файлы: это прямые расходы на хранение. */
  fileBytes: number
}

export type Plan = {
  id: PlanId
  name: string
  /**
   * Рублей в месяц. Ориентировочная: до первых платящих клиентов может
   * измениться, и устройство учёта от неё не зависит.
   */
  monthlyPrice: number
  /** Кому он подходит — одной строкой, словами человека, а не отдела продаж. */
  fit: string
  limits: PlanLimits
}

const GB = 1024 * 1024 * 1024
const MB = 1024 * 1024

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Бесплатный',
    monthlyPrice: 0,
    fit: 'Посмотреть, соберётся ли из вашей таблицы рабочее приложение.',
    limits: { rows: 2_000, publishedApps: 1, tables: 10, fileBytes: 250 * MB },
  },
  start: {
    id: 'start',
    name: 'Старт',
    monthlyPrice: 1_990,
    fit: 'Одна команда, один-два рабочих процесса.',
    limits: { rows: 25_000, publishedApps: 2, tables: 30, fileBytes: 3 * GB },
  },
  business: {
    id: 'business',
    name: 'Бизнес',
    monthlyPrice: 4_990,
    fit: 'Несколько отделов и клиентский кабинет.',
    limits: { rows: 100_000, publishedApps: 5, tables: 100, fileBytes: 15 * GB },
  },
  scale: {
    id: 'scale',
    name: 'Масштаб',
    monthlyPrice: 11_990,
    fit: 'Много процессов, много данных, фотографии и документы.',
    limits: { rows: 500_000, publishedApps: 15, tables: 250, fileBytes: 75 * GB },
  },
}

/** Порядок для показа и для ответа на вопрос «что дальше». */
export const PLAN_ORDER: PlanId[] = ['free', 'start', 'business', 'scale']

export const DEFAULT_PLAN: PlanId = 'free'

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLANS
}

/** Тариф по идентификатору. Неизвестный — бесплатный: он самый узкий. */
export function planOf(id: unknown): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS[DEFAULT_PLAN]
}

/** Следующий тариф, если он есть: к нему ведёт человека страница расхода. */
export function nextPlan(id: PlanId): Plan | null {
  const index = PLAN_ORDER.indexOf(id)
  const next = index >= 0 ? PLAN_ORDER[index + 1] : undefined
  return next ? PLANS[next] : null
}

/** Что считаем и по чему сверяем: одни ключи у расхода и у потолков. */
export type UsageKind = keyof PlanLimits

export const USAGE_KINDS: UsageKind[] = ['rows', 'publishedApps', 'tables', 'fileBytes']

/**
 * Насколько израсходован потолок — долей, а не процентом.
 *
 * Потолок «ноль» означал бы деление на ноль. Такого тарифа нет, но считать
 * это «израсходовано полностью» безопаснее, чем получить бесконечность
 * в разметке.
 */
export function usageRatio(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 1 : 0
  return used / limit
}

/**
 * Насколько всё плохо.
 *
 * Три порога вместо плавного цвета: человек должен различать состояния
 * с одного взгляда, а не сравнивать оттенки. «Кончилось» на этапе учёта
 * ничего не блокирует, только предупреждает.
 */
export type UsageLevel = 'ok' | 'notice' | 'warning' | 'reached'

export const USAGE_THRESHOLDS = { notice: 0.7, warning: 0.85, reached: 1 } as const

export function usageLevel(used: number, limit: number): UsageLevel {
  const ratio = usageRatio(used, limit)
  if (ratio >= USAGE_THRESHOLDS.reached) return 'reached'
  if (ratio >= USAGE_THRESHOLDS.warning) return 'warning'
  if (ratio >= USAGE_THRESHOLDS.notice) return 'notice'
  return 'ok'
}
/**
 * Аварийный резерв строк.
 *
 * Не «скидка на превышение», а защита работающего дела. Когда у владельца
 * кончились строки, его собственный ввод останавливается сразу — он видит
 * страницу расхода и может решить вопрос. А заказы, которые в этот момент
 * оформляют его клиенты, продолжают приниматься: человек не должен узнавать
 * о кончившемся месте от потерянного заказчика.
 *
 * Поэтому резерв нельзя потратить руками и нельзя потратить импортом. Только
 * тем, что приходит из опубликованного приложения само.
 *
 * Формула даёт 100 строк на бесплатном и 1000 на остальных: на маленьком
 * тарифе процент от потолка слишком мал, чтобы пережить наплыв, а на большом
 * — слишком велик, чтобы оставаться авариным запасом.
 */
export function graceReserve(rowLimit: number): number {
  return Math.min(Math.max(Math.round(rowLimit * 0.05), 50), 1000)
}

/**
 * Почему отказано.
 *
 * Код, а не текст: по тексту нельзя ни разветвиться в интерфейсе,
 * ни отличить «кончились строки» от «кончился и резерв» — а это разные
 * события, и владельцу они говорят разное.
 */
export type PlanErrorCode =
  | 'PLAN_ROW_LIMIT'
  | 'PLAN_ROW_GRACE_EXHAUSTED'
  | 'PLAN_TABLE_LIMIT'
  | 'PLAN_APP_LIMIT'
  | 'PLAN_STORAGE_LIMIT'

export const LIMIT_CODE: Record<UsageKind, PlanErrorCode> = {
  rows: 'PLAN_ROW_LIMIT',
  tables: 'PLAN_TABLE_LIMIT',
  publishedApps: 'PLAN_APP_LIMIT',
  fileBytes: 'PLAN_STORAGE_LIMIT',
}

/**
 * Отказ со всеми числами.
 *
 * Несёт не только «нельзя», но и всё, из чего это «нельзя» получилось:
 * интерфейс складывает из них фразу, а журнал — разбираемую запись. Без
 * `requested` не отличить «не поместилась одна строка» от «не поместился
 * файл на пять тысяч строк», а это ровно тот вопрос, который человек задаёт
 * первым.
 */
export type PlanLimitDetails = {
  code: PlanErrorCode
  plan: PlanId
  resource: UsageKind
  used: number
  limit: number
  /** Сколько просили добавить. */
  requested: number
  /** Сколько резерва израсходовано и сколько его всего. Только у строк. */
  graceUsed?: number
  graceLimit?: number
  nextPlan: PlanId | null
}

/**
 * Израсходованный резерв.
 *
 * Считается от потолка, а не от нуля: пока строк меньше потолка, резерв
 * не тронут вовсе. Первая же строка сверх — и пространство считается
 * превысившим, и владельцу это показывают прямо.
 */
export function graceUsed(used: number, limit: number): number {
  return Math.max(0, used - limit)
}

/** Превысило ли пространство потолок. Ответ нужен интерфейсу, а не проверке. */
export function isOverLimit(used: number, limit: number): boolean {
  return used > limit
}

function megabytes(value: number): string {
  const GB = 1024 ** 3
  if (value >= GB) return `${(value / GB).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ГБ`
  return `${Math.round(value / 1024 ** 2).toLocaleString('ru-RU')} МБ`
}

function amountOf(resource: UsageKind, value: number): string {
  return resource === 'fileBytes' ? megabytes(value) : value.toLocaleString('ru-RU')
}

/**
 * Первая фраза отказа — своя на каждый случай.
 *
 * Общий шаблон «закончились {то-то}» даёт «закончились строк» и «закончились
 * места под файлы»: по-русски так не говорят, и человек читает это как
 * машинный перевод.
 */
function head(details: PlanLimitDetails, planName: string): string {
  const used = amountOf(details.resource, details.used)
  const limit = amountOf(details.resource, details.limit)

  switch (details.code) {
    case 'PLAN_ROW_LIMIT':
      return `Закончились строки: ${used} из ${limit} на тарифе «${planName}».`
    case 'PLAN_ROW_GRACE_EXHAUSTED':
      return (
        `Закончились строки и аварийный резерв: ${used} при потолке ${limit} ` +
        `на тарифе «${planName}». Заявки из приложения больше не принимаются.`
      )
    case 'PLAN_TABLE_LIMIT':
      return `Закончились таблицы: ${used} из ${limit} на тарифе «${planName}».`
    case 'PLAN_STORAGE_LIMIT':
      return `Закончилось место под файлы: ${used} из ${limit} на тарифе «${planName}».`
    case 'PLAN_APP_LIMIT':
      return `На тарифе «${planName}» можно опубликовать ${limit} — уже опубликовано ${used}.`
  }
}

/**
 * Отказ словами.
 *
 * Человеку нужны три вещи и ровно в таком порядке: что кончилось, сколько
 * у него есть и что с этим делать. «Превышен лимит тарифного плана» не даёт
 * ни одного из трёх.
 */
export function explain(details: PlanLimitDetails): string {
  const plan = PLANS[details.plan]
  const parts = [head(details, plan.name)]

  /*
   * Про объём просьбы говорим только когда просили больше одной единицы:
   * «не поместилась 1 строка» человеку ничего не добавляет, а «не поместились
   * 5 000 строк» сразу объясняет, почему импорт не прошёл целиком.
   */
  if (details.requested > 1) {
    parts.push(`Не поместилось: ${amountOf(details.resource, details.requested)}.`)
  }

  const next = details.nextPlan ? PLANS[details.nextPlan] : null
  parts.push(
    next
      ? `На тарифе «${next.name}» — ${amountOf(details.resource, next.limits[details.resource])}.`
      : 'Напишите нам — подберём условия под ваш объём.',
  )
  parts.push('Расход: /usage')

  return parts.join(' ')
}

/**
 * Отказ для клиента приложения.
 *
 * Клиент не знает ни про тарифы, ни про то, что у владельца кончилось место,
 * и говорить ему это нельзя: это чужие дела и чужие деньги. Ему сообщают,
 * что заявку сейчас не принять, — так же, как сказали бы при поломке.
 */
export function explainToCustomer(): string {
  return 'Сейчас заявку принять не получается. Попробуйте позже или свяжитесь с нами напрямую.'
}
