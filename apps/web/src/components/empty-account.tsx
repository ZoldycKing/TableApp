'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createBusinessAction } from '@/app/business-navigation-actions'
import { signOutMemberAction } from '@/app/auth-actions'
import { isOwnerStartPath, OWNER_START_PATHS, type OwnerStartPath } from '@/lib/owner-start'
import { Logo } from './marketing/logo'
import { ShellIcon } from './shell/icons'
import { StartChoices } from './start-choices'
import { ownerInput, ownerPrimary, ownerSecondary, OwnerField } from './owner-ui'

export function EmptyAccount({ email }: { email: string }) {
  const [path, setPath] = useState<OwnerStartPath | null>(null)
  const [name, setName] = useState('')
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const returnTo = useRef<OwnerStartPath | null>(null)
  const inFlight = useRef(false)
  const storageKey = `tableapp:first-space:${email.toLowerCase()}`
  const ready = loadedKey === storageKey
  useEffect(() => {
    setName(''); setPath(null)
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
      if (saved && typeof saved.name === 'string') setName(saved.name.slice(0, 100))
      if (saved && isOwnerStartPath(saved.path)) setPath(saved.path)
    } catch { /* Storage is optional; the in-memory draft still works. */ }
    setLoadedKey(storageKey)
  }, [storageKey])
  useEffect(() => { if (ready) { try { sessionStorage.setItem(storageKey, JSON.stringify({ path, name })) } catch { /* Do not block creation when storage is unavailable. */ } } }, [ready, storageKey, path, name])
  useEffect(() => {
    if (path) input.current?.focus()
    else if (returnTo.current) {
      const label = OWNER_START_PATHS[returnTo.current].label
      Array.from(document.querySelectorAll<HTMLButtonElement>('main button')).find(button => button.textContent === label)?.focus()
      returnTo.current = null
    }
  }, [path])
  const choose = (next: OwnerStartPath) => { setError(''); setPath(next) }
  const back = () => { returnTo.current = path; setPath(null); setError('') }
  const create = async () => {
    if (inFlight.current || !path || !ready) return
    if (!name.trim()) { setError('Введите название рабочего пространства'); input.current?.focus(); return }
    inFlight.current = true; setPending(true); setError('')
    try {
      const result = await createBusinessAction(name)
      if (result.ok) {
        try { sessionStorage.removeItem(storageKey) } catch { /* Navigation remains available. */ }
        window.location.assign(OWNER_START_PATHS[path].href)
      } else { setError(result.error); input.current?.focus() }
    } catch { setError('Не удалось создать рабочее пространство. Проверьте соединение и попробуйте ещё раз.'); input.current?.focus() }
    finally { inFlight.current = false; setPending(false) }
  }
  return <div className="platform-surface">
    <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
      <Link href="/app" aria-label="TableApp — личный кабинет"><Logo /></Link>
      <div className="flex min-w-0 items-center gap-2 text-sm"><span className="max-w-[60vw] truncate text-ink-soft" title={email}>{email}</span><button type="button" disabled={pending} className="min-h-11 rounded-lg px-3 text-ink-soft hover:bg-sand-100 focus-visible:ring-2 focus-visible:ring-sage-400" onClick={async () => { if (inFlight.current) return; inFlight.current = true; setPending(true); try { await signOutMemberAction(); window.location.assign('/login') } catch { inFlight.current = false; setPending(false); setError('Не удалось выйти. Попробуйте ещё раз.') } }}>Выйти</button></div>
    </header>
    <main className="mx-auto max-w-5xl px-5 pb-12 pt-7 sm:px-8 sm:pt-10">
      {!path ? <><h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">С чего начнём?</h1><StartChoices onChoose={choose} disabled={!ready || pending} /></> : <div className="max-w-xl">
        <button type="button" onClick={back} disabled={pending} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-ink-soft underline decoration-sand-300 underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400"><ShellIcon name="expand" className="size-4 rotate-180" />Выбрать другой способ</button>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Назовите рабочее пространство</h1>
        <p className="mt-4 text-sm leading-6 text-ink-soft">Здесь будут ваши таблицы и приложения. Название используется внутри кабинета.</p>
        <form aria-busy={pending} className="mt-7 space-y-5" onSubmit={event => { event.preventDefault(); void create() }}>
          <OwnerField label="Название рабочего пространства"><input ref={input} value={name} onChange={event => setName(event.target.value)} required maxLength={100} placeholder="Например, «Моя команда» или «Проекты Анны»" className={ownerInput} disabled={pending} aria-invalid={Boolean(error)} aria-describedby={error ? 'start-error start-next' : 'start-next'} /></OwnerField>
          <p id="start-next" className="flex items-start gap-2 text-sm leading-6 text-ink-soft"><ShellIcon name={path === 'import' ? 'table' : path === 'templates' ? 'template' : 'plus'} className="mt-1 size-4 shrink-0 text-sage-700" />{OWNER_START_PATHS[path].description}</p>
          <div className="flex flex-wrap gap-3"><button className={ownerPrimary} disabled={pending || !ready}>{pending ? 'Создаём пространство…' : OWNER_START_PATHS[path].next}</button><button type="button" className={ownerSecondary} disabled={pending} onClick={back}>Назад</button></div>
        </form>
      </div>}
      {error ? <p id="start-error" role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p> : null}
    </main>
  </div>
}
