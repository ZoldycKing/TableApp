'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { helpForPath, ownerHelpAction, ownerHelpAppId, OWNER_HELP, OWNER_HELP_EVENT } from '@/lib/owner-help'
import { ShellIcon } from './shell/icons'
import { ownerInput, ownerPrimary, ownerSecondary } from './owner-ui'

export function OwnerHelpButton({ href, children = 'Помощь с этим шагом', className = 'mt-6 inline-block rounded text-sm text-ink-soft underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400' }: { href?: string; children?: ReactNode; className?: string }) {
  return <button type="button" className={className} onClick={() => {
    const query = new URL(href ?? '/help', 'https://tableapp.local').searchParams
    window.dispatchEvent(new CustomEvent(OWNER_HELP_EVENT, { detail: { articleId: query.get('article'), appId: query.get('app') } }))
  }}>{children}</button>
}

export function OwnerKnowledgeBase({ context = '', appId, articleId, onNavigate, compact = false }: { context?: string; appId?: string; articleId?: string; onNavigate?: () => void; compact?: boolean }) {
  const headingId = useId()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(articleId ?? helpForPath(context)[0] ?? 'start')
  const [showList, setShowList] = useState(!articleId)
  useEffect(() => { setSelectedId(articleId ?? helpForPath(context)[0] ?? 'start'); setShowList(!articleId) }, [articleId, context])
  const recommended = helpForPath(context)
  const normalized = query.trim().toLocaleLowerCase('ru-RU')
  const articles = OWNER_HELP.filter(article => !normalized || [article.title, article.summary, ...article.steps].join(' ').toLocaleLowerCase('ru-RU').includes(normalized))
    .sort((a, b) => (Number(b.id === articleId) * 2 + Number(recommended.includes(b.id))) - (Number(a.id === articleId) * 2 + Number(recommended.includes(a.id))))
  const selected = OWNER_HELP.find(article => article.id === selectedId) ?? OWNER_HELP[0]!
  return <div className={`grid min-w-0 gap-7 ${compact ? '' : 'md:grid-cols-[220px_minmax(0,1fr)]'}`}>
    <div className={`${showList ? 'block' : compact ? 'hidden' : 'hidden md:block'} min-w-0`}>
      <label className="block text-sm text-ink-soft">Найти ответ<input type="search" className={`${ownerInput} text-base!`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Таблицы, доступ, импорт…" /></label>
      <p role="status" className="sr-only">Найдено статей: {articles.length}</p>
      <nav aria-label="Инструкции" className={`mt-4 ${compact ? 'grid gap-1 sm:grid-cols-2' : 'space-y-1'}`}>{articles.map(article => <button type="button" key={article.id} aria-current={article.id === selected.id ? 'page' : undefined} onClick={() => { setSelectedId(article.id); setShowList(false) }} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm leading-5 focus-visible:ring-2 focus-visible:ring-sage-400 ${selected.id === article.id ? 'bg-sage-100 font-medium text-sage-900' : 'text-ink-soft hover:bg-sand-100'}`}><span>{article.title}</span><ShellIcon name="chevron" className={`size-4 shrink-0 -rotate-90 ${compact ? '' : 'md:hidden'}`} /></button>)}</nav>
      {!articles.length ? <p className="mt-5 text-sm leading-6 text-ink-soft">Попробуйте другое слово: «таблица», «доступ» или «публикация».</p> : null}
    </div>
    <article aria-labelledby={headingId} className={`${showList ? compact ? 'hidden' : 'hidden md:block' : 'block'} min-w-0`}>
      <button type="button" onClick={() => setShowList(true)} className={`mb-5 inline-flex min-h-11 items-center gap-2 rounded text-sm text-sage-700 focus-visible:ring-2 focus-visible:ring-sage-400 ${compact ? '' : 'md:hidden'}`}><ShellIcon name="chevron" className="size-4 rotate-90" />Все инструкции</button>
      <h3 id={headingId} className="text-xl font-semibold leading-7 tracking-tight text-ink">{selected.title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{selected.summary}</p>
      <ol className="mt-6 space-y-5">{selected.steps.map((step, index) => <li key={step} className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-sand-100 text-xs font-medium tabular-nums text-ink-soft">{index + 1}</span><p className="min-w-0 text-sm leading-6 text-ink-soft">{step}</p></li>)}</ol>
      <Link href={ownerHelpAction(selected, appId).href} onClick={onNavigate} className="mt-6 inline-flex min-h-11 items-center rounded text-sm font-medium text-sage-700 underline underline-offset-4">{ownerHelpAction(selected, appId).label}</Link>
    </article>
  </div>
}

const TOURS = [
  { selector: '[data-guide="start-import"]', title: 'Есть своя таблица?', text: 'Загрузите Excel или CSV. Перед загрузкой проверьте данные и колонки.' },
  { selector: '[data-guide="start-template"]', title: 'Готовый шаблон', text: 'Выберите подходящий шаблон. Таблицы и разделы уже готовы. Во время настройки добавите свои данные.' },
  { selector: '[data-guide="setup-task"]', title: 'Одна задача за раз', text: 'Выполните текущий шаг и сохраните изменения. К предыдущим шагам можно вернуться по названиям сверху.' },
  { selector: '[data-guide="table-mode"]', title: 'Два способа ввода', text: 'Таблица — для ячеек и быстрого ввода. По записям — для формы и длинных описаний. Данные общие.' },
  { selector: '[data-guide="table-data"]', title: 'Данные и новые строки', text: 'Откройте ячейку двойным щелчком или клавишей Enter. Новую строку заполните и сохраните кнопкой «Сохранить строку».' },
  { selector: '[data-guide="preview-roles"]', title: 'Посмотрите глазами пользователя', text: 'Переключайте роли и размер экрана. Для личных записей укажите почту пользователя. Это проверка интерфейса; она никому не выдаёт доступ.' },
  { selector: '[data-guide="app-sections"]', title: 'Основные разделы', text: 'Выберите раздел для проверки. Карточки и формы можно открывать внутри предпросмотра.' },
  { selector: '[data-guide="publish-check"]', title: 'Проверка и публикация', text: 'Публикуйте после проверки данных и доступа. Пользователи получат проверенную версию экранов, а таблицы останутся общими.' },
  { selector: 'main', title: 'Помощь для вашей задачи', text: 'В «Помощи» собраны инструкции для этого раздела. Найдите ответ по слову, например «загрузка», «доступ» или «связь».' },
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
  const [request, setRequest] = useState<{ articleId?: string; appId?: string }>({})
  const [tour, setTour] = useState<(typeof TOURS[number])[]>([])
  const [index, setIndex] = useState(0)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const close = (restoreFocus = true) => { dialog.current?.close(); setOpen(false); if (restoreFocus && trigger.current?.isConnected) trigger.current.focus() }
  useEffect(() => {
    const showHelp = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null
      setRequest({ articleId: typeof detail?.articleId === 'string' ? detail.articleId : undefined, appId: typeof detail?.appId === 'string' ? detail.appId : undefined })
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setTour([]); setOpen(true)
    }
    window.addEventListener(OWNER_HELP_EVENT, showHelp)
    return () => window.removeEventListener(OWNER_HELP_EVENT, showHelp)
  }, [])
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.showModal()
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])
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
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === dialog.current) close() }} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-lift backdrop:bg-ink/30" aria-labelledby="owner-help-title">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-sand-200 bg-white px-5 py-4"><h2 id="owner-help-title" className="text-lg font-semibold">Помощь в TableApp</h2><button type="button" onClick={() => close()} aria-label="Закрыть помощь" className="flex size-11 items-center justify-center rounded-lg hover:bg-sand-100 focus-visible:ring-2 focus-visible:ring-sage-400"><ShellIcon name="close" /></button></div>
      <div className="p-5 sm:p-7">{open ? <OwnerKnowledgeBase compact appId={request.appId ?? appId} articleId={request.articleId} context={pathname} onNavigate={close} /> : null}<div className="mt-7 flex flex-wrap gap-5 border-t border-sand-200 pt-4"><button type="button" onClick={start} className="min-h-11 rounded text-sm text-sage-700 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400">Показать подсказки на экране</button><Link href="/help" onClick={() => close()} className="inline-flex min-h-11 items-center rounded text-sm text-ink-soft underline underline-offset-4">Открыть базу знаний отдельно</Link></div></div>
    </dialog>
    {mounted && tour[index] ? createPortal(<div ref={guidePanel} role="region" aria-label="Подсказка по экрану" className="fixed bottom-4 right-4 z-50 w-[calc(100%_-_2rem)] max-w-[25rem] rounded-2xl border border-sage-300 bg-white p-5 shadow-lift"><div className="flex items-center justify-between gap-3"><p className="text-xs text-ink-muted">Подсказка {index + 1} из {tour.length}</p><button type="button" onClick={() => setTour([])} aria-label="Закрыть гайд" className="flex size-9 items-center justify-center rounded-lg hover:bg-sand-100"><ShellIcon name="close" /></button></div><h2 className="mt-1 font-semibold">{tour[index]!.title}</h2><p className="mt-3 text-sm leading-6 text-ink-soft">{tour[index]!.text}</p><div className="mt-5 flex flex-wrap gap-2">{index ? <button type="button" className={ownerSecondary} onClick={() => setIndex(index - 1)}>Назад</button> : null}<button type="button" className={ownerPrimary} onClick={() => index + 1 < tour.length ? setIndex(index + 1) : setTour([])}>{index + 1 < tour.length ? 'Дальше' : 'Понятно'}</button><button type="button" className={ownerSecondary} onClick={() => setTour([])}>Пропустить</button></div></div>, document.body) : null}
  </>
}
