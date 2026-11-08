'use client'

import type { App } from '@tableapp/schema'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { AppAccessSettings } from './app-access-settings'
import type { TableSummary } from '@/lib/queries'
import { PublicationStatus } from './publication-status'
import { ownerPrimary, ownerSecondary } from './owner-ui'
import {
  deleteAppAction,
  changeAppSlugAction,
  publishAppAction,
  unpublishAppAction,
  updateAppDraftAction,
} from '@/app/app-actions'

export type AppRow = { app: App; publishedAt: string | null; published?: boolean; origin: string; addressLocked?: boolean; hasUnpublishedChanges?: boolean; stockAutomation?: boolean }

export function AppsManager({ apps, tables, canEdit = true }: { apps: AppRow[]; tables: TableSummary[]; canEdit?: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await work()
        if (!result.ok) return setError(result.error ?? 'Не удалось выполнить действие')
        router.refresh()
      } catch { setError('Не удалось связаться с сервером. Проверьте соединение и повторите действие.') }
    })
  }

  if (apps.length === 0) {
    return (
      <section className="rounded-2xl border border-sand-200 bg-white px-5 py-8">
        <h2 className="font-semibold text-ink">Приложений пока нет</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">{canEdit ? 'Начните с таблицы: выберите данные, подготовьте экраны и доступ, затем опубликуйте приложение.' : 'Когда владелец подготовит приложение, оно появится здесь.'}</p>
        {canEdit ? <div className="mt-5 flex flex-wrap gap-3"><Link href="/tables" className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white">Выбрать таблицу</Link><Link href="/templates" className="rounded-lg border border-sand-200 px-4 py-2.5 text-sm font-medium text-ink">Начать с шаблона</Link></div> : null}
      </section>
    )
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {!canEdit ? <p role="status" className="text-sm text-[var(--color-ink-muted)]">У вас доступ только для просмотра. Изменение настроек и публикация недоступны.</p> : null}
      {apps.map(({ app, publishedAt, published, origin, addressLocked, hasUnpublishedChanges, stockAutomation }) => {
        const url = `${origin}/a/${app.slug}`
        const isPublished = published ?? Boolean(publishedAt)
        return (
          <article
            key={app.id}
            className="rounded-2xl border border-sand-200 bg-white p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{app.name}</h2><PublicationStatus published={isPublished} hasChanges={hasUnpublishedChanges} /></div>
                <p className="mt-2 text-sm text-ink-soft">{!isPublished ? 'Рабочая ссылка появится после публикации.' : hasUnpublishedChanges ? 'Пользователи видят предыдущую опубликованную версию.' : 'Приложение доступно по рабочей ссылке.'}</p>
                {isPublished ? (
                  <a
                    href={`/a/${app.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block break-all text-xs text-sage-700 underline"
                  >
                    {url}
                  </a>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={`/apps/${app.id}`}
                  className={hasUnpublishedChanges || !isPublished ? ownerPrimary : ownerSecondary}
                >
                  {canEdit ? hasUnpublishedChanges ? 'Проверить изменения' : 'Настроить приложение' : 'Просмотреть настройки'}
                </a>
                {isPublished ? <Link href={`/a/${app.slug}`} className={hasUnpublishedChanges ? ownerSecondary : ownerPrimary}>Открыть приложение</Link> : null}
                {stockAutomation ? <Link href={`/apps/${encodeURIComponent(app.id)}/automations`} className={ownerSecondary}>Автоматизация</Link> : null}
              </div>
            </div>

            <details className="mt-4 border-t border-sand-200 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sage-400">Публикация, ссылка и доступ</summary>
              <p className="mt-3 text-sm leading-6 text-ink-soft">Настройки сохраняются в черновике. Пользователи увидят их после публикации.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {canEdit ? <><button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => publishAppAction(app.id, app))}
                  className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
                >
                  {isPublished ? 'Опубликовать заново' : 'Опубликовать'}
                </button>
                {isPublished ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => unpublishAppAction(app.id))}
                    className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-muted)] disabled:opacity-40"
                  >
                    Снять с публикации
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Удалить приложение «${app.name}»?`)) return
                    run(() => deleteAppAction(app.id))
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Удалить
                </button></> : null}
              </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="block text-xs text-[var(--color-ink-muted)]">Название</span>
                <input
                  disabled={!canEdit || pending}
                  defaultValue={app.name}
                  onBlur={(event) => {
                    if (event.target.value.trim() === app.name) return
                    run(() => updateAppDraftAction(app.id, { ...app, name: event.target.value.trim() }))
                  }}
                  className="w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 text-sm outline-none focus:border-sage-400"
                />
              </label>
              <AppAddress app={app} origin={origin} locked={addressLocked ?? isPublished} disabled={!canEdit || pending} onSave={slug => run(() => changeAppSlugAction(app.id, slug, app.slug))} />
            </div>

            <fieldset disabled={!canEdit || pending}>
            <AppAccessSettings
              app={app}
              tables={tables}
              onChange={(next) => run(() => updateAppDraftAction(app.id, next))}
            />
            </fieldset>

            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              Публикация делает снимок: правки видны пользователям только после следующей публикации.
            </p>
            </details>
          </article>
        )
      })}
    </div>
  )
}

function AppAddress({ app, origin, locked, disabled, onSave }: { app: App; origin: string; locked: boolean; disabled: boolean; onSave: (slug: string) => void }) {
  const [slug, setSlug] = useState(app.slug)
  useEffect(() => setSlug(app.slug), [app.slug])
  return <div className="space-y-1">
    <label className="block space-y-1"><span className="block text-xs text-[var(--color-ink-muted)]">Адрес</span>
      <input value={slug} disabled={disabled || locked} onChange={event => setSlug(event.target.value)} className="w-full rounded border border-[var(--color-border-subtle)] px-2 py-1.5 font-mono text-sm outline-none focus:border-sage-400 disabled:bg-sand-50" />
    </label>
    {locked ? <p className="text-xs text-[var(--color-ink-muted)]">Адрес закреплён после первой публикации, чтобы ссылки клиентов продолжали работать.</p> : <>
      <p className="break-all text-xs text-[var(--color-ink-muted)]">После публикации: {origin}/a/{slug}</p>
      <button type="button" disabled={disabled || slug === app.slug} onClick={() => onSave(slug.trim())} className="rounded border border-sand-200 px-2 py-1 text-xs disabled:opacity-40">Сохранить адрес</button>
      <p className="text-xs text-[var(--color-ink-muted)]">Адрес можно выбрать до первой публикации. После неё он останется постоянным.</p>
    </>}
  </div>
}
