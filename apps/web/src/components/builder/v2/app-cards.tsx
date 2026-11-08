'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteAppAction } from '@/app/app-actions'
import { PrototypeDialog } from '../prototype/dialog'
import { ownerPrimary, ownerSecondary } from '@/components/owner-ui'

export type BuilderV2Summary = { id: string; name: string; screens: number }
export function BuilderV2AppCards({ apps, canEdit }: { apps: readonly BuilderV2Summary[]; canEdit: boolean }) {
  const [removing, setRemoving] = useState<BuilderV2Summary | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), router = useRouter()
  const remove = async () => {
    if (!removing || busy) return
    setBusy(true); setError('')
    try { const result = await deleteAppAction(removing.id); if (!result.ok) setError(result.error); else { setRemoving(null); router.refresh() } }
    catch { setError('Не удалось связаться с сервером. Попробуйте ещё раз.') }
    finally { setBusy(false) }
  }
  return <div className="mb-3 grid gap-3">{apps.map(app => <article key={app.id} className="rounded-2xl border border-sand-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{app.name}</h2><span className="rounded-lg bg-sage-100 px-2 py-1 text-xs text-sage-700">Черновик</span></div><p className="mt-2 text-sm text-ink-soft">Экранов: {app.screens}</p></div><div className="flex flex-wrap gap-2"><Link href={`/apps/${app.id}`} className={ownerPrimary}>{canEdit ? 'Открыть конструктор' : 'Просмотреть экраны'}</Link>{canEdit && <button type="button" className={ownerSecondary} onClick={() => { setRemoving(app); setError('') }}>Удалить</button>}</div></div></article>)}{removing && <PrototypeDialog title={`Удалить приложение «${removing.name}»?`} closeDisabled={busy} onClose={() => { if (!busy) setRemoving(null) }}><p className="text-sm leading-6 text-ink-soft">Экраны и настройки будут удалены. Таблицы и записи останутся.</p>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" className={ownerSecondary} disabled={busy} onClick={() => setRemoving(null)}>Оставить</button><button type="button" className="min-h-11 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void remove()}>{busy ? 'Удаляем…' : 'Удалить приложение'}</button></div></PrototypeDialog>}</div>
}
