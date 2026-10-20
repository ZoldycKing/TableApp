'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createBusinessAction } from '@/app/business-navigation-actions'
import { signOutMemberAction } from '@/app/auth-actions'
import { Logo } from './marketing/logo'
import { ownerInput, ownerPrimary, ownerSecondary, OwnerField } from './owner-ui'

export function EmptyAccount({ email }: { email: string }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)
  useEffect(() => { if (adding) input.current?.focus() }, [adding])
  const create = async () => {
    if (inFlight.current) return
    inFlight.current = true; setPending(true); setError('')
    try {
      const result = await createBusinessAction(name)
      if (result.ok) window.location.assign(result.href)
      else setError(result.error)
    } catch { setError('Не удалось создать бизнес. Попробуйте ещё раз.') }
    finally { inFlight.current = false; setPending(false) }
  }
  return <div className="min-h-dvh bg-sand-50">
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link href="/app" aria-label="TableApp — личный кабинет"><Logo /></Link>
      <div className="flex min-w-0 items-center gap-3 text-sm"><span className="max-w-[65vw] truncate text-ink-soft" title={email}>{email}</span><button type="button" disabled={pending} className="min-h-11 rounded-lg px-3 text-ink-soft hover:bg-sand-100 focus-visible:ring-2 focus-visible:ring-sage-400" onClick={async () => { if (inFlight.current) return; inFlight.current = true; setPending(true); try { await signOutMemberAction(); window.location.assign('/login') } catch { inFlight.current = false; setPending(false); setError('Не удалось выйти. Попробуйте ещё раз.') } }}>Выйти</button></div>
    </header>
    <main className="mx-auto max-w-xl px-5 py-16 sm:py-24">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Начните со своего бизнеса</h1>
      <p className="mt-4 text-sm leading-6 text-ink-soft">Бизнесов пока нет. Создайте первый — затем сможете загрузить таблицу Excel или выбрать готовый сценарий.</p>
      {adding ? <form className="mt-7 space-y-4" onSubmit={event => { event.preventDefault(); void create() }}>
        <OwnerField label="Название бизнеса"><input ref={input} value={name} onChange={event => setName(event.target.value)} required maxLength={100} autoComplete="organization" placeholder="Например, студия «Линия»" className={ownerInput} disabled={pending} /></OwnerField>
        <div className="flex flex-wrap gap-3"><button className={ownerPrimary} disabled={pending}>{pending ? 'Создаём…' : 'Создать бизнес'}</button><button type="button" className={ownerSecondary} disabled={pending} onClick={() => { setAdding(false); setError('') }}>Отмена</button></div>
      </form> : <button type="button" className={`${ownerPrimary} mt-7`} disabled={pending} onClick={() => setAdding(true)}>Создать бизнес</button>}
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
    </main>
  </div>
}
