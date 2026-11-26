'use client'
import { createContext, lazy, Suspense, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import { savePublishedSupportAction } from '@/app/support-actions'
import { deadlineTime, filterTickets, isOpenStatus, isOverdue, isSupportStatus, operatorTransitions, supportAuthorKind, supportAuthorLabel, supportDeadlineInstant, supportDeadlineParts, supportFocusToFilter, supportStatusesForView, supportTicketViewId, supportTicketViewScope, SUPPORT_TICKET_VIEWS, type SupportFilter, type SupportListItem, type SupportQueueFocus, type SupportTicketViewId } from '@/lib/support-logic'
import { applySupportChange, isSupportDesk, supportStatusName, type SupportChange } from '@/lib/support-persist'
import { AppFrameDeviceContext } from './app-frame'
import { AppDialog } from './app-dialog'
import { supportQueueMatch, supportSlaCountdown, supportSlaDueAt, supportSlaNormLabel, type SupportSlaCountdown, type SupportSlaView } from '@/lib/support-sla'
import { supportPolicyFromRows } from '@/lib/support-persist'
import { SupportDashboard, SupportPerson, SupportSlaSettings, TicketStatusMenu, slaFacts, slaWhen } from './support-desk'
import { SupportSelect, TeamScreen } from './support-team'
import { DateMenu } from './booking-calendar'
import { DetailCardShell, DetailSection, ListScreenShell, ShellSearchField } from './layout-shell'
import shell from './layout-shell.module.css'
import { ProtoIcon } from '../prototype/icons'
import { usePublishedV2 } from './published-context'

const SupportConversationShotPanel = lazy(() => import('./support-conversation-shot').then(module => ({ default: module.SupportConversationShotPanel })))
const CorrespondenceModule = lazy(() => import('@/components/runtime/correspondence-module').then(module => ({ default: module.CorrespondenceModule })))
import { useBuilderV2NodeData } from './use-data'
import type { AppV2RendererProps } from './view'
import css from './support.module.css'

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

export type SupportOpen = 'create' | 'reply' | 'note' | 'assign' | 'category' | null
export type SupportConversationShot = {
  preview: import('@/lib/conversation-types').ConversationPage
  previewFiles?: import('@tableapp/schema').Attachment[]
  previewAlert?: import('@/components/runtime/conversation-file-ui').UploadAlertInfo | null
}
export type SupportBundle = {
  rows: AppV2Record[]
  setRows?: (rows: AppV2Record[]) => void
  open?: SupportOpen
  now?: number
  sample?: boolean
  queueFocus?: { current: SupportQueueFocus | null }
  previewClient?: string
  previewMenuOpen?: boolean
  previewFocus?: { current: string | null }
  /** When set (support-shot file states), TicketCard shows ConversationPanel fixtures. */
  conversationShot?: SupportConversationShot | null
}
export const SupportRowsContext = createContext<SupportBundle | null>(null)

const PLACEHOLDER: AppV2Node = { id: 'support_placeholder', name: 'placeholder', type: 'heading', value: { kind: 'literal', value: '' }, size: 's', visibleTo: null, visibleWhen: null }
const publishedHolder: { current: ReturnType<typeof usePublishedV2> } = { current: null }
const textOf = (value: unknown) => Array.isArray(value) ? '' : value == null ? '' : String(value)
const firstId = (value: unknown) => Array.isArray(value) ? value.find((item): item is string => typeof item === 'string') ?? '' : ''
const EMPTY_FILTER: SupportFilter = { search: '', statuses: [], priorities: [], ageBucket: '', assigneeEmail: '', mine: false, scope: 'open', view: 'open' }

const TICKETS_URL_PARAM = 'tickets'

function splitCsv(value: string | null) {
  return (value ?? '').split(',').map(item => item.trim()).filter(Boolean)
}

function readTicketsUrl(): Partial<SupportFilter> {
  if (typeof window === 'undefined') return {}
  const params = new URL(window.location.href).searchParams
  const view = supportTicketViewId(params.get(TICKETS_URL_PARAM))
  const assignee = params.get('assignee') ?? ''
  const ageBucket = params.get('age') ?? ''
  return {
    view,
    scope: supportTicketViewScope(view),
    assigneeEmail: assignee,
    priorities: splitCsv(params.get('priority')),
    statuses: splitCsv(params.get('status')),
    ageBucket: ageBucket === 'lt4h' || ageBucket === '4to12h' || ageBucket === '12to24h' || ageBucket === '1to3d' || ageBucket === 'gt3d' ? ageBucket : '',
    mine: false,
  }
}

function writeTicketsUrl(filter: SupportFilter) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const view = filter.view ?? 'open'
  if (view === 'open') url.searchParams.delete(TICKETS_URL_PARAM)
  else url.searchParams.set(TICKETS_URL_PARAM, view)
  if (filter.assigneeEmail) url.searchParams.set('assignee', filter.assigneeEmail)
  else url.searchParams.delete('assignee')
  if (filter.priorities.length) url.searchParams.set('priority', filter.priorities.join(','))
  else url.searchParams.delete('priority')
  if (filter.statuses.length) url.searchParams.set('status', filter.statuses.join(','))
  else url.searchParams.delete('status')
  if (filter.ageBucket) url.searchParams.set('age', filter.ageBucket)
  else url.searchParams.delete('age')
  window.history.replaceState(window.history.state, '', url)
}

function collectionOn(app: AppV2, screenId: string, tableId: string) {
  const screen = app.screens.find(item => item.id === screenId)
  for (const id of screen?.rootIds ?? []) {
    const node = app.nodes.find(item => item.id === id)
    if (node?.type !== 'collection') continue
    const source = app.sources.find(item => item.id === node.sourceId)
    if (source?.tableId === tableId) return node
  }
  return null
}

function choiceName(props: Pick<AppV2RendererProps, 'tables'>, tableId: string, fieldId: string, value: unknown) {
  const field = props.tables.find(table => table.id === tableId)?.fields.find(item => item.id === fieldId)
  return typeof value === 'string' ? field?.choices?.find(choice => choice.id === value)?.name ?? '' : ''
}

function statusTone(name: string) {
  if (name === 'Просрочено') return 'overdue'
  if (name === 'В работе') return 'progress'
  if (name === 'Ждём клиента') return 'waiting'
  if (name === 'Решено') return 'resolved'
  if (name === 'Закрыто') return 'closed'
  if (name === 'Новое') return 'fresh'
  return 'fresh'
}

function priorityTone(name: string) {
  if (name === 'Срочный') return 'urgent'
  if (name === 'Высокий') return 'high'
  if (name === 'Обычный') return 'normal'
  if (name === 'Низкий') return 'low'
  return 'normal'
}

function StatusBadge({ name }: { name: string }) {
  if (!name) return null
  return <span className={css.badge} data-kind="status" data-tone={statusTone(name)}>{name}</span>
}

function PriorityBadge({ name }: { name: string }) {
  if (!name) return null
  return <span className={css.badge} data-kind="priority" data-tone={priorityTone(name)}>{name}</span>
}

function Badge({ name }: { name: string }) {
  if (!name) return null
  if (name === 'Срочный' || name === 'Высокий' || name === 'Обычный' || name === 'Низкий') return <PriorityBadge name={name} />
  return <StatusBadge name={name} />
}

function QueueStatus({ name }: { name: string }) {
  if (!name) return null
  return <StatusBadge name={name} />
}

function QueuePriority({ name }: { name: string }) {
  if (!name) return null
  return <PriorityBadge name={name} />
}

function formatWhen(value: unknown, empty = 'Срок не задан') {
  if (typeof value !== 'string' || !value) return empty
  const wall = instantToWallClock(value, 'Europe/Moscow')
  if (!wall) return empty
  const [year, month, day] = wall.date.split('-')
  return `${day}.${month}.${year}, ${wall.time}`
}

function formatDate(value: unknown, empty = '—') {
  if (typeof value !== 'string' || !value) return empty
  const wall = instantToWallClock(value, 'Europe/Moscow')
  if (!wall) return empty
  const [year, month, day] = wall.date.split('-')
  return `${day}.${month}.${year}`
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const hours = Math.round(ms / 3_600_000)
  if (hours < 24) return `${Math.max(1, hours)} ч`
  const days = Math.round(hours / 24)
  return `${days} д`
}

function toggleInList(list: string[], value: string) {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value]
}

function useDialogBehavior(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    const field = document.querySelector<HTMLElement>('[role="dialog"] input, [role="dialog"] textarea, [role="dialog"] select')
    field?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
}

function useSupportNow(demoNow: number | undefined, asOf: number | undefined) {
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

const EMPTY_SLA: SupportSlaView = {
  known: false, priority: null, status: '', paused: false, open: false,
  first: { known: false, met: false, paused: false, overdue: false, risk: false, dueAt: null, remainingMs: null, budgetMs: null },
  resolution: { known: false, met: false, paused: false, overdue: false, risk: false, dueAt: null, remainingMs: null, budgetMs: null },
  breaches: [], firstCloses: [], resolutionCloses: [], currentOverdue: false, currentRisk: false, createdAt: null,
}

function SlaBadge({ countdown, compact = false }: { countdown: SupportSlaCountdown; compact?: boolean }) {
  if (!countdown.known || !countdown.label) return null
  const text = compact ? countdown.shortLabel || countdown.label : countdown.label
  return <span className={css.slaBadge} data-tone={countdown.tone} data-compact={compact || undefined} data-sla-badge title={countdown.label}>{text}</span>
}

function ticketSortTime(item: SupportListItem) {
  const due = item.sla?.known ? supportSlaDueAt(item.sla) : null
  if (due != null) return due
  return deadlineTime(item.deadline) ?? Number.MAX_SAFE_INTEGER
}

export function SupportScreen(props: AppV2RendererProps) {
  const kit = props.app.support
  const demo = useContext(SupportRowsContext)
  const published = usePublishedV2()
  const now = useSupportNow(demo?.now, published?.asOf)
  publishedHolder.current = published
  const screenId = props.screenId
  const recordId = props.record?.id
  const live = Boolean(props.live) && !demo
  const scope = { screenId, ...(recordId ? { recordId } : {}) }
  const node = (tableId: string) => kit ? collectionOn(props.app, screenId, tableId) : null
  const ticketsNode = node(kit?.ticketsTableId ?? '')
  const repliesNode = node(kit?.repliesTableId ?? '')
  const notesNode = node(kit?.notesTableId ?? '')
  const clientsNode = node(kit?.clientsTableId ?? '')
  const operatorsNode = node(kit?.operatorsTableId ?? '')
  const categoriesNode = node(kit?.categoriesTableId ?? '')
  const eventsNode = node(kit?.eventsTableId ?? '')
  const normsNode = node(kit?.slaTableId ?? '')
  const ticketsPage = useBuilderV2NodeData(props.app, ticketsNode ?? PLACEHOLDER, live && Boolean(ticketsNode), '', scope)
  const repliesPage = useBuilderV2NodeData(props.app, repliesNode ?? PLACEHOLDER, live && Boolean(repliesNode), '', scope)
  const notesPage = useBuilderV2NodeData(props.app, notesNode ?? PLACEHOLDER, live && Boolean(notesNode), '', scope)
  const clientsPage = useBuilderV2NodeData(props.app, clientsNode ?? PLACEHOLDER, live && Boolean(clientsNode), '', scope)
  const operatorsPage = useBuilderV2NodeData(props.app, operatorsNode ?? PLACEHOLDER, live && Boolean(operatorsNode), '', scope)
  const categoriesPage = useBuilderV2NodeData(props.app, categoriesNode ?? PLACEHOLDER, live && Boolean(categoriesNode), '', scope)
  const eventsPage = useBuilderV2NodeData(props.app, eventsNode ?? PLACEHOLDER, live && Boolean(eventsNode), '', scope)
  const normsPage = useBuilderV2NodeData(props.app, normsNode ?? PLACEHOLDER, live && Boolean(normsNode), '', scope)
  const screens = kit ? [kit.queueScreenId, kit.ticketScreenId, kit.clientListScreenId, kit.clientTicketScreenId, kit.clientsScreenId, kit.clientScreenId, kit.settingsScreenId, kit.dashboardScreenId, kit.teamScreenId].filter((id): id is string => Boolean(id)) : []
  if (!kit || !screens.includes(screenId)) return null
  const pages = [ticketsPage, repliesPage, notesPage, clientsPage, operatorsPage, categoriesPage, eventsPage, normsPage]
  const rows = demo?.rows ?? pages.flatMap(page => page.page?.rows ?? [])
  const of = (tableId: string) => rows.filter(row => row.tableId === tableId)
  const loading = !demo && pages.some(page => page.loading && !page.page)
  const error = pages.find(page => page.error)?.error ?? ''
  const reload = () => { for (const page of pages) page.reload() }
  const queueFocus = demo?.queueFocus ?? { current: null }
  const shared = { ...props, kit, rows, of, replace: demo?.setRows, now, loading, error, reload, recordId }
  const openQueue = (focus: SupportQueueFocus | import('@/lib/support-logic').SupportQueueScope) => {
    queueFocus.current = typeof focus === 'string' ? { scope: focus } : focus
    props.onNavigate?.(kit.queueScreenId)
  }
  const lineLabel = (id: string) => choiceName(props, kit.operatorsTableId, kit.operator.line ?? '', id) || choiceName(props, kit.ticketsTableId, kit.ticket.line ?? '', id)
  if (kit.dashboardScreenId && screenId === kit.dashboardScreenId) return <SupportDashboard {...shared} actorEmail={props.actor.email ?? ''} lineLabel={lineLabel} onOpenTeam={() => kit.teamScreenId && props.onNavigate?.(kit.teamScreenId)} onOpenQueue={openQueue} onOpenTicket={id => props.onNavigate?.(kit.ticketScreenId, id)} onStatus={async () => ({ ok: false })} onSaveSla={async () => ({ ok: false })} />
  if (kit.teamScreenId && screenId === kit.teamScreenId) return <TeamScreen
    app={props.app}
    kit={kit}
    tables={props.tables}
    rows={rows}
    of={of}
    now={now}
    loading={loading}
    actor={props.actor}
    onNavigate={props.onNavigate}
    onOpenQueue={openQueue}
    onSaveOperator={async change => commit(shared, { kind: 'operator', ...change })}
  />
  if (screenId === kit.queueScreenId || screenId === kit.clientListScreenId) return <TicketList {...shared} />
  if (screenId === kit.ticketScreenId || screenId === kit.clientTicketScreenId) return <TicketCard {...shared} />
  if (screenId === kit.clientsScreenId) return <ClientDirectory {...shared} />
  if (kit.clientScreenId && screenId === kit.clientScreenId) return <ClientDetail {...shared} />
  return <SettingsScreen {...shared} />
}

type ScreenProps = Omit<AppV2RendererProps, 'rows'> & {
  kit: NonNullable<AppV2['support']>
  rows: AppV2Record[]
  of: (tableId: string) => AppV2Record[]
  replace?: (rows: AppV2Record[]) => void
  now: number
  loading: boolean
  error: string
  reload: () => void
  recordId?: string
}

async function commit(props: ScreenProps, change: SupportChange) {
  const published = publishedHolder.current
  if (published && published.revision !== 'demo') {
    const result = await savePublishedSupportAction(published.slug, { revision: published.revision, screenId: props.screenId, ...change })
    if (result.ok) published.refresh(result.message)
    return result
  }
  if (!props.replace) return { ok: false as const, error: 'Опубликуйте приложение, чтобы сохранять обращения.' }
  const result = applySupportChange(props.app, props.actor, props.rows, change, new Date(props.now).toISOString())
  if (result.ok) props.replace(result.rows)
  return result.ok ? { ok: true as const, message: result.message } : result
}

function nameOf(props: ScreenProps, tableId: string, id: string, fieldId: string) {
  const row = props.rows.find(item => item.id === id && item.tableId === tableId)
  return row ? textOf(row.values[fieldId]) : ''
}

function ticketItems(props: ScreenProps): SupportListItem[] {
  const ticket = props.kit.ticket
  return props.of(props.kit.ticketsTableId).map(row => {
    const assigneeId = firstId(row.values[ticket.assignee])
    const categoryId = firstId(row.values[ticket.category])
    return {
      id: row.id,
      number: textOf(row.values[ticket.number]),
      subject: textOf(row.values[ticket.subject]),
      description: textOf(row.values[ticket.description]),
      clientName: textOf(row.values[ticket.clientName]),
      status: supportStatusName(props.kit, row.values[ticket.status]) || choiceName(props, props.kit.ticketsTableId, ticket.status, row.values[ticket.status]),
      priority: choiceName(props, props.kit.ticketsTableId, ticket.priority, row.values[ticket.priority]),
      category: nameOf(props, props.kit.categoriesTableId, categoryId, props.kit.category.name),
      assigneeEmail: textOf(row.values[ticket.assigneeEmail]),
      assigneeName: nameOf(props, props.kit.operatorsTableId, assigneeId, props.kit.operator.name),
      deadline: row.values[ticket.deadline],
      createdAt: row.values[ticket.createdAt],
      updatedAt: row.values[ticket.updatedAt],
      sla: slaFacts(props.kit, props.rows, row.id, props.now),
    }
  })
}

function ClientPreviewMenu(props: { clients: { id: string; name: string; email: string; tickets: number }[]; value: string; open: boolean; onOpen: (open: boolean) => void; onChange: (email: string) => void }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!props.open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) props.onOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') props.onOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [props.open, props])
  const selected = props.clients.find(item => item.email === props.value)
  return <div className={css.previewMenu} ref={root} data-support-preview-menu>
    <button type="button" className={css.previewTrigger} aria-expanded={props.open} aria-haspopup="listbox" onClick={() => props.onOpen(!props.open)}>
      <span>{selected ? selected.name : 'Выберите клиента'}</span>
      <ProtoIcon name="down" size={16} />
    </button>
    {props.open ? <div className={css.previewPanel} role="listbox" aria-label="Клиент для просмотра">
      {props.clients.map(client => <button key={client.id} type="button" role="option" aria-selected={client.email === props.value} onClick={() => { props.onChange(client.email); props.onOpen(false) }}>{client.name}<span className={css.quiet}>{client.tickets} {ticketsWord(client.tickets)}</span></button>)}
    </div> : null}
  </div>
}

function ticketsWord(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return 'обращение'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'обращения'
  return 'обращений'
}

function updatedAgo(value: unknown, now: number) {
  const instant = deadlineTime(value)
  if (instant == null) return 'Обновлено недавно'
  const ms = Math.max(0, now - instant)
  if (ms < 60_000) return 'Обновлено только что'
  if (ms < 3_600_000) {
    const minutes = Math.max(1, Math.round(ms / 60_000))
    return `Обновлено ${minutes} мин назад`
  }
  if (ms < 48 * 3_600_000) {
    const hours = Math.max(1, Math.round(ms / 3_600_000))
    return `Обновлено ${hours} ч назад`
  }
  const days = Math.max(2, Math.round(ms / (24 * 3_600_000)))
  const mod10 = days % 10
  const mod100 = days % 100
  const word = mod10 === 1 && mod100 !== 11 ? 'день' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'дня' : 'дней'
  return `Обновлено ${days} ${word} назад`
}

function ClientAvatar() {
  return <span className={css.avatar} data-size="md" data-client aria-hidden="true"><ProtoIcon name="user" size={16} /></span>
}

function MessageAvatar({ kind, author }: { kind: 'operator' | 'client' | 'note'; author: string }) {
  if (kind === 'client') return <ClientAvatar />
  return <SupportPerson name={author} size={28} />
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

function AssigneeFilter(props: {
  value: string
  operators: { email: string; name: string }[]
  onChange: (email: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useMenuOpen(open, root, () => setOpen(false))
  const selected = props.value === '__none__'
    ? { name: 'Не назначен', email: '__none__' }
    : props.operators.find(item => item.email === props.value)
  const label = selected?.name ?? 'Ответственный'
  return <div className={css.assigneeFilter} ref={root} data-assignee-filter>
    <button type="button" className={css.assigneeTrigger} data-active={Boolean(props.value) || undefined} aria-expanded={open} aria-haspopup="listbox" aria-label="Ответственный" onClick={() => setOpen(value => !value)}>
      {selected && selected.email !== '__none__' ? <SupportPerson name={selected.name} size={22} /> : <span className={css.avatar} data-size="sm" data-client aria-hidden="true"><ProtoIcon name="user" size={14} /></span>}
      <span>{label}</span>
      <ProtoIcon name="down" size={14} />
    </button>
    {open ? <div className={css.assigneePanel} role="listbox" aria-label="Ответственный">
      <button type="button" role="option" aria-selected={!props.value} onClick={() => { props.onChange(''); setOpen(false) }}>Все ответственные</button>
      <button type="button" role="option" aria-selected={props.value === '__none__'} onClick={() => { props.onChange('__none__'); setOpen(false) }}>
        <span className={css.avatar} data-size="sm" data-client aria-hidden="true"><ProtoIcon name="user" size={14} /></span>
        Не назначен
      </button>
      {props.operators.map(operator => <button key={operator.email} type="button" role="option" aria-selected={operator.email === props.value} onClick={() => { props.onChange(operator.email); setOpen(false) }}>
        <SupportPerson name={operator.name} size={22} />
        {operator.name}
      </button>)}
    </div> : null}
  </div>
}

function TicketViewTabs(props: {
  phone: boolean
  view: SupportTicketViewId
  counts: Record<SupportTicketViewId, number>
  onView: (view: SupportTicketViewId) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(true)
  useEffect(() => {
    const el = scroller.current
    if (!el || !props.phone) return
    const update = () => {
      setFadeLeft(el.scrollLeft > 4)
      setFadeRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(el)
    return () => { el.removeEventListener('scroll', update); ro?.disconnect() }
  }, [props.phone, props.counts])
  return <div
    className={css.viewTabsWrap}
    data-view-tabs
    data-phone={props.phone || undefined}
    data-fade-left={props.phone && fadeLeft || undefined}
    data-fade-right={props.phone && fadeRight || undefined}
  >
    <div className={css.viewTabs} ref={scroller} role="tablist" aria-label="Представления тикетов">
      {SUPPORT_TICKET_VIEWS.map(item => (
        <button key={item.id} type="button" role="tab" className={css.viewTab} aria-selected={props.view === item.id} aria-label={`${item.label}, ${props.counts[item.id] ?? 0}`} title={item.label} onClick={() => props.onView(item.id)}>
          <span>{item.label}</span>
          <em className={css.viewCount}>{props.counts[item.id] ?? 0}</em>
        </button>
      ))}
    </div>
  </div>
}

function MultiSelectFilter(props: {
  label: string
  values: string[]
  options: { id: string; name: string; tone?: string }[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useMenuOpen(open, root, () => setOpen(false))
  const count = props.values.length
  const label = count === 0 ? props.label : count === 1 ? (props.options.find(item => item.id === props.values[0])?.name ?? props.label) : `${props.label} · ${count}`
  return <div className={css.assigneeFilter} ref={root} data-multi-filter={props.label}>
    <button type="button" className={css.assigneeTrigger} data-active={count > 0 || undefined} aria-expanded={open} aria-haspopup="listbox" aria-label={props.label} onClick={() => setOpen(value => !value)}>
      <span>{label}</span>
      <ProtoIcon name="down" size={14} />
    </button>
    {open ? <div className={css.assigneePanel} role="listbox" aria-multiselectable="true" aria-label={props.label}>
      {props.options.map(option => {
        const selected = props.values.includes(option.id)
        return <button key={option.id} type="button" role="option" aria-selected={selected} data-tone={option.tone} onClick={() => props.onChange(toggleInList(props.values, option.id))}>
          <span className={css.checkMark} data-on={selected || undefined} aria-hidden="true">{selected ? <ProtoIcon name="check" size={12} /> : null}</span>
          {option.name}
        </button>
      })}
    </div> : null}
  </div>
}

function TicketList(props: ScreenProps) {
  const desk = isSupportDesk(props.actor)
  const clientCabinet = props.screenId === props.kit.clientListScreenId
  const previewMode = desk && clientCabinet
  const device = useContext(AppFrameDeviceContext)
  const bundle = useContext(SupportRowsContext)
  const focus = bundle?.queueFocus
  const [filter, setFilter] = useState<SupportFilter>(() => {
    const clientList = props.screenId === props.kit.clientListScreenId
    const next = focus?.current
    if (focus) focus.current = null
    if (clientList) return { ...EMPTY_FILTER, scope: 'all', view: undefined }
    if (next) return { ...EMPTY_FILTER, ...supportFocusToFilter(next) }
    return { ...EMPTY_FILTER, ...readTicketsUrl() }
  })
  const [open, setOpen] = useState<SupportOpen>(bundle?.open ?? null)
  const [statusError, setStatusError] = useState('')
  const allTickets = ticketItems(props)
  const clients = props.of(props.kit.clientsTableId).map(row => {
    const email = textOf(row.values[props.kit.client.email]).trim().toLowerCase()
    return {
      id: row.id,
      name: textOf(row.values[props.kit.client.name]) || 'Без имени',
      email,
      tickets: allTickets.filter(item => {
        const ticket = props.of(props.kit.ticketsTableId).find(entry => entry.id === item.id)
        return textOf(ticket?.values[props.kit.ticket.clientEmail]).trim().toLowerCase() === email
      }).length,
    }
  }).filter(item => item.email)
  const [previewEmail, setPreviewEmail] = useState(() => {
    const focused = bundle?.previewFocus?.current
    if (bundle?.previewFocus) bundle.previewFocus.current = null
    return focused ?? bundle?.previewClient ?? clients[0]?.email ?? ''
  })
  const [previewOpen, setPreviewOpen] = useState(Boolean(bundle?.previewMenuOpen))
  const [phoneFiltersOpen, setPhoneFiltersOpen] = useState(false)
  const [draftFilter, setDraftFilter] = useState<SupportFilter | null>(null)
  const items = allTickets.filter(item => {
    if (!previewMode) return true
    if (!previewEmail) return false
    const row = props.of(props.kit.ticketsTableId).find(entry => entry.id === item.id)
    return textOf(row?.values[props.kit.ticket.clientEmail]).trim().toLowerCase() === previewEmail
  })
  const queueDesk = desk && !clientCabinet
  const clientView = clientCabinet
  const view = (filter.view ?? 'open') as SupportTicketViewId
  const actorEmail = props.actor.email ?? ''
  const viewCounts = Object.fromEntries(SUPPORT_TICKET_VIEWS.map(item => {
    const count = items.filter(ticket => {
      const sla = ticket.sla
      return supportQueueMatch({
        status: ticket.status,
        assigneeEmail: ticket.assigneeEmail,
        sla: sla ?? { ...EMPTY_SLA, status: ticket.status, open: isOpenStatus(ticket.status) },
        manualOverdue: isOverdue(ticket.status, ticket.deadline, props.now),
      }, item.scope, actorEmail)
    }).length
    return [item.id, count]
  })) as Record<SupportTicketViewId, number>
  useEffect(() => {
    if (!queueDesk) return
    writeTicketsUrl(filter)
  }, [queueDesk, filter])
  const updateFilter = (patch: Partial<SupportFilter> | ((current: SupportFilter) => SupportFilter)) => {
    setFilter(current => typeof patch === 'function' ? patch(current) : { ...current, ...patch })
  }
  const setView = (next: SupportTicketViewId) => {
    updateFilter(current => {
      const allowed = supportStatusesForView(next)
      return {
        ...current,
        view: next,
        scope: supportTicketViewScope(next),
        mine: false,
        statuses: current.statuses.filter(status => allowed.includes(status)),
      }
    })
  }
  const visible = filterTickets(items, filter, actorEmail, props.now)
    .sort((a, b) => {
      if (view === 'hot') return ticketSortTime(a) - ticketSortTime(b)
      const openScore = Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status))
      if (openScore) return openScore
      return ticketSortTime(a) - ticketSortTime(b)
    })
  const openItems = clientView ? visible.filter(item => isOpenStatus(item.status)) : visible
  const doneItems = clientView ? visible.filter(item => !isOpenStatus(item.status)) : []
  const backTo = queueDesk ? props.kit.queueScreenId : props.kit.clientListScreenId
  const openTicket = (id: string) => props.onNavigate?.(queueDesk ? props.kit.ticketScreenId : props.kit.clientTicketScreenId, id)
  const operators = props.of(props.kit.operatorsTableId)
    .filter(row => row.values[props.kit.operator.active] === props.kit.activeChoiceId)
    .map(row => ({
      email: textOf(row.values[props.kit.operator.email]).trim().toLowerCase(),
      name: textOf(row.values[props.kit.operator.name]) || 'Без имени',
    }))
    .filter(item => item.email)
  const statusOptions = supportStatusesForView(view)
  const priorityOptions = ['Срочный', 'Высокий', 'Обычный', 'Низкий']
  const changeStatus = async (id: string, status: string) => {
    const result = await commit(props, { kind: 'status', recordId: id, statusId: statusId(props, status) })
    setStatusError(result.ok ? '' : result.error)
  }
  const activeFilterCount = [filter.assigneeEmail ? 1 : 0, filter.statuses.length, filter.priorities.length, filter.ageBucket ? 1 : 0].reduce((sum, n) => sum + n, 0)
  const hasActiveFilters = activeFilterCount > 0 || Boolean(filter.search.trim())
  const clearFilters = () => setFilter(current => ({ ...EMPTY_FILTER, view: current.view, scope: current.scope }))
  const openPhoneFilters = () => {
    setDraftFilter(filter)
    setPhoneFiltersOpen(true)
  }
  const applyPhoneFilters = () => {
    if (draftFilter) setFilter(draftFilter)
    setPhoneFiltersOpen(false)
    setDraftFilter(null)
  }
  const draft = draftFilter ?? filter
  const draftVisibleCount = filterTickets(items, draft, actorEmail, props.now).length
  const renderClientGroup = (title: string, list: SupportListItem[]) => list.length ? <section className={css.clientGroup} aria-label={title}>
    <h2 className={css.clientGroupTitle}>{title} ({list.length})</h2>
    <ul className={css.cards} data-client-cards>
      {list.map(item => <li key={item.id}><ClientTicketButton item={item} now={props.now} onOpen={() => openTicket(item.id)} /></li>)}
    </ul>
  </section> : null
  const activeChips = <>
    {filter.assigneeEmail ? <button type="button" className={css.activeChip} onClick={() => updateFilter({ assigneeEmail: '' })}>
      {filter.assigneeEmail === '__none__' ? 'Не назначен' : operators.find(item => item.email === filter.assigneeEmail)?.name ?? 'Ответственный'}
      <ProtoIcon name="close" size={12} />
    </button> : null}
    {filter.statuses.map(status => <button key={status} type="button" className={css.activeChip} onClick={() => updateFilter(current => ({ ...current, statuses: current.statuses.filter(item => item !== status) }))}>
      {status}<ProtoIcon name="close" size={12} />
    </button>)}
    {filter.priorities.map(priority => <button key={priority} type="button" className={css.activeChip} data-tone={priorityTone(priority)} onClick={() => updateFilter(current => ({ ...current, priorities: current.priorities.filter(item => item !== priority) }))}>
      {priority}<ProtoIcon name="close" size={12} />
    </button>)}
    {filter.ageBucket ? <button type="button" className={css.activeChip} onClick={() => updateFilter({ ageBucket: '' })}>Возраст: {filter.ageBucket}<ProtoIcon name="close" size={12} /></button> : null}
    {hasActiveFilters && (filter.assigneeEmail || filter.statuses.length || filter.priorities.length || filter.ageBucket) ? <button type="button" className={css.resetFilters} onClick={clearFilters}>Сбросить</button> : null}
  </>
  return <div className={css.root} data-support-root data-support-screen={queueDesk ? 'queue' : 'client'} data-preview={previewMode || undefined} data-tickets-view={queueDesk ? view : undefined}>
    <ListScreenShell
      title={queueDesk ? 'Тикеты' : 'Мои обращения'}
      meta={queueDesk ? 'Все обращения службы поддержки.' : previewMode ? 'Просмотр кабинета клиента. Только чтение.' : 'Ваши обращения и ответы.'}
      actions={!previewMode ? <button type="button" className={css.primary} onClick={() => setOpen('create')}>{queueDesk ? 'Новое обращение' : 'Написать обращение'}</button> : undefined}
    >
      <div className={css.stack}>
        {previewMode ? <div className={css.previewStrip} data-support-preview>
          <div className={css.previewCopy}>
            <strong>Посмотреть как клиент</strong>
            <span className={css.quiet}>Кабинет ровно так, как его видит выбранный клиент. Внутренние заметки скрыты.</span>
          </div>
          <ClientPreviewMenu clients={clients} value={previewEmail} open={previewOpen} onOpen={setPreviewOpen} onChange={setPreviewEmail} />
        </div> : null}
        {queueDesk ? <TicketViewTabs phone={device === 'phone'} view={view} counts={viewCounts} onView={setView} /> : null}
        {queueDesk && device !== 'phone' ? <>
          <div className={css.toolbar} data-ticket-toolbar>
            <ShellSearchField value={filter.search} onChange={search => updateFilter({ search })} label="Поиск обращений" placeholder="Тема, клиент или номер" />
            <AssigneeFilter value={filter.assigneeEmail ?? ''} operators={operators} onChange={assigneeEmail => updateFilter({ assigneeEmail })} />
            {statusOptions.length > 1 ? <MultiSelectFilter label="Статус" values={filter.statuses} options={statusOptions.map(name => ({ id: name, name }))} onChange={statuses => updateFilter({ statuses })} /> : null}
            <MultiSelectFilter label="Приоритет" values={filter.priorities} options={priorityOptions.map(name => ({ id: name, name, tone: priorityTone(name) }))} onChange={priorities => updateFilter({ priorities })} />
          </div>
          {(filter.assigneeEmail || filter.statuses.length || filter.priorities.length || filter.ageBucket) ? <div className={css.activeChips} role="status">{activeChips}</div> : null}
        </> : null}
        {queueDesk && device === 'phone' ? <div className={css.phoneFilterBar}>
          <button type="button" className={css.filterButton} data-active={activeFilterCount > 0 || undefined} aria-expanded={phoneFiltersOpen} onClick={openPhoneFilters}>
            <ProtoIcon name="filter" size={16} />
            <span>Фильтры</span>
            {activeFilterCount > 0 ? <em className={css.filterCount}>{activeFilterCount}</em> : null}
          </button>
          <ShellSearchField value={filter.search} onChange={search => updateFilter({ search })} label="Поиск обращений" placeholder="Поиск" />
        </div> : null}
        {queueDesk && device === 'phone' && (filter.assigneeEmail || filter.statuses.length || filter.priorities.length || filter.ageBucket) ? <div className={css.activeChips} data-phone role="status">{activeChips}</div> : null}
        {props.loading ? <p className={css.status} role="status">Загружаем обращения…</p> : null}
        {props.error || statusError ? <div className={css.status} role="alert"><p className={css.error}>{props.error || statusError}</p>{props.error ? <button type="button" onClick={props.reload}>Повторить</button> : null}</div> : null}
        {!props.loading && !props.error && !visible.length ? <div className={css.empty}><ProtoIcon name="clipboard" size={28} /><p>{items.length ? 'Нет обращений с такими условиями.' : queueDesk ? 'Тикетов пока нет. Новое обращение появится здесь.' : previewMode ? 'У этого клиента пока нет обращений.' : 'У вас пока нет обращений.'}</p>{items.length && queueDesk ? <button type="button" onClick={clearFilters}>Сбросить фильтры</button> : !previewMode ? <button type="button" onClick={() => setOpen('create')}>{queueDesk ? 'Создать обращение' : 'Написать обращение'}</button> : null}</div> : null}
        {clientView && visible.length ? <>
          {renderClientGroup('Открытые', openItems)}
          {renderClientGroup('Завершённые', doneItems)}
        </> : null}
        {queueDesk && visible.length ? <><ul className={css.cards} data-ticket-cards>
          {visible.map(item => <li key={item.id}><TicketButton item={item} now={props.now} showAssignee onOpen={() => openTicket(item.id)} onStatus={next => void changeStatus(item.id, next)} /></li>)}
        </ul>
        <div className={css.tableWrap}>
          <table className={css.table} data-columns={7}>
            <caption className={css.quiet}>Список обращений</caption>
            <colgroup>
              <col className={css.subjectCol} />
              <col className={css.whoCol} />
              <col className={css.stateCol} />
              <col className={css.priorityCol} />
              <col className={css.whenCol} />
              <col className={css.ownerCol} />
              <col className={css.actionsCol} />
            </colgroup>
            <thead><tr><th>Обращение</th><th>Клиент</th><th>Статус</th><th>Приоритет</th><th>Срок</th><th>Ответственный</th><th><span className={css.srOnly}>Действия</span></th></tr></thead>
            <tbody>
              {visible.map(item => {
                const countdown = item.sla ? supportSlaCountdown(item.sla) : null
                return <tr key={item.id}>
                  <td><button type="button" className={css.rowButton} onClick={() => openTicket(item.id)}><span className={css.subject}>{item.subject || 'Без темы'}</span>{item.number ? <span className={css.number}>{item.number}</span> : null}</button></td>
                  <td><span className={css.person}>{item.clientName || 'Клиент не указан'}{item.category ? <span>{item.category}</span> : null}</span></td>
                  <td><QueueStatus name={item.status} /></td>
                  <td><QueuePriority name={item.priority} /></td>
                  <td><span className={css.deadline}>
                    {countdown?.label ? <SlaBadge countdown={countdown} compact /> : null}
                    <span className={css.quiet}>{item.sla?.known && (item.sla.first.dueAt || item.sla.resolution.dueAt) ? slaWhen(item.sla.first.dueAt && !item.sla.first.met ? item.sla.first.dueAt : item.sla.resolution.dueAt) : formatWhen(item.deadline)}</span>
                  </span></td>
                  <td>{item.assigneeName ? <span className={css.personInline}><SupportPerson name={item.assigneeName} size={24} /><span>{item.assigneeName}</span></span> : <span className={css.person} data-empty>Не назначен</span>}</td>
                  <td className={css.rowActions}>{isSupportStatus(item.status) ? <TicketStatusMenu status={item.status} onPick={next => void changeStatus(item.id, next)} /> : null}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div></> : null}
      </div>
    </ListScreenShell>
    {open === 'create' && !previewMode ? <CreateDialog {...props} desk={queueDesk} onClose={() => setOpen(null)} onDone={id => { setOpen(null); if (id) props.onNavigate?.(backTo, undefined) }} /> : null}
    {phoneFiltersOpen && draftFilter ? <div className={css.sheetScrim} role="presentation" onClick={() => { setPhoneFiltersOpen(false); setDraftFilter(null) }}>
      <div className={css.filterSheet} role="dialog" aria-label="Фильтры" onClick={event => event.stopPropagation()}>
        <header className={css.sheetHeader}>
          <strong>Фильтры</strong>
          <button type="button" className={css.sheetClose} aria-label="Закрыть" onClick={() => { setPhoneFiltersOpen(false); setDraftFilter(null) }}><ProtoIcon name="close" size={18} /></button>
        </header>
        <div className={css.sheetBody}>
          <p className={css.sheetLabel}>Ответственный</p>
          <div className={css.sheetChoices}>
            <button type="button" aria-pressed={!draft.assigneeEmail} onClick={() => setDraftFilter({ ...draft, assigneeEmail: '' })}>Все</button>
            <button type="button" aria-pressed={draft.assigneeEmail === '__none__'} onClick={() => setDraftFilter({ ...draft, assigneeEmail: '__none__' })}>Не назначен</button>
            {operators.map(operator => <button key={operator.email} type="button" aria-pressed={draft.assigneeEmail === operator.email} onClick={() => setDraftFilter({ ...draft, assigneeEmail: operator.email })}>
              <SupportPerson name={operator.name} size={22} />{operator.name}
            </button>)}
          </div>
          {statusOptions.length > 1 ? <>
            <p className={css.sheetLabel}>Статус</p>
            <div className={css.sheetChoices}>
              {statusOptions.map(status => <button key={status} type="button" aria-pressed={draft.statuses.includes(status)} onClick={() => setDraftFilter({ ...draft, statuses: toggleInList(draft.statuses, status) })}>
                <span className={css.checkMark} data-on={draft.statuses.includes(status) || undefined}>{draft.statuses.includes(status) ? <ProtoIcon name="check" size={12} /> : null}</span>
                {status}
              </button>)}
            </div>
          </> : null}
          <p className={css.sheetLabel}>Приоритет</p>
          <div className={css.sheetChoices}>
            {priorityOptions.map(priority => <button key={priority} type="button" aria-pressed={draft.priorities.includes(priority)} onClick={() => setDraftFilter({ ...draft, priorities: toggleInList(draft.priorities, priority) })}>
              <span className={css.checkMark} data-on={draft.priorities.includes(priority) || undefined}>{draft.priorities.includes(priority) ? <ProtoIcon name="check" size={12} /> : null}</span>
              {priority}
            </button>)}
          </div>
        </div>
        <footer className={css.sheetFooter}>
          <button type="button" className={css.primary} onClick={applyPhoneFilters}>Показать {draftVisibleCount}</button>
        </footer>
      </div>
    </div> : null}
  </div>
}

function ClientTicketButton({ item, now, onOpen }: { item: SupportListItem; now: number; onOpen: () => void }) {
  return <button type="button" className={`${css.card} ${css.clientTicketCard}`} onClick={onOpen}>
    <span className={css.clientTicketMain}>
      <span className={css.subject}>{item.subject || 'Без темы'}</span>
      {item.number ? <span className={css.number}>{item.number}</span> : null}
      <span className={css.clientTicketMeta}>
        <span className={css.quiet}>{item.category || 'Без категории'}</span>
        {item.assigneeName ? <span className={css.personInline}><SupportPerson name={item.assigneeName} size={20} /><span>{item.assigneeName}</span></span> : <span className={css.quiet}>Не назначен</span>}
        <QueueStatus name={item.status} />
        <span className={css.quiet}>{updatedAgo(item.updatedAt, now)}</span>
      </span>
    </span>
    <ProtoIcon name="arrow" size={16} />
  </button>
}

function TicketButton({ item, now, onOpen, showAssignee = true, onStatus }: { item: SupportListItem; now: number; onOpen: () => void; showAssignee?: boolean; onStatus?: (status: string) => void }) {
  const countdown = item.sla ? supportSlaCountdown(item.sla) : null
  const deadline = item.sla?.known && (item.sla.first.dueAt || item.sla.resolution.dueAt) ? slaWhen(item.sla.first.dueAt && !item.sla.first.met ? item.sla.first.dueAt : item.sla.resolution.dueAt) : formatWhen(item.deadline)
  return <div className={css.ticketCard} data-ticket-card>
    <button type="button" className={css.card} onClick={onOpen}>
      <span className={css.ticketCardTop}>
        <span className={css.subject}>{item.subject || 'Без темы'}</span>
        {showAssignee ? (item.assigneeName ? <SupportPerson name={item.assigneeName} size={28} /> : <span className={css.avatar} data-size="sm" data-client aria-hidden="true"><ProtoIcon name="user" size={14} /></span>) : null}
      </span>
      {item.number ? <span className={css.number}>{item.number}</span> : null}
      <span className={css.cardFacts}>
        <StatusBadge name={item.status} />
        <PriorityBadge name={item.priority} />
        {countdown?.label ? <SlaBadge countdown={countdown} compact /> : null}
      </span>
      <span className={css.ticketCardLine}>
        <span className={css.quiet}>{item.clientName || 'Клиент не указан'}</span>
        <span className={css.quiet}>·</span>
        <span className={css.deadline}>{deadline}</span>
      </span>
    </button>
    {onStatus && isSupportStatus(item.status) ? <div className={css.ticketCardMenu}><TicketStatusMenu status={item.status} onPick={onStatus} /></div> : null}
  </div>
}

function FactMenu(props: {
  label: string
  valueLabel: ReactNode
  options: { id: string; name: string; node?: ReactNode }[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useMenuOpen(open, root, () => setOpen(false))
  if (props.disabled) return <span className={css.factValue}>{props.valueLabel}</span>
  return <div className={css.factMenu} ref={root} data-fact-menu={props.label}>
    <button type="button" className={css.factTrigger} aria-label={props.label} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(value => !value)}>
      <span className={css.factValue}>{props.valueLabel}</span>
      <ProtoIcon name="down" size={14} />
    </button>
    {open ? <div className={css.factPanel} role="listbox" aria-label={props.label}>
      {props.options.map(option => <button key={option.id || option.name} type="button" role="option" aria-selected={option.id === props.value} onClick={() => { props.onChange(option.id); setOpen(false) }}>
        {option.node ?? option.name}
      </button>)}
    </div> : null}
  </div>
}

function TicketCard(props: ScreenProps) {
  const device = useContext(AppFrameDeviceContext)
  const phone = device === 'phone'
  const clientView = props.screenId === props.kit.clientTicketScreenId
  const desk = isSupportDesk(props.actor) && !clientView
  const ticket = props.of(props.kit.ticketsTableId).find(row => row.id === props.recordId) ?? (props.record?.tableId === props.kit.ticketsTableId ? props.record : undefined)
  const bundle = useContext(SupportRowsContext)
  const [dialog, setDialog] = useState<SupportOpen>(bundle?.open ?? null)
  const [message, setMessage] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const back = desk ? props.kit.queueScreenId : props.kit.clientListScreenId
  if (!ticket) return <div className={css.root} data-support-root data-support-screen="missing">{props.loading ? <p role="status">Загружаем обращение…</p> : <div className={css.empty}><p>Обращение не найдено или вам недоступно.</p><button type="button" onClick={() => props.onNavigate?.(back)}>К списку</button></div>}</div>
  const fields = props.kit.ticket
  const status = supportStatusName(props.kit, ticket.values[fields.status]) || choiceName(props, props.kit.ticketsTableId, fields.status, ticket.values[fields.status])
  const priority = choiceName(props, props.kit.ticketsTableId, fields.priority, ticket.values[fields.priority])
  const priorityId = textOf(ticket.values[fields.priority])
  const categoryId = firstId(ticket.values[fields.category])
  const assigneeId = firstId(ticket.values[fields.assignee])
  const category = nameOf(props, props.kit.categoriesTableId, categoryId, props.kit.category.name)
  const assignee = nameOf(props, props.kit.operatorsTableId, assigneeId, props.kit.operator.name)
  const line = fields.line ? choiceName(props, props.kit.ticketsTableId, fields.line, ticket.values[fields.line]) : ''
  const lineId = fields.line ? textOf(ticket.values[fields.line]) : ''
  const overdue = isOverdue(status, ticket.values[fields.deadline], props.now)
  const sla = slaFacts(props.kit, props.rows, ticket.id, props.now)
  const countdown = supportSlaCountdown(sla)
  const policy = supportPolicyFromRows(props.kit, props.rows)
  const normLabel = supportSlaNormLabel(sla, policy)
  const replies = props.of(props.kit.repliesTableId).filter(row => firstId(row.values[props.kit.reply.ticket]) === ticket.id)
  const notes = desk ? props.of(props.kit.notesTableId).filter(row => firstId(row.values[props.kit.note.ticket]) === ticket.id) : []
  const clientName = textOf(ticket.values[fields.clientName])
  const clientEmail = textOf(ticket.values[fields.clientEmail])
  const timeline = [...replies.map(row => {
    const author = textOf(row.values[props.kit.reply.author])
    const authorEmail = textOf(row.values[props.kit.reply.authorEmail])
    const kind = supportAuthorKind({ author, authorEmail, clientName, clientEmail })
    return { id: row.id, at: textOf(row.values[props.kit.reply.at]), author, authorEmail, text: textOf(row.values[props.kit.reply.text]), internal: false, label: supportAuthorLabel(kind), kind }
  }), ...notes.map(row => ({ id: row.id, at: textOf(row.values[props.kit.note.at]), author: textOf(row.values[props.kit.note.author]), authorEmail: textOf(row.values[props.kit.note.authorEmail]), text: textOf(row.values[props.kit.note.text]), internal: true, label: 'Внутренняя заметка', kind: 'operator' as const }))]
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  const transitions = desk ? operatorTransitions(status) : []
  const reopen = status === 'Решено' || status === 'Закрыто'
  const replyLabel = reopen ? 'Переоткрыть' : 'Ответить'
  const waiting = status === 'Ждём клиента'
  const canCompose = !(clientView && isSupportDesk(props.actor))
  const conversationShot = bundle?.conversationShot
  const operators = props.of(props.kit.operatorsTableId).filter(row => row.values[props.kit.operator.active] === props.kit.activeChoiceId || row.id === assigneeId)
  const priorities = props.tables.find(table => table.id === props.kit.ticketsTableId)?.fields.find(field => field.id === fields.priority)?.choices ?? []
  const focusComposer = () => {
    if (conversationShot) {
      const form = threadRef.current?.querySelector('form')
      form?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      form?.querySelector('textarea')?.focus()
      return
    }
    setDialog('reply')
  }
  const saveAssign = async (patch: { assigneeId?: string | null; priorityId?: string; categoryId?: string; deadline?: string | null; lineId?: string | null }) => {
    const result = await commit(props, {
      kind: 'assign',
      recordId: ticket.id,
      assigneeId: patch.assigneeId !== undefined ? patch.assigneeId : (assigneeId || null),
      priorityId: patch.priorityId ?? priorityId,
      categoryId: patch.categoryId ?? categoryId,
      deadline: patch.deadline !== undefined ? patch.deadline : (typeof ticket.values[fields.deadline] === 'string' ? ticket.values[fields.deadline] as string : null),
      lineId: patch.lineId !== undefined ? patch.lineId : (lineId || null),
    })
    setMessage(result.ok ? result.message : result.error)
  }
  return <div className={css.root} data-support-root data-support-screen={desk ? 'ticket' : 'client-ticket'} data-support-status={status} data-ticket-tight>
    <DetailCardShell
      back={{ label: desk ? 'Тикеты' : 'Мои обращения', onClick: () => props.onNavigate?.(back) }}
      title={textOf(ticket.values[fields.subject]) || 'Без темы'}
      subtitle={textOf(ticket.values[fields.number])}
      badge={<span className={css.badges}>
        <StatusBadge name={status} />
        <PriorityBadge name={priority} />
        {countdown.label ? <SlaBadge countdown={countdown} /> : overdue ? <StatusBadge name="Просрочено" /> : null}
      </span>}
      actions={canCompose && phone ? <div className={css.actions}>
        <button type="button" className={css.primary} onClick={focusComposer}>{replyLabel}</button>
      </div> : undefined}
    >
      {clientView && waiting ? <div className={css.waitBanner} role="status" data-support-wait-banner>Служба поддержки ждёт вашего ответа</div> : null}
      {clientView ? <dl className={css.clientGrid} aria-label="Сведения об обращении">
        <div><dt>Категория</dt><dd>{category || 'Без категории'}</dd></div>
        <div><dt>Приоритет / срочность</dt><dd><PriorityBadge name={priority} />{!priority ? 'Не указан' : null}</dd></div>
        <div><dt>Ответственный</dt><dd>{assignee ? <span className={css.personInline}><SupportPerson name={assignee} size={24} /><span>{assignee}</span></span> : 'Не назначен'}</dd></div>
        <div><dt>Отправлено</dt><dd>{formatWhen(ticket.values[fields.createdAt], 'Дата не указана')}</dd></div>
      </dl> : null}
      <div className={css.ticketCols}>
        <div className={shell.detailMainCol}>
          <DetailSection title="Описание"><p className={css.description}>{textOf(ticket.values[fields.description]) || 'Описания нет.'}</p></DetailSection>
          <DetailSection title="Переписка">
            <div ref={threadRef} data-support-thread>
            {conversationShot ? (
              <Suspense fallback={<p className={css.quiet} role="status">Загружаем переписку…</p>}>
                <SupportConversationShotPanel
                  desk={desk}
                  tableId={props.kit.ticketsTableId}
                  ticketId={ticket.id}
                  shot={conversationShot}
                />
              </Suspense>
            ) : Boolean(props.live) && !bundle?.sample ? (
              <Suspense fallback={<p className={css.quiet} role="status">Загружаем переписку…</p>}>
                <CorrespondenceModule
                  slug={props.app.slug}
                  tableId={props.kit.ticketsTableId}
                  rowId={ticket.id}
                  configured={Boolean(props.app.communications?.enabled)}
                  business={false}
                  showContext={false}
                />
              </Suspense>
            ) : <>
            {props.error ? <p className={css.error} role="alert">{props.error}</p> : null}
            {message ? <p role="status">{message}</p> : null}
            {!timeline.length ? <div className={css.empty} data-compact><p>Сообщений пока нет. Ответ появится в этой ленте.</p></div> : null}
            <ol className={css.timeline} aria-label="Хронология">
              {timeline.map(entry => {
                const authorKind = entry.internal ? 'note' as const : entry.kind === 'client' ? 'client' as const : 'operator' as const
                return <li key={entry.id} className={css.message} data-internal={entry.internal || undefined} data-support-note={entry.internal || undefined} data-author-kind={authorKind}>
                <header>
                  <MessageAvatar kind={authorKind === 'note' ? 'operator' : authorKind} author={entry.author} />
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
              <button type="button" className={css.primary} onClick={() => setDialog('reply')}>{replyLabel}</button>
            </div> : null}
            </>}
            </div>
          </DetailSection>
        </div>
        {!clientView ? <aside className={`${shell.detailSideCol} ${css.factsCol}`}>
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
                      onChange={next => void runStatus(props, ticket.id, statusId(props, next), setMessage)}
                    />
                  : <StatusBadge name={status} />}
                </dd>
              </div>
              <div>
                <dt>Ответственный</dt>
                <dd>{desk && status !== 'Закрыто'
                  ? <FactMenu
                      label="Ответственный"
                      value={assigneeId}
                      valueLabel={assignee ? <span className={css.personInline}><SupportPerson name={assignee} size={22} /><span>{assignee}</span></span> : 'Не назначен'}
                      options={[{ id: '', name: 'Не назначен' }, ...operators.map(row => ({ id: row.id, name: textOf(row.values[props.kit.operator.name]) || 'Без имени', node: <span className={css.personInline}><SupportPerson name={textOf(row.values[props.kit.operator.name]) || 'Без имени'} size={22} /><span>{textOf(row.values[props.kit.operator.name]) || 'Без имени'}</span></span> }))]}
                      onChange={id => void saveAssign({ assigneeId: id || null })}
                    />
                  : assignee ? <span className={css.personInline}><SupportPerson name={assignee} size={24} /><span>{assignee}</span></span> : 'Не назначен'}
                </dd>
              </div>
              {line ? <div><dt>Линия</dt><dd>{line}</dd></div> : null}
              <div>
                <dt>Приоритет</dt>
                <dd>{desk && status !== 'Закрыто'
                  ? <FactMenu
                      label="Приоритет"
                      value={priorityId}
                      valueLabel={priority ? <PriorityBadge name={priority} /> : 'Не указан'}
                      options={priorities.map(choice => ({ id: choice.id, name: choice.name, node: <PriorityBadge name={choice.name} /> }))}
                      onChange={id => void saveAssign({ priorityId: id })}
                    />
                  : <><PriorityBadge name={priority} />{!priority ? 'Не указан' : null}</>}
                </dd>
              </div>
              <div><dt>Категория</dt><dd>{category || 'Без категории'}</dd></div>
              <div>
                <dt>Срок</dt>
                <dd>
                  <button type="button" className={css.factLink} disabled={!desk || status === 'Закрыто'} onClick={() => desk && status !== 'Закрыто' && setDialog('assign')}>
                    {formatWhen(ticket.values[fields.deadline])}{overdue ? '. Просрочено' : ''}
                  </button>
                </dd>
              </div>
              <div><dt>Норматив</dt><dd>{normLabel}</dd></div>
            </dl>
          </DetailSection>
        </aside> : null}
      </div>
    </DetailCardShell>
    {dialog === 'reply' && canCompose ? <ReplyDialog {...props} ticketId={ticket.id} reopen={reopen} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
    {dialog === 'note' && desk ? <NoteDialog {...props} ticketId={ticket.id} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
    {dialog === 'assign' && desk ? <AssignDialog {...props} ticket={ticket} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
  </div>
}

function statusId(props: ScreenProps, name: string) {
  if (name === 'Новое') return props.kit.statuses.fresh
  if (name === 'В работе') return props.kit.statuses.progress
  if (name === 'Ждём клиента') return props.kit.statuses.waiting
  if (name === 'Решено') return props.kit.statuses.resolved
  return props.kit.statuses.closed
}

async function runStatus(props: ScreenProps, recordId: string, statusIdValue: string, setMessage: (value: string) => void) {
  const result = await commit(props, { kind: 'status', recordId, statusId: statusIdValue })
  setMessage(result.ok ? result.message : result.error)
}

function CreateDialog(props: ScreenProps & { desk: boolean; onClose: () => void; onDone: (id?: string) => void; initialClientId?: string }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [clientId, setClientId] = useState(props.initialClientId ?? '')
  const [lineId, setLineId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const categories = props.of(props.kit.categoriesTableId).filter(row => row.values[props.kit.category.active] === true)
  const clients = props.of(props.kit.clientsTableId)
  const lines = props.kit.ticket.line ? (props.tables.find(table => table.id === props.kit.ticketsTableId)?.fields.find(field => field.id === props.kit.ticket.line)?.choices ?? []) : []
  const save = async () => {
    if (!subject.trim() || !description.trim() || !categoryId || (props.desk && !clientId)) { setError('Заполните тему, описание и категорию.'); return }
    setBusy(true)
    const result = await commit(props, { kind: 'create', subject, description, categoryId, lineId: lineId || null, ...(props.desk ? { clientId } : {}) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onDone()
  }
  return <AppDialog title="Новое обращение" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Отправить обращение'}</button>}>
    <form id={formId} data-support-form="create" onSubmit={event => { event.preventDefault(); void save() }}>
      {props.desk ? <ChoiceRow label="Клиент" value={clientId} options={clients.map(row => ({ id: row.id, name: textOf(row.values[props.kit.client.name]) || 'Без имени' }))} onChange={setClientId} /> : null}
      <label className={css.field}><span>Тема</span><input value={subject} onChange={event => setSubject(event.target.value)} maxLength={200} required /></label>
      <label className={css.field}><span>Описание</span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={4000} required /></label>
      <ChoiceRow label="Категория" value={categoryId} options={categories.map(row => ({ id: row.id, name: textOf(row.values[props.kit.category.name]) || 'Без названия' }))} onChange={setCategoryId} />
      {props.desk && lines.length ? <SupportSelect field label="Линия" value={lineId} emptyLabel="Не указана" options={[{ id: '', name: 'Не указана' }, ...lines.map(choice => ({ id: choice.id, name: choice.name }))]} onChange={setLineId} /> : null}
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function ReplyDialog(props: ScreenProps & { ticketId: string; reopen: boolean; onClose: () => void; onMessage: (value: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!text.trim()) { setError('Напишите ответ.'); return }
    setBusy(true)
    const result = await commit(props, { kind: 'reply', recordId: props.ticketId, text })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title={props.reopen ? 'Переоткрыть обращением' : 'Ответ'} placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : props.reopen ? 'Переоткрыть' : 'Ответить'}</button>}>
    <form id={formId} data-support-form="reply" onSubmit={event => { event.preventDefault(); void save() }}>
      <label className={css.field}><span>{props.reopen ? 'Что изменилось' : 'Сообщение'}</span><textarea value={text} onChange={event => setText(event.target.value)} maxLength={4000} required /></label>
      <p className={css.quiet}>Сообщение появится в переписке этого обращения.</p>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function NoteDialog(props: ScreenProps & { ticketId: string; onClose: () => void; onMessage: (value: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!text.trim()) { setError('Напишите заметку.'); return }
    setBusy(true)
    const result = await commit(props, { kind: 'note', recordId: props.ticketId, text })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Внутренняя заметка" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить заметку'}</button>}>
    <form id={formId} data-support-form="note" onSubmit={event => { event.preventDefault(); void save() }}>
      <p className={css.noteFlag}>Эту заметку видят только операторы. Клиент не получит её ни в кабинете, ни в данных.</p>
      <label className={css.field}><span>Заметка</span><textarea value={text} onChange={event => setText(event.target.value)} maxLength={4000} required /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function AssignDialog(props: ScreenProps & { ticket: AppV2Record; onClose: () => void; onMessage: (value: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const fields = props.kit.ticket
  const initialDeadline = supportDeadlineParts(props.ticket.values[fields.deadline])
  const [assigneeId, setAssigneeId] = useState(firstId(props.ticket.values[fields.assignee]))
  const [priorityId, setPriorityId] = useState(textOf(props.ticket.values[fields.priority]))
  const [categoryId, setCategoryId] = useState(firstId(props.ticket.values[fields.category]))
  const [lineId, setLineId] = useState(fields.line ? textOf(props.ticket.values[fields.line]) : '')
  const [date, setDate] = useState(initialDeadline.date)
  const [time, setTime] = useState(initialDeadline.time)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const operators = props.of(props.kit.operatorsTableId).filter(row => row.values[props.kit.operator.active] === props.kit.activeChoiceId || row.id === assigneeId)
  const categories = props.of(props.kit.categoriesTableId)
  const priorities = props.tables.find(table => table.id === props.kit.ticketsTableId)?.fields.find(field => field.id === fields.priority)?.choices ?? []
  const lines = fields.line ? (props.tables.find(table => table.id === props.kit.ticketsTableId)?.fields.find(field => field.id === fields.line)?.choices ?? []) : []
  const save = async () => {
    if (!priorityId || !categoryId) { setError('Выберите приоритет и категорию.'); return }
    setBusy(true)
    const result = await commit(props, { kind: 'assign', recordId: props.ticket.id, assigneeId: assigneeId || null, priorityId, categoryId, deadline: supportDeadlineInstant(date, time), lineId: lineId || null })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Ответственный и срок" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}>
    <form id={formId} data-support-form="assign" onSubmit={event => { event.preventDefault(); void save() }}>
      <SupportSelect field label="Ответственный" value={assigneeId} emptyLabel="Не назначен" options={[{ id: '', name: 'Не назначен' }, ...operators.map(row => ({ id: row.id, name: textOf(row.values[props.kit.operator.name]) || 'Без имени' }))]} onChange={setAssigneeId} />
      {lines.length ? <SupportSelect field label="Линия" value={lineId} emptyLabel="Не указана" options={[{ id: '', name: 'Не указана' }, ...lines.map(choice => ({ id: choice.id, name: choice.name }))]} onChange={setLineId} /> : null}
      <ChoiceRow label="Приоритет" value={priorityId} options={priorities.map(choice => ({ id: choice.id, name: choice.name }))} onChange={setPriorityId} />
      <ChoiceRow label="Категория" value={categoryId} options={categories.map(row => ({ id: row.id, name: textOf(row.values[props.kit.category.name]) || 'Без названия' }))} onChange={setCategoryId} />
      <div className={css.when}>
        <div className={css.field}><span>Дата срока</span><DateMenu label="Дата срока" value={date} onValue={setDate} /></div>
        <div className={css.field}><span>Время</span><TimeMenu label="Время срока" value={time} onValue={setTime} /></div>
      </div>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

type ClientSortKey = 'name' | 'company' | 'phone' | 'open' | 'total' | 'last'

type ClientListRow = {
  id: string
  name: string
  email: string
  phone: string
  company: string
  note: string
  open: number
  overdueOpen: number
  total: number
  lastAt: number | null
  lastLabel: string
}

function clientRows(props: ScreenProps): ClientListRow[] {
  const tickets = ticketItems(props)
  return props.of(props.kit.clientsTableId).map(row => {
    const email = textOf(row.values[props.kit.client.email]).trim().toLowerCase()
    const related = tickets.filter(item => {
      const ticket = props.of(props.kit.ticketsTableId).find(entry => entry.id === item.id)
      return textOf(ticket?.values[props.kit.ticket.clientEmail]).trim().toLowerCase() === email
    })
    const open = related.filter(item => isOpenStatus(item.status))
    const overdueOpen = open.filter(item => isOverdue(item.status, item.deadline, props.now)).length
    const lastAt = related.reduce<number | null>((max, item) => {
      const stamp = deadlineTime(item.updatedAt) ?? deadlineTime(item.createdAt)
      if (stamp == null) return max
      return max == null || stamp > max ? stamp : max
    }, null)
    return {
      id: row.id,
      name: textOf(row.values[props.kit.client.name]) || 'Без имени',
      email,
      phone: textOf(row.values[props.kit.client.phone]),
      company: textOf(row.values[props.kit.client.company]),
      note: textOf(row.values[props.kit.client.note]),
      open: open.length,
      overdueOpen,
      total: related.length,
      lastAt,
      lastLabel: lastAt == null ? '—' : formatDate(new Date(lastAt).toISOString()),
    }
  }).filter(item => item.email || item.name)
}

function ClientDirectory(props: ScreenProps) {
  const device = useContext(AppFrameDeviceContext)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: ClientSortKey; dir: 'asc' | 'desc' }>({ key: 'last', dir: 'desc' })
  const rows = clientRows(props)
  const query = search.trim().toLocaleLowerCase('ru-RU')
  const filtered = rows.filter(row => {
    if (!query) return true
    return [row.name, row.company, row.phone, row.email].join('\n').toLocaleLowerCase('ru-RU').includes(query)
  })
  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const cmp = (left: string | number | null, right: string | number | null) => {
      if (left == null && right == null) return 0
      if (left == null) return 1
      if (right == null) return -1
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * dir
      return String(left).localeCompare(String(right), 'ru') * dir
    }
    if (sort.key === 'name') return cmp(a.name, b.name)
    if (sort.key === 'company') return cmp(a.company, b.company)
    if (sort.key === 'phone') return cmp(a.phone, b.phone)
    if (sort.key === 'open') return cmp(a.open, b.open)
    if (sort.key === 'total') return cmp(a.total, b.total)
    return cmp(a.lastAt, b.lastAt)
  })
  const toggleSort = (key: ClientSortKey) => setSort(current => current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'company' || key === 'phone' ? 'asc' : 'desc' })
  const openClient = (id: string) => {
    if (props.kit.clientScreenId) props.onNavigate?.(props.kit.clientScreenId, id)
  }
  const sortButton = (key: ClientSortKey, label: string) => <button type="button" className={css.sortHead} data-active={sort.key === key || undefined} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} onClick={() => toggleSort(key)}>
    {label}
    {sort.key === key ? <ProtoIcon name={sort.dir === 'asc' ? 'up' : 'down'} size={12} /> : <ProtoIcon name="sort" size={12} />}
  </button>
  return <div className={css.root} data-support-root data-support-screen="clients">
    <ListScreenShell title="Клиенты" meta="Все, кто обращался в поддержку.">
      <div className={css.stack}>
        <div className={css.toolbar} data-clients-toolbar>
          <ShellSearchField value={search} onChange={setSearch} label="Поиск клиентов" placeholder="Имя, компания, телефон или почта" />
        </div>
        {props.loading ? <p className={css.status} role="status">Загружаем клиентов…</p> : null}
        {!props.loading && !sorted.length ? <div className={css.empty}><p>{rows.length ? 'Нет клиентов по этому запросу.' : 'Клиентов пока нет.'}</p></div> : null}
        {sorted.length && device === 'phone' ? <ul className={css.clientCards} data-client-cards>
          {sorted.map(row => <li key={row.id}>
            <button type="button" className={css.clientCard} onClick={() => openClient(row.id)}>
              <span className={css.clientCardMain}>
                <span className={css.clientIdentity}>
                  <span className={css.avatar} data-size="md" data-client aria-hidden="true"><ProtoIcon name="user" size={16} /></span>
                  <span>
                    <strong>{row.name}</strong>
                    <span className={css.quiet}>{row.company || 'Без компании'}</span>
                  </span>
                </span>
                <span className={css.clientCardCounts}>
                  <span data-overdue={row.overdueOpen > 0 || undefined}>{row.open} откр.</span>
                  <span className={css.quiet}>{row.total} всего</span>
                </span>
              </span>
              <ProtoIcon name="arrow" size={16} />
            </button>
          </li>)}
        </ul> : null}
        {sorted.length && device !== 'phone' ? <div className={css.tableWrap} data-clients-table>
          <table className={css.table} data-columns={7}>
            <caption className={css.quiet}>Список клиентов</caption>
            <thead><tr>
              <th>{sortButton('name', 'Клиент')}</th>
              <th>{sortButton('company', 'Компания')}</th>
              <th>{sortButton('phone', 'Телефон')}</th>
              <th>{sortButton('open', 'Открытые')}</th>
              <th>{sortButton('total', 'Всего обращений')}</th>
              <th>{sortButton('last', 'Последнее обращение')}</th>
              <th><span className={css.srOnly}>Открыть</span></th>
            </tr></thead>
            <tbody>
              {sorted.map(row => <tr
                key={row.id}
                className={css.clientTableRow}
                tabIndex={0}
                role="link"
                aria-label={row.name}
                onClick={() => openClient(row.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openClient(row.id)
                  }
                }}
              >
                <td>
                  <span className={css.clientIdentity}>
                    <span className={css.avatar} data-size="sm" data-client aria-hidden="true"><ProtoIcon name="user" size={14} /></span>
                    <span className={css.person}>{row.name}<span>{row.email || 'Почта не указана'}</span></span>
                  </span>
                </td>
                <td>{row.company || '—'}</td>
                <td>{row.phone || '—'}</td>
                <td><span className={css.openCount} data-overdue={row.overdueOpen > 0 || undefined}>{row.open}</span></td>
                <td>{row.total}</td>
                <td>{row.lastLabel}</td>
                <td className={css.chevronCol}><span className={css.rowChevron} aria-hidden="true">›</span></td>
              </tr>)}
            </tbody>
          </table>
        </div> : null}
      </div>
    </ListScreenShell>
  </div>
}

function ClientDetail(props: ScreenProps) {
  const bundle = useContext(SupportRowsContext)
  const client = props.of(props.kit.clientsTableId).find(row => row.id === props.recordId) ?? (props.record?.tableId === props.kit.clientsTableId ? props.record : undefined)
  const [noteOpen, setNoteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [message, setMessage] = useState('')
  if (!client) return <div className={css.root} data-support-root data-support-screen="client-missing">{props.loading ? <p role="status">Загружаем клиента…</p> : <div className={css.empty}><p>Клиент не найден.</p><button type="button" onClick={() => props.onNavigate?.(props.kit.clientsScreenId)}>К списку</button></div>}</div>
  const email = textOf(client.values[props.kit.client.email]).trim().toLowerCase()
  const name = textOf(client.values[props.kit.client.name]) || 'Без имени'
  const company = textOf(client.values[props.kit.client.company])
  const phone = textOf(client.values[props.kit.client.phone])
  const note = textOf(client.values[props.kit.client.note])
  const tickets = ticketItems(props).filter(item => {
    const row = props.of(props.kit.ticketsTableId).find(entry => entry.id === item.id)
    return textOf(row?.values[props.kit.ticket.clientEmail]).trim().toLowerCase() === email
  }).sort((a, b) => (deadlineTime(b.updatedAt) ?? 0) - (deadlineTime(a.updatedAt) ?? 0))
  const open = tickets.filter(item => isOpenStatus(item.status))
  const closed = tickets.filter(item => !isOpenStatus(item.status))
  const avgMs = closed.length
    ? closed.reduce((sum, item) => {
      const start = deadlineTime(item.createdAt)
      const end = deadlineTime(item.updatedAt)
      if (start == null || end == null || end < start) return sum
      return sum + (end - start)
    }, 0) / closed.length
    : 0
  const previewAsClient = () => {
    if (bundle?.previewFocus) bundle.previewFocus.current = email
    props.onNavigate?.(props.kit.clientListScreenId)
  }
  return <div className={css.root} data-support-root data-support-screen="client-card">
    <DetailCardShell
      title={name}
      subtitle={company || email || undefined}
      back={{ label: 'Клиенты', onClick: () => props.onNavigate?.(props.kit.clientsScreenId) }}
      actions={<>
        <button type="button" className={css.mine} onClick={previewAsClient}>Посмотреть как клиент</button>
        <button type="button" className={css.primary} onClick={() => setCreateOpen(true)}>Новое обращение от клиента</button>
      </>}
    >
      <div className={css.clientDetail}>
        {message ? <p role="status">{message}</p> : null}
        <div className={css.clientDetailMain}>
          <aside className={css.clientSidebar}>
            <DetailSection title="Контакты">
              <dl className={css.clientFacts}>
                <div><dt>Почта</dt><dd>{email || '—'}</dd></div>
                <div><dt>Телефон</dt><dd>{phone || '—'}</dd></div>
                <div><dt>Компания</dt><dd>{company || '—'}</dd></div>
              </dl>
            </DetailSection>
            <DetailSection title="Заметка — видна только службе">
              <div className={css.noteBlock}>
                <p className={note ? css.clientNote : css.quiet}>{note || 'Заметки пока нет.'}</p>
                <button type="button" className={css.mine} onClick={() => setNoteOpen(true)}>{note ? 'Изменить' : 'Добавить'}</button>
              </div>
            </DetailSection>
            <DetailSection title="Сводка">
              <div className={css.clientStats}>
                <p><strong>{open.length}</strong><span>Открытые</span></p>
                <p><strong>{tickets.length}</strong><span>Всего</span></p>
                <p><strong>{formatDuration(avgMs)}</strong><span>Среднее решение</span></p>
              </div>
            </DetailSection>
          </aside>
          <div className={css.clientHistoryCol}>
            <DetailSection title="История обращений">
              {!tickets.length ? <p className={css.quiet}>Обращений пока нет.</p> : <ul className={css.clientHistory}>
                {tickets.map(item => <li key={item.id}>
                  <button type="button" className={css.historyRow} onClick={() => props.onNavigate?.(props.kit.ticketScreenId, item.id)}>
                    <span className={css.historyMain}>
                      <span className={css.subject}>{item.subject || 'Без темы'}</span>
                      <span className={css.number}>{item.number}</span>
                      <span className={css.cardFacts}><StatusBadge name={item.status} /><PriorityBadge name={item.priority} /></span>
                      <span className={css.quiet}>{formatDate(item.updatedAt || item.createdAt)}</span>
                    </span>
                    <span className={css.historyAssignee}>
                      {item.assigneeName ? <SupportPerson name={item.assigneeName} size={24} /> : <span className={css.avatar} data-size="sm" data-client aria-hidden="true"><ProtoIcon name="user" size={14} /></span>}
                      <span>{item.assigneeName || 'Не назначен'}</span>
                    </span>
                  </button>
                </li>)}
              </ul>}
            </DetailSection>
          </div>
        </div>
      </div>
    </DetailCardShell>
    {noteOpen ? <ClientNoteDialog {...props} client={client} note={note} onClose={() => setNoteOpen(false)} onMessage={setMessage} /> : null}
    {createOpen ? <CreateDialog {...props} desk initialClientId={client.id} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); setMessage('Обращение создано.') }} /> : null}
  </div>
}

function ClientNoteDialog(props: ScreenProps & { client: AppV2Record; note: string; onClose: () => void; onMessage: (value: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const [text, setText] = useState(props.note)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const result = await commit(props, { kind: 'client_note', recordId: props.client.id, note: text })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Заметка о клиенте" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}>
    <form id={formId} data-support-form="client-note" onSubmit={event => { event.preventDefault(); void save() }}>
      <p className={css.noteFlag}>Заметка — видна только службе. Клиент её не открывает.</p>
      <label className={css.field}><span>Текст</span><textarea value={text} onChange={event => setText(event.target.value)} maxLength={2000} rows={5} /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function SettingsScreen(props: ScreenProps) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const categories = props.of(props.kit.categoriesTableId)
  const operators = props.of(props.kit.operatorsTableId)
  const toggle = async (row: AppV2Record) => {
    const result = await commit(props, { kind: 'category', recordId: row.id, name: textOf(row.values[props.kit.category.name]), description: textOf(row.values[props.kit.category.description]), active: row.values[props.kit.category.active] !== true })
    setMessage(result.ok ? result.message : result.error)
  }
  const [section, setSection] = useState<'categories' | 'team'>('categories')
  return <div className={css.root} data-support-root data-support-screen="settings">
    <ListScreenShell title="Настройки" meta="Как служба выглядит для клиента." actions={section === 'categories' ? <button type="button" className={css.mine} onClick={() => setOpen(true)}>Добавить категорию</button> : undefined}>
      <div className={css.settingsLayout}>
        <nav aria-label="Разделы настроек">
          <button type="button" aria-current={section === 'categories' ? 'page' : undefined} onClick={() => setSection('categories')}>Категории</button>
          <button type="button" aria-current={section === 'team' ? 'page' : undefined} onClick={() => setSection('team')}>Команда</button>
        </nav>
        <div>
          {section === 'team' ? <p>В смене {operators.length}. Клиент видит имя в ответе, не список всей команды.</p> : <div className={css.stack}>
        {message ? <p role="status">{message}</p> : null}
        {props.loading ? <p role="status">Загружаем настройки…</p> : null}
        {!categories.length && !props.loading ? <div className={css.empty}><p>Категорий пока нет.</p></div> : null}
        <ul className={css.directory}>{categories.map(row => {
          const active = row.values[props.kit.category.active] === true
          return <li key={row.id} className={css.categoryRow}>
            <div className={css.categoryCopy}>
              <strong>{textOf(row.values[props.kit.category.name])}</strong>
              <span className={css.quiet}>{textOf(row.values[props.kit.category.description]) || 'Без пояснения'}</span>
            </div>
            <button
              type="button"
              role="switch"
              className={css.rowSwitch}
              aria-checked={active}
              aria-label={active ? `${textOf(row.values[props.kit.category.name])}: доступна` : `${textOf(row.values[props.kit.category.name])}: скрыта`}
              data-on={active || undefined}
              onClick={() => void toggle(row)}
            >
              <span>{active ? 'Доступна' : 'Скрыта'}</span>
              <i aria-hidden="true" />
            </button>
          </li>
        })}</ul>
        <SupportSlaSettings kit={props.kit} rows={props.rows} now={props.now} actorEmail={props.actor.email ?? ''} onOpenQueue={() => {}} onOpenTicket={() => {}} onStatus={async () => ({ ok: false })} onSaveSla={async minutes => commit(props, { kind: 'sla', minutes })} />
        <h3>Операторы</h3>
        <p className={css.quiet}>{props.kit.teamScreenId ? 'Полный список и правка — в разделе «Команда».' : 'Линия и статус правятся в карточке оператора.'}</p>
        <ul className={css.directory}>{operators.map(row => <li key={row.id}><strong>{textOf(row.values[props.kit.operator.name])}</strong><span className={css.badges}><Badge name={choiceName(props, props.kit.operatorsTableId, props.kit.operator.role, row.values[props.kit.operator.role])} />{props.kit.operator.line ? <Badge name={choiceName(props, props.kit.operatorsTableId, props.kit.operator.line, row.values[props.kit.operator.line])} /> : null}<Badge name={choiceName(props, props.kit.operatorsTableId, props.kit.operator.active, row.values[props.kit.operator.active])} /></span></li>)}</ul>
      </div>}
        </div>
        <aside aria-label="Так видит клиент"><small>Так видит клиент</small><strong>{props.app.name}</strong><p>Категория, сообщение и срок ответа.</p><span>Написать</span></aside>
      </div>
    </ListScreenShell>
    {open ? <CategoryDialog {...props} onClose={() => setOpen(false)} onMessage={setMessage} /> : null}
  </div>
}

function CategoryDialog(props: ScreenProps & { onClose: () => void; onMessage: (value: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim()) { setError('Назовите категорию.'); return }
    setBusy(true)
    const result = await commit(props, { kind: 'category', name, description, active: true })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Новая категория" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Добавить категорию'}</button>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      <label className={css.field}><span>Название</span><input value={name} onChange={event => setName(event.target.value)} maxLength={80} required /></label>
      <label className={css.field}><span>Пояснение</span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}
