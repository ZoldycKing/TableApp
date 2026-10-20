'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { applyTemplateAction } from '@/app/template-actions'
import { templateCardCopy } from '@/lib/templates/card-copy'
import { STARTER_GROUPS } from '@/lib/templates/starter-groups'
import type { TemplateDef } from '@/lib/templates/types'
import { TemplateIcon } from './template-icon'
import { ownerPrimary } from './owner-ui'

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

  const picked = compatibilityTemplate ?? templates.find((template) => template.id === chosen)
  const group = STARTER_GROUPS.find(group => group.id === groupId)!
  const visible = templates.filter(template => group.templateIds.some(id => id === template.id))

  return (
    <div className="@container space-y-5" aria-busy={busy !== null}>
      {compatibilityTemplate ? <p className="rounded-xl border border-sand-200 bg-sand-50 px-5 py-4 text-sm text-ink-soft">
        Вы открыли прежний набор «Клиентский портал». Он сохранён для совместимости. В новых клиентских наборах кабинет уже включён — отдельно устанавливать его не нужно.
      </p> : null}
      {picked ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sage-300 bg-sage-50 px-5 py-4">
          <p className="text-sm text-ink">Ваш выбор — <span className="font-semibold">«{picked.name}»</span>.</p>
          <button
            type="button"
            onClick={() => take(picked.id)}
            disabled={busy !== null}
            className={ownerPrimary}
          >
            {busy === picked.id ? 'Подготавливаем…' : `Продолжить с «${picked.name}»`}
          </button>
        </div>
      ) : null}

      {error && !visible.some(template => template.id === error.templateId) ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</p>
      ) : null}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Кому нужно приложение">
        {STARTER_GROUPS.map(item => <button key={item.id} type="button" aria-pressed={groupId === item.id}
          disabled={busy !== null}
          onClick={() => setGroupId(item.id)}
          className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${groupId === item.id ? 'border-ink bg-ink text-sand-50' : 'border-sand-200 bg-white text-ink-soft hover:border-sage-300'}`}>
          {item.id === 'client-apps' ? 'Для клиентов' : 'Для команды'}
        </button>)}
      </div>
      <p className="max-w-3xl text-sm leading-6 text-ink-soft">{groupId === 'client-apps'
        ? 'С каталогом, оформлением и личным кабинетом клиента.'
        : 'Для учёта внутри команды. Без клиентского каталога.'}</p>

      <div className="grid items-start gap-5 @min-[780px]:grid-cols-2">
        {visible.map((template) => {
          const copy = templateCardCopy(template)
          return (
            <article
              key={template.id}
              id={`template-${template.id}`}
              aria-labelledby={`template-title-${template.id}`}
              className={`flex h-full min-w-0 flex-col rounded-2xl border bg-white p-5 sm:p-6 ${
                template.id === chosen ? 'border-sage-400 ring-2 ring-sage-200' : 'border-sand-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <TemplateIcon id={template.id} className="size-12" />
                <h2 id={`template-title-${template.id}`} className="min-w-0 text-lg font-semibold tracking-tight text-ink">{template.name}</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-ink-soft">{copy.description}</p>
              <ul className="my-5 space-y-2.5 text-sm leading-6 text-ink-soft">
                {copy.features.map(feature => <li key={feature.name || feature.description}>
                  {feature.name ? <><span className="font-medium text-ink">{feature.name}</span> — </> : null}{feature.description}
                </li>)}
              </ul>
              <div className="mt-auto border-t border-sand-200 pt-4">
                {copy.note ? <p className="mb-4 text-xs leading-5 text-ink-soft">{copy.note}</p> : null}
                {error?.templateId === template.id ? <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">{error.message}</p> : null}
                <button type="button" onClick={() => take(template.id)} disabled={busy !== null}
                  aria-label={`Использовать шаблон «${template.name}»`} className={ownerPrimary}>
                  {busy === template.id ? 'Подготавливаем…' : 'Использовать шаблон'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <p className="text-xs leading-5 text-ink-soft">Создадим черновик с примерами в этом пространстве. Затем вы добавите свои данные и опубликуете приложение.</p>
    </div>
  )
}
