'use client'

import type { Attachment } from '@tableapp/schema'
import { useEffect, useRef, useState } from 'react'
import { ProtoIcon } from '@/components/builder/prototype/icons'
import { isInlineImage } from '@/lib/file-policy'
import {
  ConversationAttachmentChip,
  ConversationPendingChip,
  fileUrl,
  isAttachmentAvailable,
  uploadAlertFromError,
  type UploadAlertInfo,
} from '@/components/runtime/conversation-file-ui'

export { fileUrl, isAttachmentAvailable }

export function isImage(mime: string): boolean {
  return isInlineImage(mime)
}

async function upload(file: File, appId?: string, conversation?: { slug: string; tableId: string; rowId: string; business?: boolean }, signal?: AbortSignal): Promise<{ ok: true; attachment: Attachment } | { ok: false; error: string }> {
  const form = new FormData()
  form.set('file', file)
  if (appId) form.set('appId', appId)
  if (conversation) for (const [key, value] of Object.entries(conversation)) form.set(key, String(value))

  const response = await fetch(conversation ? '/api/conversations/files' : '/api/files', { method: 'POST', body: form, signal })
  const payload = (await response.json()) as
    | { ok: true; attachment: Attachment }
    | { ok: false; error: string }
  return payload
}

type PendingChip = { id: string; name: string }

/**
 * Загрузка файлов в ячейку. Значение ячейки — массив вложений,
 * поэтому компонент работает и с одной картинкой, и со списком документов.
 */
type FileUploadProps = {
  value: Attachment[]
  maxCount: number
  appId?: string
  conversation?: { slug: string; tableId: string; rowId: string; business?: boolean }
  compact?: boolean
  disabled?: boolean
  onChange: (value: Attachment[]) => void
  onBusyChange?: (busy: boolean) => void
  /** When set (conversation composer), errors are reported here instead of inline red text. */
  onUploadAlert?: (alert: UploadAlertInfo | null) => void
}

export function FileUpload(props: FileUploadProps) {
  const context = JSON.stringify([props.appId, props.conversation?.slug, props.conversation?.tableId, props.conversation?.rowId, Boolean(props.conversation?.business)])
  return <FileUploadInput key={context} {...props} />
}

function CellFileChip({
  item,
  compact,
  business,
  disabled,
  onRemove,
}: {
  item: Attachment
  compact?: boolean
  business: boolean
  disabled: boolean
  onRemove: () => void
}) {
  const pending = item.scanStatus === 'pending'
  const blocked = item.scanStatus === 'infected'
  const available = isAttachmentAvailable(item)
  return (
    <span className="group relative inline-flex max-w-full flex-col gap-0.5">
      {available && isImage(item.mime) ? (
        <img src={fileUrl(item.key, business)} alt={item.name} className={compact ? 'h-7 w-7 rounded object-cover' : 'h-16 w-16 rounded-lg object-cover'} />
      ) : available ? (
        <a href={fileUrl(item.key, business)} target="_blank" rel="noreferrer" className="max-w-40 truncate rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs underline">
          {item.name}
        </a>
      ) : (
        <span className={`max-w-40 truncate rounded border px-2 py-1 text-xs ${blocked ? 'border-[#C4623A]/40 bg-[#C4623A]/10 text-[#C4623A]' : 'border-sage-200 bg-sage-50 text-sage-800'}`} title={item.name}>
          {item.name}
        </span>
      )}
      {pending || blocked ? (
        <span className={`text-[10px] leading-tight ${blocked ? 'text-[#C4623A]' : 'text-sage-700'}`} role="status">
          {pending ? 'Проверяется' : 'Файл заблокирован'}
        </span>
      ) : null}
      <button type="button" title="Убрать файл" aria-label={`Убрать файл ${item.name}`} disabled={disabled} onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs text-white md:h-4 md:w-4 md:text-[10px] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        ×
      </button>
    </span>
  )
}

function FileUploadInput({
  value,
  maxCount,
  appId,
  conversation,
  compact,
  disabled = false,
  onChange,
  onBusyChange,
  onUploadAlert,
}: FileUploadProps) {
  const conversationMode = Boolean(conversation)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingChip[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const current = useRef({ value, maxCount, disabled, onChange, onBusyChange, onUploadAlert })
  current.current = { value, maxCount, disabled, onChange, onBusyChange, onUploadAlert }
  const flight = useRef<AbortController | null>(null)
  useEffect(() => () => {
    if (!flight.current) return
    flight.current.abort(); flight.current = null
    current.current.onBusyChange?.(false)
  }, [])
  useEffect(() => {
    if (!disabled || !flight.current) return
    flight.current.abort(); flight.current = null
    setBusy(false); setError(null); setPending([]); current.current.onBusyChange?.(false); current.current.onUploadAlert?.(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [disabled])
  const change = (next: Attachment[]) => {
    current.current.value = next
    current.current.onChange(next)
  }

  const full = value.length + pending.length >= maxCount

  const reportError = (fileName: string, message: string) => {
    if (current.current.onUploadAlert) current.current.onUploadAlert(uploadAlertFromError(fileName, message))
    else setError(message)
  }

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0 || current.current.disabled || flight.current) return
    const controller = new AbortController()
    flight.current = controller
    const active = () => flight.current === controller && !controller.signal.aborted && !current.current.disabled
    setError(null)
    current.current.onUploadAlert?.(null)
    setBusy(true)
    onBusyChange?.(true)
    const added: Attachment[] = []
    const batch = [...files].slice(0, maxCount - current.current.value.length)
    try {
      for (const file of batch) {
        if (!active()) return
        const chipId = crypto.randomUUID()
        setPending((currentPending) => [...currentPending, { id: chipId, name: file.name }])
        try {
          const result = await upload(file, appId, conversation, controller.signal)
          if (!active()) return
          if (result.ok) added.push(result.attachment)
          else reportError(file.name, result.error)
        } finally {
          if (active()) setPending((currentPending) => currentPending.filter((item) => item.id !== chipId))
        }
      }
    } catch { if (active()) reportError(batch[0]?.name ?? 'файл', 'Не удалось загрузить файл. Попробуйте ещё раз') }
    finally {
      if (active() && added.length > 0) change([...current.current.value, ...added].slice(0, current.current.maxCount))
      if (flight.current === controller) {
        flight.current = null; setBusy(false); setPending([]); current.current.onBusyChange?.(false)
        if (inputRef.current) inputRef.current.value = ''
      }
    }
  }

  if (conversationMode) {
    return (
      <div className="space-y-2">
        {error && !onUploadAlert ? <p className="text-xs text-red-700" role="alert">{error}</p> : null}
        {(value.length > 0 || pending.length > 0) ? (
          <div className="flex flex-wrap gap-2">
            {value.map((item) => (
              <ConversationAttachmentChip
                key={item.key}
                item={item}
                business={Boolean(conversation?.business)}
                removable
                disabled={disabled}
                onRemove={() => { if (!current.current.disabled) change(current.current.value.filter((candidate) => candidate.key !== item.key)) }}
              />
            ))}
            {pending.map((item) => <ConversationPendingChip key={item.id} name={item.name} />)}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          {!full ? (
            <button
              type="button"
              disabled={busy || disabled}
              title="Прикрепить файл"
              aria-label="Прикрепить файл"
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sand-200 bg-white text-sage-700 hover:border-sage-300 hover:bg-sage-50 disabled:opacity-40"
            >
              {busy ? <span className="motion-safe:animate-spin" aria-hidden><ProtoIcon name="spinner" size={18} /></span> : <ProtoIcon name="paperclip" size={18} />}
            </button>
          ) : null}
          <input ref={inputRef} type="file" multiple={maxCount > 1} disabled={busy || disabled} className="hidden" onChange={(event) => void pick(event.target.files)} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className={compact ? 'flex flex-wrap items-center gap-2' : 'flex flex-wrap gap-2'}>
        {value.map((item) => (
          <CellFileChip
            key={item.key}
            item={item}
            compact={compact}
            business={Boolean(conversation?.business)}
            disabled={disabled}
            onRemove={() => { if (!current.current.disabled) change(current.current.value.filter((candidate) => candidate.key !== item.key)) }}
          />
        ))}
        {pending.map((item) => (
          <span key={item.id} className="inline-flex max-w-40 flex-col gap-0.5">
            <span className="truncate rounded border border-sage-200 bg-sage-50 px-2 py-1 text-xs text-sage-800" title={item.name}>{item.name}</span>
            <span className="text-[10px] leading-tight text-sage-700" role="status">Проверяется</span>
          </span>
        ))}
        {!full ? (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => inputRef.current?.click()}
            className={`rounded-lg border border-dashed border-[var(--color-border-subtle)] text-xs text-[var(--color-ink-muted)] hover:border-sage-400 hover:text-sage-700 disabled:opacity-50 ${
              compact ? 'px-2 py-1' : 'flex h-16 w-16 items-center justify-center'
            }`}
          >
            {busy ? '…' : compact ? '+ файл' : '+'}
          </button>
        ) : null}
      </div>
      <input ref={inputRef} type="file" multiple={maxCount > 1} disabled={busy || disabled} className="hidden" onChange={(event) => void pick(event.target.files)} />
      {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : null}
    </div>
  )
}

/** Только показ, без загрузки: карточки и списки. */
export function AttachmentPreview({
  value,
  size = 'sm',
}: {
  value: Attachment[]
  size?: 'sm' | 'md'
}) {
  const usable = value.filter((item) => isAttachmentAvailable(item))
  if (usable.length === 0) return null
  const images = usable.filter((item) => isImage(item.mime))
  const box = size === 'sm' ? 'h-7 w-7' : 'h-16 w-16'

  return (
    <span className="inline-flex items-center gap-1">
      {images.slice(0, 3).map((item) => (
        <img key={item.key} src={fileUrl(item.key)} alt={item.name} className={`${box} rounded object-cover`} />
      ))}
      {usable.length > images.length ? (
        <span className="text-xs text-[var(--color-ink-muted)]">
          +{usable.length - images.length} файл(ов)
        </span>
      ) : null}
    </span>
  )
}
