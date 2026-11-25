'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attachment } from '@tableapp/schema'
import { FileUpload, isAttachmentAvailable } from '@/components/file-upload'
import { changeConversationMessageAction, closeConversationAction, conversationMessageHistoryAction, markConversationReadAction, readConversationAction, sendConversationAction } from '@/app/conversation-actions'
import { GENERAL_CONVERSATION_TABLE, type ConversationMessage, type ConversationPage } from '@/lib/conversation-types'
import {
  AutoGrowTextarea,
  ComposerModeSegment,
  ConversationAttachmentChip,
  ConversationUploadAlert,
  formatConversationDate,
  type UploadAlertInfo,
} from './conversation-file-ui'
import { ProtoIcon } from '@/components/builder/prototype/icons'

type Props = {
  slug: string
  tableId: string
  rowId: string
  configured: boolean
  business?: boolean
  showContext?: boolean
  /** Stretch to the inbox column height with the composer pinned to the bottom. */
  fill?: boolean
  /** Fixture page for visual shots; skips network reads when provided. */
  fixture?: ConversationPage
  fixtureFiles?: Attachment[]
  fixtureAlert?: UploadAlertInfo | null
}

export function ConversationPanel({
  slug, tableId, rowId, configured, business = false, showContext = true, fill = false, fixture, fixtureFiles, fixtureAlert = null,
}: Props) {
  const general = tableId === GENERAL_CONVERSATION_TABLE
  const [page, setPage] = useState<ConversationPage | null>(fixture ?? null)
  const [error, setError] = useState<string | null>(null)
  const [uploadAlert, setUploadAlert] = useState<UploadAlertInfo | null>(fixtureAlert)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<Attachment[]>(fixtureFiles ?? [])
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<ConversationMessage | null>(null)
  const [editBody, setEditBody] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [history, setHistory] = useState<{ messageId: string; rows: { version: number; body: string; operation: string; createdAt: string }[] } | null>(null)
  const request = useRef(''), generation = useRef(0), sending = useRef(false), uploadInProgress = useRef(false), readThrough = useRef(0)
  const attachRef = useRef<{ open: () => void; busy: boolean } | null>(null)
  const load = useCallback(async (older = false) => {
    if (fixture) return
    const snapshot = generation.current
    let result: Awaited<ReturnType<typeof readConversationAction>>
    try { result = await readConversationAction(slug, tableId, rowId, older ? page?.nextBefore ?? undefined : undefined, business) }
    catch { result = { ok: false, error: 'Не удалось загрузить переписку. Попробуйте ещё раз.' } }
    if (snapshot !== generation.current) return
    if (!result?.ok) {
      setError(result?.error ?? 'Переписка недоступна')
      if (page) setPage(null)
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
  }, [slug, tableId, rowId, page, business, fixture])
  const loadRef = useRef(load); loadRef.current = load
  useEffect(() => { if (page && !page.staff) setInternal(false); setHistory(null); setEditing(null); setDeleting(null) }, [page?.staff, page?.canManage, page?.conversationId])
  useEffect(() => {
    if (fixture) {
      setPage(fixture)
      setFiles(fixtureFiles ?? [])
      setUploadAlert(fixtureAlert)
      return
    }
    generation.current += 1
    readThrough.current = 0
    sending.current = false; uploadInProgress.current = false; setBusy(false); setUploading(false)
    setPage(null); setBody(''); setFiles([]); setInternal(false); setError(null); setUploadAlert(null); setEditing(null); setDeleting(null); setHistory(null)
    request.current = crypto.randomUUID()
    void loadRef.current()
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && !sending.current) void loadRef.current() }, 15000)
    return () => { generation.current += 1; clearInterval(timer) }
  }, [slug, tableId, rowId, business, fixture, fixtureFiles, fixtureAlert])
  if (!page && !configured) return null
  if (page && !page.enabled && !page.conversationId) return configured ? <p className="mt-4 rounded-xl bg-sand-50 p-4 text-sm text-ink-muted">Бизнес пока не принимает новые сообщения. Свяжитесь с ответственным другим способом.</p> : null
  const clientGeneralDisabled = Boolean(general && page && !page.staff && !page.enabled)
  const mutate = async (run: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    if (sending.current || fixture) return
    const snapshot = generation.current
    sending.current = true; setBusy(true); setError(null)
    try {
      const result = await run()
      if (snapshot !== generation.current) return
      if (!result.ok) { setError(result.error ?? 'Не удалось сохранить'); return }
      after?.(); await loadRef.current()
    } catch { if (snapshot === generation.current) setError('Не удалось сохранить. Повторите отправку.') }
    finally { if (snapshot === generation.current) { sending.current = false; setBusy(false) } }
  }
  const availableFiles = files.filter(isAttachmentAvailable)
  /** Embedded in a detail card: no outer chrome / duplicate title. */
  const embedded = !showContext
  type TimelineItem =
    | { kind: 'message'; message: ConversationMessage }
    | { kind: 'note'; id: string; body: string; author: string; createdAt: string }
  const timeline: TimelineItem[] = page ? [
    ...page.messages.map(message => ({ kind: 'message' as const, message })),
    ...(page.staff ? page.notes.map(note => ({ kind: 'note' as const, ...note })) : []),
  ].sort((a, b) => {
    const left = a.kind === 'message' ? a.message.createdAt : a.createdAt
    const right = b.kind === 'message' ? b.message.createdAt : b.createdAt
    return left.localeCompare(right) || (a.kind === 'note' ? a.id : a.message.id).localeCompare(b.kind === 'note' ? b.id : b.message.id)
  }) : []
  const shell = embedded
    ? `min-w-0 w-full [overflow-wrap:anywhere] ${fill ? 'flex min-h-0 flex-1 flex-col' : 'space-y-4'}`
    : `mx-auto mt-5 min-w-0 w-full max-w-xl rounded-2xl border border-sand-200 bg-white p-4 [overflow-wrap:anywhere] ${fill ? 'flex min-h-0 flex-1 flex-col space-y-4' : 'space-y-4'}`
  return <section aria-label={general ? 'Вопрос бизнесу' : 'Переписка по обращению'} className={shell} data-conversation-fill={fill || undefined}>
    {embedded ? null : <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{general ? 'Вопрос бизнесу' : showContext && page?.contextTitle ? page.contextTitle : 'Переписка и документы'}</h3>
      {page?.canManage && page.conversationId && !fixture ? <button disabled={busy} type="button" className="text-xs text-sage-700 underline" onClick={() => void mutate(() => closeConversationAction(slug, tableId, rowId, !page.closed, business))}>{page.closed ? 'Возобновить обсуждение' : 'Завершить обсуждение'}</button> : null}
    </div>}
    {embedded ? null : <p className="text-xs leading-relaxed text-ink-muted">{general
      ? business ? 'Сообщения клиента вашему бизнесу. Их видят клиент и сотрудники с доступом к сообщениям.' : 'Здесь вы общаетесь с сотрудниками этого бизнеса. Создавать заказ или запись не нужно.'
      : 'Сообщения относятся к этому обращению. Их видите вы и сотрудники бизнеса, которым оно доступно.'}</p>}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {!page ? <button type="button" className="text-sm text-sage-700 underline" onClick={() => void loadRef.current()}>Загрузить переписку</button> : <>
      <div className={fill ? 'min-h-0 flex-1 space-y-3 overflow-y-auto' : 'space-y-3'}>
      {page.nextBefore && !fixture ? <button disabled={busy} type="button" className="text-xs text-sage-700 underline" onClick={() => void load(true)}>Показать предыдущие сообщения</button> : null}
      <div className="space-y-3" aria-live="polite" aria-label="Хронология">
        {timeline.map(item => {
          if (item.kind === 'note') {
            return <article key={`note-${item.id}`} data-internal className="rounded-xl border border-[#C48A2A]/45 bg-[color-mix(in_srgb,#E8B86D_22%,white)] p-3">
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-ink-muted">
                <span>{item.author}</span>
                <time dateTime={item.createdAt}>{formatConversationDate(item.createdAt)}</time>
                <span className="inline-flex items-center gap-1 font-semibold text-[#8A5A18]"><ProtoIcon name="lock" size={12} />Внутренняя заметка</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>
            </article>
          }
          const message = item.message
          return <article key={message.id} className={`rounded-xl p-3 ${message.mine ? 'bg-sage-50' : 'bg-sand-50'}`}>
            <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-ink-muted"><span>{message.mine ? 'Вы' : message.author}</span><time dateTime={message.createdAt}>{formatConversationDate(message.createdAt)}{message.edited && !message.deleted ? ' · изменено' : ''}</time></div>
            <p className="whitespace-pre-wrap break-words text-sm">{message.deleted ? 'Сообщение удалено' : message.body}</p>
            {!message.deleted && message.files.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.files.map(file => (
                  <ConversationAttachmentChip key={file.id} item={file} business={business} />
                ))}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-muted">
              {message.canModerate && message.mine && !fixture ? <button type="button" disabled={busy} onClick={() => { setEditing(message); setEditBody(message.body); setDeleting(null) }}>Изменить</button> : null}
              {message.canModerate && !fixture ? <button type="button" disabled={busy} onClick={() => { setDeleting(message.id); setEditing(null) }}>Удалить</button> : null}
              {message.canViewRevisions && message.version > 0 && !fixture ? <button type="button" disabled={busy} onClick={() => void mutate(async () => {
                const result = await conversationMessageHistoryAction(slug, tableId, rowId, message.id, business)
                if (result.ok) setHistory({ messageId: message.id, rows: result.value })
                return result
              })}>История правок</button> : null}
            </div>
            {deleting === message.id ? <div className="mt-2 space-y-2"><p className="text-xs">Удалить сообщение? В переписке останется отметка, а прежний текст сохранится в истории правок для автора и владельца бизнеса.</p>
              <button type="button" disabled={busy} className="mr-3 text-xs text-red-700" onClick={() => void mutate(() => changeConversationMessageAction(slug, tableId, rowId, message.id, message.version, null, business), () => setDeleting(null))}>Да, удалить сообщение</button>
              <button type="button" className="text-xs" onClick={() => setDeleting(null)}>Оставить</button></div> : null}
            {editing?.id === message.id ? <div className="mt-2 space-y-2">
              <AutoGrowTextarea label="Новый текст сообщения" value={editBody} onChange={setEditBody} disabled={busy} />
              <button type="button" disabled={busy || !editBody.trim()} className="mr-3 text-xs text-sage-700" onClick={() => void mutate(() => changeConversationMessageAction(slug, tableId, rowId, message.id, message.version, editBody, business), () => setEditing(null))}>Сохранить правку</button>
              <button type="button" className="text-xs" onClick={() => setEditing(null)}>Отмена</button></div> : null}
            {message.canViewRevisions && history?.messageId === message.id ? <div className="mt-3 border-t border-sand-200 pt-2 text-xs"><p className="mb-2 font-medium">История правок — для автора и владельца бизнеса</p>
              {history.rows.map(revision => <p key={revision.version} className="mb-2 whitespace-pre-wrap break-words">{formatConversationDate(revision.createdAt)} · {revision.operation === 'delete' ? 'Удаление' : 'Изменение'}<br />{revision.body}</p>)}
              <button type="button" className="underline" onClick={() => setHistory(null)}>Скрыть историю</button></div> : null}
          </article>
        })}
      </div>
      {!page.messages.length && !(page.staff && page.notes.length) ? <p className="text-sm text-ink-muted">{general ? business ? 'Здесь появится переписка с клиентом.' : 'Напишите вопрос о товарах, услугах или работе бизнеса.' : 'Задайте вопрос по этому обращению или приложите документ.'}</p> : null}
      {clientGeneralDisabled ? <p className="text-sm text-ink-muted">Бизнес пока не принимает новые сообщения. История переписки сохранена.</p> : null}
      {page.closed && !clientGeneralDisabled ? <p className="text-sm text-ink-muted">{general && !page.staff && page.enabled ? 'Предыдущий вопрос закрыт. Новое сообщение возобновит переписку.' : 'Обсуждение завершено. Сообщения и документы сохранены в истории.'}</p> : null}
      </div>
      {!clientGeneralDisabled && (!page.closed || general && !page.staff) ? <form className={`space-y-3 border-t border-sand-200 pt-3 ${fill ? 'shrink-0' : ''}`} onSubmit={event => {
        event.preventDefault()
        if (sending.current || uploadInProgress.current || fixture) return
        void mutate(() => sendConversationAction(slug, tableId, rowId, { body, requestId: request.current, fileIds: internal ? [] : availableFiles.map(file => file.id), internal }, business),
          () => { setBody(''); if (!internal) setFiles([]); setUploadAlert(null); request.current = crypto.randomUUID() })
      }}>
        {page.staff ? <ComposerModeSegment internal={internal} disabled={busy} onChange={value => { request.current = crypto.randomUUID(); setInternal(value) }} /> : null}
        {uploadAlert ? <ConversationUploadAlert alert={uploadAlert} onClose={() => setUploadAlert(null)} /> : null}
        <AutoGrowTextarea
          label={internal ? 'Заметка' : 'Сообщение'}
          value={body}
          disabled={busy}
          required={!availableFiles.length || internal}
          tone={internal ? 'internal' : 'default'}
          onChange={value => { request.current = crypto.randomUUID(); setBody(value) }}
          footer={!internal ? <FileUpload
            value={files}
            maxCount={5}
            compact
            chipsOnly
            attachRef={attachRef}
            disabled={busy}
            conversation={{ slug, tableId, rowId, business }}
            onChange={value => { request.current = crypto.randomUUID(); setFiles(value) }}
            onBusyChange={value => { uploadInProgress.current = value; setUploading(value) }}
            onUploadAlert={setUploadAlert}
          /> : undefined}
        />
        <div className="flex items-center justify-between gap-3">
          {!internal ? (
            <button
              type="button"
              disabled={busy || uploading || files.length >= 5}
              title="Прикрепить файл"
              aria-label="Прикрепить файл"
              onClick={() => attachRef.current?.open()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sand-200 bg-white text-sage-700 hover:border-sage-300 hover:bg-sage-50 disabled:opacity-40"
            >
              {uploading ? <span className="motion-safe:animate-spin" aria-hidden><ProtoIcon name="spinner" size={18} /></span> : <ProtoIcon name="paperclip" size={18} />}
            </button>
          ) : <span />}
          <button
            type="submit"
            disabled={busy || uploading || !body.trim() && (!availableFiles.length || internal)}
            className="rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? 'Сохранение…' : internal ? 'Сохранить' : 'Отправить'}
          </button>
        </div>
      </form> : null}
    </>}
  </section>
}
