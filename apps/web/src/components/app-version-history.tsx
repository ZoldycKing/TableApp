'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MODULE_DEFINITIONS } from '@tableapp/schema'
import { listAppVersionsAction, previewAppRestoreAction, restoreAppVersionAction } from '@/app/app-version-actions'
import { hasUnsaved } from '@/lib/unsaved'

const labels: Record<string, string> = { baseline: 'Исходные настройки', published: 'Публикация', 'before-change': 'Перед изменением', module: 'Подключение возможности', access: 'Разделение рабочих прав', intake: 'Приём новых оформлений', restored: 'Восстановление в черновик' }
type Page = Extract<Awaited<ReturnType<typeof listAppVersionsAction>>, { ok: true }>
type Preview = Extract<Awaited<ReturnType<typeof previewAppRestoreAction>>, { ok: true }>
const button = 'rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm disabled:opacity-50 hover:bg-sand-50'

export function AppVersionHistory({ appId, canRestore, revision }: { appId: string; canRestore: boolean; revision: string }) {
  const router = useRouter(), [pending, start] = useTransition()
  const [open, setOpen] = useState(false), [page, setPage] = useState<Page | null>(null)
  const [preview, setPreview] = useState<(Preview & { id: string }) | null>(null), [message, setMessage] = useState<string | null>(null)
  const load = useCallback((before?: number) => start(async () => {
    try {
      const result = await listAppVersionsAction(appId, before)
      if (result.ok) setPage(previous => ({ ...result, versions: before && previous ? [...previous.versions, ...result.versions] : result.versions }))
      else setMessage(result.error)
    } catch { setMessage('Не удалось загрузить историю. Проверьте соединение и попробуйте ещё раз.') }
  }), [appId])
  useEffect(() => { if (open) { setPreview(null); load() } }, [revision, open, load])
  const saved = () => {
    if (!hasUnsaved()) return true
    setMessage('Дождитесь сохранения изменений конструктора. Если сохранение завершилось ошибкой, сначала исправьте её.')
    return false
  }
  return <section className="mb-5 rounded-xl border border-sand-200 p-4">
    <button aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(!open)}>
      <span className="text-base font-semibold">История настроек</span><span className="text-sm text-ink-muted">{open ? 'Свернуть' : 'Открыть'}</span>
    </button>
    {open ? <div className="mt-3 space-y-3">
      <p className="text-sm text-ink-muted">Здесь сохраняются публикации и изменения возможностей приложения. Версия восстанавливается в черновик; записи клиентов, текущие приглашения и назначения сотрудников, ссылка сохраняются. Клиенты увидят изменения после публикации.</p>
      <button className={button} disabled={pending} onClick={() => { setMessage(null); setPreview(null); load() }}>Обновить историю</button>
      {page?.versions.length === 0 ? <p className="text-sm">Версий пока нет. Первая появится после публикации или изменения возможностей приложения.</p> : null}
      <ol className="divide-y divide-sand-200">{page?.versions.map(version => <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div><p className="text-sm font-medium">Версия {version.number} · {labels[version.kind] ?? 'Настройки приложения'}</p><p className="text-xs text-ink-muted">{new Date(version.createdAt).toLocaleString('ru-RU')}</p></div>
        {canRestore ? <button className={button} disabled={pending} onClick={() => start(async () => {
          if (!saved()) return
          try {
            setPreview(null); const result = await previewAppRestoreAction(appId, version.id)
            if (result.ok) { setPreview({ ...result, id: version.id }); setMessage(null) } else setMessage(result.error)
          } catch { setMessage('Не удалось проверить версию. Проверьте соединение и попробуйте ещё раз.') }
        })}>Посмотреть изменения</button> : null}
      </li>)}</ol>
      {page?.hasMore ? <button className={button} disabled={pending} onClick={() => load(page.versions.at(-1)?.number)}>Показать более ранние версии</button> : null}
      {preview ? <div className="space-y-2 rounded-lg bg-sand-50 p-3 text-sm">
        <p className="font-medium">Восстановление версии {preview.version}</p>
        <p>Название: {preview.name}. Экранов: {preview.screenCount}.</p>
        <details><summary className="cursor-pointer text-ink-muted">Показать список экранов</summary><p className="mt-2">{preview.screens.join(', ')}.</p></details>
        {preview.changes.length ? <ul className="list-disc space-y-1 pl-5">{preview.changes.map(change => <li key={change}>{change}</li>)}</ul> : null}
        <p>{preview.intake.length ? `Новые оформления будут приостановлены: ${preview.intake.map(kind => MODULE_DEFINITIONS[kind].name).join(', ')}.` : 'Приём новых оформлений будет разрешён во всех подключённых клиентских разделах.'}</p>
        <p>Записи и файлы клиентов, таблицы, ссылка и текущие назначения сотрудников сохранятся. Опубликованное приложение продолжит работать с нынешними настройками.</p>
        {preview.unchanged ? <p>Эти настройки уже совпадают с черновиком.</p> : <button className={button} disabled={pending} onClick={() => start(async () => {
          if (!saved()) return
          try {
            const result = await restoreAppVersionAction(appId, preview.id, preview.expectedHash)
            if (result.ok) { setPreview(null); setMessage('Версия восстановлена в черновик. Проверьте его в конструкторе и опубликуйте изменения.'); router.refresh() }
            else { setPreview(null); setMessage(result.error) }
          } catch { setPreview(null); setMessage('Не удалось получить ответ сервера. Обновите историю и проверьте черновик перед повторной попыткой.') }
        })}>Восстановить в черновик</button>}
      </div> : null}
      {pending ? <p role="status" className="text-sm text-ink-muted">Загрузка…</p> : null}
      {message ? <p role="status" className="text-sm text-ink-soft">{message}</p> : null}
    </div> : null}
  </section>
}
