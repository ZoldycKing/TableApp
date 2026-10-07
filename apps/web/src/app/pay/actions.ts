'use server'

import { db, payments } from '@tableapp/db'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { markTestPayment, paymentsMode } from '@/lib/payments/provider'
import { settlePayment } from '@/lib/payments/settle'
import { requireMember } from '@/lib/session'

/**
 * Подтверждение платежа в проверочном контуре.
 *
 * Делает то же, что сделал бы настоящий провайдер: меняет состояние платежа
 * у себя, после чего мы идём за правдой и применяем её тем же кодом, что
 * применяет настоящие уведомления. Проверяется именно наша половина — ветки
 * «оплачен», «отменён» и «возврат» ходят через один путь.
 *
 * В рабочем виде действие не делает ничего: режим не `test` — отказ.
 */
export async function confirmTestPaymentAction(
  id: string,
  outcome: 'succeeded' | 'canceled' | 'refunded',
): Promise<{ ok: true; applied: string } | { ok: false; error: string }> {
  if (paymentsMode() !== 'test') return { ok: false, error: 'Проверочный контур выключен' }

  const member = await requireMember()
  const [payment] = await db.select().from(payments).where(eq(payments.id, id)).limit(1)
  if (!payment || payment.workspaceId !== member.workspaceId) {
    return { ok: false, error: 'Платёж не найден' }
  }

  const changed = markTestPayment(id, outcome)
  if (!changed) return { ok: false, error: 'Платёж не найден у провайдера' }

  const settled = await settlePayment(changed.providerId)
  revalidatePath('/usage', 'page')

  return settled.ok
    ? { ok: true, applied: settled.applied }
    : { ok: false, error: `Не применено: ${settled.reason}` }
}
