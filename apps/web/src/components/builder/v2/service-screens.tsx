'use client'
import { createContext, lazy, Suspense, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import { savePublishedServiceAction } from '@/app/service-actions'
import {
  SERVICE_CLIENT_STEPS, SERVICE_PICKUP, SERVICE_REPAIR_VIEWS, filterRepairs, formatMoney, isOverdueRepair,
  parseServiceLines, serviceAuthorKind, serviceAuthorLabel, serviceClientStepIndex, serviceDashboard,
  serviceDeadlineCountdown, serviceDeadlineInstant, serviceDeadlineParts, serviceLinesTotal, staffTransitions,
  type ServiceListItem, type ServiceRepairViewId,
} from '@/lib/service-logic'
import { applyServiceChange, isServiceDesk, serviceStatusName, type ServiceChange } from '@/lib/service-persist'
import { servicePortraitUrl } from '@/lib/templates/service-portraits'
import { AppFrameDeviceContext } from './app-frame'
import { AppDialog } from './app-dialog'
import { DateMenu } from './booking-calendar'
import { DetailCardShell, DetailSection, ListScreenShell, ShellSearchField } from './layout-shell'
import shell from './layout-shell.module.css'
import { ProtoIcon } from '../prototype/icons'
import { usePublishedV2 } from './published-context'
import { useBuilderV2NodeData } from './use-data'
import type { AppV2RendererProps } from './view'
import css from './service.module.css'

const ServiceConversationShotPanel = lazy(() => import('./service-conversation-shot').then(module => ({ default: module.ServiceConversationShotPanel })))

export type ServiceOpen = 'create' | 'reply' | 'note' | 'assign' | null
export type ServiceConversationShot = {
  preview: import('@/lib/conversation-types').ConversationPage
  previewFiles?: import('@tableapp/schema').Attachment[]
  previewAlert?: import('@/components/runtime/conversation-file-ui').UploadAlertInfo | null
}
export type ServiceBundle = {
  rows: AppV2Record[]
  setRows?: (rows: AppV2Record[]) => void
  open?: ServiceOpen
  now?: number
  sample?: boolean
  conversationShot?: ServiceConversationShot | null
}
export const ServiceRowsContext = createContext<ServiceBundle | null>(null)

const PLACEHOLDER: AppV2Node = { id: 'service_placeholder', name: 'placeholder', type: 'heading', value: { kind: 'literal', value: '' }, size: 's', visibleTo: null, visibleWhen: null }
const publishedHolder: { current: ReturnType<typeof usePublishedV2> } = { current: null }
const textOf = (value: unknown) => Array.isArray(value) ? '' : value == null ? '' : String(value)
const firstId = (value: unknown) => Array.isArray(value) ? value.find((item): item is string => typeof item === 'string') ?? '' : ''
const numberOf = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0

function ChoiceRow({ label, value, options, onChange }: { label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void }) {
  return <fieldset className={css.field}><legend>{label}</legend><div className={css.choiceRow} role="radiogroup" aria-label={label}>{options.map(option => <button key={option.id || option.name} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)}>{option.name}</button>)}</div></fieldset>
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
  if (name === 'Новые' || name === 'Новый') return 'fresh'
  if (name === 'В работе') return 'progress'
  if (name === 'Ждём запчасти') return 'waiting'
  if (name === 'Готово к выдаче') return 'resolved'
  if (name === 'Выдано') return 'closed'
  if (name === 'Отменён' || name === 'Просрочено') return 'overdue'
  if (name === 'На согласовании') return 'waiting'
  if (name === 'Согласовано') return 'resolved'
  return 'normal'
}

/** Singular label on chips; filter tabs keep the plural «Новые». */
function statusChipLabel(name: string) {
  return name === 'Новые' ? 'Новый' : name
}

function StatusBadge({ name }: { name: string }) {
  if (!name) return null
  return <span className={css.badge} data-kind="status" data-tone={statusTone(name)}>{statusChipLabel(name)}</span>
}

function formatDay(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const wall = instantToWallClock(value, 'Europe/Moscow')
  if (!wall) return ''
  const [, month, day] = wall.date.split('-')
  return `${day}.${month}`
}

function DeadlineBadge({ status, deadline, now, compact = false }: { status: string; deadline: unknown; now: number; compact?: boolean }) {
  const countdown = serviceDeadlineCountdown(status, deadline, now)
  if (!countdown.known || !countdown.label) return null
  return <span className={css.slaBadge} data-tone={countdown.tone} data-compact={compact || undefined} data-sla-badge title={countdown.label}>
    {compact ? countdown.shortLabel : countdown.label}
  </span>
}

function formatWhen(value: unknown, empty = 'Срок не задан') {
  if (typeof value !== 'string' || !value) return empty
  const wall = instantToWallClock(value, 'Europe/Moscow')
  if (!wall) return empty
  const [year, month, day] = wall.date.split('-')
  return wall.time ? `${day}.${month}.${year}, ${wall.time}` : `${day}.${month}.${year}`
}

function PersonMark({ name, photo, size = 28 }: { name: string; photo?: string; size?: number }) {
  const url = photo || servicePortraitUrl(name) || undefined
  const icon = size <= 24 ? 12 : 14
  return <span className={css.avatar} data-size={size <= 24 ? 'sm' : 'md'} aria-hidden="true" title={name || undefined}>
    {url ? <img src={url} alt="" width={size} height={size} /> : <ProtoIcon name="user" size={icon} />}
  </span>
}

function choiceLabel(props: ScreenProps, fieldId: string | undefined, raw: unknown) {
  if (!fieldId) return textOf(raw)
  const field = props.tables.find(table => table.id === props.kit.repairsTableId)?.fields.find(item => item.id === fieldId)
  const id = textOf(raw)
  const match = field?.choices?.find(choice => choice.id === id || choice.name === id)
  return match?.name || id
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

function ServiceSelect(props: { label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void; emptyLabel?: string; field?: boolean }) {
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

function useServiceNow(demoNow: number | undefined, asOf: number | undefined) {
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

export function ServiceScreen(props: AppV2RendererProps) {
  const kit = props.app.service
  const demo = useContext(ServiceRowsContext)
  const published = usePublishedV2()
  const now = useServiceNow(demo?.now, published?.asOf)
  publishedHolder.current = published
  const screenId = props.screenId
  const recordId = props.record?.id
  const live = Boolean(props.live) && !demo
  const scope = { screenId, ...(recordId ? { recordId } : {}) }
  const node = (tableId: string) => kit ? collectionOn(props.app, screenId, tableId) : null
  const repairsNode = node(kit?.repairsTableId ?? '')
  const repliesNode = node(kit?.repliesTableId ?? '')
  const notesNode = node(kit?.notesTableId ?? '')
  const clientsNode = node(kit?.clientsTableId ?? '')
  const mastersNode = node(kit?.mastersTableId ?? '')
  const repairsPage = useBuilderV2NodeData(props.app, repairsNode ?? PLACEHOLDER, live && Boolean(repairsNode), '', scope)
  const repliesPage = useBuilderV2NodeData(props.app, repliesNode ?? PLACEHOLDER, live && Boolean(repliesNode), '', scope)
  const notesPage = useBuilderV2NodeData(props.app, notesNode ?? PLACEHOLDER, live && Boolean(notesNode), '', scope)
  const clientsPage = useBuilderV2NodeData(props.app, clientsNode ?? PLACEHOLDER, live && Boolean(clientsNode), '', scope)
  const mastersPage = useBuilderV2NodeData(props.app, mastersNode ?? PLACEHOLDER, live && Boolean(mastersNode), '', scope)
  const screens = kit ? [kit.dashboardScreenId, kit.repairsScreenId, kit.repairScreenId, kit.clientsScreenId, kit.clientScreenId, kit.mastersScreenId, kit.clientListScreenId, kit.clientRepairScreenId] : []
  if (!kit || !screens.includes(screenId)) return null
  const pages = [repairsPage, repliesPage, notesPage, clientsPage, mastersPage]
  const rows = demo?.rows ?? pages.flatMap(page => page.page?.rows ?? [])
  const of = (tableId: string) => rows.filter(row => row.tableId === tableId)
  const loading = !demo && pages.some(page => page.loading && !page.page)
  const error = pages.find(page => page.error)?.error ?? ''
  const reload = () => { for (const page of pages) page.reload() }
  const shared = { ...props, kit, rows, of, replace: demo?.setRows, now, loading, error, reload, recordId }
  if (screenId === kit.dashboardScreenId) return <DashboardScreen {...shared} />
  if (screenId === kit.repairsScreenId || screenId === kit.clientListScreenId) return <RepairList {...shared} />
  if (screenId === kit.repairScreenId || screenId === kit.clientRepairScreenId) return <RepairCard {...shared} />
  if (screenId === kit.clientsScreenId) return <ClientDirectory {...shared} />
  if (screenId === kit.clientScreenId) return <ClientDetail {...shared} />
  return <MastersScreen {...shared} />
}

type ScreenProps = Omit<AppV2RendererProps, 'rows'> & {
  kit: NonNullable<AppV2['service']>
  rows: AppV2Record[]
  of: (tableId: string) => AppV2Record[]
  replace?: (rows: AppV2Record[]) => void
  now: number
  loading: boolean
  error: string
  reload: () => void
  recordId?: string
}

async function commit(props: ScreenProps, change: ServiceChange) {
  const published = publishedHolder.current
  if (published && published.revision !== 'demo') {
    const result = await savePublishedServiceAction(published.slug, { revision: published.revision, screenId: props.screenId, ...change })
    if (result.ok) published.refresh(result.message)
    return result
  }
  if (!props.replace) return { ok: false as const, error: 'Опубликуйте приложение, чтобы сохранять ремонты.' }
  const result = applyServiceChange(props.app, props.actor, props.rows, change, new Date(props.now).toISOString())
  if (result.ok) props.replace(result.rows)
  return result.ok ? { ok: true as const, message: result.message } : result
}

function nameOf(props: ScreenProps, tableId: string, id: string, fieldId: string) {
  const row = props.rows.find(item => item.id === id && item.tableId === tableId)
  return row ? textOf(row.values[fieldId]) : ''
}

function repairItems(props: ScreenProps): ServiceListItem[] {
  const fields = props.kit.repair
  return props.of(props.kit.repairsTableId).map(row => {
    const masterId = firstId(row.values[fields.master])
    const masterName = masterId ? nameOf(props, props.kit.mastersTableId, masterId, props.kit.master.name) : ''
    const masterRow = masterId ? props.rows.find(item => item.id === masterId && item.tableId === props.kit.mastersTableId) : undefined
    const masterPhotoRaw = masterRow && props.kit.master.photo ? textOf(masterRow.values[props.kit.master.photo]) : ''
    return {
      id: row.id,
      number: textOf(row.values[fields.number]),
      device: textOf(row.values[fields.device]),
      serial: textOf(row.values[fields.serial]),
      problem: textOf(row.values[fields.problem]),
      clientName: textOf(row.values[fields.clientName]),
      masterName,
      masterEmail: textOf(row.values[fields.masterEmail]),
      masterPhoto: masterPhotoRaw || servicePortraitUrl(masterName) || undefined,
      status: serviceStatusName(props.kit, row.values[fields.status]) || textOf(row.values[fields.status]),
      cost: numberOf(row.values[fields.cost]),
      deadline: textOf(row.values[fields.deadline]),
      updatedAt: textOf(row.values[fields.updatedAt]),
      approval: choiceLabel(props, fields.approval, fields.approval ? row.values[fields.approval] : ''),
      partsEta: fields.partsEta ? textOf(row.values[fields.partsEta]) : '',
      lines: fields.lines ? parseServiceLines(row.values[fields.lines]) : [],
    }
  })
}

function statusId(props: ScreenProps, name: string) {
  const match = Object.entries(props.kit.statuses).find(([key]) => {
    const map: Record<string, string> = {
      fresh: 'Новые', progress: 'В работе', waitingParts: 'Ждём запчасти', ready: 'Готово к выдаче', done: 'Выдано', cancelled: 'Отменён',
    }
    return map[key] === name
  })
  return match?.[1] ?? ''
}

function DashboardScreen(props: ScreenProps) {
  const items = repairItems(props)
  const stats = serviceDashboard(items, props.now)
  const ready = items.filter(item => item.status === 'Готово к выдаче').slice(0, 5)
  const overdue = items.filter(item => isOverdueRepair(item.status, item.deadline, props.now)).slice(0, 5)
  const maxWeek = Math.max(1, ...stats.revenueByWeek.map(week => week.value))
  return <div className={css.root} data-service-root data-service-screen="dashboard">
    <ListScreenShell title="Сервисный центр" meta="Ремонты по статусам, просрочка, загрузка мастеров и выручка.">
      <fieldset className={css.statCards} aria-label="Показатели сервиса">
        <button type="button" className={css.statCard} onClick={() => props.onNavigate?.(props.kit.repairsScreenId)}><strong>{stats.open}</strong><span>Открытых</span></button>
        <button type="button" className={css.statCard} data-tone="rose" onClick={() => props.onNavigate?.(props.kit.repairsScreenId)}><strong>{stats.overdue}</strong><span>Просрочено</span></button>
        <button type="button" className={css.statCard} onClick={() => props.onNavigate?.(props.kit.repairsScreenId)}><strong>{stats.ready}</strong><span>Готово к выдаче</span></button>
        <button type="button" className={css.statCard}><strong>{formatMoney(stats.revenue)}</strong><span>Выручка по готовым</span></button>
      </fieldset>
      <div className={css.summary} role="group" aria-label="По статусам">
        <button type="button" onClick={() => props.onNavigate?.(props.kit.repairsScreenId)}><strong>{stats.fresh}</strong><span>Новые</span></button>
        <button type="button" onClick={() => props.onNavigate?.(props.kit.repairsScreenId)}><strong>{stats.progress}</strong><span>В работе</span></button>
        <button type="button" onClick={() => props.onNavigate?.(props.kit.repairsScreenId)}><strong>{stats.parts}</strong><span>Ждём запчасти</span></button>
        <button type="button" onClick={() => props.onNavigate?.(props.kit.repairsScreenId)}><strong>{stats.ready}</strong><span>Готово к выдаче</span></button>
      </div>
      <div className={css.dashGrid}>
        <DetailSection title="Загрузка мастеров">
          <ul className={css.cards} data-keep-cards>{stats.masters.map(master => (
            <li key={master.email} className={css.card}>
              <span className={css.mark}><PersonMark name={master.name} photo={master.photo} /><strong>{master.name}</strong></span>
              <span className={css.quiet}>{master.open} в работе</span>
            </li>
          ))}</ul>
        </DetailSection>
        <DetailSection title="Выручка по неделям">
          <div className={css.revBars} role="img" aria-label="Выручка по неделям">
            {stats.revenueByWeek.map(week => {
              const pct = week.value ? Math.max(10, Math.round((week.value / maxWeek) * 100)) : 0
              return <div key={week.label} className={css.revBar}>
                <strong>{week.value ? formatMoney(week.value) : '—'}</strong>
                <div className={css.revChart}>
                  <span className={css.revFill} style={{ height: `${pct}%` }} />
                </div>
                <span>{week.label}</span>
              </div>
            })}
          </div>
        </DetailSection>
      </div>
      {stats.waitingParts.length ? <DetailSection title="Ждём запчасти">
        <ul className={css.cards} data-keep-cards>{stats.waitingParts.slice(0, 4).map(item => <li key={item.id}>
          <button type="button" className={css.card} onClick={() => props.onNavigate?.(props.kit.repairScreenId, item.id)}>
            <span className={css.subject + ' ' + css.deviceWrap}>{item.device}</span>
            <span className={css.number}>{item.number} · ETA {item.partsEta ? formatWhen(item.partsEta, '—') : 'не указан'}</span>
            <span className={css.cardFacts}><StatusBadge name={item.status} /><PersonMark name={item.masterName} photo={item.masterPhoto} size={24} /></span>
          </button>
        </li>)}</ul>
      </DetailSection> : null}
      {stats.needsApproval.length ? <DetailSection title="Нужно согласование клиента">
        <ul className={css.cards} data-keep-cards>{stats.needsApproval.slice(0, 4).map(item => <li key={item.id}>
          <button type="button" className={css.card} onClick={() => props.onNavigate?.(props.kit.repairScreenId, item.id)}>
            <span className={css.subject + ' ' + css.deviceWrap}>{item.device}</span>
            <span className={css.number}>{item.number} · {formatMoney(item.cost)}</span>
            <span className={css.cardFacts}><StatusBadge name="На согласовании" /></span>
          </button>
        </li>)}</ul>
      </DetailSection> : null}
      {overdue.length ? <DetailSection title="Просроченные">
        <ul className={css.cards} data-keep-cards>{overdue.map(item => <li key={item.id}>
          <button type="button" className={css.card} onClick={() => props.onNavigate?.(props.kit.repairScreenId, item.id)}>
            <span className={css.subject + ' ' + css.deviceWrap}>{item.device}</span>
            <span className={css.number}>{item.number} · {item.clientName}</span>
            <span className={css.cardFacts}><StatusBadge name={item.status} /><DeadlineBadge status={item.status} deadline={item.deadline} now={props.now} compact /></span>
          </button>
        </li>)}</ul>
      </DetailSection> : null}
      {ready.length ? <DetailSection title="Готово к выдаче">
        <ul className={css.cards} data-keep-cards>{ready.map(item => <li key={item.id}>
          <button type="button" className={css.card} onClick={() => props.onNavigate?.(props.kit.repairScreenId, item.id)}>
            <span className={css.subject + ' ' + css.deviceWrap}>{item.device}</span>
            <span className={css.number}>{item.number} · {formatMoney(item.cost)}</span>
            <span className={css.cardFacts}><StatusBadge name={item.status} /><DeadlineBadge status={item.status} deadline={item.deadline} now={props.now} compact /></span>
          </button>
        </li>)}</ul>
      </DetailSection> : null}
    </ListScreenShell>
  </div>
}

function RepairList(props: ScreenProps) {
  const desk = isServiceDesk(props.actor) && props.screenId === props.kit.repairsScreenId
  const clientView = props.screenId === props.kit.clientListScreenId
  const bundle = useContext(ServiceRowsContext)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ServiceRepairViewId>('all')
  const [createOpen, setCreateOpen] = useState(bundle?.open === 'create')
  useEffect(() => { if (bundle?.open === 'create') setCreateOpen(true) }, [bundle?.open])
  const all = repairItems(props)
  const mineEmail = props.actor.email?.trim().toLowerCase() ?? ''
  const clientItems = all.filter(item => {
    const row = props.of(props.kit.repairsTableId).find(entry => entry.id === item.id)
    return row && textOf(row.values[props.kit.repair.clientEmail]).toLowerCase() === mineEmail
  })
  const filtered = clientView ? clientItems : filterRepairs(all, { search, view }, props.now)
  const open = filtered.filter(item => item.status !== 'Выдано' && item.status !== 'Отменён')
  const closed = filtered.filter(item => item.status === 'Выдано' || item.status === 'Отменён')
  const counts = Object.fromEntries(SERVICE_REPAIR_VIEWS.map(item => [item.id, filterRepairs(all, { search: '', view: item.id }, props.now).length])) as Record<ServiceRepairViewId, number>
  const openRepair = (id: string) => props.onNavigate?.(clientView ? props.kit.clientRepairScreenId : props.kit.repairScreenId, id)
  return <div className={css.root} data-service-root data-service-screen={clientView ? 'client' : 'repairs'}>
    <ListScreenShell
      title={clientView ? 'Мои ремонты' : 'Ремонты'}
      meta={clientView ? 'Статус и переписка по вашей технике.' : 'Все ремонты сервисного центра.'}
      actions={desk ? <button type="button" className={css.primary} onClick={() => setCreateOpen(true)}>Принять в ремонт</button> : undefined}
    >
      {!clientView ? <>
        <div className={css.toolbar}><ShellSearchField value={search} onChange={setSearch} placeholder="Поиск по устройству, номеру, клиенту" aria-label="Поиск ремонтов" /></div>
        <div className={css.chips} role="tablist" aria-label="Представления ремонтов">
          {SERVICE_REPAIR_VIEWS.map(item => <button key={item.id} type="button" role="tab" className={css.chip} aria-selected={view === item.id} onClick={() => setView(item.id)}>{item.label} · {counts[item.id]}</button>)}
        </div>
      </> : null}
      {clientView ? <>
        <div className={css.clientListSection}>
          <h3>Открытые · {open.length}</h3>
          <RepairRows items={open} now={props.now} onOpen={openRepair} clientFacing />
        </div>
        <div className={css.clientListSection}>
          <h3>Завершённые · {closed.length}</h3>
          <RepairRows items={closed} now={props.now} onOpen={openRepair} clientFacing />
        </div>
      </> : <RepairRows items={filtered} now={props.now} onOpen={openRepair} desk={desk} onStatus={(id, name) => void runStatus(props, id, statusId(props, name), () => {})} />}
    </ListScreenShell>
    {createOpen && desk ? <CreateDialog {...props} onClose={() => setCreateOpen(false)} onDone={() => setCreateOpen(false)} /> : null}
  </div>
}

function RepairRows(props: { items: ServiceListItem[]; now: number; onOpen: (id: string) => void; desk?: boolean; onStatus?: (id: string, status: string) => void; keepCards?: boolean; clientFacing?: boolean }) {
  if (!props.items.length) return <div className={css.empty}><p>Ремонтов в этом списке нет.</p></div>
  const showMaster = !props.clientFacing
  return <>
    <ul className={css.cards} data-ticket-cards data-keep-cards={props.keepCards || undefined}>{props.items.map(item => (
      <li key={item.id} className={css.ticketCard} data-ticket-card data-client={props.clientFacing || undefined}>
        <button type="button" className={css.card} onClick={() => props.onOpen(item.id)}>
          <span className={css.ticketCardTop}>
            <span className={`${css.subject} ${css.deviceWrap}`}>{item.device || 'Без названия'}</span>
            {props.clientFacing
              ? <span className={css.cardCost}>{item.cost > 0 ? formatMoney(item.cost) : '—'}</span>
              : showMaster && item.masterName ? <PersonMark name={item.masterName} photo={item.masterPhoto} size={28} /> : null}
          </span>
          {item.number ? <span className={css.number}>{item.number}</span> : null}
          <span className={css.cardFacts}>
            <StatusBadge name={item.status} />
            <DeadlineBadge status={item.status} deadline={item.deadline} now={props.now} compact />
            {!props.clientFacing && item.cost > 0 ? <span className={css.quiet}>{formatMoney(item.cost)}</span> : null}
          </span>
          {props.clientFacing
            ? null
            : <span className={css.ticketCardLine}>
                <span className={css.quiet}>{item.clientName || 'Без клиента'}</span>
                {item.masterName ? <><span className={css.quiet}>·</span><span className={css.quiet}>{item.masterName}</span></> : null}
              </span>}
        </button>
        {props.desk && props.onStatus ? <div className={css.ticketCardMenu}><StatusMenu status={item.status} onPick={next => props.onStatus?.(item.id, next)} /></div> : null}
      </li>
    ))}</ul>
    {!props.keepCards && !props.clientFacing ? <div className={css.tableWrap}>
      <table className={css.table} data-columns={7}>
        <caption className={css.quiet}>Список ремонтов</caption>
        <colgroup>
          <col className={css.deviceCol} />
          <col className={css.whoCol} />
          <col className={css.whoCol} />
          <col className={css.stateCol} />
          <col className={css.costCol} />
          <col className={css.whenCol} />
          <col className={css.actionsCol} />
        </colgroup>
        <thead><tr><th>Устройство</th><th>Клиент</th><th>Мастер</th><th>Статус</th><th>Стоимость</th><th>Срок</th><th><span className={css.srOnly}>Действия</span></th></tr></thead>
        <tbody>
          {props.items.map(item => (
            <tr key={item.id}>
              <td><button type="button" className={css.rowButton} onClick={() => props.onOpen(item.id)}>
                <span className={`${css.subject} ${css.deviceWrap}`}>{item.device || 'Без названия'}</span>
                {item.number ? <span className={css.number}>{item.number}</span> : null}
              </button></td>
              <td><span className={css.person}>{item.clientName || 'Без клиента'}</span></td>
              <td>{item.masterName
                ? <span className={css.personInline}><PersonMark name={item.masterName} photo={item.masterPhoto} size={24} /><span>{item.masterName}</span></span>
                : <span className={css.quiet}>Не назначен</span>}
              </td>
              <td><span className={css.cardFacts}><StatusBadge name={item.status} /><DeadlineBadge status={item.status} deadline={item.deadline} now={props.now} compact /></span></td>
              <td>{item.cost > 0 ? formatMoney(item.cost) : '—'}</td>
              <td><span className={css.quiet}>{item.deadline ? formatWhen(item.deadline, '') : '—'}</span></td>
              <td className={css.rowActions}>{props.desk && props.onStatus ? <StatusMenu status={item.status} onPick={next => props.onStatus?.(item.id, next)} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div> : null}
  </>
}

function LinesTable({ lines, approval }: { lines: ReturnType<typeof parseServiceLines>; approval?: string }) {
  if (!lines.length) return <p className={css.quiet}>Позиций сметы пока нет.</p>
  const total = serviceLinesTotal(lines)
  return <div className={css.linesWrap}>
    <table className={css.linesTable}>
      <thead><tr><th>Название</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
      <tbody>
        {lines.map((line, index) => (
          <tr key={`${line.name}-${index}`}>
            <td>{line.name}<span className={css.quiet}> · {line.kind === 'work' ? 'работа' : 'запчасть'}</span></td>
            <td>{line.qty}</td>
            <td>{formatMoney(line.price)}</td>
            <td>{formatMoney(line.qty * line.price)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><th colSpan={3}>Итого</th><th>{formatMoney(total)}</th></tr></tfoot>
    </table>
    {approval ? <p className={css.cardFacts} style={{ marginTop: 10 }}><StatusBadge name={approval} /></p> : null}
  </div>
}

function ClientStepper({ status, diagnosis, acceptedAt, updatedAt }: { status: string; diagnosis: string; acceptedAt?: unknown; updatedAt?: unknown }) {
  const active = serviceClientStepIndex(status, diagnosis)
  const dateFor = (index: number) => {
    if (index > active) return ''
    if (index === 0) return formatDay(acceptedAt) || formatDay(updatedAt)
    return formatDay(updatedAt) || formatDay(acceptedAt)
  }
  return <ol className={css.stepper} aria-label="Прогресс ремонта">
    {SERVICE_CLIENT_STEPS.map((label, index) => {
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

async function runStatus(props: ScreenProps, recordId: string, statusIdValue: string, setMessage: (value: string) => void) {
  if (!statusIdValue) return
  const result = await commit(props, { kind: 'status', recordId, statusId: statusIdValue })
  setMessage(result.ok ? result.message : result.error)
}

function RepairCard(props: ScreenProps) {
  const phone = useContext(AppFrameDeviceContext) === 'phone'
  const bundle = useContext(ServiceRowsContext)
  const desk = isServiceDesk(props.actor) && props.screenId === props.kit.repairScreenId
  const clientView = props.screenId === props.kit.clientRepairScreenId
  const repair = props.of(props.kit.repairsTableId).find(row => row.id === props.recordId) ?? props.record
  const [dialog, setDialog] = useState<ServiceOpen>(bundle?.open ?? null)
  const [message, setMessage] = useState('')
  const [approvedLocal, setApprovedLocal] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setDialog(bundle?.open ?? null) }, [bundle?.open])
  if (!repair) return <div className={css.root}><p className={css.quiet}>Ремонт не найден.</p></div>
  const fields = props.kit.repair
  const status = serviceStatusName(props.kit, repair.values[fields.status])
  const masterId = firstId(repair.values[fields.master])
  const masterName = masterId ? nameOf(props, props.kit.mastersTableId, masterId, props.kit.master.name) : ''
  const deadlineRaw = textOf(repair.values[fields.deadline])
  const deadlineParts = serviceDeadlineParts(deadlineRaw)
  const [deadlineDate, setDeadlineDate] = useState(deadlineParts.date)
  const [deadlineTime, setDeadlineTime] = useState(deadlineParts.time || '17:00')
  useEffect(() => {
    const next = serviceDeadlineParts(textOf(repair.values[fields.deadline]))
    setDeadlineDate(next.date)
    setDeadlineTime(next.time || '17:00')
  }, [repair.id, repair.values[fields.deadline], fields.deadline])
  const replies = props.of(props.kit.repliesTableId).filter(row => firstId(row.values[props.kit.reply.repair]) === repair.id)
  const notes = desk ? props.of(props.kit.notesTableId).filter(row => firstId(row.values[props.kit.note.repair]) === repair.id) : []
  const clientName = textOf(repair.values[fields.clientName])
  const clientEmail = textOf(repair.values[fields.clientEmail])
  const diagnosis = textOf(repair.values[fields.diagnosis])
  const lines = fields.lines ? parseServiceLines(repair.values[fields.lines]) : []
  const approval = choiceLabel(props, fields.approval, fields.approval ? repair.values[fields.approval] : '')
  const needsApproval = !approvedLocal && approval === 'На согласовании'
  const timeline = [...replies.map(row => {
    const author = textOf(row.values[props.kit.reply.author])
    const authorEmail = textOf(row.values[props.kit.reply.authorEmail])
    const kind = serviceAuthorKind({ author, authorEmail, clientName, clientEmail })
    return { id: row.id, at: textOf(row.values[props.kit.reply.at]), author, authorEmail, text: textOf(row.values[props.kit.reply.text]), internal: false, label: serviceAuthorLabel(kind), kind }
  }), ...notes.map(row => ({ id: row.id, at: textOf(row.values[props.kit.note.at]), author: textOf(row.values[props.kit.note.author]), authorEmail: textOf(row.values[props.kit.note.authorEmail]), text: textOf(row.values[props.kit.note.text]), internal: true, label: 'Внутренняя заметка', kind: 'staff' as const }))]
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  const transitions = desk ? staffTransitions(status) : []
  const conversationShot = bundle?.conversationShot
  const masters = props.of(props.kit.mastersTableId).filter(row => row.values[props.kit.master.active] === props.kit.activeChoiceId || row.id === masterId)
  const back = clientView ? props.kit.clientListScreenId : props.kit.repairsScreenId
  const canCompose = !(clientView && isServiceDesk(props.actor))
  const focusComposer = () => {
    if (conversationShot) {
      const form = threadRef.current?.querySelector('form')
      form?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      form?.querySelector('textarea')?.focus()
      return
    }
    setDialog('reply')
  }
  const saveAssign = async (patch: { masterId?: string | null; statusId?: string; deadline?: string | null; diagnosis?: string; work?: string; parts?: string; cost?: number | null }) => {
    const result = await commit(props, {
      kind: 'assign',
      recordId: repair.id,
      masterId: patch.masterId !== undefined ? patch.masterId : (masterId || null),
      statusId: patch.statusId,
      deadline: patch.deadline !== undefined ? patch.deadline : (deadlineRaw || null),
      diagnosis: patch.diagnosis,
      work: patch.work,
      parts: patch.parts,
      cost: patch.cost,
    })
    setMessage(result.ok ? result.message : result.error)
  }
  const saveDeadline = (date: string, time: string) => {
    setDeadlineDate(date)
    setDeadlineTime(time)
    if (!date) return
    void saveAssign({ deadline: serviceDeadlineInstant(date, time || '17:00') })
  }
  const conversation = <DetailSection title="Переписка">
    <div ref={threadRef} data-service-thread>
      {conversationShot ? (
        <Suspense fallback={<p className={css.quiet} role="status">Загружаем переписку…</p>}>
          <ServiceConversationShotPanel
            desk={desk}
            tableId={props.kit.repairsTableId}
            repairId={repair.id}
            shot={conversationShot}
          />
        </Suspense>
      ) : <>
        {props.error ? <p className={css.error} role="alert">{props.error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
        {!timeline.length ? <div className={css.empty} data-compact><p>Сообщений пока нет. Ответ появится в этой ленте.</p></div> : null}
        <ol className={css.timeline} aria-label="Хронология">
          {timeline.map(entry => {
            const authorKind = entry.internal ? 'note' as const : entry.kind === 'client' ? 'client' as const : 'operator' as const
            return <li key={entry.id} className={css.message} data-internal={entry.internal || undefined} data-service-note={entry.internal || undefined} data-author-kind={authorKind}>
              <header>
                <PersonMark name={entry.author} />
                <div className={css.messageHead}>
                  <strong>{entry.author || 'Без имени'}</strong>
                  <span className={css.quiet}>{formatWhen(entry.at, 'Время не указано')}</span>
                  {entry.internal
                    ? <span className={css.noteFlag}><ProtoIcon name="lock" size={12} />Внутренняя заметка</span>
                    : <span className={css.quiet}>{entry.label}</span>}
                </div>
              </header>
              <p>{entry.text}</p>
            </li>
          })}
        </ol>
        {canCompose ? <div className={css.composerFooter}>
          <button type="button" className={css.primary} onClick={() => setDialog('reply')}>Ответить</button>
          {desk ? <button type="button" className={css.mine} onClick={() => setDialog('note')}>Заметка</button> : null}
        </div> : null}
      </>}
    </div>
  </DetailSection>
  return <div className={css.root} data-service-root data-service-screen={desk ? 'repair' : 'client-repair'} data-service-status={status} data-ticket-tight>
    <DetailCardShell
      back={{ label: desk ? 'Ремонты' : 'Мои ремонты', onClick: () => props.onNavigate?.(back) }}
      title={textOf(repair.values[fields.device]) || 'Без устройства'}
      subtitle={textOf(repair.values[fields.number])}
      badge={<span className={css.badges}>
        <StatusBadge name={status} />
        <DeadlineBadge status={status} deadline={deadlineRaw} now={props.now} />
      </span>}
      actions={canCompose && phone && desk ? <div className={css.actions}>
        <button type="button" className={css.primary} onClick={focusComposer}>Ответить</button>
      </div> : undefined}
    >
      {clientView ? <>
        <ClientStepper
          status={status}
          diagnosis={diagnosis}
          acceptedAt={fields.acceptedAt ? repair.values[fields.acceptedAt] : undefined}
          updatedAt={repair.values[fields.updatedAt]}
        />
        <div className={css.pickupCard} aria-label="Выдача">
          <p><strong>Ожидаемая готовность</strong><span>{formatWhen(deadlineRaw, 'Уточним в переписке')}</span></p>
          <p><strong>Смета</strong><span>{formatMoney(numberOf(repair.values[fields.cost]))}{approval ? ` · ${approval}` : ''}</span></p>
          {needsApproval ? <button type="button" className={css.primary} onClick={() => { setApprovedLocal(true); setMessage('Смету согласовали. Мастер продолжит ремонт.') }}>Согласовать стоимость</button> : null}
          <div className={css.pickupPlace} aria-label="Где забрать">
            <strong>Где забрать</strong>
            <p><ProtoIcon name="mapPin" size={16} /><span>{SERVICE_PICKUP.address}</span></p>
            <p><ProtoIcon name="clock" size={16} /><span>{SERVICE_PICKUP.hours}</span></p>
            <p><ProtoIcon name="call" size={16} /><span>{SERVICE_PICKUP.phone}</span></p>
          </div>
        </div>
        {message ? <p role="status">{message}</p> : null}
        <DetailSection title="Неисправность"><p className={css.description}>{textOf(repair.values[fields.problem]) || 'Описания нет.'}</p></DetailSection>
        {diagnosis ? <DetailSection title="Диагностика"><p className={css.description}>{diagnosis}</p></DetailSection> : null}
        {lines.length ? <DetailSection title="Работы и запчасти"><LinesTable lines={lines} approval={approvedLocal ? 'Согласовано' : approval} /></DetailSection> : null}
        {conversation}
      </> : <div className={css.ticketCols}>
        <div className={shell.detailMainCol}>
          <DetailSection title="Неисправность"><p className={css.description}>{textOf(repair.values[fields.problem]) || 'Описания нет.'}</p></DetailSection>
          {diagnosis ? <DetailSection title="Диагностика"><p className={css.description}>{diagnosis}</p></DetailSection> : null}
          <DetailSection title="Работы и запчасти"><LinesTable lines={lines} approval={approval} /></DetailSection>
          {conversation}
        </div>
        <aside className={`${shell.detailSideCol} ${css.factsCol}`}>
          <DetailSection title="Сведения">
            <dl className={css.facts} data-editable={desk || undefined}>
              <div><dt>Клиент</dt><dd>{clientName || 'Не указан'}</dd></div>
              <div><dt>Серийный / IMEI</dt><dd>{textOf(repair.values[fields.serial]) || '—'}</dd></div>
              <div>
                <dt>Статус</dt>
                <dd>{desk && transitions.length
                  ? <FactMenu
                      label="Статус"
                      value={status}
                      valueLabel={<StatusBadge name={status} />}
                      options={[{ id: status, name: status, node: <StatusBadge name={status} /> }, ...transitions.map(next => ({ id: next, name: next, node: <StatusBadge name={next} /> }))]}
                      onChange={next => void runStatus(props, repair.id, statusId(props, next), setMessage)}
                    />
                  : <StatusBadge name={status} />}
                </dd>
              </div>
              <div>
                <dt>Мастер</dt>
                <dd>{desk
                  ? <FactMenu
                      label="Мастер"
                      value={masterId}
                      valueLabel={masterName ? <span className={css.personInline}><PersonMark name={masterName} /><span>{masterName}</span></span> : 'Не назначен'}
                      options={[{ id: '', name: 'Не назначен' }, ...masters.map(row => ({ id: row.id, name: textOf(row.values[props.kit.master.name]) || 'Без имени', node: <span className={css.personInline}><PersonMark name={textOf(row.values[props.kit.master.name])} /><span>{textOf(row.values[props.kit.master.name]) || 'Без имени'}</span></span> }))]}
                      onChange={id => void saveAssign({ masterId: id || null })}
                    />
                  : masterName ? <span className={css.personInline}><PersonMark name={masterName} /><span>{masterName}</span></span> : 'Не назначен'}
                </dd>
              </div>
              <div>
                <dt>Срок</dt>
                <dd>{desk
                  ? <div className={css.deadlineRow}>
                      <DateMenu value={deadlineDate} onValue={value => saveDeadline(value, deadlineTime)} label="Дата срока" />
                      <TimeMenu value={deadlineTime} onValue={value => saveDeadline(deadlineDate, value)} label="Время срока" />
                    </div>
                  : formatWhen(deadlineRaw, 'Не указан')}
                </dd>
              </div>
              <div><dt>Стоимость</dt><dd>{formatMoney(numberOf(repair.values[fields.cost]))}</dd></div>
              {approval ? <div><dt>Согласование</dt><dd><StatusBadge name={approval} /></dd></div> : null}
              <div><dt>Обновлено</dt><dd>{formatWhen(repair.values[fields.updatedAt], '—')}</dd></div>
            </dl>
            {message ? <p role="status">{message}</p> : null}
          </DetailSection>
        </aside>
      </div>}
    </DetailCardShell>
    {dialog === 'reply' && canCompose ? <ReplyDialog {...props} repairId={repair.id} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
    {dialog === 'note' && desk ? <NoteDialog {...props} repairId={repair.id} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
    {dialog === 'assign' && desk ? <AssignDialog {...props} repair={repair} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
  </div>
}

function CreateDialog(props: ScreenProps & { onClose: () => void; onDone: () => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const clients = props.of(props.kit.clientsTableId)
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [device, setDevice] = useState('')
  const [serial, setSerial] = useState('')
  const [problem, setProblem] = useState('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [deadlineTime, setDeadlineTime] = useState('18:00')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!clientId) { setError('Выберите клиента.'); return }
    if (!device.trim() || !problem.trim()) { setError('Укажите устройство и неисправность.'); return }
    setBusy(true)
    const deadline = deadlineDate ? serviceDeadlineInstant(deadlineDate, deadlineTime) : null
    const result = await commit(props, { kind: 'create', clientId, device, serial, problem, deadline })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onDone()
  }
  return <AppDialog title="Новый ремонт" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Принять в ремонт'}</button>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      <ServiceSelect field label="Клиент" value={clientId} options={clients.map(row => ({ id: row.id, name: textOf(row.values[props.kit.client.name]) || 'Без имени' }))} onChange={setClientId} />
      <label className={css.field}><span>Устройство</span><input value={device} onChange={event => setDevice(event.target.value)} maxLength={200} required /></label>
      <label className={css.field}><span>Серийный / IMEI</span><input value={serial} onChange={event => setSerial(event.target.value)} maxLength={120} /></label>
      <label className={css.field}><span>Неисправность</span><textarea value={problem} onChange={event => setProblem(event.target.value)} maxLength={4000} required /></label>
      <div className={css.field}><span>Срок</span><div className={css.deadlineRow}><DateMenu value={deadlineDate} onValue={setDeadlineDate} label="Дата срока" /><TimeMenu value={deadlineTime} onValue={setDeadlineTime} label="Время срока" /></div></div>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function ReplyDialog(props: ScreenProps & { repairId: string; onClose: () => void; onMessage: (value: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!text.trim()) { setError('Напишите ответ.'); return }
    setBusy(true)
    const result = await commit(props, { kind: 'reply', recordId: props.repairId, text })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Ответ" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Ответить'}</button>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      <label className={css.field}><span>Сообщение</span><textarea value={text} onChange={event => setText(event.target.value)} maxLength={4000} required /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function NoteDialog(props: ScreenProps & { repairId: string; onClose: () => void; onMessage: (value: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!text.trim()) { setError('Напишите заметку.'); return }
    setBusy(true)
    const result = await commit(props, { kind: 'note', recordId: props.repairId, text })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Внутренняя заметка" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить заметку'}</button>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      <label className={css.field}><span>Заметка</span><textarea value={text} onChange={event => setText(event.target.value)} maxLength={4000} required /></label>
      <p className={css.quiet}>Клиент эту заметку не увидит.</p>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function AssignDialog(props: ScreenProps & { repair: AppV2Record; onClose: () => void; onMessage: (value: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const fields = props.kit.repair
  const masters = props.of(props.kit.mastersTableId).filter(row => row.values[props.kit.master.active] === props.kit.activeChoiceId)
  const [masterId, setMasterId] = useState(firstId(props.repair.values[fields.master]))
  const status = serviceStatusName(props.kit, props.repair.values[fields.status])
  const [statusName, setStatusName] = useState(status)
  const parts = serviceDeadlineParts(textOf(props.repair.values[fields.deadline]))
  const [deadlineDate, setDeadlineDate] = useState(parts.date)
  const [deadlineTime, setDeadlineTime] = useState(parts.time || '18:00')
  const [diagnosis, setDiagnosis] = useState(textOf(props.repair.values[fields.diagnosis]))
  const [work, setWork] = useState(textOf(props.repair.values[fields.work]))
  const [partsText, setPartsText] = useState(textOf(props.repair.values[fields.parts]))
  const [cost, setCost] = useState(String(numberOf(props.repair.values[fields.cost]) || ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const options = [status, ...staffTransitions(status)].filter((item, index, list) => list.indexOf(item) === index)
  const save = async () => {
    setBusy(true)
    const deadline = deadlineDate ? serviceDeadlineInstant(deadlineDate, deadlineTime) : null
    const result = await commit(props, {
      kind: 'assign',
      recordId: props.repair.id,
      masterId: masterId || null,
      statusId: statusId(props, statusName) || undefined,
      deadline,
      diagnosis,
      work,
      parts: partsText,
      cost: cost.trim() ? Number(cost.replace(/\s/g, '').replace(',', '.')) : null,
    })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Мастер и срок" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      <ServiceSelect field label="Мастер" value={masterId} emptyLabel="Не назначен" options={[{ id: '', name: 'Не назначен' }, ...masters.map(row => ({ id: row.id, name: textOf(row.values[props.kit.master.name]) || 'Без имени' }))]} onChange={setMasterId} />
      <ChoiceRow label="Статус" value={statusName} options={options.map(name => ({ id: name, name }))} onChange={value => setStatusName(value as typeof statusName)} />
      <div className={css.field}><span>Срок</span><div className={css.deadlineRow}><DateMenu value={deadlineDate} onValue={setDeadlineDate} label="Дата срока" /><TimeMenu value={deadlineTime} onValue={setDeadlineTime} label="Время срока" /></div></div>
      <label className={css.field}><span>Диагноз</span><textarea value={diagnosis} onChange={event => setDiagnosis(event.target.value)} maxLength={4000} /></label>
      <label className={css.field}><span>Работа</span><textarea value={work} onChange={event => setWork(event.target.value)} maxLength={4000} /></label>
      <label className={css.field}><span>Запчасти</span><textarea value={partsText} onChange={event => setPartsText(event.target.value)} maxLength={4000} /></label>
      <label className={css.field}><span>Стоимость</span><input value={cost} onChange={event => setCost(event.target.value)} inputMode="decimal" /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function ClientDirectory(props: ScreenProps) {
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const clients = props.of(props.kit.clientsTableId).filter(row => {
    if (!needle) return true
    return [textOf(row.values[props.kit.client.name]), textOf(row.values[props.kit.client.email]), textOf(row.values[props.kit.client.phone])].join(' ').toLowerCase().includes(needle)
  })
  return <div className={css.root} data-service-root data-service-screen="clients">
    <ListScreenShell title="Клиенты" meta="Все, кто сдавал технику в ремонт.">
      <div className={css.toolbar}><ShellSearchField value={search} onChange={setSearch} placeholder="Поиск клиента" aria-label="Поиск клиентов" /></div>
      <ul className={css.cards} data-keep-cards>{clients.map(row => {
        const email = textOf(row.values[props.kit.client.email])
        const count = props.of(props.kit.repairsTableId).filter(item => textOf(item.values[props.kit.repair.clientEmail]).toLowerCase() === email.toLowerCase()).length
        return <li key={row.id}>
          <button type="button" className={css.card} onClick={() => props.onNavigate?.(props.kit.clientScreenId, row.id)}>
            <span className={css.subject}>{textOf(row.values[props.kit.client.name]) || 'Без имени'}</span>
            <span className={css.number}>{email} · {textOf(row.values[props.kit.client.phone])}</span>
            <span className={css.quiet}>{count} {count === 1 ? 'ремонт' : 'ремонта'}</span>
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
  const items = repairItems(props).filter(item => {
    const row = props.of(props.kit.repairsTableId).find(entry => entry.id === item.id)
    return row && textOf(row.values[props.kit.repair.clientEmail]).toLowerCase() === email
  })
  return <div className={css.root} data-service-root data-service-screen="client-card">
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
      <DetailSection title="История ремонтов">
        <RepairRows items={items} now={props.now} onOpen={id => props.onNavigate?.(props.kit.repairScreenId, id)} keepCards />
      </DetailSection>
    </DetailCardShell>
  </div>
}

function MastersScreen(props: ScreenProps) {
  const masters = props.of(props.kit.mastersTableId)
  return <div className={css.root} data-service-root data-service-screen="masters">
    <ListScreenShell title="Мастера" meta="Кто принимает и ведёт ремонты.">
      <ul className={css.cards} data-keep-cards>{masters.map(row => {
        const email = textOf(row.values[props.kit.master.email]).toLowerCase()
        const open = props.of(props.kit.repairsTableId).filter(item => textOf(item.values[props.kit.repair.masterEmail]).toLowerCase() === email && serviceStatusName(props.kit, item.values[props.kit.repair.status]) !== 'Выдано' && serviceStatusName(props.kit, item.values[props.kit.repair.status]) !== 'Отменён').length
        const active = row.values[props.kit.master.active] === props.kit.activeChoiceId
        return <li key={row.id}>
          <div className={css.card}>
            <span className={css.mark}><PersonMark name={textOf(row.values[props.kit.master.name])} /><strong>{textOf(row.values[props.kit.master.name]) || 'Без имени'}</strong></span>
            <span className={css.quiet}>{textOf(row.values[props.kit.master.email])} · {textOf(row.values[props.kit.master.phone])}</span>
            <span className={css.cardFacts}>
              <StatusBadge name={active ? 'Активен' : 'Неактивен'} />
              <span className={css.quiet}>{open} в работе</span>
            </span>
          </div>
        </li>
      })}</ul>
    </ListScreenShell>
  </div>
}
