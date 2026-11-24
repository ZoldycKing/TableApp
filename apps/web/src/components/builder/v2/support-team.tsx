'use client'
import { useContext, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { instantToWallClock, wallClockToInstant } from '@tableapp/schema'
import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import { AppFrameDeviceContext } from './app-frame'
import { AppDialog } from './app-dialog'
import { SupportPerson } from './support-desk'
import { ListScreenShell, ShellSearchField } from './layout-shell'
import { ProtoIcon } from '../prototype/icons'
import css from './support.module.css'

const OVERLOAD = 5
const textOf = (value: unknown) => Array.isArray(value) ? '' : value == null ? '' : String(value)

type TeamKit = NonNullable<AppV2['support']>
type TeamTables = readonly { id: string; fields: readonly { id: string; choices?: readonly { id: string; name: string }[] }[] }[]

export type TeamScreenProps = {
  app: AppV2
  kit: TeamKit
  tables: TeamTables
  rows: AppV2Record[]
  of: (tableId: string) => AppV2Record[]
  now: number
  loading: boolean
  actor: { roleIds: readonly string[]; email?: string | null }
  onNavigate?: (screenId: string, recordId?: string) => void
  onOpenQueue: (focus: { view: 'open'; scope: 'open'; assigneeEmail?: string } | { view: 'mine'; scope: 'mine' }) => void
  onSaveOperator: (change: {
    recordId?: string
    name: string
    email: string
    phone: string
    roleId: string
    lineId: string | null
    activeId: string
  }) => Promise<{ ok: boolean; error?: string; message?: string }>
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

/** Custom single-select dropdown — no native <select>. */
export function SupportSelect(props: {
  label: string
  value: string
  options: { id: string; name: string }[]
  onChange: (id: string) => void
  emptyLabel?: string
  field?: boolean
}) {
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

function OperatorRowMenu(props: {
  owner: boolean
  onEdit?: () => void
  onOpenTickets: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useMenuOpen(open, root, () => setOpen(false))
  return <div className={css.cardMenu} ref={root} data-team-menu onClick={event => event.stopPropagation()}>
    <button type="button" className={css.cardMenuButton} aria-label="Действия" aria-expanded={open} aria-haspopup="menu" onClick={event => { event.stopPropagation(); setOpen(value => !value) }}>⋯</button>
    {open ? <div className={css.cardMenuPanel} role="menu" aria-label="Действия" onClick={event => event.stopPropagation()}>
      <button type="button" role="menuitem" onClick={() => { props.onOpenTickets(); setOpen(false) }}>Открыть тикеты</button>
      {props.owner && props.onEdit ? <button type="button" role="menuitem" onClick={() => { props.onEdit?.(); setOpen(false) }}>Изменить</button> : null}
    </div> : null}
  </div>
}

function choiceName(tables: TeamTables, tableId: string, fieldId: string | undefined, value: unknown) {
  if (!fieldId || typeof value !== 'string' || !value) return ''
  const field = tables.find(table => table.id === tableId)?.fields.find(item => item.id === fieldId)
  return field?.choices?.find(choice => choice.id === value)?.name ?? ''
}

function choicesOf(tables: TeamTables, tableId: string, fieldId: string | undefined) {
  if (!fieldId) return [] as { id: string; name: string }[]
  return tables.find(table => table.id === tableId)?.fields.find(item => item.id === fieldId)?.choices?.map(choice => ({ id: choice.id, name: choice.name })) ?? []
}

function dayStart(now: number) {
  const wall = instantToWallClock(new Date(now), 'Europe/Moscow')
  if (!wall) return now - (now % 86_400_000)
  const [year, month, day] = wall.date.split('-').map(Number) as [number, number, number]
  return wallClockToInstant({ year, month, day, hour: 0, minute: 0, second: 0 }, 'Europe/Moscow').getTime()
}

type OperatorRow = {
  id: string
  name: string
  email: string
  phone: string
  photo?: string
  line: string
  lineId: string
  role: string
  roleId: string
  shift: boolean
  activeId: string
  open: number
  resolvedToday: number
}

function operatorRows(props: TeamScreenProps): OperatorRow[] {
  const openStatuses = new Set([props.kit.statuses.fresh, props.kit.statuses.progress, props.kit.statuses.waiting])
  const resolvedStatuses = new Set([props.kit.statuses.resolved, props.kit.statuses.closed])
  const start = dayStart(props.now)
  const tickets = props.of(props.kit.ticketsTableId)
  return props.of(props.kit.operatorsTableId).map(row => {
    const email = textOf(row.values[props.kit.operator.email]).trim().toLowerCase()
    const open = tickets.filter(ticket => openStatuses.has(String(ticket.values[props.kit.ticket.status] ?? '')) && textOf(ticket.values[props.kit.ticket.assigneeEmail]).trim().toLowerCase() === email).length
    const resolvedToday = tickets.filter(ticket => {
      if (!resolvedStatuses.has(String(ticket.values[props.kit.ticket.status] ?? ''))) return false
      if (textOf(ticket.values[props.kit.ticket.assigneeEmail]).trim().toLowerCase() !== email) return false
      const stamp = ticket.values[props.kit.ticket.updatedAt]
      const ms = typeof stamp === 'string' ? Date.parse(stamp) : NaN
      return Number.isFinite(ms) && ms >= start
    }).length
    const lineId = props.kit.operator.line ? textOf(row.values[props.kit.operator.line]) : ''
    const photo = props.kit.operator.photo ? textOf(row.values[props.kit.operator.photo]) : ''
    return {
      id: row.id,
      name: textOf(row.values[props.kit.operator.name]) || 'Без имени',
      email,
      phone: textOf(row.values[props.kit.operator.phone]),
      photo: photo || undefined,
      lineId,
      line: choiceName(props.tables, props.kit.operatorsTableId, props.kit.operator.line, lineId) || 'Без линии',
      roleId: textOf(row.values[props.kit.operator.role]),
      role: choiceName(props.tables, props.kit.operatorsTableId, props.kit.operator.role, row.values[props.kit.operator.role]),
      shift: row.values[props.kit.operator.active] === props.kit.activeChoiceId,
      activeId: textOf(row.values[props.kit.operator.active]),
      open,
      resolvedToday,
    }
  })
}

type SortKey = 'name' | 'line' | 'shift' | 'open' | 'resolved'

export function TeamScreen(props: TeamScreenProps) {
  const device = useContext(AppFrameDeviceContext)
  const [search, setSearch] = useState('')
  const [lineFilter, setLineFilter] = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const [edit, setEdit] = useState<OperatorRow | null | 'new'>(null)
  const [message, setMessage] = useState('')
  const owner = props.actor.roleIds.includes('owner')
  const rows = operatorRows(props)
  const lineOptions = choicesOf(props.tables, props.kit.operatorsTableId, props.kit.operator.line)
  const grouping = !lineFilter
  const query = search.trim().toLocaleLowerCase('ru-RU')
  const filtered = rows.filter(row => {
    if (lineFilter && row.lineId !== lineFilter) return false
    if (shiftFilter === 'on' && !row.shift) return false
    if (shiftFilter === 'off' && row.shift) return false
    if (!query) return true
    return [row.name, row.email, row.line, row.role].join('\n').toLocaleLowerCase('ru-RU').includes(query)
  })
  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    if (sort.key === 'open') return (a.open - b.open) * dir || a.name.localeCompare(b.name, 'ru')
    if (sort.key === 'resolved') return (a.resolvedToday - b.resolvedToday) * dir || a.name.localeCompare(b.name, 'ru')
    if (sort.key === 'shift') return (Number(b.shift) - Number(a.shift)) * dir || a.name.localeCompare(b.name, 'ru')
    if (sort.key === 'line') return a.line.localeCompare(b.line, 'ru') * dir || a.name.localeCompare(b.name, 'ru')
    return a.name.localeCompare(b.name, 'ru') * dir
  })
  const groups = grouping
    ? (() => {
      const map = new Map<string, OperatorRow[]>()
      for (const row of sorted) {
        const list = map.get(row.line) ?? []
        list.push(row)
        map.set(row.line, list)
      }
      return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'))
    })()
    : [['', sorted] as [string, OperatorRow[]]]
  const toggleSort = (key: SortKey) => setSort(current => current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'line' ? 'asc' : 'desc' })
  const openOperator = (row: OperatorRow) => {
    const self = row.email && row.email === (props.actor.email ?? '').trim().toLowerCase()
    props.onOpenQueue(self ? { view: 'mine', scope: 'mine' } : { view: 'open', scope: 'open', assigneeEmail: row.email || undefined })
  }
  const sortButton = (key: SortKey, label: string) => <button type="button" className={css.sortHead} data-active={sort.key === key || undefined} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} onClick={event => { event.stopPropagation(); toggleSort(key) }}>
    {label}
    {sort.key === key ? <ProtoIcon name={sort.dir === 'asc' ? 'up' : 'down'} size={12} /> : <ProtoIcon name="sort" size={12} />}
  </button>
  const renderPeople = (people: OperatorRow[]) => <>
    {device === 'phone' ? <ul className={css.operatorCards}>
      {people.map(row => <li key={row.id}>
        <div className={css.operatorCard} data-overload={row.open >= OVERLOAD || undefined} data-off={!row.shift || undefined}>
          <button type="button" className={css.operatorCardHit} onClick={() => openOperator(row)} aria-label={`Тикеты: ${row.name}`}>
            <SupportPerson name={row.name} photo={row.photo} size={36} onShift={row.shift} />
            <span className={css.operatorCardMain}>
              <strong>{row.name}</strong>
              <span>{row.line} · {row.shift ? 'на смене' : 'не на смене'}</span>
            </span>
            <span className={css.operatorCardCounts}>
              <em data-overload={row.open >= OVERLOAD || undefined}>{row.open}</em>
              <span>откр.</span>
            </span>
          </button>
          <OperatorRowMenu owner={owner} onEdit={owner ? () => setEdit(row) : undefined} onOpenTickets={() => openOperator(row)} />
        </div>
      </li>)}
    </ul> : null}
    {device !== 'phone' ? <div className={css.tableWrap} data-team-table>
      <table className={css.table} data-columns={grouping ? 5 : 6}>
        <caption className={css.srOnly}>Операторы</caption>
        <thead><tr>
          <th>{sortButton('name', 'Оператор')}</th>
          {!grouping ? <th>{sortButton('line', 'Линия')}</th> : null}
          <th>{sortButton('shift', 'Статус')}</th>
          <th>{sortButton('open', 'Открытые')}</th>
          <th>{sortButton('resolved', 'Решено сегодня')}</th>
          <th><span className={css.srOnly}>Действия</span></th>
        </tr></thead>
        <tbody>
          {people.map(row => <tr
            key={row.id}
            className={css.teamTableRow}
            data-overload={row.open >= OVERLOAD || undefined}
            tabIndex={0}
            role="link"
            aria-label={row.name}
            onClick={() => openOperator(row)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openOperator(row)
              }
            }}
          >
            <td>
              <span className={css.personInline}>
                <SupportPerson name={row.name} photo={row.photo} size={28} onShift={row.shift} />
                <span className={css.person}>{row.name}<span>{row.email || 'Почта не указана'}</span></span>
              </span>
            </td>
            {!grouping ? <td>{row.line}</td> : null}
            <td>{row.shift ? 'На смене' : 'Не на смене'}</td>
            <td><span className={css.openCount} data-overdue={row.open >= OVERLOAD || undefined}>{row.open}</span></td>
            <td>{row.resolvedToday}</td>
            <td className={css.chevronCol} onClick={event => event.stopPropagation()}>
              <OperatorRowMenu owner={owner} onEdit={owner ? () => setEdit(row) : undefined} onOpenTickets={() => openOperator(row)} />
            </td>
          </tr>)}
        </tbody>
      </table>
    </div> : null}
  </>
  return <div className={css.root} data-support-root data-support-screen="team">
    <ListScreenShell title="Команда" meta={`${rows.filter(item => item.shift).length} из ${rows.length} на смене`} actions={owner ? <button type="button" className={css.mine} onClick={() => setEdit('new')}>Добавить оператора</button> : undefined}>
      <div className={css.stack}>
        {message ? <p role="status">{message}</p> : null}
        <div className={css.toolbar} data-team-toolbar>
          <ShellSearchField value={search} onChange={setSearch} label="Поиск операторов" placeholder="Имя, почта или линия" />
          <SupportSelect label="Линия" value={lineFilter} emptyLabel="Все линии" options={[{ id: '', name: 'Все линии' }, ...lineOptions]} onChange={setLineFilter} />
          <SupportSelect label="Статус" value={shiftFilter} emptyLabel="Все статусы" options={[{ id: '', name: 'Все статусы' }, { id: 'on', name: 'На смене' }, { id: 'off', name: 'Не на смене' }]} onChange={setShiftFilter} />
        </div>
        {props.loading ? <p className={css.status} role="status">Загружаем команду…</p> : null}
        {!props.loading && !sorted.length ? <div className={css.empty}><p>{rows.length ? 'Нет операторов по этому запросу.' : 'Операторов пока нет.'}</p></div> : null}
        {groups.map(([line, people]) => people.length ? <section key={line || 'all'} className={css.teamGroup} aria-label={line || 'Операторы'}>
          {grouping && line ? <div className={css.groupHeader}><strong>{line}</strong><span>{people.filter(item => item.shift).length} на смене · {people.length}</span></div> : null}
          {renderPeople(people)}
        </section> : null)}
      </div>
    </ListScreenShell>
    {edit ? <OperatorDialog
      kit={props.kit}
      tables={props.tables}
      initial={edit === 'new' ? null : edit}
      onClose={() => setEdit(null)}
      onSave={async change => {
        const result = await props.onSaveOperator(change)
        if (result.ok) {
          setMessage(result.message ?? 'Оператор сохранён.')
          setEdit(null)
        }
        return result
      }}
    /> : null}
  </div>
}

function OperatorDialog(props: {
  kit: TeamKit
  tables: TeamTables
  initial: OperatorRow | null
  onClose: () => void
  onSave: (change: {
    recordId?: string
    name: string
    email: string
    phone: string
    roleId: string
    lineId: string | null
    activeId: string
  }) => Promise<{ ok: boolean; error?: string }>
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); props.onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [props])
  const formId = useId()
  const roles = choicesOf(props.tables, props.kit.operatorsTableId, props.kit.operator.role)
  const lines = choicesOf(props.tables, props.kit.operatorsTableId, props.kit.operator.line)
  const statuses = choicesOf(props.tables, props.kit.operatorsTableId, props.kit.operator.active)
  const [name, setName] = useState(props.initial?.name ?? '')
  const [email, setEmail] = useState(props.initial?.email ?? '')
  const [phone, setPhone] = useState(props.initial?.phone ?? '')
  const [roleId, setRoleId] = useState(props.initial?.roleId || roles.find(item => item.name === 'Оператор')?.id || roles[0]?.id || '')
  const [lineId, setLineId] = useState(props.initial?.lineId || lines.find(item => item.name === '1-я линия')?.id || '')
  const [activeId, setActiveId] = useState(props.initial?.activeId || props.kit.activeChoiceId || statuses[0]?.id || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim()) { setError('Укажите имя.'); return }
    if (!email.trim()) { setError('Укажите почту.'); return }
    setBusy(true)
    const result = await props.onSave({
      recordId: props.initial?.id, name, email, phone, roleId, lineId: lineId || null, activeId,
    })
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Не сохранилось.')
  }
  return <AppDialog title={props.initial ? 'Оператор' : 'Новый оператор'} placement="center" onClose={props.onClose} footer={<button type="submit" form={formId} className={css.primary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}>
    <form id={formId} data-support-form="operator" onSubmit={event => { event.preventDefault(); void save() }}>
      <label className={css.field}><span>Имя</span><input value={name} onChange={event => setName(event.target.value)} maxLength={80} required /></label>
      <label className={css.field}><span>Почта</span><input value={email} onChange={event => setEmail(event.target.value)} maxLength={120} required /></label>
      <label className={css.field}><span>Телефон</span><input value={phone} onChange={event => setPhone(event.target.value)} maxLength={40} /></label>
      <SupportSelect field label="Роль" value={roleId} options={roles} onChange={setRoleId} />
      <SupportSelect field label="Линия" value={lineId} emptyLabel="Не указана" options={[{ id: '', name: 'Не указана' }, ...lines]} onChange={setLineId} />
      <SupportSelect field label="Статус" value={activeId} options={statuses.map(item => ({ id: item.id, name: item.name === 'Активен' ? 'На смене' : item.name === 'Неактивен' ? 'Не на смене' : item.name }))} onChange={setActiveId} />
      {error ? <p className={css.error} role="alert">{error}</p> : null}
    </form>
  </AppDialog>
}
