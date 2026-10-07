'use client'

import type { Field } from '@tableapp/schema'
import { useEffect, useState } from 'react'
import { loadTableHistoryAction, type HistoryEntry } from '@/app/history-actions'
import type { TitleIndex } from '@/lib/table-export'
import { diffChange, OP_LABELS } from '@/lib/history'

/**
 * История правок таблицы. Открывается поверх экрана и грузится по требованию:
 * записей много, а нужны они редко — тянуть их вместе с таблицей незачем.
 */
export function HistoryPanel({
  tableId,
  fields,
  titles,
  onClose,
}: {
  tableId: string
  fields: readonly Field[]
  titles?: TitleIndex
  onClose: () => void
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadTableHistoryAction(tableId).then((result) => {
      if (cancelled) return
      if (result.ok) setEntries(result.entries)
      else setError(result.error)
    })
    return () => {
      cancelled = true
    }
  }, [tableId])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20" onClick={onClose}>
      <aside
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col border-l border-[var(--color-border-subtle)] bg-white shadow-lift"
      >
        <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">История изменений</h2>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Последние правки: кто, когда и что поменял
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-sm hover:bg-[var(--color-surface-muted)]"
          >
            Закрыть
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : entries === null ? (
            <p className="text-sm text-[var(--color-ink-muted)]">Загружаем…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Правок пока не было. Здесь появится всё, что менялось в таблице.
            </p>
          ) : (
            <ol className="space-y-4">
              {entries.map((entry) => {
                const diffs = diffChange(entry.op, entry.before, entry.after, fields, titles)
                return (
                  <li key={entry.id} className="border-b border-[var(--color-border-subtle)] pb-4 last:border-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{OP_LABELS[entry.op]}</span>
                      <span className="shrink-0 text-xs tabular-nums text-[var(--color-ink-muted)]">
                        {new Date(entry.createdAt).toLocaleString('ru-RU', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{entry.actor}</p>

                    {diffs.length === 0 ? (
                      <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
                        Значимых полей не изменилось
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1.5 text-sm">
                        {diffs.map((diff) => (
                          <li key={diff.fieldId} className="leading-snug">
                            <span className="text-[var(--color-ink-muted)]">{diff.name}: </span>
                            {diff.from ? (
                              <span className="text-[var(--color-ink-muted)] line-through">{diff.from}</span>
                            ) : (
                              <span className="text-[var(--color-ink-muted)]">пусто</span>
                            )}
                            <span className="mx-1.5 text-[var(--color-ink-muted)]">→</span>
                            <span>{diff.to || 'пусто'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  )
}
