'use client'

import { useRef, useState } from 'react'
import { sendConversationAction } from '@/app/conversation-actions'
import { GENERAL_CONVERSATION_SELF, GENERAL_CONVERSATION_TABLE } from '@/lib/conversation-types'
import type { ConversationTarget } from './conversation-inbox'

type Props = {
  slug: string
  businessName: string
  authenticated: boolean
  body: string
  onBodyChange: (value: string) => void
  requestId: string
  onLogin: () => void
  onSent: (target: ConversationTarget) => void
  onCancel: () => void
}

/** The parent keeps the draft through email login; opening this form never creates a dialog. */
export function GeneralQuestion({ slug, businessName, authenticated, body, onBodyChange, requestId, onLogin, onSent, onCancel }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sending = useRef(false)

  const submit = async () => {
    if (sending.current) return
    if (!body.trim() || body.length > 4000) { setError('Напишите вопрос — не больше 4000 символов.'); return }
    setError(null)
    if (!authenticated) { onLogin(); return }
    sending.current = true
    setBusy(true)
    try {
      const target = { slug, tableId: GENERAL_CONVERSATION_TABLE, rowId: GENERAL_CONVERSATION_SELF }
      const result = await sendConversationAction(slug, target.tableId, target.rowId, { body, requestId }, false)
      if (!result.ok) { setError(result.error); return }
      onSent(target)
    } catch {
      setError('Не удалось отправить вопрос. Текст сохранён — попробуйте ещё раз.')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return <section aria-label="Новый вопрос бизнесу" className="mx-auto w-full min-w-0 max-w-xl space-y-4 rounded-2xl border border-sand-200 bg-white p-4 [overflow-wrap:anywhere]">
    <div className="space-y-1">
      <p className="text-xs text-ink-muted">{businessName}</p>
      <h2 className="font-semibold">Вопрос бизнесу</h2>
    </div>
    <p className="text-sm leading-relaxed text-ink-muted">Спросите о товарах, услугах или условиях. Ответ сотрудников «{businessName}» появится в разделе «Сообщения».</p>
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit() }}>
      <label className="block text-sm">Ваш вопрос
        <textarea value={body} onChange={event => { onBodyChange(event.target.value); setError(null) }} disabled={busy} required maxLength={4000} rows={5}
          className="mt-1 w-full min-w-0 rounded-xl border border-sand-200 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sage-400 disabled:opacity-50" />
      </label>
      {!authenticated ? <p className="text-xs leading-relaxed text-ink-muted">Для отправки подтвердите почту одноразовым кодом. Текст вопроса сохранится.</p> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !body.trim()} className="rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-sage-400 disabled:opacity-40">
          {busy ? 'Отправляем…' : authenticated ? 'Отправить вопрос' : 'Задать вопрос'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl px-3 py-2.5 text-sm text-ink-soft outline-none hover:bg-sand-50 focus-visible:ring-2 focus-visible:ring-sage-400 disabled:opacity-40">Отмена</button>
      </div>
    </form>
  </section>
}
