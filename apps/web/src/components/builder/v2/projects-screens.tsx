'use client'
import { createContext, useContext, useId, useState, type DragEvent } from 'react'
import type { AppV2, AppV2Json, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import {
  BUCKETS, PRIORITIES, TASK_STATUSES, eventText, formatDay, formatRub, insertMention, isDone, isOverdue, matchesDue, mentionQuery, mentionedNames, progressPercent, reorderColumn, subtaskProgress, taskBucket,
  type DueFilter, type TaskFacts,
} from '@/lib/projects-logic'
import { formatSpentPair, matchesRoleFilter, totalSpentMinutes } from '@/lib/projects-stage2'
import { commentWrite, eventWrite, moveUpdates, projectWrite, taskWrite } from '@/lib/projects-persist'
import { parseChecklist, serializeChecklist, toggleChecklistItem, type ChecklistItem } from '@/lib/dispatch-stage2'
import { savePublishedProjectsAction } from '@/app/projects-actions'
import { usePublishedV2 } from './published-context'
import { useBuilderV2NodeData } from './use-data'
import { DateMenu } from './booking-calendar'
import { AppDialog } from './app-dialog'
import { DetailCardShell, DetailSection } from './layout-shell'
import { BookingAvatar } from './booking-avatar'
import { ProtoIcon } from '../prototype/icons'
import buttons from '../prototype/prototype.module.css'
import type { AppV2RendererProps } from './view'
import css from './projects.module.css'
import {
  ClientProjectView, CommentChat, GanttScreen, RecurrenceDialog, ShareProjectDialog, TaskRolesLine, TaskTimePanel,
  TemplatesScreen, WorkloadScreen, projectSpentSummary, repeatLabelFor, timeEntries,
  type Stage2Helpers,
} from './projects-stage2-ui'

export type ProjectsTab = 'stages' | 'tasks' | 'gantt' | 'team' | 'files' | 'feed'
export type ProjectsOpen = 'filters' | 'edit' | 'create' | 'comment' | 'mention' | 'share' | 'recurrence' | 'template' | 'from-template' | null
export type ProjectsBundle = { rows: AppV2Record[]; setRows?: (rows: AppV2Record[]) => void; open?: ProjectsOpen; tab?: ProjectsTab; now?: number }
export const ProjectsRowsContext = createContext<ProjectsBundle | null>(null)

const PLACEHOLDER: AppV2Node = { id: 'projects_placeholder', name: 'placeholder', type: 'heading', value: { kind: 'literal', value: '' }, size: 's', visibleTo: null, visibleWhen: null }
const publishedHolder: { current: ReturnType<typeof usePublishedV2> } = { current: null }
const textOf = (value: unknown) => Array.isArray(value) ? '' : value == null ? '' : String(value)
const firstId = (value: unknown) => Array.isArray(value) ? value.find((item): item is string => typeof item === 'string') ?? '' : ''
const choiceName = (tables: readonly BuilderV2Table[], tableId: string, fieldId: string, value: unknown) => {
  const field = tables.find(table => table.id === tableId)?.fields.find(item => item.id === fieldId)
  return typeof value === 'string' ? field?.choices?.find(choice => choice.id === value)?.name ?? '' : ''
}
const choiceId = (tables: readonly BuilderV2Table[], tableId: string, fieldId: string, name: string) =>
  tables.find(table => table.id === tableId)?.fields.find(item => item.id === fieldId)?.choices?.find(choice => choice.name === name)?.id ?? ''
const primaryOf = (rows: readonly AppV2Record[], tables: readonly BuilderV2Table[], id: string) => {
  const row = rows.find(item => item.id === id)
  const primary = tables.find(table => table.id === row?.tableId)?.primaryFieldId
  return row && primary ? textOf(row.values[primary]) : ''
}
const toneOf = (name: string) => name === 'Срочный' || name === 'Просрочено' ? 'red' : name === 'Высокий' ? 'orange' : name === 'Средний' || name === 'К работе' || name === 'В работе' && false ? 'blue' : name === 'Низкий' || name === 'Черновик' || name === 'Отменён' || name === 'Неактивен' ? 'gray' : name === 'Готово' || name === 'Сдан' || name === 'Активен' || name === 'Исполнитель' ? 'green' : name === 'В работе' ? 'amber' : name === 'На проверке' || name === 'Руководитель' ? 'indigo' : name === 'На паузе' ? 'amber' : name === 'Менеджер' ? 'blue' : 'blue'

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

function CheckControl({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return <button type="button" role="checkbox" aria-checked={checked} className={css.check} onClick={onToggle}><span data-on={checked || undefined}>{checked ? <ProtoIcon name="check" size={12} /> : null}</span><span>{label}</span></button>
}

function statusChipLabel(status: string) {
  if (status === 'К работе') return '→ В работу'
  if (status === 'В работе') return '→ Проверку'
  if (status === 'На проверке') return '→ Готово'
  return '⋯'
}

function openTasksLabel(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} открытая задача`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} открытые задачи`
  return `${count} открытых задач`
}

function Segmented({ label, value, options, onChange, plain }: { label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void; plain?: boolean }) {
  return <fieldset className={css.field} data-plain={plain || undefined}><legend className={plain ? css.srOnly : undefined}>{label}</legend><div className={css.segment} role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))` }}>{options.map(option => <button key={option.id || option.name} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)}>{option.name}</button>)}</div></fieldset>
}

function ChoiceRow({ label, value, options, onChange }: { label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void }) {
  return <fieldset className={css.field}><legend>{label}</legend><div className={css.choiceRow} role="radiogroup" aria-label={label}>{options.map(option => <button key={option.id || option.name} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)}>{option.name}</button>)}</div></fieldset>
}

export function ProjectsScreen(props: AppV2RendererProps) {
  const kit = props.app.projects
  const demo = useContext(ProjectsRowsContext)
  publishedHolder.current = usePublishedV2()
  const screenId = props.screenId
  const recordId = props.record?.id
  const live = Boolean(props.live) && !demo
  const scope = { screenId, ...(recordId ? { recordId } : {}) }
  const node = (tableId: string) => kit ? collectionOn(props.app, screenId, tableId) : null
  const tasksNode = node(kit?.tasksTableId ?? '')
  const projectsNode = node(kit?.projectsTableId ?? '')
  const peopleNode = node(kit?.peopleTableId ?? '')
  const clientsNode = node(kit?.clientsTableId ?? '')
  const commentsNode = node(kit?.commentsTableId ?? '')
  const eventsNode = node(kit?.eventsTableId ?? '')
  const stagesNode = node(kit?.stagesTableId ?? '')
  const tasksPage = useBuilderV2NodeData(props.app, tasksNode ?? PLACEHOLDER, live && Boolean(tasksNode), '', scope)
  const projectsPage = useBuilderV2NodeData(props.app, projectsNode ?? PLACEHOLDER, live && Boolean(projectsNode), '', scope)
  const peoplePage = useBuilderV2NodeData(props.app, peopleNode ?? PLACEHOLDER, live && Boolean(peopleNode), '', scope)
  const clientsPage = useBuilderV2NodeData(props.app, clientsNode ?? PLACEHOLDER, live && Boolean(clientsNode), '', scope)
  const commentsPage = useBuilderV2NodeData(props.app, commentsNode ?? PLACEHOLDER, live && Boolean(commentsNode), '', scope)
  const eventsPage = useBuilderV2NodeData(props.app, eventsNode ?? PLACEHOLDER, live && Boolean(eventsNode), '', scope)
  const stagesPage = useBuilderV2NodeData(props.app, stagesNode ?? PLACEHOLDER, live && Boolean(stagesNode), '', scope)
  const timeNode = node(kit?.timeTableId ?? '')
  const linksNode = node(kit?.linksTableId ?? '')
  const templatesNode = node(kit?.templatesTableId ?? '')
  const sharesNode = node(kit?.sharesTableId ?? '')
  const timePage = useBuilderV2NodeData(props.app, timeNode ?? PLACEHOLDER, live && Boolean(timeNode), '', scope)
  const linksPage = useBuilderV2NodeData(props.app, linksNode ?? PLACEHOLDER, live && Boolean(linksNode), '', scope)
  const templatesPage = useBuilderV2NodeData(props.app, templatesNode ?? PLACEHOLDER, live && Boolean(templatesNode), '', scope)
  const sharesPage = useBuilderV2NodeData(props.app, sharesNode ?? PLACEHOLDER, live && Boolean(sharesNode), '', scope)
  const stage2Screens = [kit?.ganttScreenId, kit?.workloadScreenId, kit?.templatesScreenId, kit?.clientScreenId].filter(Boolean) as string[]
  if (!kit || !props.app.screens.some(screen => screen.id === screenId && [kit.mineScreenId, kit.boardScreenId, kit.projectsScreenId, kit.projectScreenId, kit.taskScreenId, kit.peopleScreenId, kit.clientsScreenId, ...stage2Screens].includes(screen.id))) return null
  const rows = demo?.rows ?? [tasksPage, projectsPage, peoplePage, clientsPage, commentsPage, eventsPage, stagesPage, timePage, linksPage, templatesPage, sharesPage].flatMap(page => page.page?.rows ?? [])
  const of = (tableId: string) => rows.filter(row => row.tableId === tableId)
  const shared = { ...props, kit, rows, of, replace: demo?.setRows, now: demo?.now ?? Date.now(), leader: props.actor.roleIds.includes('owner') }
  if (screenId === kit.mineScreenId) return <Mine {...shared} />
  if (screenId === kit.boardScreenId) return <Board {...shared} />
  if (screenId === kit.projectsScreenId) return <ProjectList {...shared} />
  if (screenId === kit.projectScreenId) return <ProjectCard {...shared} />
  if (screenId === kit.taskScreenId) return <TaskCard {...shared} />
  if (screenId === kit.peopleScreenId) return <PeopleList {...shared} />
  if (screenId === kit.clientsScreenId) return <ClientList {...shared} />
  if (kit.ganttScreenId && screenId === kit.ganttScreenId) return <GanttScreen {...stage2(shared)} />
  if (kit.workloadScreenId && screenId === kit.workloadScreenId) return <WorkloadScreen {...stage2(shared)} />
  if (kit.templatesScreenId && screenId === kit.templatesScreenId) return <TemplatesScreen {...stage2(shared)} initialOpen={demo?.open === 'template' || demo?.open === 'from-template' ? demo.open : null} />
  if (kit.clientScreenId && screenId === kit.clientScreenId) return <ClientProjectView {...stage2(shared)} recordId={recordId ?? ''} />
  return null
}

function stage2(props: ScreenProps): Stage2Helpers {
  return {
    kit: props.kit,
    tables: props.tables,
    rows: props.rows,
    of: props.of,
    replace: props.replace,
    now: props.now,
    leader: props.leader,
    actor: props.actor,
    onNavigate: props.onNavigate,
    choiceName: (tableId, fieldId, value) => choiceName(props.tables, tableId, fieldId, value),
    choiceId: (tableId, fieldId, name) => choiceId(props.tables, tableId, fieldId, name),
    people: () => people(props),
    saveRemote: async body => {
      const published = publishedHolder.current
      if (!published || published.revision === 'demo') return false
      const result = await savePublishedProjectsAction(published.slug, { revision: published.revision, screenId: props.screenId, ...body })
      if (result.ok) published.refresh(result.message)
      return result.ok
    },
  }
}

type ScreenProps = Omit<AppV2RendererProps, 'rows'> & {
  kit: NonNullable<AppV2['projects']>
  rows: AppV2Record[]
  of: (tableId: string) => AppV2Record[]
  replace?: (rows: AppV2Record[]) => void
  now: number
  leader: boolean
}

type TaskFactsExtra = TaskFacts & {
  start: unknown
  estimate: number | null
  authorId: string
  authorEmail: string
  observerIds: string[]
  repeat: string
  repeatEvery: number | null
}

function taskFacts(props: ScreenProps, row: AppV2Record): TaskFactsExtra {
  const task = props.kit.task
  return {
    id: row.id,
    status: choiceName(props.tables, props.kit.tasksTableId, task.status, row.values[task.status]),
    priority: choiceName(props.tables, props.kit.tasksTableId, task.priority, row.values[task.priority]),
    due: row.values[task.due],
    start: task.start ? row.values[task.start] : null,
    estimate: task.estimate && typeof row.values[task.estimate] === 'number' ? Number(row.values[task.estimate]) : null,
    assigneeId: firstId(row.values[task.assignee]),
    assigneeEmail: textOf(row.values[task.assigneeEmail]).trim().toLowerCase(),
    authorId: task.author ? firstId(row.values[task.author]) : '',
    authorEmail: task.authorEmail ? textOf(row.values[task.authorEmail]).trim().toLowerCase() : '',
    observerIds: (() => {
      if (!task.observers) return [] as string[]
      const value = row.values[task.observers]
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    })(),
    projectId: firstId(row.values[task.project]),
    parentId: firstId(row.values[task.parent]),
    stageId: firstId(row.values[task.stage]),
    sort: Number(row.values[task.sort] ?? 0) || 0,
    repeat: task.repeat ? choiceName(props.tables, props.kit.tasksTableId, task.repeat, row.values[task.repeat]) : '',
    repeatEvery: task.repeatEvery && typeof row.values[task.repeatEvery] === 'number' ? Number(row.values[task.repeatEvery]) : null,
  }
}

function people(props: ScreenProps) {
  return props.of(props.kit.peopleTableId).map(row => ({
    id: row.id,
    name: textOf(row.values[props.kit.person.name]),
    email: textOf(row.values[props.kit.person.email]).trim().toLowerCase(),
    phone: textOf(row.values[props.kit.person.phone]),
    photo: row.values[props.kit.person.photo],
    role: choiceName(props.tables, props.kit.peopleTableId, props.kit.person.role, row.values[props.kit.person.role]),
    active: choiceName(props.tables, props.kit.peopleTableId, props.kit.person.active, row.values[props.kit.person.active]) !== 'Неактивен',
  }))
}
const personById = (props: ScreenProps, id: string) => people(props).find(item => item.id === id)
const personByEmail = (props: ScreenProps, email: string) => people(props).find(item => item.email === email.trim().toLowerCase())
const projectTitle = (props: ScreenProps, id: string) => primaryOf(props.rows, props.tables, id)
const clientTitle = (props: ScreenProps, id: string) => primaryOf(props.rows, props.tables, id)
const taskTitle = (props: ScreenProps, id: string) => {
  const row = props.rows.find(item => item.id === id)
  return row ? textOf(row.values[props.kit.task.title]) : ''
}

function stagesOf(props: ScreenProps) {
  return props.of(props.kit.stagesTableId).map(row => ({
    id: row.id,
    title: textOf(row.values[props.kit.stage.title]),
    projectId: firstId(row.values[props.kit.stage.project]),
    start: row.values[props.kit.stage.start],
    end: row.values[props.kit.stage.end],
    goal: textOf(row.values[props.kit.stage.goal]),
    status: choiceName(props.tables, props.kit.stagesTableId, props.kit.stage.status, row.values[props.kit.stage.status]),
  })).sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')))
}

function childProgress(props: ScreenProps, parentId: string) {
  const statuses = props.of(props.kit.tasksTableId).map(row => taskFacts(props, row)).filter(item => item.parentId === parentId).map(item => item.status)
  return subtaskProgress(statuses)
}

function mentionedIds(props: ScreenProps, email: string) {
  const person = personByEmail(props, email)
  if (!person) return new Set<string>()
  const ids = new Set<string>()
  for (const row of props.of(props.kit.commentsTableId)) {
    const mentions = row.values[props.kit.comment.mentions]
    if (Array.isArray(mentions) && mentions.includes(person.id)) ids.add(firstId(row.values[props.kit.comment.task]))
  }
  return ids
}

function CommentText({ text, names }: { text: string; names: string[] }) {
  const tokens = names.filter(Boolean).sort((a, b) => b.length - a.length)
  if (!tokens.length) return <>{text}</>
  const pattern = tokens.map(name => `@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).join('|')
  return <>{text.split(new RegExp(`(${pattern})`, 'g')).map((part, index) => tokens.some(name => part === `@${name}`) ? <mark key={index} className={css.mention}>{part}</mark> : <span key={index}>{part}</span>)}</>
}

function visibleTasks(props: ScreenProps) {
  const email = props.actor.email?.trim().toLowerCase() ?? ''
  return props.of(props.kit.tasksTableId)
    .map(row => ({ row, facts: taskFacts(props, row) }))
    .filter(item => props.leader || item.facts.assigneeEmail === email)
    .sort((a, b) => a.facts.sort - b.facts.sort || a.row.id.localeCompare(b.row.id))
}

function TaskCardView(props: ScreenProps & { row: AppV2Record; onOpen: () => void; onStatus?: () => void; variant?: 'board' | 'mine' | 'project' }) {
  const facts = taskFacts(props, props.row)
  const overdue = isOverdue(facts, props.now)
  const person = personById(props, facts.assigneeId)
  const progress = childProgress(props, props.row.id)
  const due = formatDay(facts.due)
  const variant = props.variant ?? 'board'
  const subtasks = progress.total ? `${progress.done} из ${progress.total}` : ''
  const parent = facts.parentId ? taskTitle(props, facts.parentId) : ''
  if (variant !== 'board') {
    return <article className={css.rowCard} data-overdue={overdue || undefined}>
      <button type="button" className={css.rowOpen} onClick={props.onOpen}>
        <span className={css.rowMain}>
          <span className={css.cardTitle}>{textOf(props.row.values[props.kit.task.title])}</span>
          {parent ? <span className={css.parentLine}>→ {parent}</span> : null}
          {variant === 'mine' ? <span className={css.projectName}>{projectTitle(props, facts.projectId) || 'Без проекта'}</span> : null}
        </span>
        <span className={css.rowPriority}><Badge name={facts.priority} /></span>
        <span className={css.rowSub}>{subtasks}</span>
        <span className={`${css.rowDue} ${css.due}`} data-overdue={overdue || undefined}>{due || 'Без срока'}</span>
      </button>
    </article>
  }
  return <article className={css.card} data-overdue={overdue || undefined} draggable onDragStart={event => { event.dataTransfer.setData('text/plain', props.row.id); event.dataTransfer.effectAllowed = 'move' }}>
    <button type="button" className={css.cardOpen} onClick={props.onOpen}>
      <span className={css.cardTitle}>{textOf(props.row.values[props.kit.task.title])}</span>
      <span className={css.projectName}>{projectTitle(props, facts.projectId) || 'Без проекта'}</span>
      <span className={css.cardMeta}>
        <span className={css.personLine}>{person ? <BookingAvatar name={person.name} photo={person.photo} small /> : <ProtoIcon name="user" size={16} />}<span>{person?.name || 'Не назначено'}</span></span>
        <span className={css.due} data-overdue={overdue || undefined}>{due || 'Без срока'}</span>
      </span>
    </button>
    <div className={css.cardFoot}>
      <Badge name={facts.priority} />
      {subtasks ? <span className={css.subtasks}>{subtasks}</span> : null}
      {props.onStatus ? <button type="button" className={css.statusChip} onClick={props.onStatus}>{statusChipLabel(facts.status)}</button> : null}
    </div>
  </article>
}

function Mine(props: ScreenProps) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [open, setOpen] = useState(false)
  const email = (props.actor.email ?? '').trim().toLowerCase()
  const observerEmails = (facts: TaskFactsExtra) => facts.observerIds.map(id => personById(props, id)?.email ?? '').filter(Boolean)
  const tasks = props.of(props.kit.tasksTableId).map(row => ({ row, facts: taskFacts(props, row) }))
    .filter(item => item.facts.assigneeEmail === email)
    .filter(item => passFilters(props, item, filters)).sort((a, b) => a.facts.sort - b.facts.sort)
  const mentions = props.of(props.kit.tasksTableId).map(row => ({ row, facts: taskFacts(props, row) })).filter(item => item.facts.assigneeEmail !== email && mentionedIds(props, email).has(item.row.id) && !isDone(item.facts.status)).filter(item => passFilters(props, item, filters))
  const authored = props.of(props.kit.tasksTableId).map(row => ({ row, facts: taskFacts(props, row) })).filter(item => item.facts.authorEmail === email && item.facts.assigneeEmail !== email && !isDone(item.facts.status)).filter(item => passFilters(props, item, filters))
  const watching = props.of(props.kit.tasksTableId).map(row => ({ row, facts: taskFacts(props, row) })).filter(item => observerEmails(item.facts).includes(email) && item.facts.assigneeEmail !== email && item.facts.authorEmail !== email && !isDone(item.facts.status)).filter(item => passFilters(props, item, filters))
  const any = tasks.some(item => taskBucket(item.facts, props.now)) || mentions.length || authored.length || watching.length
  return <div className={css.root} data-projects-screen="mine">
    <div className={css.toolbar}><h1>Мои задачи</h1><span className={css.grow} /><div className={css.actions}><button type="button" className={buttons.secondary} onClick={() => setOpen(true)}>Фильтры</button></div></div>
    <div className={css.pad}><div className={css.groups}>
      {any ? <>
        {BUCKETS.map(bucket => {
          const items = tasks.filter(item => taskBucket(item.facts, props.now) === bucket.id)
          if (!items.length) return null
          return <section key={bucket.id} className={css.group}><h2>{bucket.label} <span>{items.length}</span></h2><ul className={css.list}>{items.map(item => <li key={item.row.id}><TaskCardView {...props} variant="mine" row={item.row} onOpen={() => props.onNavigate?.(props.kit.taskScreenId, item.row.id)} /></li>)}</ul></section>
        })}
        {authored.length ? <section className={css.group} data-projects-group="author"><h2>Я постановщик <span>{authored.length}</span></h2><ul className={css.list}>{authored.map(item => <li key={item.row.id}><TaskCardView {...props} variant="mine" row={item.row} onOpen={() => props.onNavigate?.(props.kit.taskScreenId, item.row.id)} /></li>)}</ul></section> : null}
        {watching.length ? <section className={css.group} data-projects-group="observer"><h2>Я наблюдаю <span>{watching.length}</span></h2><ul className={css.list}>{watching.map(item => <li key={item.row.id}><TaskCardView {...props} variant="mine" row={item.row} onOpen={() => props.onNavigate?.(props.kit.taskScreenId, item.row.id)} /></li>)}</ul></section> : null}
        {mentions.length ? <section className={css.group} data-projects-group="mentions"><h2>Упоминания <span>{mentions.length}</span></h2><ul className={css.list}>{mentions.map(item => <li key={item.row.id}><TaskCardView {...props} variant="mine" row={item.row} onOpen={() => props.onNavigate?.(props.kit.taskScreenId, item.row.id)} /></li>)}</ul></section> : null}
      </> : <p className={css.empty}>На вашу почту задач нет. На доске видны задачи, которые вам назначены.</p>}
    </div></div>
    {open ? <FiltersDialog {...props} value={filters} onChange={setFilters} onClose={() => setOpen(false)} hideAssignee showRole /> : null}
  </div>
}

function Board(props: ScreenProps) {
  const demo = useContext(ProjectsRowsContext)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [openFilters, setOpenFilters] = useState(demo?.open === 'filters')
  const [create, setCreate] = useState(demo?.open === 'create')
  const [statusFor, setStatusFor] = useState<string | null>(null)
  const [over, setOver] = useState('')
  const [phoneStatus, setPhoneStatus] = useState<string>(TASK_STATUSES[0])
  const tasks = visibleTasks(props).filter(item => !item.facts.parentId).filter(item => passFilters(props, item, filters))
  const statuses = TASK_STATUSES.map(name => ({ name, id: choiceId(props.tables, props.kit.tasksTableId, props.kit.task.status, name) }))
  const drop = (statusId: string, beforeId: string | null, event: DragEvent) => {
    event.preventDefault()
    const movedId = event.dataTransfer.getData('text/plain')
    setOver('')
    if (!movedId) return
    const column = tasks.filter(item => choiceId(props.tables, props.kit.tasksTableId, props.kit.task.status, item.facts.status) === statusId && item.row.id !== movedId)
    const orderedIds = reorderColumn(column.map(item => item.row.id), movedId, beforeId)
    void saveMove(props, movedId, statusId, orderedIds)
  }
  return <div className={css.root} data-projects-screen="board">
    <div className={css.toolbar}><h1>Доска</h1><span className={css.grow} /><div className={css.actions}><button type="button" className={buttons.secondary} onClick={() => setOpenFilters(true)}>Фильтры</button>{props.leader ? <button type="button" className={buttons.primary} onClick={() => setCreate(true)}><ProtoIcon name="plus" size={16} />Задача</button> : null}</div></div>
    <div className={css.pad}>
      <div className={css.phoneStatuses} role="tablist" aria-label="Статусы задач">
        {statuses.map(status => {
          const count = tasks.filter(item => item.facts.status === status.name).length
          return <button key={status.name} type="button" role="tab" aria-selected={phoneStatus === status.name} onClick={() => setPhoneStatus(status.name)}>{status.name}<span>{count}</span></button>
        })}
      </div>
      <div className={css.board}>
      {statuses.map(status => {
        const items = tasks.filter(item => item.facts.status === status.name)
        return <section key={status.id || status.name} className={css.column} data-active={phoneStatus === status.name || undefined} data-over={over === status.id || undefined} aria-label={status.name} onDragOver={event => { event.preventDefault(); setOver(status.id) }} onDragLeave={() => setOver(current => current === status.id ? '' : current)} onDrop={event => drop(status.id, null, event)}>
          <h2>{status.name} <span>{items.length}</span></h2>
          {items.map(item => <div key={item.row.id} onDragOver={event => { event.preventDefault(); event.stopPropagation() }} onDrop={event => { event.stopPropagation(); drop(status.id, item.row.id, event) }}>
            <TaskCardView {...props} row={item.row} onOpen={() => props.onNavigate?.(props.kit.taskScreenId, item.row.id)} onStatus={() => setStatusFor(item.row.id)} />
          </div>)}
          {items.length ? null : <p className={css.empty}>В этой колонке задач нет.</p>}
        </section>
      })}
    </div></div>
    {openFilters ? <FiltersDialog {...props} value={filters} onChange={setFilters} onClose={() => setOpenFilters(false)} showStage showRole /> : null}
    {create ? <TaskEditor {...props} mode="create" onClose={() => setCreate(false)} /> : null}
    {statusFor ? <StatusDialog {...props} rowId={statusFor} onClose={() => setStatusFor(null)} /> : null}
  </div>
}

function ProjectList(props: ScreenProps) {
  const [create, setCreate] = useState(false)
  const projects = props.of(props.kit.projectsTableId)
  return <div className={css.root} data-projects-screen="projects">
    <div className={css.toolbar}><h1>Проекты</h1><span className={css.grow} /><div className={css.actions}>{props.leader ? <button type="button" className={buttons.primary} onClick={() => setCreate(true)}><ProtoIcon name="plus" size={16} />Проект</button> : null}</div></div>
    <div className={css.pad}><div className={css.team}>{projects.map(row => {
      const client = clientTitle(props, firstId(row.values[props.kit.project.client]))
      const status = choiceName(props.tables, props.kit.projectsTableId, props.kit.project.status, row.values[props.kit.project.status])
      const progress = projectProgress(props, row.id)
      return <button key={row.id} type="button" className={css.projectRow} onClick={() => props.onNavigate?.(props.kit.projectScreenId, row.id)}>
        <span><strong>{textOf(row.values[props.kit.project.title])}</strong><br /><span className={css.quiet}>{client || 'Клиент не указан'}</span></span>
        <Badge name={status} />
        <span className={css.subtasks}>{progress}%</span>
      </button>
    })}</div></div>
    {create ? <ProjectEditor {...props} onClose={() => setCreate(false)} /> : null}
  </div>
}

function PeopleList(props: ScreenProps) {
  return <div className={css.root} data-projects-screen="people"><div className={css.toolbar}><h1>Команда</h1></div><div className={css.pad}><div className={css.team}>{people(props).map(person => <div key={person.id} className={css.personLine}><BookingAvatar name={person.name} photo={person.photo} small /><span><strong>{person.name}</strong><br /><span className={css.quiet}>{person.role}{person.active ? '' : ' · не в команде'}</span></span></div>)}</div></div></div>
}

function ClientList(props: ScreenProps) {
  return <div className={css.root} data-projects-screen="clients"><div className={css.toolbar}><h1>Клиенты</h1></div><div className={css.pad}><ul className={css.list}>{props.of(props.kit.clientsTableId).map(row => <li key={row.id} className={css.card}><strong>{textOf(row.values[props.kit.client.name])}</strong><span className={css.projectName}>{textOf(row.values[props.kit.client.phone])}</span><span className={css.quiet}>{textOf(row.values[props.kit.client.note])}</span></li>)}</ul></div></div>
}

function projectProgress(props: ScreenProps, projectId: string) {
  return progressPercent(props.of(props.kit.tasksTableId).map(taskFacts.bind(null, props)).filter(item => item.projectId === projectId && !item.parentId).map(item => item.status))
}

function ProjectCard(props: ScreenProps) {
  const demo = useContext(ProjectsRowsContext)
  const row = props.rows.find(item => item.id === props.record?.id) ?? props.record
  const [tab, setTab] = useState<ProjectsTab>(demo?.tab ?? 'stages')
  const [edit, setEdit] = useState(false)
  const [share, setShare] = useState(demo?.open === 'share')
  if (!row) return <p className={css.empty}>Проект не найден.</p>
  const status = choiceName(props.tables, props.kit.projectsTableId, props.kit.project.status, row.values[props.kit.project.status])
  const progress = projectProgress(props, row.id)
  const tasks = visibleTasks(props).filter(item => item.facts.projectId === row.id)
  const topTasks = tasks.filter(item => !item.facts.parentId)
  const projectStages = stagesOf(props).filter(item => item.projectId === row.id)
  const clientId = firstId(row.values[props.kit.project.client])
  const owner = personById(props, firstId(row.values[props.kit.project.owner]))
  const team = new Map<string, ReturnType<typeof personById>>()
  if (owner) team.set(owner.id, owner)
  for (const item of tasks) {
    const person = personById(props, item.facts.assigneeId)
    if (person) team.set(person.id, person)
  }
  const files = tasks.flatMap(item => fileItems(item.row.values[props.kit.task.files]).map(file => ({ ...file, task: textOf(item.row.values[props.kit.task.title]) })))
  const feed = props.of(props.kit.eventsTableId).filter(item => firstId(item.values[props.kit.event.project]) === row.id)
    .sort((a, b) => String(b.values[props.kit.event.at] ?? '').localeCompare(String(a.values[props.kit.event.at] ?? '')))
  const due = formatDay(row.values[props.kit.project.due])
  const overdue = status !== 'Сдан' && status !== 'Отменён' && isOverdue({ status: 'К работе', due: row.values[props.kit.project.due] }, props.now)
  const closed = topTasks.filter(item => isDone(item.facts.status)).length
  const spent = projectSpentSummary(stage2(props), row.id)
  const estimate = topTasks.reduce((sum, item) => sum + (item.facts.estimate ?? 0), 0)
  return <div className={css.root} data-projects-screen="project" data-projects-tab={tab}>
    <DetailCardShell
      title={textOf(row.values[props.kit.project.title])}
      subtitle={clientTitle(props, clientId) || 'Клиент не указан'}
      chips={<Badge name={status} />}
      back={{ label: 'Проекты', onClick: () => props.onNavigate?.(props.kit.projectsScreenId) }}
      actions={props.leader ? <div className={css.headerActions}><button type="button" className={buttons.secondary} onClick={() => setShare(true)}>Ссылка клиенту</button><button type="button" className={buttons.secondary} onClick={() => setEdit(true)}>Изменить</button></div> : null}
      metrics={[
        { key: 'start', caption: 'Начало', value: formatDay(row.values[props.kit.project.start]) || '—' },
        { key: 'due', caption: 'Срок', value: due || '—', tone: overdue ? 'rose' : undefined },
        { key: 'time', caption: 'Время', value: `${spent ? `${Math.round(spent / 60 * 10) / 10} ч` : '0 ч'}${estimate ? ` / ${Math.round(estimate / 60 * 10) / 10} ч` : ''}` },
        { key: 'progress', caption: 'Прогресс', value: `${progress}%`, note: <span className={css.metricProgress}><span className={css.bar} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Прогресс проекта"><span style={{ width: `${progress}%` }} /></span>{closed} из {topTasks.length} задач</span> },
      ]}
    >
      <div className={css.pad}>
        <div className={css.tabs} role="tablist" aria-label="Разделы проекта">
          {([['stages', 'Этапы'], ['tasks', 'Задачи'], ['gantt', 'Гант'], ['team', 'Команда'], ['files', 'Файлы'], ['feed', 'Лента']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        {tab === 'stages' ? <div className={css.stages}>{projectStages.map(stage => {
          const items = topTasks.filter(item => item.facts.stageId === stage.id)
          const done = items.filter(item => isDone(item.facts.status)).length
          const percent = items.length ? Math.round(done / items.length * 100) : 0
          const dates = [formatDay(stage.start), formatDay(stage.end)].filter(Boolean).join(' — ')
          return <section key={stage.id} className={css.stage}>
            <header><h3>{stage.title}</h3><Badge name={stage.status} /></header>
            <p className={css.quiet}>{dates || 'Даты не указаны'}</p>
            {stage.goal ? <p>{stage.goal}</p> : null}
            <div className={css.metricProgress}><span className={css.bar} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Прогресс этапа ${stage.title}`}><span style={{ width: `${percent}%` }} /></span>{done} из {items.length}</div>
            <ul className={css.list}>{items.length ? items.map(item => <li key={item.row.id}><TaskCardView {...props} variant="project" row={item.row} onOpen={() => props.onNavigate?.(props.kit.taskScreenId, item.row.id)} /></li>) : <li className={css.empty}>В этапе пока нет задач.</li>}</ul>
          </section>
        })}{(() => {
          const loose = topTasks.filter(item => !item.facts.stageId)
          if (!loose.length) return null
          return <section className={css.stage}><header><h3>Без этапа</h3></header><ul className={css.list}>{loose.map(item => <li key={item.row.id}><TaskCardView {...props} variant="project" row={item.row} onOpen={() => props.onNavigate?.(props.kit.taskScreenId, item.row.id)} /></li>)}</ul></section>
        })()}</div> : null}
        {tab === 'tasks' ? <ul className={css.list}>{topTasks.length ? topTasks.map(item => <li key={item.row.id}><TaskCardView {...props} variant="project" row={item.row} onOpen={() => props.onNavigate?.(props.kit.taskScreenId, item.row.id)} /></li>) : <li className={css.empty}>В проекте пока нет задач.</li>}</ul> : null}
        {tab === 'gantt' ? <GanttScreen {...stage2(props)} projectId={row.id} /> : null}
        {tab === 'team' ? <div className={css.team}>{[...team.values()].map(person => person ? <div key={person.id} className={css.personLine}><BookingAvatar name={person.name} photo={person.photo} small /><span><strong>{person.name}</strong><br /><span className={css.quiet}>{person.id === owner?.id ? `Ответственный · ${person.role}` : person.role}<br />{openTasksLabel(tasks.filter(item => item.facts.assigneeId === person.id && !isDone(item.facts.status)).length)}</span></span></div> : null)}</div> : null}
        {tab === 'files' ? <ul className={css.files}>{files.length ? files.map(file => <li key={file.id}><ProtoIcon name="file" size={18} /><div><strong className={css.fileName}>{file.name}</strong><div className={css.quiet}>{file.task} · {fileSize(file.size)}</div></div></li>) : <li className={css.empty}>Файлов по проекту пока нет.</li>}</ul> : null}
        {tab === 'feed' ? <ul className={css.feed}>{feed.length ? feed.map(item => {
          const author = textOf(item.values[props.kit.event.author])
          const person = personByEmail(props, textOf(item.values[props.kit.event.authorEmail]))
          return <li key={item.id}><BookingAvatar name={author || 'Автор'} photo={person?.photo} small /><div><strong>{author || 'Сотрудник'}</strong> <time dateTime={textOf(item.values[props.kit.event.at])}>{formatDay(item.values[props.kit.event.at])}</time><p>{textOf(item.values[props.kit.event.text])}</p></div></li>
        }) : <li className={css.empty}>В ленте пока пусто.</li>}</ul> : null}
      </div>
    </DetailCardShell>
    {edit ? <ProjectEditor {...props} row={row} onClose={() => setEdit(false)} /> : null}
    {share ? <ShareProjectDialog {...stage2(props)} projectId={row.id} onClose={() => setShare(false)} /> : null}
  </div>
}

function TaskCard(props: ScreenProps) {
  const demo = useContext(ProjectsRowsContext)
  const row = props.rows.find(item => item.id === props.record?.id) ?? props.record
  const [edit, setEdit] = useState(demo?.open === 'edit')
  const [comment, setComment] = useState(demo?.open === 'comment' || demo?.open === 'mention')
  const [recurrence, setRecurrence] = useState(demo?.open === 'recurrence')
  const [error, setError] = useState('')
  const [subtask, setSubtask] = useState('')
  const [point, setPoint] = useState('')
  if (!row) return <p className={css.empty}>Задача не найдена.</p>
  const facts = taskFacts(props, row)
  const overdue = isOverdue(facts, props.now)
  const person = personById(props, facts.assigneeId)
  const checklist = parseChecklist(row.values[props.kit.task.checklist])
  const children = props.of(props.kit.tasksTableId).filter(item => taskFacts(props, item).parentId === row.id).sort((a, b) => taskFacts(props, a).sort - taskFacts(props, b).sort)
  const progress = subtaskProgress(children.map(item => taskFacts(props, item).status))
  const files = fileItems(row.values[props.kit.task.files])
  const spent = totalSpentMinutes(timeEntries(stage2(props)), row.id, props.now)
  const active = timeEntries(stage2(props)).some(entry => entry.taskId === row.id && !entry.endedAt && entry.email === (props.actor.email ?? '').trim().toLowerCase())
  const toggle = (index: number) => { void saveTaskPatch(props, row, { checklist: serializeChecklist(toggleChecklistItem(checklist, index)) }, setError) }
  const setStatus = (name: string) => { void saveTaskPatch(props, row, { statusId: choiceId(props.tables, props.kit.tasksTableId, props.kit.task.status, name) }, setError) }
  const toggleChild = (child: AppV2Record) => {
    const status = taskFacts(props, child).status
    void saveTaskPatch(props, child, { statusId: choiceId(props.tables, props.kit.tasksTableId, props.kit.task.status, isDone(status) ? 'К работе' : 'Готово') }, setError)
  }
  const addPoint = () => {
    const label = point.trim()
    if (!label) return
    void saveTaskPatch(props, row, { checklist: serializeChecklist([...checklist, { label, done: false }]) }, setError)
    setPoint('')
  }
  const addSubtask = () => {
    const title = subtask.trim()
    if (!title) return
    void saveSubtask(props, row, title, setError)
    setSubtask('')
  }
  const projectName = projectTitle(props, facts.projectId) || 'Без проекта'
  const parentName = facts.parentId ? taskTitle(props, facts.parentId) : ''
  const taskName = textOf(row.values[props.kit.task.title])
  return <div className={css.root} data-projects-screen={facts.parentId ? 'subtask' : 'task'}>
    <DetailCardShell
      title={taskName}
      chips={<div className={css.headerChips}>
        {facts.parentId ? <nav className={css.crumb} data-task-crumb aria-label="Путь задачи">
          <button type="button" className={css.crumbLink} onClick={() => props.onNavigate?.(props.kit.projectScreenId, facts.projectId)}>{projectName}</button>
          <span aria-hidden="true"> › </span>
          <button type="button" className={css.crumbLink} onClick={() => props.onNavigate?.(props.kit.taskScreenId, facts.parentId)}>{parentName || 'Задача'}</button>
          <span aria-hidden="true"> › </span>
          <span>{taskName || 'Подзадача'}</span>
        </nav> : null}
        <div className={css.taskHeadRow}>
          <span className={css.cardFoot}><Badge name={facts.priority} />{overdue ? <Badge name="Просрочено" /> : null}{facts.repeat && facts.repeat !== 'Не повторять' ? <span className={css.repeatBadge}>{repeatLabelFor(stage2(props), row)}</span> : null}{active ? <span className={css.timerActive} data-timer-active><span className={css.timerDot} />Таймер</span> : null}</span>
          <div className={css.headerActions}><button type="button" className={buttons.secondary} onClick={() => setRecurrence(true)}>Повтор</button><button type="button" className={buttons.secondary} onClick={() => setEdit(true)}>Изменить</button><button type="button" className={buttons.secondary} onClick={() => setComment(true)}>Комментарий</button></div>
        </div>
        <TaskRolesLine {...stage2(props)} authorId={facts.authorId} observerIds={facts.observerIds} repeat={facts.repeat} every={facts.repeatEvery} />
        <Segmented plain label="Статус" value={String(row.values[props.kit.task.status] ?? '')} options={TASK_STATUSES.map(name => ({ id: choiceId(props.tables, props.kit.tasksTableId, props.kit.task.status, name), name }))} onChange={id => { const name = TASK_STATUSES.find(item => choiceId(props.tables, props.kit.tasksTableId, props.kit.task.status, item) === id); if (name) setStatus(name) }} />
        {facts.parentId ? (() => {
          const parentRow = props.of(props.kit.tasksTableId).find(item => item.id === facts.parentId)
          const parentStatus = parentRow ? taskFacts(props, parentRow).status : ''
          return <button type="button" className={css.parentTile} data-parent-tile onClick={() => props.onNavigate?.(props.kit.taskScreenId, facts.parentId)}>
            <span className={css.parentTileLabel}>Родительская задача</span>
            <span className={css.parentTileMain}>
              <span className={css.parentTileTitle}>{parentName || 'Открыть задачу'}</span>
              {parentStatus ? <Badge name={parentStatus} /> : null}
              <ProtoIcon name="arrow" size={16} />
            </span>
          </button>
        })() : null}
      </div>}
      back={facts.parentId ? { label: parentName || 'Задача', onClick: () => props.onNavigate?.(props.kit.taskScreenId, facts.parentId) } : { label: 'Доска', onClick: () => props.onNavigate?.(props.kit.boardScreenId) }}
      metrics={[
        { key: 'project', caption: 'Проект', value: <button type="button" className={css.metricText} onClick={() => props.onNavigate?.(props.kit.projectScreenId, facts.projectId)}>{projectName}</button> },
        { key: 'who', caption: 'Исполнитель', value: <span className={css.metricPerson}>{person ? <BookingAvatar name={person.name} photo={person.photo} small /> : null}<span>{person?.name || 'Не назначен'}</span></span> },
        { key: 'due', caption: 'Срок', value: <span className={css.metricText} data-overdue={overdue || undefined}>{formatDay(facts.due) || 'Не указан'}</span>, tone: overdue ? 'rose' : undefined },
        { key: 'time', caption: 'Время', value: <span className={css.metricText}>{formatSpentPair(spent, facts.estimate)}</span> },
        ...(facts.parentId ? [] : [{ key: 'sub', caption: 'Подзадачи', value: <span className={css.metricText}>{progress.total ? `${progress.done} из ${progress.total}` : 'Нет'}</span> }]),
      ]}
    >
      <div className={css.pad}>
        {textOf(row.values[props.kit.task.description]) ? <DetailSection title="Описание"><p>{textOf(row.values[props.kit.task.description])}</p></DetailSection> : null}
        <TaskTimePanel {...stage2(props)} taskId={row.id} projectId={facts.projectId} estimate={facts.estimate} />
        {facts.parentId ? null : <DetailSection title="Подзадачи">
          {children.length ? <ul className={css.subtaskList} data-subtask-list>{children.map(child => {
            const childFacts = taskFacts(props, child)
            const who = personById(props, childFacts.assigneeId)
            const late = isOverdue(childFacts, props.now)
            const done = isDone(childFacts.status)
            const title = textOf(child.values[props.kit.task.title])
            const noteCount = props.of(props.kit.commentsTableId).filter(item => firstId(item.values[props.kit.comment.task]) === child.id).length
            return <li key={child.id} className={css.subtaskCard} data-overdue={late || undefined}>
              <button type="button" role="checkbox" aria-checked={done} aria-label={`Закрыть: ${title}`} className={css.subtaskCheck} onClick={() => toggleChild(child)}><span data-on={done || undefined}>{done ? <ProtoIcon name="check" size={12} /> : null}</span></button>
              <button type="button" className={css.subtaskOpen} onClick={() => props.onNavigate?.(props.kit.taskScreenId, child.id)}>
                <span className={css.subtaskMain}>
                  <span className={css.subtaskTitle} data-done={done || undefined}>{title}</span>
                  <span className={css.subtaskBadges}><Badge name={childFacts.status} /><Badge name={childFacts.priority} /></span>
                </span>
                <span className={css.subtaskAside}>
                  {noteCount > 0 ? <span className={css.subtaskComments} data-subtask-comments={noteCount} aria-label={`${noteCount} ${noteCount === 1 ? 'комментарий' : noteCount < 5 ? 'комментария' : 'комментариев'}`}>
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" d="M3.1 2.6h9.8c.83 0 1.5.67 1.5 1.5v5.4c0 .83-.67 1.5-1.5 1.5H7.3L4.2 13.6V11H3.1c-.83 0-1.5-.67-1.5-1.5V4.1c0-.83.67-1.5 1.5-1.5z" /></svg>
                    <span>{noteCount}</span>
                  </span> : null}
                  {who ? <BookingAvatar name={who.name} photo={who.photo} small /> : <span className={css.subtaskAvatar}><ProtoIcon name="user" size={16} /></span>}
                  <span className={css.due} data-overdue={late || undefined}>{formatDay(childFacts.due) || 'Без срока'}</span>
                  <ProtoIcon name="arrow" size={16} />
                </span>
              </button>
            </li>
          })}</ul> : null}
          <form className={css.subtaskAdd} onSubmit={event => { event.preventDefault(); addSubtask() }}>
            <input type="text" aria-label="Новая подзадача" placeholder="Подзадача" value={subtask} onChange={event => setSubtask(event.target.value)} />
            <button type="submit" className={buttons.secondary}>Добавить подзадачу</button>
          </form>
        </DetailSection>}
        <DetailSection title="Чек-лист">
          {checklist.length ? <ul className={css.checkList}>{checklist.map((item, index) => <li key={`${item.label}-${index}`}><CheckControl checked={item.done} label={item.label} onToggle={() => toggle(index)} /></li>)}</ul> : null}
          <form className={css.subtaskAdd} onSubmit={event => { event.preventDefault(); addPoint() }}>
            <input type="text" aria-label="Новый пункт" placeholder="Пункт без срока" value={point} onChange={event => setPoint(event.target.value)} />
            <button type="submit" className={buttons.secondary}>Добавить пункт</button>
          </form>
        </DetailSection>
        <div data-task-comments data-task-chat><DetailSection title="Комментарии">
          <CommentChat {...stage2(props)} taskId={row.id} projectId={facts.projectId} assigneeEmail={facts.assigneeEmail} onRefresh={() => publishedHolder.current?.refresh('')} />
        </DetailSection></div>
        <DetailSection title="Файлы">
          {files.length ? <ul className={css.files}>{files.map(file => <li key={file.id}><ProtoIcon name="file" size={18} /><div><strong className={css.fileName}>{file.name}</strong><div className={css.quiet}>{fileSize(file.size)}</div></div></li>)}</ul> : <p className={css.empty}>Файлов пока нет.</p>}
        </DetailSection>
        {error && !edit ? <p className={css.error} role="alert">{error}</p> : null}
      </div>
    </DetailCardShell>
    {edit ? <TaskEditor {...props} mode="edit" row={row} onClose={() => setEdit(false)} /> : null}
    {comment ? <CommentDialog {...props} row={row} onClose={() => setComment(false)} /> : null}
    {recurrence && props.kit.task.repeat ? <RecurrenceDialog {...stage2(props)}
      value={String(row.values[props.kit.task.repeat] ?? '')}
      every={facts.repeatEvery != null ? String(facts.repeatEvery) : ''}
      until={props.kit.task.repeatUntil ? civilInput(row.values[props.kit.task.repeatUntil]) : ''}
      onChange={value => {
        void saveTaskPatch(props, row, {
          ...(props.kit.task.repeat ? { } : {}),
        } as never, setError)
        if (props.replace) {
          props.replace(props.rows.map(item => item.id === row.id ? {
            ...item,
            values: {
              ...item.values,
              [props.kit.task.repeat!]: value.repeatId,
              ...(props.kit.task.repeatEvery ? { [props.kit.task.repeatEvery]: value.every ? Number(value.every) : null } : {}),
              ...(props.kit.task.repeatUntil ? { [props.kit.task.repeatUntil]: value.until || null } : {}),
            },
          } : item))
        }
      }}
      onClose={() => setRecurrence(false)}
    /> : null}
  </div>
}

type Filters = { assignee: string; project: string; due: DueFilter; priority: string; stage: string; role: '' | 'author' | 'observer' | 'assignee' }
const EMPTY_FILTERS: Filters = { assignee: '', project: '', due: '', priority: '', stage: '', role: '' }
function passFilters(props: ScreenProps, item: { facts: TaskFactsExtra }, filters: Filters) {
  if (filters.assignee && item.facts.assigneeId !== filters.assignee) return false
  if (filters.project && item.facts.projectId !== filters.project) return false
  if (filters.priority && item.facts.priority !== filters.priority) return false
  if (filters.stage === 'current') {
    const stage = stagesOf(props).find(entry => entry.id === item.facts.stageId)
    if (stage?.status !== 'Текущий') return false
  } else if (filters.stage && item.facts.stageId !== filters.stage) return false
  if (filters.role) {
    const email = props.actor.email?.trim().toLowerCase() ?? ''
    const observerEmails = item.facts.observerIds.map(id => personById(props, id)?.email ?? '').filter(Boolean)
    if (!matchesRoleFilter({
      filter: filters.role,
      email,
      assigneeEmail: item.facts.assigneeEmail,
      authorEmail: item.facts.authorEmail,
      observerEmails,
    })) return false
  }
  return matchesDue(item.facts, filters.due, props.now)
}

function FiltersDialog(props: ScreenProps & { value: Filters; onChange: (value: Filters) => void; onClose: () => void; hideAssignee?: boolean; showStage?: boolean; showRole?: boolean }) {
  const [draft, setDraft] = useState(props.value)
  const assignees = people(props).filter(person => person.active)
  const projects = props.of(props.kit.projectsTableId).map(row => ({ id: row.id, name: textOf(row.values[props.kit.project.title]) }))
  const stages = stagesOf(props).filter(stage => !draft.project || stage.projectId === draft.project)
  return <AppDialog title="Фильтры" placement="center" onClose={props.onClose} footer={<div className={css.footerRow}><button type="button" className={buttons.secondary} onClick={() => setDraft(EMPTY_FILTERS)}>Сбросить</button><button type="button" className={buttons.primary} onClick={() => { props.onChange(draft); props.onClose() }}>Показать</button></div>}>
    <div className={css.form}>
      {props.showRole ? <ChoiceRow label="Роль" value={draft.role} options={[{ id: '', name: 'Исполнитель' }, { id: 'author', name: 'Я постановщик' }, { id: 'observer', name: 'Я наблюдаю' }]} onChange={role => setDraft({ ...draft, role: role as Filters['role'] })} /> : null}
      {props.hideAssignee ? null : <PeoplePick label="Исполнитель" value={draft.assignee} people={assignees} onChange={assignee => setDraft({ ...draft, assignee: draft.assignee === assignee ? '' : assignee })} allowEmpty />}
      <ProjectPick value={draft.project} options={[{ id: '', name: 'Все проекты' }, ...projects]} onChange={project => setDraft({ ...draft, project, stage: '' })} />
      {props.showStage ? <ChoiceRow label="Этап" value={draft.stage} options={[{ id: '', name: 'Все' }, { id: 'current', name: 'Текущий этап' }, ...stages.map(stage => ({ id: stage.id, name: stage.title }))]} onChange={stage => setDraft({ ...draft, stage })} /> : null}
      <ChoiceRow label="Срок" value={draft.due} options={[{ id: '', name: 'Любой' }, { id: 'today', name: 'Сегодня' }, { id: 'overdue', name: 'Просрочено' }, { id: 'week', name: 'На неделе' }, { id: 'later', name: 'Позже' }]} onChange={due => setDraft({ ...draft, due: due as DueFilter })} />
      <Segmented label="Приоритет" value={draft.priority} options={[{ id: '', name: 'Любой' }, ...PRIORITIES.map(name => ({ id: name, name }))]} onChange={priority => setDraft({ ...draft, priority })} />
    </div>
  </AppDialog>
}

function StatusDialog(props: ScreenProps & { rowId: string; onClose: () => void }) {
  const row = props.rows.find(item => item.id === props.rowId)
  if (!row) return null
  const statuses = TASK_STATUSES.map(name => ({ name, id: choiceId(props.tables, props.kit.tasksTableId, props.kit.task.status, name) }))
  return <AppDialog title="Статус задачи" placement="center" onClose={props.onClose}>
    <ChoiceRow label="Куда перенести" value={String(row.values[props.kit.task.status] ?? '')} options={statuses.map(item => ({ id: item.id, name: item.name }))} onChange={statusId => { void saveMove(props, row.id, statusId, [row.id]); props.onClose() }} />
  </AppDialog>
}

function PeoplePick({ label, value, people: list, onChange, allowEmpty }: { label: string; value: string; people: { id: string; name: string; photo?: AppV2Json }[]; onChange: (id: string) => void; allowEmpty?: boolean }) {
  return <fieldset className={css.field}><legend>{label}</legend><div className={css.peoplePick} role="radiogroup" aria-label={label}>
    {allowEmpty ? <button type="button" className={css.personPick} aria-pressed={!value} onClick={() => onChange('')}>Все</button> : null}
    {list.map(person => <button key={person.id} type="button" className={css.personPick} aria-pressed={person.id === value} onClick={() => onChange(person.id)}><BookingAvatar name={person.name} photo={person.photo} small /><span>{person.name}</span></button>)}
  </div></fieldset>
}

function PeopleMenu({ label, value, people: list, onChange }: { label: string; value: string; people: { id: string; name: string; photo?: AppV2Json }[]; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = list.find(person => person.id === value)
  const shown = list.filter(person => person.name.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')))
  return <div className={css.field}><span>{label}</span><div className={css.picker}>
    <button type="button" className={css.pickerButton} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(current => !current)}>
      <span className={css.pickerPerson}>{selected ? <><BookingAvatar name={selected.name} photo={selected.photo} small /><span>{selected.name}</span></> : 'Выберите исполнителя'}</span>
      <ProtoIcon name="down" size={16} />
    </button>
    {open ? <div className={css.pickerPanel}><input type="text" aria-label="Найти сотрудника" placeholder="Найти сотрудника" value={query} onChange={event => setQuery(event.target.value)} /><ul role="listbox">{shown.map(person => <li key={person.id}><button type="button" role="option" aria-selected={person.id === value} onClick={() => { onChange(person.id); setOpen(false); setQuery('') }}><span className={css.pickerPerson}><BookingAvatar name={person.name} photo={person.photo} small /><span>{person.name}</span></span></button></li>)}{shown.length ? null : <li className={css.empty}>Никого не найдено</li>}</ul></div> : null}
  </div></div>
}

function ProjectPick({ value, options, onChange }: { value: string; options: { id: string; name: string }[]; onChange: (id: string) => void }) {
  return <SearchPick label="Проект" value={value} options={options} onChange={onChange} placeholder="Выберите проект" searchLabel="Найти проект" />
}

function SearchPick({ label, value, options, onChange, placeholder, searchLabel }: { label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void; placeholder: string; searchLabel: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find(option => option.id === value)
  const shown = options.filter(option => option.name.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')))
  return <div className={css.field}><span>{label}</span><div className={css.picker}>
    <button type="button" className={css.pickerButton} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(current => !current)}><span>{selected?.name || placeholder}</span><ProtoIcon name="down" size={16} /></button>
    {open ? <div className={css.pickerPanel}><input type="text" aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event => setQuery(event.target.value)} /><ul role="listbox">{shown.map(option => <li key={option.id}><button type="button" role="option" aria-selected={option.id === value} onClick={() => { onChange(option.id); setOpen(false); setQuery('') }}>{option.name}</button></li>)}{shown.length ? null : <li className={css.empty}>Ничего не найдено</li>}</ul></div> : null}
  </div></div>
}

function TaskEditor(props: ScreenProps & { mode: 'create' | 'edit'; row?: AppV2Record; onClose: () => void }) {
  const formId = useId()
  const row = props.row
  const facts = row ? taskFacts(props, row) : null
  const startedAsSubtask = Boolean(facts?.parentId)
  const [title, setTitle] = useState(row ? textOf(row.values[props.kit.task.title]) : '')
  const [projectId, setProjectId] = useState(facts?.projectId ?? props.of(props.kit.projectsTableId)[0]?.id ?? '')
  const [parentId, setParentId] = useState(facts?.parentId ?? '')
  const [assigneeId, setAssigneeId] = useState(facts?.assigneeId ?? people(props).find(person => person.active)?.id ?? '')
  const [due, setDue] = useState(facts ? formatDay(facts.due).split('.').reverse().join('-') : '')
  const [priority, setPriority] = useState(facts ? choiceId(props.tables, props.kit.tasksTableId, props.kit.task.priority, facts.priority) : choiceId(props.tables, props.kit.tasksTableId, props.kit.task.priority, 'Средний'))
  const [status, setStatus] = useState(facts ? choiceId(props.tables, props.kit.tasksTableId, props.kit.task.status, facts.status) : props.kit.statuses.todo)
  const [description, setDescription] = useState(row ? textOf(row.values[props.kit.task.description]) : '')
  const [items, setItems] = useState<ChecklistItem[]>(row ? parseChecklist(row.values[props.kit.task.checklist]) : [])
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const activePeople = people(props).filter(person => person.active || person.id === assigneeId)
  const childIds = new Set(props.of(props.kit.tasksTableId).filter(item => taskFacts(props, item).parentId === row?.id).map(item => item.id))
  const parentOptions = [
    { id: '', name: 'Без родительской задачи' },
    ...props.of(props.kit.tasksTableId)
      .map(item => ({ row: item, facts: taskFacts(props, item) }))
      .filter(item => item.facts.projectId === projectId && !item.facts.parentId && item.row.id !== row?.id && !childIds.has(item.row.id))
      .map(item => ({ id: item.row.id, name: textOf(item.row.values[props.kit.task.title]) })),
  ]
  const setProject = (next: string) => {
    setProjectId(next)
    if (!startedAsSubtask || !parentId) return
    const nextAllowed = props.of(props.kit.tasksTableId)
      .map(item => ({ id: item.id, facts: taskFacts(props, item) }))
      .filter(item => item.facts.projectId === next && !item.facts.parentId && item.id !== row?.id && !childIds.has(item.id))
      .map(item => item.id)
    if (!nextAllowed.includes(parentId)) setParentId('')
  }
  const save = async () => {
    if (!title.trim()) { setError('Напишите, что нужно сделать.'); return }
    const assignee = people(props).find(person => person.id === assigneeId)
    if (!assignee) { setError('Выберите исполнителя.'); return }
    setBusy(true)
    const body = { title: title.trim(), projectId, assigneeId, assigneeEmail: assignee.email, due: due || null, priorityId: priority, statusId: status, description, checklist: serializeChecklist(items), ...(startedAsSubtask || parentId ? { parentId } : {}) }
    if (props.mode === 'create') await saveCreateTask(props, body, setError, props.onClose)
    else if (row) await saveTaskPatch(props, row, { ...body, files }, setError, props.onClose)
    setBusy(false)
  }
  return <AppDialog title={props.mode === 'create' ? 'Новая задача' : 'Изменить задачу'} placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={buttons.primary} disabled={busy}>{props.mode === 'create' ? 'Создать задачу' : 'Сохранить'}</button>}>
    <form id={formId} className={css.form} onSubmit={event => { event.preventDefault(); void save() }}>
      <label>Название<input type="text" value={title} onChange={event => setTitle(event.target.value)} /></label>
      <div className={css.field}><span>Срок</span><DateMenu label="Срок задачи" value={due} onValue={setDue} /></div>
      <Segmented label="Приоритет" value={priority} options={PRIORITIES.map(name => ({ id: choiceId(props.tables, props.kit.tasksTableId, props.kit.task.priority, name), name }))} onChange={setPriority} />
      {props.mode === 'edit' ? <Segmented label="Статус" value={status} options={TASK_STATUSES.map(name => ({ id: choiceId(props.tables, props.kit.tasksTableId, props.kit.task.status, name), name }))} onChange={setStatus} /> : null}
      <PeopleMenu label="Исполнитель" value={assigneeId} people={activePeople} onChange={setAssigneeId} />
      <ProjectPick value={projectId} options={props.of(props.kit.projectsTableId).map(item => ({ id: item.id, name: textOf(item.values[props.kit.project.title]) }))} onChange={setProject} />
      {startedAsSubtask ? <SearchPick label="Родительская задача" value={parentId} options={parentOptions} onChange={setParentId} placeholder="Выберите задачу" searchLabel="Найти задачу" /> : null}
      <label>Описание<textarea value={description} onChange={event => setDescription(event.target.value)} /></label>
      <div className={css.field}><span>Чек-лист</span><ul className={css.checkList}>{items.map((item, index) => <li key={`${item.label}-${index}`}><CheckControl checked={item.done} label={item.label} onToggle={() => setItems(toggleChecklistItem(items, index))} /></li>)}</ul>
        <div className={css.subtaskAdd}><input type="text" aria-label="Новый пункт" value={draft} placeholder="Пункт без срока" onChange={event => setDraft(event.target.value)} /><button type="button" className={buttons.secondary} onClick={() => { const label = draft.trim(); if (!label) return; setItems([...items, { label, done: false }]); setDraft('') }}>Добавить</button></div>
      </div>
      {props.mode === 'edit' ? <div className={css.field}><span>Файлы</span><label className={css.fileButton}><input className={css.fileInput} type="file" multiple onChange={event => setFiles([...files, ...Array.from(event.target.files ?? [])])} /><span className={buttons.secondary}>Прикрепить файл</span></label>{files.map(file => <span key={file.name} className={css.quiet}>{file.name}</span>)}</div> : null}
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function ProjectEditor(props: ScreenProps & { row?: AppV2Record; onClose: () => void }) {
  const formId = useId()
  const row = props.row
  const [title, setTitle] = useState(row ? textOf(row.values[props.kit.project.title]) : '')
  const [clientId, setClientId] = useState(row ? firstId(row.values[props.kit.project.client]) : props.of(props.kit.clientsTableId)[0]?.id ?? '')
  const [ownerId, setOwnerId] = useState(row ? firstId(row.values[props.kit.project.owner]) : people(props).find(person => person.active)?.id ?? '')
  const [start, setStart] = useState(row ? civilInput(row.values[props.kit.project.start]) : '')
  const [due, setDue] = useState(row ? civilInput(row.values[props.kit.project.due]) : '')
  const [budget, setBudget] = useState(row && typeof row.values[props.kit.project.budget] === 'number' ? String(row.values[props.kit.project.budget]) : '')
  const [status, setStatus] = useState(row ? String(row.values[props.kit.project.status] ?? '') : props.kit.projectStatuses.draft)
  const [error, setError] = useState('')
  const save = () => {
    if (!title.trim()) { setError('Напишите название проекта.'); return }
    const amount = budget.trim() ? Number(budget.replace(/\s/g, '').replace(',', '.')) : null
    if (amount != null && !Number.isFinite(amount)) { setError('Бюджет должен быть числом.'); return }
    void saveProject(props, row, { title: title.trim(), clientId, ownerId, start: start || null, due: due || null, budget: amount, statusId: status }, setError, props.onClose)
  }
  return <AppDialog title={row ? 'Проект' : 'Новый проект'} placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={buttons.primary}>{row ? 'Сохранить' : 'Создать проект'}</button>}>
    <form id={formId} className={css.form} onSubmit={event => { event.preventDefault(); save() }}>
      <label>Название<input type="text" value={title} onChange={event => setTitle(event.target.value)} /></label>
      <ChoiceRow label="Клиент" value={clientId} options={props.of(props.kit.clientsTableId).map(item => ({ id: item.id, name: textOf(item.values[props.kit.client.name]) }))} onChange={setClientId} />
      <ChoiceRow label="Ответственный" value={ownerId} options={people(props).filter(person => person.active || person.id === ownerId).map(person => ({ id: person.id, name: person.name }))} onChange={setOwnerId} />
      <div className={css.field}><span>Начало</span><DateMenu label="Дата начала" value={start} onValue={setStart} /></div>
      <div className={css.field}><span>Срок</span><DateMenu label="Срок проекта" value={due} onValue={setDue} /></div>
      <label>Бюджет, ₽<input inputMode="decimal" value={budget} onChange={event => setBudget(event.target.value)} /></label>
      <ChoiceRow label="Статус" value={status} options={['Черновик', 'В работе', 'На паузе', 'Сдан', 'Отменён'].map(name => ({ id: choiceId(props.tables, props.kit.projectsTableId, props.kit.project.status, name), name }))} onChange={setStatus} />
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function CommentDialog(props: ScreenProps & { row: AppV2Record; onClose: () => void }) {
  const demo = useContext(ProjectsRowsContext)
  const formId = useId()
  const initial = demo?.open === 'mention' ? '@' : ''
  const [text, setText] = useState(initial)
  const [caret, setCaret] = useState(initial.length)
  const [error, setError] = useState('')
  const query = mentionQuery(text, caret)
  const list = people(props).filter(person => person.active)
  const matches = query ? list.filter(person => person.name.toLocaleLowerCase('ru-RU').includes(query.query.trim().toLocaleLowerCase('ru-RU'))) : []
  const remember = (target: HTMLTextAreaElement) => setCaret(target.selectionStart ?? target.value.length)
  const pick = (name: string) => {
    if (!query) return
    const next = insertMention(text, query.start, caret, name)
    setText(next)
    setCaret(query.start + name.length + 2)
  }
  return <AppDialog title="Комментарий" placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={buttons.primary}>Добавить</button>}>
    <form id={formId} className={css.form} onSubmit={event => { event.preventDefault(); void saveComment(props, props.row, text, setError, props.onClose) }}>
      <label>Текст<textarea value={text} onChange={event => { setText(event.target.value); remember(event.target) }} onSelect={event => remember(event.currentTarget)} onKeyUp={event => remember(event.currentTarget)} /></label>
      {query ? <ul className={css.mentionList} role="listbox" aria-label="Кого упомянуть">{matches.map(person => <li key={person.id}><button type="button" onClick={() => pick(person.name)}><BookingAvatar name={person.name} photo={person.photo} small /><span>{person.name}</span></button></li>)}{matches.length ? null : <li className={css.empty}>Такого сотрудника нет</li>}</ul> : null}
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}

function civilInput(value: unknown) {
  const day = formatDay(value)
  return day ? day.split('.').reverse().join('-') : ''
}
function fileSize(size: number) {
  if (!size) return ''
  if (size < 1024) return `${size} Б`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`
  return `${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`
}
type FileItem = { id: string; name: string; size: number }
function fileItems(value: unknown): FileItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || !('name' in item)) return []
    const name = String(item.name ?? '')
    if (!name) return []
    return [{ id: 'id' in item && typeof item.id === 'string' ? item.id : name, name, size: 'size' in item && typeof item.size === 'number' ? item.size : 0 }]
  })
}

async function remote(props: ScreenProps, body: Record<string, unknown>, setError: (value: string) => void, onDone?: () => void) {
  if (props.replace) return false
  const published = publishedHolder.current
  if (!published || published.revision === 'demo') { setError('Сохранение доступно в опубликованном приложении.'); return true }
  const result = await savePublishedProjectsAction(published.slug, { revision: published.revision, screenId: props.screenId, ...body })
  if (!result.ok) { setError(result.error); return true }
  published.refresh(result.message)
  onDone?.()
  return true
}

async function saveMove(props: ScreenProps, recordId: string, statusId: string, orderedIds: string[]) {
  if (props.replace) {
    const statusName = choiceName(props.tables, props.kit.tasksTableId, props.kit.task.status, statusId)
    const tasks = props.of(props.kit.tasksTableId).map(row => ({ id: row.id, statusName: taskFacts(props, row).status, sort: taskFacts(props, row).sort }))
    const beforeId = orderedIds[orderedIds.indexOf(recordId) + 1] ?? null
    const updates = moveUpdates({ tasks, movedId: recordId, nextStatusName: statusName, nextStatusId: statusId, beforeId, statusField: props.kit.task.status, sortField: props.kit.task.sort, rewriteColumn: props.leader })
    const row = props.rows.find(item => item.id === recordId)
    const previous = row ? taskFacts(props, row).status : ''
    let next = props.rows.map(item => {
      const update = updates.find(candidate => candidate.id === item.id)
      return update ? { ...item, values: { ...item.values, ...update.values } } : item
    })
    if (previous && previous !== statusName && row) next = next.concat(localEvent(props, row, 'status', eventText('status', textOf(row.values[props.kit.task.title]), previous, statusName)))
    if (row && previous !== statusName) {
      const projectId = taskFacts(props, row).projectId
      const progress = progressPercent(next.filter(item => item.tableId === props.kit.tasksTableId && firstId(item.values[props.kit.task.project]) === projectId && !firstId(item.values[props.kit.task.parent])).map(item => choiceName(props.tables, props.kit.tasksTableId, props.kit.task.status, item.values[props.kit.task.status])))
      next = next.map(item => item.id === projectId ? { ...item, values: { ...item.values, [props.kit.project.progress]: progress } } : item)
    }
    props.replace(next)
    return
  }
  const published = publishedHolder.current
  if (!published || published.revision === 'demo') return
  const result = await savePublishedProjectsAction(published.slug, { kind: 'move', revision: published.revision, screenId: props.screenId, recordId, statusId, orderedIds })
  if (result.ok) published.refresh(result.message)
}

function localEvent(props: ScreenProps, task: AppV2Record, kind: 'created' | 'status' | 'comment', text: string): AppV2Record {
  const facts = taskFacts(props, task)
  const kindId = kind === 'created' ? props.kit.eventKinds.created : kind === 'status' ? props.kit.eventKinds.status : props.kit.eventKinds.comment
  return { id: `event_${crypto.randomUUID().replaceAll('-', '')}`, tableId: props.kit.eventsTableId, values: eventWrite(props.kit.event, { text, projectId: facts.projectId, taskId: task.id, at: new Date().toISOString(), kind, kindId, author: props.actor.name?.trim() || 'Сотрудник', authorEmail: props.actor.email ?? '', assigneeEmail: facts.assigneeEmail }) }
}

async function saveTaskPatch(props: ScreenProps, row: AppV2Record, input: { title?: string; projectId?: string; parentId?: string; assigneeId?: string; assigneeEmail?: string; due?: string | null; priorityId?: string; statusId?: string; description?: string; checklist?: string; files?: File[] }, setError: (value: string) => void, onDone?: () => void) {
  const facts = taskFacts(props, row)
  const storedFiles = row.values[props.kit.task.files]
  const kept: AppV2Json[] = Array.isArray(storedFiles) ? storedFiles : []
  const added: AppV2Json[] = (input.files ?? []).map(file => ({ id: `file_${crypto.randomUUID().replaceAll('-', '')}`, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', key: `demo/${file.name}`, width: null, height: null }))
  const values = taskWrite(props.kit.task, { ...input, files: input.files ? [...kept, ...added] : undefined })
  if (props.replace) {
    const nextStatus = input.statusId ? choiceName(props.tables, props.kit.tasksTableId, props.kit.task.status, input.statusId) : facts.status
    const events = nextStatus !== facts.status ? [localEvent(props, { ...row, values: { ...row.values, ...values } }, 'status', eventText('status', input.title || textOf(row.values[props.kit.task.title]), facts.status, nextStatus))] : []
    props.replace(props.rows.map(item => item.id === row.id ? { ...item, values: { ...item.values, ...values } } : item).concat(events))
    onDone?.()
    return
  }
  const published = publishedHolder.current
  if (!published || published.revision === 'demo') { setError('Сохранение доступно в опубликованном приложении.'); return }
  let files = kept
  if (input.files?.length && props.kit.editTaskFormId) {
    const inspected = await published.inspectForm({ mode: 'initial', formId: props.kit.editTaskFormId, screenId: props.screenId, recordId: row.id })
    const state = inspected.ok && 'state' in inspected ? inspected.state as { revision?: unknown; fingerprint?: unknown } : null
    if (!state || typeof state.revision !== 'string') { setError(!inspected.ok && 'error' in inspected ? String(inspected.error) : 'Не удалось прикрепить файл.'); return }
    const uploaded: AppV2Json[] = []
    for (const file of input.files) {
      const body = new FormData()
      body.set('file', file)
      body.set('context', JSON.stringify({ kind: 'published', slug: published.slug, formId: props.kit.editTaskFormId, screenId: props.screenId, recordId: row.id, fieldId: props.kit.task.files, revision: state.revision, fingerprint: state.fingerprint }))
      const response = await fetch('/api/builder-v2/files', { method: 'POST', body })
      const payload = await response.json() as { ok?: boolean; error?: string; attachment?: AppV2Json }
      if (!response.ok || !payload.ok || !payload.attachment) { setError(payload.error || 'Не удалось загрузить файл.'); return }
      uploaded.push(payload.attachment)
    }
    files = [...kept, ...uploaded]
  }
  const nextParentId = input.parentId !== undefined ? input.parentId : (facts.parentId || undefined)
  const result = await savePublishedProjectsAction(published.slug, { kind: 'task', revision: published.revision, screenId: props.screenId, recordId: row.id, title: input.title ?? textOf(row.values[props.kit.task.title]), projectId: input.projectId ?? facts.projectId, parentId: nextParentId, assigneeId: input.assigneeId ?? facts.assigneeId, assigneeEmail: input.assigneeEmail ?? facts.assigneeEmail, due: input.due === undefined ? civilInput(facts.due) || null : input.due, priorityId: input.priorityId ?? String(row.values[props.kit.task.priority] ?? ''), statusId: input.statusId ?? String(row.values[props.kit.task.status] ?? ''), description: input.description ?? textOf(row.values[props.kit.task.description]), checklist: input.checklist ?? textOf(row.values[props.kit.task.checklist]), ...(input.files ? { files } : {}) })
  if (!result.ok) { setError(result.error); return }
  published.refresh(result.message)
  onDone?.()
}

async function saveCreateTask(props: ScreenProps, input: { title: string; projectId: string; assigneeId: string; assigneeEmail: string; due: string | null; priorityId: string; description: string }, setError: (value: string) => void, onDone: () => void) {
  if (props.replace) {
    const id = `task_${crypto.randomUUID().replaceAll('-', '')}`
    const values = taskWrite(props.kit.task, { ...input, statusId: props.kit.statuses.todo, checklist: '[]', sort: 1000 })
    const created: AppV2Record = { id, tableId: props.kit.tasksTableId, values }
    props.replace([...props.rows, created, localEvent(props, created, 'created', eventText('created', input.title))])
    onDone()
    return
  }
  await remote(props, { kind: 'create-task', ...input }, setError, onDone)
}

async function saveProject(props: ScreenProps, row: AppV2Record | undefined, input: { title: string; clientId: string; ownerId: string; start: string | null; due: string | null; budget: number | null; statusId: string }, setError: (value: string) => void, onDone: () => void) {
  const values = projectWrite(props.kit.project, input)
  if (props.replace) {
    if (!row) props.replace([...props.rows, { id: `project_${crypto.randomUUID().replaceAll('-', '')}`, tableId: props.kit.projectsTableId, values: { ...values, [props.kit.project.progress]: 0 } }])
    else props.replace(props.rows.map(item => item.id === row.id ? { ...item, values: { ...item.values, ...values } } : item))
    onDone()
    return
  }
  await remote(props, row ? { kind: 'project', recordId: row.id, ...input } : { kind: 'create-project', ...input }, setError, onDone)
}

async function saveComment(props: ScreenProps, row: AppV2Record, text: string, setError: (value: string) => void, onDone: () => void) {
  const clean = text.trim()
  if (!clean) { setError('Напишите комментарий.'); return }
  const facts = taskFacts(props, row)
  const mentionIds = mentionedNames(clean, people(props).map(person => person.name)).flatMap(name => {
    const person = people(props).find(item => item.name === name)
    return person ? [person.id] : []
  })
  if (props.replace) {
    const values = commentWrite(props.kit.comment, { text: clean, taskId: row.id, projectId: facts.projectId, at: new Date().toISOString(), author: props.actor.name?.trim() || 'Сотрудник', authorEmail: props.actor.email ?? '', assigneeEmail: facts.assigneeEmail, mentionIds })
    props.replace([...props.rows, { id: `comment_${crypto.randomUUID().replaceAll('-', '')}`, tableId: props.kit.commentsTableId, values }, localEvent(props, row, 'comment', eventText('comment', textOf(row.values[props.kit.task.title])))])
    onDone()
    return
  }
  await remote(props, { kind: 'comment', recordId: row.id, text: clean, mentionIds }, setError, onDone)
}

async function saveSubtask(props: ScreenProps, parent: AppV2Record, title: string, setError: (value: string) => void) {
  const facts = taskFacts(props, parent)
  if (facts.parentId) { setError('Подзадача не делится дальше.'); return }
  const assignee = props.leader ? personById(props, facts.assigneeId) : personByEmail(props, props.actor.email ?? '')
  if (!assignee) { setError('Не удалось назначить исполнителя.'); return }
  const priorityId = choiceId(props.tables, props.kit.tasksTableId, props.kit.task.priority, 'Средний')
  const input = { title, projectId: facts.projectId, assigneeId: assignee.id, assigneeEmail: assignee.email, due: null as string | null, priorityId }
  if (props.replace) {
    const id = `task_${crypto.randomUUID().replaceAll('-', '')}`
    const values = taskWrite(props.kit.task, { ...input, parentId: parent.id, statusId: props.kit.statuses.todo, checklist: '[]', description: '', sort: 1000 })
    const created: AppV2Record = { id, tableId: props.kit.tasksTableId, values }
    props.replace([...props.rows, created, localEvent(props, created, 'created', eventText('created', title))])
    return
  }
  await remote(props, { kind: 'create-subtask', recordId: parent.id, ...input }, setError)
}
