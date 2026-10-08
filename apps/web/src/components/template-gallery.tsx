'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { applyTemplateAction } from '@/app/template-actions'
import type { TemplateDef } from '@/lib/templates/types'

/**
 * Витрина шаблонов.
 *
 * Главный вопрос человека здесь не «какие бывают шаблоны», а «что со мной
 * произойдёт, если я нажму». Поэтому на карточке написано ровно то, что
 * появится в его рабочем пространстве: какие таблицы, сколько колонок,
 * какие представления и что будет в приложении.
 */

function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${many}`
  if (mod10 === 1) return `${count} ${one}`
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`
  return `${count} ${many}`
}

export function TemplateGallery({
  templates,
  chosen,
}: {
  templates: TemplateDef[]
  /**
   * Шаблон, который человек выбрал до входа.
   *
   * Он пришёл со страницы шаблона, нажал «Начать», вошёл — и должен увидеть
   * свой выбор, а не искать его снова в списке из одиннадцати.
   */
  chosen?: string | null
}) {
  const [busy, setBusy] = useState<string | null>(null)
  // Состояние приходит следующим кадром, а второй щелчок — раньше: без этой
  // защёлки двойное нажатие разворачивает шаблон дважды.
  const running = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  const take = (templateId: string) => {
    if (running.current) return
    running.current = true
    setBusy(templateId)
    setError(null)
    startTransition(async () => {
      const result = await applyTemplateAction(templateId)
      if (!result.ok) {
        setError(result.error)
        setBusy(null)
        running.current = false
        return
      }
      router.push(`/t/${result.tableId}`)
    })
  }

  const picked = templates.find((template) => template.id === chosen)

  return (
    <div className="space-y-6">
      {picked ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sage-300 bg-sage-50 px-5 py-4">
          <p className="text-sm text-ink">
            <span aria-hidden className="mr-1.5">{picked.emoji}</span>
            Вы выбрали шаблон <span className="font-semibold">«{picked.name}»</span>. Поставить его
            в это пространство?
          </p>
          <button
            type="button"
            onClick={() => take(picked.id)}
            disabled={busy !== null}
            className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-sand-50 transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy === picked.id ? 'Создаём…' : `Поставить «${picked.name}»`}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {templates.map((template) => {
          const rowCount = template.tables.reduce((total, table) => total + table.rows.length, 0)
          return (
            <article
              key={template.id}
              id={`template-${template.id}`}
              className={`flex flex-col rounded-2xl border bg-white p-6 shadow-soft ${
                template.id === chosen ? 'border-sage-400 ring-2 ring-sage-200' : 'border-sand-200'
              }`}
            >
              <div className="flex items-start gap-4">
                <span aria-hidden className="text-3xl leading-none">{template.emoji}</span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-ink">{template.name}</h2>
                  <p className="mt-1 text-sm text-ink-soft">{template.tagline}</p>
                </div>
              </div>

              <p className="mt-4 text-xs text-ink-muted">{template.audience}</p>

              <ul className="mt-4 space-y-1.5 text-sm text-ink-soft">
                {template.gives.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 space-y-2 rounded-xl bg-sand-50 p-4 text-xs text-ink-soft">
                <p className="font-medium text-ink">Что появится у вас</p>
                {template.tables.map((table) => (
                  <p key={table.key}>
                    Таблица «{table.name}» — {plural(table.fields.length, 'колонка', 'колонки', 'колонок')}.
                    Представления: {table.views.map((view) => view.name.toLowerCase()).join(', ')}
                  </p>
                ))}
                <p>
                  Черновик приложения «{template.appName}» и {plural(rowCount, 'учебная запись', 'учебные записи', 'учебных записей')}. Неизменённые примеры можно удалить отдельно в каждой таблице.
                </p>
                <p>После установки откроется таблица. Затем проверьте доступ и опубликуйте черновик приложения.</p>
                {!template.portal && !template.inventory && !template.production && template.id !== 'zayavki' ? <p>Роли пока видят одинаковые экраны и записи. Ограничение по сотруднику или клиенту нужно настроить.</p> : null}
              </div>

              <button
                type="button"
                onClick={() => take(template.id)}
                disabled={busy !== null}
                className="mt-5 self-start rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-sand-50 transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy === template.id ? 'Создаём…' : 'Взять шаблон'}
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
