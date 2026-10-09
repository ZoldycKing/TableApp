'use client'

import { useState, useTransition } from 'react'
import { confirmIntakeAction, requestIntakeAction } from '@/app/intake-actions'
import type { accentTones } from './ui'

/**
 * Подтверждение заявки, оставленной с витрины.
 *
 * Человек уже заполнил форму — здесь он только доказывает, что почта его.
 * Поэтому и написано про заявку, а не про «вход»: слово «регистрация»
 * на этом шаге читается как «сначала заведите аккаунт», и человек уходит,
 * хотя заявка уже собрана и ждёт одного кода.
 *
 * Заявка всё это время лежит на сервере. Значения не держатся в этом
 * компоненте не случайно: после подтверждения их пересчитывают по правам
 * подтверждённого человека, и то, что осталось в браузере, роли не играет.
 */
export function IntakeVerify({
  slug,
  screenId,
  values,
  accent,
  onDone,
  onCancel,
  booking = false,
}: {
  slug: string
  screenId: string
  values: Record<string, unknown>
  accent: ReturnType<typeof accentTones>
  onDone: () => void
  onCancel: () => void
  booking?: boolean
}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ email: string; hint: string | null } | null>(null)
  const [pending, startTransition] = useTransition()

  const field =
    'w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sand-400'

  if (sent) {
    return (
      <form
        className="mx-auto max-w-md space-y-3 rounded-2xl border border-sand-200 bg-white p-6 shadow-soft"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          startTransition(async () => {
            const result = await confirmIntakeAction(slug, code)
            if (result.ok) onDone()
            else setError(result.error)
          })
        }}
      >
        <h2 className="text-lg font-semibold">Введите код из письма</h2>
        <p className="text-sm text-ink-muted">
          Отправили код на {sent.email}. Он действует пятнадцать минут. {booking ? 'После кода ещё раз проверим свободное время и сохраним запись в вашем кабинете.' : 'После подтверждения сохраним заявку в вашем личном кабинете.'}
        </p>

        {sent.hint ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {sent.hint}
          </p>
        ) : null}

        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="123456"
          className={`${field} text-center font-mono text-lg tracking-[0.3em]`}
        />

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 ${accent.solid}`}
        >
          {pending ? 'Проверяем…' : booking ? 'Подтвердить запись' : 'Подтвердить заявку'}
        </button>
        <button type="button" onClick={onCancel} className="w-full text-sm text-ink-muted underline">Вернуться к форме</button>

        <button
          type="button"
          onClick={() => {
            setSent(null)
            setCode('')
            setError(null)
          }}
          className="w-full text-sm text-ink-muted underline"
        >
          Указать другой адрес
        </button>
      </form>
    )
  }

  return (
    <form
      className="mx-auto max-w-md space-y-3 rounded-2xl border border-sand-200 bg-white p-6 shadow-soft"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await requestIntakeAction(slug, screenId, email, values)
          if (result.ok) setSent({ email: result.email, hint: result.hint })
          else setError(result.error)
        })
      }}
    >
      <h2 className="text-lg font-semibold">Подтвердите почту</h2>
      <p className="text-sm text-ink-muted">
        Оставьте почту — пришлём короткий код. {booking ? 'После подтверждения сохраним выбранное время и откроем кабинет с вашими записями.' : 'Он подтвердит заявку и откроет кабинет, где видно, что с ней происходит.'} Пароль придумывать не нужно.
      </p>

      <input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.ru"
        className={field}
      />

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 ${accent.solid}`}
      >
        {pending ? 'Отправляем…' : 'Получить код'}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="w-full text-sm text-ink-muted underline"
      >
        Вернуться к форме
      </button>
    </form>
  )
}
