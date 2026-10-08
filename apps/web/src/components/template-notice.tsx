'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteSampleRowsAction, dismissTemplateNoticeAction } from '@/app/template-actions'

/**
 * Подсказка над таблицей, созданной из шаблона.
 *
 * Отвечает на вопрос, который человек задаёт первым: «а это чьи строки и
 * что с ними делать?». Отсюда же два выхода — убрать примеры и загрузить
 * свои данные, — потому что искать их в меню он не станет.
 */
export function TemplateNotice({ tableId, sampleCount }: { tableId: string; sampleCount: number }) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error ?? 'Не получилось')
      else router.refresh()
    })

  return (
    <div className="mb-4 rounded-xl border border-sage-200 bg-sage-50/70 px-4 py-3">
      <p className="text-sm text-ink">
        <span className="font-medium">Это заготовка из шаблона.</span> Строк-примеров здесь: {sampleCount}. Они
        показывают, как всё работает. Удаление примеров относится только к этой таблице; ваши записи и отредактированные примеры сохранятся.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Link
          href={`/import?table=${tableId}`}
          className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-sand-50 transition-opacity hover:opacity-90"
        >
          Загрузить свои данные из Excel
        </Link>

        {/* Удаление подтверждается: примеры стоят рядом с уже внесёнными строками. */}
        {confirming ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteSampleRowsAction(tableId))}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 transition-colors hover:bg-red-50 disabled:opacity-40"
            >
              {pending ? '…' : `Да, удалить ${sampleCount}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-2 py-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
            >
              Отмена
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-xs transition-colors hover:border-ink/25"
          >
            Удалить примеры ({sampleCount})
          </button>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => dismissTemplateNoticeAction(tableId))}
          className="rounded-lg px-2 py-1.5 text-xs text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          Всё понятно, скрыть
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  )
}
