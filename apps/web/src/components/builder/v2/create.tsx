'use client'
import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { newId } from '@tableapp/schema'
import { createBuilderV2AppAction } from '@/app/builder-v2-actions'
import { ownerPrimary } from '@/components/owner-ui'

export function CreateBuilderV2App() {
  const [name, setName] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('')
  const requestId = useRef<string | null>(null), busy = useRef(false), router = useRouter()
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy.current || !name.trim()) return
    busy.current = true; setPending(true); setError(''); requestId.current ??= newId('app')
    try { const result = await createBuilderV2AppAction({ requestId: requestId.current, name }); if (!result.ok) setError(result.error); else { router.push(`/apps/${result.appId}`); router.refresh() } }
    catch { setError('Не удалось создать приложение. Проверьте соединение и попробуйте ещё раз.') }
    finally { busy.current = false; setPending(false) }
  }
  return <form onSubmit={submit} className="rounded-2xl border border-sand-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-semibold">Своё приложение с нуля</h2><p className="mt-3 text-sm leading-6 text-ink-soft">Добавьте экраны и элементы. Таблицы можно выбрать позже.</p><p className="mt-2 text-xs leading-5 text-ink-muted">Предварительная версия: можно собрать экраны и посмотреть свои данные. Действия и публикация будут доступны позже.</p><label className="mt-6 grid gap-2 text-sm">Название приложения<input autoComplete="off" className="min-h-11 rounded-lg border border-sand-200 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-sage-400" required maxLength={200} value={name} onChange={event => setName(event.target.value)} placeholder="Например, Мои проекты" /></label>{error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}<button className={`${ownerPrimary} mt-6`} type="submit" disabled={pending || !name.trim()}>{pending ? 'Создаём…' : 'Открыть конструктор'}</button></form>
}
