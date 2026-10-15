'use client'

import Link from 'next/link'
import { useId, useRef, useState, useTransition } from 'react'
import { getGeneralMessageAccessAction, setGeneralMessageAccessAction } from '@/app/conversation-actions'
import { ShellIcon } from './shell/icons'

type Operator = { userId: string; name: string | null; email: string; allowed: boolean }
const FAILURE = 'Не удалось изменить доступ. Попробуйте ещё раз.'

/** Owner-only entry point; the actions independently verify the active business and role. */
export function GeneralMessageAccess() {
  const [open, setOpen] = useState(false)
  const [operators, setOperators] = useState<Operator[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inFlight = useRef(false)
  const id = useId()

  const load = () => {
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    setSaved(null)
    startTransition(async () => {
      try {
        const result = await getGeneralMessageAccessAction()
        if (result.ok) setOperators(result.operators)
        else setError(result.error)
      } catch {
        setError('Не удалось загрузить участников команды. Попробуйте ещё раз.')
      } finally {
        inFlight.current = false
      }
    })
  }

  const update = (operator: Operator, allowed: boolean) => {
    if (inFlight.current || operator.allowed === allowed) return
    inFlight.current = true
    setSavingId(operator.userId)
    setError(null)
    setSaved(null)
    startTransition(async () => {
      try {
        const result = await setGeneralMessageAccessAction(operator.userId, allowed)
        if (!result.ok) return setError(result.error)
        // The checkmark changes only after the server confirms the permission.
        setOperators(current => current?.map(item => item.userId === operator.userId ? { ...item, allowed } : item) ?? null)
        setSaved(`${operator.name?.trim() || operator.email}: доступ ${allowed ? 'включён' : 'отключён'}.`)
      } catch {
        setError(FAILURE)
      } finally {
        inFlight.current = false
        setSavingId(null)
      }
    })
  }

  return (
    <section className="rounded-xl border border-sand-200 bg-white">
      <button type="button" aria-expanded={open} aria-controls={`${id}-panel`}
        onClick={() => {
          setOpen(previous => !previous)
          if (!open && operators === null) load()
        }}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:bg-sand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400">
        <span>Кто отвечает на общие вопросы</span>
        <ShellIcon name="chevron" className={`size-4 shrink-0 text-ink-muted transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open ? (
        <div id={`${id}-panel`} className="space-y-3 px-4 pb-4" aria-busy={pending}>
          <p id={`${id}-description`} className="max-w-3xl text-xs leading-5 text-ink-muted">Владельцы бизнеса и выбранные участники команды. Доступ к перепискам по заказам и записям определяется отдельно.</p>
          {operators ? operators.length ? (
            <ul className="divide-y divide-sand-100">
              {operators.map(operator => (
                <li key={operator.userId} className="py-2 first:pt-0 last:pb-0">
                  <label className={`flex items-start gap-3 text-sm ${pending ? 'opacity-60' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={operator.allowed} disabled={pending}
                      aria-label={`Разрешить отвечать: ${operator.name?.trim() || operator.email}`}
                      aria-describedby={`${id}-description`}
                      onChange={event => update(operator, event.currentTarget.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-sage-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-ink">{operator.name?.trim() || operator.email}</span>
                      {operator.name?.trim() ? <span className="block break-all text-xs text-ink-muted">{operator.email}</span> : null}
                    </span>
                    {savingId === operator.userId ? <span role="status" className="shrink-0 text-xs text-ink-muted">Сохраняем…</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">Пока нет участников с ролью редактора. Владельцы бизнеса уже могут отвечать.</p>
          ) : pending ? <p role="status" className="text-sm text-ink-muted">Загружаем участников…</p> : null}
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          {saved ? <p role="status" className="text-xs text-sage-700">{saved}</p> : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <button type="button" disabled={pending} onClick={load} className="text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-40">{operators === null ? 'Повторить загрузку' : 'Обновить список'}</button>
            <Link href="/team" className="text-ink-muted underline underline-offset-4 hover:text-ink">Открыть команду</Link>
          </div>
        </div>
      ) : null}
    </section>
  )
}
