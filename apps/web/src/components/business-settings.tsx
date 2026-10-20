'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BusinessProfile } from '@tableapp/schema'
import { saveBusinessProfileAction } from '@/app/business-actions'

const emptyProfile: BusinessProfile = { name: '', location: '', phone: '' }
const profileKey = (profile: BusinessProfile) => JSON.stringify([profile.name, profile.location, profile.phone])

export function BusinessSettings({ profile, canEdit = true, nextHref, setup = false }: { profile: BusinessProfile | null; canEdit?: boolean; nextHref?: string; setup?: boolean }) {
  const [value, setValue] = useState(profile ?? emptyProfile)
  const [saved, setSaved] = useState(profile ?? emptyProfile)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const saving = useRef(false)
  const dirty = canEdit && profileKey(value) !== profileKey(saved)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const router = useRouter()

  useEffect(() => {
    // A refresh may deliver a new server snapshot while the user is editing.
    // Keep the draft until it is saved or the user agrees to leave it behind.
    if (dirtyRef.current) return
    const incoming = profile ?? emptyProfile
    setValue(incoming)
    setSaved(incoming)
  }, [profile?.name, profile?.location, profile?.phone])

  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    const leave = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : null
      const link = target?.closest<HTMLAnchorElement>('a[href]')
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
      const destination = new URL(link.href, window.location.href)
      if (destination.protocol !== 'http:' && destination.protocol !== 'https:') return
      // Jumping to another section of the same document does not discard a form.
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return
      if (!window.confirm('Данные бизнеса ещё не сохранены. Отменить изменения и перейти на другую страницу?')) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      // Let NextLink or the browser navigate normally, without a second unload prompt.
      dirtyRef.current = false
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', leave, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', leave, true)
    }
  }, [dirty])

  const field = (key: 'name' | 'location' | 'phone') => <label key={key} className={`block space-y-1 ${setup ? 'text-sm text-ink-soft' : 'text-xs text-ink-muted'}`}>
    <span>{key === 'name' ? setup ? 'Название компании' : 'Название бизнеса' : key === 'location' ? 'Адрес или филиал (необязательно)' : 'Телефон бизнеса (необязательно)'}</span>
    <input disabled={!canEdit || pending} required={key === 'name'} maxLength={key === 'name' ? 100 : key === 'location' ? 160 : 40} value={value[key]} onChange={event => {
      if (!canEdit || pending) return
      setValue({ ...value, [key]: event.target.value })
      setMessage(null)
    }} className={`min-h-11 w-full rounded-lg border border-sand-300 px-3 py-2 text-ink outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-100 disabled:bg-sand-50 ${setup ? 'text-base' : 'text-sm'}`} />
  </label>
  return <form aria-busy={pending} className={`mb-6 rounded-2xl border border-sand-200 bg-white ${setup ? 'space-y-5 p-5 sm:p-6' : 'space-y-3 p-4'}`} onSubmit={event => {
    event.preventDefault()
    if (!canEdit || saving.current) return
    if (!dirty) { if (nextHref && saved.name.trim()) router.push(nextHref); return }
    saving.current = true
    setMessage(null)
    const snapshot = { name: value.name.trim(), location: value.location.trim(), phone: value.phone.trim() }
    startTransition(async () => {
      try {
        const result = await saveBusinessProfileAction(snapshot)
        if (!result.ok) {
          setMessage({ kind: 'error', text: result.error })
          return
        }
        setValue(snapshot)
        setSaved(snapshot)
        dirtyRef.current = false
        setMessage({ kind: 'success', text: 'Данные бизнеса сохранены' })
        if (nextHref) router.push(nextHref)
        router.refresh()
      } catch {
        setMessage({ kind: 'error', text: 'Не удалось сохранить данные бизнеса. Проверьте соединение и повторите попытку. Введённые данные остались в форме.' })
      } finally {
        saving.current = false
      }
    })
  }}>
    {!setup ? <><h2 className="text-sm font-semibold">Данные бизнеса</h2><p className="text-xs text-ink-muted">Эти данные видят клиенты во всех приложениях этого бизнеса. Название рабочего пространства остаётся внутренним. Изменения вступают в силу сразу.</p></> : null}
    {!canEdit ? <p className="text-xs text-ink-muted">Изменить данные может владелец или редактор рабочего пространства.</p> : null}
    {setup ? <>{field('name')}<p className="text-xs leading-5 text-ink-soft">Название общее для приложений этой компании. Имя рабочего пространства останется прежним. Сохранённые изменения видны сразу.</p><details open={profile?.location || profile?.phone ? true : undefined}><summary className="cursor-pointer rounded text-sm text-ink-soft focus-visible:ring-2 focus-visible:ring-sage-400">Адрес и телефон — необязательно</summary><div className="mt-4 space-y-4">{field('location')}{field('phone')}</div></details></> : <div className={`grid gap-4 ${nextHref ? '' : 'sm:grid-cols-3'}`}>{(['name', 'location', 'phone'] as const).map(field)}</div>}
    {message ? <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-red-700' : 'text-ink-soft'}`}>{message.text}</p> : dirty ? <p role="status" className="text-xs text-ink-muted">Есть несохранённые изменения</p> : null}
    {canEdit ? <button disabled={pending || (!dirty && !nextHref)} className="min-h-11 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">{pending ? 'Сохраняем…' : nextHref ? 'Сохранить и продолжить' : 'Сохранить данные бизнеса'}</button> : null}
  </form>
}
