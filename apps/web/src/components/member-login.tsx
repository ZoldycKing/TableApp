'use client'
import { LOGIN_CODE_TTL_MINUTES } from '@/lib/auth-constants'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  consumeMemberCodeAction,
  consumeTotpAction,
  requestMemberLoginAction,
  type LoginIntent,
} from '@/app/auth-actions'
import { ResendCode } from '@/components/resend-code'

export function MemberLogin({
  initialError,
  next,
}: {
  initialError: string | null
  /** Куда вернуть человека после входа: он пришёл сюда за конкретным делом. */
  next?: string | null
}) {
  const router = useRouter()
  const home = next ?? '/app'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [intent, setIntent] = useState<LoginIntent>('owner')
  const [nowhere, setNowhere] = useState(false)
  const [totp, setTotp] = useState(false)
  const [second, setSecond] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [sent, setSent] = useState<{ hint: string | null } | null>(null)
  const [pending, startTransition] = useTransition()

  if (totp) {
    return (
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          startTransition(async () => {
            const result = await consumeTotpAction(second)
            if (!result.ok) setError(result.error)
            else if (result.go === 'apps') router.push('/my')
            else router.push(home)
          })
        }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">Код из приложения</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          На этой почте включён второй фактор. Введите код из приложения-аутентификатора
          или один из резервных кодов.
        </p>

        <input
          inputMode="text"
          autoComplete="one-time-code"
          required
          autoFocus
          value={second}
          onChange={(event) => setSecond(event.target.value)}
          placeholder="123456"
          className="w-full rounded-xl border border-sand-300 bg-sand-50 px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.2em] outline-none transition-colors focus:border-sage-400 focus:bg-white"
        />

        {error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-medium text-sand-50 transition-all hover:-translate-y-px hover:bg-ink/90 disabled:translate-y-0 disabled:opacity-40"
        >
          {pending ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    )
  }

  if (nowhere) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Почта подтверждена</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Адрес {email} пока не добавлен ни в одно рабочее приложение. Попросите
          руководителя внести его — после этого вход сработает сам, ничего
          настраивать не нужно.
        </p>
        <button
          type="button"
          onClick={() => {
            setNowhere(false)
            setSent(null)
            setCode('')
            setIntent('owner')
          }}
          className="w-full rounded-xl border border-sand-300 px-4 py-3 text-sm font-medium transition-colors hover:bg-sand-100"
        >
          Создать своё пространство
        </button>
      </div>
    )
  }

  if (sent) {
    return (
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          startTransition(async () => {
            const result = await consumeMemberCodeAction(code)
            if (!result.ok) {
              setError(result.error)
              return
            }
            if (result.go === 'apps') router.push('/my')
            else if (result.go === 'workspace') router.push(home)
            else if (result.go === 'totp') setTotp(true)
            else setNowhere(true)
          })
        }}
      >
        <h1 className="text-2xl font-semibold tracking-tight">Введите код</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Отправили код на {email}. Он действует {LOGIN_CODE_TTL_MINUTES} минут. В письме есть и ссылка —
          если открыли его здесь же, достаточно нажать на неё.
        </p>

        {sent.hint ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {sent.hint}
          </p>
        ) : null}

        {/*
          Код принимается только в этом браузере: попытка привязана кукой.
          Поэтому поле показывается сразу здесь, а не на отдельной странице.
        */}
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="123456"
          className="w-full rounded-xl border border-sand-300 bg-sand-50 px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.3em] outline-none transition-colors focus:border-sage-400 focus:bg-white"
        />

        {error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-medium text-sand-50 transition-all hover:-translate-y-px hover:bg-ink/90 disabled:translate-y-0 disabled:opacity-40"
        >
          {pending ? 'Проверяем…' : 'Войти'}
        </button>

        {/*
          Письмо задерживается или теряется в спаме — об этом надо дать
          сказать прямо, а не прятать повторную отправку за «Ввести другой
          адрес». Код при повторе выдаётся новый, старый перестаёт работать.
        */}
        <ResendCode
          busy={pending}
          onResend={async () => {
            const again = await requestMemberLoginAction(email, intent)
            if (!again.ok) {
              setError(again.error)
              return null
            }
            setError(null)
            setCode('')
            return again.via === 'console'
              ? 'Код напечатан в консоли сервера'
              : `Отправили новый код на ${email}`
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
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await requestMemberLoginAction(email, intent)
          if (result.ok) setSent({ hint: result.hint })
          else setError(result.error)
        })
      }}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Вход в TableApp</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Введите почту — пришлём код. Пароль не нужен.
      </p>

      {/*
        Выбор нужен только для незнакомого адреса: иначе сотрудник, зашедший
        не по ссылке приложения, молча заводил себе пустое пространство.
        На доступ выбор не влияет — его даёт список, который ведёт владелец.
      */}
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            { id: 'owner', title: 'Своё пространство', hint: 'Я веду таблицы и делаю приложение' },
            { id: 'staff', title: 'Рабочее приложение', hint: 'Мой адрес добавил руководитель' },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setIntent(option.id)}
            className={`rounded-xl border px-3.5 py-3 text-left transition-all ${
              intent === option.id
                ? 'border-sage-400 bg-white shadow-soft'
                : 'border-sand-300 bg-sand-50 hover:border-sand-400'
            }`}
          >
            <span className="block text-sm font-medium">{option.title}</span>
            <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">{option.hint}</span>
          </button>
        ))}
      </div>

      {/*
        Подпись, а не подсказка внутри поля: подсказка исчезает на первом же
        символе, и человек, вернувшийся к форме, видит адрес без объяснения,
        что это за поле. Читающим с экрана она даёт имя поля.
      */}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Рабочая почта</span>
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.ru"
          className="w-full rounded-xl border border-sand-300 bg-sand-50 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-sage-400 focus:bg-white"
        />
        <span className="mt-1.5 block text-xs text-ink-muted">
          {intent === 'owner'
            ? 'Пришлём код. Если такого адреса у нас ещё нет, создадим новое пространство.'
            : 'Пришлём код. Доступ к приложению даёт тот, кто внёс ваш адрес в список.'}
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-medium text-sand-50 transition-all hover:-translate-y-px hover:bg-ink/90 disabled:translate-y-0 disabled:opacity-40"
      >
        {pending ? 'Отправляем…' : 'Получить код'}
      </button>
    </form>
  )
}
