'use client'

import { useEffect, useState } from 'react'

/**
 * «Отправить ещё раз».
 *
 * Письмо теряется в спаме, приходит с задержкой или не приходит вовсе,
 * и единственным выходом был возврат к форме и повторный ввод адреса —
 * то есть человек должен был догадаться, что «Ввести другой адрес»
 * на самом деле означает «попробовать снова».
 *
 * Отсчёт нужен не для красоты: каждое нажатие тратит лимит запросов
 * на этот адрес (пять за пятнадцать минут), и кнопка без паузы израсходовала
 * бы его за десять секунд — человек остался бы и без письма, и без права
 * попросить новое.
 */
export function ResendCode({
  seconds = 60,
  busy = false,
  onResend,
}: {
  seconds?: number
  busy?: boolean
  /** Возвращает сообщение для человека: что произошло после повторной отправки. */
  onResend: () => Promise<string | null>
}) {
  const [left, setLeft] = useState(seconds)
  const [note, setNote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])

  const ready = left <= 0 && !busy && !sending

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={!ready}
        aria-busy={sending}
        onClick={async () => {
          setSending(true)
          setNote(null)
          try {
            const message = await onResend()
            setNote(message)
            setLeft(seconds)
          } finally {
            setSending(false)
          }
        }}
        className="w-full rounded-xl border border-sand-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending
          ? 'Отправляем…'
          : left > 0
            ? `Отправить ещё раз через ${left} с`
            : 'Отправить ещё раз'}
      </button>

      {note ? (
        <p aria-live="polite" className="text-center text-xs text-[var(--color-ink-muted)]">
          {note}
        </p>
      ) : null}
    </div>
  )
}
