'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { prepareImportedBuilderAppAction } from '@/app/builder-v2-actions'
import { ownerPrimary, ownerSecondary } from '@/components/owner-ui'

export function PrepareImportedApp({ runId, primaryTableId }: { runId: string; primaryTableId?: string }) {
  const router = useRouter(), generation = useRef(0), lock = useRef(false)
  const [error, setError] = useState(''), [pending, setPending] = useState(true)
  const prepare = useCallback(async () => {
    if (lock.current) return
    lock.current = true
    const current = ++generation.current
    setPending(true); setError('')
    try {
      const result = await prepareImportedBuilderAppAction(runId, primaryTableId)
      if (generation.current !== current) return
      if (result.ok) router.replace(`/apps/${encodeURIComponent(result.appId)}?start=1`)
      else { setError(result.error); setPending(false) }
    } catch {
      if (generation.current === current) { setError('Данные уже загружены. Не удалось подготовить приложение. Попробуйте ещё раз.'); setPending(false) }
    } finally { if (generation.current === current) lock.current = false }
  }, [runId, primaryTableId, router])
  useEffect(() => {
    const timer = setTimeout(() => void prepare(), 0)
    return () => { clearTimeout(timer); generation.current++; lock.current = false }
  }, [prepare])
  return <section aria-busy={pending} className="rounded-2xl border border-sand-200 bg-white p-6 sm:p-8">
    <h1 className="text-balance text-2xl font-semibold">{pending ? 'Готовим приложение из ваших таблиц' : 'Таблицы загружены'}</h1>
    <p className="mt-3 max-w-xl text-pretty text-base text-ink-soft">{pending ? 'Добавляем разделы и карточки. Сейчас откроем ваш черновик.' : 'Повторите подготовку или продолжите работать с таблицами.'}</p>
    {pending ? <div role="status" aria-label="Подготавливаем список и карточки" className="mt-6 space-y-3 motion-safe:animate-pulse">{[0, 1, 2].map(index => <div key={index} className="h-16 rounded-lg bg-sage-50" />)}</div> : null}
    {error ? <p role="alert" className="mt-4 text-pretty text-sm text-red-700">{error}</p> : null}
    <div className="mt-6 flex flex-wrap gap-3">{!pending ? <button type="button" className={ownerPrimary} onClick={() => void prepare()}>Повторить подготовку</button> : null}<Link href="/app" className={ownerSecondary}>К моим таблицам</Link></div>
  </section>
}
