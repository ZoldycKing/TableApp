'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { listConversationInboxAction } from '@/app/conversation-actions'
import type { ConversationInboxPage, ConversationSummary } from '@/lib/conversation-types'
import { ConversationPanel } from './conversation-panel'
import { Icon } from './icons'

export const MESSAGES_SCREEN = '__tableapp_messages'
export type ConversationTarget = { slug: string; tableId: string; rowId: string }
export function parseConversationTarget(value: string | null): ConversationTarget | null {
  try {
    const target = JSON.parse(value ?? '') as ConversationTarget
    return target && [target.slug, target.tableId, target.rowId].every(item => typeof item === 'string' && item.length > 0 && item.length <= 200) ? target : null
  } catch { return null }
}
type Props = { slug?: string; business?: boolean; appId?: string; initialTarget?: ConversationTarget | null; onOpenRecord?: (item: ConversationSummary) => void }
const time = (value: string) => new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function ConversationInbox({ slug, business = false, appId, initialTarget = null, onOpenRecord }: Props) {
  const [page, setPage] = useState<ConversationInboxPage>({ items: [], next: null })
  const [selected, setSelected] = useState<ConversationTarget | ConversationSummary | null>(initialTarget)
  const [unreadOnly, setUnreadOnly] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null)
  const generation = useRef(0), requesting = useRef(false)
  const load = useCallback(async (before?: string) => {
    if (requesting.current) return
    requesting.current = true
    const snapshot = generation.current
    setBusy(true)
    try {
      const result = await listConversationInboxAction({ slug, appId, unreadOnly, before }, business)
      if (snapshot !== generation.current) return
      if (!result.ok) { setPage({ items: [], next: null }); setSelected(null); setError(result.error); return }
      setError(null)
      setPage(current => before ? { ...result.value, items: [...current.items, ...result.value.items.filter(item => !current.items.some(previous => previous.id === item.id))] } : result.value)
    } catch {
      if (snapshot === generation.current) { setPage({ items: [], next: null }); setSelected(null); setError('Не удалось загрузить сообщения. Попробуйте ещё раз.') }
    } finally { if (snapshot === generation.current) { setBusy(false); requesting.current = false } }
  }, [slug, business, appId, unreadOnly])
  const loadRef = useRef(load); loadRef.current = load
  const targetKey = initialTarget ? `${initialTarget.slug}:${initialTarget.tableId}:${initialTarget.rowId}` : ''
  // Moving between a record shortcut and the top-level tab must not retain another dialog.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSelected(initialTarget) }, [targetKey])
  useEffect(() => {
    generation.current += 1; requesting.current = false
    setPage({ items: [], next: null }); setSelected(initialTarget); setError(null)
    void loadRef.current()
    const refresh = () => { if (document.visibilityState === 'visible') void loadRef.current() }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('tableapp:messages-read', refresh)
    return () => { generation.current += 1; window.clearInterval(timer); window.removeEventListener('tableapp:messages-read', refresh) }
    // The target is navigation state, not a reason to reset polling or pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, business, appId, unreadOnly])
  const item = page.items.find(item => item.slug === selected?.slug && item.tableId === selected?.tableId && item.rowId === selected?.rowId) ?? (selected && 'id' in selected ? selected : undefined)
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-lg text-sm text-ink-muted">{business ? 'Переписки по обращениям клиентов во всех приложениях этого бизнеса.' : 'Вопросы и документы по вашим обращениям в этом бизнесе.'}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} />Только непрочитанные</label>
    </div>
    {error ? <div className="space-y-2"><p role="alert" className="text-sm text-red-700">{error}</p><button type="button" onClick={() => void load()} className="text-sm text-sage-700 underline">Попробовать ещё раз</button></div> : null}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
      <nav aria-label="Диалоги" className={selected ? 'hidden space-y-2 lg:block' : 'space-y-2'}>
        {page.items.map(thread => <button key={thread.id} type="button" onClick={() => setSelected(thread)} aria-current={thread.id === item?.id ? 'true' : undefined}
          className={`block w-full min-w-0 rounded-xl border p-3 text-left transition-colors ${thread.id === item?.id ? 'border-sage-300 bg-sage-50' : 'border-sand-200 bg-white hover:bg-sand-50'}`}>
          <div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words text-sm font-medium">{thread.customer}</span>{thread.unread ? <span aria-label={`Непрочитанных сообщений: ${thread.unread}`} className="rounded-full bg-sage-700 px-2 py-0.5 text-xs font-medium text-white">{thread.unread}</span> : null}</div>
          <p className="mt-1 break-words text-sm">{thread.title}</p>
          <p className="mt-2 truncate text-xs text-ink-muted">{thread.preview}</p>
          <p className="mt-2 text-[11px] text-ink-muted">{thread.appName} · {time(thread.lastAt)}{thread.closed ? ' · Завершено' : ''}</p>
        </button>)}
        {busy && !page.items.length ? <p role="status" className="p-4 text-sm text-ink-muted">Загружаем диалоги…</p> : !page.items.length && !error ? <p className="rounded-xl bg-sand-50 p-4 text-sm text-ink-muted">{page.next ? 'На этой странице доступных диалогов нет. Откройте следующие диалоги.' : unreadOnly ? 'Непрочитанных сообщений нет.' : business ? 'Диалогов пока нет. Они появятся, когда клиент или сотрудник начнёт переписку по обращению.' : 'Диалогов пока нет. Чтобы начать переписку, откройте своё обращение и нажмите «Открыть переписку».'}</p> : null}
        {page.next ? <button type="button" disabled={busy} onClick={() => void load(page.next!)} className="text-sm text-sage-700 underline">Следующие диалоги</button> : null}
      </nav>
      <div className="min-w-0">{selected ? <>
        <button type="button" onClick={() => setSelected(null)} className="mb-3 inline-flex items-center gap-1 text-sm text-sage-700 lg:hidden"><Icon name="back" className="size-4" />Все диалоги</button>
        {item ? <div className="rounded-xl border border-sand-200 bg-white p-4"><p className="break-words font-semibold">{item.title}</p>
          {item ? <><p className="mt-1 text-xs text-ink-muted">{item.customer} · {item.appName}</p>
            {onOpenRecord ? <button type="button" onClick={() => onOpenRecord(item)} className="mt-2 text-sm text-sage-700 underline">Открыть обращение</button> : <a href={`/t/${encodeURIComponent(item.tableId)}?r=${encodeURIComponent(item.rowId)}`} className="mt-2 inline-block text-sm text-sage-700 underline">Открыть обращение</a>}</> : null}</div> : null}
        <ConversationPanel key={`${selected.slug}:${selected.tableId}:${selected.rowId}:${business}`} {...selected} configured business={business} showContext={!item} />
      </> : <p className="hidden rounded-xl bg-sand-50 p-5 text-sm text-ink-muted lg:block">Выберите диалог, чтобы прочитать сообщения или ответить.</p>}</div>
    </div>
  </div>
}
