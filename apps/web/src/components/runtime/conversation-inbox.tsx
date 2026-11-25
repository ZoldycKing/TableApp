'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { listConversationInboxAction } from '@/app/conversation-actions'
import { GENERAL_CONVERSATION_SELF, GENERAL_CONVERSATION_TABLE, MESSAGES_SCREEN, type ConversationInboxPage, type ConversationSummary } from '@/lib/conversation-types'
import { ConversationPanel } from './conversation-panel'
import { Icon } from './icons'

export { MESSAGES_SCREEN }
export type ConversationTarget = { slug: string; tableId: string; rowId: string }
export function parseConversationTarget(value: string | null): ConversationTarget | null {
  try {
    const target = JSON.parse(value ?? '') as ConversationTarget
    return target && [target.slug, target.tableId, target.rowId].every(item => typeof item === 'string' && item.length > 0 && item.length <= 200) ? target : null
  } catch { return null }
}
type Props = { slug?: string; business?: boolean; operator?: boolean; appId?: string; initialTarget?: ConversationTarget | null; onOpenRecord?: (item: ConversationSummary) => void; onAskQuestion?: () => void }
const time = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  const clock = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  return `${day}, ${clock}`
}
const reachesCursor = (cursor: string, boundary: string) => {
  const [sequence, id] = cursor.split('~'), [limit, limitId] = boundary.split('~')
  return Number(sequence) < Number(limit) || Number(sequence) === Number(limit) && id! <= limitId!
}
const mergeThreads = (previous: ConversationSummary[], incoming: ConversationSummary[]) => {
  const merged = new Map(previous.map(item => [item.id, item]))
  for (const item of incoming) merged.set(item.id, item)
  return [...merged.values()]
}
const wideInbox = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try { return Boolean(window.matchMedia('(min-width: 740px)')?.matches) } catch { return false }
}

export function ConversationInbox({ slug, business = false, operator = false, appId, initialTarget = null, onOpenRecord, onAskQuestion }: Props) {
  const [page, setPage] = useState<ConversationInboxPage>({ items: [], next: null })
  const pageRef = useRef<ConversationInboxPage | null>(null)
  const customer = !business && !operator
  const [selected, setSelected] = useState<ConversationTarget | ConversationSummary | null>(initialTarget)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const [unreadOnly, setUnreadOnly] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null)
  const generation = useRef(0), requesting = useRef(false), userPicked = useRef(Boolean(initialTarget))
  const load = useCallback(async (before?: string) => {
    if (requesting.current) return
    requesting.current = true
    const snapshot = generation.current
    setBusy(true)
    try {
      const previous = pageRef.current
      let cursor = before, refreshed: ConversationInboxPage = { items: [], next: null }
      const visited = new Set<string>()
      do {
        const result = await listConversationInboxAction({ slug, appId, unreadOnly, before: cursor }, business)
        if (snapshot !== generation.current) return
        if (!result.ok) { pageRef.current = null; setPage({ items: [], next: null }); setSelected(null); setError(result.error); return }
        refreshed = { ...result.value, items: mergeThreads(refreshed.items, result.value.items) }
        // Revalidate the whole revealed range, including empty authorized pages.
        // This preserves older pages without retaining metadata after access is revoked.
        if (before || !previous || !refreshed.next || previous.next && reachesCursor(refreshed.next, previous.next)) break
        if (visited.has(refreshed.next)) throw new Error('Conversation pagination did not advance')
        visited.add(refreshed.next); cursor = refreshed.next
      } while (true)
      const next = before && previous ? { ...refreshed, items: mergeThreads(previous.items, refreshed.items) } : refreshed
      setError(null)
      pageRef.current = next; setPage(next)
      setSelected(current => {
        if (current && 'id' in current) return next.items.find(item => item.id === current.id) ?? null
        if (current) {
          const matched = next.items.find(item => item.slug === current.slug && item.tableId === current.tableId
            && (item.rowId === current.rowId || !business && current.tableId === GENERAL_CONVERSATION_TABLE && current.rowId === GENERAL_CONVERSATION_SELF))
          if (matched) return matched
        }
        // Desktop two-pane: open the newest thread so the right column is never empty.
        if (!before && !userPicked.current && !selectedRef.current && next.items[0] && wideInbox()) return next.items[0]
        return current
      })
    } catch {
      if (snapshot === generation.current) setError('Не удалось загрузить сообщения. Попробуйте ещё раз.')
    } finally { if (snapshot === generation.current) { setBusy(false); requesting.current = false } }
  }, [slug, business, appId, unreadOnly])
  const loadRef = useRef(load); loadRef.current = load
  const targetKey = initialTarget ? `${initialTarget.slug}:${initialTarget.tableId}:${initialTarget.rowId}` : ''
  // Moving between a record shortcut and the top-level tab must not retain another dialog.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { userPicked.current = Boolean(initialTarget); setSelected(initialTarget) }, [targetKey])
  useEffect(() => {
    generation.current += 1; requesting.current = false
    pageRef.current = null; setPage({ items: [], next: null }); setSelected(initialTarget); setError(null)
    userPicked.current = Boolean(initialTarget)
    void loadRef.current()
    const refresh = () => { if (document.visibilityState === 'visible') void loadRef.current() }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('tableapp:messages-read', refresh)
    return () => { generation.current += 1; window.clearInterval(timer); window.removeEventListener('tableapp:messages-read', refresh) }
    // The target is navigation state, not a reason to reset polling or pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, business, operator, appId, unreadOnly])
  const item = page.items.find(item => item.slug === selected?.slug && item.tableId === selected?.tableId
    && (item.rowId === selected?.rowId || !business && selected?.tableId === GENERAL_CONVERSATION_TABLE && selected.rowId === GENERAL_CONVERSATION_SELF))
    ?? (selected && 'id' in selected ? selected : undefined)
  const general = selected?.tableId === GENERAL_CONVERSATION_TABLE
  const threadOpen = Boolean(selected)
  const pick = (thread: ConversationSummary) => { userPicked.current = true; setSelected(thread) }
  const clear = () => { userPicked.current = true; setSelected(null) }
  const metaLine = (thread: ConversationSummary) => {
    const when = time(thread.lastAt)
    const who = thread.lastAuthor?.trim()
    return [who, when].filter(Boolean).join(' · ') + (thread.closed ? ' · Завершено' : '')
  }
  const listChrome = (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${threadOpen ? 'hidden @min-[740px]:flex' : ''}`}>
      <p className="max-w-lg text-sm text-ink-muted">{business ? 'Вопросы клиентов и переписка по заказам во всех приложениях пространства.' : operator ? 'Вопросы клиентов и переписка по заказам и записям, к которым у вас есть доступ.' : 'Вопросы бизнесу и переписка по вашим заказам и записям.'}</p>
      <div className="flex flex-wrap items-center gap-3">
        {customer && onAskQuestion ? <button type="button" onClick={onAskQuestion} className="rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-medium text-white">Задать вопрос</button> : null}
        <button
          type="button"
          aria-pressed={unreadOnly}
          onClick={() => setUnreadOnly(current => !current)}
          className={`rounded-xl border px-3 py-2 text-sm font-medium ${unreadOnly ? 'border-sage-300 bg-sage-50 text-sage-800' : 'border-sand-200 bg-white text-ink-muted hover:border-sage-300'}`}
        >
          Только непрочитанные
        </button>
      </div>
    </div>
  )
  return <div className={`@container min-w-0 space-y-4 [overflow-wrap:anywhere] ${threadOpen ? '@min-[740px]:flex @min-[740px]:h-[min(720px,calc(100dvh-10rem))] @min-[740px]:min-h-[min(720px,calc(100dvh-10rem))] @min-[740px]:flex-col' : ''}`}>
    {listChrome}
    {error ? <div className="space-y-2"><p role="alert" className="text-sm text-red-700">{error}</p><button type="button" onClick={() => void load()} className="text-sm text-sage-700 underline">Попробовать ещё раз</button></div> : null}
    <div className={`grid min-w-0 grid-cols-1 gap-6 ${page.items.length || selected ? '@min-[740px]:min-h-0 @min-[740px]:flex-1 @min-[740px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @min-[740px]:items-stretch' : 'items-start'}`}>
      <nav aria-label="Диалоги" className={`min-w-0 space-y-2 ${selected ? 'hidden @min-[740px]:block' : ''}`}>
        {page.items.map(thread => <button key={thread.id} type="button" onClick={() => pick(thread)} aria-current={thread.id === item?.id ? 'true' : undefined}
          className={`block w-full min-w-0 rounded-xl border p-3 text-left transition-colors ${thread.id === item?.id ? 'border-sage-300 bg-sage-50' : 'border-sand-200 bg-white hover:bg-sand-50'}`}>
          {customer ? <>
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words text-[15px] font-medium leading-snug">{thread.title}</span>
              {thread.unread ? <span aria-label={`Непрочитанных сообщений: ${thread.unread}`} className="shrink-0 rounded-full bg-sage-700 px-2 py-0.5 text-xs font-medium text-white">{thread.unread}</span> : null}
            </div>
            {thread.statusLabel ? <span className="mt-2 inline-flex rounded-lg bg-sage-50 px-2 py-0.5 text-[13px] font-medium text-sage-800">{thread.statusLabel}</span> : null}
            <p className="mt-2 truncate text-[15px] text-ink-soft">{thread.preview}</p>
            <p className="mt-2 text-[13px] text-ink-muted">{metaLine(thread)}</p>
          </> : <>
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words text-[15px] font-medium leading-snug">{thread.customer}</span>
              {thread.unread ? <span aria-label={`Непрочитанных сообщений: ${thread.unread}`} className="shrink-0 rounded-full bg-sage-700 px-2 py-0.5 text-xs font-medium text-white">{thread.unread}</span> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="min-w-0 break-words text-[15px] leading-snug">{thread.title}</p>
              {thread.statusLabel ? <span className="rounded-lg bg-sage-50 px-2 py-0.5 text-[13px] font-medium text-sage-800">{thread.statusLabel}</span> : null}
            </div>
            <p className="mt-2 truncate text-[15px] text-ink-soft">{thread.preview}</p>
            <p className="mt-2 text-[13px] text-ink-muted">{metaLine(thread)}</p>
          </>}
        </button>)}
        {busy && !page.items.length ? <div role="status" className="space-y-3"><span className="sr-only">Загружаем диалоги…</span>{[0,1,2].map(index => <div key={index} aria-hidden className="space-y-3 rounded-2xl border border-sand-200 bg-white p-4 motion-safe:animate-pulse"><div className="h-4 w-32 rounded bg-sand-100" /><div className="h-3 w-3/4 rounded bg-sand-100" /></div>)}</div> : !page.items.length && !error ? <p className="rounded-2xl border border-sand-200 bg-white p-6 text-sm text-ink-muted">{page.next ? 'На этой странице доступных диалогов нет. Откройте следующие диалоги.' : unreadOnly ? 'Непрочитанных сообщений нет.' : !customer ? 'Диалогов пока нет. Они появятся, когда клиент задаст вопрос или начнётся переписка по заказу или записи.' : onAskQuestion ? 'Диалогов пока нет. Вы можете задать вопрос бизнесу — оформлять заказ или запись для этого не нужно.' : 'Диалогов пока нет. Здесь появятся ваши переписки.'}</p> : null}
        {page.next ? <button type="button" disabled={busy} onClick={() => void load(page.next!)} className="text-sm text-sage-700 underline">Следующие диалоги</button> : null}
      </nav>
      <div className={`min-w-0 ${selected ? 'flex min-h-0 flex-col @min-[740px]:h-full' : 'hidden @min-[740px]:block'}`}>{selected ? <>
        <div className="mb-3 shrink-0 @min-[740px]:mb-4">
          <button type="button" onClick={clear} className="mb-3 inline-flex items-center gap-1 text-[15px] text-sage-700 @min-[740px]:hidden"><Icon name="back" className="size-4" />Все диалоги</button>
          {item && (!general || !customer) ? <div className="@min-[740px]:rounded-xl @min-[740px]:border @min-[740px]:border-sand-200 @min-[740px]:bg-white @min-[740px]:p-4">
            <p className="break-words text-[15px] font-semibold leading-snug">{item.title}</p>
            {item.statusLabel ? <span className="mt-2 inline-flex rounded-lg bg-sage-50 px-2 py-0.5 text-[13px] font-medium text-sage-800">{item.statusLabel}</span> : null}
            {!customer ? <p className="mt-1 text-[13px] text-ink-muted">{item.customer}</p> : null}
            {!general ? onOpenRecord ? <button type="button" onClick={() => onOpenRecord(item)} className="mt-2 text-[15px] text-sage-700 underline">Открыть запись</button> : <a href={`/t/${encodeURIComponent(item.tableId)}?r=${encodeURIComponent(item.rowId)}`} className="mt-2 inline-block text-[15px] text-sage-700 underline">Открыть запись</a> : null}
          </div> : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <ConversationPanel key={`${selected.slug}:${selected.tableId}:${selected.rowId}:${business}`} {...selected} configured business={business} showContext={!item} fill />
        </div>
      </> : page.items.length ? <p className="rounded-2xl border border-sand-200 bg-white p-6 text-sm text-ink-muted">Выберите диалог, чтобы прочитать сообщения или ответить.</p> : null}</div>
    </div>
  </div>
}
