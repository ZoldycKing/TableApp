'use client'

import { PLANS, type PlanId } from '@tableapp/schema'
import { useState, useTransition } from 'react'
import { startPaymentAction } from '@/app/payment-actions'

/**
 * Подписка в кабинете.
 *
 * Говорит три вещи и ни одной лишней: какой тариф действует, до какого числа
 * оплачено и что будет, когда срок кончится. Обещать автопродление, которого
 * нет, нельзя — вместо него сказано прямо, что оплата разовая и дни
 * складываются.
 */

export type SubscriptionView = {
  planId: PlanId
  paidPlan: PlanId | null
  status: 'free' | 'active' | 'ended' | 'refunded'
  periodEnd: string | null
  /** Приём оплаты: `off` — не подключён, `test` — проверочный контур. */
  mode: 'off' | 'test' | 'yookassa'
  canPay: boolean
}

export type PaymentView = {
  id: string
  plan: string
  amount: number
  currency: string
  status: string
  createdAt: string
  paidAt: string | null
  confirmationUrl: string | null
}

const money = new Intl.NumberFormat('ru-RU')
/*
 * Без «г.» в конце: формат с ним давал «оплачен до 4 ноября 2026 г..» —
 * точка формата плюс точка предложения.
 */
const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

function date(value: string | Date): string {
  return day.format(new Date(value)).replace(/\s*г\.$/, '')
}

const STATUS: Record<string, string> = {
  pending: 'ожидает оплаты',
  succeeded: 'оплачен',
  canceled: 'отменён',
  refunded: 'возвращён',
}

export function SubscriptionPanel({
  subscription,
  history,
}: {
  subscription: SubscriptionView
  history: PaymentView[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const plan = PLANS[subscription.planId]
  const until = subscription.periodEnd ? date(subscription.periodEnd) : null

  const pay = (planId: PlanId) => {
    setError(null)
    startTransition(async () => {
      const result = await startPaymentAction(planId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      window.location.href = result.url
    })
  }

  return (
    <section className="mt-8 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-5">
      <h2 className="text-lg font-medium">Подписка</h2>

      <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
        Действует тариф <span className="font-medium text-ink">«{plan.name}»</span>.
        {subscription.status === 'active' && until ? ` Оплачен до ${until}.` : null}
        {subscription.status === 'ended' && until
          ? ` Оплаченный срок кончился ${until}: пространство вернулось на бесплатный тариф. Таблицы, приложения и строки на месте — ограничение действует только на новое.`
          : null}
        {subscription.status === 'refunded'
          ? ' Платёж возвращён, подписка закрыта. Данные не тронуты.'
          : null}
      </p>

      {subscription.status === 'active' ? (
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Автопродления нет: оплата разовая. Оплатить следующий срок можно
          в любой момент — оставшиеся дни не сгорают, новый срок прибавляется
          к ним.
        </p>
      ) : null}

      {subscription.mode === 'off' ? (
        <p className="mt-4 rounded-xl bg-sand-100 p-4 text-sm leading-6 text-ink-soft">
          Сейчас доступен бесплатный тариф. Платные тарифы пока нельзя подключить.
          Обсудить нужный объём данных можно по почте{' '}
          <a className="underline" href="mailto:hello@tableapp.ru">
            hello@tableapp.ru
          </a>
          .
        </p>
      ) : null}

      {subscription.mode === 'test' ? (
        <p className="mt-4 rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 text-sm leading-relaxed text-ink-soft">
          Проверочный контур оплаты: деньги не списываются, платёж подтверждается
          вручную. Так проверяется наша половина — создание платежа, продление
          срока, возврат.
        </p>
      ) : null}

      {subscription.canPay && subscription.mode !== 'off' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {(['start', 'business', 'scale'] as const).map((id) => (
            <button
              key={id}
              type="button"
              disabled={pending}
              onClick={() => pay(id)}
              className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
            >
              {pending ? 'Готовим оплату…' : `«${PLANS[id].name}» — ${money.format(PLANS[id].monthlyPrice)} ₽ / мес`}
            </button>
          ))}
        </div>
      ) : null}

      {!subscription.canPay ? (
        <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
          Оплатить подписку может владелец пространства.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-medium">История платежей</h3>
          <ul className="mt-2 divide-y divide-[var(--color-border-subtle)] text-sm">
            {history.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  {date(payment.createdAt)} · тариф «
                  {PLANS[payment.plan as PlanId]?.name ?? payment.plan}»
                </span>
                <span className="text-[var(--color-ink-muted)]">
                  {money.format(payment.amount / 100)} ₽ · {STATUS[payment.status] ?? payment.status}
                  {payment.status === 'pending' && payment.confirmationUrl ? (
                    <>
                      {' · '}
                      <a className="underline" href={payment.confirmationUrl}>
                        оплатить
                      </a>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
