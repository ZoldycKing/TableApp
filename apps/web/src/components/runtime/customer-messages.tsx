'use client'

import { useEffect, useRef, useState } from 'react'
import { listConversationInboxAction } from '@/app/conversation-actions'
import type { ConversationInboxPage, ConversationSummary } from '@/lib/conversation-types'
import { Icon } from './icons'
import { EmptyState } from './ui'
import { ConversationPanel } from './conversation-panel'

export function CustomerMessages({ tableId, rowId, slug, business, onOpen }: {
  tableId: string; rowId: string; slug?: string; business: boolean; onOpen?: (item: ConversationSummary) => void
}) {
  const [page, setPage] = useState<ConversationInboxPage | null>(null), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const [selected, setSelected] = useState<ConversationSummary | null>(null)
  const load = async (before?: string) => {
    const request = ++generation.current
    setPending(true); setError(null)
    if (!before) setPage(null)
    try {
      const result = await listConversationInboxAction({ slug, customer: { tableId, rowId }, before }, business)
      if (generation.current !== request) return
      if (!result.ok) { setPage(null); setSelected(null); setError(result.error); return }
      setPage(previous => before && previous ? { ...result.value, items: [...new Map([...previous.items, ...result.value.items].map(item => [item.id, item])).values()] } : result.value)
    } catch { if (generation.current === request) { setPage(null); setSelected(null); setError('Не удалось загрузить обращения. Повторите попытку.') } }
    finally { if (generation.current === request) setPending(false) }
  }
  useEffect(() => {
    setPage(null); setSelected(null); setError(null); void load()
    return () => { generation.current++ }
    // A new source must discard both old messages and late responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, rowId, slug, business])
  const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 focus-visible:ring-offset-2'
  if (selected) return <div><button type="button" onClick={() => setSelected(null)} className={`mb-3 inline-flex items-center gap-1 text-sm text-sage-700 ${focus}`}><Icon name="back" className="size-4" />Все обращения клиента</button><ConversationPanel key={selected.id} slug={selected.slug} tableId={selected.tableId} rowId={selected.rowId} business={business} configured showContext /></div>
  return <div className="space-y-3" aria-busy={pending}>
    <p className="text-xs leading-relaxed text-ink-muted">Сообщения и вопросы этого клиента вашему бизнесу.</p>
    {error ? <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button type="button" onClick={() => void load()} className={`font-medium underline ${focus}`}>Повторить попытку</button></div> : null}
    {pending ? <p role="status" className={page ? 'text-xs text-ink-muted' : 'sr-only'}>Загружаем обращения…</p> : null}
    {pending && !page ? <div aria-hidden className="space-y-3">{[0, 1].map(index => <div key={index} className="space-y-3 rounded-2xl border border-sand-200 bg-white p-5 motion-safe:animate-pulse"><span className="block h-3 w-2/3 rounded bg-sand-200" /><span className="block h-2.5 w-3/4 rounded bg-sand-100" /></div>)}</div> : null}
    {page?.items.length ? <ul className="space-y-3">{page.items.map(item => {
      const content = <><span className="flex items-start justify-between gap-3"><span className="flex min-w-0 items-start gap-2"><Icon name="chat" className="mt-0.5 size-4 shrink-0 text-ink-muted" /><span className="text-[15px] font-semibold leading-relaxed [overflow-wrap:anywhere]">{item.title}</span></span>{item.unread ? <span aria-label={`Непрочитанных сообщений: ${item.unread}`} className="shrink-0 rounded-lg bg-sage-100 px-2 py-1 text-xs font-medium text-sage-800">{item.unread}</span> : null}</span>
        <span className="mt-2 block line-clamp-2 text-sm leading-relaxed text-ink-soft [overflow-wrap:anywhere]">{item.preview}</span>
        <span className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted"><span>{new Date(item.lastAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{item.closed ? ' · Завершено' : ''}</span><span className="flex items-center gap-1.5 font-medium text-sage-700">Открыть чат<Icon name="back" className="size-3.5 rotate-180" /></span></span></>
      const className = `block w-full rounded-2xl border border-sand-200 bg-white p-4 text-left shadow-soft transition-colors hover:border-sage-300 @min-[740px]:bg-sand-50 @min-[740px]:shadow-none sm:p-5 ${focus}`
      return <li key={item.id}><button type="button" className={className} onClick={() => onOpen ? onOpen(item) : setSelected(item)} aria-label={`Открыть чат: ${item.title}`}>{content}</button></li>
    })}</ul> : page && !pending ? <div className="rounded-2xl border border-sand-200 bg-white"><EmptyState icon="chat" title={page.next ? 'На этой странице доступных обращений нет.' : 'Клиент пока не писал.'} /></div> : null}
    {page?.next ? <button type="button" disabled={pending} onClick={() => void load(page.next!)} className={`w-full rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-sm disabled:opacity-40 ${focus}`}>Загрузить ещё обращения</button> : null}
  </div>
}
