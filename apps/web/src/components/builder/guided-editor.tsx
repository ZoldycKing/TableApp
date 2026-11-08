'use client'

import Link from 'next/link'
import type { App, Field, Screen } from '@tableapp/schema'
import { COLORS } from '@tableapp/schema'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { TableSummary } from '@/lib/queries'
import { ModuleGrantEditor } from '@/components/module-grant-editor'
import { OwnerHelpButton } from '@/components/owner-help'
import { GuidedTeamAccess } from './guided-team-access'
import { PublishedAppLink } from '../published-app-link'
import { SectionDialog } from './section-dialog'
import { ownerInput, ownerPrimary, ownerSecondary, OwnerField } from '@/components/owner-ui'

type Props = {
  initialSection?: 'content' | 'access'
  previewInstruction?: string
  helpLinks?: Record<'content' | 'appearance' | 'access', string>
  app: App; screens: Screen[]; screen: Screen | undefined; fields: Field[]; tables: TableSummary[]; views: import('@tableapp/schema').View[]
  preview: ReactNode; roleControls: ReactNode; deviceControls: ReactNode
  canEdit: boolean; publishing: boolean; pending: boolean; status: string; error: boolean; published: boolean
  publicationVersion?: number
  onScreen: (id: string) => void; onUpdate: (app: App) => void; onSave: () => void; onPublish: () => void
  onSectionUpdate: (app: App, screenId: string) => void
}

/** The common route exposes one task at a time. The full builder remains a separate route. */
export function GuidedEditor(props: Props) {
  const { app, screens, screen, fields, tables, canEdit, publishing, pending, onUpdate } = props
  const [tab, setTab] = useState<'content' | 'appearance' | 'access'>(props.initialSection ?? 'content')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [checked, setChecked] = useState(false)
  const [editingScreen, setEditingScreen] = useState(false)
  const [sectionDialog, setSectionDialog] = useState<'new' | 'edit' | null>(null)
  const personal = app.purpose === 'personal'
  const inspector = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!props.publicationVersion || !props.published) return
    setConfirmPublish(false)
    const result = document.getElementById('published-link-title')?.closest('section')
    result?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    result?.focus({ preventScroll: true })
  }, [props.published, props.publicationVersion])
  useEffect(() => {
    if (tab === 'content' && !editingScreen || !window.matchMedia?.('(max-width: 1279px)').matches) return
    inspector.current?.focus({ preventScroll: true })
    inspector.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
  }, [tab, editingScreen])
  useEffect(() => {
    if (!confirmPublish) return
    const check = document.getElementById('publish-check')?.closest('section')
    check?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    check?.focus({ preventScroll: true })
  }, [confirmPublish])
  const tabs = screens.filter(item => item.tab)
  const navigable = tabs.length ? tabs : screens.slice(0, 1)
  const sectionTarget = screen?.tab ? screen : screens.find(item => item.id === screen?.sectionId) ?? navigable[0]
  const hasNavigation = navigable.length > 1
  const columns = tab === 'access' ? 'mt-6 xl:grid-cols-[minmax(0,1fr)_270px]'
    : tab === 'content' && !editingScreen ? hasNavigation ? 'xl:grid-cols-[180px_minmax(0,1fr)]' : ''
    : hasNavigation ? 'xl:grid-cols-[180px_minmax(0,1fr)_270px]' : 'xl:grid-cols-[minmax(0,1fr)_270px]'
  const replace = (next: Screen) => onUpdate({ ...app, screens: app.screens.map(item => item.id === next.id ? next : item) })
  const list = screen?.type === 'list' || screen?.type === 'tiles' ? screen : null
  const fieldSelect = (key: 'titleFieldId' | 'subtitleFieldId' | 'metaFieldId' | 'imageFieldId', label: string) => list ? <OwnerField label={label}><select className={ownerInput} value={list[key] ?? ''} onChange={event => replace({ ...list, [key]: event.target.value || null })}><option value="">Не показывать</option>{fields.filter(field => key !== 'imageFieldId' || field.type === 'image' || field.type === 'attachment').map(field => <option value={field.id} key={field.id}>{field.name}</option>)}</select></OwnerField> : null
  return <div className="min-w-0">
    {props.published ? <PublishedAppLink slug={app.slug} personal={personal} onAccess={personal ? undefined : () => setTab('access')} /> : null}
    {personal && !props.published ? <p className="mb-4 text-sm text-ink-soft">Личное приложение. Вход по вашей почте.</p> : null}
    {props.previewInstruction ? <p className="mb-5 max-w-2xl text-sm leading-6 text-ink-soft">{tab === 'access' ? 'Добавьте почту сотрудника и выберите его роль.' : tab === 'appearance' ? 'Проверьте название и оформление приложения.' : props.previewInstruction}</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200 pb-3 xl:gap-4 xl:pb-5">
      <select aria-label="Раздел настройки" value={tab} onChange={event => setTab(event.target.value as typeof tab)} className={`${ownerInput} !w-auto max-w-full xl:hidden`}><option value="content">Содержимое</option><option value="appearance">Внешний вид</option>{!personal ? <option value="access">Доступ</option> : null}</select>
      <div aria-label="Раздел настройки" className="hidden flex-wrap gap-1 xl:flex">{([['content', 'Содержимое'], ['appearance', 'Внешний вид'], ['access', 'Доступ']] as const).filter(([id]) => !personal || id !== 'access').map(([id, name]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)} className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-sage-400 ${tab === id ? 'bg-sand-100 text-ink' : 'text-ink-soft hover:bg-sand-100'}`}>{name}</button>)}</div>
      <button type="button" aria-label={publishing ? 'Публикуем…' : personal ? props.published ? 'Обновить приложение' : 'Начать пользоваться' : 'Проверить и опубликовать'} className={ownerPrimary} disabled={!canEdit || pending || publishing} onClick={() => { setChecked(false); setConfirmPublish(true) }}>{publishing ? 'Публикуем…' : personal ? props.published ? 'Обновить приложение' : 'Начать пользоваться' : <><span className="xl:hidden">Опубликовать</span><span className="hidden xl:inline">Проверить и опубликовать</span></>} <span aria-hidden>→</span></button>
    </div>
    <div data-guide="preview-roles" className={`${tab === 'content' ? 'flex' : tab === 'access' ? 'hidden' : 'hidden xl:flex'} my-3 flex-wrap items-start justify-between gap-2 xl:my-5 xl:gap-4`}><div className="min-w-0 flex-1">{personal ? null : props.roleControls}</div><div>{props.deviceControls}</div></div>
    {!confirmPublish && props.status && !(tab === 'content' && editingScreen) ? <p role={props.error ? 'alert' : 'status'} className={`mb-4 break-words text-sm leading-6 ${props.error ? 'text-red-700' : 'text-ink-soft'}`}>{props.status}</p> : null}
    {tab === 'content' && screen ? <div className="mb-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={!canEdit || publishing} onClick={() => setSectionDialog('new')} className={ownerSecondary}>Добавить раздел</button><button type="button" disabled={!canEdit || publishing} onClick={() => setSectionDialog('edit')} className={ownerSecondary}>Настроить раздел</button>{!personal ? <button type="button" aria-expanded={editingScreen} onClick={() => setEditingScreen(!editingScreen)} className={ownerSecondary}>{editingScreen ? 'Скрыть настройки' : 'Изменить экран'}</button> : null}{!editingScreen && (props.status || pending) ? <button type="button" onClick={props.onSave} disabled={!canEdit || pending || publishing} className={ownerSecondary}>{pending ? 'Сохраняем…' : 'Сохранить черновик'}</button> : null}</div> : null}
    {sectionDialog ? <SectionDialog key={sectionDialog === 'new' ? 'new' : sectionTarget?.id} app={app} screen={sectionDialog === 'edit' ? sectionTarget : undefined} tables={tables} views={props.views} onChange={props.onSectionUpdate} onClose={() => setSectionDialog(null)} /> : null}
    <div className={`grid min-w-0 items-start gap-5 xl:gap-6 ${columns}`}>
      {hasNavigation ? <nav data-guide="app-sections" aria-label="Разделы предпросмотра" className={`${tab === 'content' ? 'block' : tab === 'access' ? 'hidden' : 'hidden xl:block'} min-w-0 xl:space-y-1`}><select aria-label="Экран предпросмотра" value={screen?.id ?? ''} onChange={event => props.onScreen(event.target.value)} className={`${ownerInput} xl:hidden`}>{navigable.map(item => <option key={item.id} value={item.id}>{item.tab?.label ?? item.name}</option>)}</select><p className="mb-3 hidden w-full text-xs text-ink-muted xl:block">Основные разделы</p>{navigable.map(item => <button type="button" key={item.id} aria-pressed={item.id === screen?.id} onClick={() => props.onScreen(item.id)} className={`hidden min-h-11 w-full max-w-full rounded-lg px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-sage-400 xl:block ${item.id === screen?.id ? 'bg-sage-100 font-medium text-sage-700' : 'text-ink-soft hover:bg-sand-100'}`}><span className="break-words">{item.tab?.label ?? item.name}</span></button>)}</nav> : null}
      {tab === 'access' ? <section ref={inspector} tabIndex={-1} aria-label="Сотрудники приложения" className="scroll-mt-20 min-w-0 rounded-2xl border border-sand-200 bg-white p-5 outline-none focus-visible:ring-2 focus-visible:ring-sage-400 sm:p-6"><fieldset disabled={!canEdit || publishing} className="min-w-0">{app.moduleAccess ? <ModuleGrantEditor app={app} onChange={onUpdate} /> : <GuidedTeamAccess app={app} onChange={onUpdate} />}</fieldset></section> : <div className={`${tab === 'appearance' ? 'order-2 xl:order-none' : ''} min-w-0 rounded-2xl bg-sand-100/70 p-3 sm:p-5 xl:block`} data-guide="app-preview">{props.preview}<p className="mt-4 text-xs leading-5 text-ink-soft">Предпросмотр. Действия здесь не меняют данные в таблицах.</p></div>}
      {tab !== 'content' || editingScreen ? <aside ref={tab === 'access' ? undefined : inspector} tabIndex={-1} className={`scroll-mt-20 min-w-0 space-y-5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-4 ${tab === 'appearance' ? 'order-1 xl:order-none' : ''} ${tab !== 'content' ? 'mt-5 xl:mt-0' : ''}`} aria-label="Параметры выбранного раздела">
        <fieldset disabled={!canEdit || publishing} className="min-w-0 space-y-5">
          {tab === 'content' ? <>
            <h2 className="font-semibold">{screen?.name ?? 'Выберите раздел'}</h2>
            {screen ? <OwnerField label="Название экрана"><input maxLength={200} className={ownerInput} value={screen.name} onChange={event => replace({ ...screen, name: event.target.value })} /></OwnerField> : null}
            {screen?.tab ? <OwnerField label="Название в меню"><input className={ownerInput} value={screen.tab.label} onChange={event => replace({ ...screen, tab: { ...screen.tab!, label: event.target.value } })} /></OwnerField> : null}
            {list ? <>{fieldSelect('titleFieldId', 'Заголовок записи')}{fieldSelect('subtitleFieldId', 'Подпись')}{fieldSelect('metaFieldId', 'Дополнительное значение')}{fieldSelect('imageFieldId', 'Изображение')}</> : <p className="text-sm leading-6 text-ink-soft">Поля карточки и кнопки настраиваются в полном конструкторе.</p>}
            <p className="text-xs leading-5 text-ink-muted">Название таблицы и колонок останется прежним.</p>
          </> : null}
          {tab === 'appearance' ? <>
            <h2 className="font-semibold">Оформление приложения</h2>
            <OwnerField label="Название приложения"><input className={ownerInput} maxLength={200} value={app.name} onChange={event => onUpdate({ ...app, name: event.target.value })} /></OwnerField>
            <OwnerField label="Цвет кнопок и меню"><select className={ownerInput} value={app.theme.accent} onChange={event => onUpdate({ ...app, theme: { ...app.theme, accent: event.target.value as App['theme']['accent'] } })}>{COLORS.map(color => <option key={color} value={color}>{({ gray: 'Серый', red: 'Красный', orange: 'Оранжевый', yellow: 'Жёлтый', amber: 'Янтарный', lime: 'Лаймовый', cyan: 'Голубой', indigo: 'Индиго', violet: 'Сиреневый', rose: 'Пыльная роза', green: 'Зелёный', teal: 'Бирюзовый', blue: 'Синий', purple: 'Фиолетовый', pink: 'Розовый' } as Record<string, string>)[color] ?? color}</option>)}</select></OwnerField>
            <p className="text-sm leading-6 text-ink-soft">{personal ? 'Название видно в приложении. Цвет меняет кнопки и активные разделы меню.' : 'Название приложения видно рядом с названием компании. Цвет меняет кнопки и активные разделы меню.'}</p>
          </> : null}
          {tab === 'access' ? <><h2 className="font-semibold">Что видит каждая роль</h2><p className="text-sm leading-6 text-ink-soft"><span className="xl:hidden">Проверьте результат в разделе «Содержимое», выбрав роль.</span><span className="hidden xl:inline">Переключите раздел на «Содержимое», чтобы проверить экраны каждой роли.</span> Чтобы проверить записи конкретного человека, укажите его почту в предпросмотре.</p><ul className="space-y-4">{app.roles.map(role => <li key={role.id}><p className="text-sm font-medium">{role.name}</p><p className="mt-1 text-xs leading-5 text-ink-soft">{app.screens.filter(item => item.access.roles.includes(role.id) && item.tab).map(item => item.tab!.label).join(', ') || 'Нет доступных разделов'}</p></li>)}</ul><p className="text-xs leading-5 text-ink-muted">Доступ к таблицам в кабинете настраивается отдельно, в разделе «Команда и доступ».</p></> : null}
          {tab === 'content' && !confirmPublish && props.status ? <p role={props.error ? 'alert' : 'status'} className={`break-words text-sm leading-6 ${props.error ? 'text-red-700' : 'text-ink-soft'}`}>{props.status}</p> : null}
          <button type="button" onClick={props.onSave} disabled={pending} className={ownerSecondary}>{pending ? 'Сохраняем…' : 'Сохранить черновик'}</button>
        </fieldset>
        <p className="text-xs leading-5 text-ink-muted">{props.published ? 'Изменения экранов и доступа появятся после публикации. Данные в таблицах сохраняются отдельно.' : 'Опубликуйте приложение, чтобы открыть его по рабочей ссылке.'}</p>
      </aside> : null}
    </div>
    {confirmPublish ? <section tabIndex={-1} aria-labelledby="publish-check" className="scroll-mt-20 mt-7 space-y-4 rounded-2xl border border-sage-200 bg-sage-50 p-5 sm:p-6" data-guide="publish-check">
      <h2 id="publish-check" className="text-lg font-semibold">{personal ? props.published ? 'Перед обновлением' : 'Перед первым запуском' : 'Проверка перед публикацией'}</h2>
      {props.status ? <p role={props.error ? 'alert' : 'status'} className={`text-sm leading-6 ${props.error ? 'text-red-700' : 'text-ink-soft'}`}>{props.status}</p> : null}
      <p className="max-w-2xl text-sm leading-6 text-ink-soft">{personal ? 'Проверьте разделы и записи. После запуска сможете работать с ними по ссылке с компьютера или телефона.' : 'Проверьте данные и доступ сотрудников. По рабочей ссылке каждый увидит разделы, доступные его роли. Записи в таблицах и приложении общие.'}</p>
      <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-1 size-4 shrink-0" />{personal ? 'Я проверил свои данные' : 'Я проверил данные и доступ пользователей'}</label>
      <div className="flex flex-wrap gap-3"><button type="button" className={ownerPrimary} disabled={!checked || !canEdit || pending || publishing} onClick={props.onPublish}>{publishing ? 'Сохраняем и публикуем…' : personal ? props.published ? 'Применить изменения' : 'Запустить приложение' : props.published ? 'Опубликовать изменения' : 'Опубликовать приложение'}</button><button type="button" disabled={publishing} className={ownerSecondary} onClick={() => setConfirmPublish(false)}>Вернуться к проверке</button>{props.published ? <Link href={`/a/${app.slug}`} className={ownerSecondary}>Открыть рабочее приложение ↗</Link> : null}</div>
    </section> : null}
    <div className="mt-8 border-t border-sand-200 pt-5"><Link href={`/apps/${app.id}?advanced=1`} className="rounded text-sm text-ink-soft underline decoration-sand-300 underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400">Полный конструктор →</Link></div>
    {props.helpLinks ? <OwnerHelpButton href={props.helpLinks[tab]} /> : null}
  </div>
}
