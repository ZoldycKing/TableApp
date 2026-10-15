'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { consumeAppCodeAction, requestAppLoginAction } from '@/app/auth-actions'
import { ResendCode } from '@/components/resend-code'
import { accentClasses } from './bindings'
import { LOGIN_CODE_TTL_MINUTES } from '@/lib/auth-constants'

export function AppLogin({
  slug,
  appName,
  accent,
  initialError,
  onDone,
  onCancel,
  demo = false,
  purpose = 'checkout',
}: {
  slug: string
  appName: string
  accent: string
  initialError: string | null
  onDone?: () => void
  onCancel?: () => void
  demo?: boolean
  purpose?: 'checkout' | 'question'
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [sent, setSent] = useState<{ hint: string | null } | null>(null)
  const [pending, startTransition] = useTransition()
  const [verified, setVerified] = useState(false)
  const styles = accentClasses(accent)
  const question = purpose === 'question'
  const request = () => demo
    ? Promise.resolve({ ok: true as const, hint: 'Это пример: письмо не отправляется. Для продолжения введите код 123456.' })
    : question ? requestAppLoginAction(slug, email, 'question') : requestAppLoginAction(slug, email)

  if (verified) return <p role="status" className="mx-auto max-w-sm p-6 text-sm text-ink-soft">{question ? 'Почта подтверждена. Возвращаемся к вопросу…' : 'Почта подтверждена. Открываем форму…'}</p>

  if (sent) {
    return (
      <form
        className="mx-auto max-w-sm space-y-3 p-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (pending) return
          setError(null)
          startTransition(async () => {
            const result = demo ? { ok: code === '123456', error: 'В примере используйте код 123456' } : await consumeAppCodeAction(slug, code)
            if (result.ok) {
              if (onDone) { setVerified(true); onDone() }
              else router.push(`/a/${slug}`)
            }
            else setError(result.error ?? 'Не удалось войти')
          })
        }}
      >
        <h1 className="text-lg font-semibold">Введите код</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {question ? `Введите одноразовый код для ${email}.` : `Если для адреса ${email} разрешён вход, код отправлен на почту.`} Он действует {LOGIN_CODE_TTL_MINUTES} минут.
          {question ? ' После подтверждения сможете написать вопрос бизнесу.' : onDone ? ' После подтверждения заполните данные для оформления. Заказ пока не создан.' : ' В письме есть и ссылка.'}
        </p>

        {sent.hint ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {sent.hint}
          </p>
        ) : null}

        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Код из письма"
          required
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="123456"
          className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-sage-400"
        />

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 ${styles.bg}`}
        >
          {pending ? 'Проверяем…' : question ? 'Подтвердить и написать' : onDone ? 'Подтвердить и продолжить' : 'Войти'}
        </button>

        <ResendCode
          busy={pending}
          onResend={async () => {
            const again = await request()
            if (!again.ok) {
              setError(again.error)
              return null
            }
            setError(null)
            setCode('')
            return 'Если для этого адреса разрешён вход, новый код отправлен'
          }}
        />

        <button
          type="button"
          onClick={() => {
            setSent(null)
            setCode('')
            setError(null)
          }}
          className="w-full text-sm text-[var(--color-ink-muted)] underline"
        >
          Ввести другой адрес
        </button>
        {onCancel ? <button type="button" onClick={onCancel} className="w-full text-sm text-ink-muted">{question ? 'Вернуться к вопросу' : 'Вернуться к выбору'}</button> : null}
      </form>
    )
  }

  return (
    <form
      className="mx-auto max-w-sm space-y-3 p-6"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        setError(null)
        startTransition(async () => {
          const result = await request()
          if (result.ok) setSent({ hint: result.hint })
          else setError(result.error)
        })
      }}
    >
      <h1 className="text-lg font-semibold">{question ? 'Написать бизнесу' : onDone ? 'Подтвердите почту' : appName}</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        {question ? 'Подтвердите почту одноразовым кодом, чтобы написать вопрос бизнесу. Пароль не нужен; повторно создавать аккаунт у другого бизнеса не потребуется.' : onDone ? 'Сначала подтвердите почту одноразовым кодом. Затем заполните данные для заказа или записи. Пароль не нужен; повторно создавать аккаунт у другого бизнеса не потребуется.' : 'Введите почту — пришлём код для входа. Пароль не нужен.'}
      </p>

      <input
        type="email"
        aria-label="Ваша почта"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.ru"
        className="w-full rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm outline-none focus:border-sage-400"
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 ${styles.bg}`}
      >
        {pending ? 'Отправляем…' : 'Получить код'}
      </button>
      {onCancel ? <button type="button" onClick={onCancel} className="w-full text-sm text-ink-muted">{question ? 'Вернуться к вопросу' : 'Вернуться к выбору'}</button> : null}
    </form>
  )
}
