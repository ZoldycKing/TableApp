'use client'
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { dateInstant, instantToWallClock } from '@tableapp/schema'
import type { AppV2, AppV2Json, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import type { Attachment } from '@tableapp/schema'
import type { BuilderV2Table } from '@/lib/builder-v2'
import {
  DISPATCH_TIME_ZONE, activeTechnicians, assignmentPatch, completionPatch, isOverdue, isUnassigned,
  keepCalendarResource, matchesCounter, noteDraft, priorityRank, reassignedNotes, sortJobs, technicianGroup, technicianIdOf,
  type DispatchCounter, type DispatchJobFacts,
} from '@/lib/dispatch-logic'
import {
  REPEAT_OPTIONS, actualMinutesOf, billingTotal, checklistProgress, completionChecklistWarning, correctActualMinutes,
  distinctJobAddress, formatDuration, formatRub, parseChecklist, parseMoneyLines, recurrenceOccurrences, repeatName,
  repeatRuleFromName, serializeChecklist, serializeMoneyLines, seriesEditIds, startVisit, stopVisit, toggleChecklistItem,
  type ChecklistItem, type MoneyLine, type RepeatRule,
} from '@/lib/dispatch-stage2'
import { buildWorkActPdf, type ActImage } from '@/lib/dispatch-act'
import { progressValues } from '@/lib/dispatch-persist'
import { savePublishedDispatchAction } from '@/app/dispatch-actions'
import { usePublishedV2 } from './published-context'
import { teamCalendarSnapshot } from '@/lib/team-calendar-model'
import { applyDemoCalendarMove } from '@/lib/team-calendar-demo-move'
import type { BuilderV2DataRecord } from '@/lib/builder-v2-data-types'
import { useBuilderV2NodeData } from './use-data'
import { DateMenu, TeamCalendarView } from './booking-calendar'
import { AppDialog } from './app-dialog'
import { DetailCardShell, DetailSection, ListScreenShell, ShellSearchField } from './layout-shell'
import { BookingAvatar } from './booking-avatar'
import { RuDateInput, RuTimeInput, ruNumericDate } from './ru-fields'
import { SignaturePad } from './signature-pad'
import { CameraIcon, ClockIcon } from '@phosphor-icons/react'
import { ProtoIcon } from '../prototype/icons'
import scroll from './scroll-overflow.module.css'
import { useScrollOverflow } from './scroll-overflow'
import buttons from '../prototype/prototype.module.css'
import type { AppV2RendererProps } from './view'
import css from './dispatch.module.css'

export type DispatchBundle = {
  rows: AppV2Record[]
  setRows?: (rows: AppV2Record[]) => void
  boardView?: 'day' | 'week' | 'list'
  dropPreview?: boolean
  open?: 'complete' | 'repeat' | null
}
export const DispatchRowsContext = createContext<DispatchBundle | null>(null)

const PLACEHOLDER: AppV2Node = { id: 'dispatch_placeholder', name: 'placeholder', type: 'heading', value: { kind: 'literal', value: '' }, size: 's', visibleTo: null, visibleWhen: null }
const COUNTERS: { id: DispatchCounter; label: string; tone?: 'rose' }[] = [
  { id: 'overdue', label: 'Просрочено', tone: 'rose' },
  { id: 'today', label: 'Сегодня' },
  { id: 'unassigned', label: 'Не назначено' },
  { id: 'inProgress', label: 'В работе' },
]
const PRIORITIES = ['Срочный', 'Высокий', 'Обычный', 'Низкий'] as const
const GROUPS = [{ id: 'overdue' as const, label: 'Просрочено' }, { id: 'today' as const, label: 'Сегодня' }, { id: 'later' as const, label: 'Дальше' }]

const textOf = (value: unknown) => Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : '').filter(Boolean).join(', ') : value == null ? '' : String(value)
const read = (row: AppV2Record, fieldId: string | undefined) => fieldId ? row.values[fieldId] : undefined
const choiceName = (tables: readonly BuilderV2Table[], tableId: string, fieldId: string, value: unknown) => {
  const field = tables.find(table => table.id === tableId)?.fields.find(item => item.id === fieldId)
  return typeof value === 'string' ? field?.choices?.find(choice => choice.id === value)?.name ?? value : ''
}
const relatedName = (rows: readonly AppV2Record[], tables: readonly BuilderV2Table[], value: unknown) => {
  const ids = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  return ids.map(id => {
    const row = rows.find(item => item.id === id)
    const primary = tables.find(table => table.id === row?.tableId)?.primaryFieldId
    return row && primary ? textOf(row.values[primary]) : ''
  }).filter(Boolean).join(', ')
}
const whenLabel = (value: unknown) => {
  const instant = dateInstant(value, DISPATCH_TIME_ZONE)
  if (instant === null) return 'Время не указано'
  const date = new Date(instant)
  return `${ruNumericDate(date, DISPATCH_TIME_ZONE)}, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: DISPATCH_TIME_ZONE })}`
}
const telHref = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : null
}
const mediaUrl = (value: unknown): string | null => {
  if (typeof value === 'string' && (value.startsWith('/') || value.startsWith('data:image') || value.startsWith('http'))) return value
  if (!Array.isArray(value)) return null
  for (const item of value) {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object' && 'url' in item && typeof item.url === 'string') return item.url
  }
  return null
}
const toneOf = (name: string) => name === 'Срочный' || name === 'Просрочено' ? 'red' : name === 'Высокий' ? 'orange' : name === 'Обычный' || name === 'Новая' ? 'blue' : name === 'Низкий' || name === 'Отменена' || name === 'Неактивен' ? 'gray' : name === 'Выполнено' || name === 'Активен' ? 'green' : name === 'Выехал' ? 'amber' : name === 'На месте' ? 'orange' : name === 'Назначена' ? 'indigo' : 'blue'

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

function Badge({ name }: { name: string }) {
  if (!name) return null
  return <span className={css.badge} data-tone={toneOf(name)}>{name}</span>
}

function JobBadges({ priority, status, overdue, statusFirst = false }: { priority: string; status: string; overdue: boolean; statusFirst?: boolean }) {
  const priorityBadge = <Badge name={priority} />
  const statusBadge = <Badge name={status} />
  return <span className={css.badges}>
    {statusFirst ? statusBadge : priorityBadge}
    {statusFirst ? priorityBadge : statusBadge}
    {overdue ? <span className={css.badge} data-tone="red">Просрочено</span> : null}
  </span>
}

export function DispatchScreen(props: AppV2RendererProps) {
  const dispatch = props.app.dispatch
  const demo = useContext(DispatchRowsContext)
  const screenId = props.screenId
  const recordId = props.record?.id
  const jobsNode = dispatch ? collectionOn(props.app, screenId, dispatch.jobsTableId) : null
  const mastersNode = dispatch ? collectionOn(props.app, screenId, dispatch.mastersTableId) : null
  const clientsNode = dispatch ? collectionOn(props.app, screenId, dispatch.clientsTableId) : null
  const notesNode = dispatch ? collectionOn(props.app, screenId, dispatch.notesTableId) : null
  const live = Boolean(props.live) && !demo
  const scope = { screenId, ...(recordId ? { recordId } : {}) }
  const jobsPage = useBuilderV2NodeData(props.app, jobsNode ?? PLACEHOLDER, live && Boolean(jobsNode), '', scope)
  const mastersPage = useBuilderV2NodeData(props.app, mastersNode ?? PLACEHOLDER, live && Boolean(mastersNode), '', scope)
  const clientsPage = useBuilderV2NodeData(props.app, clientsNode ?? PLACEHOLDER, live && Boolean(clientsNode), '', scope)
  const notesPage = useBuilderV2NodeData(props.app, notesNode ?? PLACEHOLDER, live && Boolean(notesNode), '', scope)
  if (!dispatch || !props.app.screens.some(screen => screen.id === screenId && [dispatch.overviewScreenId, dispatch.boardScreenId, dispatch.jobScreenId, dispatch.clientsScreenId, dispatch.clientScreenId, dispatch.technicianScreenId, dispatch.mastersScreenId].includes(screen.id))) return null
  const rows = demo?.rows ?? [
    ...(jobsPage.page?.rows ?? []), ...(mastersPage.page?.rows ?? []), ...(clientsPage.page?.rows ?? []), ...(notesPage.page?.rows ?? []),
  ]
  const of = (tableId: string) => rows.filter(row => row.tableId === tableId)
  const replace = (next: AppV2Record[]) => demo?.setRows?.(next)
  const now = Date.now()
  const shared = { ...props, dispatch, rows, of, replace, now }
  if (screenId === dispatch.overviewScreenId) return <Overview {...shared} />
  if (screenId === dispatch.boardScreenId) return <Board {...shared} />
  if (screenId === dispatch.technicianScreenId) return <TechnicianList {...shared} />
  if (screenId === dispatch.jobScreenId) return <JobCard {...shared} />
  if (screenId === dispatch.clientsScreenId) return <ClientList {...shared} />
  if (screenId === dispatch.clientScreenId) return <ClientCard {...shared} />
  if (screenId === dispatch.mastersScreenId) return <MasterList {...shared} />
  return null
}

type ScreenProps = Omit<AppV2RendererProps, 'rows'> & {
  dispatch: NonNullable<AppV2['dispatch']>
  rows: AppV2Record[]
  of: (tableId: string) => AppV2Record[]
  replace?: (rows: AppV2Record[]) => void
  now: number
}

function jobFacts(props: ScreenProps, row: AppV2Record): DispatchJobFacts {
  const job = props.dispatch.job
  return {
    id: row.id,
    status: choiceName(props.tables, props.dispatch.jobsTableId, job.status, row.values[job.status]),
    priority: choiceName(props.tables, props.dispatch.jobsTableId, job.priority, row.values[job.priority]),
    when: row.values[job.when] ?? row.values[job.date],
    technicianId: technicianIdOf(row.values[job.technician]),
    masterEmail: textOf(row.values[job.masterEmail]),
  }
}
const clientLabel = (props: ScreenProps, row: AppV2Record) => textOf(row.values[props.dispatch.job.clientName]) || relatedName(props.rows, props.tables, row.values[props.dispatch.job.client])
const addressOf = (props: ScreenProps, row: AppV2Record) => textOf(props.dispatch.job.site ? row.values[props.dispatch.job.site] : '') || textOf(row.values[props.dispatch.job.address])
const phoneOf = (props: ScreenProps, row: AppV2Record) => textOf(row.values[props.dispatch.job.phone])
const useNow = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}
const useCoarsePointer = () => {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)')
    const update = () => setCoarse(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return coarse
}

function JobButton(props: ScreenProps & { row: AppV2Record; showAssignee?: boolean; hideClient?: boolean; clientAddress?: string }) {
  const facts = jobFacts(props, props.row)
  const overdue = isOverdue(facts, props.now)
  const person = technicians(props).find(item => item.id === facts.technicianId)
  const rawAddress = addressOf(props, props.row)
  const address = props.clientAddress != null ? distinctJobAddress(rawAddress, props.clientAddress) : rawAddress
  const when = whenLabel(facts.when)
  const series = textOf(read(props.row, props.dispatch.job.seriesId))
  return <li><button type="button" className={css.job} data-table={props.showAssignee ? true : undefined} data-address={props.showAssignee ? true : undefined} onClick={() => props.onNavigate?.(props.dispatch.jobScreenId, props.row.id)}>
    <span className={css.titleRow}><strong className={css.jobTitle}>{textOf(props.row.values[props.dispatch.job.what])}</strong>{series ? <span className={css.series}>Серия</span> : null}</span>
    <span className={css.jobLine} data-who>{props.hideClient ? <span>{when}</span> : <><span>{clientLabel(props, props.row) || 'Клиент не указан'}</span><span>{when}</span></>}</span>
    {props.showAssignee || address ? <span className={css.jobLine} data-address>{address || ''}</span> : null}
    {props.showAssignee ? <span className={css.assignee}>{person ? <><BookingAvatar name={person.name} photo={person.photo} small /><span>{person.name}</span></> : <><ProtoIcon name="user" size={16} /><span>Не назначено</span></>}</span> : null}
    <span className={css.jobFoot}><JobBadges priority={facts.priority} status={facts.status} overdue={overdue} /></span>
  </button></li>
}

function Choices({ label, value, options, onChange }: { label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void }) {
  return <fieldset className={css.choices}><legend>{label}</legend><div className={css.choiceRow} role="radiogroup" aria-label={label}>{options.map(option => <button key={option.id} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)}>{option.name}</button>)}</div></fieldset>
}

function CheckControl({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return <button type="button" role="checkbox" aria-checked={checked} className={css.check} onClick={onToggle}><span data-on={checked || undefined}>{checked ? <ProtoIcon name="check" size={12} /> : null}</span><span>{label}</span></button>
}

function Overview(props: ScreenProps) {
  const [counter, setCounter] = useState<DispatchCounter | null>(null)
  const [priority, setPriority] = useState('')
  const [sort, setSort] = useState<'when' | 'priority'>('when')
  const [search, setSearch] = useState('')
  const chips = useRef<HTMLDivElement>(null)
  useScrollOverflow(chips, [priority])
  const jobs = props.of(props.dispatch.jobsTableId).map(row => ({ row, facts: jobFacts(props, row) }))
  const counts = {
    overdue: jobs.filter(item => matchesCounter(item.facts, 'overdue', props.now)).length,
    today: jobs.filter(item => matchesCounter(item.facts, 'today', props.now)).length,
    unassigned: jobs.filter(item => matchesCounter(item.facts, 'unassigned', props.now)).length,
    inProgress: jobs.filter(item => matchesCounter(item.facts, 'inProgress', props.now)).length,
  }
  const openFirst = (item: { facts: DispatchJobFacts }) => item.facts.status === 'Выполнено' || item.facts.status === 'Отменена' ? 1 : 0
  const shown = sortJobs(jobs.filter(item => {
    if (counter && !matchesCounter(item.facts, counter, props.now)) return false
    if (priority && item.facts.priority !== priority) return false
    const haystack = `${textOf(item.row.values[props.dispatch.job.what])} ${clientLabel(props, item.row)} ${addressOf(props, item.row)}`.toLocaleLowerCase('ru-RU')
    return !search.trim() || haystack.includes(search.trim().toLocaleLowerCase('ru-RU'))
  }).map(item => item.facts), sort).map(facts => jobs.find(item => item.facts.id === facts.id)!).filter(Boolean)
    .sort((a, b) => openFirst(a) - openFirst(b))
  return <div className={css.root} data-dispatch-screen="overview">
    <ListScreenShell title="Заявки" meta="Диспетчер видит все выезды по Москве" search={<ShellSearchField value={search} onChange={setSearch} placeholder="Клиент, адрес или работа" />}>
      <div className={css.stack}>
      <div className={css.counters} role="group" aria-label="Сводка заявок">
        {COUNTERS.map(item => <button key={item.id} type="button" className={css.counter} data-tone={item.tone} data-active={counter === item.id || undefined} aria-pressed={counter === item.id} onClick={() => setCounter(current => current === item.id ? null : item.id)}>
          <strong>{counts[item.id]}</strong><span>{item.label}</span>
        </button>)}
      </div>
      <div className={css.toolbar}>
        <div ref={chips} className={`${css.chips} ${scroll.row}`} role="group" aria-label="Приоритет">
          <button type="button" className={css.chip} aria-pressed={!priority} onClick={() => setPriority('')}>Все приоритеты</button>
          {PRIORITIES.map(item => <button key={item} type="button" className={css.chip} aria-pressed={priority === item} onClick={() => setPriority(current => current === item ? '' : item)}>{item}</button>)}
        </div>
        <div className={css.segment} role="group" aria-label="Сортировка">
          <button type="button" aria-pressed={sort === 'when'} onClick={() => setSort('when')}>По времени</button>
          <button type="button" aria-pressed={sort === 'priority'} onClick={() => setSort('priority')}>По приоритету</button>
        </div>
      </div>
      {shown.length ? <ul className={css.list}>{shown.map(item => <JobButton key={item.row.id} {...props} row={item.row} showAssignee />)}</ul> : <p className={css.empty}>{search || counter || priority ? 'Таких заявок нет. Снимите фильтр или измените поиск.' : 'Заявок пока нет.'}</p>}
      </div>
    </ListScreenShell>
  </div>
}

function technicians(props: ScreenProps) {
  return props.of(props.dispatch.mastersTableId).map(row => ({
    row,
    id: row.id,
    name: textOf(row.values[props.dispatch.master.name]),
    email: textOf(row.values[props.dispatch.master.email]),
    active: choiceName(props.tables, props.dispatch.mastersTableId, props.dispatch.master.active, row.values[props.dispatch.master.active]) === 'Активен',
    photo: row.values[props.dispatch.master.photo],
  }))
}

function applyAssignment(props: ScreenProps, job: AppV2Record, technician: ReturnType<typeof technicians>[number], whenIso: string) {
  const result = assignmentPatch({
    technician, whenIso,
    currentStatus: jobFacts(props, job).status,
    freshStatus: 'Новая', assignedStatus: choiceName(props.tables, props.dispatch.jobsTableId, props.dispatch.job.status, props.dispatch.statuses.assigned) || 'Назначена',
    technicianField: props.dispatch.job.technician, nameField: props.dispatch.job.master, emailField: props.dispatch.job.masterEmail,
    whenField: props.dispatch.job.when, dateField: props.dispatch.job.date, statusField: props.dispatch.job.status,
  })
  if (!result.ok) return result
  const statusId = jobFacts(props, job).status === 'Новая' ? props.dispatch.statuses.assigned : job.values[props.dispatch.job.status]
  const next = props.rows.map(row => {
    if (row.id === job.id) return { ...row, values: { ...row.values, ...result.patch, [props.dispatch.job.status]: statusId } }
    const linked = technicianIdOf(row.values[props.dispatch.note.job])
    if (row.tableId === props.dispatch.notesTableId && linked === job.id) return { ...row, values: { ...row.values, [props.dispatch.note.masterEmail]: technician.email.trim().toLowerCase() } }
    return row
  })
  props.replace?.(next as AppV2Record[])
  return { ok: true as const }
}

function Board(props: ScreenProps) {
  const demo = useContext(DispatchRowsContext)
  const coarse = useCoarsePointer()
  const [assign, setAssign] = useState<{ jobId: string | null; technicianId: string; day: string; time: string } | null>(null)
  const calendar = props.app.nodes.find(node => node.id === props.dispatch.calendarNodeId)
  const people = technicians(props)
  const active = activeTechnicians(people)
  const jobs = props.of(props.dispatch.jobsTableId)
  const unassigned = jobs.filter(row => {
    const facts = jobFacts(props, row)
    return isUnassigned(facts) && facts.status !== 'Выполнено' && facts.status !== 'Отменена'
  })
  const displayRow = (row: AppV2Record): BuilderV2DataRecord => {
    const display: Record<string, string> = {}
    for (const [fieldId, value] of Object.entries(row.values)) {
      const table = props.tables.find(item => item.id === row.tableId)
      const field = table?.fields.find(item => item.id === fieldId)
      display[fieldId] = field?.choices ? choiceName(props.tables, row.tableId, fieldId, value) : field?.type === 'relation' ? relatedName(props.rows, props.tables, value) : textOf(value)
    }
    return { ...row, display }
  }
  const loader = (query: { screenId: string; day: string; week: boolean }) => {
    if (calendar?.type !== 'team_calendar' || !calendar.data) return { ok: false as const, error: 'Доска дня не настроена.' }
    const resources = people.filter(person => keepCalendarResource(person.row.values[props.dispatch.master.active], props.dispatch.activeChoiceId, true)).map(person => person.row).map(displayRow)
    const data = teamCalendarSnapshot(calendar.data, {
      events: jobs.map(displayRow),
      resources,
      hours: null,
    }, { ...query, nodeId: calendar.id }, DISPATCH_TIME_ZONE)
    return { ok: true as const, data }
  }
  const move = async (eventId: string, slot: { resourceId: string; day: string; time: string }) => {
    if (calendar?.type !== 'team_calendar') return { ok: false as const, error: 'Доска дня не настроена.' }
    const result = applyDemoCalendarMove({
      app: props.app, actor: props.actor, node: calendar, rows: props.rows, format: displayRow,
      eventId, ...slot, timeZone: DISPATCH_TIME_ZONE, screenId: props.screenId,
    })
    if (!result.ok || result.unchanged) return result.ok ? { ok: true as const, unchanged: true } : result
    const email = String(result.rows.find(row => row.id === eventId)?.values[props.dispatch.job.masterEmail] ?? '')
    const notes = reassignedNotes(props.of(props.dispatch.notesTableId).map(row => ({ row, jobId: technicianIdOf(row.values[props.dispatch.note.job]) ?? '', masterEmail: textOf(row.values[props.dispatch.note.masterEmail]) })), eventId, email)
    const rewritten = result.rows.map(row => {
      const note = notes.find(item => item.row.id === row.id)
      return note ? { ...row, values: { ...row.values, [props.dispatch.note.masterEmail]: note.masterEmail } } : row
    })
    props.replace?.(rewritten)
    return { ok: true as const }
  }
  return <div className={css.root} data-dispatch-screen="board">
    <div className={css.board}>
      {calendar?.type === 'team_calendar' ? <TeamCalendarView
        app={props.app} screenId={props.screenId} timeZone={DISPATCH_TIME_ZONE} title="Доска дня" meta="Выезды по мастерам"
        resourceLabel="Мастер" resourcesLabel="Мастера" showMetrics={false} showWorkingHours={false} showAmounts={false} showNoShows={false}
        hourPixels={48} loader={loader} loaderKey={jobs.map(row => `${row.id}:${textOf(row.values[props.dispatch.job.when])}:${textOf(row.values[props.dispatch.job.technician])}`).join('|')}
        onOpenVisit={id => props.onNavigate?.(props.dispatch.jobScreenId, id)}
        plainControls
        defaultView={demo?.boardView ?? 'day'}
        visitForms={['заявка', 'заявки', 'заявок']}
        compactWeek
        onMove={props.replace ? move : undefined}
        onAssignDrop={props.replace ? slot => {
          const technician = active.find(item => item.id === slot.resourceId)
          const job = unassigned.find(row => row.id === slot.jobId) ?? jobs.find(row => row.id === slot.jobId)
          if (!technician || !job) return
          const when = dateInstant(`${slot.day}T${slot.time}`, DISPATCH_TIME_ZONE)
          if (when === null) return
          applyAssignment(props, job, technician, new Date(when).toISOString())
        } : undefined}
        dropPreview={demo?.dropPreview && active[0] ? { resourceId: active[0].id, day: instantToWallClock(new Date(props.now), DISPATCH_TIME_ZONE)?.date ?? '', time: '11:00', label: textOf(unassigned[0]?.values[props.dispatch.job.what]) || 'Заявка' } : null}
        onCreate={slot => setAssign({ jobId: unassigned[0]?.id ?? null, technicianId: slot.resourceId ?? '', day: slot.day ?? '', time: slot.time ?? '10:00' })}
      /> : <p className={css.empty}>Доска дня не настроена.</p>}
      <aside className={css.panel} aria-label="Не назначено">
        <h2>Не назначено <span>· {unassigned.length}</span></h2>
        <p className={css.meta}>{unassigned.length ? (coarse ? 'Нажмите «Назначить» и выберите мастера.' : 'Перетащите заявку на мастера или нажмите «Назначить».') : 'Все открытые заявки уже назначены.'}</p>
        {unassigned.map(row => <div key={row.id} className={css.panelCard} data-dispatch-unassigned draggable={!coarse} onDragStart={drag => { drag.dataTransfer.setData('text/plain', `dispatch-job|${row.id}`); drag.dataTransfer.effectAllowed = 'move' }}>
          <strong>{textOf(row.values[props.dispatch.job.what])}</strong>
          <span className={css.meta}>{clientLabel(props, row)} · {whenLabel(jobFacts(props, row).when)}</span>
          <JobBadges priority={jobFacts(props, row).priority} status={jobFacts(props, row).status} overdue={isOverdue(jobFacts(props, row), props.now)} />
          <button type="button" className={`${buttons.secondary} ${css.assign}`} onClick={() => {
            const wall = instantToWallClock(new Date(dateInstant(jobFacts(props, row).when, DISPATCH_TIME_ZONE) ?? props.now), DISPATCH_TIME_ZONE)
            setAssign({ jobId: row.id, technicianId: active[0]?.id ?? '', day: wall?.date ?? '', time: wall?.time ?? '10:00' })
          }}>Назначить</button>
        </div>)}
      </aside>
    </div>
    {assign ? <AssignDialog {...props} state={assign} technicians={active} jobs={unassigned} onClose={() => setAssign(null)} /> : null}
  </div>
}

function AssignDialog(props: ScreenProps & { state: { jobId: string | null; technicianId: string; day: string; time: string }; technicians: ReturnType<typeof technicians>; jobs: AppV2Record[]; onClose: () => void }) {
  const [jobId, setJobId] = useState(props.state.jobId ?? props.jobs[0]?.id ?? '')
  const [technicianId, setTechnicianId] = useState(props.state.technicianId)
  const [day, setDay] = useState(props.state.day)
  const [time, setTime] = useState(props.state.time)
  const [error, setError] = useState('')
  const save = () => {
    const technician = props.technicians.find(item => item.id === technicianId)
    const job = props.rows.find(row => row.id === jobId)
    if (!technician || !job) { setError('Выберите заявку и мастера.'); return }
    const when = dateInstant(`${day}T${time}`, DISPATCH_TIME_ZONE)
    if (when === null) { setError('Выберите дату и время выезда.'); return }
    const result = applyAssignment(props, job, technician, new Date(when).toISOString())
    if (!result.ok) { setError(result.error); return }
    props.onClose()
  }
  return <AppDialog title="Назначить мастера" placement="center" onClose={props.onClose} footer={<button type="submit" form="assign-job" className={buttons.primary}>Назначить</button>}>
    <form id="assign-job" className={css.form} onSubmit={event => { event.preventDefault(); save() }}>
      <Choices label="Заявка" value={jobId} options={props.jobs.map(row => ({ id: row.id, name: textOf(row.values[props.dispatch.job.what]) }))} onChange={setJobId} />
      <Choices label="Мастер" value={technicianId} options={props.technicians.map(item => ({ id: item.id, name: item.name }))} onChange={setTechnicianId} />
      <label>Дата<RuDateInput value={day} onValue={setDay} aria-label="Дата выезда" /></label>
      <label>Время<RuTimeInput value={time} onValue={setTime} aria-label="Время выезда" /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function TechnicianList(props: ScreenProps) {
  const email = props.actor.email?.trim().toLowerCase() ?? ''
  const own = props.actor.roleIds.includes('staff') && !props.actor.roleIds.includes('owner')
  const jobs = props.of(props.dispatch.jobsTableId).filter(row => !own || textOf(row.values[props.dispatch.job.masterEmail]).trim().toLowerCase() === email)
  return <div className={css.root} data-dispatch-screen="technician">
    <ListScreenShell title="Мои выезды" meta={own ? 'Только заявки, назначенные на вашу почту' : 'Группы, как их видит мастер'}>
      <div className={css.groups}>
        {GROUPS.map(group => {
          const items = jobs.filter(row => technicianGroup(jobFacts(props, row), props.now) === group.id)
            .sort((a, b) => priorityRank(jobFacts(props, a).priority) - priorityRank(jobFacts(props, b).priority))
          return <section key={group.id} className={css.group}><h2>{group.label} <span>· {items.length}</span></h2>
            {items.length ? <ul className={css.list}>{items.map(row => <JobButton key={row.id} {...props} row={row} />)}</ul> : <p className={css.empty}>В этой группе пусто.</p>}
          </section>
        })}
      </div>
    </ListScreenShell>
  </div>
}

const STEP_RANK: Record<string, number> = { Новая: 0, Назначена: 0, Выехал: 1, 'На месте': 2, Выполнено: 3, Готово: 3 }

function StatusActions({ facts, dispatcher, onEnRoute, onSite, onDone, onReopen }: {
  facts: DispatchJobFacts
  dispatcher: boolean
  onEnRoute: () => void
  onSite: () => void
  onDone: () => void
  onReopen: () => void
}) {
  if (facts.status === 'Отменена') return null
  if (facts.status === 'Выполнено' || facts.status === 'Готово') {
    return dispatcher ? <button type="button" className={buttons.textButton} onClick={onReopen}>Вернуть в работу</button> : null
  }
  const current = STEP_RANK[facts.status] ?? 0
  const steps = [
    { label: 'Выехал', state: current > 0 ? 'done' : 'next', onClick: onEnRoute },
    { label: 'На месте', state: current > 1 ? 'done' : current === 1 ? 'next' : 'later', onClick: onSite },
    { label: 'Выполнено', state: current === 2 ? 'next' : 'later', onClick: onDone },
  ] as const
  return <div className={css.status}>
    {steps.map(step => <button key={step.label} type="button" className={step.state === 'next' ? buttons.primary : buttons.secondary} data-state={step.state} disabled={step.state === 'done'} onClick={step.onClick}>{step.state === 'done' ? <ProtoIcon name="check" size={16} /> : null}{step.label}</button>)}
  </div>
}

function patchRows(props: ScreenProps, id: string, patch: Record<string, AppV2Json>) {
  props.replace?.(props.rows.map(item => item.id === id ? { ...item, values: { ...item.values, ...patch } } : item))
}

function JobCard(props: ScreenProps) {
  const demo = useContext(DispatchRowsContext)
  const published = usePublishedV2()
  const row = props.rows.find(item => item.id === props.record?.id) ?? props.record
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(demo?.open === 'complete')
  const [repeat, setRepeat] = useState(demo?.open === 'repeat')
  const [fixOpen, setFixOpen] = useState(false)
  const [minutesDraft, setMinutesDraft] = useState('')
  const running = row ? jobFacts(props, row).status === 'На месте' && typeof read(row, props.dispatch.job.actualMinutes) !== 'number' : false
  const now = useNow(running)
  if (!row) return <p className={css.empty}>Заявка не найдена.</p>
  const facts = jobFacts(props, row)
  const phone = phoneOf(props, row)
  const address = addressOf(props, row)
  const phoneLink = telHref(phone)
  const notes = props.of(props.dispatch.notesTableId).filter(item => technicianIdOf(item.values[props.dispatch.note.job]) === row.id)
    .sort((a, b) => String(a.values[props.dispatch.note.at] ?? '').localeCompare(String(b.values[props.dispatch.note.at] ?? '')))
  const report = textOf(row.values[props.dispatch.job.report])
  const signature = mediaUrl(row.values[props.dispatch.job.signature])
  const storedPhotos = row.values[props.dispatch.job.photo]
  const photos: unknown[] = Array.isArray(storedPhotos) ? storedPhotos : []
  const checklist = parseChecklist(read(row, props.dispatch.job.checklist))
  const progress = checklistProgress(checklist)
  const works = parseMoneyLines(read(row, props.dispatch.job.works))
  const materials = parseMoneyLines(read(row, props.dispatch.job.materials))
  const total = works.length || materials.length ? billingTotal(works, materials) : Number(row.values[props.dispatch.job.price]) || 0
  const storedMinutes = read(row, props.dispatch.job.actualMinutes)
  const minutes = actualMinutesOf({ onSiteAt: textOf(read(row, props.dispatch.job.onSiteAt)), doneAt: textOf(read(row, props.dispatch.job.doneAt)), actualMinutes: typeof storedMinutes === 'number' ? storedMinutes : null, now })
  const dispatcher = props.actor.roleIds.includes('owner')
  const saveProgress = async (input: Parameters<typeof progressValues>[1]) => {
    const values = progressValues(props.dispatch.job, input)
    if (props.replace) { patchRows(props, row.id, values); return }
    if (!published || published.revision === 'demo') return
    const result = await savePublishedDispatchAction(published.slug, { kind: 'progress', revision: published.revision, screenId: props.screenId, recordId: row.id, ...input })
    if (!result.ok) setError(result.error)
    else published.refresh(result.message)
  }
  const setStatus = (statusId: string, extra: { onSiteAt?: string } = {}) => { void saveProgress({ status: statusId, ...extra }) }
  const toggleCheck = (index: number) => {
    if (!props.dispatch.job.checklist) return
    void saveProgress({ checklist: serializeChecklist(toggleChecklistItem(checklist, index)) })
  }
  const addNote = () => {
    const draft = noteDraft({ text: note, author: props.actor.name?.trim() || (props.actor.roleIds.includes('owner') ? 'Диспетчер' : 'Мастер'), authorEmail: props.actor.email ?? '', at: new Date().toISOString(), jobId: row.id, masterEmail: props.actor.roleIds.includes('staff') && !props.actor.roleIds.includes('owner') ? props.actor.email ?? '' : facts.masterEmail })
    if (!draft.ok) { setError(draft.error); return }
    const created: AppV2Record = { id: `note_${crypto.randomUUID().replaceAll('-', '')}`, tableId: props.dispatch.notesTableId, values: {
      [props.dispatch.note.text]: draft.values.text, [props.dispatch.note.job]: [row.id], [props.dispatch.note.at]: draft.values.at,
      [props.dispatch.note.author]: draft.values.author, [props.dispatch.note.authorEmail]: draft.values.authorEmail, [props.dispatch.note.masterEmail]: draft.values.masterEmail,
    } }
    props.replace?.([...props.rows, created])
    setNote(''); setError('')
  }
  return <div className={css.root} data-dispatch-screen="job">
    <DetailCardShell
      title={textOf(row.values[props.dispatch.job.what])}
      subtitle={whenLabel(facts.when)}
      chips={<span className={css.cardBadges}><JobBadges priority={facts.priority} status={facts.status} overdue={isOverdue(facts, props.now)} statusFirst />{textOf(read(row, props.dispatch.job.seriesId)) ? <span className={css.series}>Серия</span> : null}</span>}
      back={{ label: props.actor.roleIds.includes('staff') && !props.actor.roleIds.includes('owner') ? 'Мои выезды' : 'Заявки', onClick: () => props.onNavigate?.(props.actor.roleIds.includes('staff') && !props.actor.roleIds.includes('owner') ? props.dispatch.technicianScreenId : props.dispatch.overviewScreenId) }}
      actions={<div className={css.headerActions}>
        <StatusActions facts={facts} dispatcher={dispatcher} onEnRoute={() => setStatus(props.dispatch.statuses.enRoute)} onSite={() => {
          const field = props.dispatch.job.onSiteAt
          const started = field && !textOf(read(row, field))
          setStatus(props.dispatch.statuses.onSite, started ? { onSiteAt: startVisit(Date.now()).onSiteAt } : {})
        }} onDone={() => setComplete(true)} onReopen={() => setStatus(props.dispatch.statuses.assigned)} />
        {(facts.status === 'Выполнено' || facts.status === 'Готово') ? <button type="button" className={buttons.secondary} onClick={() => void downloadAct(props, row, checklist, works, materials, formatRub(total), minutes)}><ProtoIcon name="download" size={16} />Скачать акт</button> : null}
        {dispatcher ? <button type="button" className={buttons.secondary} onClick={() => setRepeat(true)}>Повторять</button> : null}
      </div>}
    >
      <div className={css.columns}>
        <div className={css.sections}>
          {running && minutes != null ? <p className={css.timer} data-dispatch-timer><ClockIcon size={18} aria-hidden="true" />На объекте · {formatDuration(minutes)}</p> : null}
          {checklist.length ? <DetailSection title={`Чек-лист · ${progress.done}/${progress.total}`}>
            <ul className={css.checkList}>{checklist.map((item, index) => <li key={item.label}><CheckControl checked={item.done} label={item.label} onToggle={() => toggleCheck(index)} /></li>)}</ul>
          </DetailSection> : null}
          <DetailSection title="Выезд">
            <dl className={css.facts}>
              <div><dt>Клиент</dt><dd>{clientLabel(props, row) || 'Не указан'}</dd></div>
              <div><dt>Адрес</dt><dd>{address ? <a className={css.tap} href={`https://yandex.ru/maps/?text=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer"><ProtoIcon name="mapPin" size={16} /><span>{address}</span></a> : 'Не указан'}</dd></div>
              <div><dt>Телефон</dt><dd>{phoneLink ? <a className={css.tap} href={phoneLink}><ProtoIcon name="call" size={16} /><span>{phone}</span></a> : phone || 'Не указан'}</dd></div>
              <div><dt>Мастер</dt><dd>{textOf(row.values[props.dispatch.job.master]) || 'Не назначен'}</dd></div>
              {minutes != null ? <div><dt>Фактическое время</dt><dd>{formatDuration(minutes)}{dispatcher && props.dispatch.job.actualMinutes && (facts.status === 'Выполнено' || facts.status === 'Готово') ? <> · <button type="button" className={css.linkButton} onClick={() => { setMinutesDraft(String(minutes)); setFixOpen(true) }}>Исправить</button></> : null}</dd></div> : null}
            </dl>
          </DetailSection>
          <DetailSection title="Заметки">
            {notes.length ? <ul className={css.notes}>{notes.map(item => {
              const author = textOf(item.values[props.dispatch.note.author])
              const person = technicians(props).find(tech => tech.email.trim().toLowerCase() === textOf(item.values[props.dispatch.note.authorEmail]).trim().toLowerCase())
              return <li key={item.id} className={css.note}>
                <BookingAvatar name={author || 'Автор'} photo={person?.photo} small />
                <div><strong>{author || 'Сотрудник'}</strong> <time dateTime={textOf(item.values[props.dispatch.note.at])}>{whenLabel(item.values[props.dispatch.note.at])}</time><p>{textOf(item.values[props.dispatch.note.text])}</p></div>
              </li>
            })}</ul> : <p className={css.empty}>Заметок пока нет.</p>}
            <form className={css.composer} onSubmit={event => { event.preventDefault(); addNote() }}>
              <label>Новая заметка<textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Что уточнили или что везти" /></label>
              {error ? <p className={css.error} role="alert">{error}</p> : null}
              <button type="submit" className={buttons.secondary}>Добавить заметку</button>
            </form>
          </DetailSection>
        </div>
        <aside>
          {(works.length || materials.length || total > 0) ? <DetailSection title="Сумма">
            <div className={css.money}>
              {works.map(line => <div key={line.name} className={css.total}><span>{line.name}</span><span>{formatRub(line.amount)}</span></div>)}
              {materials.map(line => <div key={line.name} className={css.total}><span>{line.name}</span><span>{formatRub(line.amount)}</span></div>)}
              <div className={css.total}><span>Итого</span><span>{formatRub(total)}</span></div>
            </div>
          </DetailSection> : null}
          <DetailSection title="Отчёт о выполнении">
            {report || signature ? <div className={css.report}>
              {report ? <p>{report}</p> : <p className={css.empty}>Описание работы ещё не сохранено.</p>}
              {photos.length ? <div className={css.photos}>{photos.map((photo, index) => {
                const url = mediaUrl([photo])
                return url ? <img key={index} src={url} alt="Фото с выезда" /> : null
              })}</div> : null}
              {signature ? <img className={css.signImage} src={signature} alt="Подпись клиента" /> : null}
            </div> : <p className={css.empty}>Отчёт появится, когда мастер закроет заявку.</p>}
          </DetailSection>
        </aside>
      </div>
    </DetailCardShell>
    {complete ? <CompleteDialog {...props} row={row} checklist={checklist} onClose={() => setComplete(false)} /> : null}
    {repeat ? <RepeatDialog {...props} row={row} onClose={() => setRepeat(false)} /> : null}
    {fixOpen && props.dispatch.job.actualMinutes ? <AppDialog title="Фактическое время" placement="center" onClose={() => setFixOpen(false)} footer={<button type="submit" form="fix-minutes" className={buttons.primary}>Сохранить</button>}>
      <form id="fix-minutes" className={css.form} onSubmit={event => { event.preventDefault(); const parsed = correctMinutes(minutesDraft); if (!parsed.ok) { setError(parsed.error); return }; void saveProgress({ actualMinutes: parsed.minutes }); setError(''); setFixOpen(false) }}>
        <label>Минуты на объекте<input aria-label="Фактические минуты" inputMode="numeric" value={minutesDraft} onChange={event => setMinutesDraft(event.target.value.replace(/[^\d]/g, ''))} /></label>
        {error ? <p className={css.error} role="alert">{error}</p> : null}
      </form>
    </AppDialog> : null}
  </div>
}

function correctMinutes(value: string) {
  const parsed = Number(value.replace(',', '.').trim())
  if (!Number.isFinite(parsed)) return { ok: false as const, error: 'Укажите фактическое время в минутах.' }
  return correctActualMinutes(parsed)
}

async function imageFrom(url: string | null): Promise<ActImage | null> {
  if (!url) return null
  try {
    const response = await fetch(url)
    const mime = response.headers.get('content-type') ?? ''
    const kind = mime.includes('png') ? 'image/png' as const : mime.includes('jpeg') ? 'image/jpeg' as const : null
    if (!kind) return null
    return { bytes: new Uint8Array(await response.arrayBuffer()), mime: kind }
  } catch { return null }
}

async function downloadAct(props: ScreenProps, row: AppV2Record, checklist: ChecklistItem[], works: MoneyLine[], materials: MoneyLine[], total: string, minutes: number | null) {
  const font = new Uint8Array(await (await fetch('/template-media/dispatch/NotoSans-Regular.ttf')).arrayBuffer())
  const stored = row.values[props.dispatch.job.photo]
  const photos = (await Promise.all((Array.isArray(stored) ? stored : []).map(item => imageFrom(mediaUrl([item]))))).filter((item): item is ActImage => item !== null)
  const pdf = await buildWorkActPdf({
    client: clientLabel(props, row), address: addressOf(props, row), technician: textOf(row.values[props.dispatch.job.master]),
    date: whenLabel(row.values[props.dispatch.job.when]).split(',')[0] ?? '', number: row.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase(), company: 'Сервис «Мастерская»', actualTime: minutes == null ? '' : formatDuration(minutes),
    checklist, notes: textOf(row.values[props.dispatch.job.report]), works, materials, total, photos,
    signature: await imageFrom(mediaUrl(row.values[props.dispatch.job.signature])),
  }, font)
  const link = document.createElement('a')
  const bytes = new Uint8Array(pdf.byteLength)
  bytes.set(pdf)
  link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  link.download = 'Акт выполненных работ.pdf'
  link.click()
  URL.revokeObjectURL(link.href)
}

function dataUrlToFile(dataUrl: string, name: string) {
  const match = /^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl)
  if (!match) return null
  const bytes = Uint8Array.from(atob(match[2]!.replace(/\s/g, '')), char => char.charCodeAt(0))
  return new File([bytes], name, { type: match[1] })
}

function CompleteDialog(props: ScreenProps & { row: AppV2Record; checklist: ChecklistItem[]; onClose: () => void }) {
  const formId = useId()
  const published = usePublishedV2()
  const [report, setReport] = useState(textOf(props.row.values[props.dispatch.job.report]))
  const [signature, setSignature] = useState<string | null>(mediaUrl(props.row.values[props.dispatch.job.signature]))
  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const warning = completionChecklistWarning(props.checklist)
  const save = async () => {
    const stopped = stopVisit(textOf(read(props.row, props.dispatch.job.onSiteAt)), Date.now())
    const kept = read(props.row, props.dispatch.job.actualMinutes)
    const storedMinutes = typeof kept === 'number' ? kept : null
    const timer = { ...stopped, actualMinutes: storedMinutes ?? stopped.actualMinutes }
    const result = completionPatch({
      report, photos, signature, doneStatus: props.dispatch.statuses.done,
      statusField: props.dispatch.job.status, reportField: props.dispatch.job.report,
      photoField: props.dispatch.job.photo, signatureField: props.dispatch.job.signature,
    })
    if (!result.ok) { setError(result.error); return }
    if (props.replace) {
      const extra: Record<string, unknown> = {}
      if (props.dispatch.job.doneAt) extra[props.dispatch.job.doneAt] = timer.doneAt
      if (props.dispatch.job.actualMinutes) extra[props.dispatch.job.actualMinutes] = timer.actualMinutes
      props.replace(props.rows.map(row => row.id === props.row.id ? { ...row, values: { ...row.values, ...result.patch, ...extra } } : row) as AppV2Record[])
      props.onClose()
      return
    }
    if (!published || published.revision === 'demo' || !props.dispatch.completeFormId) { setError('Сохранение доступно в опубликованном приложении.'); return }
    setBusy(true)
    try {
      const inspected = await published.inspectForm({ mode: 'initial', formId: props.dispatch.completeFormId, screenId: props.screenId, recordId: props.row.id })
      if (!inspected.ok || !('state' in inspected) || !('revision' in inspected.state) || typeof inspected.state.revision !== 'string') {
        setError(!inspected.ok && 'error' in inspected ? inspected.error : 'Не удалось подготовить отчёт.')
        return
      }
      const revision = inspected.state.revision
      const fingerprint = inspected.state.fingerprint
      const state = { revision, fingerprint }
      const upload = async (fieldId: string, file: File) => {
        const body = new FormData()
        body.set('file', file)
        body.set('context', JSON.stringify({ kind: 'published', slug: published.slug, formId: props.dispatch.completeFormId, screenId: props.screenId, recordId: props.row.id, fieldId, revision: state.revision, fingerprint: state.fingerprint }))
        const response = await fetch('/api/builder-v2/files', { method: 'POST', body })
        const payload = await response.json() as { ok?: boolean; error?: string; attachment?: Attachment }
        if (!response.ok || !payload.ok || !payload.attachment) throw new Error(payload.error || 'Не удалось загрузить файл')
        return payload.attachment
      }
      const storedPhotos = await Promise.all(files.map(file => upload(props.dispatch.job.photo, file)))
      const signatureFile = signature?.startsWith('data:') ? dataUrlToFile(signature, 'Подпись клиента.png') : null
      const storedSignature = signatureFile ? [await upload(props.dispatch.job.signature, signatureFile)] : []
      const saved = await published.submitForm({
        formId: props.dispatch.completeFormId, screenId: props.screenId, recordId: props.row.id,
        requestId: `submit_${crypto.randomUUID().replaceAll('-', '')}`, revision: state.revision, fingerprint: state.fingerprint,
        values: { [props.dispatch.job.report]: report, [props.dispatch.job.photo]: storedPhotos, [props.dispatch.job.signature]: storedSignature },
      })
      if (!saved.ok) { setError('error' in saved ? String(saved.error) : 'Не удалось сохранить отчёт.'); return }
      if (props.dispatch.progressFormId && props.dispatch.job.doneAt && props.dispatch.job.actualMinutes) {
        const progress = await published.inspectForm({ mode: 'initial', formId: props.dispatch.progressFormId, screenId: props.screenId, recordId: props.row.id })
        if (progress.ok && 'state' in progress && 'revision' in progress.state && typeof progress.state.revision === 'string') {
          const progressRevision = progress.state.revision
          await published.submitForm({
            formId: props.dispatch.progressFormId, screenId: props.screenId, recordId: props.row.id,
            requestId: `submit_${crypto.randomUUID().replaceAll('-', '')}`, revision: progressRevision, fingerprint: progress.state.fingerprint,
            values: { [props.dispatch.job.doneAt]: timer.doneAt, [props.dispatch.job.actualMinutes]: timer.actualMinutes },
          })
        }
      }
      published.refresh('Заявка выполнена.')
      props.onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить отчёт.')
    } finally { setBusy(false) }
  }
  return <AppDialog title="Отчёт о выполнении" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={buttons.primary} disabled={busy}>Завершить заявку</button>}>
    <form id={formId} className={css.form} onSubmit={event => { event.preventDefault(); void save() }}>
      {warning ? <p className={css.warn} role="status">{warning}</p> : null}
      <label>Что сделано<textarea value={report} onChange={event => setReport(event.target.value)} required /></label>
      <label className={css.filePick}>Фото с выезда<input className={css.fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Добавить фото" onChange={event => {
        const chosen = [...event.target.files ?? []]
        setFiles(chosen)
        void Promise.all(chosen.map(file => new Promise<{ url: string; name: string }>(resolve => {
          const reader = new FileReader()
          reader.onload = () => resolve({ url: String(reader.result ?? ''), name: file.name })
          reader.readAsDataURL(file)
        }))).then(setPhotos)
      }} /><span><CameraIcon size={22} aria-hidden="true" />{photos.length ? `Выбрано фото: ${photos.length}` : 'Добавить фото'}</span></label>
      <SignaturePad onChange={setSignature} />
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function SeriesPreview({ start, rule, until, count }: { start: string; rule: RepeatRule; until: string | null; count: number | null }) {
  const dates = recurrenceOccurrences({ start, rule, until, count }).slice(1)
  const label = dates.map(iso => {
    const wall = instantToWallClock(new Date(iso), DISPATCH_TIME_ZONE)
    if (!wall) return ''
    const [, month, day] = wall.date.split('-')
    return `${day}.${month}`
  }).filter(Boolean)
  const word = label.length % 10 === 1 && label.length % 100 !== 11 ? 'выезд' : label.length % 10 >= 2 && label.length % 10 <= 4 && (label.length % 100 < 12 || label.length % 100 > 14) ? 'выезда' : 'выездов'
  if (!label.length) return <p className={css.preview}>Новых выездов в этом пределе нет.</p>
  return <p className={css.preview}>Будет создано {label.length} {word}: {label.join(', ')}</p>
}

function RepeatDialog(props: ScreenProps & { row: AppV2Record; onClose: () => void }) {
  const formId = useId()
  const published = usePublishedV2()
  const current = repeatRuleFromName(choiceName(props.tables, props.dispatch.jobsTableId, props.dispatch.job.repeat ?? '', read(props.row, props.dispatch.job.repeat)))
  const [rule, setRule] = useState<RepeatRule>(current ?? 'weekly')
  const [limit, setLimit] = useState<'date' | 'count'>(textOf(read(props.row, props.dispatch.job.repeatUntil)) ? 'date' : 'count')
  const [until, setUntil] = useState(textOf(read(props.row, props.dispatch.job.repeatUntil)).slice(0, 10))
  const [amount, setAmount] = useState(4)
  const [scope, setScope] = useState<'one' | 'series'>(textOf(read(props.row, props.dispatch.job.seriesId)) ? 'series' : 'one')
  const [error, setError] = useState('')
  const series = textOf(read(props.row, props.dispatch.job.seriesId))
  const save = async () => {
    const repeatField = props.dispatch.job.repeat
    const untilField = props.dispatch.job.repeatUntil
    const countField = props.dispatch.job.repeatCount
    const seriesField = props.dispatch.job.seriesId
    if (!repeatField || !seriesField) { setError('Повтор ещё не подключён к этой заявке.'); return }
    if (limit === 'date' && !until) { setError('Выберите дату окончания.'); return }
    const total = limit === 'count' ? amount + 1 : null
    const seriesId = series || `series_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
    const choiceId = props.tables.find(table => table.id === props.dispatch.jobsTableId)?.fields.find(field => field.id === repeatField)?.choices?.find(choice => choice.name === repeatName(rule))?.id ?? repeatName(rule)
    const dates = recurrenceOccurrences({ start: textOf(props.row.values[props.dispatch.job.when]), rule, until: limit === 'date' ? until : null, count: total })
    if (dates.length < 1) { setError('Не удалось построить даты серии.'); return }
    const jobs = props.of(props.dispatch.jobsTableId).map(item => ({ id: item.id, seriesId: textOf(item.values[seriesField]), when: item.values[props.dispatch.job.when], status: jobFacts(props, item).status }))
    const targets = series ? seriesEditIds(jobs, props.row.id, scope) : [props.row.id]
    const patch = { [repeatField]: choiceId, ...(untilField ? { [untilField]: limit === 'date' ? until : null } : {}), ...(countField ? { [countField]: total } : {}), [seriesField]: seriesId }
    let rows = props.rows.map(item => targets.includes(item.id) ? { ...item, values: { ...item.values, ...patch } } : item)
    if (!series) {
      const checklistField = props.dispatch.job.checklist
      const fresh = checklistField ? serializeChecklist(parseChecklist(props.row.values[checklistField]).map(item => ({ ...item, done: false }))) : ''
      const created = dates.slice(1).map(when => ({
        id: `job_${crypto.randomUUID().replaceAll('-', '')}`, tableId: props.dispatch.jobsTableId,
        values: {
          ...props.row.values, ...patch,
          [props.dispatch.job.when]: when, [props.dispatch.job.date]: when, [props.dispatch.job.status]: props.dispatch.statuses.assigned,
          ...(checklistField ? { [checklistField]: fresh } : {}),
          ...(props.dispatch.job.report ? { [props.dispatch.job.report]: '' } : {}),
          ...(props.dispatch.job.onSiteAt ? { [props.dispatch.job.onSiteAt]: null } : {}),
          ...(props.dispatch.job.doneAt ? { [props.dispatch.job.doneAt]: null } : {}),
          ...(props.dispatch.job.actualMinutes ? { [props.dispatch.job.actualMinutes]: null } : {}),
        },
      }))
      rows = [...rows, ...created]
    }
    if (props.replace) { props.replace(rows as AppV2Record[]); props.onClose(); return }
    if (!published || published.revision === 'demo') { setError('Сохранение серии доступно в опубликованном приложении.'); return }
    const result = await savePublishedDispatchAction(published.slug, {
      kind: 'series', revision: published.revision, screenId: props.screenId, recordId: props.row.id,
      rule, until: limit === 'date' ? until : null, count: total, scope,
    })
    if (!result.ok) { setError(result.error); return }
    published.refresh(result.message)
    props.onClose()
  }
  return <AppDialog title="Повторять заявку" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={buttons.primary}>Сохранить серию</button>}>
    <form id={formId} className={css.form} onSubmit={event => { event.preventDefault(); void save() }}>
      <Choices label="Как часто" value={rule} options={REPEAT_OPTIONS.map(item => ({ id: item.rule, name: item.name }))} onChange={value => setRule(value as RepeatRule)} />
      <Choices label="Ограничение" value={limit} options={[{ id: 'date', name: 'До даты' }, { id: 'count', name: 'Количество раз' }]} onChange={value => setLimit(value as 'date' | 'count')} />
      {limit === 'date' ? <label>Повторять до<DateMenu value={until} onValue={setUntil} label="Повторять до" /></label> : <div className={css.choices}><span>Сколько ещё выездов</span><div className={css.stepper}><button type="button" aria-label="Меньше" onClick={() => setAmount(value => Math.max(1, value - 1))}>−</button><strong>{amount}</strong><button type="button" aria-label="Больше" onClick={() => setAmount(value => Math.min(24, value + 1))}>+</button></div></div>}
      <SeriesPreview start={textOf(props.row.values[props.dispatch.job.when])} rule={rule} until={limit === 'date' ? until : null} count={limit === 'count' ? amount + 1 : null} />
      {series ? <Choices label="Что изменить" value={scope} options={[{ id: 'one', name: 'Только эту заявку' }, { id: 'series', name: 'Всю серию' }]} onChange={value => setScope(value as 'one' | 'series')} /> : null}
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function ClientList(props: ScreenProps) {
  const clients = props.of(props.dispatch.clientsTableId)
  return <div className={css.root} data-dispatch-screen="clients">
    <ListScreenShell title="Клиенты" meta="Телефон и адрес подставляются в заявку">
      <ul className={css.list}>{clients.map(row => <li key={row.id}><button type="button" className={css.job} onClick={() => props.onNavigate?.(props.dispatch.clientScreenId, row.id)}>
        <strong>{textOf(row.values[props.dispatch.client.name])}</strong>
        <span className={css.meta}>{textOf(row.values[props.dispatch.client.address])}</span>
        <span className={css.meta}>{textOf(row.values[props.dispatch.client.phone])}</span>
      </button></li>)}</ul>
    </ListScreenShell>
  </div>
}

function ClientCard(props: ScreenProps) {
  const row = props.rows.find(item => item.id === props.record?.id) ?? props.record
  const [open, setOpen] = useState(false)
  if (!row) return <p className={css.empty}>Клиент не найден.</p>
  const jobs = props.of(props.dispatch.jobsTableId).filter(item => technicianIdOf(item.values[props.dispatch.job.client]) === row.id || clientLabel(props, item) === textOf(row.values[props.dispatch.client.name]))
  const phone = textOf(row.values[props.dispatch.client.phone])
  const address = textOf(row.values[props.dispatch.client.address])
  const phoneLink = telHref(phone)
  return <div className={css.root} data-dispatch-screen="client">
    <DetailCardShell title={textOf(row.values[props.dispatch.client.name])} subtitle={address} back={{ label: 'Клиенты', onClick: () => props.onNavigate?.(props.dispatch.clientsScreenId) }} actions={<button type="button" className={buttons.primary} onClick={() => setOpen(true)}>Новая заявка</button>}>
      <DetailSection title="Контакты">
        <dl className={css.facts}>
          <div><dt>Телефон</dt><dd>{phoneLink ? <a className={css.tap} href={phoneLink}><ProtoIcon name="call" size={16} /><span>{phone}</span></a> : 'Не указан'}</dd></div>
          <div><dt>Адрес</dt><dd>{address ? <a className={css.tap} href={`https://yandex.ru/maps/?text=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer"><ProtoIcon name="mapPin" size={16} /><span>{address}</span></a> : 'Не указан'}</dd></div>
          <div><dt>Заметки</dt><dd>{textOf(row.values[props.dispatch.client.note]) || 'Нет заметок'}</dd></div>
        </dl>
      </DetailSection>
      <DetailSection title="Заявки">
        {jobs.length ? <ul className={css.list}>{jobs.map(item => <JobButton key={item.id} {...props} row={item} showAssignee hideClient clientAddress={address} />)}</ul> : <p className={css.empty}>Заявок этого клиента ещё нет.</p>}
      </DetailSection>
    </DetailCardShell>
    {open ? <CreateJobDialog {...props} client={row} onClose={() => setOpen(false)} /> : null}
  </div>
}

function CreateJobDialog(props: ScreenProps & { client: AppV2Record; onClose: () => void }) {
  const [what, setWhat] = useState('')
  const [priority, setPriority] = useState(props.dispatch.priorities.normal)
  const wall = instantToWallClock(new Date(props.now), DISPATCH_TIME_ZONE)
  const [day, setDay] = useState(wall?.date ?? '')
  const [time, setTime] = useState('10:00')
  const [error, setError] = useState('')
  const save = () => {
    if (!what.trim()) { setError('Опишите, что сделать.'); return }
    const when = dateInstant(`${day}T${time}`, DISPATCH_TIME_ZONE)
    if (when === null) { setError('Выберите дату и время.'); return }
    const iso = new Date(when).toISOString()
    const created: AppV2Record = { id: `job_${crypto.randomUUID().replaceAll('-', '')}`, tableId: props.dispatch.jobsTableId, values: {
      [props.dispatch.job.what]: what.trim(),
      [props.dispatch.job.client]: [props.client.id],
      [props.dispatch.job.clientName]: [textOf(props.client.values[props.dispatch.client.name])],
      [props.dispatch.job.phone]: [textOf(props.client.values[props.dispatch.client.phone])],
      [props.dispatch.job.address]: [textOf(props.client.values[props.dispatch.client.address])],
      [props.dispatch.job.priority]: priority,
      [props.dispatch.job.status]: props.dispatch.statuses.fresh,
      [props.dispatch.job.when]: iso,
      [props.dispatch.job.date]: iso,
      [props.dispatch.job.minutes]: 60,
      [props.dispatch.job.master]: '',
      [props.dispatch.job.masterEmail]: '',
      [props.dispatch.job.price]: 0,
      [props.dispatch.job.paid]: false,
    } }
    props.replace?.([...props.rows, created])
    props.onClose()
    props.onNavigate?.(props.dispatch.jobScreenId, created.id)
  }
  return <AppDialog title="Новая заявка" placement="center" onClose={props.onClose}>
    <form className={css.form} onSubmit={event => { event.preventDefault(); save() }}>
      <p className={css.meta}>Клиент: {textOf(props.client.values[props.dispatch.client.name])}</p>
      <label>Что сделать<input value={what} onChange={event => setWhat(event.target.value)} required /></label>
      <Choices label="Приоритет" value={priority} options={PRIORITIES.map(name => ({ id: name === 'Срочный' ? props.dispatch.priorities.urgent : name === 'Высокий' ? props.dispatch.priorities.high : name === 'Низкий' ? props.dispatch.priorities.low : props.dispatch.priorities.normal, name }))} onChange={setPriority} />
      <label>Дата<RuDateInput value={day} onValue={setDay} aria-label="Дата новой заявки" /></label>
      <label>Время<RuTimeInput value={time} onValue={setTime} aria-label="Время новой заявки" /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
      <button type="submit" className={buttons.primary}>Создать заявку</button>
    </form>
  </AppDialog>
}

function MasterList(props: ScreenProps) {
  const people = technicians(props)
  return <div className={css.root} data-dispatch-screen="masters">
    <ListScreenShell title="Мастера" meta="Неактивные не попадают на доску и в назначение">
      <ul className={css.list}>{people.map(person => <li key={person.id} className={css.job}>
        <span className={css.note}><BookingAvatar name={person.name} photo={person.photo} small /><span><strong>{person.name}</strong><span className={css.meta}>{person.email}</span></span></span>
        <Badge name={person.active ? 'Активен' : 'Неактивен'} />
      </li>)}</ul>
    </ListScreenShell>
  </div>
}
