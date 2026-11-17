'use client'
import { createContext, useContext, useState } from 'react'
import { dateInstant, instantToWallClock } from '@tableapp/schema'
import type { AppV2, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import {
  DISPATCH_TIME_ZONE, activeTechnicians, assignmentPatch, completionPatch, isOverdue, isUnassigned,
  keepCalendarResource, matchesCounter, noteDraft, priorityRank, reassignedNotes, sortJobs, technicianGroup, technicianIdOf,
  type DispatchCounter, type DispatchJobFacts,
} from '@/lib/dispatch-logic'
import { teamCalendarSnapshot } from '@/lib/team-calendar-model'
import { applyDemoCalendarMove } from '@/lib/team-calendar-demo-move'
import type { BuilderV2DataRecord } from '@/lib/builder-v2-data-types'
import { useBuilderV2NodeData } from './use-data'
import { TeamCalendarView } from './booking-calendar'
import { AppDialog } from './app-dialog'
import { DetailCardShell, DetailSection, ListScreenShell, ShellSearchField } from './layout-shell'
import { BookingAvatar } from './booking-avatar'
import { RuDateInput, RuTimeInput, ruNumericDate } from './ru-fields'
import { SignaturePad } from './signature-pad'
import { ProtoIcon } from '../prototype/icons'
import buttons from '../prototype/prototype.module.css'
import type { AppV2RendererProps } from './view'
import css from './dispatch.module.css'

export type DispatchBundle = { rows: AppV2Record[]; setRows?: (rows: AppV2Record[]) => void }
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

function Badge({ name, overdue = false }: { name: string; overdue?: boolean }) {
  if (!name && !overdue) return null
  return <span className={css.badges}>
    {name ? <span className={css.badge} data-tone={toneOf(name)}>{name}</span> : null}
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
const addressOf = (props: ScreenProps, row: AppV2Record) => textOf(row.values[props.dispatch.job.address])
const phoneOf = (props: ScreenProps, row: AppV2Record) => textOf(row.values[props.dispatch.job.phone])

function JobButton(props: ScreenProps & { row: AppV2Record }) {
  const facts = jobFacts(props, props.row)
  const overdue = isOverdue(facts, props.now)
  return <li><button type="button" className={css.job} onClick={() => props.onNavigate?.(props.dispatch.jobScreenId, props.row.id)}>
    <strong>{textOf(props.row.values[props.dispatch.job.what])}</strong>
    <span className={css.meta}><span>{clientLabel(props, props.row) || 'Клиент не указан'}</span><span>{whenLabel(facts.when)}</span></span>
    {addressOf(props, props.row) ? <span className={css.meta}>{addressOf(props, props.row)}</span> : null}
    <Badge name={facts.priority} /><Badge name={facts.status} overdue={overdue} />
  </button></li>
}

function Overview(props: ScreenProps) {
  const [counter, setCounter] = useState<DispatchCounter | null>(null)
  const [priority, setPriority] = useState('')
  const [sort, setSort] = useState<'when' | 'priority'>('when')
  const [search, setSearch] = useState('')
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
        <button type="button" className={css.chip} aria-pressed={!priority} onClick={() => setPriority('')}>Все приоритеты</button>
        {PRIORITIES.map(item => <button key={item} type="button" className={css.chip} aria-pressed={priority === item} onClick={() => setPriority(current => current === item ? '' : item)}>{item}</button>)}
        <button type="button" className={css.sort} aria-pressed={sort === 'when'} onClick={() => setSort('when')}>По времени</button>
        <button type="button" className={css.sort} aria-pressed={sort === 'priority'} onClick={() => setSort('priority')}>По приоритету</button>
      </div>
      {shown.length ? <ul className={css.list}>{shown.map(item => <JobButton key={item.row.id} {...props} row={item.row} />)}</ul> : <p className={css.empty}>{search || counter || priority ? 'Таких заявок нет. Снимите фильтр или измените поиск.' : 'Заявок пока нет.'}</p>}
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

function Board(props: ScreenProps) {
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
        app={props.app} screenId={props.screenId} timeZone={DISPATCH_TIME_ZONE} title="Доска дня"
        resourceLabel="Мастер" resourcesLabel="Мастера" showMetrics={false} showWorkingHours={false} showAmounts={false} showNoShows={false}
        defaultView="day" loader={loader} loaderKey={jobs.map(row => `${row.id}:${textOf(row.values[props.dispatch.job.when])}:${textOf(row.values[props.dispatch.job.technician])}`).join('|')}
        onOpenVisit={id => props.onNavigate?.(props.dispatch.jobScreenId, id)}
        onMove={props.replace ? move : undefined}
        onCreate={slot => setAssign({ jobId: unassigned[0]?.id ?? null, technicianId: slot.resourceId ?? '', day: slot.day ?? '', time: slot.time ?? '10:00' })}
      /> : <p className={css.empty}>Доска дня не настроена.</p>}
      <aside className={css.panel} aria-label="Не назначено">
        <h2>Не назначено</h2>
        <p className={css.meta}>{unassigned.length ? 'Выберите мастера и время. Неактивные мастера скрыты.' : 'Все открытые заявки уже назначены.'}</p>
        {unassigned.map(row => <div key={row.id} className={css.panelCard}>
          <strong>{textOf(row.values[props.dispatch.job.what])}</strong>
          <span className={css.meta}>{clientLabel(props, row)} · {whenLabel(jobFacts(props, row).when)}</span>
          <Badge name={jobFacts(props, row).priority} overdue={isOverdue(jobFacts(props, row), props.now)} />
          <button type="button" className={buttons.primary} onClick={() => {
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
    const result = assignmentPatch({
      technician, whenIso: new Date(when).toISOString(),
      currentStatus: jobFacts(props, job).status,
      freshStatus: 'Новая', assignedStatus: choiceName(props.tables, props.dispatch.jobsTableId, props.dispatch.job.status, props.dispatch.statuses.assigned) || 'Назначена',
      technicianField: props.dispatch.job.technician, nameField: props.dispatch.job.master, emailField: props.dispatch.job.masterEmail,
      whenField: props.dispatch.job.when, dateField: props.dispatch.job.date, statusField: props.dispatch.job.status,
    })
    if (!result.ok) { setError(result.error); return }
    const statusId = jobFacts(props, job).status === 'Новая' ? props.dispatch.statuses.assigned : job.values[props.dispatch.job.status]
    const next = props.rows.map(row => {
      if (row.id === job.id) return { ...row, values: { ...row.values, ...result.patch, [props.dispatch.job.status]: statusId } }
      const linked = technicianIdOf(row.values[props.dispatch.note.job])
      if (row.tableId === props.dispatch.notesTableId && linked === job.id) return { ...row, values: { ...row.values, [props.dispatch.note.masterEmail]: technician.email.trim().toLowerCase() } }
      return row
    })
    props.replace?.(next as AppV2Record[])
    props.onClose()
  }
  return <AppDialog title="Назначить мастера" placement="center" onClose={props.onClose}>
    <form className={css.form} onSubmit={event => { event.preventDefault(); save() }}>
      <label>Заявка<select value={jobId} onChange={event => setJobId(event.target.value)}>{props.jobs.map(row => <option key={row.id} value={row.id}>{textOf(row.values[props.dispatch.job.what])}</option>)}</select></label>
      <label>Мастер<select value={technicianId} onChange={event => setTechnicianId(event.target.value)}>{props.technicians.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Дата<RuDateInput value={day} onValue={setDay} aria-label="Дата выезда" /></label>
      <label>Время<RuTimeInput value={time} onValue={setTime} aria-label="Время выезда" /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
      <button type="submit" className={buttons.primary}>Назначить</button>
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
          return <section key={group.id} className={css.group}><h2>{group.label}</h2>
            {items.length ? <ul className={css.list}>{items.map(row => <JobButton key={row.id} {...props} row={row} />)}</ul> : <p className={css.empty}>В этой группе пусто.</p>}
          </section>
        })}
      </div>
    </ListScreenShell>
  </div>
}

function JobCard(props: ScreenProps) {
  const row = props.rows.find(item => item.id === props.record?.id) ?? props.record
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
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
  const setStatus = (statusId: string) => props.replace?.(props.rows.map(item => item.id === row.id ? { ...item, values: { ...item.values, [props.dispatch.job.status]: statusId } } : item))
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
      badge={<Badge name={facts.priority} overdue={isOverdue(facts, props.now)} />}
      chips={<Badge name={facts.status} />}
      back={{ label: props.actor.roleIds.includes('staff') && !props.actor.roleIds.includes('owner') ? 'Мои выезды' : 'Заявки', onClick: () => props.onNavigate?.(props.actor.roleIds.includes('staff') && !props.actor.roleIds.includes('owner') ? props.dispatch.technicianScreenId : props.dispatch.overviewScreenId) }}
      actions={<div className={css.status}>
        <button type="button" className={buttons.secondary} aria-pressed={facts.status === 'Выехал'} onClick={() => setStatus(props.dispatch.statuses.enRoute)}>Выехал</button>
        <button type="button" className={buttons.secondary} aria-pressed={facts.status === 'На месте'} onClick={() => setStatus(props.dispatch.statuses.onSite)}>На месте</button>
        <button type="button" className={buttons.primary} aria-pressed={facts.status === 'Выполнено'} onClick={() => setComplete(true)}>Выполнено</button>
      </div>}
    >
      <div className={css.columns}>
        <div>
          <DetailSection title="Выезд">
            <dl className={css.facts}>
              <div><dt>Клиент</dt><dd>{clientLabel(props, row) || 'Не указан'}</dd></div>
              <div><dt>Адрес</dt><dd>{address ? <a href={`https://yandex.ru/maps/?text=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">{address}</a> : 'Не указан'}</dd></div>
              <div><dt>Телефон</dt><dd>{phoneLink ? <a href={phoneLink}>{phone}</a> : phone || 'Не указан'}</dd></div>
              <div><dt>Мастер</dt><dd>{textOf(row.values[props.dispatch.job.master]) || 'Не назначен'}</dd></div>
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
    {complete ? <CompleteDialog {...props} row={row} onClose={() => setComplete(false)} /> : null}
  </div>
}

function CompleteDialog(props: ScreenProps & { row: AppV2Record; onClose: () => void }) {
  const [report, setReport] = useState(textOf(props.row.values[props.dispatch.job.report]))
  const [signature, setSignature] = useState<string | null>(mediaUrl(props.row.values[props.dispatch.job.signature]))
  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([])
  const [error, setError] = useState('')
  const save = () => {
    const result = completionPatch({
      report, photos, signature, doneStatus: props.dispatch.statuses.done,
      statusField: props.dispatch.job.status, reportField: props.dispatch.job.report,
      photoField: props.dispatch.job.photo, signatureField: props.dispatch.job.signature,
    })
    if (!result.ok) { setError(result.error); return }
    props.replace?.(props.rows.map(row => row.id === props.row.id ? { ...row, values: { ...row.values, ...result.patch } } : row) as AppV2Record[])
    props.onClose()
  }
  return <AppDialog title="Отчёт о выполнении" placement="center" onClose={props.onClose}>
    <form className={css.form} onSubmit={event => { event.preventDefault(); save() }}>
      <label>Что сделано<textarea value={report} onChange={event => setReport(event.target.value)} required /></label>
      <label className={css.filePick}>Фото с выезда<input className={css.fileInput} type="file" accept="image/*" multiple onChange={event => {
        const files = [...event.target.files ?? []]
        void Promise.all(files.map(file => new Promise<{ url: string; name: string }>(resolve => {
          const reader = new FileReader()
          reader.onload = () => resolve({ url: String(reader.result ?? ''), name: file.name })
          reader.readAsDataURL(file)
        }))).then(setPhotos)
      }} /><span>{photos.length ? `Выбрано фото: ${photos.length}` : 'Добавить фото'}</span></label>
      <SignaturePad onChange={setSignature} />
      {error ? <p className={css.error} role="alert">{error}</p> : null}
      <button type="submit" className={buttons.primary}>Завершить заявку</button>
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
  return <div className={css.root} data-dispatch-screen="client">
    <DetailCardShell title={textOf(row.values[props.dispatch.client.name])} subtitle={textOf(row.values[props.dispatch.client.address])} back={{ label: 'Клиенты', onClick: () => props.onNavigate?.(props.dispatch.clientsScreenId) }} actions={<button type="button" className={buttons.primary} onClick={() => setOpen(true)}>Новая заявка</button>}>
      <DetailSection title="Контакты">
        <dl className={css.facts}>
          <div><dt>Телефон</dt><dd>{telHref(textOf(row.values[props.dispatch.client.phone])) ? <a href={telHref(textOf(row.values[props.dispatch.client.phone]))!}>{textOf(row.values[props.dispatch.client.phone])}</a> : 'Не указан'}</dd></div>
          <div><dt>Адрес</dt><dd>{textOf(row.values[props.dispatch.client.address]) || 'Не указан'}</dd></div>
          <div><dt>Заметки</dt><dd>{textOf(row.values[props.dispatch.client.note]) || 'Нет заметок'}</dd></div>
        </dl>
      </DetailSection>
      <DetailSection title="Заявки">
        {jobs.length ? <ul className={css.list}>{jobs.map(item => <JobButton key={item.id} {...props} row={item} />)}</ul> : <p className={css.empty}>Заявок этого клиента ещё нет.</p>}
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
      <label>Приоритет<select value={priority} onChange={event => setPriority(event.target.value)}>{PRIORITIES.map(name => {
        const id = name === 'Срочный' ? props.dispatch.priorities.urgent : name === 'Высокий' ? props.dispatch.priorities.high : name === 'Низкий' ? props.dispatch.priorities.low : props.dispatch.priorities.normal
        return <option key={name} value={id}>{name}</option>
      })}</select></label>
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
