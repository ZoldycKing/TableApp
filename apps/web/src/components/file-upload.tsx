'use client'

import type { Attachment } from '@tableapp/schema'
import { useEffect, useRef, useState } from 'react'
import { isInlineImage } from '@/lib/file-policy'

export function fileUrl(key: string, business = false): string {
  return `/api/files/${key}?v=2${business ? '&business=1' : ''}`
}

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
}

export function FileUpload(props: FileUploadProps) {
  const context = JSON.stringify([props.appId, props.conversation?.slug, props.conversation?.tableId, props.conversation?.rowId, Boolean(props.conversation?.business)])
  return <FileUploadInput key={context} {...props} />
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
}: FileUploadProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const current = useRef({ value, maxCount, disabled, onChange, onBusyChange })
  current.current = { value, maxCount, disabled, onChange, onBusyChange }
  const flight = useRef<AbortController | null>(null)
  useEffect(() => () => {
    if (!flight.current) return
    flight.current.abort(); flight.current = null
    current.current.onBusyChange?.(false)
  }, [])
  useEffect(() => {
    if (!disabled || !flight.current) return
    flight.current.abort(); flight.current = null
    setBusy(false); setError(null); current.current.onBusyChange?.(false)
    if (inputRef.current) inputRef.current.value = ''
  }, [disabled])
  const change = (next: Attachment[]) => {
    current.current.value = next
    current.current.onChange(next)
  }

  const full = value.length >= maxCount

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0 || current.current.disabled || flight.current) return
    const controller = new AbortController()
    flight.current = controller
    const active = () => flight.current === controller && !controller.signal.aborted && !current.current.disabled
    setError(null)
    setBusy(true)
    onBusyChange?.(true)
    const added: Attachment[] = []
    try { for (const file of [...files].slice(0, maxCount - current.current.value.length)) {
      const result = await upload(file, appId, conversation, controller.signal)
      if (!active()) return
      if (result.ok) added.push(result.attachment)
      else setError(result.error)
    }
    } catch { if (active()) setError('Не удалось загрузить файл. Попробуйте ещё раз') }
    finally {
      if (active() && added.length > 0) change([...current.current.value, ...added].slice(0, current.current.maxCount))
      if (flight.current === controller) {
        flight.current = null; setBusy(false); current.current.onBusyChange?.(false)
        if (inputRef.current) inputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-1.5">
      <div className={compact ? 'flex flex-wrap items-center gap-1' : 'flex flex-wrap gap-2'}>
        {value.map((item) => (
          <span key={item.key} className="group relative inline-flex">
            {isImage(item.mime) ? (
              <img
                src={fileUrl(item.key, Boolean(conversation?.business))}
                alt={item.name}
                className={compact ? 'h-7 w-7 rounded object-cover' : 'h-16 w-16 rounded-lg object-cover'}
              />
            ) : (
              <a
                href={fileUrl(item.key, Boolean(conversation?.business))}
                target="_blank"
                rel="noreferrer"
                className="max-w-40 truncate rounded border border-[var(--color-border-subtle)] px-2 py-1 text-xs underline"
              >
                {item.name}
              </a>
            )}
            <button
              type="button"
              title="Убрать файл"
              aria-label={`Убрать файл ${item.name}`}
              disabled={disabled}
              onClick={() => { if (!current.current.disabled) change(current.current.value.filter((candidate) => candidate.key !== item.key)) }}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs text-white md:hidden md:h-4 md:w-4 md:text-[10px] md:group-hover:flex md:group-focus-within:flex [@media(hover:none)]:flex"
            >
              ×
            </button>
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

      <input
        ref={inputRef}
        type="file"
        multiple={maxCount > 1}
        disabled={busy || disabled}
        className="hidden"
        onChange={(event) => void pick(event.target.files)}
      />

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
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
  if (value.length === 0) return null
  const images = value.filter((item) => isImage(item.mime))
  const box = size === 'sm' ? 'h-7 w-7' : 'h-16 w-16'

  return (
    <span className="inline-flex items-center gap-1">
      {images.slice(0, 3).map((item) => (
        <img key={item.key} src={fileUrl(item.key)} alt={item.name} className={`${box} rounded object-cover`} />
      ))}
      {value.length > images.length ? (
        <span className="text-xs text-[var(--color-ink-muted)]">
          +{value.length - images.length} файл(ов)
        </span>
      ) : null}
    </span>
  )
}
