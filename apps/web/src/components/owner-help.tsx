'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { helpForPath, ownerHelpAction, ownerHelpAppId, OWNER_HELP, OWNER_HELP_EVENT } from '@/lib/owner-help'
import { ShellIcon } from './shell/icons'
import { ownerInput, ownerPrimary, ownerSecondary } from './owner-ui'

export function OwnerKnowledgeBase({ context = '', appId, articleId, onNavigate }: { context?: string; appId?: string; articleId?: string; onNavigate?: () => void }) {
  const [query, setQuery] = useState('')
  const recommended = helpForPath(context)
  const normalized = query.trim().toLocaleLowerCase('ru-RU')
  const articles = OWNER_HELP.filter(article => !normalized || [article.title, article.summary, ...article.steps].join(' ').toLocaleLowerCase('ru-RU').includes(normalized))
    .sort((a, b) => (Number(b.id === articleId) * 2 + Number(recommended.includes(b.id))) - (Number(a.id === articleId) * 2 + Number(recommended.includes(a.id))))
  return <div><label className="block text-sm text-ink-soft">Найти ответ<input type="search" className={ownerInput} value={query} onChange={event => setQuery(event.target.value)} placeholder="Например: связь, Excel, расписание" /></label><p role="status" className="mt-3 text-xs text-ink-muted">Найдено статей: {articles.length}</p><div className="mt-5 divide-y divide-sand-200">{articles.map(article => <details key={article.id} open={article.id === articleId ? true : undefined} className="py-4"><summary className="cursor-pointer rounded text-sm font-medium leading-6 focus-visible:ring-2 focus-visible:ring-sage-400">{article.title}<span className="mt-1 block font-normal text-ink-soft">{article.summary}</span></summary><ol className="ml-5 mt-5 list-decimal space-y-4 text-sm leading-6 text-ink-soft">{article.steps.map(step => <li key={step}>{step}</li>)}</ol><Link href={ownerHelpAction(article, appId).href} onClick={onNavigate} className="mt-5 inline-block rounded text-sm font-medium text-sage-700 underline underline-offset-4">{ownerHelpAction(article, appId).label} →</Link></details>)}</div>{!articles.length ? <p className="mt-5 text-sm leading-6 text-ink-soft">Попробуйте другое слово: «таблица», «доступ» или «публикация».</p> : null}</div>
}

const TOURS = [
  { selector: '[data-guide="start-import"]', title: 'Есть своя таблица?', text: 'Этот путь загружает реальные данные из Excel или CSV. Перед сохранением вы проверите колонки и типы.' },
  { selector: '[data-guide="start-template"]', title: 'Начать с примера', text: 'Выберите задачу бизнеса. Таблицы, связи и экраны уже подготовлены; дальше добавите своё по шагам.' },
  { selector: '[data-guide="setup-task"]', title: 'Одна задача за раз', text: 'Здесь текущий шаг подготовки. Сохраните изменения перед переходом. К предыдущим шагам можно вернуться через полоску сверху.' },
  { selector: '[data-guide="table-mode"]', title: 'Два способа ввода', text: 'Таблица — для ячеек и быстрого ввода. По записям — для формы и длинных описаний. Данные общие.' },
  { selector: '[data-guide="table-data"]', title: 'Данные и новые строки', text: 'В сетке новая строка добавляется под таблицей. Двойной щелчок или Enter открывает ячейку. Изменения сохраняются после завершения ввода.' },
  { selector: '[data-guide="preview-roles"]', title: 'Посмотрите глазами пользователя', text: 'Переключайте роли и размер экрана. Для личных записей укажите почту пользователя. Это проверка интерфейса; она никому не выдаёт доступ.' },
  { selector: '[data-guide="app-sections"]', title: 'Основные разделы', text: 'Здесь разделы меню выбранной роли. Карточки и формы открываются из самого приложения, как их откроет пользователь.' },
  { selector: '[data-guide="publish-check"]', title: 'Проверка и публикация', text: 'Публикуйте после проверки данных и доступа. Пользователи получат проверенную версию экранов, а таблицы останутся общими.' },
  { selector: 'main', title: 'Помощь для вашей задачи', text: 'Откройте «Помощь»: сначала показаны статьи текущего раздела. Найдите задачу по слову — например, «импорт», «права» или «связь». В подготовке приложения, таблице и настройке доступны подсказки к конкретным элементам.' },
] as const

function visibleGuideTarget(selector: string): HTMLElement | null {
  const target = document.querySelector<HTMLElement>(selector)
  if (!target?.getClientRects().length || getComputedStyle(target).visibility !== 'visible') return null
  return target
}

export function OwnerHelp() {
  const pathname = usePathname() ?? ''
  const search = useSearchParams().toString()
  const appId = ownerHelpAppId(pathname, new URLSearchParams(search).get('app'))
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const guidePanel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [tour, setTour] = useState<(typeof TOURS[number])[]>([])
  const [index, setIndex] = useState(0)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const close = (restoreFocus = true) => { dialog.current?.close(); setOpen(false); if (restoreFocus && trigger.current?.isConnected) trigger.current.focus() }
  useEffect(() => {
    const showHelp = () => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setTour([]); setOpen(true) }
    window.addEventListener(OWNER_HELP_EVENT, showHelp)
    return () => window.removeEventListener(OWNER_HELP_EVENT, showHelp)
  }, [])
  useEffect(() => { if (open) dialog.current?.showModal() }, [open])
  useEffect(() => { close(false); setTour([]) }, [pathname, search])
  useEffect(() => {
    const current = tour[index]
    if (!current) return
    const target = visibleGuideTarget(current.selector)
    if (!target) { setTour([]); return }
    target.classList.add('owner-guide-target')
    target.scrollIntoView({ block: 'center', behavior: 'instant' })
    const panelTop = guidePanel.current?.getBoundingClientRect().top ?? window.innerHeight
    const bottom = target.getBoundingClientRect().bottom
    if (bottom > panelTop - 24) window.scrollBy({ top: bottom - panelTop + 32, behavior: 'instant' })
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setTour([]) }
    window.addEventListener('keydown', escape)
    return () => { target.classList.remove('owner-guide-target'); window.removeEventListener('keydown', escape) }
  }, [tour, index])
  const start = () => {
    const matched = TOURS.filter(step => step.selector !== 'main' && visibleGuideTarget(step.selector))
    const available = matched.length ? matched : [TOURS[TOURS.length - 1]!]
    close(); setIndex(0); setTour(available)
  }
  return <>
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === dialog.current) close() }} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(46rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-sand-200 bg-white p-0 text-ink shadow-lift backdrop:bg-ink/30" aria-labelledby="owner-help-title">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-sand-200 bg-white px-5 py-4"><h2 id="owner-help-title" className="text-lg font-semibold">Помощь в TableApp</h2><button type="button" onClick={() => close()} aria-label="Закрыть помощь" className="flex size-11 items-center justify-center rounded-lg hover:bg-sand-100 focus-visible:ring-2 focus-visible:ring-sage-400"><ShellIcon name="close" /></button></div>
      <div className="p-5 sm:p-7"><p className="mb-5 text-sm leading-6 text-ink-soft">Сначала показаны статьи для текущего раздела. Гайд необязательный: его можно закрыть и запустить снова.</p><div className="mb-6 flex flex-wrap gap-3"><button type="button" onClick={start} className={ownerSecondary}>Объяснить текущий экран</button><Link href="/help" onClick={() => close()} className={ownerSecondary}>Вся база знаний</Link></div><OwnerKnowledgeBase appId={appId} context={pathname} onNavigate={close} /></div>
    </dialog>
    {mounted && tour[index] ? createPortal(<div ref={guidePanel} role="region" aria-label="Подсказка по экрану" className="fixed bottom-4 right-4 z-50 w-[calc(100%_-_2rem)] max-w-[25rem] rounded-2xl border border-sage-300 bg-white p-5 shadow-lift"><div className="flex items-center justify-between gap-3"><p className="text-xs text-ink-muted">Подсказка {index + 1} из {tour.length}</p><button type="button" onClick={() => setTour([])} aria-label="Закрыть гайд" className="flex size-9 items-center justify-center rounded-lg hover:bg-sand-100"><ShellIcon name="close" /></button></div><h2 className="mt-1 font-semibold">{tour[index]!.title}</h2><p className="mt-3 text-sm leading-6 text-ink-soft">{tour[index]!.text}</p><div className="mt-5 flex flex-wrap gap-2">{index ? <button type="button" className={ownerSecondary} onClick={() => setIndex(index - 1)}>Назад</button> : null}<button type="button" className={ownerPrimary} onClick={() => index + 1 < tour.length ? setIndex(index + 1) : setTour([])}>{index + 1 < tour.length ? 'Дальше' : 'Понятно'}</button><button type="button" className={ownerSecondary} onClick={() => setTour([])}>Пропустить</button></div></div>, document.body) : null}
  </>
}
