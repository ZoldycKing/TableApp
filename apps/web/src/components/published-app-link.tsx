'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ownerPrimary, ownerSecondary } from './owner-ui'

export function PublishedAppLink({ slug, onAccess, personal = false }: { slug: string; onAccess?: () => void; personal?: boolean }) {
  const [message, setMessage] = useState('')
  const path = `/a/${encodeURIComponent(slug)}`
  return <section tabIndex={-1} aria-labelledby="published-link-title" className="my-6 scroll-mt-20 rounded-2xl border border-sage-200 bg-sage-50 p-5 outline-none focus-visible:ring-2 focus-visible:ring-sage-400 sm:p-6">
    <h2 id="published-link-title" className="text-lg font-semibold">{personal ? 'Личное приложение готово' : 'Приложение опубликовано'}</h2>
    <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">{personal ? 'Открывайте приложение с компьютера или телефона. Записи сохраняются в ваших таблицах.' : 'Поделитесь ссылкой на приложение. Каждый увидит только доступные ему разделы.'}</p>
    <div className="mt-4 flex flex-wrap gap-3"><Link href={path} className={ownerPrimary}>Открыть приложение</Link><button type="button" className={ownerSecondary} onClick={async () => {
      try { await navigator.clipboard.writeText(new URL(path, window.location.origin).href); setMessage('Ссылка скопирована') }
      catch { setMessage('Не удалось скопировать ссылку. Откройте приложение и скопируйте адрес из браузера.') }
    }}>Скопировать ссылку</button>{onAccess ? <button type="button" className={ownerSecondary} onClick={onAccess}>Кто может войти</button> : null}</div>
    <p role="status" aria-live="polite" className="mt-3 break-words text-sm text-ink-soft">{message || path}</p>
  </section>
}
