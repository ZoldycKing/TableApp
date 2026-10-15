'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attachment } from '@tableapp/schema'
import { FileUpload, fileUrl, isImage } from '@/components/file-upload'
import { changeConversationMessageAction, closeConversationAction, conversationMessageHistoryAction, markConversationReadAction, readConversationAction, sendConversationAction } from '@/app/conversation-actions'
import { GENERAL_CONVERSATION_TABLE, type ConversationMessage, type ConversationPage } from '@/lib/conversation-types'

type Props = { slug: string; tableId: string; rowId: string; configured: boolean; business?: boolean; showContext?: boolean }
const date = (value: string) => new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export function ConversationPanel({ slug, tableId, rowId, configured, business = false, showContext = true }: Props) {
  const general = tableId === GENERAL_CONVERSATION_TABLE
  const [page, setPage] = useState<ConversationPage | null>(null), [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState(''), [files, setFiles] = useState<Attachment[]>([]), [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [editing, setEditing] = useState<ConversationMessage | null>(null)
  const [editBody, setEditBody] = useState(''), [deleting, setDeleting] = useState<string | null>(null)
  const [history, setHistory] = useState<{ messageId: string; rows: { version: number; body: string; operation: string; createdAt: string }[] } | null>(null)
  const request = useRef(''), generation = useRef(0), sending = useRef(false), readThrough = useRef(0)
  const load = useCallback(async (older = false) => {
    const snapshot = generation.current
    let result: Awaited<ReturnType<typeof readConversationAction>>
    try { result = await readConversationAction(slug, tableId, rowId, older ? page?.nextBefore ?? undefined : undefined, business) }
    catch { result = { ok: false, error: 'Не удалось загрузить переписку. Попробуйте ещё раз.' } }
    if (snapshot !== generation.current) return
    if (!result?.ok) {
      setError(result?.error ?? 'Переписка недоступна')
      if (page) setPage(null) // Revocation hides formerly loaded messages immediately.
      return
    }
    setError(null)
    const sequence = result.value.messages.at(-1)?.sequence ?? 0
    if (!older && sequence > readThrough.current && document.visibilityState === 'visible') {
      void markConversationReadAction(slug, tableId, rowId, sequence, business).then(marked => {
        if (snapshot === generation.current && marked.ok) { readThrough.current = Math.max(readThrough.current, sequence); window.dispatchEvent(new Event('tableapp:messages-read')) }
      }).catch(() => { /* Keep unread state until a later successful read. */ })
    }
    setPage(current => !current || current.conversationId !== result.value.conversationId || current.staff !== result.value.staff || current.canManage !== result.value.canManage ? result.value : older ? { ...result.value, notes: current.notes,
      messages: [...result.value.messages, ...current.messages.filter(message => !result.value.messages.some(item => item.id === message.id))] }
      : current ? { ...result.value, nextBefore: current.messages.length > 50 ? current.nextBefore : result.value.nextBefore,
        messages: [...current.messages.filter(message => !result.value.messages.some(item => item.id === message.id) && message.sequence < (result.value.messages[0]?.sequence ?? 0)), ...result.value.messages] } : result.value)
  }, [slug, tableId, rowId, page, business])
  const loadRef = useRef(load); loadRef.current = load
  useEffect(() => { if (page && !page.staff) setInternal(false); setHistory(null); setEditing(null); setDeleting(null) }, [page?.staff, page?.canManage, page?.conversationId])
  useEffect(() => {
    generation.current += 1
    readThrough.current = 0
    setPage(null); setBody(''); setFiles([]); setInternal(false); setError(null); setEditing(null); setDeleting(null); setHistory(null)
    request.current = crypto.randomUUID()
    void loadRef.current()
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && !sending.current) void loadRef.current() }, 15000)
    return () => { generation.current += 1; clearInterval(timer) }
  }, [slug, tableId, rowId, business])
  if (!page && !configured) return null
  if (page && !page.enabled && !page.conversationId) return configured ? <p className="mt-4 rounded-xl bg-sand-50 p-4 text-sm text-ink-muted">Бизнес пока не принимает новые сообщения. Свяжитесь с ответственным другим способом.</p> : null
  const clientGeneralDisabled = Boolean(general && page && !page.staff && !page.enabled)
  const mutate = async (run: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    if (sending.current) return
    sending.current = true; setBusy(true); setError(null)
    try {
      const result = await run()
      if (!result.ok) { setError(result.error ?? 'Не удалось сохранить'); return }
      after?.(); await loadRef.current()
    } catch { setError('Не удалось сохранить. Повторите отправку.') }
    finally { sending.current = false; setBusy(false) }
  }
  return <section aria-label={general ? 'Вопрос бизнесу' : 'Переписка по обращению'} className="mx-auto mt-5 min-w-0 w-full max-w-xl space-y-4 rounded-2xl border border-sand-200 bg-white p-4 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{general ? 'Вопрос бизнесу' : showContext && page?.contextTitle ? page.contextTitle : 'Переписка и документы'}</h3>
      {page?.canManage && page.conversationId ? <button disabled={busy} type="button" className="text-xs text-sage-700 underline" onClick={() => void mutate(() => closeConversationAction(slug, tableId, rowId, !page.closed, business))}>{page.closed ? 'Возобновить обсуждение' : 'Завершить обсуждение'}</button> : null}
    </div>
    <p className="text-xs leading-relaxed text-ink-muted">{general
      ? business ? 'Сообщения клиента вашему бизнесу. Их видят клиент и сотрудники с доступом к сообщениям.' : 'Здесь вы общаетесь с сотрудниками этого бизнеса. Создавать заказ или запись не нужно.'
      : 'Сообщения относятся к этому обращению. Их видите вы и сотрудники бизнеса, которым оно доступно.'}</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {!page ? <button type="button" className="text-sm text-sage-700 underline" onClick={() => void loadRef.current()}>Загрузить переписку</button> : <>
      {page.nextBefore ? <button disabled={busy} type="button" className="text-xs text-sage-700 underline" onClick={() => void load(true)}>Показать предыдущие сообщения</button> : null}
      <div className="space-y-3" aria-live="polite">{page.messages.map(message => <article key={message.id} className={`rounded-xl p-3 ${message.mine ? 'bg-sage-50' : 'bg-sand-50'}`}>
        <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-ink-muted"><span>{message.mine ? 'Вы' : message.author}</span><time dateTime={message.createdAt}>{date(message.createdAt)}{message.edited && !message.deleted ? ' · изменено' : ''}</time></div>
        <p className="whitespace-pre-wrap break-words text-sm">{message.deleted ? 'Сообщение удалено' : message.body}</p>
        {!message.deleted ? <><div className="flex flex-wrap gap-2">{message.files.filter(file => isImage(file.mime)).map(file => <img key={file.id} src={fileUrl(file.key, business)} alt={file.name} className="h-16 w-16 rounded-lg object-cover" />)}</div>
          <div className="mt-2 flex flex-wrap gap-2">{message.files.map(file => <a key={file.id} href={fileUrl(file.key, business)} target="_blank" rel="noreferrer" className="max-w-full break-words rounded-lg border border-sand-200 bg-white px-2 py-1 text-xs text-sage-700 underline">{file.name}</a>)}</div></> : null}
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-muted">
          {message.canModerate && message.mine ? <button type="button" disabled={busy} onClick={() => { setEditing(message); setEditBody(message.body); setDeleting(null) }}>Изменить</button> : null}
          {message.canModerate ? <button type="button" disabled={busy} onClick={() => { setDeleting(message.id); setEditing(null) }}>Удалить</button> : null}
          {message.canViewRevisions && message.version > 0 ? <button type="button" disabled={busy} onClick={() => void mutate(async () => {
            const result = await conversationMessageHistoryAction(slug, tableId, rowId, message.id, business)
            if (result.ok) setHistory({ messageId: message.id, rows: result.value })
            return result
          })}>История правок</button> : null}
        </div>
        {deleting === message.id ? <div className="mt-2 space-y-2"><p className="text-xs">Удалить сообщение? В переписке останется отметка, а прежний текст сохранится в истории правок для автора и владельца бизнеса.</p>
          <button type="button" disabled={busy} className="mr-3 text-xs text-red-700" onClick={() => void mutate(() => changeConversationMessageAction(slug, tableId, rowId, message.id, message.version, null, business), () => setDeleting(null))}>Да, удалить сообщение</button>
          <button type="button" className="text-xs" onClick={() => setDeleting(null)}>Оставить</button></div> : null}
        {editing?.id === message.id ? <div className="mt-2 space-y-2"><textarea aria-label="Новый текст сообщения" className="w-full rounded-lg border border-sand-200 p-2 text-sm" rows={3} maxLength={4000} value={editBody} onChange={event => setEditBody(event.target.value)} />
          <button type="button" disabled={busy || !editBody.trim()} className="mr-3 text-xs text-sage-700" onClick={() => void mutate(() => changeConversationMessageAction(slug, tableId, rowId, message.id, message.version, editBody, business), () => setEditing(null))}>Сохранить правку</button>
          <button type="button" className="text-xs" onClick={() => setEditing(null)}>Отмена</button></div> : null}
        {message.canViewRevisions && history?.messageId === message.id ? <div className="mt-3 border-t border-sand-200 pt-2 text-xs"><p className="mb-2 font-medium">История правок — для автора и владельца бизнеса</p>
          {history.rows.map(revision => <p key={revision.version} className="mb-2 whitespace-pre-wrap break-words">{date(revision.createdAt)} · {revision.operation === 'delete' ? 'Удаление' : 'Изменение'}<br />{revision.body}</p>)}
          <button type="button" className="underline" onClick={() => setHistory(null)}>Скрыть историю</button></div> : null}
      </article>)}</div>
      {!page.messages.length ? <p className="text-sm text-ink-muted">{general ? business ? 'Здесь появится переписка с клиентом.' : 'Напишите вопрос о товарах, услугах или работе бизнеса.' : 'Задайте вопрос по этому обращению или приложите документ.'}</p> : null}
      {page.staff ? <div className="space-y-2 border-t border-sand-200 pt-3"><p className="text-xs font-medium">Внутренние заметки · клиенту не видны</p>
        {page.notes.map(note => <div key={note.id} className="rounded-lg bg-sand-50 p-2 text-xs"><span className="text-ink-muted">{note.author} · {date(note.createdAt)}</span><p className="whitespace-pre-wrap break-words">{note.body}</p></div>)}
      </div> : null}
      {clientGeneralDisabled ? <p className="text-sm text-ink-muted">Бизнес пока не принимает новые сообщения. История переписки сохранена.</p> : null}
      {page.closed && !clientGeneralDisabled ? <p className="text-sm text-ink-muted">{general && !page.staff && page.enabled ? 'Предыдущий вопрос закрыт. Новое сообщение возобновит переписку.' : 'Обсуждение завершено. Сообщения и документы сохранены в истории.'}</p> : null}
      {!clientGeneralDisabled && (!page.closed || general && !page.staff) ? <form className="space-y-3 border-t border-sand-200 pt-3" onSubmit={event => {
        event.preventDefault()
        void mutate(() => sendConversationAction(slug, tableId, rowId, { body, requestId: request.current, fileIds: internal ? [] : files.map(file => file.id), internal }, business),
          () => { setBody(''); if (!internal) setFiles([]); request.current = crypto.randomUUID() })
      }}>
        {page.staff ? <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={internal} disabled={busy} onChange={event => { request.current = crypto.randomUUID(); setInternal(event.target.checked) }} />Внутренняя заметка — только сотрудникам</label> : null}
        <label className="block text-sm">{internal ? 'Заметка' : 'Сообщение'}<textarea value={body} disabled={busy} onChange={event => { request.current = crypto.randomUUID(); setBody(event.target.value) }} rows={3} maxLength={4000} required={!files.length || internal} className="mt-1 w-full rounded-xl border border-sand-200 p-3 text-sm" /></label>
        {!internal ? <FileUpload value={files} maxCount={5} compact conversation={{ slug, tableId, rowId, business }} onChange={value => { request.current = crypto.randomUUID(); setFiles(value) }} onBusyChange={setUploading} /> : null}
        <button type="submit" disabled={busy || uploading || !body.trim() && (!files.length || internal)} className="rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">{busy ? 'Сохранение…' : internal ? 'Сохранить заметку' : 'Отправить сообщение'}</button>
      </form> : null}
    </>}
  </section>
}
