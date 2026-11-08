'use client'

import { useEffect, useRef, useState } from 'react'
import { byPosition, type App, type Screen, type View } from '@tableapp/schema'
import type { TableSummary } from '@/lib/queries'
import { moveSection, putSection, removeSection, sectionIcon, sectionSources, SECTION_TYPES, type SectionType } from '@/lib/app-sections'
import { Icon } from '../runtime/icons'
import { ownerInput, ownerPrimary, ownerSecondary } from '../owner-ui'

const ICONS = [['list', 'Список'], ['clipboard', 'Задачи'], ['file', 'Заметки'], ['chart', 'Показатели'], ['calendar', 'Календарь'], ['box', 'Вещи'], ['users', 'Люди'], ['tag', 'Метка'], ['home', 'Дом'], ['check', 'Готово'], ['plus', 'Добавить'], ['inbox', 'Входящие']] as const

export function SectionDialog({ app, screen, tables, views, onChange, onClose }: {
  app: App; screen?: Screen; tables: TableSummary[]; views: View[]; onChange: (app: App, screenId: string) => void; onClose: () => void
}) {
  const sources = sectionSources(tables, views)
  const sourceView = screen && 'source' in screen ? screen.source.viewId : screen?.type === 'dashboard' ? screen.blocks.find(block => 'source' in block)?.source.viewId : undefined
  const initialTable = views.find(view => view.id === sourceView)?.tableId ?? (screen && 'tableId' in screen ? screen.tableId : undefined) ?? sources[0]?.table.id ?? ''
  const [tableId, setTableId] = useState(initialTable)
  const [viewId, setViewId] = useState(sourceView ?? sources.find(source => source.table.id === initialTable)?.view.id ?? '')
  const [name, setName] = useState((screen?.tab?.label ?? screen?.name ?? sources[0]?.table.name ?? '').slice(0, 30))
  const navigation = app.screens.filter(item => item.tab).sort(byPosition)
  const [order, setOrder] = useState(screen ? navigation.findIndex(item => item.id === screen.id) : navigation.length)
  const [start, setStart] = useState(Boolean(screen && app.homeScreenId === screen.id))
  const [icon, setIcon] = useState(screen?.tab?.icon ?? sectionIcon(name))
  const [type, setType] = useState<SectionType>(screen?.type === 'tiles' || screen?.type === 'dashboard' || screen?.type === 'form' ? screen.type : 'list')
  const [showIcons, setShowIcons] = useState(false)
  const [showFields, setShowFields] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const source = sources.find(source => source.table.id === tableId)
  const metric = screen?.type === 'dashboard' ? screen.blocks.find(block => block.type === 'metric') : undefined
  const [metricKind, setMetricKind] = useState<'count' | 'sum' | 'avg'>(metric?.kind === 'sum' || metric?.kind === 'avg' ? metric.kind : 'count')
  const [metricField, setMetricField] = useState(metric?.fieldId ?? source?.table.fields.find(field => field.type === 'number')?.id ?? '')
  const collection = screen?.type === 'list' || screen?.type === 'tiles' ? screen : undefined
  const [title, setTitle] = useState(collection?.titleFieldId ?? source?.table.primaryFieldId ?? '')
  const [subtitle, setSubtitle] = useState(collection?.subtitleFieldId ?? '')
  const [value, setValue] = useState(collection?.metaFieldId ?? '')
  const managed = !screen || screen.sectionId === screen.id
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow
    dialog.current?.showModal(); document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow; if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  const changeTable = (id: string) => {
    const next = sources.find(source => source.table.id === id)
    if (!next) return
    if (!name.trim() || name === source?.table.name.slice(0, 30)) setName(next.table.name.slice(0, 30))
    if (icon === sectionIcon(source?.table.name ?? '')) setIcon(sectionIcon(next.table.name))
    setTableId(id); setViewId(next.view.id); setTitle(next.table.primaryFieldId ?? ''); setSubtitle(''); setValue(''); setMetricField(next.table.fields.find(field => field.type === 'number')?.id ?? ''); setError('')
  }
  const finish = () => {
    setError('')
    if (!name.trim()) { setError('Укажите название раздела.'); return }
    if (!source) { setError('Выберите таблицу для раздела.'); return }
    if (type === 'dashboard' && metricKind !== 'count' && !metricField) { setError('Выберите числовую колонку для расчёта.'); return }
    try {
      const view = views.find(view => view.id === viewId && view.tableId === tableId) ?? source.view
      const sameSource = screen && initialTable === tableId
      let result = screen && (!managed || sameSource && (screen.type === type || collection && (type === 'list' || type === 'tiles')))
        ? { app, screenId: screen.id } : putSection(app, { source: { ...source, view }, type, name, icon, rootId: screen?.id })
      result = { ...result, app: { ...result.app, screens: result.app.screens.map(item => item.id === result.screenId ? {
        ...item, name: name.trim(), tab: { icon, label: name.trim() },
        ...(item.type === 'list' || item.type === 'tiles' ? { type: managed && type === 'tiles' ? 'tiles' : managed && type === 'list' ? 'list' : item.type,
          ...(managed && type === 'tiles' ? { columns: 2 } : {}), source: { ...item.source, viewId: view.id }, titleFieldId: title || null, subtitleFieldId: subtitle || null, metaFieldId: value || null } : {}),
        ...(item.type === 'dashboard' && managed ? { blocks: item.blocks.map((block, index) => index === item.blocks.findIndex(candidate => candidate.type === 'metric') && block.type === 'metric' ? { ...block, source: { viewId: view.id }, kind: metricKind, fieldId: metricKind === 'count' ? null : metricField,
          title: metricKind === 'count' ? 'Записей' : metricKind === 'sum' ? 'Общая сумма' : 'Среднее значение', format: 'auto' } : block) } : {}),
      } as Screen : item) } }
      let at = result.app.screens.filter(item => item.tab).sort(byPosition).findIndex(item => item.id === result.screenId)
      while (at !== order && at >= 0) { result.app = moveSection(result.app, result.screenId, at > order ? -1 : 1); at += at > order ? -1 : 1 }
      if (start) result.app = { ...result.app, homeScreenId: result.screenId }
      else if (result.app.homeScreenId === result.screenId) result.app = { ...result.app, homeScreenId: result.app.screens.find(item => item.tab && item.id !== result.screenId)?.id ?? result.screenId }
      onChange({ ...result.app, screens: [...result.app.screens].sort(byPosition) }, result.screenId); onClose()
    } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось настроить раздел.') }
  }
  const field = (label: string, selected: string, change: (id: string) => void) => <label className="block text-sm text-ink-soft">{label}<select className={ownerInput} value={selected} onChange={event => change(event.target.value)}><option value="">Не показывать</option>{source?.table.fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
  return <dialog ref={dialog} aria-labelledby="section-dialog-title" onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose() }} className="m-auto max-h-[90dvh] w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-sand-200 bg-white p-5 text-ink shadow-lift backdrop:bg-ink/30 open:flex open:flex-col sm:p-6">
    <header className="mb-6 flex shrink-0 items-center justify-between gap-4"><h2 id="section-dialog-title" className="text-xl font-semibold">{screen ? 'Настроить раздел' : 'Добавить раздел'}</h2><button type="button" aria-label="Закрыть настройку раздела" onClick={onClose} className={`${ownerSecondary} size-11 p-0!`}>×</button></header>
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => { event.preventDefault(); finish() }}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
        {managed ? <label className="block text-sm text-ink-soft">Таблица<select className={ownerInput} value={tableId} onChange={event => changeTable(event.target.value)}>{sources.map(source => <option key={source.table.id} value={source.table.id}>{source.table.name}</option>)}</select></label> : null}
        <div className="flex items-end gap-3"><button type="button" aria-label="Выбрать иконку раздела" aria-expanded={showIcons} className={`${ownerSecondary} size-11 shrink-0 p-0!`} onClick={() => setShowIcons(!showIcons)}><Icon name={icon} /></button><label className="min-w-0 flex-1 text-sm text-ink-soft">Название раздела<input className={ownerInput} required maxLength={30} value={name} onChange={event => { setName(event.target.value); setError('') }} /></label></div>
        {showIcons ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="group" aria-label="Иконка раздела">{ICONS.map(([id, label]) => <button type="button" key={id} aria-label={label} aria-pressed={icon === id} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-xs focus-visible:ring-2 focus-visible:ring-sage-400 ${icon === id ? 'border-sage-400 bg-sage-50' : 'border-sand-200 hover:bg-sand-50'}`} onClick={() => { setIcon(id); setShowIcons(false) }}><Icon name={id} />{label}</button>)}</div> : null}
        {managed && (!screen || collection) ? <fieldset><legend className="mb-2 text-sm font-medium">Как показывать данные</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{SECTION_TYPES.filter(item => !screen || item.id === 'list' || item.id === 'tiles').map(item => <button type="button" key={item.id} aria-pressed={type === item.id} onClick={() => setType(item.id)} className={`flex min-h-16 flex-col items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm focus-visible:ring-2 focus-visible:ring-sage-400 ${type === item.id ? 'border-sage-400 bg-sage-50 font-medium' : 'border-sand-200 hover:bg-sand-50'}`}><Icon name={item.icon} />{item.name}</button>)}</div></fieldset> : null}
        {(type === 'list' || type === 'tiles' || type === 'dashboard') && managed && views.filter(view => view.tableId === tableId).length > 1 ? <label className="block text-sm text-ink-soft">Какие записи показывать<select className={ownerInput} value={viewId} onChange={event => setViewId(event.target.value)}>{views.filter(view => view.tableId === tableId).map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label> : null}
        {type === 'dashboard' && managed ? <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm text-ink-soft">Показатель<select className={ownerInput} value={metricKind} onChange={event => setMetricKind(event.target.value as typeof metricKind)}><option value="count">Количество записей</option><option value="sum">Сумма</option><option value="avg">Среднее</option></select></label>{metricKind !== 'count' ? <label className="block text-sm text-ink-soft">Колонка для расчёта<select className={ownerInput} value={metricField} onChange={event => setMetricField(event.target.value)}><option value="">Выберите колонку</option>{source?.table.fields.filter(field => ['number', 'formula', 'rollup'].includes(field.type)).map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label> : null}</div> : null}
        <button type="button" aria-expanded={showFields} className="min-h-11 rounded text-sm text-sage-700 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400" onClick={() => setShowFields(!showFields)}>{showFields ? 'Скрыть поля и порядок' : 'Поля и порядок'}</button>
        {showFields ? <div className="space-y-4">{type === 'list' || type === 'tiles' ? <div className="grid gap-4 sm:grid-cols-2">{field('Заголовок записи', title, setTitle)}{field('Подпись', subtitle, setSubtitle)}{field('Значение справа', value, setValue)}</div> : null}<label className="block text-sm text-ink-soft">Положение в меню<select className={ownerInput} value={order} onChange={event => setOrder(Number(event.target.value))}>{Array.from({ length: navigation.length + (screen ? 0 : 1) }, (_, index) => <option key={index} value={index}>{index + 1}{index === 0 ? ' · Первым' : index === navigation.length - (screen ? 1 : 0) ? ' · Последним' : ''}</option>)}</select></label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-sage-700" checked={start} onChange={event => setStart(event.target.checked)} />Открывать этот раздел при запуске</label></div> : null}
        {screen && managed && tableId !== initialTable ? <p className="text-sm leading-6 text-ink-soft">Карточка и формы раздела будут настроены по полям новой таблицы. Исходные записи сохранятся.</p> : null}
        {screen?.sectionId === screen?.id && screen ? <div className="border-t border-sand-200 pt-4">{removing ? <><p className="text-sm leading-6">Удалить раздел «{screen.tab?.label ?? screen.name}»? Таблица и записи сохранятся.</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" className={`${ownerSecondary} text-red-700!`} onClick={() => { try { const next = removeSection(app, screen.id); onChange(next, next.homeScreenId ?? next.screens[0]!.id); onClose() } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось удалить раздел.') } }}>Удалить раздел</button><button type="button" className={ownerSecondary} onClick={() => setRemoving(false)}>Оставить раздел</button></div></> : <button type="button" className="min-h-11 rounded text-sm text-red-700 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400" onClick={() => setRemoving(true)}>Удалить раздел</button>}</div> : null}
      </div>
      {error ? <p role="alert" className="mt-4 text-sm leading-6 text-red-700">{error}</p> : null}
      <footer className="mt-4 flex shrink-0 flex-wrap gap-3 border-t border-sand-200 pt-4"><button type="submit" disabled={!source} className={ownerPrimary}>{screen ? 'Готово' : 'Добавить раздел'}</button><button type="button" className={ownerSecondary} onClick={onClose}>Отмена</button></footer>
    </form>
  </dialog>
}
