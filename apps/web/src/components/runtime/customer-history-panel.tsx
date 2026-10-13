'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { readCustomerHistoryAction } from '@/app/customer-history-actions'
import type { CustomerHistoryItem, CustomerHistoryPage } from '@/lib/customer-history-types'
import { CHOICE_COLORS } from '@/components/views/card'
import { Avatar, EmptyState } from './ui'
import { Icon } from './icons'

const MODULE_ICONS: Record<string, string> = { booking: 'calendar', sales: 'box', delivery: 'truck', repair: 'wrench', crm: 'deal', property: 'home', field_service: 'wrench', support: 'chat', requests: 'inbox' }

function HistoryRecord({ item, id, business, unified, onOpen }: { item: CustomerHistoryItem; id: string; business: boolean; unified: boolean; onOpen?: (item: CustomerHistoryItem) => void }) {
  const content = <>
    <span id={`${id}-meta`} className="flex flex-wrap items-center justify-between gap-2.5">
      <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-ink-muted"><Icon name={MODULE_ICONS[item.kind] ?? 'file'} className="size-4 shrink-0" />{item.module}</span>
      {item.status ? <span className={`max-w-full rounded-lg px-2.5 py-1 text-xs font-medium leading-relaxed [overflow-wrap:anywhere] ${CHOICE_COLORS[item.statusColor ?? ''] ?? 'bg-sand-100 text-ink-soft'}`}>{item.status}</span> : null}
    </span>
    <span id={`${id}-title`} className="mt-3 block text-[15px] font-semibold leading-relaxed text-ink [overflow-wrap:anywhere]">{item.title}</span>
    <span className="mt-4 flex flex-wrap items-center justify-between gap-3">
      {item.when ? <span id={`${id}-date`} className="flex items-center gap-1.5 text-xs text-ink-muted"><Icon name="calendar" className="size-3.5 shrink-0" />{item.when}</span> : null}
      <span className="ml-auto flex items-center gap-1.5 text-[13px] font-medium text-sage-700">Открыть<Icon name="back" className="size-3.5 rotate-180 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none" /></span>
    </span>
  </>
  const className = `group block h-full w-full rounded-2xl border border-sand-200 bg-white p-4 text-left shadow-soft transition-[border-color,box-shadow] duration-200 hover:border-sage-300 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 focus-visible:ring-offset-2 motion-reduce:transition-none sm:p-5 ${unified ? '@min-[740px]:bg-sand-50 @min-[740px]:shadow-none @min-[740px]:hover:shadow-none' : ''}`
  const description = `${id}-meta${item.when ? ` ${id}-date` : ''}`
  return business ? <a className={className} aria-labelledby={`${id}-title`} aria-describedby={description} href={`/t/${encodeURIComponent(item.tableId)}?r=${encodeURIComponent(item.id)}`}>{content}</a>
    : <button type="button" className={className} aria-labelledby={`${id}-title`} aria-describedby={description} onClick={() => onOpen?.(item)}>{content}</button>
}

export function CustomerHistoryPanel({ tableId, rowId, slug, business = false, profile = false, onOpen }: {
  tableId: string; rowId: string; slug?: string; business?: boolean; profile?: boolean; onOpen?: (item: CustomerHistoryItem) => void
}) {
  const [open, setOpen] = useState(profile), [page, setPage] = useState<CustomerHistoryPage | null>(null)
  const [kind, setKind] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const historyId = useId()
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
  const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 focus-visible:ring-offset-2'
  if (!open) return <section className="mt-4" aria-label="История клиента"><button type="button" className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-sand-200 bg-white p-4 text-sm font-medium text-sage-700 shadow-soft transition-colors hover:bg-sand-50 ${focus}`} onClick={() => { setOpen(true); void read('') }}><span className="flex items-center gap-2"><Icon name="calendar" className="size-4" />История клиента</span><Icon name="back" className="size-4 rotate-180" /></button></section>
  return <section className="@container mt-4" aria-label="История клиента" aria-busy={pending}>
    <div className={`grid min-w-0 gap-5 ${profile ? '@min-[740px]:gap-0 @min-[740px]:rounded-3xl @min-[740px]:border @min-[740px]:border-sand-200 @min-[740px]:bg-white @min-[740px]:p-6 @min-[740px]:shadow-soft' : ''}`}>
      {profile && page ? <aside className="min-w-0 self-start rounded-2xl border border-sand-200 bg-white p-5 shadow-soft @min-[740px]:grid @min-[740px]:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] @min-[740px]:items-center @min-[740px]:gap-6 @min-[740px]:rounded-none @min-[740px]:border-0 @min-[740px]:border-b @min-[740px]:bg-transparent @min-[740px]:p-0 @min-[740px]:pb-6 @min-[740px]:shadow-none" aria-label="Контакты клиента">
        <div className="flex items-center gap-3.5"><Avatar name={page.customer.name} email={page.customer.email ?? `${tableId}:${rowId}`} size="l" /><div className="min-w-0"><p className="mb-1 text-xs text-ink-muted">Клиент</p><h2 className="break-words text-xl font-semibold leading-tight">{page.customer.name}</h2></div></div>
        {page.customer.email || page.customer.phone ? <dl className="mt-5 space-y-4 border-t border-sand-200 pt-5 @min-[740px]:m-0 @min-[740px]:grid @min-[740px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @min-[740px]:gap-5 @min-[740px]:space-y-0 @min-[740px]:border-0 @min-[740px]:p-0">
          {page.customer.email ? <div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sand-50 text-ink-muted"><Icon name="mail" className="size-4" /></span><div className="min-w-0"><dt className="text-xs text-ink-muted">Почта</dt><dd className="mt-1 text-[13px] text-ink-soft [overflow-wrap:anywhere]">{page.customer.email}</dd></div></div> : null}
          {page.customer.phone ? <div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sand-50 text-ink-muted"><Icon name="phone" className="size-4" /></span><div className="min-w-0"><dt className="text-xs text-ink-muted">Телефон</dt><dd className="mt-1 text-[13px] tabular-nums text-ink-soft [overflow-wrap:anywhere]">{page.customer.phone}</dd></div></div> : null}
        </dl> : null}
      </aside> : profile && pending ? <div aria-hidden className="space-y-4 self-start rounded-2xl border border-sand-200 bg-white p-5 motion-safe:animate-pulse @min-[740px]:rounded-none @min-[740px]:border-0 @min-[740px]:border-b @min-[740px]:p-0 @min-[740px]:pb-6"><span className="block size-14 rounded-full bg-sand-100" /><span className="block h-3 w-2/3 rounded bg-sand-200" /><span className="block h-3 w-1/2 rounded bg-sand-100" /></div> : null}
      <div className={`min-w-0 space-y-4 ${profile && (page || pending) ? '@min-[740px]:pt-6' : ''}`}>
        <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 ${profile ? '@min-[740px]:grid-cols-[minmax(0,1fr)_auto_auto]' : ''}`}>
          <h3 className="text-lg font-semibold">{profile ? 'Обращения клиента' : 'История клиента'}</h3>
          <button type="button" aria-label="Обновить" title="Обновить историю" disabled={pending} className={`flex size-10 shrink-0 items-center justify-center rounded-xl border border-sand-200 bg-white text-ink-muted transition-colors hover:bg-sand-100 hover:text-ink disabled:opacity-40 ${profile ? '@min-[740px]:col-start-3 @min-[740px]:row-start-1' : ''} ${focus}`} onClick={() => void read(kind)}><Icon name="refresh" className={`size-4 ${pending ? 'motion-safe:animate-spin' : ''}`} /></button>
          {page && page.kinds.length > 1 ? <label className={`col-span-2 block ${profile ? '@min-[740px]:col-span-1 @min-[740px]:col-start-2 @min-[740px]:row-start-1 @min-[740px]:w-56' : ''}`}><span className="sr-only">Тип обращения</span><select aria-label="Тип обращения" value={kind} disabled={pending} className={`w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-sm text-ink-soft disabled:opacity-40 ${focus}`} onChange={event => { setKind(event.target.value); void read(event.target.value) }}><option value="">Все обращения</option>{page.kinds.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
        </div>
        {error ? <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><Icon name="info" className="mt-0.5 size-4 shrink-0" /><p>{error}</p></div> : null}
        {pending ? <p role="status" className={page ? 'text-xs text-ink-muted' : 'sr-only'}>Загружаем историю…</p> : null}
        {pending && !page ? <div aria-hidden className="space-y-3">{[0, 1].map(index => <div key={index} className="space-y-3 rounded-2xl border border-sand-200 bg-white p-5 motion-safe:animate-pulse"><span className="block h-2.5 w-1/3 rounded bg-sand-100" /><span className="block h-3 w-3/4 rounded bg-sand-200" /><span className="block h-2.5 w-1/2 rounded bg-sand-100" /></div>)}</div> : null}
        {page?.items.length ? <ul className={`space-y-3 ${profile ? '@min-[740px]:grid @min-[740px]:grid-cols-2 @min-[740px]:gap-3 @min-[740px]:space-y-0' : ''}`}>{page.items.map((item, index) => <li key={item.id}><HistoryRecord item={item} id={`${historyId}-${index}`} business={business} unified={profile} onOpen={onOpen} /></li>)}</ul> : page && !pending ? <div className="rounded-2xl border border-sand-200 bg-white"><EmptyState icon="inbox" title={page.reason ?? (page.next ? 'На этой странице нет доступных обращений. Можно загрузить следующую.' : 'Доступных обращений пока нет.')} /></div> : null}
        {page?.next ? <button type="button" disabled={pending} className={`w-full rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-sand-100 disabled:opacity-40 ${focus}`} onClick={() => void read(kind, page.next!)}>Загрузить ещё</button> : null}
        <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-ink-muted"><Icon name="info" className="mt-0.5 size-3.5 shrink-0" /><span>Обращения этого клиента в вашем бизнесе с текущими статусами. Показаны только записи, доступные вашей роли.</span></p>
      </div>
    </div>
  </section>
}
