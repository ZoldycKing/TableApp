'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createTableAction } from '@/app/actions'
import type { TableSummary } from '@/lib/queries'

export function TableSwitcher({
  tables,
  activeTableId,
  onError,
  compact = false,
  canCreate = true,
}: {
  tables: TableSummary[]
  activeTableId: string
  onError: (message: string) => void
  /** The business tree already lists tables; only keep creation here. */
  compact?: boolean
  canCreate?: boolean
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const create = () => {
    if (!canCreate || pending || !name.trim()) return
    startTransition(async () => {
      const result = await createTableAction(name.trim())
      if (!result.ok) return onError(result.error)
      setCreating(false)
      setName('')
      router.push(`/t/${result.tableId}`)
    })
  }

  if (compact && !canCreate) return null

  return (
    <nav aria-label={compact ? 'Создание таблицы' : 'Таблицы бизнеса'} className={`mb-4 flex flex-wrap items-center gap-1 ${compact ? '' : 'border-b border-[var(--color-border-subtle)] pb-2'}`}>
      {!compact ? tables.map((table) => (
        <button
          key={table.id}
          type="button"
          onClick={() => router.push(`/t/${table.id}`)}
          className={`rounded-lg px-2.5 py-1.5 text-sm transition ${
            table.id === activeTableId
              ? 'bg-[var(--color-surface-muted)] font-medium'
              : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]'
          }`}
        >
          {table.name}
        </button>
      )) : null}

      {canCreate ? creating ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create()
              if (event.key === 'Escape') setCreating(false)
            }}
            placeholder="Название таблицы"
            aria-label="Название таблицы"
            disabled={pending}
            maxLength={160}
            className="w-44 rounded border border-[var(--color-border-subtle)] px-2 py-1 text-sm outline-none focus:border-sage-400"
          />
          <button
            type="button"
            onClick={create}
            disabled={pending || !name.trim()}
            className="rounded-lg bg-ink px-2.5 py-1.5 text-sm text-white hover:bg-ink/90 disabled:opacity-40"
          >
            {pending ? '…' : 'Создать'}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg px-2.5 py-1.5 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-muted)]"
        >
          + Таблица
        </button>
      ) : null}
    </nav>
  )
}
