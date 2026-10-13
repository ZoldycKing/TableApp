'use client'

import { useEffect, useRef, useState } from 'react'
import { readCustomerDirectoryAction } from '@/app/customer-history-actions'
import type { CustomerDirectoryPage } from '@/lib/customer-history-types'
import { Avatar, EmptyState } from './ui'
import { Icon } from './icons'

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
  const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 focus-visible:ring-offset-2'
  return <section className="@container space-y-5" aria-label="Клиенты" aria-busy={pending}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0"><h2 className="text-xl font-semibold tracking-tight @min-[640px]:text-2xl">Ваши клиенты</h2><p className="mt-1.5 max-w-xs text-pretty text-[13px] leading-relaxed text-ink-muted">Контакты и история обращений в одном месте.</p></div>
      {onCreate ? <button type="button" aria-label="Добавить клиента" className={`mt-0.5 flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sage-700 px-3 py-2.5 text-[13px] font-medium text-white shadow-xs transition-[filter,transform] hover:brightness-110 active:scale-[0.98] motion-reduce:transition-none @min-[580px]:px-4 @min-[580px]:text-sm ${focus}`} onClick={onCreate}><Icon name="plus" className="size-4" /><span className="@min-[580px]:hidden">Добавить</span><span className="hidden @min-[580px]:inline">Добавить клиента</span></button> : null}
    </div>
    <div className="flex min-w-0 items-center gap-2">
        <form className="flex min-w-0 flex-1 items-center rounded-xl border border-sand-300 bg-white p-1 shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-sage-200" onSubmit={event => { event.preventDefault(); setFilter(query); void read(query) }}>
          <Icon name="search" className="ml-2.5 size-4 shrink-0 text-ink-muted" />
          <input aria-label="Поиск клиента" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="Имя, почта или телефон" className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-sm outline-none placeholder:text-ink-muted" />
          <button disabled={pending} className={`shrink-0 rounded-lg bg-sand-100 px-3 py-2.5 text-xs font-medium text-ink-soft transition-colors hover:bg-sand-200 hover:text-ink disabled:opacity-40 ${focus}`}>Найти</button>
        </form>
        <button type="button" aria-label="Обновить" title="Обновить список клиентов" disabled={pending} className={`flex size-11 shrink-0 items-center justify-center rounded-xl border border-sand-200 bg-white text-ink-muted transition-colors hover:bg-sand-100 hover:text-ink disabled:opacity-40 ${focus}`} onClick={() => void read(filter)}>
          <Icon name="refresh" className={`size-4 ${pending ? 'motion-safe:animate-spin' : ''}`} />
        </button>
    </div>
    {error ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><Icon name="info" className="mt-0.5 size-4 shrink-0" /><p>{error}</p></div> : null}
    {pending ? <p role="status" className={page ? 'text-xs text-ink-muted' : 'sr-only'}>Загружаем клиентов…</p> : null}
    {pending && !page ? <div aria-hidden className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-200 bg-white">
      {[0, 1, 2].map(index => <div key={index} className="flex items-center gap-3 px-4 py-5 motion-safe:animate-pulse sm:px-5"><span className="size-10 shrink-0 rounded-full bg-sand-100" /><span className="flex-1 space-y-2"><span className="block h-3 w-1/3 rounded bg-sand-200" /><span className="block h-2.5 w-2/3 rounded bg-sand-100" /></span></div>)}
    </div> : null}
    {page?.items.length ? <div className="@min-[640px]:overflow-hidden @min-[640px]:rounded-2xl @min-[640px]:border @min-[640px]:border-sand-200 @min-[640px]:bg-white @min-[640px]:shadow-soft">
      <div aria-hidden className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.45fr)_minmax(0,1fr)_6.5rem] gap-x-4 border-b border-sand-200 bg-sand-50/80 px-5 py-3.5 text-xs font-medium text-ink-muted @min-[640px]:grid"><span>Клиент</span><span>Почта</span><span>Телефон</span><span /></div>
      <ul className="space-y-3 @min-[640px]:space-y-0">{page.items.map(item => <li key={item.id} className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-soft @min-[640px]:rounded-none @min-[640px]:border-0 @min-[640px]:border-b @min-[640px]:last:border-b-0 @min-[640px]:shadow-none">
        <button type="button" className={`group grid w-full grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-4 text-left transition-colors duration-200 hover:bg-sand-50 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-500 motion-reduce:transition-none sm:px-5 @min-[640px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1.45fr)_minmax(0,1fr)_6.5rem] @min-[640px]:py-5`} onClick={() => onOpen(item.id)}>
          <span className="mb-1 flex min-w-0 items-center gap-3 @min-[640px]:mb-0"><Avatar name={item.name} email={item.email || item.id} /><span className="min-w-0 break-words text-[15px] font-semibold text-ink">{item.name}</span></span>
          <span className="col-start-1 min-w-0 pl-12 text-[13px] text-ink-soft @min-[640px]:col-start-auto @min-[640px]:pl-0">{item.email ? <span className="flex items-center gap-2"><Icon name="mail" className="size-3.5 shrink-0 text-ink-muted @min-[640px]:hidden" /><span className="min-w-0 [overflow-wrap:anywhere]">{item.email}</span></span> : <span className="hidden text-ink-muted @min-[640px]:inline">—</span>}</span>
          <span className="col-start-1 min-w-0 pl-12 text-[13px] text-ink-soft @min-[640px]:col-start-auto @min-[640px]:pl-0">{item.phone ? <span className="flex items-center gap-2"><Icon name="phone" className="size-3.5 shrink-0 text-ink-muted @min-[640px]:hidden" /><span className="min-w-0 tabular-nums [overflow-wrap:anywhere]">{item.phone}</span></span> : <span className="hidden text-ink-muted @min-[640px]:inline">—</span>}</span>
          <span className="mt-2 flex min-w-0 items-center justify-between gap-2 border-t border-sand-200/70 pt-3 text-[13px] font-medium text-sage-700 @min-[640px]:col-start-4 @min-[640px]:row-start-1 @min-[640px]:mt-0 @min-[640px]:justify-end @min-[640px]:border-0 @min-[640px]:pt-0"><span className="@min-[640px]:hidden">Открыть карточку</span><span className="hidden @min-[640px]:inline">Открыть</span><Icon name="back" className="size-4 shrink-0 rotate-180 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none" /></span>
        </button>
      </li>)}</ul>
    </div> : page && !pending ? <div className="rounded-2xl border border-sand-200 bg-white"><EmptyState icon="users" title={page.next ? 'На этой странице нет доступных клиентов. Загрузите следующую.' : filter ? 'По этому запросу клиентов не найдено.' : 'Клиентов пока нет.'} hint={page.next ? undefined : filter ? 'Попробуйте другое имя, почту или телефон.' : 'Добавьте контакт вручную или поделитесь ссылкой на приложение бизнеса.'}
      action={filter ? <button type="button" className={`rounded-xl border border-sand-200 px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-sand-50 ${focus}`} onClick={() => { setQuery(''); setFilter(''); void read('') }}>Очистить поиск</button> : undefined} /></div> : null}
    {page?.next ? <div className="flex justify-center"><button type="button" disabled={pending} className={`rounded-xl border border-sand-200 bg-white px-5 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-sand-100 disabled:opacity-40 ${focus}`} onClick={() => void read(filter, page.next!)}>Загрузить ещё</button></div> : null}
    <div className="flex max-w-xl items-start gap-2.5 px-1"><Icon name="info" className="mt-0.5 size-4 shrink-0 text-ink-muted/70" /><p className="text-pretty text-xs leading-relaxed text-ink-muted">Клиенты, которые вошли в приложение вашего бизнеса, появляются здесь автоматически. Контакт можно также добавить вручную.</p></div>
  </section>
}
