'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clearInventorySamplesAction } from '@/app/template-actions'
import { ownerPrimary, ownerSecondary } from './owner-ui'

export function InventoryPreparation({ appId, sampleCount, canEdit }: { appId: string; sampleCount: number; canEdit: boolean }) {
  const [confirm, setConfirm] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Explicit busy flag: useTransition pending can lag behind an error alert and leave
  // the confirm button stuck on «Убираем примеры…» / disabled, so retry is unreachable.
  const [pending, setPending] = useState(false)
  const lock = useRef(false)
  const router = useRouter()
  const clear = () => {
    if (lock.current || !canEdit) return
    lock.current = true
    setPending(true)
    setError(null)
    void (async () => {
      try {
        const result = await clearInventorySamplesAction(appId)
        if (!result.ok) { setError(result.error); return }
        setCleared(true); setConfirm(false); router.refresh()
      } catch { setError('Не удалось убрать примеры. Попробуйте ещё раз.') }
      finally { lock.current = false; setPending(false) }
    })()
  }
  if (!sampleCount || cleared) return cleared ? <p role="status" className="mb-6 text-sm leading-6 text-sage-800">Примеры убраны. Можно добавлять свои товары и начальные остатки.</p> : null
  return <section aria-labelledby="inventory-examples" aria-busy={pending} className="mb-6 rounded-2xl border border-sand-200 bg-sage-50 p-5 sm:p-6">
    <h3 id="inventory-examples" className="text-base font-semibold">Сейчас на складе учебные примеры</h3>
    <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">Уберите учебные товары и операции перед началом работы. Ваши записи и товары с вашими операциями сохранятся.</p>
    {canEdit ? <div className="mt-4 flex flex-wrap items-center gap-3">{confirm ? <><p className="w-full text-sm leading-6 text-ink">Убрать неизменённые примеры? Записей: {sampleCount}. Их можно восстановить в истории таблиц.</p><button type="button" disabled={pending} className={ownerPrimary} onClick={clear}>{pending ? 'Убираем примеры…' : 'Убрать примеры'}</button><button type="button" disabled={pending} className={ownerSecondary} onClick={() => setConfirm(false)}>Оставить примеры</button></> : <button type="button" className={ownerSecondary} onClick={() => setConfirm(true)}>Начать со своих данных</button>}</div> : null}
    {error ? <p role="alert" className="mt-3 text-sm leading-6 text-red-700">{error}</p> : null}
  </section>
}
