import { db, payments } from '@tableapp/db'
import { isPlanId } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import { activate, refund } from './subscription'
import { decide } from './decide'
import { provider, type ProviderPayment } from './provider'

/**
 * Что делать с платежом, о котором сказал провайдер.
 *
 * Уведомление — это **повод спросить**, а не источник правды: подписи у него
 * нет, прийти оно может дважды, не по порядку и вообще от кого угодно.
 * Поэтому состояние платежа мы узнаём отдельным запросом к провайдеру
 * и сверяем сумму с той, что сами просили: оплата «Бизнеса» рублём не должна
 * включить «Бизнес».
 *
 * Решение отделено от записи намеренно и живёт в `decide.ts`: правила
 * «повтор ничего не меняет», «из оплаченного только в возврат», «опоздавшее
 * уведомление игнорируется» проверяются без базы и без сети.
 */

export type Settlement =
  | { ok: true; applied: 'activated' | 'refunded' | 'canceled' | 'nothing'; paymentId: string }
  | {
      ok: false
      reason: 'unknown_payment' | 'amount_mismatch' | 'provider_silent' | 'partial_refund'
    }

/** Что знает о платеже наша база — ровно то, что нужно для решения. */
export async function settlePayment(providerId: string): Promise<Settlement> {
  const gateway = provider()
  if (!gateway) return { ok: false, reason: 'provider_silent' }

  const [record] = await db.select().from(payments).where(eq(payments.providerId, providerId)).limit(1)
  if (!record) return { ok: false, reason: 'unknown_payment' }

  const truth = await gateway.fetch(providerId)
  if (!truth) return { ok: false, reason: 'provider_silent' }

  return applyDecision(record, truth)
}

type Stored = typeof payments.$inferSelect

/** Решение в действие. Записью занимается подписка — она знает про сроки. */
export async function applyDecision(record: Stored, truth: ProviderPayment): Promise<Settlement> {
  const decision = decide(record, truth)

  switch (decision.act) {
    case 'nothing':
      return { ok: true, applied: 'nothing', paymentId: record.id }

    case 'refuse':
      console.error('[payments] платёж не применён', {
        paymentId: record.id,
        why: decision.why,
        expected: `${record.amount} ${record.currency}`,
        got: `${truth.amount} ${truth.currency}`,
        refunded: truth.refunded ?? 0,
      })
      if (decision.why === 'amount_mismatch') return { ok: false, reason: 'amount_mismatch' }
      if (decision.why === 'partial_refund') return { ok: false, reason: 'partial_refund' }
      return { ok: false, reason: 'unknown_payment' }

    case 'activate': {
      // `false` означает, что платёж уже засчитан — одновременное
      // уведомление пришло вторым и продлевать срок ещё раз не должно.
      const applied = await activate({
        workspaceId: record.workspaceId,
        plan: record.plan as Exclude<Parameters<typeof activate>[0]['plan'], 'free'>,
        months: record.months,
        paymentId: record.id,
        paidAt: truth.at,
        providerAt: truth.at,
      })
      return { ok: true, applied: applied ? 'activated' : 'nothing', paymentId: record.id }
    }

    case 'refund': {
      const applied = await refund({
        workspaceId: record.workspaceId,
        paymentId: record.id,
        providerAt: truth.at,
      })
      return { ok: true, applied: applied ? 'refunded' : 'nothing', paymentId: record.id }
    }

    case 'cancel':
      await db
        .update(payments)
        .set({ status: 'canceled', providerAt: truth.at, updatedAt: new Date() })
        .where(eq(payments.id, record.id))
      return { ok: true, applied: 'canceled', paymentId: record.id }
  }
}
