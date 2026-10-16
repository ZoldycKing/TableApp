'use client'

import type { App } from '@tableapp/schema'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { AppAccessSettings } from './app-access-settings'
import type { TableSummary } from '@/lib/queries'
import {
  deleteAppAction,
  changeAppSlugAction,
  publishAppAction,
  unpublishAppAction,
  updateAppDraftAction,
} from '@/app/app-actions'

export type AppRow = { app: App; publishedAt: string | null; origin: string; addressLocked?: boolean }

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
      <p className="rounded-xl border border-[var(--color-border-subtle)] px-4 py-10 text-center text-sm text-[var(--color-ink-muted)]">
        Приложений пока нет. Откройте таблицу и нажмите «Создать приложение» — экраны соберутся сами.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {!canEdit ? <p role="status" className="text-sm text-[var(--color-ink-muted)]">У вас доступ только для просмотра. Изменение настроек и публикация недоступны.</p> : null}
      {apps.map(({ app, publishedAt, origin, addressLocked }) => {
        const url = `${origin}/a/${app.slug}`
        return (
          <article
            key={app.id}
            className="rounded-xl border border-[var(--color-border-subtle)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{app.name}</h2>
                <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                  {app.screens.length} экранов ·{' '}
                  {publishedAt ? `опубликовано ${new Date(publishedAt).toLocaleString('ru-RU')}` : 'не опубликовано'}
                </p>
                {publishedAt ? (
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
                  className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
                >
                  {canEdit ? 'Редактировать' : 'Просмотреть настройки'}
                </a>
                {canEdit ? <><button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => publishAppAction(app.id, app))}
                  className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-40"
                >
                  {publishedAt ? 'Опубликовать заново' : 'Опубликовать'}
                </button>
                {publishedAt ? (
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
              <AppAddress app={app} origin={origin} locked={addressLocked ?? Boolean(publishedAt)} disabled={!canEdit || pending} onSave={slug => run(() => changeAppSlugAction(app.id, slug, app.slug))} />
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
