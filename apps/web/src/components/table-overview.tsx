'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { APP_TIME_ZONE } from '@tableapp/schema'
import { createAppAction } from '@/app/app-actions'
import type { DirectoryRelation, DirectoryTable } from '@/lib/table-directory-data'
import { ShellIcon } from './shell/icons'
import { tableWorkLink } from '@/lib/table-work-link'
import { ownerPrimary } from './owner-ui'

const FIELD_TYPES: Record<string, string> = { text: 'Текст', long_text: 'Длинный текст', number: 'Число', checkbox: 'Да / нет', email: 'Почта', phone: 'Телефон', url: 'Ссылка', member: 'Участник команды', date: 'Дата', datetime: 'Дата и время', single_select: 'Выбор из списка', multi_select: 'Несколько вариантов', relation: 'Связь с таблицей', attachment: 'Файлы', image: 'Изображение', formula: 'Формула', lookup: 'Данные по связи', rollup: 'Расчёт по связи', count: 'Количество по связи', created_time: 'Дата создания', updated_time: 'Дата изменения', created_by: 'Автор записи', updated_by: 'Автор изменения', row_id: 'Идентификатор записи' }
const date = (value: string) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: APP_TIME_ZONE })
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400'

function RelationGroup({ sourceId, links, tableId }: { sourceId: string; links: DirectoryRelation[]; tableId: string }) {
  const own = sourceId === tableId
  return <article className="rounded-2xl border border-sand-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-ink">{own ? 'Эта таблица использует данные других таблиц' : `В таблице «${links[0]!.sourceName}» используют эти записи`}</h3>
      {!own ? <Link href={`/tables/${sourceId}`} className={`rounded text-sm text-ink-soft underline decoration-sand-300 underline-offset-4 hover:text-ink ${focus}`}>Открыть таблицу →</Link> : null}
    </div>
    <dl className="mt-4 divide-y divide-sand-200">
      {links.map(link => <div key={link.fieldId} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-2 sm:gap-4">
        <dt className="min-w-0 break-words text-sm text-ink">Поле «{link.fieldName}»</dt>
        <dd className="min-w-0 text-sm"><Link href={`/tables/${link.targetId}`} className={`inline-flex max-w-full items-center gap-2 rounded text-ink-soft underline decoration-sand-300 underline-offset-4 hover:text-ink ${focus}`}><ShellIcon name="table" className="size-4 shrink-0" /><span className="break-words">{link.targetName}</span></Link><p className="mt-1 text-xs text-ink-muted">{link.multiple ? 'Можно выбрать несколько записей' : 'Выбирают одну запись'}</p></dd>
      </div>)}
    </dl>
  </article>
}

export function TableOverview({ table, canEdit,canConfigure=canEdit }: { table: DirectoryTable; canEdit: boolean;canConfigure?:boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const groups = new Map<string, DirectoryRelation[]>()
  for (const relation of table.relations) groups.set(relation.sourceId, [...(groups.get(relation.sourceId) ?? []), relation])
  const createApp = () => {
    if (pending || !canEdit) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await createAppAction(table.id)
        if (!result.ok) return setError(result.error)
        router.push(`/apps/${result.appId}`)
      } catch { setError('Не удалось подготовить приложение. Проверьте соединение и попробуйте ещё раз.') }
    })
  }
  return <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
    <Link href="/tables" className={`inline-flex items-center gap-2 rounded text-sm text-ink-muted hover:text-ink ${focus}`}><span aria-hidden="true">←</span> Все таблицы</Link>
    <header className="mt-6">
      <h1 className="break-words text-2xl font-semibold tracking-tight text-ink">{table.name}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">Сведения о таблице, её полях и связях.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={tableWorkLink(table.id, canEdit)} className={ownerPrimary}><ShellIcon name="table" className="size-4" />Открыть таблицу</Link>
        {!canEdit ? <span className="self-center text-sm text-ink-muted">У вас доступ только для просмотра</span> : null}
      </div>
    </header>

    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl border border-sand-200 bg-white px-5 py-5 sm:grid-cols-4">
      <div><dt className="text-xs text-ink-muted">Записи</dt><dd className="mt-1 font-semibold tabular-nums text-ink">{table.rowCount.toLocaleString('ru-RU')}</dd></div>
      <div><dt className="text-xs text-ink-muted">Поля</dt><dd className="mt-1 font-semibold tabular-nums text-ink">{table.fieldCount}</dd></div>
      <div><dt className="text-xs text-ink-muted">Создана</dt><dd className="mt-1 text-sm text-ink"><time dateTime={table.createdAt}>{date(table.createdAt)}</time></dd></div>
      <div><dt className="text-xs text-ink-muted">Последнее изменение</dt><dd className="mt-1 text-sm text-ink"><time dateTime={table.updatedAt}>{date(table.updatedAt)}</time></dd></div>
    </dl>

    <section className="mt-9" aria-labelledby="table-apps-heading">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="table-apps-heading" className="text-lg font-semibold text-ink">Приложения на этих данных</h2>
        {canConfigure ? <button type="button" onClick={createApp} disabled={pending} className={`inline-flex items-center gap-2 rounded-xl border border-sand-200 bg-white px-3.5 py-2 text-sm font-medium hover:bg-sand-100 disabled:opacity-50 ${focus}`}><ShellIcon name="plus" className="size-4" />{pending ? 'Подготавливаем…' : 'Подготовить приложение'}</button> : null}</div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">{table.apps.length ? 'Приложение работает с теми же записями. Изменения данных будут доступны в его экранах.' : 'Подготовьте экраны для работы с данными, настройте доступ и проверьте результат перед публикацией.'}</p>
      {error ? <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {table.apps.length ? <ul className="mt-4 divide-y divide-sand-200 rounded-2xl border border-sand-200 bg-white px-4 sm:px-5">{table.apps.map(app => <li key={app.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-words text-sm font-medium text-ink">{app.name}</p><p className="mt-1 text-xs text-ink-muted">{app.inPublished ? 'Используется в опубликованной версии' : 'Используется в черновике'}{app.inPublished && !app.inDraft ? ' · убрана из черновика' : ''}</p></div><Link href={`/apps/${app.id}`} className={`rounded-lg border border-sand-200 px-3 py-2 text-sm text-ink-soft hover:bg-sand-100 ${focus}`}>{canEdit ? 'Открыть настройки' : 'Посмотреть настройки'} →</Link></li>)}</ul> : null}
    </section>

    <section className="mt-9" aria-labelledby="table-relations-heading">
      <h2 id="table-relations-heading" className="text-lg font-semibold text-ink">Связи этой таблицы</h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">Откуда берут данные и где используют записи этой таблицы.</p>
      {groups.size ? <div className="mt-4 space-y-3">{[...groups].map(([sourceId, links]) => <RelationGroup key={sourceId} sourceId={sourceId} links={links} tableId={table.id} />)}</div> : <p className="mt-4 rounded-2xl border border-sand-200 bg-white px-5 py-5 text-sm leading-6 text-ink-soft">Связей пока нет. Поле со связью позволяет выбирать запись из другой таблицы пространства, например клиента в заказе.</p>}
      {canConfigure ? <Link href={`/t/${table.id}?mode=grid`} className={`mt-3 inline-block rounded text-sm text-ink-soft underline decoration-sand-300 underline-offset-4 hover:text-ink ${focus}`}>Настроить поля и связи в редакторе →</Link> : null}
    </section>
    <details className="mt-9 rounded-2xl border border-sand-200 bg-white px-5 py-4"><summary className={`cursor-pointer rounded text-sm font-medium text-ink ${focus}`}>Поля таблицы · {table.fieldCount}</summary><ul className="mt-4 divide-y divide-sand-200">{table.fields.map(field => <li key={field.id} className="flex flex-wrap items-start justify-between gap-x-5 gap-y-1 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="break-words text-sm text-ink">{field.name}</p>{field.description ? <p className="mt-1 max-w-prose break-words text-xs leading-5 text-ink-muted">{field.description}</p> : null}</div><span className="text-xs text-ink-muted">{FIELD_TYPES[field.type] ?? field.type}</span></li>)}</ul>{!table.fields.length ? <p className="mt-3 text-sm text-ink-muted">Полей пока нет.</p> : null}</details>
  </main>
}
