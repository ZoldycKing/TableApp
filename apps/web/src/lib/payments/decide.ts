import { isPlanId } from '@tableapp/schema'
import type { ProviderPayment } from './provider'

/**
 * Решение по платежу: что делать с тем, что сказал провайдер.
 *
 * Отдельным модулем и без единого обращения к базе. Здесь живут правила,
 * которые ломаются молча и чинятся дорого: повторное уведомление не должно
 * продлевать подписку второй раз, опоздавшее — откатывать оплату, а сумма
 * меньше нужной — включать тариф. Такое проверяется без базы и без сети,
 * иначе не проверяется вовсе.
 */

export type KnownPayment = {
  status: string
  amount: number
  currency: string
  plan: string
  providerAt: Date | null
}

export type Decision =
  | { act: 'nothing'; why: 'same_status' | 'out_of_order' | 'terminal' | 'still_pending' }
  | { act: 'activate' }
  | { act: 'refund' }
  | { act: 'cancel' }
  | { act: 'refuse'; why: 'amount_mismatch' | 'bad_plan' | 'partial_refund' }

export function decide(known: KnownPayment, truth: ProviderPayment): Decision {
  /*
   * Уведомление не по порядку. Сеть не обещает очерёдность, и «отменён»
   * может приехать после «оплачен», если первое задержалось в пути.
   */
  if (known.providerAt && truth.at.getTime() < known.providerAt.getTime()) {
    return { act: 'nothing', why: 'out_of_order' }
  }

  /*
   * Частичный возврат. Продукт их не делает и правил пересчёта срока
   * под них не имеет, а догадываться тут нельзя: вернули десять процентов —
   * это скидка, компенсация или ошибка? Поэтому подписку не трогаем вовсе,
   * говорим об этом в журнал и оставляем решение человеку.
   */
  if ((truth.refunded ?? 0) > 0 && truth.status !== 'refunded') {
    return { act: 'refuse', why: 'partial_refund' }
  }

  // Повтор того же уведомления: состояние уже такое, делать нечего.
  if (known.status === truth.status) return { act: 'nothing', why: 'same_status' }

  // Из оплаченного — только в возврат; из возврата — никуда.
  if (known.status === 'refunded') return { act: 'nothing', why: 'terminal' }
  if (known.status === 'succeeded' && truth.status !== 'refunded') {
    return { act: 'nothing', why: 'terminal' }
  }

  if (truth.status === 'succeeded') {
    if (truth.amount !== known.amount || truth.currency !== known.currency) {
      return { act: 'refuse', why: 'amount_mismatch' }
    }
    if (!isPlanId(known.plan) || known.plan === 'free') return { act: 'refuse', why: 'bad_plan' }
    return { act: 'activate' }
  }

  if (truth.status === 'refunded') return { act: 'refund' }
  if (truth.status === 'canceled') return { act: 'cancel' }
  return { act: 'nothing', why: 'still_pending' }
}
