'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { applyTemplateAction } from '@/app/template-actions'
import { STARTER_GROUPS } from '@/lib/templates/starter-groups'
import type { TemplateDef } from '@/lib/templates/types'
import { TemplateIcon } from './template-icon'

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
  compatibilityTemplate,
}: {
  templates: TemplateDef[]
  /**
   * Шаблон, который человек выбрал до входа.
   *
   * Он пришёл со страницы шаблона, нажал «Начать», вошёл — и должен увидеть
   * свой выбор, а не искать его снова в каталоге.
   */
  chosen?: string | null
  compatibilityTemplate?: TemplateDef | null
}) {
  const [groupId, setGroupId] = useState<string>(() => STARTER_GROUPS.find(group =>
    group.templateIds.some(id => id === chosen))?.id ?? 'client-apps')
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
      try {
        const result = await applyTemplateAction(templateId)
        if (!result.ok) {
          setError(result.error)
          setBusy(null)
          running.current = false
          return
        }
        router.push(`/setup?app=${encodeURIComponent(result.appId)}&step=business`)
      } catch {
        setError('Не удалось создать сценарий. Проверьте соединение и повторите попытку.')
        setBusy(null)
        running.current = false
      }
    })
  }

  const picked = compatibilityTemplate ?? templates.find((template) => template.id === chosen)
  const group = STARTER_GROUPS.find(group => group.id === groupId)!
  const visible = templates.filter(template => group.templateIds.some(id => id === template.id))

  return (
    <div className="space-y-6">
      {compatibilityTemplate ? <p className="rounded-xl border border-sand-200 bg-sand-50 px-5 py-4 text-sm text-ink-soft">
        Вы открыли прежний набор «Клиентский портал». Он сохранён для совместимости. В новых клиентских наборах кабинет уже включён — отдельно устанавливать его не нужно.
      </p> : null}
      {picked ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sage-300 bg-sage-50 px-5 py-4">
          <p className="text-sm text-ink">
            Вы выбрали набор <span className="font-semibold">«{picked.name}»</span>. Поставить его
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
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2" aria-label="Назначение приложения">
        {STARTER_GROUPS.map(item => <button key={item.id} type="button" aria-pressed={groupId === item.id}
          onClick={() => setGroupId(item.id)}
          className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${groupId === item.id ? 'border-ink bg-ink text-sand-50' : 'border-sand-200 bg-white text-ink-soft hover:border-sage-300'}`}>
          {item.name}
        </button>)}
      </div>
      <div>
        <h2 className="text-lg font-semibold text-ink">{group.name}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">{group.description}</p>
        {groupId === 'client-apps' ? <p className="mt-2 text-sm text-ink-muted">Каталог доступен без входа. При оформлении клиент подтверждает почту; затем видит свои обращения и историю. Оплату согласует бизнес.</p> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {visible.map((template) => {
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
                <TemplateIcon id={template.id} />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-ink">{template.name}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{template.tagline}</p>
                </div>
              </div>

              <p className="mt-4 text-xs text-ink-muted">{template.audience}</p>

              <ul className="mt-4 space-y-1.5 text-sm text-ink-soft">
                {template.gives.slice(0, 2).map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-sage-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <details className="mt-5 rounded-xl bg-sand-50 p-4 text-sm text-ink-soft">
                <summary className="cursor-pointer font-medium text-ink">Что входит и как начать</summary>
                <div className="mt-3 space-y-2">
                <p>После выбора: название бизнеса → свои данные → условия работы → проверка и публикация. Полный конструктор открывается отдельно.</p>
                {template.gives.slice(2).map(line => <p key={line}>{line}</p>)}
                {template.tables.map((table) => (
                  <p key={table.key}>
                    Таблица «{table.name}» — {plural(table.fields.length, 'колонка', 'колонки', 'колонок')}.
                    Представления: {table.views.map((view) => view.name.toLowerCase()).join(', ')}
                  </p>
                ))}
                <p>
                  Черновик приложения «{template.appName}» и {plural(rowCount, 'учебная запись', 'учебные записи', 'учебных записей')}. Неизменённые примеры можно удалить отдельно в каждой таблице.
                </p>
                <p>Всё создаётся в этом бизнесе. Приложение останется черновиком до публикации.</p>
                {template.limits?.map(line => <p key={line}>{line}</p>)}
                {!template.customer && template.id !== 'salon' && !template.portal && !template.inventory && !template.production && template.id !== 'zayavki' ? <p>Роли пока видят одинаковые экраны и записи. Ограничение по сотруднику или клиенту нужно настроить.</p> : null}
                </div>
              </details>

              <button
                type="button"
                onClick={() => take(template.id)}
                disabled={busy !== null}
                className="mt-5 self-start rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-sand-50 transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy === template.id ? 'Создаём…' : 'Выбрать сценарий'}
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
