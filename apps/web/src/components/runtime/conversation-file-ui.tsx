'use client'

import type { ReactNode } from 'react'
import type { Attachment } from '@tableapp/schema'
import { ProtoIcon } from '@/components/builder/prototype/icons'
import { filesPublicOrigin, MAX_FILE_MB, isInlineImage } from '@/lib/file-policy'

export function fileUrl(key: string, business = false): string {
  if (key.startsWith('data:') || key.startsWith('blob:') || key.startsWith('/') || /^https?:/i.test(key)) return key
  const origin = filesPublicOrigin()
  return `${origin}/api/files/${key}?v=2${business ? '&business=1' : ''}`
}

export function isAttachmentAvailable(item: Attachment): boolean {
  return item.scanStatus !== 'infected' && item.scanStatus !== 'pending'
}

const MOSCOW = 'Europe/Moscow'

/** Conversation timestamps: `24.11.2026, 12:00` (Moscow). */
export function formatConversationDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: MOSCOW, day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone: MOSCOW, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  return `${day}, ${time}`
}

export function formatAttachmentSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return ''
  if (size < 1024) return `${size} Б`
  if (size < 1024 * 1024) return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(size / 1024))} КБ`
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(size / (1024 * 1024))} МБ`
}

export const ALLOWED_UPLOAD_HINT = 'Допустимы PNG, JPEG, WebP, GIF, PDF, DOCX, XLSX, TXT и CSV.'

export type UploadAlertInfo = {
  fileName: string
  kind: 'type' | 'size' | 'generic'
  message: string
}

export function uploadAlertFromError(fileName: string, error: string): UploadAlertInfo {
  const lower = error.toLowerCase()
  if (lower.includes('мб') || lower.includes('больше')) {
    return {
      fileName,
      kind: 'size',
      message: `Файл «${fileName}» не загружен: больше ${MAX_FILE_MB} МБ.`,
    }
  }
  if (
    lower.includes('тип') || lower.includes('svg') || lower.includes('html') || lower.includes('архив')
    || lower.includes('макрос') || lower.includes('исполня') || lower.includes('скрипт') || lower.includes('поддерживается')
  ) {
    return {
      fileName,
      kind: 'type',
      message: `Файл «${fileName}» не загружен: такой тип не поддерживается.`,
    }
  }
  return { fileName, kind: 'generic', message: error }
}

export function fileTypeIconName(mime: string): string {
  if (isInlineImage(mime)) return 'fileImage'
  if (mime === 'application/pdf') return 'filePdf'
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'fileDoc'
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'fileXls'
  if (mime === 'text/csv') return 'fileCsv'
  if (mime === 'text/plain') return 'file'
  return 'file'
}

type ChipProps = {
  item: Attachment
  business?: boolean
  removable?: boolean
  disabled?: boolean
  onRemove?: () => void
}

function ChipRemoveButton({ disabled, onRemove }: { disabled?: boolean; onRemove?: () => void }) {
  return (
    <button
      type="button"
      title="Убрать файл"
      aria-label="Убрать файл"
      disabled={disabled}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemove?.() }}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sage-700 hover:bg-sage-100 disabled:opacity-40"
    >
      <ProtoIcon name="close" size={14} />
    </button>
  )
}

/** Attachment chip for message history and the composer draft list. */
export function ConversationAttachmentChip({ item, business = false, removable = false, disabled = false, onRemove }: ChipProps) {
  const pending = item.scanStatus === 'pending'
  const blocked = item.scanStatus === 'infected'
  const available = isAttachmentAvailable(item)
  const sizeLabel = item.size > 0 ? formatAttachmentSize(item.size) : ''
  const label = available
    ? `${item.name}${sizeLabel ? ` · ${sizeLabel}` : ''}`
    : blocked
      ? `Файл заблокирован · ${item.name}`
      : 'Проверяется…'

  const body = (
    <>
      {pending ? (
        <span className="inline-flex shrink-0 motion-safe:animate-spin text-sage-700" aria-hidden>
          <ProtoIcon name="spinner" size={16} />
        </span>
      ) : blocked ? (
        <span className="inline-flex shrink-0" aria-hidden><ProtoIcon name="shield" size={16} /></span>
      ) : available && isInlineImage(item.mime) ? (
        <img src={fileUrl(item.key, business)} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
      ) : (
        <span className="inline-flex shrink-0 text-sage-700" aria-hidden>
          <ProtoIcon name={fileTypeIconName(item.mime)} size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    </>
  )

  const shellClass = `inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-xl border pl-2.5 pr-0.5 py-0.5 text-xs ${
    blocked
      ? 'border-[#C4623A]/35 bg-[#C4623A]/10 text-[#C4623A]'
      : pending
        ? 'border-sage-200 bg-sage-50 text-sage-800'
        : 'border-sand-200 bg-white text-sage-800'
  }`
  const mainClass = `inline-flex min-w-0 flex-1 items-center gap-2 py-1 ${available && !blocked && !pending ? 'hover:text-sage-900' : ''}`

  return (
    <span className={shellClass}>
      {available ? (
        <a
          href={fileUrl(item.key, business)}
          target="_blank"
          rel="noreferrer"
          download={item.key.startsWith('data:') ? item.name : undefined}
          className={`${mainClass} no-underline`}
          title={label}
          aria-label={label}
        >
          {body}
        </a>
      ) : (
        <span
          className={mainClass}
          role="status"
          title={blocked ? 'Найдена угроза, файл удалён' : undefined}
          aria-label={blocked ? `Файл заблокирован: ${item.name}. Найдена угроза, файл удалён` : `Файл ${item.name}: проверяется`}
        >
          {body}
        </span>
      )}
      {removable ? <ChipRemoveButton disabled={disabled} onRemove={onRemove} /> : null}
    </span>
  )
}

export function ConversationPendingChip({ name, disabled, onRemove }: { name: string; disabled?: boolean; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-xl border border-sage-200 bg-sage-50 py-0.5 pl-2.5 pr-0.5 text-xs text-sage-800">
      <span className="inline-flex min-w-0 flex-1 items-center gap-2 py-1" role="status">
        <span className="inline-flex shrink-0 motion-safe:animate-spin" aria-hidden><ProtoIcon name="spinner" size={16} /></span>
        <span className="min-w-0 truncate">Проверяется…</span>
        <span className="sr-only">{name}</span>
      </span>
      {onRemove ? <ChipRemoveButton disabled={disabled} onRemove={onRemove} /> : null}
    </span>
  )
}

export function ConversationUploadAlert({ alert, onClose }: { alert: UploadAlertInfo; onClose: () => void }) {
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-[#C4623A]/25 bg-[#C4623A]/10 px-3 py-2.5 text-sm text-[#8a3d28]">
      <span className="mt-0.5 shrink-0 text-[#C4623A]" aria-hidden><ProtoIcon name="warning" size={18} /></span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="break-words font-medium leading-snug">{alert.message}</p>
        {alert.kind === 'type' || alert.kind === 'size' ? (
          <p className="text-xs leading-relaxed text-[#8a3d28]/80">{ALLOWED_UPLOAD_HINT}</p>
        ) : null}
      </div>
      <button type="button" aria-label="Скрыть сообщение" onClick={onClose} className="shrink-0 self-start rounded-lg p-1 text-[#C4623A] hover:bg-[#C4623A]/10">
        <ProtoIcon name="close" size={16} />
      </button>
    </div>
  )
}

export function ComposerModeSegment({
  internal,
  disabled,
  onChange,
}: {
  internal: boolean
  disabled?: boolean
  onChange: (internal: boolean) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Режим ответа"
      className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-sand-200 bg-white"
    >
      <button
        type="button"
        role="radio"
        aria-checked={!internal}
        aria-pressed={!internal}
        disabled={disabled}
        onClick={() => onChange(false)}
        className={`min-h-9 px-2 py-1.5 text-xs font-semibold leading-snug disabled:opacity-40 ${
          !internal ? 'bg-sage-50 text-ink' : 'bg-transparent text-ink-muted'
        }`}
      >
        Ответ клиенту
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={internal}
        aria-pressed={internal}
        disabled={disabled}
        onClick={() => onChange(true)}
        className={`min-h-9 border-l border-sand-200 px-2 py-1.5 text-xs font-semibold leading-snug disabled:opacity-40 ${
          internal ? 'bg-[#C4623A]/12 text-[#8a3d28]' : 'bg-transparent text-ink-muted'
        }`}
      >
        Внутренняя заметка
      </button>
    </div>
  )
}

export function AutoGrowTextarea({
  value,
  onChange,
  disabled,
  required,
  label,
  maxLength = 4000,
  footer,
  tone = 'default',
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  label: string
  maxLength?: number
  footer?: ReactNode
  tone?: 'default' | 'internal'
}) {
  const shell = tone === 'internal'
    ? 'border-[#C4623A]/35 bg-[#C4623A]/08 focus-within:border-[#C4623A]/55'
    : 'border-sand-200 bg-white focus-within:border-sage-400'
  return (
    <div className={`rounded-xl border ${shell}`}>
      <label className="block px-3 pt-2 text-xs font-medium text-ink-muted">{label}
        <textarea
          value={value}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          rows={1}
          aria-label={label}
          onChange={(event) => {
            onChange(event.target.value)
            event.target.style.height = 'auto'
            event.target.style.height = `${Math.min(event.target.scrollHeight, 220)}px`
          }}
          ref={(node) => {
            if (!node) return
            node.style.height = 'auto'
            node.style.height = `${Math.min(Math.max(node.scrollHeight, 72), 220)}px`
          }}
          className="mt-1 max-h-[220px] min-h-[72px] w-full resize-none overflow-y-auto bg-transparent pb-2 text-sm leading-relaxed text-ink outline-none"
        />
      </label>
      {footer}
    </div>
  )
}
