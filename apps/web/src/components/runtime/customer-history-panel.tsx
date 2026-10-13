'use client'

import { useEffect, useRef, useState } from 'react'
import { readCustomerHistoryAction } from '@/app/customer-history-actions'
import type { CustomerHistoryItem, CustomerHistoryPage } from '@/lib/customer-history-types'

export function CustomerHistoryPanel({ tableId, rowId, slug, business = false, profile = false, onOpen }: {
  tableId: string; rowId: string; slug?: string; business?: boolean; profile?: boolean; onOpen?: (item: CustomerHistoryItem) => void
}) {
  const [open, setOpen] = useState(profile), [page, setPage] = useState<CustomerHistoryPage | null>(null)
  const [kind, setKind] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const read = async (filter: string, before?: string) => {
    const request = ++generation.current
    setPending(true); setError(null)
    if (!before) setPage(null)
    try {
      const result = await readCustomerHistoryAction({ tableId, rowId, slug, kind: filter || undefined, before }, business)
      if (generation.current !== request) return
      if (!result.ok) { setPage(null); setError(result.error); return }
      setPage(previous => result.page && before && previous ? { ...result.page, items: [...new Map([...previous.items, ...result.page.items].map(item => [item.id, item])).values()] } : result.page)
    } catch { if (generation.current === request) { setPage(null); setError('Не удалось загрузить историю. Повторите попытку.') } }
    finally { if (generation.current === request) setPending(false) }
  }
  useEffect(() => {
    setOpen(profile); setKind(''); setPage(null); setError(null); setPending(false)
    if (profile) void read('')
    return () => { generation.current++ }
    // Source changes invalidate every in-flight page, including the initial profile request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, rowId, slug, business, profile])
  return <section className="mt-4 space-y-4 rounded-2xl border border-sand-200 bg-white p-4 sm:p-5" aria-label="История клиента">
    {!open ? <button type="button" className="text-sm font-medium text-sage-700" onClick={() => { setOpen(true); void read('') }}>История клиента</button> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">История клиента</h3>
        <button type="button" disabled={pending} className="text-xs text-sage-700 underline disabled:opacity-40" onClick={() => void read(kind)}>Обновить</button></div>
      {page && profile ? <div className="space-y-1 break-words"><h2 className="font-display text-xl font-bold">{page.customer.name}</h2>
        {page.customer.email ? <p className="text-sm text-ink-soft">{page.customer.email}</p> : null}{page.customer.phone ? <p className="text-sm text-ink-soft">{page.customer.phone}</p> : null}</div> : null}
      <p className="text-xs leading-relaxed text-ink-muted">Обращения этого клиента в вашем бизнесе с текущими статусами. Показаны только записи, доступные вашей роли.</p>
      {page && page.kinds.length > 1 ? <label className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">Возможность
        <select aria-label="Тип обращения" value={kind} disabled={pending} className="max-w-full rounded-lg border border-sand-200 bg-white p-2 text-sm" onChange={event => { setKind(event.target.value); void read(event.target.value) }}>
          <option value="">Все</option>{page.kinds.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {pending ? <p role="status" className="text-sm text-ink-muted">Загружаем историю…</p> : null}
      {page?.items.length ? <ul className="divide-y divide-sand-200">{page.items.map(item => <li key={item.id} className="py-3 first:pt-0">
        <p className="mb-1 text-xs text-ink-muted">{item.module}</p>
        {business ? <a className="break-words text-sm font-medium text-sage-700 underline" href={`/t/${encodeURIComponent(item.tableId)}?r=${encodeURIComponent(item.id)}`}>{item.title}</a> : <button type="button" className="text-left text-sm font-medium text-sage-700 underline [overflow-wrap:anywhere]" onClick={() => onOpen?.(item)}>{item.title}</button>}
        {item.status ? <p className="mt-1 text-sm text-ink-soft">{item.status}</p> : null}{item.when ? <p className="mt-1 text-xs text-ink-muted">{item.when}</p> : null}
      </li>)}</ul> : page && !pending ? <p className="text-sm text-ink-soft">{page.reason ?? (page.next ? 'На этой странице нет доступных обращений. Можно загрузить следующую.' : 'Доступных обращений пока нет.')}</p> : null}
      {page?.next ? <button type="button" disabled={pending} className="rounded-xl border border-sand-200 px-4 py-2 text-sm disabled:opacity-40" onClick={() => void read(kind, page.next!)}>Загрузить ещё</button> : null}
    </>}
  </section>
}
