'use server'

import { db, payments } from '@tableapp/db'
import { isPlanId, newId, PLANS, type PlanId } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { authorizeWorkspace } from '@/lib/authorize'
import { originUrl } from '@/lib/auth-challenge'
import { CURRENCY, priceKopecks } from '@/lib/payments/subscription'
import { paymentsMode, provider } from '@/lib/payments/provider'

/**
 * Оплата подписки.
 *
 * Что здесь важно и почему именно так:
 *
 * - **Цену считает сервер.** Клиент присылает только идентификатор тарифа.
 *   Сумма, валюта и срок берутся из конфигурации тарифов — той же, по которой
 *   работают потолки. Прислать «Бизнес за рубль» нельзя.
 * - **Запись заводится до похода к провайдеру.** Её идентификатор служит
 *   ключом идемпотентности: двойное нажатие кнопки даёт один платёж,
 *   а не два списания.
 * - **Тариф включается не здесь.** Включает его подтверждение от провайдера,
 *   проверенное запросом к нему же. Иначе достаточно было бы закрыть страницу
 *   оплаты в нужный момент.
 */

export type StartPaymentResult =
  | { ok: true; url: string; paymentId: string }
  | { ok: false; error: string }

export async function startPaymentAction(plan: string, months = 1): Promise<StartPaymentResult> {
  const auth = await authorizeWorkspace()
  if (!auth.ok) return auth

  // Платить за подписку может только владелец: это деньги пространства.
  if (auth.member.role !== 'owner') {
    return { ok: false, error: 'Оплатить подписку может только владелец пространства' }
  }

  if (!isPlanId(plan) || plan === 'free') {
    return { ok: false, error: 'Такой тариф нельзя оплатить' }
  }
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    return { ok: false, error: 'Срок оплаты — от одного до двенадцати месяцев' }
  }

  const gateway = provider()
  if (!gateway) {
    return {
      ok: false,
      error:
        'Приём оплаты пока не подключён. Напишите на hello@tableapp.ru — пришлём счёт и документы.',
    }
  }

  const paid: PlanId = plan
  const amount = priceKopecks(paid, months)
  const paymentId = newId('payment')

  await db.insert(payments).values({
    id: paymentId,
    workspaceId: auth.member.workspaceId,
    plan: paid,
    months,
    amount,
    currency: CURRENCY,
    status: 'pending',
    provider: gateway.name,
    actorId: auth.member.userId,
  })

  try {
    const created = await gateway.create({
      id: paymentId,
      amount,
      currency: CURRENCY,
      description: `Scatta, тариф «${PLANS[paid].name}», ${months} мес.`,
      returnUrl: `${await originUrl()}/usage?payment=${paymentId}`,
    })

    await db
      .update(payments)
      .set({
        providerId: created.providerId,
        confirmationUrl: created.confirmationUrl,
        providerAt: created.at,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId))

    if (!created.confirmationUrl) {
      return { ok: false, error: 'Провайдер не дал ссылку на оплату. Попробуйте ещё раз.' }
    }

    revalidatePath('/usage', 'page')
    return { ok: true, url: created.confirmationUrl, paymentId }
  } catch (error) {
    // Платёж у провайдера не создался: нашу запись закрываем, чтобы она
    // не висела в истории «ожидает оплаты» вечно.
    await db
      .update(payments)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(payments.id, paymentId))

    console.error('[payments] не удалось создать платёж', {
      paymentId,
      mode: paymentsMode(),
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, error: 'Не удалось начать оплату. Попробуйте ещё раз через минуту.' }
  }
}
