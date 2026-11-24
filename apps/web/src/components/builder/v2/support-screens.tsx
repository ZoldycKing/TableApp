'use client'
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import type { AppV2, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import { savePublishedSupportAction } from '@/app/support-actions'
import { deadlineTime, filterTickets, isOpenStatus, isOverdue, operatorTransitions, supportAuthorKind, supportAuthorLabel, supportDeadlineInstant, supportDeadlineParts, type SupportFilter, type SupportListItem, type SupportQueueFocus } from '@/lib/support-logic'
import { applySupportChange, isSupportDesk, supportStatusName, type SupportChange } from '@/lib/support-persist'
import { AppFrameDeviceContext } from './app-frame'
import { AppDialog } from './app-dialog'
import { supportSlaLabel } from '@/lib/support-sla'
import { SupportBoard, SupportDashboard, SupportPerson, SupportSlaSettings, slaFacts, slaWhen } from './support-desk'
import { DateMenu } from './booking-calendar'
import { DetailCardShell, DetailSection, ListScreenShell, ShellSearchField } from './layout-shell'
import shell from './layout-shell.module.css'
import { ProtoIcon } from '../prototype/icons'
import { usePublishedV2 } from './published-context'
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
export type SupportBundle = { rows: AppV2Record[]; setRows?: (rows: AppV2Record[]) => void; open?: SupportOpen; now?: number; sample?: boolean; queueFocus?: { current: SupportQueueFocus | null }; previewClient?: string; previewMenuOpen?: boolean }
export const SupportRowsContext = createContext<SupportBundle | null>(null)

const PLACEHOLDER: AppV2Node = { id: 'support_placeholder', name: 'placeholder', type: 'heading', value: { kind: 'literal', value: '' }, size: 's', visibleTo: null, visibleWhen: null }
const publishedHolder: { current: ReturnType<typeof usePublishedV2> } = { current: null }
const textOf = (value: unknown) => Array.isArray(value) ? '' : value == null ? '' : String(value)
const firstId = (value: unknown) => Array.isArray(value) ? value.find((item): item is string => typeof item === 'string') ?? '' : ''
const EMPTY_FILTER: SupportFilter = { search: '', status: '', priority: '', ageBucket: '', mine: false, scope: 'all' }

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

function QueueDeadline({ value, overdue }: { value: unknown; overdue: boolean }) {
  return <span className={css.deadline} data-overdue={overdue || undefined}>{formatWhen(value)}{overdue ? <span className={css.late}>Просрочено</span> : null}</span>
}

function formatWhen(value: unknown, empty = 'Срок не задан') {
  if (typeof value !== 'string' || !value) return empty
  const wall = instantToWallClock(value, 'Europe/Moscow')
  if (!wall) return empty
  const [year, month, day] = wall.date.split('-')
  return `${day}.${month}.${year}, ${wall.time}`
}

function transitionLabel(to: string) {
  if (to === 'В работе') return 'В работу'
  if (to === 'Ждём клиента') return 'Ждём клиента'
  if (to === 'Решено') return 'Решено'
  if (to === 'Закрыто') return 'Закрыть'
  return to
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
  const [now, setNow] = useState(demoNow ?? asOf ?? 0)
  useEffect(() => {
    if (demoNow != null) { setNow(demoNow); return }
    if (asOf == null) { setNow(Date.now()); return }
    const started = performance.now()
    const tick = () => setNow(asOf + performance.now() - started)
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [demoNow, asOf])
  if (demoNow != null) return demoNow
  if (asOf == null) return Date.now()
  return now || asOf
}

export function SupportScreen(props: AppV2RendererProps) {
  const kit = props.app.support
  const demo = useContext(SupportRowsContext)
  const device = useContext(AppFrameDeviceContext)
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
  const screens = kit ? [kit.queueScreenId, kit.ticketScreenId, kit.clientListScreenId, kit.clientTicketScreenId, kit.clientsScreenId, kit.settingsScreenId, kit.dashboardScreenId, kit.boardScreenId].filter((id): id is string => Boolean(id)) : []
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
  if (kit.dashboardScreenId && screenId === kit.dashboardScreenId) return <SupportDashboard {...shared} actorEmail={props.actor.email ?? ''} onOpenQueue={openQueue} onOpenTicket={id => props.onNavigate?.(kit.ticketScreenId, id)} onStatus={async () => ({ ok: false })} onSaveSla={async () => ({ ok: false })} />
  if (kit.boardScreenId && screenId === kit.boardScreenId) return <SupportBoard {...shared} phone={device === 'phone'} actorEmail={props.actor.email ?? ''} onOpenQueue={openQueue} onOpenTicket={id => props.onNavigate?.(kit.ticketScreenId, id)} onStatus={async (id, status) => commit(shared, { kind: 'status', recordId: id, statusId: statusId(shared, status) })} onSaveSla={async () => ({ ok: false })} />
  if (screenId === kit.queueScreenId || screenId === kit.clientListScreenId) return <TicketList {...shared} />
  if (screenId === kit.ticketScreenId || screenId === kit.clientTicketScreenId) return <TicketCard {...shared} />
  if (screenId === kit.clientsScreenId) return <ClientDirectory {...shared} />
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
      sla: slaFacts(props.kit, props.rows, row.id, props.now),
    }
  })
}

function ClientPreviewMenu(props: { clients: { id: string; name: string; email: string }[]; value: string; open: boolean; onOpen: (open: boolean) => void; onChange: (email: string) => void }) {
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
      {props.clients.map(client => <button key={client.id} type="button" role="option" aria-selected={client.email === props.value} onClick={() => { props.onChange(client.email); props.onOpen(false) }}>{client.name}<span className={css.quiet}>{client.email}</span></button>)}
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
    const next = focus?.current
    if (focus) focus.current = null
    if (!next) return EMPTY_FILTER
    return { ...EMPTY_FILTER, scope: next.scope, priority: next.priority ?? '', ageBucket: next.ageBucket ?? '' }
  })
  const [open, setOpen] = useState<SupportOpen>(bundle?.open ?? null)
  const clients = props.of(props.kit.clientsTableId).map(row => ({
    id: row.id,
    name: textOf(row.values[props.kit.client.name]) || 'Без имени',
    email: textOf(row.values[props.kit.client.email]).trim().toLowerCase(),
  })).filter(item => item.email)
  const [previewEmail, setPreviewEmail] = useState(bundle?.previewClient ?? clients[0]?.email ?? '')
  const [previewOpen, setPreviewOpen] = useState(Boolean(bundle?.previewMenuOpen))
  const items = ticketItems(props).filter(item => {
    if (!previewMode) return true
    if (!previewEmail) return false
    const row = props.of(props.kit.ticketsTableId).find(entry => entry.id === item.id)
    return textOf(row?.values[props.kit.ticket.clientEmail]).trim().toLowerCase() === previewEmail
  })
  const queueDesk = desk && !clientCabinet
  const counts = {
    open: items.filter(item => item.sla?.known ? item.sla.open : isOpenStatus(item.status)).length,
    unassigned: items.filter(item => (item.sla?.known ? item.sla.open : isOpenStatus(item.status)) && !item.assigneeEmail).length,
    risk: items.filter(item => item.sla?.currentRisk).length,
    overdue: items.filter(item => item.sla?.known ? item.sla.currentOverdue : isOverdue(item.status, item.deadline, props.now)).length,
  }
  const sample = bundle?.sample
  const visible = filterTickets(items, filter, props.actor.email ?? '', props.now)
    .sort((a, b) => {
      const openScore = Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status))
      if (openScore) return openScore
      return (deadlineTime(a.deadline) ?? Number.MAX_SAFE_INTEGER) - (deadlineTime(b.deadline) ?? Number.MAX_SAFE_INTEGER)
    })
  const backTo = queueDesk ? props.kit.queueScreenId : props.kit.clientListScreenId
  const openTicket = (id: string) => props.onNavigate?.(queueDesk ? props.kit.ticketScreenId : props.kit.clientTicketScreenId, id)
  return <div className={css.root} data-support-root data-support-screen={queueDesk ? 'queue' : 'client'} data-preview={previewMode || undefined}>
    <ListScreenShell
      title={queueDesk ? 'Очередь обращений' : 'Мои обращения'}
      meta={queueDesk ? 'Очередь службы поддержки.' : previewMode ? 'Просмотр кабинета клиента. Только чтение.' : 'Ваши обращения и ответы.'}
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
        {sample && queueDesk ? <p className={css.sample} role="note">Пример очереди.</p> : null}
        {queueDesk ? <fieldset className={css.summary} aria-label="Сводка обращений">
          <legend className={css.quiet}>Сводка</legend>
          {([['open', counts.open, 'Открытые'], ['unassigned', counts.unassigned, 'Без ответственного'], ['risk', counts.risk, 'Скоро срок'], ['overdue', counts.overdue, 'Просрочены']] as const).map(([scope, value, label]) => <button key={scope} type="button" aria-pressed={filter.scope === scope} onClick={() => setFilter(current => ({ ...current, scope: current.scope === scope ? 'all' : scope }))}><strong>{value}</strong><span>{label}</span></button>)}
        </fieldset> : null}
        {queueDesk ? <details className={css.filterDrawer} open={device !== 'phone'}>
          <summary>Фильтры{filter.scope !== 'all' || filter.status || filter.priority || filter.ageBucket || filter.mine ? ` · ${[filter.scope !== 'all' ? filter.scope : '', filter.status, filter.priority, filter.ageBucket, filter.mine ? 'мои' : ''].filter(Boolean).join(', ')}` : ''}</summary>
          <div>
        <div className={css.filters}>
          <ShellSearchField value={filter.search} onChange={search => setFilter(current => ({ ...current, search }))} label="Поиск обращений" placeholder="Тема, клиент или номер" />
          <button type="button" className={css.mine} aria-pressed={filter.mine} onClick={() => setFilter(current => ({ ...current, mine: !current.mine }))}>Мои</button>
        </div>
        <div className={css.chips} role="toolbar" aria-label="Статус">
          <button type="button" className={css.chip} aria-pressed={filter.status === ''} onClick={() => setFilter(current => ({ ...current, status: '' }))}>Все статусы</button>
          {['Новое', 'В работе', 'Ждём клиента', 'Решено', 'Закрыто'].map(status => <button key={status} type="button" className={css.chip} aria-pressed={filter.status === status} onClick={() => setFilter(current => ({ ...current, status: current.status === status ? '' : status }))}>{status}</button>)}
        </div>
        <div className={css.chips} role="toolbar" aria-label="Приоритет">
          {['Срочный', 'Высокий', 'Обычный', 'Низкий'].map(priority => <button key={priority} type="button" className={`${css.chip} ${css.priorityChip}`} data-tone={priorityTone(priority)} aria-pressed={filter.priority === priority} onClick={() => setFilter(current => ({ ...current, priority: current.priority === priority ? '' : priority }))}>{priority}</button>)}
        </div>
        {filter.ageBucket ? <div className={css.chips} role="status"><button type="button" className={css.chip} aria-pressed onClick={() => setFilter(current => ({ ...current, ageBucket: '' }))}>Возраст: {filter.ageBucket} · сбросить</button></div> : null}
          </div>
        </details> : null}
        {props.loading ? <p className={css.status} role="status">Загружаем обращения…</p> : null}
        {props.error ? <div className={css.status} role="alert"><p className={css.error}>{props.error}</p><button type="button" onClick={props.reload}>Повторить</button></div> : null}
        {!props.loading && !props.error && !visible.length ? <div className={css.empty}><ProtoIcon name="clipboard" size={28} /><p>{items.length ? 'Нет обращений с такими условиями.' : queueDesk ? 'Очередь пуста. Новое обращение появится здесь.' : previewMode ? 'У этого клиента пока нет обращений.' : 'У вас пока нет обращений.'}</p>{items.length && queueDesk ? <button type="button" onClick={() => setFilter(EMPTY_FILTER)}>Сбросить фильтры</button> : !previewMode ? <button type="button" onClick={() => setOpen('create')}>{queueDesk ? 'Создать обращение' : 'Написать обращение'}</button> : null}</div> : null}
        {visible.length ? <><ul className={css.cards}>
          {visible.map(item => <li key={item.id}><TicketButton item={item} now={props.now} showAssignee={queueDesk || previewMode} onOpen={() => openTicket(item.id)} /></li>)}
        </ul>
        <div className={css.tableWrap}>
          <table className={css.table} data-columns={queueDesk ? 6 : 5}>
            <caption className={css.quiet}>Список обращений</caption>
            <colgroup>
              <col className={css.subjectCol} />
              <col className={css.whoCol} />
              <col className={css.stateCol} />
              <col className={css.priorityCol} />
              <col className={css.whenCol} />
              {queueDesk ? <col className={css.ownerCol} /> : null}
            </colgroup>
            <thead><tr><th>Обращение</th><th>Клиент</th><th>Статус</th><th>Приоритет</th><th>Срок</th>{queueDesk ? <th>Ответственный</th> : null}</tr></thead>
            <tbody>
              {visible.map(item => {
                const overdue = isOverdue(item.status, item.deadline, props.now)
                return <tr key={item.id}>
                  <td><button type="button" className={css.rowButton} onClick={() => openTicket(item.id)}><span className={css.subject}>{item.subject || 'Без темы'}</span>{item.number ? <span className={css.number}>{item.number}</span> : null}</button></td>
                  <td><span className={css.person}>{item.clientName || 'Клиент не указан'}{item.category ? <span>{item.category}</span> : null}</span></td>
                  <td><QueueStatus name={item.status} /></td>
                  <td><QueuePriority name={item.priority} /></td>
                  <td><span className={css.deadline}>{item.sla?.known && (item.sla.first.dueAt || item.sla.resolution.dueAt) ? slaWhen(item.sla.first.dueAt && !item.sla.first.met ? item.sla.first.dueAt : item.sla.resolution.dueAt) : formatWhen(item.deadline)}{item.sla?.known && supportSlaLabel(item.sla) ? <span className={item.sla.currentOverdue ? css.late : css.quiet}>{supportSlaLabel(item.sla)}</span> : overdue ? <span className={css.late}>Просрочено</span> : null}</span></td>
                  {queueDesk ? <td>{item.assigneeName ? <span className={css.personInline}><SupportPerson name={item.assigneeName} size={24} /><span>{item.assigneeName}</span></span> : <span className={css.person} data-empty>Не назначен</span>}</td> : null}
                </tr>
              })}
            </tbody>
          </table>
        </div></> : null}
      </div>
    </ListScreenShell>
    {open === 'create' && !previewMode ? <CreateDialog {...props} desk={queueDesk} onClose={() => setOpen(null)} onDone={id => { setOpen(null); if (id) props.onNavigate?.(backTo, undefined) }} /> : null}
  </div>
}

function TicketButton({ item, now, onOpen, showAssignee = true }: { item: SupportListItem; now: number; onOpen: () => void; showAssignee?: boolean }) {
  const overdue = isOverdue(item.status, item.deadline, now)
  return <button type="button" className={css.card} onClick={onOpen}>
    <span className={css.subject}>{item.subject || 'Без темы'}</span>
    {item.number ? <span className={css.number}>{item.number}</span> : null}
    <span className={css.quiet}>{item.clientName || 'Клиент не указан'}{item.category ? ` · ${item.category}` : ''}</span>
    <span className={css.cardFacts}><QueueStatus name={item.status} /><QueuePriority name={item.priority} /></span>
    <span className={css.meta}>
      {showAssignee ? (item.assigneeName ? <span className={css.personInline}><SupportPerson name={item.assigneeName} size={20} /><span>{item.assigneeName}</span></span> : 'Не назначен') : null}
      {showAssignee ? ' · ' : null}
      {item.sla?.known && (item.sla.first.dueAt || item.sla.resolution.dueAt) ? slaWhen(item.sla.first.dueAt && !item.sla.first.met ? item.sla.first.dueAt : item.sla.resolution.dueAt) : formatWhen(item.deadline)}
      {item.sla?.known && supportSlaLabel(item.sla) ? <span className={item.sla.currentOverdue ? css.late : css.quiet}>{supportSlaLabel(item.sla)}</span> : overdue ? <span className={css.late}>Просрочено</span> : null}
    </span>
  </button>
}

function TicketCard(props: ScreenProps) {
  const clientView = props.screenId === props.kit.clientTicketScreenId
  const desk = isSupportDesk(props.actor) && !clientView
  const ticket = props.of(props.kit.ticketsTableId).find(row => row.id === props.recordId) ?? (props.record?.tableId === props.kit.ticketsTableId ? props.record : undefined)
  const bundle = useContext(SupportRowsContext)
  const [dialog, setDialog] = useState<SupportOpen>(bundle?.open ?? null)
  const [message, setMessage] = useState('')
  const back = desk ? props.kit.queueScreenId : props.kit.clientListScreenId
  if (!ticket) return <div className={css.root} data-support-root data-support-screen="missing">{props.loading ? <p role="status">Загружаем обращение…</p> : <div className={css.empty}><p>Обращение не найдено или вам недоступно.</p><button type="button" onClick={() => props.onNavigate?.(back)}>К списку</button></div>}</div>
  const fields = props.kit.ticket
  const status = supportStatusName(props.kit, ticket.values[fields.status]) || choiceName(props, props.kit.ticketsTableId, fields.status, ticket.values[fields.status])
  const priority = choiceName(props, props.kit.ticketsTableId, fields.priority, ticket.values[fields.priority])
  const categoryId = firstId(ticket.values[fields.category])
  const assigneeId = firstId(ticket.values[fields.assignee])
  const category = nameOf(props, props.kit.categoriesTableId, categoryId, props.kit.category.name)
  const assignee = nameOf(props, props.kit.operatorsTableId, assigneeId, props.kit.operator.name)
  const overdue = isOverdue(status, ticket.values[fields.deadline], props.now)
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
  const replyLabel = status === 'Решено' || status === 'Закрыто' ? 'Переоткрыть' : 'Ответить'
  const waiting = status === 'Ждём клиента'
  return <div className={css.root} data-support-root data-support-screen={desk ? 'ticket' : 'client-ticket'} data-support-status={status}>
    <DetailCardShell
      back={{ label: desk ? 'Очередь' : 'Мои обращения', onClick: () => props.onNavigate?.(back) }}
      title={textOf(ticket.values[fields.subject]) || 'Без темы'}
      subtitle={textOf(ticket.values[fields.number])}
      badge={<span className={css.badges}><StatusBadge name={status} />{overdue ? <StatusBadge name="Просрочено" /> : null}<PriorityBadge name={priority} /></span>}
      actions={clientView && isSupportDesk(props.actor) ? undefined : <div className={css.actions}>
        <button type="button" className={css.primary} onClick={() => setDialog('reply')}>{replyLabel}</button>
        {transitions.length || desk ? <details className={css.moreActions}>
          <summary>Статус и назначение</summary>
          <div>
            {desk && status !== 'Закрыто' ? <button type="button" onClick={() => setDialog('assign')}>Назначить</button> : null}
            {transitions.map(next => <button key={next} type="button" onClick={() => void runStatus(props, ticket.id, statusId(props, next), setMessage)}>{transitionLabel(next)}</button>)}
            {desk ? <button type="button" onClick={() => setDialog('note')}>Внутренняя заметка</button> : null}
          </div>
        </details> : null}
      </div>}
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
            {props.error ? <p className={css.error} role="alert">{props.error}</p> : null}
            {message ? <p role="status">{message}</p> : null}
            {!timeline.length ? <div className={css.empty}><p>Сообщений пока нет. Ответ появится в этой ленте.</p></div> : null}
            <ol className={css.timeline} aria-label="Хронология">
              {timeline.map(entry => <li key={entry.id} className={css.message} data-internal={entry.internal || undefined} data-support-note={entry.internal || undefined} data-author-kind={entry.internal ? 'note' : entry.label === 'Клиент' ? 'client' : 'operator'}>
                <header>
                  {entry.kind === 'operator' && !entry.internal ? <SupportPerson name={entry.author} size={28} /> : null}
                  <strong>{entry.author || 'Без имени'}</strong>
                  <span className={css.quiet}>{formatWhen(entry.at, 'Время не указано')}</span>
                  {entry.internal ? <span className={css.noteFlag}>Внутренняя заметка. Клиент это не видит.</span> : <span className={css.quiet}>{entry.label}</span>}
                </header>
                <p>{entry.text}</p>
              </li>)}
            </ol>
          </DetailSection>
        </div>
        {!clientView ? <aside className={`${shell.detailSideCol} ${css.factsCol}`}>
          <DetailSection title="Сведения">
            <dl className={css.facts}>
              <div><dt>Клиент</dt><dd>{clientName || 'Не указан'}</dd></div>
              <div><dt>Ответственный</dt><dd>{assignee ? <span className={css.personInline}><SupportPerson name={assignee} size={24} /><span>{assignee}</span></span> : 'Не назначен'}</dd></div>
              <div><dt>Приоритет</dt><dd><PriorityBadge name={priority} />{!priority ? 'Не указан' : null}</dd></div>
              <div><dt>Категория</dt><dd>{category || 'Без категории'}</dd></div>
              <div><dt>Срок</dt><dd>{formatWhen(ticket.values[fields.deadline])}{overdue ? '. Просрочено' : ''}</dd></div>
              <div><dt>Норматив</dt><dd>{slaFacts(props.kit, props.rows, ticket.id, props.now).known ? supportSlaLabel(slaFacts(props.kit, props.rows, ticket.id, props.now)) || 'В срок' : 'Нет данных'}</dd></div>
            </dl>
          </DetailSection>
        </aside> : null}
      </div>
    </DetailCardShell>
    {dialog === 'reply' && !(clientView && isSupportDesk(props.actor)) ? <ReplyDialog {...props} ticketId={ticket.id} reopen={status === 'Решено' || status === 'Закрыто'} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
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

function CreateDialog(props: ScreenProps & { desk: boolean; onClose: () => void; onDone: (id?: string) => void }) {
  useDialogBehavior(props.onClose)
  const formId = useId()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const categories = props.of(props.kit.categoriesTableId).filter(row => row.values[props.kit.category.active] === true)
  const clients = props.of(props.kit.clientsTableId)
  const save = async () => {
    if (!subject.trim() || !description.trim() || !categoryId || (props.desk && !clientId)) { setError('Заполните тему, описание и категорию.'); return }
    setBusy(true)
    const result = await commit(props, { kind: 'create', subject, description, categoryId, ...(props.desk ? { clientId } : {}) })
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
  const [date, setDate] = useState(initialDeadline.date)
  const [time, setTime] = useState(initialDeadline.time)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const operators = props.of(props.kit.operatorsTableId).filter(row => row.values[props.kit.operator.active] === props.kit.activeChoiceId || row.id === assigneeId)
  const categories = props.of(props.kit.categoriesTableId)
  const priorities = props.tables.find(table => table.id === props.kit.ticketsTableId)?.fields.find(field => field.id === fields.priority)?.choices ?? []
  const save = async () => {
    if (!priorityId || !categoryId) { setError('Выберите приоритет и категорию.'); return }
    setBusy(true)
    const result = await commit(props, { kind: 'assign', recordId: props.ticket.id, assigneeId: assigneeId || null, priorityId, categoryId, deadline: supportDeadlineInstant(date, time) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Ответственный и срок" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}>
    <form id={formId} data-support-form="assign" onSubmit={event => { event.preventDefault(); void save() }}>
      <ChoiceRow label="Ответственный" value={assigneeId} options={[{ id: '', name: 'Не назначен' }, ...operators.map(row => ({ id: row.id, name: textOf(row.values[props.kit.operator.name]) || 'Без имени' }))]} onChange={setAssigneeId} />
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

function ClientDirectory(props: ScreenProps) {
  const clients = props.of(props.kit.clientsTableId)
  return <div className={css.root} data-support-root data-support-screen="clients">
    <ListScreenShell title="Клиенты" meta="Заметка о клиенте видна только службе. Клиент её не открывает.">
      {props.loading ? <p role="status">Загружаем клиентов…</p> : null}
      {!props.loading && !clients.length ? <div className={css.empty}><p>Клиентов пока нет.</p></div> : null}
      <ul className={css.directory}>{clients.map(row => <li key={row.id}><strong>{textOf(row.values[props.kit.client.name]) || 'Без имени'}</strong><span className={css.quiet}>{[textOf(row.values[props.kit.client.company]), textOf(row.values[props.kit.client.phone])].filter(Boolean).join(' · ') || 'Контакты не указаны'}</span></li>)}</ul>
    </ListScreenShell>
  </div>
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
  return <div className={css.root} data-support-root data-support-screen="settings">
    <ListScreenShell title="Настройки службы" meta="Категории для новых обращений." actions={<button type="button" className={css.mine} onClick={() => setOpen(true)}>Добавить категорию</button>}>
      <div className={css.stack}>
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
        <ul className={css.directory}>{operators.map(row => <li key={row.id}><strong>{textOf(row.values[props.kit.operator.name])}</strong><span className={css.badges}><Badge name={choiceName(props, props.kit.operatorsTableId, props.kit.operator.role, row.values[props.kit.operator.role])} /><Badge name={choiceName(props, props.kit.operatorsTableId, props.kit.operator.active, row.values[props.kit.operator.active])} /></span></li>)}</ul>
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
