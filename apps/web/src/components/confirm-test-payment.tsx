'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { confirmTestPaymentAction } from '@/app/pay/actions'

/** Кнопки проверочного контура: за провайдера нажимает человек. */
export function ConfirmTestPayment({ id, done }: { id: string; done: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const send = (outcome: 'succeeded' | 'canceled' | 'refunded') => {
    setError(null)
    startTransition(async () => {
      const result = await confirmTestPaymentAction(id, outcome)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push('/usage')
    })
  }

  return (
    <div className="mt-6 space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => send('succeeded')}
        className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-medium text-sand-50 disabled:opacity-40"
      >
        {pending ? 'Применяем…' : 'Подтвердить оплату'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => send('canceled')}
        className="w-full rounded-xl border border-sand-300 px-4 py-3 text-sm font-medium disabled:opacity-40"
      >
        Отменить платёж
      </button>
      {done ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => send('refunded')}
          className="w-full rounded-xl border border-sand-300 px-4 py-3 text-sm font-medium disabled:opacity-40"
        >
          Вернуть деньги
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  )
}
