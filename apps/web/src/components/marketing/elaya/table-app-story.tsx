'use client'

import { useId, useState } from 'react'
import {
  ArrowDownIcon, ArrowLeftIcon, ArrowUpRightIcon, CameraIcon, CheckIcon, ChartBarIcon,
  FileXlsIcon, FolderSimpleIcon, HouseLineIcon, ListChecksIcon,
  PackageIcon, PauseIcon, PlayIcon, SuitcaseSimpleIcon, TableIcon, TruckIcon,
} from '@phosphor-icons/react/ssr'
import { useStoryClock } from './motion'
import styles from './table-app-story.module.css'

type Section = 'projects' | 'tasks' | 'expenses'
type DemoItem = { id: string; name: string; status?: string; date?: string; amount?: number; project?: string; icon: typeof FolderSimpleIcon; tone: 'green' | 'sand' | 'stone' }
const PERSONAL_SECTIONS = [
  { id: 'projects', sheet: 'Проекты', screen: 'Проекты', icon: FolderSimpleIcon, columns: ['Проект', 'Статус', 'Бюджет'] },
  { id: 'tasks', sheet: 'Задачи', screen: 'Мои дела', icon: ListChecksIcon, columns: ['Задача', 'Срок', 'Статус'] },
  { id: 'expenses', sheet: 'Расходы', screen: 'Бюджет', icon: ChartBarIcon, columns: ['Покупка', 'Проект', 'Сумма'] },
] as const
const PERSONAL_DATA: Record<Section, DemoItem[]> = {
  projects: [
    { id: 'p1', name: 'Ремонт комнаты', status: 'В работе', amount: 28700, icon: HouseLineIcon, tone: 'sand' },
    { id: 'p2', name: 'Поездка в Карелию', status: 'В планах', amount: 18500, icon: SuitcaseSimpleIcon, tone: 'green' },
    { id: 'p3', name: 'Курс по фотографии', status: 'В планах', amount: 6900, icon: CameraIcon, tone: 'stone' },
  ],
  tasks: [
    { id: 't1', name: 'Выбрать материалы', project: 'Ремонт комнаты', date: '9 ноября', status: 'В работе', icon: HouseLineIcon, tone: 'sand' },
    { id: 't2', name: 'Забронировать жильё', project: 'Поездка в Карелию', date: '12 ноября', status: 'Сделать', icon: SuitcaseSimpleIcon, tone: 'green' },
    { id: 't3', name: 'Выбрать время занятий', project: 'Курс по фотографии', date: '15 ноября', status: 'Сделать', icon: CameraIcon, tone: 'stone' },
  ],
  expenses: [
    { id: 'e1', name: 'Краска и кисти', project: 'Ремонт комнаты', amount: 4260, icon: HouseLineIcon, tone: 'sand' },
    { id: 'e2', name: 'Билеты на поезд', project: 'Поездка в Карелию', amount: 2490, icon: SuitcaseSimpleIcon, tone: 'green' },
    { id: 'e3', name: 'Курс фотографии', project: 'Курс по фотографии', amount: 6900, icon: CameraIcon, tone: 'stone' },
  ],
}
const BUSINESS_SECTIONS = [
  { id: 'projects', sheet: 'Заказы', screen: 'Заказы', icon: ListChecksIcon, columns: ['Заказ', 'Статус', 'Сумма'] },
  { id: 'tasks', sheet: 'Задачи', screen: 'Команда', icon: FolderSimpleIcon, columns: ['Задача', 'Срок', 'Статус'] },
  { id: 'expenses', sheet: 'Расходы', screen: 'Финансы', icon: ChartBarIcon, columns: ['Покупка', 'Назначение', 'Сумма'] },
] as const
const BUSINESS_DATA: Record<Section, DemoItem[]> = {
  projects: [
    { id: 'p1', name: 'Стеллаж для офиса', status: 'В работе', amount: 28700, icon: PackageIcon, tone: 'sand' },
    { id: 'p2', name: 'Тумба под раковину', status: 'Принят', amount: 18500, icon: PackageIcon, tone: 'green' },
    { id: 'p3', name: 'Полка в прихожую', status: 'Новый', amount: 6900, icon: PackageIcon, tone: 'stone' },
  ],
  tasks: [
    { id: 't1', name: 'Подготовить чертёж', project: 'Стеллаж для офиса', date: '9 ноября', status: 'В работе', icon: ListChecksIcon, tone: 'sand' },
    { id: 't2', name: 'Заказать фурнитуру', project: 'Тумба под раковину', date: '12 ноября', status: 'Сделать', icon: PackageIcon, tone: 'green' },
    { id: 't3', name: 'Согласовать доставку', project: 'Полка в прихожую', date: '15 ноября', status: 'Сделать', icon: TruckIcon, tone: 'stone' },
  ],
  expenses: [
    { id: 'e1', name: 'Мебельные щиты', project: 'Стеллаж для офиса', amount: 4260, icon: PackageIcon, tone: 'sand' },
    { id: 'e2', name: 'Фурнитура', project: 'Тумба под раковину', amount: 2490, icon: PackageIcon, tone: 'green' },
    { id: 'e3', name: 'Аренда мастерской', project: 'Общие расходы', amount: 6900, icon: HouseLineIcon, tone: 'stone' },
  ],
}
const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`

export function TableAppStory({ audience = 'business' }: { audience?: 'business' | 'personal' } = {}) {
  const business = audience === 'business'
  const SECTIONS = business ? BUSINESS_SECTIONS : PERSONAL_SECTIONS
  const DATA = business ? BUSINESS_DATA : PERSONAL_DATA
  const clock = useStoryClock(3, 7.5)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [completed, setCompleted] = useState<Set<string>>(() => new Set())
  const [changed, setChanged] = useState(false)
  const instance = useId()
  const section = SECTIONS[clock.step]!
  const items = DATA[section.id]
  const selected = items.find(item => item.id === selectedId)
  const currentItem = selected ?? items[0]!
  const status = (item: DemoItem) => completed.has(item.id) ? 'Готово' : item.status
  const choose = (index: number) => { clock.select(index); setSelectedId(null); setChanged(false) }
  const open = (id: string) => { clock.select(clock.step); setSelectedId(id); setChanged(false) }
  const fields = selected ? section.id === 'projects'
    ? [['Статус', status(selected)!], [business ? 'Сумма заказа' : 'Бюджет', money(selected.amount!)]]
    : section.id === 'tasks'
      ? [[business ? 'Заказ' : 'Проект', selected.project!], ['Срок', selected.date!], ['Статус', status(selected)!]]
      : [[business ? 'Назначение' : 'Проект', selected.project!], ['Сумма', money(selected.amount!)]] : []

  return <div ref={clock.ref} className={styles.story} data-table-app-story data-section={section.id} data-playing={clock.playing}>
    <div className={styles.composition}>
      <figure className={styles.source}>
        <figcaption>Таблицы в TableApp</figcaption>
        <div className={styles.workbook}>
          <div className={styles.fileName}><FileXlsIcon size={20} aria-hidden /><strong>{business ? 'Учёт мастерской.xlsx' : 'Мои проекты.xlsx'}</strong><span>3 листа</span></div>
          <div className={styles.sheetContent} key={section.id}>
            <table aria-label={`Лист «${section.sheet}»`}>
              <thead><tr>{section.columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
              <tbody>{items.map((item, index) => <tr key={item.id} data-selected={selected ? selected.id === item.id : index === 0} data-completed={completed.has(item.id)}>
                <td><button type="button" onClick={() => open(item.id)} aria-label={`Открыть: ${item.name}`}><strong>{item.name}</strong><ArrowUpRightIcon size={14} aria-hidden /></button></td>
                <td>{section.id === 'projects' ? <span className={styles.tag}>{status(item)}</span> : section.id === 'tasks' ? item.date : item.project}</td>
                <td>{section.id === 'tasks' ? <span className={styles.tag}>{status(item)}</span> : money(item.amount!)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className={styles.sheetTabs} role="tablist" aria-label="Листы таблицы">{SECTIONS.map((item, index) => <button type="button" role="tab" key={item.id} id={`${instance}-${item.id}`} aria-selected={clock.step === index} tabIndex={clock.step === index ? 0 : -1} aria-controls={`${instance}-sheet`} onClick={() => choose(index)} onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null
            if (next !== null) { event.preventDefault(); choose(next); document.getElementById(`${instance}-${SECTIONS[next]!.id}`)?.focus() }
          }}><item.icon size={16} aria-hidden />{item.sheet}</button>)}</div>
        </div>
        <p className={styles.sourceNote}>{business ? 'Заказы, задачи команды и расходы мастерской.' : 'Проекты, задачи и расходы в привычных листах.'}</p>
      </figure>

      <div className={styles.connection} aria-hidden><svg viewBox="0 0 112 96" fill="none"><path className={styles.track} d="M8 56C35 25 69 77 103 44" /><path key={section.id} className={styles.flow} pathLength="1" d="M8 56C35 25 69 77 103 44" /><path className={styles.arrowHead} d="M88 43L103 44L100 59" /></svg></div>

      <figure className={styles.result}>
        <figcaption><span className={styles.desktopLabel}>Приложение, которое настроили вы</span><span className={styles.mobileLabel}>Ваше приложение</span></figcaption>
        <div className={styles.device} role="group" aria-label="Пример вашего приложения">
          <div className={styles.statusBar} aria-hidden><span>9:41</span><span>•••</span></div>
          <div className={styles.appHeader}><span>{business ? 'Мастерская' : 'Мои проекты'}</span><strong>{section.screen}</strong></div>
          <div className={styles.phoneMain} id={`${instance}-sheet`} role="tabpanel" aria-labelledby={`${instance}-${section.id}`}>
            <div className={styles.pane} key={`${section.id}-${selected?.id ?? 'list'}`}>
              {selected ? <div className={styles.detail}>
                <button type="button" className={styles.back} onClick={() => { setSelectedId(null); setChanged(false) }}><ArrowLeftIcon size={16} aria-hidden />К списку</button>
                <h3>{selected.name}</h3>
                <dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd data-detail-status={label === 'Статус' || undefined}>{value}</dd></div>)}</dl>
                {selected.status && <button type="button" className={styles.complete} onClick={() => { setCompleted(previous => { const next = new Set(previous); if (next.has(selected.id)) next.delete(selected.id); else next.add(selected.id); return next }); setChanged(true) }}><CheckIcon size={16} aria-hidden />{completed.has(selected.id) ? 'Отменить отметку' : section.id === 'projects' ? business ? 'Завершить заказ' : 'Завершить проект' : 'Отметить выполненным'}</button>}
                {changed && <p className={styles.saved} role="status">Статус изменился и в таблице</p>}
              </div> : <>
                {section.id === 'expenses' && <div className={styles.total}><span>{business ? 'Расходы мастерской' : 'Всего расходов'}</span><strong>{money(items.reduce((sum, item) => sum + item.amount!, 0))}</strong></div>}
                <ul className={styles.cards} aria-label={section.screen}>{items.map((item, index) => <li key={item.id}><button type="button" onClick={() => open(item.id)} data-highlighted={index === 0} className={section.id === 'expenses' ? styles.expense : undefined}>
                  {section.id === 'projects' && <span className={styles.itemIcon} data-tone={item.tone}><item.icon size={24} weight="duotone" aria-hidden /></span>}
                  <span className={styles.cardText}><strong>{item.name}</strong>{section.id === 'projects' ? <span>{status(item)}</span> : <span>{item.project}</span>}</span>
                  {section.id === 'projects' && <span className={styles.cardAmount}>{money(item.amount!)}</span>}
                  {section.id === 'expenses' && <strong className={styles.expenseAmount}>{money(item.amount!)}</strong>}
                  {section.id === 'tasks' && <span className={styles.taskMeta}><span>{item.date}</span><span className={styles.tag}>{status(item)}</span></span>}
                </button></li>)}</ul>
              </>}
            </div>
          </div>
          <nav className={styles.appNav} aria-label="Разделы приложения">{SECTIONS.map((item, index) => <button type="button" key={item.id} aria-pressed={clock.step === index} onClick={() => choose(index)}><item.icon size={20} aria-hidden /><span>{item.screen}</span></button>)}</nav>
        </div>
        <div className={styles.mobileSource} data-mobile-source data-changed={changed}>
          <ArrowDownIcon className={styles.syncArrow} size={24} aria-hidden />
          <div className={styles.mobileSourceHeading}><TableIcon size={16} aria-hidden /><span>В таблице «{section.sheet}»</span></div>
          <table aria-label={`Результат в таблице «${section.sheet}»`}><thead><tr><th scope="col">{section.columns[0]}</th><th scope="col">{currentItem.status ? 'Статус' : 'Сумма'}</th></tr></thead><tbody><tr><td>{currentItem.name}</td><td key={status(currentItem) ?? currentItem.amount} data-sync-value>{currentItem.status ? status(currentItem) : money(currentItem.amount!)}</td></tr></tbody></table>
        </div>
      </figure>
    </div>
    <div className={styles.footnote}><p><strong className={styles.desktopLabel}>Разделы, поля и расчёты выбираете вы.</strong><span className={styles.desktopLabel}>Переключите раздел или откройте карточку.</span><span className={styles.mobileLabel}>{currentItem.status ? 'Откройте карточку и измените статус. Результат появится в таблице.' : 'Откройте покупку, чтобы посмотреть детали.'}</span></p><button type="button" className={styles.play} disabled={clock.reduced} aria-label={clock.playing ? 'Остановить показ' : 'Продолжить показ'} onClick={() => { if (!clock.playing) { setSelectedId(null); setChanged(false) } clock.toggle() }}>{clock.playing ? <PauseIcon size={16} aria-hidden /> : <PlayIcon size={16} aria-hidden />}<span>{clock.reduced ? 'Без анимации' : clock.playing ? 'Пауза' : 'Смотреть'}</span></button></div>
  </div>
}
