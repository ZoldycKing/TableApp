'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { applyTemplateAction } from '@/app/template-actions'
import { templateCardCopy } from '@/lib/templates/card-copy'
import { STARTER_GROUPS } from '@/lib/templates/starter-groups'
import type { TemplateDef } from '@/lib/templates/types'
import { TemplateIcon } from './template-icon'
import { ownerInput, ownerPrimary } from './owner-ui'
import { ShellIcon } from './shell/icons'

/**
 * Витрина шаблонов.
 *
 * Назначение и конкретные возможности помогают выбрать задачу.
 * Инструкции появляются в настройке после выбора; технический состав
 * не мешает знакомству с продуктом.
 */

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
  const [selection, setSelection] = useState<Record<string, string>>(() => Object.fromEntries(
    STARTER_GROUPS.map(group => [group.id, group.templateIds.find(id => id === chosen) ?? group.templateIds[0]])))
  const [busy, setBusy] = useState<string | null>(null)
  // Состояние приходит следующим кадром, а второй щелчок — раньше: без этой
  // защёлки двойное нажатие разворачивает шаблон дважды.
  const running = useRef(false)
  const [error, setError] = useState<{ templateId: string; message: string } | null>(null)
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
          setError({ templateId, message: result.error })
          setBusy(null)
          running.current = false
          return
        }
        router.push(`/setup?app=${encodeURIComponent(result.appId)}&step=business`)
      } catch {
        setError({ templateId, message: 'Не удалось подготовить шаблон. Проверьте соединение и попробуйте ещё раз.' })
        setBusy(null)
        running.current = false
      }
    })
  }

  const group = STARTER_GROUPS.find(group => group.id === groupId)!
  const visible = templates.filter(template => group.templateIds.some(id => id === template.id))
  const selected = visible.find(template => template.id === selection[groupId]) ?? visible[0]
  const copy = selected ? templateCardCopy(selected) : null
  const select = (id: string) => setSelection(previous => ({ ...previous, [groupId]: id }))

  return (
    <div className="@container" aria-busy={busy !== null}>
      {compatibilityTemplate ? <p className="rounded-xl border border-sand-200 bg-sand-50 px-5 py-4 text-sm text-ink-soft">
        Вы открыли прежний набор «Клиентский портал». Он сохранён для совместимости. В новых клиентских наборах кабинет уже включён — отдельно устанавливать его не нужно.
      </p> : null}
      {compatibilityTemplate ? (
        <div className="my-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sage-300 bg-sage-50 px-5 py-4">
          <p className="text-sm text-ink">Ваш выбор — <span className="font-semibold">«{compatibilityTemplate.name}»</span>.</p>
          <button
            type="button"
            onClick={() => take(compatibilityTemplate.id)}
            disabled={busy !== null}
            className={ownerPrimary}
          >
            {busy === compatibilityTemplate.id ? 'Подготавливаем…' : `Продолжить с шаблоном «${compatibilityTemplate.name}»`}
          </button>
        </div>
      ) : null}

      {error && error.templateId !== selected?.id ? (
        <p role="alert" className="my-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-x-6 border-b border-sand-200" role="group" aria-label="Кому нужно приложение">
        {STARTER_GROUPS.map(item => <button key={item.id} type="button" aria-pressed={groupId === item.id}
          disabled={busy !== null}
          onClick={() => setGroupId(item.id)}
          className={`-mb-px min-h-11 border-b-2 px-1 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${groupId === item.id ? 'border-sage-600 text-sage-800' : 'border-transparent text-ink-soft hover:text-ink'}`}>
          {item.id === 'client-apps' ? 'Для клиентов' : 'Для команды'}
        </button>)}
      </div>
      {selected && copy ? <div className="grid min-w-0 overflow-hidden rounded-2xl border border-sand-200 bg-white @min-[800px]:grid-cols-[264px_minmax(0,1fr)]">
        <nav aria-label="Выбор шаблона" className="hidden border-r border-sand-200 bg-sand-50 p-3 @min-[800px]:block">
          <div className="space-y-1">
            {visible.map(template => <button key={template.id} type="button" disabled={busy !== null}
              aria-label={`Посмотреть шаблон «${template.name}»`} aria-pressed={selected.id === template.id} aria-controls="template-detail"
              onClick={() => select(template.id)}
              className={`flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 disabled:cursor-not-allowed disabled:opacity-40 ${selected.id === template.id ? 'bg-sage-100 font-medium text-sage-900' : 'text-ink-soft hover:bg-sand-100 hover:text-ink'}`}>
              <TemplateIcon id={template.id} className="size-9" />
              <span className="min-w-0 flex-1">{template.name}</span>
              {selected.id === template.id ? <ShellIcon name="chevron" className="size-4 shrink-0 -rotate-90 text-sage-700" /> : null}
            </button>)}
          </div>
        </nav>
        <div className="min-w-0 @min-[800px]:col-start-2">
          <div className="border-b border-sand-200 bg-sand-50 px-5 py-4 @min-[800px]:hidden">
            <label htmlFor="template-choice" className="block text-xs font-medium text-ink-soft">Выберите задачу</label>
            <select id="template-choice" value={selected.id} disabled={busy !== null} onChange={event => select(event.target.value)} className={`${ownerInput} text-base!`}>
              {visible.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </div>
          <article id="template-detail" aria-labelledby={`template-title-${selected.id}`} className="p-5 @min-[800px]:p-8">
            <header className="flex items-center gap-4">
              <TemplateIcon id={selected.id} className="size-14" />
              <h2 id={`template-title-${selected.id}`} className="min-w-0 break-words text-2xl font-semibold tracking-tight text-ink">{selected.name}</h2>
            </header>
            <p className="mt-5 max-w-xl text-base leading-7 text-ink-soft">{copy.description}</p>
            <dl className="my-7 space-y-5">
              {copy.features.map(feature => <div key={feature.name || feature.description}>
                {feature.name ? <dt className="text-sm font-medium text-ink">{feature.name}</dt> : null}
                <dd className="mt-1 text-sm leading-6 text-ink-soft">{feature.description.charAt(0).toUpperCase() + feature.description.slice(1)}</dd>
              </div>)}
            </dl>
            {copy.note ? <p className="mb-6 max-w-xl text-xs leading-5 text-ink-soft">{copy.note}</p> : null}
            <footer className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-sand-200 pt-5">
              <button type="button" onClick={() => take(selected.id)} disabled={busy !== null}
                aria-label={busy === selected.id ? `Подготавливаем шаблон «${selected.name}»` : `Начать настройку «${selected.name}»`} className={`${ownerPrimary} w-full @min-[800px]:w-auto`}>
                {busy === selected.id ? 'Подготавливаем…' : 'Начать настройку'}
                {busy === null ? <ShellIcon name="chevron" className="size-4 -rotate-90" /> : null}
              </button>
              <p className="text-xs leading-5 text-ink-soft">Создадим черновик с примерами.</p>
            </footer>
            {error?.templateId === selected.id ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">{error.message}</p> : null}
          </article>
        </div>
      </div> : <p className="py-10 text-sm text-ink-soft">В этой группе пока нет шаблонов. Выберите другую группу.</p>}
    </div>
  )
}
