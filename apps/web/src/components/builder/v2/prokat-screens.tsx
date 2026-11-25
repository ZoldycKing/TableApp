'use client'
import { createContext, lazy, Suspense, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import { savePublishedProkatAction } from '@/app/prokat-actions'
import {
  PROKAT_BOOKING_VIEWS, PROKAT_CLIENT_STEPS, PROKAT_ZONE, clientCanRequestCancel, computeLateFee,
  computeRentalPrice, filterBookings, formatMoney, formatMoneyOrZero, formatProkatDate, formatProkatDateTime,
  isOpenBooking, isOverdueReturn, itemBusyUntil, prokatClientStepIndex, prokatDashboard, prokatWallInstant,
  staffTransitions, type ProkatBookingViewId, type ProkatCatalogItem, type ProkatListItem,
} from '@/lib/prokat-logic'
import { applyProkatChange, bookingSpansFromRows, isProkatDesk, prokatStatusName, type ProkatChange } from '@/lib/prokat-persist'
import { AppFrameDeviceContext } from './app-frame'
import { AppDialog } from './app-dialog'
import { DateMenu } from './booking-calendar'
import { DetailCardShell, DetailSection, ListScreenShell, ShellSearchField } from './layout-shell'
import shell from './layout-shell.module.css'
import { ProtoIcon } from '../prototype/icons'
import { usePublishedV2 } from './published-context'
import { useBuilderV2NodeData } from './use-data'
import type { AppV2RendererProps } from './view'
import css from './prokat.module.css'

const CorrespondenceModule = lazy(() => import('@/components/runtime/correspondence-module').then(module => ({ default: module.CorrespondenceModule })))

export type ProkatOpen = 'create' | 'issue' | 'return' | 'request' | null
export type ProkatBundle = {
  rows: AppV2Record[]
  setRows?: (rows: AppV2Record[]) => void
  open?: ProkatOpen
  now?: number
  sample?: boolean
}
export const ProkatRowsContext = createContext<ProkatBundle | null>(null)

const PLACEHOLDER: AppV2Node = { id: 'prokat_placeholder', name: 'placeholder', type: 'heading', value: { kind: 'literal', value: '' }, size: 's', visibleTo: null, visibleWhen: null }
const publishedHolder: { current: ReturnType<typeof usePublishedV2> } = { current: null }
const textOf = (value: unknown) => Array.isArray(value) ? '' : value == null ? '' : String(value)
const firstId = (value: unknown) => Array.isArray(value) ? value.find((item): item is string => typeof item === 'string') ?? '' : ''
const idsOf = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
const numberOf = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0

function categoryIcon(category: string) {
  if (category === 'Инструменты') return 'wrench'
  if (category === 'Фототехника') return 'image'
  if (category === 'SUP') return 'box'
  return 'box'
}

function ItemTile({ item, size = 40 }: { item: Pick<ProkatCatalogItem, 'photo' | 'category' | 'name'>; size?: number }) {
  return <span className={css.itemTile} aria-hidden="true">
    {item.photo
      ? <img src={item.photo} alt="" width={size} height={size} />
      : <ProtoIcon name={categoryIcon(item.category)} size={Math.round(size * 0.45)} />}
  </span>
}

function photosToJson(raw: string) {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return JSON.stringify(lines)
}

function photosFromJson(raw: unknown) {
  const text = textOf(raw).trim()
  if (!text) return ''
  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) return parsed.map(item => String(item)).filter(Boolean).join('\n')
  } catch { /* plain text fallback */ }
  return text
}

function TimeMenu({ value, onValue, label }: { value: string; onValue: (value: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const [hour, minute] = /^(\d{2}):(\d{2})$/.exec(value)?.slice(1) ?? ['', '']
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const pick = (nextHour: string, nextMinute: string) => {
    onValue(`${nextHour}:${nextMinute}`)
    setOpen(false)
  }
  return <div className={css.timeMenu} ref={root}>
    <button type="button" className={css.timeButton} aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(current => !current)}>
      <ProtoIcon name="clock" size={16} /><span>{value || 'чч:мм'}</span>
    </button>
    {open ? <div className={css.timePanel} role="dialog" aria-label={label}>
      <div className={css.timeCols}>
        <div role="listbox" aria-label="Часы">{Array.from({ length: 24 }, (_, index) => {
          const next = String(index).padStart(2, '0')
          return <button key={next} type="button" role="option" aria-selected={next === hour} onClick={() => pick(next, minute || '00')}>{next}</button>
        })}</div>
        <div role="listbox" aria-label="Минуты">{['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(next => (
          <button key={next} type="button" role="option" aria-selected={next === minute} onClick={() => pick(hour || '00', next)}>{next}</button>
        ))}</div>
      </div>
    </div> : null}
  </div>
}

function statusTone(name: string) {
  if (name === 'Заявка') return 'fresh'
  if (name === 'Подтверждена') return 'progress'
  if (name === 'Выдано') return 'resolved'
  if (name === 'Возвращено') return 'closed'
  if (name === 'Просрочен возврат') return 'overdue'
  if (name === 'Отменена') return 'closed'
  if (name === 'Свободен') return 'resolved'
  if (name === 'В прокате') return 'progress'
  if (name === 'На обслуживании') return 'waiting'
  if (name === 'Списан') return 'closed'
  return 'normal'
}

function StatusBadge({ name }: { name: string }) {
  if (!name) return null
  return <span className={css.badge} data-kind="status" data-tone={statusTone(name)}>{name}</span>
}

function PersonMark({ name, photo, size = 28 }: { name: string; photo?: string; size?: number }) {
  const icon = size <= 24 ? 12 : 14
  return <span className={css.avatar} data-size={size <= 24 ? 'sm' : 'md'} aria-hidden="true" title={name || undefined}>
    {photo ? <img src={photo} alt="" width={size} height={size} /> : <ProtoIcon name="user" size={icon} />}
  </span>
}

function useMenuOpen(open: boolean, root: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) onClose() }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, root, onClose])
}

function FactMenu(props: {
  label: string
  value: string
  valueLabel: ReactNode
  options: { id: string; name: string; node?: ReactNode }[]
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useMenuOpen(open, root, () => setOpen(false))
  return <div className={css.assigneeFilter} ref={root}>
    <button type="button" className={css.assigneeTrigger} aria-label={props.label} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(value => !value)}>
      {props.valueLabel}
      <ProtoIcon name="down" size={14} />
    </button>
    {open ? <div className={css.assigneePanel} role="listbox" aria-label={props.label}>
      {props.options.map(option => <button key={option.id || option.name} type="button" role="option" aria-selected={option.id === props.value} onClick={() => { props.onChange(option.id); setOpen(false) }}>{option.node ?? option.name}</button>)}
    </div> : null}
  </div>
}

function ProkatSelect(props: { label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void; emptyLabel?: string; field?: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useMenuOpen(open, root, () => setOpen(false))
  const selected = props.options.find(item => item.id === props.value)
  const label = selected?.name ?? props.emptyLabel ?? props.label
  const body = <div className={`${css.assigneeFilter} ${css.singleFilter}`} ref={root}>
    <button type="button" className={css.assigneeTrigger} data-active={Boolean(props.value) || undefined} aria-expanded={open} aria-haspopup="listbox" aria-label={props.label} onClick={() => setOpen(value => !value)}>
      <span>{label}</span>
      <ProtoIcon name="down" size={14} />
    </button>
    {open ? <div className={css.assigneePanel} role="listbox" aria-label={props.label}>
      {props.options.map(option => <button key={option.id || option.name} type="button" role="option" aria-selected={option.id === props.value} onClick={() => { props.onChange(option.id); setOpen(false) }}>{option.name}</button>)}
    </div> : null}
  </div>
  if (!props.field) return body
  return <div className={css.dropdownField}><span>{props.label}</span>{body}</div>
}

function collectionOn(app: AppV2, screenId: string, tableId: string) {
  const screen = app.screens.find(item => item.id === screenId)
  if (!screen || !tableId) return null
  for (const rootId of screen.rootIds) {
    const node = app.nodes.find(item => item.id === rootId)
    if (node?.type !== 'collection') continue
    const source = app.sources.find(item => item.id === node.sourceId)
    if (source?.tableId === tableId) return node
  }
  return null
}

function useProkatNow(demoNow: number | undefined, asOf: number | undefined) {
  const [now, setNow] = useState(() => demoNow ?? asOf ?? Date.now())
  useEffect(() => {
    if (demoNow != null) { setNow(demoNow); return }
    if (asOf != null) {
      const started = performance.now()
      const tick = () => setNow(asOf + performance.now() - started)
      tick()
      const id = window.setInterval(tick, 60_000)
      return () => window.clearInterval(id)
    }
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [demoNow, asOf])
  if (demoNow != null) return demoNow
  return now
}

function useDialogBehavior(onClose: () => void) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])
}

export function ProkatScreen(props: AppV2RendererProps) {
  const kit = props.app.prokat
  const demo = useContext(ProkatRowsContext)
  const published = usePublishedV2()
  const now = useProkatNow(demo?.now, published?.asOf)
  publishedHolder.current = published
  const screenId = props.screenId
  const recordId = props.record?.id
  const live = Boolean(props.live) && !demo
  const scope = { screenId, ...(recordId ? { recordId } : {}) }
  const node = (tableId: string) => kit ? collectionOn(props.app, screenId, tableId) : null
  const bookingsNode = node(kit?.bookingsTableId ?? '')
  const itemsNode = node(kit?.itemsTableId ?? '')
  const clientsNode = node(kit?.clientsTableId ?? '')
  const staffNode = node(kit?.staffTableId ?? '')
  const bookingsPage = useBuilderV2NodeData(props.app, bookingsNode ?? PLACEHOLDER, live && Boolean(bookingsNode), '', scope)
  const itemsPage = useBuilderV2NodeData(props.app, itemsNode ?? PLACEHOLDER, live && Boolean(itemsNode), '', scope)
  const clientsPage = useBuilderV2NodeData(props.app, clientsNode ?? PLACEHOLDER, live && Boolean(clientsNode), '', scope)
  const staffPage = useBuilderV2NodeData(props.app, staffNode ?? PLACEHOLDER, live && Boolean(staffNode), '', scope)
  const screens = kit ? [
    kit.dashboardScreenId, kit.bookingsScreenId, kit.bookingScreenId, kit.itemsScreenId, kit.itemScreenId,
    kit.timelineScreenId, kit.clientsScreenId, kit.clientScreenId, kit.catalogScreenId, kit.clientListScreenId, kit.clientBookingScreenId,
  ] : []
  if (!kit || !screens.includes(screenId)) return null
  const pages = [bookingsPage, itemsPage, clientsPage, staffPage]
  const rows = demo?.rows ?? pages.flatMap(page => page.page?.rows ?? [])
  const of = (tableId: string) => rows.filter(row => row.tableId === tableId)
  const loading = !demo && pages.some(page => page.loading && !page.page)
  const error = pages.find(page => page.error)?.error ?? ''
  const reload = () => { for (const page of pages) page.reload() }
  const shared = { ...props, kit, rows, of, replace: demo?.setRows, now, loading, error, reload, recordId }
  if (screenId === kit.dashboardScreenId) return <DashboardScreen {...shared} />
  if (screenId === kit.bookingsScreenId) return <BookingList {...shared} />
  if (screenId === kit.clientListScreenId) return <ClientBookingList {...shared} />
  if (screenId === kit.bookingScreenId || screenId === kit.clientBookingScreenId) return <BookingCard {...shared} />
  if (screenId === kit.itemsScreenId) return <ItemsList {...shared} />
  if (screenId === kit.itemScreenId) return <ItemDetail {...shared} />
  if (screenId === kit.timelineScreenId) return <TimelineScreen {...shared} />
  if (screenId === kit.clientsScreenId) return <ClientDirectory {...shared} />
  if (screenId === kit.clientScreenId) return <ClientDetail {...shared} />
  return <CatalogScreen {...shared} />
}

type ScreenProps = Omit<AppV2RendererProps, 'rows'> & {
  kit: NonNullable<AppV2['prokat']>
  rows: AppV2Record[]
  of: (tableId: string) => AppV2Record[]
  replace?: (rows: AppV2Record[]) => void
  now: number
  loading: boolean
  error: string
  reload: () => void
  recordId?: string
}

async function commit(props: ScreenProps, change: ProkatChange) {
  const published = publishedHolder.current
  if (published && published.revision !== 'demo') {
    const result = await savePublishedProkatAction(published.slug, { revision: published.revision, screenId: props.screenId, ...change })
    if (result.ok) published.refresh(result.message)
    return result
  }
  if (!props.replace) return { ok: false as const, error: 'Опубликуйте приложение, чтобы сохранять брони.' }
  const result = applyProkatChange(props.app, props.actor, props.rows, change, new Date(props.now).toISOString())
  if (result.ok) props.replace(result.rows)
  return result.ok ? { ok: true as const, message: result.message } : result
}

function nameOf(props: ScreenProps, tableId: string, id: string, fieldId: string) {
  const row = props.rows.find(item => item.id === id && item.tableId === tableId)
  return row ? textOf(row.values[fieldId]) : ''
}

function choiceLabel(props: ScreenProps, tableId: string, fieldId: string, raw: unknown) {
  const field = props.tables.find(table => table.id === tableId)?.fields.find(item => item.id === fieldId)
  const id = textOf(raw)
  const match = field?.choices?.find(choice => choice.id === id || choice.name === id)
  return match?.name || id
}

function statusId(props: ScreenProps, name: string) {
  const map: Record<string, string> = {
    Заявка: props.kit.statuses.request,
    Подтверждена: props.kit.statuses.confirmed,
    Выдано: props.kit.statuses.issued,
    Возвращено: props.kit.statuses.returned,
    'Просрочен возврат': props.kit.statuses.overdue,
    Отменена: props.kit.statuses.cancelled,
  }
  return map[name] ?? ''
}

function bookingItems(props: ScreenProps): ProkatListItem[] {
  const fields = props.kit.booking
  return props.of(props.kit.bookingsTableId).map(row => {
    const itemIds = idsOf(row.values[fields.items])
    const itemNames = itemIds.map(id => nameOf(props, props.kit.itemsTableId, id, props.kit.item.name)).filter(Boolean)
    const staffId = firstId(row.values[fields.staff])
    const staffName = staffId ? nameOf(props, props.kit.staffTableId, staffId, props.kit.staff.name) : ''
    return {
      id: row.id,
      number: textOf(row.values[fields.number]),
      title: textOf(row.values[fields.title]) || itemNames.join(', '),
      clientName: textOf(row.values[fields.clientName]),
      clientEmail: textOf(row.values[fields.clientEmail]),
      staffName,
      staffEmail: textOf(row.values[fields.staffEmail]),
      status: prokatStatusName(props.kit, row.values[fields.status]) || textOf(row.values[fields.status]),
      from: textOf(row.values[fields.from]),
      to: textOf(row.values[fields.to]),
      price: numberOf(row.values[fields.price]),
      deposit: numberOf(row.values[fields.deposit]),
      lateFee: numberOf(row.values[fields.lateFee]),
      itemIds,
      itemNames,
      updatedAt: textOf(row.values[fields.updatedAt]),
    }
  })
}

function catalogItems(props: ScreenProps): ProkatCatalogItem[] {
  const fields = props.kit.item
  return props.of(props.kit.itemsTableId).map(row => ({
    id: row.id,
    name: textOf(row.values[fields.name]),
    category: choiceLabel(props, props.kit.itemsTableId, fields.category, row.values[fields.category]),
    serial: textOf(row.values[fields.serial]),
    tariff: choiceLabel(props, props.kit.itemsTableId, fields.tariff, row.values[fields.tariff]),
    rate: numberOf(row.values[fields.rate]),
    deposit: numberOf(row.values[fields.deposit]),
    condition: textOf(row.values[fields.condition]),
    status: choiceLabel(props, props.kit.itemsTableId, fields.status, row.values[fields.status]),
    photo: fields.photo ? textOf(row.values[fields.photo]) || undefined : undefined,
  }))
}

function formatDay(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const wall = instantToWallClock(value, PROKAT_ZONE)
  if (!wall) return ''
  const [, month, day] = wall.date.split('-')
  return `${day}.${month}`
}

function ClientStepper({ status, from, to, updatedAt }: { status: string; from?: unknown; to?: unknown; updatedAt?: unknown }) {
  const active = prokatClientStepIndex(status)
  const dateFor = (index: number) => {
    if (index > active) return ''
    if (index === 0) return formatDay(from) || formatDay(updatedAt)
    if (index === 3) return formatDay(to) || formatDay(updatedAt)
    return formatDay(updatedAt) || formatDay(from)
  }
  return <ol className={css.stepper} aria-label="Прогресс брони">
    {PROKAT_CLIENT_STEPS.map((label, index) => {
      const done = active >= 0 && index < active
      const current = index === active
      const date = done || current ? dateFor(index) : ''
      return <li key={label} data-done={done || undefined} data-current={current || undefined} data-todo={!done && !current || undefined}>
        <span className={css.stepMark} aria-hidden="true">
          {done ? <ProtoIcon name="check" size={14} /> : <span className={css.stepDot} />}
        </span>
        <span className={css.stepCopy}>
          <span className={css.stepLabel}>{label}</span>
          {date ? <span className={css.stepDate}>{date}</span> : null}
        </span>
      </li>
    })}
  </ol>
}

function StatusMenu(props: { status: string; onPick: (next: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useMenuOpen(open, root, () => setOpen(false))
  const options = staffTransitions(props.status)
  if (!options.length) return null
  return <div className={css.cardMenu} ref={root}>
    <button type="button" className={css.cardMenuButton} aria-label="Сменить статус" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <ProtoIcon name="more" size={16} />
    </button>
    {open ? <div className={css.cardMenuPanel} role="menu" aria-label="Сменить статус">
      <p className={css.cardMenuTitle}>Сменить статус</p>
      {options.map(next => <button key={next} type="button" role="menuitem" onClick={() => { props.onPick(next); setOpen(false) }}><StatusBadge name={next} /></button>)}
    </div> : null}
  </div>
}

async function runStatus(props: ScreenProps, recordId: string, nextStatusId: string, setMessage: (value: string) => void) {
  if (!nextStatusId) return
  const result = await commit(props, { kind: 'status', recordId, statusId: nextStatusId })
  setMessage(result.ok ? result.message : result.error)
}

function DashboardScreen(props: ScreenProps) {
  const bookings = bookingItems(props)
  const items = catalogItems(props)
  const stats = prokatDashboard(items, bookings, props.now)
  const maxWeek = Math.max(1, ...stats.revenueByWeek.map(week => week.value))
  return <div className={css.root} data-prokat-root data-prokat-screen="dashboard">
    <ListScreenShell title="Прокат" meta="Загрузка парка, выручка и возвраты.">
      <fieldset className={css.statCards} aria-label="Показатели проката">
        <button type="button" className={css.statCard} onClick={() => props.onNavigate?.(props.kit.bookingsScreenId)}><strong>{stats.utilisation}%</strong><span>Загрузка парка</span></button>
        <button type="button" className={css.statCard} onClick={() => props.onNavigate?.(props.kit.bookingsScreenId)}><strong>{stats.itemsOut}</strong><span>Сейчас в прокате</span></button>
        <button type="button" className={css.statCard} data-tone="rose" onClick={() => props.onNavigate?.(props.kit.bookingsScreenId)}><strong>{stats.returnsDueToday}</strong><span>Возврат сегодня</span></button>
        <button type="button" className={css.statCard} data-tone="rose" onClick={() => props.onNavigate?.(props.kit.bookingsScreenId)}><strong>{stats.overdueCount}</strong><span>Просрочено</span></button>
      </fieldset>
      <div className={css.summary} role="group" aria-label="По статусам">
        <button type="button" onClick={() => props.onNavigate?.(props.kit.bookingsScreenId)}><strong>{stats.request}</strong><span>Заявки</span></button>
        <button type="button" onClick={() => props.onNavigate?.(props.kit.bookingsScreenId)}><strong>{stats.confirmed}</strong><span>Подтверждены</span></button>
        <button type="button" onClick={() => props.onNavigate?.(props.kit.bookingsScreenId)}><strong>{stats.issued}</strong><span>Выдано</span></button>
        <button type="button" onClick={() => props.onNavigate?.(props.kit.bookingsScreenId)}><strong>{stats.returned}</strong><span>Возвращено</span></button>
      </div>
      <div className={css.dashGrid}>
        <DetailSection title="Загрузка по категориям">
          {!stats.utilisationByCategory.length ? <p className={css.quiet}>Предметов пока нет.</p> : stats.utilisationByCategory.map(row => (
            <div key={row.name} className={css.utilRow}>
              <div className={css.utilRow} style={{ gridTemplateColumns: 'minmax(0,1fr)', border: 0, padding: 0 }}>
                <strong>{row.name}</strong>
                <span className={css.utilBar} aria-hidden="true"><i style={{ width: `${row.percent}%` }} /></span>
              </div>
              <span>{row.percent}%</span>
            </div>
          ))}
        </DetailSection>
        <DetailSection title="Выручка по неделям">
          <div className={css.revBars} role="img" aria-label="Выручка по неделям">
            {stats.revenueByWeek.map(week => {
              const pct = week.value ? Math.max(10, Math.round((week.value / maxWeek) * 100)) : 0
              return <div key={week.label} className={css.revBar}>
                <strong>{formatMoneyOrZero(week.value)}</strong>
                <div className={css.revChart}><span className={css.revFill} style={{ height: `${pct}%` }} /></div>
                <span>{week.label}</span>
              </div>
            })}
          </div>
        </DetailSection>
      </div>
      {stats.overdue.length ? <DetailSection title="Просроченный возврат">
        <ul className={css.cards} data-keep-cards>{stats.overdue.slice(0, 5).map(item => <li key={item.id}>
          <button type="button" className={css.card} onClick={() => props.onNavigate?.(props.kit.bookingScreenId, item.id)}>
            <span className={`${css.subject} ${css.deviceWrap}`}>{item.title || item.number}</span>
            <span className={css.number}>{item.number} · до {formatProkatDateTime(item.to)}</span>
            <span className={css.cardFacts}><StatusBadge name={item.status} /></span>
          </button>
        </li>)}</ul>
      </DetailSection> : null}
      {stats.returnsDueTodayList.length ? <DetailSection title="Возврат сегодня">
        <ul className={css.cards} data-keep-cards>{stats.returnsDueTodayList.slice(0, 5).map(item => <li key={item.id}>
          <button type="button" className={css.card} onClick={() => props.onNavigate?.(props.kit.bookingScreenId, item.id)}>
            <span className={`${css.subject} ${css.deviceWrap}`}>{item.title || item.number}</span>
            <span className={css.number}>{item.clientName} · {formatProkatDateTime(item.to)}</span>
            <span className={css.cardFacts}><StatusBadge name={item.status} /></span>
          </button>
        </li>)}</ul>
      </DetailSection> : null}
      {stats.topItems.length ? <DetailSection title="Топ предметов">
        <ul className={css.cards} data-keep-cards>{stats.topItems.map(item => <li key={item.id} className={css.card}>
          <span className={css.subject}>{item.name}</span>
          <span className={css.quiet}>{item.count} брон. · {formatMoney(item.revenue)}</span>
        </li>)}</ul>
      </DetailSection> : null}
    </ListScreenShell>
  </div>
}

function BookingList(props: ScreenProps) {
  const desk = isProkatDesk(props.actor)
  const bundle = useContext(ProkatRowsContext)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ProkatBookingViewId>('all')
  const [createOpen, setCreateOpen] = useState(bundle?.open === 'create')
  useEffect(() => { if (bundle?.open === 'create') setCreateOpen(true) }, [bundle?.open])
  const all = bookingItems(props)
  const filtered = filterBookings(all, { search, view }, props.now)
  const counts = Object.fromEntries(PROKAT_BOOKING_VIEWS.map(item => [item.id, filterBookings(all, { search: '', view: item.id }, props.now).length])) as Record<ProkatBookingViewId, number>
  return <div className={css.root} data-prokat-root data-prokat-screen="bookings">
    <ListScreenShell
      title="Брони"
      meta="Выдача, возврат и заявки на прокат."
      actions={desk ? <button type="button" className={css.primary} onClick={() => setCreateOpen(true)}>Новая бронь</button> : undefined}
    >
      <div className={css.toolbar}><ShellSearchField value={search} onChange={setSearch} placeholder="Поиск по номеру, клиенту, предмету" aria-label="Поиск броней" /></div>
      <div className={css.chips} role="tablist" aria-label="Представления броней">
        {PROKAT_BOOKING_VIEWS.map(item => <button key={item.id} type="button" role="tab" className={css.chip} aria-selected={view === item.id} onClick={() => setView(item.id)}>{item.label} · {counts[item.id]}</button>)}
      </div>
      <BookingRows
        items={filtered}
        catalog={catalogItems(props)}
        now={props.now}
        onOpen={id => props.onNavigate?.(props.kit.bookingScreenId, id)}
        desk={desk}
        onStatus={(id, name) => void runStatus(props, id, statusId(props, name), () => {})}
      />
    </ListScreenShell>
    {createOpen && desk ? <CreateDialog {...props} onClose={() => setCreateOpen(false)} onDone={() => setCreateOpen(false)} /> : null}
  </div>
}

function ClientBookingList(props: ScreenProps) {
  const mineEmail = props.actor.email?.trim().toLowerCase() ?? ''
  const all = bookingItems(props).filter(item => item.clientEmail.trim().toLowerCase() === mineEmail)
  const open = all.filter(item => isOpenBooking(item.status))
  const closed = all.filter(item => !isOpenBooking(item.status))
  return <div className={css.root} data-prokat-root data-prokat-screen="client">
    <ListScreenShell title="Мои брони" meta="Заявки, выдача и срок возврата.">
      <div className={css.clientListSection}>
        <h3>Открытые · {open.length}</h3>
        <BookingRows items={open} now={props.now} onOpen={id => props.onNavigate?.(props.kit.clientBookingScreenId, id)} clientFacing />
      </div>
      {closed.length ? <div className={css.clientListSection}>
        <h3>Завершённые · {closed.length}</h3>
        <BookingRows items={closed} now={props.now} onOpen={id => props.onNavigate?.(props.kit.clientBookingScreenId, id)} clientFacing />
      </div> : null}
    </ListScreenShell>
  </div>
}

function bookingLateFeeAmount(item: ProkatListItem, catalog: readonly ProkatCatalogItem[] | undefined, now: number) {
  if (item.lateFee > 0) return item.lateFee
  if (!isOverdueReturn(item.status, item.to, now) || !catalog?.length) return 0
  const byId = new Map(catalog.map(entry => [entry.id, entry]))
  return item.itemIds.reduce((sum, id) => {
    const entry = byId.get(id)
    if (!entry) return sum
    return sum + computeLateFee({ tariff: entry.tariff, rate: entry.rate, to: item.to, now: new Date(now).toISOString() })
  }, 0)
}

function BookingRows(props: {
  items: ProkatListItem[]
  now: number
  onOpen: (id: string) => void
  desk?: boolean
  onStatus?: (id: string, status: string) => void
  keepCards?: boolean
  clientFacing?: boolean
  catalog?: readonly ProkatCatalogItem[]
}) {
  if (!props.items.length) return <div className={css.empty}><p>Броней в этом списке нет.</p></div>
  return <>
    <ul className={css.cards} data-ticket-cards data-keep-cards={props.keepCards || undefined}>{props.items.map(item => {
      const overdue = isOverdueReturn(item.status, item.to, props.now)
      return <li key={item.id} className={css.ticketCard} data-ticket-card data-client={props.clientFacing || undefined}>
        <button type="button" className={css.card} onClick={() => props.onOpen(item.id)}>
          <span className={css.ticketCardTop}>
            <span className={`${css.subject} ${css.deviceWrap}`}>{item.title || 'Без названия'}</span>
            {props.clientFacing
              ? <span className={css.cardCost}>{item.price > 0 ? formatMoney(item.price) : '—'}</span>
              : null}
          </span>
          {item.number ? <span className={css.number}>{item.number}</span> : null}
          <span className={css.cardFacts}>
            <StatusBadge name={item.status} />
            <span className={css.quiet}>{formatProkatDateTime(item.from)} → {formatProkatDateTime(item.to)}</span>
          </span>
          {overdue ? <span className={css.lateLine}>Просрочен возврат</span> : null}
          {props.clientFacing
            ? null
            : <span className={css.ticketCardLine}>
                <span className={css.quiet}>{item.clientName || 'Без клиента'}</span>
                {item.itemNames.length ? <><span className={css.quiet}>·</span><span className={css.quiet}>{item.itemNames.join(', ')}</span></> : null}
              </span>}
        </button>
        {props.desk && props.onStatus ? <div className={css.ticketCardMenu}><StatusMenu status={item.status} onPick={next => props.onStatus?.(item.id, next)} /></div> : null}
      </li>
    })}</ul>
    {!props.keepCards && !props.clientFacing ? <div className={css.tableWrap}>
      <table className={`${css.table} ${css.bookingsTable}`} data-columns={8}>
        <caption className={css.quiet}>Список броней</caption>
        <thead><tr>
          <th className={css.composeCol}>Состав</th>
          <th className={css.whoCol}>Клиент</th>
          <th className={css.stateCol}>Статус</th>
          <th className={css.whenCol}>Период</th>
          <th className={css.costCol}>Сумма</th>
          <th className={css.costCol}>Залог</th>
          <th className={css.whenCol}>Возврат до</th>
          <th className={css.actionsCol}><span className={css.srOnly}>Действия</span></th>
        </tr></thead>
        <tbody>
          {props.items.map(item => {
            const overdue = isOverdueReturn(item.status, item.to, props.now)
            const lateFee = bookingLateFeeAmount(item, props.catalog, props.now)
            return (
              <tr key={item.id}>
                <td className={css.composeCol}><button type="button" className={css.rowButton} onClick={() => props.onOpen(item.id)}>
                  <span className={`${css.subject} ${css.deviceWrap}`}>{item.title || 'Без названия'}</span>
                  {item.number ? <span className={css.number}>{item.number}</span> : null}
                </button></td>
                <td><span className={css.person}>{item.clientName || 'Без клиента'}</span></td>
                <td><StatusBadge name={item.status} /></td>
                <td><span className={css.quiet}>{formatProkatDate(item.from)} — {formatProkatDate(item.to)}</span></td>
                <td>
                  <span>{item.price > 0 ? formatMoney(item.price) : '—'}</span>
                  {overdue && lateFee > 0 ? <span className={css.lateFeeLine}>+{lateFee.toLocaleString('ru-RU')} ₽ пеня</span> : null}
                </td>
                <td>{item.deposit > 0 ? formatMoney(item.deposit) : '—'}</td>
                <td><span className={css.quiet}>{formatProkatDateTime(item.to)}</span></td>
                <td className={css.rowActions}>{props.desk && props.onStatus ? <StatusMenu status={item.status} onPick={next => props.onStatus?.(item.id, next)} /> : null}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div> : null}
  </>
}

function BookingCard(props: ScreenProps) {
  const phone = useContext(AppFrameDeviceContext) === 'phone'
  const bundle = useContext(ProkatRowsContext)
  const desk = isProkatDesk(props.actor) && props.screenId === props.kit.bookingScreenId
  const clientView = props.screenId === props.kit.clientBookingScreenId
  const booking = props.of(props.kit.bookingsTableId).find(row => row.id === props.recordId) ?? props.record
  const [dialog, setDialog] = useState<ProkatOpen>(bundle?.open ?? null)
  const [message, setMessage] = useState('')
  useEffect(() => { setDialog(bundle?.open ?? null) }, [bundle?.open])
  if (!booking) return <div className={css.root}><p className={css.quiet}>Бронь не найдена.</p></div>
  const fields = props.kit.booking
  const status = prokatStatusName(props.kit, booking.values[fields.status])
  const itemIds = idsOf(booking.values[fields.items])
  const items = catalogItems(props).filter(item => itemIds.includes(item.id))
  const clientName = textOf(booking.values[fields.clientName])
  const from = textOf(booking.values[fields.from])
  const to = textOf(booking.values[fields.to])
  const price = numberOf(booking.values[fields.price])
  const deposit = numberOf(booking.values[fields.deposit])
  const storedLateFee = numberOf(booking.values[fields.lateFee])
  const depositReturned = numberOf(booking.values[fields.depositReturned])
  const depositWithheld = numberOf(booking.values[fields.depositWithheld])
  const depositReason = textOf(booking.values[fields.depositReason])
  const overdue = isOverdueReturn(status, to, props.now)
  const computedLate = items.reduce((sum, item) => sum + computeLateFee({
    tariff: item.tariff, rate: item.rate, to, now: new Date(props.now).toISOString(),
  }), 0)
  const lateFee = storedLateFee > 0 ? storedLateFee : (overdue ? computedLate : 0)
  const lateDays = (() => {
    const toMs = Date.parse(to)
    if (!Number.isFinite(toMs) || props.now <= toMs) return 0
    return Math.max(1, Math.ceil((props.now - toMs) / 86_400_000))
  })()
  const lateRateHint = items.length === 1
    ? `${lateDays} ${items[0]!.tariff === 'За час' ? 'ч' : 'сут.'} × ${formatMoney(items[0]!.rate)}`
    : lateDays > 0 ? `${lateDays} сут. просрочки` : ''
  const transitions = desk ? staffTransitions(status) : []
  const back = clientView ? props.kit.clientListScreenId : props.kit.bookingsScreenId
  const canCancel = clientView && clientCanRequestCancel(status)
  const liveCorrespondence = Boolean(props.live) && !bundle?.sample
  const conversation = <DetailSection title="Переписка">
    <div data-prokat-thread>
      {liveCorrespondence ? (
        <Suspense fallback={<p className={css.quiet} role="status">Загружаем переписку…</p>}>
          <CorrespondenceModule
            slug={props.app.slug}
            tableId={props.kit.bookingsTableId}
            rowId={booking.id}
            configured={Boolean(props.app.communications?.enabled)}
            business={false}
            showContext={false}
          />
        </Suspense>
      ) : <div className={css.empty} data-compact><p>Переписка появится после публикации приложения.</p></div>}
    </div>
  </DetailSection>
  return <div className={css.root} data-prokat-root data-prokat-screen={desk ? 'booking' : 'client-booking'} data-prokat-status={status} data-ticket-tight>
    <DetailCardShell
      back={{ label: desk ? 'Брони' : 'Мои брони', onClick: () => props.onNavigate?.(back) }}
      title={textOf(booking.values[fields.title]) || items.map(item => item.name).join(', ') || 'Бронь'}
      subtitle={textOf(booking.values[fields.number])}
      badge={<span className={css.badges}><StatusBadge name={status} /></span>}
      actions={desk && phone ? <div className={css.actions}>
        {status === 'Подтверждена' || status === 'Заявка' ? <button type="button" className={css.primary} onClick={() => setDialog('issue')}>Выдать</button> : null}
        {status === 'Выдано' || status === 'Просрочен возврат' ? <button type="button" className={css.primary} onClick={() => setDialog('return')}>Принять возврат</button> : null}
      </div> : undefined}
    >
      {clientView ? <>
        <ClientStepper status={status} from={from} to={to} updatedAt={booking.values[fields.updatedAt]} />
        <div className={css.pickupCard} aria-label="Срок и деньги">
          <p><strong>Период</strong><span>{formatProkatDateTime(from)} — {formatProkatDateTime(to)}</span></p>
          <p><strong>Вернуть до</strong><span>{formatProkatDateTime(to)}</span></p>
          <div className={css.moneyRow}>
            <span>Стоимость <strong>{formatMoney(price)}</strong></span>
            <span>Залог <strong>{formatMoney(deposit)}</strong></span>
            {lateFee > 0 ? <span>Штраф <strong>{formatMoney(lateFee)}</strong></span> : null}
          </div>
          {canCancel ? <button type="button" className={css.mine} onClick={() => void commit(props, { kind: 'cancel', recordId: booking.id }).then(result => setMessage(result.ok ? result.message : result.error))}>Отменить заявку</button> : null}
        </div>
        {message ? <p role="status">{message}</p> : null}
        <DetailSection title="Предметы">
          <ul className={css.cards} data-keep-cards>{items.map(item => <li key={item.id} className={css.card}>
            <span className={css.subject}>{item.name}</span>
            <span className={css.quiet}>{item.category} · {item.tariff} {formatMoney(item.rate)}</span>
          </li>)}</ul>
        </DetailSection>
        {conversation}
      </> : <div className={css.ticketCols}>
        <div className={shell.detailMainCol}>
          <DetailSection title="Предметы">
            <ul className={css.cards} data-keep-cards>{items.map(item => <li key={item.id}>
              <button type="button" className={css.card} onClick={() => props.onNavigate?.(props.kit.itemScreenId, item.id)}>
                <span className={css.subject}>{item.name}</span>
                <span className={css.quiet}>{item.serial} · {item.status}</span>
              </button>
            </li>)}</ul>
          </DetailSection>
          <DetailSection title="Акты">
            <dl className={css.facts}>
              <div><dt>Выдача</dt><dd>{textOf(booking.values[fields.issueAt]) ? `${formatProkatDateTime(booking.values[fields.issueAt])} · ${textOf(booking.values[fields.issueCondition]) || '—'}` : 'Ещё не выдано'}</dd></div>
              <div><dt>Возврат</dt><dd>{textOf(booking.values[fields.returnAt]) ? `${formatProkatDateTime(booking.values[fields.returnAt])} · ${textOf(booking.values[fields.returnCondition]) || '—'}` : 'Ещё не возвращено'}</dd></div>
            </dl>
            <div className={css.actions} style={{ marginTop: 12 }}>
              {(status === 'Подтверждена' || status === 'Заявка') ? <button type="button" className={css.primary} onClick={() => setDialog('issue')}>Акт выдачи</button> : null}
              {(status === 'Выдано' || status === 'Просрочен возврат') ? <button type="button" className={css.primary} onClick={() => setDialog('return')}>Акт возврата</button> : null}
              {status === 'Заявка' ? <button type="button" className={css.mine} onClick={() => void commit(props, { kind: 'confirm', recordId: booking.id }).then(result => setMessage(result.ok ? result.message : result.error))}>Подтвердить</button> : null}
            </div>
          </DetailSection>
          {conversation}
        </div>
        <aside className={`${shell.detailSideCol} ${css.factsCol}`}>
          <DetailSection title="Сведения">
            <dl className={css.facts} data-editable={desk || undefined}>
              <div><dt>Клиент</dt><dd>{clientName || 'Не указан'}</dd></div>
              <div>
                <dt>Статус</dt>
                <dd>{desk && transitions.length
                  ? <FactMenu
                      label="Статус"
                      value={status}
                      valueLabel={<StatusBadge name={status} />}
                      options={[{ id: status, name: status, node: <StatusBadge name={status} /> }, ...transitions.map(next => ({ id: next, name: next, node: <StatusBadge name={next} /> }))]}
                      onChange={next => void runStatus(props, booking.id, statusId(props, next), setMessage)}
                    />
                  : <StatusBadge name={status} />}
                </dd>
              </div>
              <div><dt>С</dt><dd>{formatProkatDateTime(from)}</dd></div>
              <div><dt>По</dt><dd>{formatProkatDateTime(to)}</dd></div>
              <div><dt>Стоимость</dt><dd>{formatMoney(price)}</dd></div>
              <div><dt>Залог</dt><dd>{formatMoney(deposit)}</dd></div>
              {(overdue || lateFee > 0) ? <div className={css.lateFeeBlock}>
                <dt>Штраф за просрочку</dt>
                <dd>
                  <strong>{formatMoney(lateFee || computedLate)}</strong>
                  {lateRateHint ? <span className={css.quiet}>{lateRateHint}</span> : <span className={css.quiet}>Дни просрочки × ставка тарифа</span>}
                </dd>
              </div> : null}
              {(depositWithheld > 0 || textOf(booking.values[fields.returnAt]) || overdue) ? <>
                {textOf(booking.values[fields.returnAt]) || depositWithheld > 0 || depositReturned > 0 ? <>
                  <div><dt>Залог возвращён</dt><dd>{depositReturned > 0 || textOf(booking.values[fields.returnAt]) ? formatMoneyOrZero(depositReturned) : '—'}</dd></div>
                  <div><dt>Залог удержан</dt><dd>{depositWithheld > 0 ? formatMoney(depositWithheld) : (textOf(booking.values[fields.returnAt]) ? formatMoneyOrZero(0) : 'при возврате')}</dd></div>
                </> : overdue ? <div><dt>Залог</dt><dd className={css.quiet}>Удержание уточняется при возврате</dd></div> : null}
                {depositReason ? <div><dt>Причина удержания</dt><dd>{depositReason}</dd></div> : null}
              </> : null}
              <div><dt>Обновлено</dt><dd>{formatProkatDateTime(booking.values[fields.updatedAt])}</dd></div>
            </dl>
            {message ? <p role="status">{message}</p> : null}
          </DetailSection>
        </aside>
      </div>}
    </DetailCardShell>
    {dialog === 'issue' && desk ? <IssueDialog {...props} booking={booking} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
    {dialog === 'return' && desk ? <ReturnDialog {...props} booking={booking} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
  </div>
}

function CreateDialog(props: ScreenProps & { onClose: () => void; onDone: () => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const clients = props.of(props.kit.clientsTableId)
  const items = catalogItems(props).filter(item => item.status === 'Свободен' || item.status === 'В прокате')
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [itemIds, setItemIds] = useState<string[]>([])
  const [fromDate, setFromDate] = useState('')
  const [fromTime, setFromTime] = useState('12:00')
  const [toDate, setToDate] = useState('')
  const [toTime, setToTime] = useState('18:00')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const selected = items.filter(item => itemIds.includes(item.id))
  const from = fromDate ? prokatWallInstant(fromDate, fromTime) : null
  const to = toDate ? prokatWallInstant(toDate, toTime) : null
  const price = selected.reduce((sum, item) => sum + (from && to ? computeRentalPrice({ tariff: item.tariff, rate: item.rate, from, to }) : 0), 0)
  const deposit = selected.reduce((sum, item) => sum + item.deposit, 0)
  const toggle = (id: string) => setItemIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const save = async () => {
    if (!clientId) { setError('Выберите клиента.'); return }
    if (!itemIds.length) { setError('Выберите хотя бы один предмет.'); return }
    if (!from || !to) { setError('Укажите срок аренды.'); return }
    setBusy(true)
    const result = await commit(props, {
      kind: 'create', clientId, itemIds, title: selected.map(item => item.name).join(', '), from, to, price, deposit,
    })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onDone()
  }
  return <AppDialog title="Новая бронь" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Создать бронь'}</button>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      <ProkatSelect field label="Клиент" value={clientId} options={clients.map(row => ({ id: row.id, name: textOf(row.values[props.kit.client.name]) || 'Без имени' }))} onChange={setClientId} />
      <fieldset className={css.field}><legend>Предметы</legend><div className={css.itemGrid}>{items.map(item => {
        const selected = itemIds.includes(item.id)
        return <button key={item.id} type="button" className={css.itemPick} aria-pressed={selected} onClick={() => toggle(item.id)}>
          <ItemTile item={item} />
          <span className={css.itemCheckCopy}><strong>{item.name}</strong><span className={css.quiet}>{item.category} · {formatMoney(item.rate)} / {item.tariff.toLowerCase()}</span></span>
          <span className={css.checkMark} data-on={selected || undefined}>{selected ? <ProtoIcon name="check" size={12} /> : null}</span>
        </button>
      })}</div></fieldset>
      <div className={css.field}><span>С</span><div className={css.deadlineRow}><DateMenu value={fromDate} onValue={setFromDate} label="Дата начала" /><TimeMenu value={fromTime} onValue={setFromTime} label="Время начала" /></div></div>
      <div className={css.field}><span>По</span><div className={css.deadlineRow}><DateMenu value={toDate} onValue={setToDate} label="Дата окончания" /><TimeMenu value={toTime} onValue={setToTime} label="Время окончания" /></div></div>
      <p className={css.moneyRow}>Стоимость <strong>{formatMoney(price)}</strong> · Залог <strong>{formatMoney(deposit)}</strong></p>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function IssueDialog(props: ScreenProps & { booking: AppV2Record; onClose: () => void; onMessage: (value: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const [condition, setCondition] = useState(textOf(props.booking.values[props.kit.booking.issueCondition]) || 'Исправен')
  const [damages, setDamages] = useState(textOf(props.booking.values[props.kit.booking.issueDamages]))
  const [photos, setPhotos] = useState(photosFromJson(props.booking.values[props.kit.booking.issuePhotos]))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!condition.trim()) { setError('Опишите состояние при выдаче.'); return }
    setBusy(true)
    const result = await commit(props, { kind: 'issue', recordId: props.booking.id, condition, damages, photos: photosToJson(photos) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Акт выдачи" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Выдать'}</button>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      <label className={css.field}><span>Состояние при выдаче</span><textarea value={condition} onChange={event => setCondition(event.target.value)} maxLength={4000} required /></label>
      <label className={css.field}><span>Повреждения</span><textarea value={damages} onChange={event => setDamages(event.target.value)} maxLength={4000} /></label>
      <label className={css.field}><span>Фото (ссылки или заметки, по строке)</span><textarea value={photos} onChange={event => setPhotos(event.target.value)} maxLength={8000} rows={3} /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function ReturnDialog(props: ScreenProps & { booking: AppV2Record; onClose: () => void; onMessage: (value: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const fields = props.kit.booking
  const deposit = numberOf(props.booking.values[fields.deposit])
  const itemIds = idsOf(props.booking.values[fields.items])
  const items = catalogItems(props).filter(item => itemIds.includes(item.id))
  const storedLate = numberOf(props.booking.values[fields.lateFee])
  const suggestedLate = storedLate > 0 ? storedLate : items.reduce((sum, item) => sum + computeLateFee({
    tariff: item.tariff, rate: item.rate, to: textOf(props.booking.values[fields.to]), now: new Date(props.now).toISOString(),
  }), 0)
  const [condition, setCondition] = useState(textOf(props.booking.values[fields.returnCondition]) || 'Исправен')
  const [damages, setDamages] = useState(textOf(props.booking.values[fields.returnDamages]))
  const [photos, setPhotos] = useState(photosFromJson(props.booking.values[fields.returnPhotos]))
  const [lateFee, setLateFee] = useState(String(suggestedLate || ''))
  const [depositReturned, setDepositReturned] = useState(String(deposit || ''))
  const [depositWithheld, setDepositWithheld] = useState(String(numberOf(props.booking.values[fields.depositWithheld]) || '0'))
  const [depositReason, setDepositReason] = useState(textOf(props.booking.values[fields.depositReason]))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!condition.trim()) { setError('Опишите состояние при возврате.'); return }
    setBusy(true)
    const result = await commit(props, {
      kind: 'return',
      recordId: props.booking.id,
      condition,
      damages,
      photos: photosToJson(photos),
      lateFee: lateFee.trim() ? Number(lateFee.replace(/\s/g, '').replace(',', '.')) : 0,
      depositReturned: depositReturned.trim() ? Number(depositReturned.replace(/\s/g, '').replace(',', '.')) : 0,
      depositWithheld: depositWithheld.trim() ? Number(depositWithheld.replace(/\s/g, '').replace(',', '.')) : 0,
      depositReason,
    })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Акт возврата" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Принять возврат'}</button>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      <label className={css.field}><span>Состояние при возврате</span><textarea value={condition} onChange={event => setCondition(event.target.value)} maxLength={4000} required /></label>
      <label className={css.field}><span>Повреждения</span><textarea value={damages} onChange={event => setDamages(event.target.value)} maxLength={4000} /></label>
      <label className={css.field}><span>Фото (ссылки или заметки, по строке)</span><textarea value={photos} onChange={event => setPhotos(event.target.value)} maxLength={8000} rows={3} /></label>
      <label className={css.field}><span>Штраф за просрочку</span><input value={lateFee} onChange={event => setLateFee(event.target.value)} inputMode="decimal" /></label>
      <label className={css.field}><span>Залог возвращён</span><input value={depositReturned} onChange={event => setDepositReturned(event.target.value)} inputMode="decimal" /></label>
      <label className={css.field}><span>Залог удержан</span><input value={depositWithheld} onChange={event => setDepositWithheld(event.target.value)} inputMode="decimal" /></label>
      <label className={css.field}><span>Причина удержания</span><textarea value={depositReason} onChange={event => setDepositReason(event.target.value)} maxLength={2000} /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function ItemsList(props: ScreenProps) {
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const items = catalogItems(props).filter(item => {
    if (!needle) return true
    return [item.name, item.category, item.serial, item.status].join(' ').toLowerCase().includes(needle)
  })
  return <div className={css.root} data-prokat-root data-prokat-screen="items">
    <ListScreenShell title="Предметы" meta="Парк проката и статусы.">
      <div className={css.toolbar}><ShellSearchField value={search} onChange={setSearch} placeholder="Поиск предмета" aria-label="Поиск предметов" /></div>
      <ul className={css.cards} data-keep-cards>{items.map(item => (
        <li key={item.id}>
          <button type="button" className={css.card} onClick={() => props.onNavigate?.(props.kit.itemScreenId, item.id)}>
            <span className={css.subject}>{item.name}</span>
            <span className={css.number}>{item.serial} · {item.category}</span>
            <span className={css.cardFacts}>
              <StatusBadge name={item.status} />
              <span className={css.quiet}>{formatMoney(item.rate)} / {item.tariff.toLowerCase()} · залог {formatMoney(item.deposit)}</span>
            </span>
          </button>
        </li>
      ))}</ul>
    </ListScreenShell>
  </div>
}

function ItemDetail(props: ScreenProps) {
  const item = props.of(props.kit.itemsTableId).find(row => row.id === props.recordId) ?? props.record
  if (!item) return <div className={css.root}><p className={css.quiet}>Предмет не найден.</p></div>
  const fields = props.kit.item
  const catalog = catalogItems(props).find(entry => entry.id === item.id)
  const history = bookingItems(props).filter(booking => booking.itemIds.includes(item.id))
  const desk = isProkatDesk(props.actor)
  return <div className={css.root} data-prokat-root data-prokat-screen="item">
    <DetailCardShell
      back={{ label: desk ? 'Предметы' : 'Каталог', onClick: () => props.onNavigate?.(desk ? props.kit.itemsScreenId : props.kit.catalogScreenId) }}
      title={textOf(item.values[fields.name]) || 'Предмет'}
      subtitle={textOf(item.values[fields.serial])}
      badge={catalog ? <StatusBadge name={catalog.status} /> : undefined}
    >
      <DetailSection title="Параметры">
        <dl className={css.facts}>
          <div><dt>Категория</dt><dd>{catalog?.category || '—'}</dd></div>
          <div><dt>Тариф</dt><dd>{catalog ? `${formatMoney(catalog.rate)} / ${catalog.tariff.toLowerCase()}` : '—'}</dd></div>
          <div><dt>Залог</dt><dd>{formatMoney(catalog?.deposit ?? 0)}</dd></div>
          <div><dt>Состояние</dt><dd>{catalog?.condition || '—'}</dd></div>
        </dl>
      </DetailSection>
      {desk ? <DetailSection title="Брони предмета">
        <BookingRows items={history} now={props.now} onOpen={id => props.onNavigate?.(props.kit.bookingScreenId, id)} keepCards />
      </DetailSection> : null}
    </DetailCardShell>
  </div>
}

function TimelineScreen(props: ScreenProps) {
  const days = 14
  const startWall = instantToWallClock(new Date(props.now).toISOString(), PROKAT_ZONE)
  const startDate = startWall?.date ?? new Date(props.now).toISOString().slice(0, 10)
  const dayLabels: { key: string; label: string; today: boolean }[] = []
  for (let index = 0; index < days; index += 1) {
    const [year, month, day] = startDate.split('-').map(Number)
    const stamp = Date.UTC(year!, month! - 1, day! + index)
    const iso = new Date(stamp).toISOString().slice(0, 10)
    const [, mm, dd] = iso.split('-')
    dayLabels.push({ key: iso, label: `${dd}.${mm}`, today: index === 0 })
  }
  const rangeStart = Date.parse(`${dayLabels[0]!.key}T00:00:00+03:00`)
  const rangeEnd = Date.parse(`${dayLabels[days - 1]!.key}T23:59:59+03:00`)
  const span = Math.max(1, rangeEnd - rangeStart)
  const items = catalogItems(props).filter(item => item.status !== 'Списан')
  const bookings = bookingItems(props)
  return <div className={css.root} data-prokat-root data-prokat-screen="timeline">
    <ListScreenShell title="Занятость" meta="Занятость предметов на ближайшие две недели.">
      <div className={css.timelineBoard} style={{ ['--prokat-days' as string]: days }}>
        <div className={css.timelineHead}>
          <span className={css.quiet}>Предмет</span>
          <div className={css.timelineDays}>{dayLabels.map(day => <span key={day.key} className={css.timelineDay} data-today={day.today || undefined}>{day.label}</span>)}</div>
        </div>
        {items.map(item => {
          const bars = bookings.filter(booking => booking.itemIds.includes(item.id) && ['Заявка', 'Подтверждена', 'Выдано', 'Просрочен возврат'].includes(booking.status))
          return <div key={item.id} className={css.timelineRow}>
            <button type="button" className={css.timelineLabel} onClick={() => props.onNavigate?.(props.kit.itemScreenId, item.id)}>
              <strong>{item.name}</strong>
              <span>{item.serial}</span>
            </button>
            <div className={css.timelineTrack} aria-label={`Занятость ${item.name}`}>
              <span className={css.timelineToday} aria-hidden="true" />
              {bars.map(booking => {
                const from = Date.parse(booking.from)
                const to = Date.parse(booking.to)
                if (!Number.isFinite(from) || !Number.isFinite(to)) return null
                const overdue = isOverdueReturn(booking.status, booking.to, props.now)
                if (overdue) {
                  const leftMs = Math.max(from, rangeStart)
                  const rightMs = Math.min(props.now, rangeEnd)
                  if (rightMs <= rangeStart || leftMs >= rangeEnd) return null
                  const left = Math.max(0, Math.min(100, ((leftMs - rangeStart) / span) * 100))
                  const right = Math.max(0, Math.min(100, ((rightMs - rangeStart) / span) * 100))
                  const width = Math.max(8, right - left)
                  return <button
                    key={booking.id}
                    type="button"
                    className={css.timelineBar}
                    data-tone="overdue"
                    style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                    title={`${booking.number} · просрочен · до ${formatProkatDateTime(booking.to)}`}
                    onClick={() => props.onNavigate?.(props.kit.bookingScreenId, booking.id)}
                  ><span>{booking.number || booking.clientName} · просрочен</span></button>
                }
                const left = Math.max(0, Math.min(100, ((from - rangeStart) / span) * 100))
                const right = Math.max(0, Math.min(100, ((to - rangeStart) / span) * 100))
                const width = Math.max(8, right - left)
                const tone = booking.status === 'Заявка' ? 'request' : booking.status === 'Выдано' ? 'issued' : 'confirmed'
                return <button
                  key={booking.id}
                  type="button"
                  className={css.timelineBar}
                  data-tone={tone}
                  style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                  title={`${booking.number} · ${formatProkatDateTime(booking.from)} — ${formatProkatDateTime(booking.to)}`}
                  onClick={() => props.onNavigate?.(props.kit.bookingScreenId, booking.id)}
                ><span>{booking.number || booking.clientName}</span></button>
              })}
            </div>
          </div>
        })}
      </div>
    </ListScreenShell>
  </div>
}

function ClientDirectory(props: ScreenProps) {
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const clients = props.of(props.kit.clientsTableId).filter(row => {
    if (!needle) return true
    return [textOf(row.values[props.kit.client.name]), textOf(row.values[props.kit.client.email]), textOf(row.values[props.kit.client.phone])].join(' ').toLowerCase().includes(needle)
  })
  return <div className={css.root} data-prokat-root data-prokat-screen="clients">
    <ListScreenShell title="Клиенты" meta="Кто брал оборудование в прокат.">
      <div className={css.toolbar}><ShellSearchField value={search} onChange={setSearch} placeholder="Поиск клиента" aria-label="Поиск клиентов" /></div>
      <ul className={css.cards} data-keep-cards>{clients.map(row => {
        const email = textOf(row.values[props.kit.client.email])
        const count = bookingItems(props).filter(item => item.clientEmail.toLowerCase() === email.toLowerCase()).length
        return <li key={row.id}>
          <button type="button" className={css.card} onClick={() => props.onNavigate?.(props.kit.clientScreenId, row.id)}>
            <span className={css.mark}><PersonMark name={textOf(row.values[props.kit.client.name])} /><strong>{textOf(row.values[props.kit.client.name]) || 'Без имени'}</strong></span>
            <span className={css.number}>{email} · {textOf(row.values[props.kit.client.phone])}</span>
            <span className={css.quiet}>{count} {count === 1 ? 'бронь' : 'брони'}</span>
          </button>
        </li>
      })}</ul>
    </ListScreenShell>
  </div>
}

function ClientDetail(props: ScreenProps) {
  const client = props.of(props.kit.clientsTableId).find(row => row.id === props.recordId) ?? props.record
  if (!client) return <div className={css.root}><p className={css.quiet}>Клиент не найден.</p></div>
  const email = textOf(client.values[props.kit.client.email]).toLowerCase()
  const history = bookingItems(props).filter(item => item.clientEmail.toLowerCase() === email)
  return <div className={css.root} data-prokat-root data-prokat-screen="client-card">
    <DetailCardShell
      back={{ label: 'Клиенты', onClick: () => props.onNavigate?.(props.kit.clientsScreenId) }}
      title={textOf(client.values[props.kit.client.name]) || 'Клиент'}
      subtitle={textOf(client.values[props.kit.client.email])}
    >
      <DetailSection title="Контакты">
        <dl className={css.facts}>
          <div><dt>Телефон</dt><dd>{textOf(client.values[props.kit.client.phone]) || '—'}</dd></div>
          <div><dt>Заметка</dt><dd>{textOf(client.values[props.kit.client.note]) || '—'}</dd></div>
        </dl>
      </DetailSection>
      <DetailSection title="История броней">
        <BookingRows items={history} now={props.now} onOpen={id => props.onNavigate?.(props.kit.bookingScreenId, id)} keepCards />
      </DetailSection>
    </DetailCardShell>
  </div>
}

function CatalogScreen(props: ScreenProps) {
  const client = !isProkatDesk(props.actor) && props.actor.roleIds.includes('client')
  const bundle = useContext(ProkatRowsContext)
  const [requestOpen, setRequestOpen] = useState(bundle?.open === 'request')
  const [selectedId, setSelectedId] = useState('')
  const [category, setCategory] = useState('Все')
  useEffect(() => { if (bundle?.open === 'request') setRequestOpen(true) }, [bundle?.open])
  const all = catalogItems(props).filter(item => item.status === 'Свободен' || item.status === 'В прокате')
  const categories = ['Все', ...[...new Set(all.map(item => item.category))].sort((a, b) => a.localeCompare(b, 'ru'))]
  const items = category === 'Все' ? all : all.filter(item => item.category === category)
  const openRequest = (itemId = '') => { setSelectedId(itemId); setRequestOpen(true) }
  return <div className={css.root} data-prokat-root data-prokat-screen="catalog">
    <ListScreenShell
      title="Каталог"
      meta="Доступные предметы и предварительный расчёт."
      actions={client ? <button type="button" className={css.primary} onClick={() => openRequest()}>Заявка</button> : undefined}
    >
      <div className={css.chips} role="tablist" aria-label="Категории каталога">
        {categories.map(name => (
          <button key={name} type="button" role="tab" className={css.chip} aria-selected={category === name} onClick={() => setCategory(name)}>{name}</button>
        ))}
      </div>
      <ul className={css.catalogGrid}>{items.map(item => (
        <li key={item.id}>
          <div className={css.catalogCard}>
            <button
              type="button"
              className={css.catalogCardBody}
              onClick={() => {
                if (client) { openRequest(item.id); return }
                props.onNavigate?.(props.kit.itemScreenId, item.id)
              }}
            >
              <ItemTile item={item} size={48} />
              <span className={css.catalogCardCopy}>
                <strong>{item.name}</strong>
                <span className={css.quiet}>{item.tariff} · {formatMoney(item.rate)}</span>
                <span className={css.quiet}>Залог {formatMoney(item.deposit)}</span>
                <StatusBadge name={item.status} />
              </span>
            </button>
            {client ? <button type="button" className={css.catalogBook} onClick={() => openRequest(item.id)}>Забронировать</button> : null}
          </div>
        </li>
      ))}</ul>
    </ListScreenShell>
    {requestOpen && client ? <RequestDialog {...props} initialItemId={selectedId} onClose={() => setRequestOpen(false)} onDone={() => setRequestOpen(false)} /> : null}
  </div>
}

function RequestDialog(props: ScreenProps & { initialItemId?: string; onClose: () => void; onDone: () => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const items = catalogItems(props).filter(item => item.status === 'Свободен' || item.status === 'В прокате')
  const spans = bookingSpansFromRows(props.kit, props.rows)
  const [itemIds, setItemIds] = useState<string[]>(props.initialItemId ? [props.initialItemId] : [])
  const [fromDate, setFromDate] = useState('')
  const [fromTime, setFromTime] = useState('12:00')
  const [toDate, setToDate] = useState('')
  const [toTime, setToTime] = useState('18:00')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (props.initialItemId) setItemIds([props.initialItemId]) }, [props.initialItemId])
  const selected = items.filter(item => itemIds.includes(item.id))
  const from = fromDate ? prokatWallInstant(fromDate, fromTime) : null
  const to = toDate ? prokatWallInstant(toDate, toTime) : null
  const datesReady = Boolean(from && to)
  const price = selected.reduce((sum, item) => sum + (from && to ? computeRentalPrice({ tariff: item.tariff, rate: item.rate, from, to }) : 0), 0)
  const deposit = selected.reduce((sum, item) => sum + item.deposit, 0)
  const toggle = (id: string) => setItemIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const save = async () => {
    if (!from || !to) { setError('Укажите срок аренды.'); return }
    if (!itemIds.length) { setError('Выберите хотя бы один предмет.'); return }
    setBusy(true)
    const result = await commit(props, {
      kind: 'clientRequest',
      itemIds,
      title: selected.map(item => item.name).join(', '),
      from,
      to,
      price,
      deposit,
      clientName: props.actor.name?.trim() || '',
    })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onDone()
  }
  return <AppDialog title="Заявка на прокат" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Отправляем…' : 'Отправить заявку'}</button>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      <div className={css.field}><span>С</span><div className={css.deadlineRow}><DateMenu value={fromDate} onValue={setFromDate} label="Дата начала" /><TimeMenu value={fromTime} onValue={setFromTime} label="Время начала" /></div></div>
      <div className={css.field}><span>По</span><div className={css.deadlineRow}><DateMenu value={toDate} onValue={setToDate} label="Дата окончания" /><TimeMenu value={toTime} onValue={setToTime} label="Время окончания" /></div></div>
      <fieldset className={css.field}>
        <legend>Предметы</legend>
        {!datesReady
          ? <p className={css.quietHint}>Сначала выберите даты</p>
          : <div className={css.itemGrid}>{items.map(item => {
            const busyUntil = from && to ? itemBusyUntil(spans, item.id, from, to) : null
            const unavailable = Boolean(busyUntil)
            const selected = itemIds.includes(item.id)
            return <button
              key={item.id}
              type="button"
              className={css.itemPick}
              aria-pressed={selected}
              disabled={unavailable}
              onClick={() => { if (!unavailable) toggle(item.id) }}
            >
              <ItemTile item={item} />
              <span className={css.itemCheckCopy}>
                <strong>{item.name}</strong>
                <span className={css.quiet}>{formatMoney(item.rate)} / {item.tariff.toLowerCase()} · залог {formatMoney(item.deposit)}</span>
                {unavailable ? <span className={css.busyUntil}>Занят до {formatProkatDate(busyUntil)}</span> : null}
              </span>
              <span className={css.checkMark} data-on={selected || undefined}>{selected ? <ProtoIcon name="check" size={12} /> : null}</span>
            </button>
          })}</div>}
      </fieldset>
      {selected.length ? (
        <div className={css.priceSummary}>
          <ul>{selected.map(item => <li key={item.id}>{item.name}</li>)}</ul>
          <p className={css.moneyRow}>Предварительно <strong>{formatMoney(price)}</strong> · Залог <strong>{formatMoney(deposit)}</strong></p>
        </div>
      ) : <p className={css.moneyRow}>Предварительно <strong>—</strong> · Залог <strong>—</strong></p>}
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}
