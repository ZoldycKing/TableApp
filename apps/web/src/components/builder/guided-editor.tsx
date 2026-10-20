'use client'

import Link from 'next/link'
import type { App, Field, Screen } from '@tableapp/schema'
import { COLORS } from '@tableapp/schema'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { TableSummary } from '@/lib/queries'
import { AppAccessSettings } from '@/components/app-access-settings'
import { ownerInput, ownerPrimary, ownerSecondary, OwnerField } from '@/components/owner-ui'

type Props = {
  app: App; screens: Screen[]; screen: Screen | undefined; fields: Field[]; tables: TableSummary[]
  preview: ReactNode; roleControls: ReactNode; deviceControls: ReactNode
  canEdit: boolean; publishing: boolean; pending: boolean; status: string; error: boolean; published: boolean
  onScreen: (id: string) => void; onUpdate: (app: App) => void; onSave: () => void; onPublish: () => void
}

/** The common route exposes one task at a time. The full builder remains a separate route. */
export function GuidedEditor(props: Props) {
  const { app, screens, screen, fields, tables, canEdit, publishing, pending, onUpdate } = props
  const [tab, setTab] = useState<'content' | 'appearance' | 'access'>('content')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [checked, setChecked] = useState(false)
  const inspector = useRef<HTMLElement>(null)
  useEffect(() => {
    if (tab === 'content' || !window.matchMedia?.('(max-width: 1279px)').matches) return
    inspector.current?.focus({ preventScroll: true })
    inspector.current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
  }, [tab])
  useEffect(() => {
    if (!confirmPublish) return
    const check = document.getElementById('publish-check')?.closest('section')
    check?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    check?.focus({ preventScroll: true })
  }, [confirmPublish])
  const tabs = screens.filter(item => item.tab)
  const navigable = tabs.length ? tabs : screens.slice(0, 1)
  const replace = (next: Screen) => onUpdate({ ...app, screens: app.screens.map(item => item.id === next.id ? next : item) })
  const list = screen?.type === 'list' || screen?.type === 'tiles' ? screen : null
  const fieldSelect = (key: 'titleFieldId' | 'subtitleFieldId' | 'metaFieldId' | 'imageFieldId', label: string) => list ? <OwnerField label={label}><select className={ownerInput} value={list[key] ?? ''} onChange={event => replace({ ...list, [key]: event.target.value || null })}><option value="">Не показывать</option>{fields.filter(field => key !== 'imageFieldId' || field.type === 'image' || field.type === 'attachment').map(field => <option value={field.id} key={field.id}>{field.name}</option>)}</select></OwnerField> : null
  return <div className="min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200 pb-3 xl:gap-4 xl:pb-5">
      <select aria-label="Раздел настройки" value={tab} onChange={event => setTab(event.target.value as typeof tab)} className={`${ownerInput} !w-auto max-w-full xl:hidden`}><option value="content">Содержимое</option><option value="appearance">Внешний вид</option><option value="access">Доступ</option></select>
      <div aria-label="Раздел настройки" className="hidden flex-wrap gap-1 xl:flex">{([['content', 'Содержимое'], ['appearance', 'Внешний вид'], ['access', 'Доступ']] as const).map(([id, name]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)} className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-sage-400 ${tab === id ? 'bg-sand-100 text-ink' : 'text-ink-soft hover:bg-sand-100'}`}>{name}</button>)}</div>
      <button type="button" aria-label={publishing ? 'Публикуем…' : 'Проверить и опубликовать'} className={ownerPrimary} disabled={!canEdit || pending || publishing} onClick={() => setConfirmPublish(true)}>{publishing ? 'Публикуем…' : <><span className="xl:hidden">Публикация</span><span className="hidden xl:inline">Проверить и опубликовать</span></>} <span aria-hidden>→</span></button>
    </div>
    <div data-guide="preview-roles" className={`${tab === 'content' ? 'flex' : 'hidden xl:flex'} my-3 flex-wrap items-start justify-between gap-2 xl:my-5 xl:gap-4`}><div className="min-w-0 flex-1">{props.roleControls}</div><div>{props.deviceControls}</div></div>
    <div className="grid min-w-0 items-start gap-3 xl:gap-6 xl:grid-cols-[180px_minmax(0,1fr)_270px]">
      <nav data-guide="app-sections" aria-label="Разделы предпросмотра" className={`${tab === 'content' ? 'flex' : 'hidden'} min-w-0 flex-wrap gap-2 xl:block xl:space-y-1`}><p className="mb-3 hidden w-full text-xs text-ink-muted xl:block">Основные разделы</p>{navigable.map(item => <button type="button" key={item.id} aria-pressed={item.id === screen?.id} onClick={() => props.onScreen(item.id)} className={`min-h-11 max-w-full rounded-lg px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-sage-400 xl:w-full ${item.id === screen?.id ? 'bg-sage-100 font-medium text-sage-700' : 'text-ink-soft hover:bg-sand-100'}`}><span className="break-words">{item.tab?.label ?? item.name}</span></button>)}{!navigable.length ? <p className="text-sm leading-6 text-ink-soft">Для этой роли нет основных разделов. Проверьте доступ.</p> : null}</nav>
      <div className={`${tab === 'content' ? 'block' : 'hidden'} min-w-0 rounded-2xl bg-sand-100/70 p-3 sm:p-5 xl:block`} data-guide="app-preview">{props.preview}<p className="mt-4 text-xs leading-5 text-ink-soft">Предпросмотр черновика. Действия оформления здесь не создают реальные заказы и записи.</p></div>
      <aside ref={inspector} tabIndex={-1} className={`min-w-0 space-y-5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-4 ${tab !== 'content' ? 'mt-5 xl:mt-0' : ''}`} aria-label="Параметры выбранного раздела">
        {!confirmPublish && props.status ? <p role={props.error ? 'alert' : 'status'} className={`break-words text-sm leading-6 ${props.error ? 'text-red-700' : 'text-ink-soft'}`}>{props.status}</p> : null}
        <fieldset disabled={!canEdit || publishing} className="min-w-0 space-y-5">
          {tab === 'content' ? <>
            <h2 className="font-semibold">{screen?.name ?? 'Выберите раздел'}</h2>
            {screen ? <OwnerField label="Название экрана"><input maxLength={200} className={ownerInput} value={screen.name} onChange={event => replace({ ...screen, name: event.target.value })} /></OwnerField> : null}
            {screen?.tab ? <OwnerField label="Название в меню"><input className={ownerInput} value={screen.tab.label} onChange={event => replace({ ...screen, tab: { ...screen.tab!, label: event.target.value } })} /></OwnerField> : null}
            {list ? <>{fieldSelect('titleFieldId', 'Заголовок записи')}{fieldSelect('subtitleFieldId', 'Подпись')}{fieldSelect('metaFieldId', 'Цена или значение')}{fieldSelect('imageFieldId', 'Изображение')}</> : <p className="text-sm leading-6 text-ink-soft">Это экран действия или карточки. Поля и кнопки можно изменить в полном конструкторе.</p>}
            <p className="text-xs leading-5 text-ink-muted">Название экрана не переименовывает таблицу и её поля.</p>
          </> : null}
          {tab === 'appearance' ? <>
            <h2 className="font-semibold">Оформление приложения</h2>
            <OwnerField label="Название приложения"><input className={ownerInput} maxLength={200} value={app.name} onChange={event => onUpdate({ ...app, name: event.target.value })} /></OwnerField>
            <OwnerField label="Акцентный цвет"><select className={ownerInput} value={app.theme.accent} onChange={event => onUpdate({ ...app, theme: { ...app.theme, accent: event.target.value as App['theme']['accent'] } })}>{COLORS.map(color => <option key={color} value={color}>{({ gray: 'Серый', red: 'Красный', orange: 'Оранжевый', yellow: 'Жёлтый', amber: 'Янтарный', lime: 'Лаймовый', cyan: 'Голубой', indigo: 'Индиго', violet: 'Сиреневый', rose: 'Пыльная роза', green: 'Зелёный', teal: 'Бирюзовый', blue: 'Синий', purple: 'Фиолетовый', pink: 'Розовый' } as Record<string, string>)[color] ?? color}</option>)}</select></OwnerField>
            <p className="text-sm leading-6 text-ink-soft">Данные бизнеса меняются отдельно. Их увидят пользователи всех приложений этого бизнеса.</p><Link href={`/setup?app=${app.id}&step=business`} className="inline-block text-sm underline underline-offset-4">Данные бизнеса →</Link>
          </> : null}
          {tab === 'access' ? <><h2 className="font-semibold">Что видит каждая роль</h2><p className="text-sm leading-6 text-ink-soft"><span className="xl:hidden">Проверьте результат в разделе «Содержимое», выбрав роль.</span><span className="hidden xl:inline">Проверяйте результат переключателем над предпросмотром.</span> Для личных записей укажите почту пользователя.</p><ul className="space-y-4">{app.roles.map(role => <li key={role.id}><p className="text-sm font-medium">{role.name}</p><p className="mt-1 text-xs leading-5 text-ink-soft">{app.screens.filter(item => item.access.roles.includes(role.id) && item.tab).map(item => item.tab!.label).join(', ') || 'Основные разделы не открыты'}</p></li>)}</ul><p className="text-xs leading-5 text-ink-muted">Права к таблицам в кабинете настраиваются в разделе «Команда». Они не выдаются автоматически вместе с ролью приложения.</p></> : null}
          <button type="button" onClick={props.onSave} disabled={pending} className={ownerSecondary}>{pending ? 'Сохраняем…' : 'Сохранить черновик'}</button>
        </fieldset>
        <p className="text-xs leading-5 text-ink-muted">{props.published ? 'Пользователи видят опубликованную версию. Изменения экранов появятся после новой публикации.' : 'Приложение ещё не опубликовано. Рабочая ссылка пока недоступна.'}</p>
      </aside>
    </div>
    {tab === 'access' ? <details className="mt-7 rounded-xl border border-sand-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium">Изменить адреса сотрудников, роли и ограничения</summary><fieldset disabled={!canEdit || publishing} className="mt-4 min-w-0"><AppAccessSettings app={app} tables={tables} onChange={onUpdate} /></fieldset></details> : null}
    {confirmPublish ? <section tabIndex={-1} aria-labelledby="publish-check" className="mt-7 space-y-4 rounded-2xl border border-sage-200 bg-sage-50 p-5 sm:p-6" data-guide="publish-check"><h2 id="publish-check" className="text-lg font-semibold">Проверка перед публикацией</h2>{props.status ? <p role={props.error ? 'alert' : 'status'} className={`text-sm leading-6 ${props.error ? 'text-red-700' : 'text-ink-soft'}`}>{props.status}</p> : null}<p className="max-w-2xl text-sm leading-6 text-ink-soft">Убедитесь, что заменили учебные данные, проверили экраны каждой роли и указали почты сотрудников. Данные таблиц общие с рабочим приложением; публикация сохраняет новую версию его экранов и прав.</p><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-1 size-4 shrink-0" />Я проверил данные и доступ пользователей</label><div className="flex flex-wrap gap-3"><button type="button" className={ownerPrimary} disabled={!checked || !canEdit || pending || publishing} onClick={props.onPublish}>{publishing ? 'Сохраняем и публикуем…' : props.published ? 'Опубликовать изменения' : 'Опубликовать приложение'}</button><button type="button" disabled={publishing} className={ownerSecondary} onClick={() => setConfirmPublish(false)}>Вернуться к проверке</button>{props.published ? <Link href={`/a/${app.slug}`} className={ownerSecondary}>Открыть рабочее приложение ↗</Link> : null}</div></section> : null}
    <div className="mt-8 border-t border-sand-200 pt-5"><Link href={`/apps/${app.id}?advanced=1`} className="rounded text-sm text-ink-soft underline decoration-sand-300 underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400">Полный конструктор: экраны, компоненты и дополнительные возможности →</Link></div>
  </div>
}
