'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { consumeAppCodeAction, requestAppLoginAction } from '@/app/auth-actions'
import { ResendCode } from '@/components/resend-code'
import { accentClasses } from './bindings'

export function AppLogin({
  slug,
  appName,
  accent,
  initialError,
}: {
  slug: string
  appName: string
  accent: string
  initialError: string | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [sent, setSent] = useState<{ hint: string | null } | null>(null)
  const [pending, startTransition] = useTransition()
  const styles = accentClasses(accent)

  if (sent) {
    return (
      <form
        className="mx-auto max-w-sm space-y-3 p-6"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          startTransition(async () => {
            const result = await consumeAppCodeAction(slug, code)
            if (result.ok) router.push(`/a/${slug}`)
            else setError(result.error ?? 'Не удалось войти')
          })
        }}
      >
        <h1 className="text-lg font-semibold">Введите код</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Если адрес {email} есть в списке доступа, код уже отправлен. Он действует
          15 минут; в письме есть и ссылка.
        </p>

        {sent.hint ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
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
          {pending ? 'Проверяем…' : 'Войти'}
        </button>

        <ResendCode
          busy={pending}
          onResend={async () => {
            const again = await requestAppLoginAction(slug, email)
            if (!again.ok) {
              setError(again.error)
              return null
            }
            setError(null)
            setCode('')
            return 'Отправили новый код, если адрес есть в списке доступа'
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
      </form>
    )
  }

  return (
    <form
      className="mx-auto max-w-sm space-y-3 p-6"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await requestAppLoginAction(slug, email)
          if (result.ok) setSent({ hint: result.hint })
          else setError(result.error)
        })
      }}
    >
      <h1 className="text-lg font-semibold">{appName}</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Введите почту — пришлём код для входа. Пароль не нужен.
      </p>

      <input
        type="email"
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
    </form>
  )
}
