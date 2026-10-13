'use client'

import { useEffect, useRef, useState } from 'react'
import { readCustomerDirectoryAction } from '@/app/customer-history-actions'
import type { CustomerDirectoryPage } from '@/lib/customer-history-types'

export function CustomerDirectory({ tableId, slug, onOpen, onCreate }: { tableId: string; slug: string; onOpen: (id: string) => void; onCreate?: () => void }) {
  const [page, setPage] = useState<CustomerDirectoryPage | null>(null), [query, setQuery] = useState(''), [filter, setFilter] = useState('')
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null), generation = useRef(0)
  const read = async (search: string, before?: string) => {
    const request = ++generation.current
    setPending(true); setError(null)
    if (!before) setPage(null)
    try {
      const result = await readCustomerDirectoryAction({ tableId, slug, query: search, before })
      if (generation.current !== request) return
      if (!result.ok) { setPage(null); setError(result.error); return }
      setPage(previous => before && previous ? { ...result.page, items: [...new Map([...previous.items, ...result.page.items].map(item => [item.email?.trim().toLowerCase() || item.id, item])).values()] } : result.page)
    } catch { if (generation.current === request) { setPage(null); setError('Не удалось загрузить клиентов. Повторите попытку.') } }
    finally { if (generation.current === request) setPending(false) }
  }
  useEffect(() => {
    setQuery(''); setFilter(''); void read('')
    return () => { generation.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, slug])
  return <section className="space-y-4" aria-label="Клиенты">
    {onCreate ? <div className="flex justify-end"><button type="button" className="rounded-xl bg-sage-700 px-4 py-2 text-sm font-medium text-white" onClick={onCreate}>Добавить клиента</button></div> : null}
    <p className="text-sm leading-relaxed text-ink-soft">Клиенты, которые вошли в приложение вашего бизнеса, появляются здесь автоматически. Контакт можно также добавить вручную.</p>
    <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setFilter(query); void read(query) }}>
      <input aria-label="Поиск клиента" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="Имя, почта или телефон" className="min-w-0 flex-1 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm" />
      <button disabled={pending} className="rounded-xl border border-sand-200 px-4 py-2 text-sm disabled:opacity-40">Найти</button>
      <button type="button" disabled={pending} className="px-2 text-xs text-sage-700 underline disabled:opacity-40" onClick={() => void read(filter)}>Обновить</button>
    </form>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}{pending ? <p role="status" className="text-sm text-ink-muted">Загружаем клиентов…</p> : null}
    {page?.items.length ? <ul className="divide-y divide-sand-200 rounded-2xl border border-sand-200 bg-white">{page.items.map(item => <li key={item.id}>
      <button type="button" className="w-full px-4 py-4 text-left transition-colors hover:bg-sand-50 [overflow-wrap:anywhere]" onClick={() => onOpen(item.id)}>
        <span className="block text-sm font-semibold">{item.name}</span>{item.email ? <span className="mt-1 block text-xs text-ink-soft">{item.email}</span> : null}{item.phone ? <span className="mt-1 block text-xs text-ink-muted">{item.phone}</span> : null}
      </button></li>)}</ul> : page && !pending ? <p className="text-sm text-ink-soft">{page.next ? 'На этой странице нет доступных клиентов. Загрузите следующую.' : filter ? 'По этому запросу клиентов не найдено.' : 'Клиентов пока нет.'}</p> : null}
    {page?.next ? <button type="button" disabled={pending} className="rounded-xl border border-sand-200 px-4 py-2 text-sm disabled:opacity-40" onClick={() => void read(filter, page.next!)}>Загрузить ещё</button> : null}
  </section>
}
