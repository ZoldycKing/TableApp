import { db, subscriptions, workspaces } from '@tableapp/db'
import { planOf, type Plan } from '@tableapp/schema'
import { eq } from 'drizzle-orm'

/**
 * Тариф, который действует сейчас.
 *
 * Одно место на весь продукт, и это важно: по тарифу считаются потолки,
 * по нему же рисуется страница расхода и подписки. Разойдись они — человек
 * увидел бы на одной странице «Старт», а на другой отказ по потолку
 * бесплатного.
 *
 * Не просто `workspaces.plan`: оплаченный срок мог кончиться, а уборка идёт
 * лениво — её запускает открытая страница расхода. Потолки не должны ждать,
 * пока кто-нибудь зайдёт.
 *
 * Данные при окончании срока не трогаются: бесплатный тариф ограничивает
 * рост, а не доступ к тому, что уже есть.
 */
export async function activePlan(workspaceId: string, runner: Pick<typeof db, 'select'> = db): Promise<Plan> {
  const [row] = await runner
    .select({
      plan: workspaces.plan,
      paid: subscriptions.plan,
      status: subscriptions.status,
      periodEnd: subscriptions.periodEnd,
    })
    .from(workspaces)
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!row) return planOf(undefined)

  // Подписки нет вовсе — верим тарифу пространства: его ставит и владелец
  // сервиса вручную, и сид демо-данных.
  if (row.paid === null) return planOf(row.plan)

  const running = row.status === 'active' && (row.periodEnd?.getTime() ?? 0) > Date.now()
  return running ? planOf(row.paid) : planOf('free')
}
