import { db, payments, subscriptions, workspaces } from '@tableapp/db'
import { isPlanId, PLANS, type Plan, type PlanId } from '@tableapp/schema'
import { and, desc, eq, ne } from 'drizzle-orm'

/**
 * Подписка пространства.
 *
 * Одно место, которое знает три вещи: сколько стоит тариф, до какого числа
 * он оплачен и что происходит, когда срок кончился.
 *
 * Правило при окончании срока то же, что и при превышении потолка: ничего
 * не удаляется и не выключается. Пространство возвращается на бесплатный
 * тариф — существующие таблицы, приложения и строки остаются на месте,
 * выгрузка работает всегда. Ограничение действует только на рост.
 */

export type SubscriptionState = {
  /** Тариф, который действует сейчас. По нему считаются потолки. */
  plan: Plan
  /** За что заплачено, если платили. */
  paidPlan: PlanId | null
  status: 'free' | 'active' | 'ended' | 'refunded'
  periodEnd: Date | null
  autoRenew: boolean
}

/** Цена тарифа за месяц в копейках. Берётся из конфигурации, не от клиента. */
export function priceKopecks(plan: PlanId, months = 1): number {
  return PLANS[plan].monthlyPrice * 100 * months
}

export const CURRENCY = 'RUB'

/** Сколько длится оплаченный период. Один месяц = 30 суток, без календаря. */
const MONTH_MS = 30 * 24 * 60 * 60 * 1000

export async function subscriptionFor(workspaceId: string): Promise<SubscriptionState> {
  const [workspace] = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  const [record] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1)

  const effective = isPlanId(workspace?.plan) ? workspace!.plan : 'free'

  if (!record) {
    return { plan: PLANS[effective], paidPlan: null, status: 'free', periodEnd: null, autoRenew: false }
  }

  const paidPlan = isPlanId(record.plan) ? record.plan : 'free'
  const running = record.status === 'active' && record.periodEnd.getTime() > Date.now()

  /*
   * Срок кончился — действует бесплатный тариф, даже если в `workspaces.plan`
   * ещё стоит оплаченный: уборка идёт лениво, а говорить человеку неправду
   * о том, что у него сейчас, нельзя ни в какую сторону.
   */
  return {
    plan: running ? PLANS[paidPlan] : PLANS.free,
    paidPlan,
    status: running ? 'active' : record.status === 'refunded' ? 'refunded' : 'ended',
    periodEnd: record.periodEnd,
    autoRenew: record.autoRenew,
  }
}

/**
 * Оплата подтверждена: продлеваем срок и включаем тариф.
 *
 * Продление считается от большей из двух дат — «сейчас» и конца оплаченного
 * срока. Заплатил заранее — дни не сгорают, а складываются.
 *
 * Всё одной транзакцией: тариф пространства, запись подписки и отметка
 * на платеже должны меняться вместе. Наполовину включённая подписка — это
 * человек, который заплатил и не получил, или получил и не заплатил.
 */
export async function activate(input: {
  workspaceId: string
  plan: PlanId
  months: number
  paymentId: string
  paidAt: Date
  providerAt: Date
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    /*
     * Платёж включает тариф **ровно один раз**. Условие `status <> 'succeeded'`
     * внутри `update` — это и есть защита: два одновременных уведомления
     * об одном платеже оба прочитали бы «ожидает оплаты» и оба продлили бы
     * срок на месяц. Postgres пропустит сюда только один запрос, второй
     * увидит уже проставленный статус и уйдёт ни с чем.
     */
    const claimed = await tx
      .update(payments)
      .set({ status: 'succeeded', paidAt: input.paidAt, providerAt: input.providerAt, updatedAt: new Date() })
      .where(and(eq(payments.id, input.paymentId), ne(payments.status, 'succeeded')))
      .returning({ id: payments.id })

    if (claimed.length === 0) return false

    const [current] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, input.workspaceId))
      .limit(1)

    const from =
      current && current.status === 'active' && current.periodEnd.getTime() > Date.now()
        ? current.periodEnd.getTime()
        : Date.now()
    const periodEnd = new Date(from + input.months * MONTH_MS)

    await tx
      .insert(subscriptions)
      .values({
        workspaceId: input.workspaceId,
        plan: input.plan,
        status: 'active',
        periodEnd,
        autoRenew: false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.workspaceId,
        set: { plan: input.plan, status: 'active', periodEnd, updatedAt: new Date() },
      })

    await tx.update(workspaces).set({ plan: input.plan }).where(eq(workspaces.id, input.workspaceId))

    return true
  })
}

/**
 * Деньги вернули.
 *
 * Возвращается **срок этого платежа**, а не вся подписка. Разница видна,
 * когда платежей было два: человек оплатил два месяца, потом вернул первый, —
 * второй месяц он всё ещё оплатил, и отбирать его нельзя. Поэтому из конца
 * оплаченного периода вычитается срок возвращённого платежа; если после этого
 * оплаченного времени не остаётся, подписка закрывается и пространство
 * возвращается на бесплатный тариф.
 *
 * Данные при этом не трогаются ни в каком случае: пространство ведёт себя
 * так же, как любое другое на бесплатном тарифе.
 *
 * Возвращает `false`, если возвращать нечего: платёж уже возвращён или ещё
 * не был оплачен. Повторное уведомление о возврате ничего не меняет.
 */
export async function refund(input: {
  workspaceId: string
  paymentId: string
  providerAt: Date
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(payments)
      .set({ status: 'refunded', providerAt: input.providerAt, updatedAt: new Date() })
      .where(and(eq(payments.id, input.paymentId), eq(payments.status, 'succeeded')))
      .returning({ months: payments.months })

    if (claimed.length === 0) return false
    const months = claimed[0]!.months

    const [current] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, input.workspaceId))
      .limit(1)

    if (!current) return true

    const left = current.periodEnd.getTime() - months * MONTH_MS

    if (left > Date.now()) {
      // Оплаченное время осталось — его дал другой платёж, и он в силе.
      await tx
        .update(subscriptions)
        .set({ periodEnd: new Date(left), updatedAt: new Date() })
        .where(eq(subscriptions.workspaceId, input.workspaceId))
      return true
    }

    await tx
      .update(subscriptions)
      .set({ status: 'refunded', periodEnd: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.workspaceId, input.workspaceId))

    await tx.update(workspaces).set({ plan: 'free' }).where(eq(workspaces.id, input.workspaceId))
    return true
  })
}

/**
 * Срок кончился — возвращаем пространство на бесплатный тариф.
 *
 * Зовётся лениво, когда кто-нибудь открывает страницу расхода или подписки:
 * отдельного расписания у продукта пока нет, а ждать его, держа человека
 * на оплаченном тарифе после окончания срока, было бы неправдой в другую
 * сторону.
 */
export async function settleExpired(workspaceId: string): Promise<void> {
  const [record] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.workspaceId, workspaceId), eq(subscriptions.status, 'active')))
    .limit(1)

  if (!record || record.periodEnd.getTime() > Date.now()) return

  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(eq(subscriptions.workspaceId, workspaceId))
    await tx.update(workspaces).set({ plan: 'free' }).where(eq(workspaces.id, workspaceId))
  })
}

export type PaymentRow = {
  id: string
  plan: string
  amount: number
  currency: string
  status: string
  createdAt: Date
  paidAt: Date | null
  confirmationUrl: string | null
}

/** История платежей пространства: что человек платил и чем это кончилось. */
export async function paymentHistory(workspaceId: string, limit = 20): Promise<PaymentRow[]> {
  return db
    .select({
      id: payments.id,
      plan: payments.plan,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
      createdAt: payments.createdAt,
      paidAt: payments.paidAt,
      confirmationUrl: payments.confirmationUrl,
    })
    .from(payments)
    .where(eq(payments.workspaceId, workspaceId))
    .orderBy(desc(payments.createdAt))
    .limit(limit)
}
