'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { APP_TIME_ZONE } from '@tableapp/schema'
import { createTableAction } from '@/app/actions'
import { ShellIcon } from './shell/icons'
import type { DirectoryTable } from '@/lib/table-directory-data'
import { tableWorkLink } from '@/lib/table-work-link'
import { ownerPrimary } from './owner-ui'

export type { DirectoryTable } from '@/lib/table-directory-data'

export function TableDirectory({ tables, canCreate }: {
  tables: DirectoryTable[]
  canCreate: boolean
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()
  const visible = tables.filter(table => table.name.toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU')))

  const create = () => {
    if (pending || !canCreate || !name.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await createTableAction(name.trim())
        if (!result.ok) return setError(result.error)
        router.push(tableWorkLink(result.tableId, true))
      } catch {
        setError('Не удалось создать таблицу. Попробуйте ещё раз.')
      }
    })
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Таблицы</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">{canCreate||tables.some(table=>table.access==='edit') ? 'Откройте таблицу и работайте с данными.' : 'Откройте таблицу, чтобы посмотреть записи.'}</p>
        </div>
        {canCreate ? (
          <button type="button" onClick={() => { setCreating(true); setError(null) }}
            className={ownerPrimary}>
            <ShellIcon name="plus" className="size-4" />Новая таблица
          </button>
        ) : null}
      </header>

      {canCreate && creating ? (
        <form onSubmit={event => { event.preventDefault(); create() }}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-sand-200 bg-white p-4">
          <label className="min-w-0 flex-1 text-sm font-medium text-ink sm:min-w-48">
            Название таблицы
            <input autoFocus value={name} onChange={event => setName(event.target.value)}
              onKeyDown={event => { if (event.key === 'Escape' && !pending) setCreating(false) }}
              disabled={pending} required placeholder="Например, товары" maxLength={160}
              className="mt-1.5 block w-full rounded-lg border border-sand-200 px-3 py-2 font-normal outline-none focus:border-sage-400 disabled:opacity-50" />
          </label>
          <button type="submit" disabled={pending || !name.trim()}
            className="rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40">
            {pending ? 'Создаём…' : 'Создать'}
          </button>
          <button type="button" disabled={pending} onClick={() => { setCreating(false); setName(''); setError(null) }}
            className="rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-sand-100 disabled:opacity-40">Отмена</button>
        </form>
      ) : null}

      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {tables.length ? (
        <div className="mt-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">Всего таблиц: {tables.length}</p>
            {tables.length > 3 ? <label className="w-full sm:w-72"><span className="sr-only">Поиск таблицы</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Найти таблицу" className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm outline-none focus:border-sage-400 focus-visible:ring-2 focus-visible:ring-sage-400/30" /></label> : null}
          </div>
          <ul className="overflow-hidden rounded-2xl border border-sand-200 bg-white divide-y divide-sand-200">
            {visible.map(table => (
              <li key={table.id} className="flex min-w-0 items-center gap-2 pr-4 hover:bg-sand-50">
                <Link href={tableWorkLink(table.id, table.access?table.access==='edit':canCreate)} aria-label={table.name} className="group flex min-w-0 flex-1 items-center gap-4 p-4 sm:p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-400">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-sage-700"><ShellIcon name="table" /></span>
                  <div className="min-w-0 flex-1"><h2 className="break-words text-base font-semibold text-ink">{table.name}</h2><p className="mt-1 text-sm text-ink-soft">Записей: <span className="tabular-nums">{table.rowCount.toLocaleString('ru-RU')}</span>{table.access==='view'?<span className="ml-3 text-xs text-ink-muted">Просмотр</span>:null}</p></div>
                  <time dateTime={table.updatedAt} className="hidden text-sm text-ink-muted sm:block">{new Date(table.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: APP_TIME_ZONE })}</time>
                </Link>
                <Link href={`/tables/${encodeURIComponent(table.id)}`} aria-label={`Сведения о таблице «${table.name}»`} title="Сведения о таблице" className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-sand-100 hover:text-sage-700 focus-visible:ring-2 focus-visible:ring-sage-400"><ShellIcon name="gear" className="size-5" /></Link>
              </li>
            ))}
          </ul>
          {!visible.length ? <p role="status" className="rounded-xl border border-sand-200 bg-white px-5 py-8 text-sm text-ink-soft">По запросу «{search}» таблиц нет. Попробуйте другое название.</p> : null}
        </div>
      ) : (
        <div className="mt-7 rounded-2xl border border-sand-200 bg-white px-5 py-8">
          <p className="font-medium text-ink">{canCreate?'Таблиц пока нет':'Нет доступных таблиц'}</p>
          <p className="mt-2 text-sm text-ink-soft">{canCreate ? 'Создайте свою таблицу, загрузите файл или начните с готового шаблона.' : 'Таблицы появятся здесь, когда владелец откроет к ним доступ.'}</p>
        </div>
      )}

      {canCreate ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link href="/import" className="text-ink-soft underline decoration-sand-300 underline-offset-4 hover:text-ink">Загрузить Excel или CSV</Link>
          <Link href="/templates" className="text-ink-soft underline decoration-sand-300 underline-offset-4 hover:text-ink">Выбрать шаблон</Link>
        </div>
      ) : null}
    </main>
  )
}
