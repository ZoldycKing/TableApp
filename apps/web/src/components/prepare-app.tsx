'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { newId } from '@tableapp/schema'
import { createTablesAppAction } from '@/app/app-actions'
import { ownerInput, ownerPrimary } from './owner-ui'

/** One explicit next action, shared by import completion and setup without an app. */
export function PrepareApp({ tables, initialSelected, showTitle = true, onPendingChange }: { tables: readonly { id: string; name: string }[]; initialSelected?: string[]; showTitle?: boolean; onPendingChange?: (pending: boolean) => void }) {
  const [selected, setSelected] = useState(() => initialSelected ?? tables.map(table => table.id))
  const [purpose, setPurpose] = useState<'business' | 'personal'>('business')
  const sources = tables.filter(table => selected.includes(table.id))
  const [name, setName] = useState(sources.length === 1 ? sources[0]!.name : 'Моё приложение')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false), prepared = useRef(new Map<string, string>()), requests = useRef(new Map<string, string>())
  const router = useRouter()
  const prepare = async () => {
    if (!sources.length || !name.trim() || lock.current) return
    lock.current = true; setPending(true); onPendingChange?.(true); setError(null)
    try {
      const key = JSON.stringify([purpose, name.trim(), sources.map(table => table.id)])
      let id = prepared.current.get(key)
      if (!id) {
        const requestId = requests.current.get(key) ?? newId('app')
        requests.current.set(key, requestId)
        const result = await createTablesAppAction({ tableIds: sources.map(table => table.id), name: name.trim(), requestId, purpose })
        if (!result.ok) { setError(result.error); return }
        id = result.appId; prepared.current.set(key, id)
      }
      router.push(`/apps/${encodeURIComponent(id)}`)
    } catch { setError('Не удалось подготовить приложение. Данные уже сохранены. Попробуйте ещё раз.') }
    finally { lock.current = false; setPending(false); onPendingChange?.(false) }
  }
  if (!tables.length) return null
  return <section className="rounded-2xl border border-sand-200 bg-white p-5 sm:p-6" aria-label="Приложение на ваших данных" aria-busy={pending}>
    {showTitle ? <h2 className="text-lg font-semibold">Создайте приложение из таблиц</h2> : null}
    <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">Каждая выбранная таблица станет разделом приложения.</p>
    <fieldset disabled={pending} className="mt-5 flex flex-wrap gap-3"><legend className="mb-2 text-sm font-medium">Кто будет пользоваться</legend>{([['business', 'Для команды'], ['personal', 'Только для меня']] as const).map(([value, label]) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${purpose === value ? 'border-sage-400 bg-sage-50' : 'border-sand-200 bg-white'}`}><input type="radio" name="app-purpose" value={value} checked={purpose === value} onChange={() => { setPurpose(value); setError(null) }} className="size-4 accent-sage-700" />{label}</label>)}</fieldset>
    <p className="mt-3 max-w-xl text-sm leading-6 text-ink-soft">{purpose === 'business' ? 'Сначала доступ будет только у вас. Коллег и их права добавите в настройках перед публикацией.' : 'Приложение будет доступно только по вашей почте.'}</p>
    <label className="mt-4 block max-w-md text-sm text-ink-soft">Название приложения<input maxLength={200} disabled={pending} className={ownerInput} value={name} onChange={event => { setName(event.target.value); setError(null) }} /></label>
    {tables.length > 1 ? <fieldset disabled={pending} className="mt-4 space-y-2"><legend className="mb-2 text-sm font-medium">Разделы приложения</legend>{tables.map(table => <label key={table.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-sand-200 px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(table.id)} className="size-4 accent-sage-700" onChange={event => { setSelected(current => event.target.checked ? [...current, table.id] : current.filter(id => id !== table.id)); setError(null) }} />{table.name}</label>)}</fieldset> : <p className="mt-4 text-sm text-ink-soft">Раздел: <strong className="font-medium text-ink">{tables[0]!.name}</strong></p>}
    {error ? <p role="alert" className="mt-3 text-sm leading-6 text-red-700">{error}</p> : null}
    {!sources.length || sources.length > 20 ? <p className="mt-3 text-sm text-ink-soft">Выберите от 1 до 20 таблиц для приложения.</p> : null}
    <button type="button" disabled={pending || !sources.length || !name.trim() || sources.length > 20} onClick={() => void prepare()} className={`${ownerPrimary} mt-4`}>{pending ? 'Подготавливаем приложение…' : 'Создать приложение'}</button>
  </section>
}
