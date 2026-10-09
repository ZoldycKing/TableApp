'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { BusinessProfile } from '@tableapp/schema'
import { saveBusinessProfileAction } from '@/app/business-actions'

export function BusinessSettings({ profile, canEdit = true }: { profile: BusinessProfile | null; canEdit?: boolean }) {
  const [value, setValue] = useState(profile ?? { name: '', location: '', phone: '' })
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  return <form className="mb-6 space-y-3 rounded-xl border border-sand-200 bg-white p-4" onSubmit={event => {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveBusinessProfileAction(value)
      setMessage(result.ok ? 'Данные бизнеса сохранены' : result.error)
      if (result.ok) router.refresh()
    })
  }}>
    <h2 className="text-sm font-semibold">Ваш бизнес в приложениях</h2>
    <p className="text-xs text-ink-muted">Эти данные видят клиенты во всех приложениях этого бизнеса. Название рабочего пространства остаётся внутренним. Изменения вступают в силу сразу.</p>
    {!canEdit ? <p className="text-xs text-ink-muted">Изменить данные может владелец или редактор рабочего пространства.</p> : null}
    <div className="grid gap-3 sm:grid-cols-3">
      {(['name', 'location', 'phone'] as const).map(key => <label key={key} className="space-y-1 text-xs text-ink-muted">
        <span>{key === 'name' ? 'Название бизнеса' : key === 'location' ? 'Адрес или филиал (необязательно)' : 'Телефон бизнеса (необязательно)'}</span>
        <input disabled={!canEdit || pending} required={key === 'name'} maxLength={key === 'name' ? 100 : key === 'location' ? 160 : 40} value={value[key]} onChange={event => setValue({ ...value, [key]: event.target.value })} className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm text-ink outline-none focus:border-sage-400 disabled:bg-sand-50" />
      </label>)}
    </div>
    {message ? <p role="status" className="text-sm text-ink-soft">{message}</p> : null}
    {canEdit ? <button disabled={pending} className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-40">{pending ? 'Сохраняем…' : 'Сохранить данные бизнеса'}</button> : null}
  </form>
}
