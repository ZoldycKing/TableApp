'use client'
import { createContext, useContext, useEffect, useId, useState } from 'react'
import { instantToWallClock, wallClockToInstant } from '@tableapp/schema'
import type { AppV2, AppV2Node, AppV2Record } from '@tableapp/schema/app-v2'
import { savePublishedSupportAction } from '@/app/support-actions'
import { deadlineTime, filterTickets, isOpenStatus, isOverdue, operatorTransitions, supportAuthorKind, supportAuthorLabel, supportSummary, type SupportFilter, type SupportListItem } from '@/lib/support-logic'
import { applySupportChange, isSupportDesk, supportStatusName, type SupportChange } from '@/lib/support-persist'
import { AppDialog } from './app-dialog'
import { DetailCardShell, DetailSection, ListScreenShell, ShellSearchField } from './layout-shell'
import shell from './layout-shell.module.css'
import { ProtoIcon } from '../prototype/icons'
import { usePublishedV2 } from './published-context'
import { useBuilderV2NodeData } from './use-data'
import type { AppV2RendererProps } from './view'
import css from './support.module.css'

export type SupportOpen = 'create' | 'reply' | 'note' | 'assign' | 'category' | null
export type SupportBundle = { rows: AppV2Record[]; setRows?: (rows: AppV2Record[]) => void; open?: SupportOpen; now?: number; sample?: boolean }
export const SupportRowsContext = createContext<SupportBundle | null>(null)

const PLACEHOLDER: AppV2Node = { id: 'support_placeholder', name: 'placeholder', type: 'heading', value: { kind: 'literal', value: '' }, size: 's', visibleTo: null, visibleWhen: null }
const publishedHolder: { current: ReturnType<typeof usePublishedV2> } = { current: null }
const textOf = (value: unknown) => Array.isArray(value) ? '' : value == null ? '' : String(value)
const firstId = (value: unknown) => Array.isArray(value) ? value.find((item): item is string => typeof item === 'string') ?? '' : ''
const EMPTY_FILTER: SupportFilter = { search: '', status: '', mine: false, scope: 'all' }

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

function toneOf(name: string) {
  if (name === 'Срочный' || name === 'Просрочено') return 'red'
  if (name === 'Высокий' || name === 'В работе') return 'amber'
  if (name === 'Ждём клиента') return 'violet'
  if (name === 'Решено' || name === 'Активен') return 'green'
  if (name === 'Закрыто' || name === 'Низкий' || name === 'Неактивен') return 'gray'
  return 'blue'
}

function Badge({ name }: { name: string }) {
  if (!name) return null
  return <span className={css.badge} data-tone={toneOf(name)}>{name}</span>
}

function formatWhen(value: unknown, empty = 'Срок не задан') {
  if (typeof value !== 'string' || !value) return empty
  const wall = instantToWallClock(value, 'Europe/Moscow')
  if (!wall) return empty
  const [year, month, day] = wall.date.split('-')
  return `${day}.${month}.${year}, ${wall.time}`
}

function joinDeadline(date: string, time: string) {
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = (time || '18:00').split(':').map(Number)
  if (!year || !month || !day) return null
  return wallClockToInstant({ year, month, day, hour: hour || 0, minute: minute || 0, second: 0 }, 'Europe/Moscow').toISOString()
}

function splitDeadline(value: unknown) {
  if (typeof value !== 'string') return { date: '', time: '' }
  const wall = instantToWallClock(value, 'Europe/Moscow')
  return wall ? { date: wall.date, time: wall.time } : { date: '', time: '' }
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

export function SupportScreen(props: AppV2RendererProps) {
  const kit = props.app.support
  const demo = useContext(SupportRowsContext)
  publishedHolder.current = usePublishedV2()
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
  const ticketsPage = useBuilderV2NodeData(props.app, ticketsNode ?? PLACEHOLDER, live && Boolean(ticketsNode), '', scope)
  const repliesPage = useBuilderV2NodeData(props.app, repliesNode ?? PLACEHOLDER, live && Boolean(repliesNode), '', scope)
  const notesPage = useBuilderV2NodeData(props.app, notesNode ?? PLACEHOLDER, live && Boolean(notesNode), '', scope)
  const clientsPage = useBuilderV2NodeData(props.app, clientsNode ?? PLACEHOLDER, live && Boolean(clientsNode), '', scope)
  const operatorsPage = useBuilderV2NodeData(props.app, operatorsNode ?? PLACEHOLDER, live && Boolean(operatorsNode), '', scope)
  const categoriesPage = useBuilderV2NodeData(props.app, categoriesNode ?? PLACEHOLDER, live && Boolean(categoriesNode), '', scope)
  const screens = kit ? [kit.queueScreenId, kit.ticketScreenId, kit.clientListScreenId, kit.clientTicketScreenId, kit.clientsScreenId, kit.settingsScreenId] : []
  if (!kit || !screens.includes(screenId)) return null
  const pages = [ticketsPage, repliesPage, notesPage, clientsPage, operatorsPage, categoriesPage]
  const rows = demo?.rows ?? pages.flatMap(page => page.page?.rows ?? [])
  const of = (tableId: string) => rows.filter(row => row.tableId === tableId)
  const loading = !demo && pages.some(page => page.loading && !page.page)
  const error = pages.find(page => page.error)?.error ?? ''
  const reload = () => { for (const page of pages) page.reload() }
  const shared = { ...props, kit, rows, of, replace: demo?.setRows, now: demo?.now ?? Date.now(), loading, error, reload, recordId }
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
    }
  })
}

function TicketList(props: ScreenProps) {
  const desk = isSupportDesk(props.actor)
  const [filter, setFilter] = useState<SupportFilter>(EMPTY_FILTER)
  const [open, setOpen] = useState<SupportOpen>(useContext(SupportRowsContext)?.open ?? null)
  const items = ticketItems(props)
  const summary = supportSummary(items, props.now)
  const sample = useContext(SupportRowsContext)?.sample
  const visible = filterTickets(items, filter, props.actor.email ?? '', props.now)
    .sort((a, b) => {
      const open = Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status))
      if (open) return open
      return (deadlineTime(a.deadline) ?? Number.MAX_SAFE_INTEGER) - (deadlineTime(b.deadline) ?? Number.MAX_SAFE_INTEGER)
    })
  const backTo = desk ? props.kit.queueScreenId : props.kit.clientListScreenId
  return <div className={css.root} data-support-root data-support-screen={desk ? 'queue' : 'client'}>
    <ListScreenShell
      title={desk ? 'Очередь обращений' : 'Мои обращения'}
      meta={desk ? 'Очередь службы поддержки.' : 'Ваши обращения и ответы.'}
      actions={<button type="button" className={css.primary} onClick={() => setOpen('create')}>{desk ? 'Новое обращение' : 'Написать обращение'}</button>}
    >
      <div className={css.stack}>
        {sample ? <p className={css.sample} role="note">Демоданные: вымышленные обращения, не настоящая переписка.</p> : null}
        <fieldset className={css.summary} aria-label="Сводка обращений">
          <legend className={css.quiet}>Сводка</legend>
          <button type="button" aria-pressed={filter.scope === 'open'} onClick={() => setFilter(current => ({ ...current, scope: current.scope === 'open' ? 'all' : 'open' }))}><strong>{summary.open}</strong><span>Открытые</span></button>
          <button type="button" data-tone="rose" aria-pressed={filter.scope === 'overdue'} onClick={() => setFilter(current => ({ ...current, scope: current.scope === 'overdue' ? 'all' : 'overdue' }))}><strong>{summary.overdue}</strong><span>Просроченные</span></button>
          <button type="button" aria-pressed={filter.scope === 'waiting'} onClick={() => setFilter(current => ({ ...current, scope: current.scope === 'waiting' ? 'all' : 'waiting' }))}><strong>{summary.waiting}</strong><span>Ждём клиента</span></button>
        </fieldset>
        <div className={css.filters}>
          <ShellSearchField value={filter.search} onChange={search => setFilter(current => ({ ...current, search }))} label="Поиск обращений" placeholder="Тема, клиент или номер" />
          {desk ? <button type="button" className={css.mine} aria-pressed={filter.mine} onClick={() => setFilter(current => ({ ...current, mine: !current.mine }))}>Мои</button> : null}
        </div>
        <div className={css.chips} role="toolbar" aria-label="Статус">
          <button type="button" className={css.chip} aria-pressed={filter.status === ''} onClick={() => setFilter(current => ({ ...current, status: '' }))}>Все статусы</button>
          {['Новое', 'В работе', 'Ждём клиента', 'Решено', 'Закрыто'].map(status => <button key={status} type="button" className={css.chip} aria-pressed={filter.status === status} onClick={() => setFilter(current => ({ ...current, status: current.status === status ? '' : status }))}>{status}</button>)}
        </div>
        {props.loading ? <p className={css.status} role="status">Загружаем обращения…</p> : null}
        {props.error ? <div className={css.status} role="alert"><p className={css.error}>{props.error}</p><button type="button" onClick={props.reload}>Повторить</button></div> : null}
        {!props.loading && !props.error && !visible.length ? <div className={css.empty}><ProtoIcon name="clipboard" size={28} /><p>{items.length ? 'Нет обращений с такими условиями.' : desk ? 'Очередь пуста. Новое обращение появится здесь.' : 'У вас пока нет обращений.'}</p>{items.length ? <button type="button" onClick={() => setFilter(EMPTY_FILTER)}>Сбросить фильтры</button> : <button type="button" onClick={() => setOpen('create')}>{desk ? 'Создать обращение' : 'Написать обращение'}</button>}</div> : null}
        <ul className={css.cards}>
          {visible.map(item => <li key={item.id}><TicketButton item={item} now={props.now} onOpen={() => props.onNavigate?.(desk ? props.kit.ticketScreenId : props.kit.clientTicketScreenId, item.id)} /></li>)}
        </ul>
        <div className={css.tableWrap}>
          <table className={css.table}>
            <caption className={css.quiet}>Список обращений</caption>
            <thead><tr><th>Обращение</th><th>Клиент</th><th>Статус</th><th>Приоритет</th><th>Срок</th>{desk ? <th>Ответственный</th> : null}</tr></thead>
            <tbody>
              {visible.map(item => {
                const overdue = isOverdue(item.status, item.deadline, props.now)
                return <tr key={item.id} data-overdue={overdue || undefined}>
                  <td><button type="button" className={css.rowButton} onClick={() => props.onNavigate?.(desk ? props.kit.ticketScreenId : props.kit.clientTicketScreenId, item.id)}>{item.number ? `${item.number}. ` : ''}{item.subject || 'Без темы'}</button></td>
                  <td>{item.clientName || 'Клиент не указан'}</td>
                  <td><Badge name={item.status} />{overdue ? <> <Badge name="Просрочено" /></> : null}</td>
                  <td><Badge name={item.priority} /></td>
                  <td>{formatWhen(item.deadline)}</td>
                  {desk ? <td>{item.assigneeName || 'Не назначен'}</td> : null}
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ListScreenShell>
    {open === 'create' ? <CreateDialog {...props} desk={desk} onClose={() => setOpen(null)} onDone={id => { setOpen(null); if (id) props.onNavigate?.(backTo, undefined) }} /> : null}
  </div>
}

function TicketButton({ item, now, onOpen }: { item: SupportListItem; now: number; onOpen: () => void }) {
  const overdue = isOverdue(item.status, item.deadline, now)
  return <button type="button" className={css.card} data-overdue={overdue || undefined} onClick={onOpen}>
    <strong className={css.cardTitle}>{item.number ? `${item.number}. ` : ''}{item.subject || 'Без темы'}</strong>
    <span className={css.quiet}>{item.clientName || 'Клиент не указан'}{item.category ? ` · ${item.category}` : ''}</span>
    <span className={css.badges}><Badge name={item.status} />{overdue ? <Badge name="Просрочено" /> : null}<Badge name={item.priority} /></span>
    <span className={css.meta}>{item.assigneeName ? item.assigneeName : 'Не назначен'} · {formatWhen(item.deadline)}</span>
  </button>
}

function TicketCard(props: ScreenProps) {
  const desk = isSupportDesk(props.actor)
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
    return { id: row.id, at: textOf(row.values[props.kit.reply.at]), author, text: textOf(row.values[props.kit.reply.text]), internal: false, label: supportAuthorLabel(kind) }
  }), ...notes.map(row => ({ id: row.id, at: textOf(row.values[props.kit.note.at]), author: textOf(row.values[props.kit.note.author]), text: textOf(row.values[props.kit.note.text]), internal: true, label: 'Внутренняя заметка' }))]
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  const transitions = desk ? operatorTransitions(status) : []
  const replyLabel = status === 'Решено' || status === 'Закрыто' ? 'Переоткрыть' : 'Ответить'
  const sample = bundle?.sample
  return <div className={css.root} data-support-root data-support-screen={desk ? 'ticket' : 'client-ticket'} data-support-status={status}>
    <DetailCardShell
      back={{ label: desk ? 'Очередь' : 'Мои обращения', onClick: () => props.onNavigate?.(back) }}
      title={textOf(ticket.values[fields.subject]) || 'Без темы'}
      subtitle={textOf(ticket.values[fields.number])}
      badge={<span className={css.badges}><Badge name={status} />{overdue ? <Badge name="Просрочено" /> : null}<Badge name={priority} /></span>}
      actions={<div className={css.actions}>
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
      {sample ? <p className={css.sample} role="note">Демоданные: вымышленные обращения, не настоящая переписка.</p> : null}
      <div className={css.ticketCols}>
        <div className={shell.detailMainCol}>
          <DetailSection title="Описание"><p className={css.description}>{textOf(ticket.values[fields.description]) || 'Описания нет.'}</p></DetailSection>
          <DetailSection title="Переписка">
            {props.error ? <p className={css.error} role="alert">{props.error}</p> : null}
            {message ? <p role="status">{message}</p> : null}
            {!timeline.length ? <div className={css.empty}><p>Сообщений пока нет. Ответ появится в этой ленте.</p></div> : null}
            <ol className={css.timeline} aria-label="Хронология">
              {timeline.map(entry => <li key={entry.id} className={css.message} data-internal={entry.internal || undefined} data-support-note={entry.internal || undefined} data-author-kind={entry.internal ? 'note' : entry.label === 'Клиент' ? 'client' : 'operator'}>
                <header><strong>{entry.author || 'Без имени'}</strong><span className={css.quiet}>{formatWhen(entry.at, 'Время не указано')}</span>{entry.internal ? <span className={css.noteFlag}>Внутренняя заметка. Клиент это не видит.</span> : <span className={css.quiet}>{entry.label}</span>}</header>
                <p>{entry.text}</p>
              </li>)}
            </ol>
          </DetailSection>
        </div>
        <aside className={`${shell.detailSideCol} ${css.factsCol}`}>
          <DetailSection title="Сведения">
            <dl className={css.facts}>
              <div><dt>Клиент</dt><dd>{clientName || 'Не указан'}</dd></div>
              <div><dt>Ответственный</dt><dd>{assignee || 'Не назначен'}</dd></div>
              <div><dt>Приоритет</dt><dd>{priority || 'Не указан'}</dd></div>
              <div><dt>Категория</dt><dd>{category || 'Без категории'}</dd></div>
              <div><dt>Срок</dt><dd>{formatWhen(ticket.values[fields.deadline])}{overdue ? '. Просрочено' : ''}</dd></div>
            </dl>
          </DetailSection>
        </aside>
      </div>
    </DetailCardShell>
    {dialog === 'reply' ? <ReplyDialog {...props} ticketId={ticket.id} reopen={status === 'Решено' || status === 'Закрыто'} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
    {dialog === 'note' ? <NoteDialog {...props} ticketId={ticket.id} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
    {dialog === 'assign' ? <AssignDialog {...props} ticket={ticket} onClose={() => setDialog(null)} onMessage={setMessage} /> : null}
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
  return <AppDialog title="Новое обращение" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Отправить обращение'}</button>}>
    <form id={formId} data-support-form="create" onSubmit={event => { event.preventDefault(); void save() }}>
      {props.desk ? <label className={css.field}><span>Клиент</span><select value={clientId} onChange={event => setClientId(event.target.value)} required><option value="">Выберите клиента</option>{clients.map(row => <option key={row.id} value={row.id}>{textOf(row.values[props.kit.client.name])}</option>)}</select></label> : null}
      <label className={css.field}><span>Тема</span><input value={subject} onChange={event => setSubject(event.target.value)} maxLength={200} required /></label>
      <label className={css.field}><span>Описание</span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={4000} required /></label>
      <label className={css.field}><span>Категория</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)} required><option value="">Выберите категорию</option>{categories.map(row => <option key={row.id} value={row.id}>{textOf(row.values[props.kit.category.name])}</option>)}</select></label>
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
  return <AppDialog title={props.reopen ? 'Переоткрыть обращением' : 'Ответ'} onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : props.reopen ? 'Переоткрыть' : 'Ответить'}</button>}>
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
  return <AppDialog title="Внутренняя заметка" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить заметку'}</button>}>
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
  const initialDeadline = splitDeadline(props.ticket.values[fields.deadline])
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
    const result = await commit(props, { kind: 'assign', recordId: props.ticket.id, assigneeId: assigneeId || null, priorityId, categoryId, deadline: joinDeadline(date, time) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    props.onMessage(result.message)
    props.onClose()
  }
  return <AppDialog title="Ответственный и срок" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}>
    <form id={formId} data-support-form="assign" onSubmit={event => { event.preventDefault(); void save() }}>
      <label className={css.field}><span>Ответственный</span><select value={assigneeId} onChange={event => setAssigneeId(event.target.value)}><option value="">Не назначен</option>{operators.map(row => <option key={row.id} value={row.id}>{textOf(row.values[props.kit.operator.name])}</option>)}</select></label>
      <fieldset className={css.field}><legend>Приоритет</legend><div className={css.choiceRow} role="radiogroup" aria-label="Приоритет">{priorities.map(choice => <button key={choice.id} type="button" aria-pressed={choice.id === priorityId} onClick={() => setPriorityId(choice.id)}>{choice.name}</button>)}</div></fieldset>
      <label className={css.field}><span>Категория</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)}>{categories.map(row => <option key={row.id} value={row.id}>{textOf(row.values[props.kit.category.name])}</option>)}</select></label>
      <div className={css.when}>
        <label className={css.field}><span>Дата срока</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <label className={css.field}><span>Время</span><input type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
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
    <ListScreenShell title="Настройки службы" meta="Категории выбирают в новых обращениях. Приглашение оператора — в доступе приложения, письмо отсюда не отправляется." actions={<button type="button" className={css.mine} onClick={() => setOpen(true)}>Добавить категорию</button>}>
      <div className={css.stack}>
        {message ? <p role="status">{message}</p> : null}
        {props.loading ? <p role="status">Загружаем настройки…</p> : null}
        {!categories.length && !props.loading ? <div className={css.empty}><p>Категорий пока нет.</p></div> : null}
        <ul className={css.directory}>{categories.map(row => <li key={row.id}><strong>{textOf(row.values[props.kit.category.name])}</strong><span className={css.quiet}>{textOf(row.values[props.kit.category.description]) || 'Без пояснения'}</span><button type="button" className={css.chip} aria-pressed={row.values[props.kit.category.active] === true} onClick={() => void toggle(row)}>{row.values[props.kit.category.active] === true ? 'Доступна' : 'Скрыта'}</button></li>)}</ul>
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
  return <AppDialog title="Новая категория" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Добавить категорию'}</button>}>
    <form id={formId} onSubmit={event => { event.preventDefault(); void save() }}>
      <label className={css.field}><span>Название</span><input value={name} onChange={event => setName(event.target.value)} maxLength={80} required /></label>
      <label className={css.field}><span>Пояснение</span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} /></label>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}
