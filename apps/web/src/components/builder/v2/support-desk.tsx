'use client'
import { useEffect, useRef, useState } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import { supportPolicyFromRows, supportStoredEvents } from '@/lib/support-persist'
import { SUPPORT_AGE_BUCKETS, type SupportAgeBucket, type SupportQueueFocus, operatorTransitions, type SupportStatusName } from '@/lib/support-logic'
import { SUPPORT_HEAT_AGES, SUPPORT_SLA_STARTER, supportDashboard, supportSlaLabel, supportSlaPriorityName, supportSlaPriorityShort, supportSlaView, type SupportQueueScope, type SupportSlaPolicy, type SupportSlaPriority, type SupportSlaView } from '@/lib/support-sla'
import { supportPortraitUrl } from '@/lib/templates/support-portraits'
import { ProtoIcon } from '../prototype/icons'
import { ListScreenShell } from './layout-shell'
import css from './support.module.css'

/** Phone-only advance verb on the board card. */
export function boardAdvanceLabel(status: SupportStatusName): string | null {
  if (status === 'Новое') return 'Взять в работу'
  if (status === 'В работе') return 'Запросить у клиента'
  if (status === 'Ждём клиента') return 'Вернуть в работу'
  if (status === 'Решено') return 'Вернуть в работу'
  if (status === 'Закрыто') return 'Вернуть в работу'
  return null
}

export function boardNextStatus(status: SupportStatusName): SupportStatusName | null {
  return operatorTransitions(status)[0] ?? null
}

function BoardStatusMenu(props: { status: SupportStatusName; onPick: (status: SupportStatusName) => void }) {
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const next = operatorTransitions(props.status)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  useEffect(() => {
    if (!open || !panel.current) return
    const box = panel.current.getBoundingClientRect()
    const margin = 12
    setFlip(box.right > window.innerWidth - margin)
  }, [open])
  return <div className={css.cardMenu} ref={root} data-board-menu data-flip={flip || undefined}>
    <button type="button" className={css.cardMenuButton} aria-label="Ещё" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}>⋯</button>
    {open ? <div className={css.cardMenuPanel} ref={panel} role="menu" aria-label="Сменить статус" data-flip={flip || undefined}>
      <p className={css.cardMenuTitle}>Сменить статус</p>
      {next.map(item => <button key={item} type="button" role="menuitem" onClick={() => { props.onPick(item); setOpen(false) }}>{item}</button>)}
      {!next.length ? <button type="button" role="menuitem" disabled>{props.status}</button> : null}
    </div> : null}
  </div>
}

type DeskProps = {
  kit: NonNullable<import('@tableapp/schema/app-v2').AppV2['support']>
  rows: import('@tableapp/schema/app-v2').AppV2Record[]
  now: number
  actorEmail: string
  onOpenQueue: (focus: SupportQueueFocus | SupportQueueScope) => void
  onOpenTicket: (id: string) => void
  onStatus: (id: string, status: SupportStatusName) => Promise<{ ok: boolean; error?: string }>
  onSaveSla: (minutes: Record<string, number>) => Promise<{ ok: boolean; error?: string }>
}

const STATUSES: SupportStatusName[] = ['Новое', 'В работе', 'Ждём клиента', 'Решено', 'Закрыто']
const OVERLOAD = 5

function clock(ms: number | null, compact = false) {
  if (ms == null) return 'Нет данных'
  const sign = ms < 0 ? '−' : ''
  const abs = Math.abs(ms)
  const hours = Math.floor(abs / 3_600_000)
  const minutes = Math.round((abs % 3_600_000) / 60_000)
  if (!hours) return `${sign}${minutes} ${compact ? 'м' : 'мин'}`
  if (!minutes) return `${sign}${hours} ч`
  return compact ? `${sign}${hours} ч ${minutes} м` : `${sign}${hours} ч ${minutes} мин`
}

function daysRu(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} день`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} дня`
  return `${count} дней`
}

/** Age subline for priority bars: hours under 48 h, then days. */
function oldestLabel(ms: number) {
  if (ms >= 48 * 3_600_000) return daysRu(Math.max(2, Math.round(ms / (24 * 3_600_000))))
  return clock(ms)
}

function policyOf(props: DeskProps): SupportSlaPolicy | null {
  return supportPolicyFromRows(props.kit, props.rows)
}

function views(props: DeskProps) {
  const policy = policyOf(props)
  return props.rows.filter(row => row.tableId === props.kit.ticketsTableId).map(row => ({
    id: row.id,
    subject: String(row.values[props.kit.ticket.subject] ?? 'Без темы'),
    number: String(row.values[props.kit.ticket.number] ?? ''),
    assignee: String(row.values[props.kit.ticket.assigneeEmail] ?? ''),
    assigneeName: (() => {
      const raw = row.values[props.kit.ticket.assignee]
      const id = Array.isArray(raw) ? raw.find((item): item is string => typeof item === 'string') ?? '' : ''
      const person = id ? props.rows.find(item => item.id === id && item.tableId === props.kit.operatorsTableId) : undefined
      return person ? String(person.values[props.kit.operator.name] ?? '') : ''
    })(),
    status: String(row.values[props.kit.ticket.status] ?? ''),
    sla: supportSlaView(supportStoredEvents(props.kit, props.rows, row.id), policy, props.now),
  }))
}

function formatDateRu(now: number) {
  const wall = instantToWallClock(new Date(now), 'Europe/Moscow')
  if (!wall) return ''
  const [year, month, day] = wall.date.split('-')
  return `${day}.${month}.${year}`
}

function trendLabel(delta: number, invert = false) {
  if (!delta) return { text: 'как вчера', tone: 'flat' as const }
  const good = invert ? delta < 0 : delta > 0
  const sign = delta > 0 ? '+' : '−'
  return { text: `${sign}${Math.abs(delta)} к вчера`, tone: good ? 'good' as const : 'bad' as const }
}

function trendMs(current: number | null, previous: number | null) {
  if (current == null || previous == null) return { text: 'нет сравнения', tone: 'flat' as const }
  const deltaMin = Math.round((current - previous) / 60_000)
  if (!deltaMin) return { text: 'как вчера', tone: 'flat' as const }
  const good = deltaMin < 0
  const sign = deltaMin > 0 ? '+' : '−'
  return { text: `${sign}${Math.abs(deltaMin)} мин к вчера`, tone: good ? 'good' as const : 'bad' as const }
}

function priorityTone(priority: SupportSlaPriority) {
  if (priority === 'urgent') return 'urgent'
  if (priority === 'high') return 'high'
  if (priority === 'normal') return 'normal'
  return 'low'
}

function heatLevel(count: number, age: SupportAgeBucket | 'total') {
  if (!count) return 'empty'
  if (age === 'gt3d' || age === '1to3d') return count >= 3 ? 'critical' : 'aging'
  if (age === '12to24h') return count >= 3 ? 'aging' : 'fresh'
  return count >= 4 ? 'aging' : 'fresh'
}

export function SupportPerson({ name, size = 32, onShift }: { name: string; size?: number; onShift?: boolean }) {
  const url = supportPortraitUrl(name)
  return <span className={css.avatar} data-size={size <= 24 ? 'sm' : size >= 40 ? 'lg' : 'md'} data-onshift={onShift || undefined}>
    {url ? <img src={url} alt="" width={size} height={size} /> : null}
    {onShift != null ? <i className={css.shiftDot} data-on={onShift || undefined} aria-hidden="true" /> : null}
  </span>
}

export function SupportDashboard(props: DeskProps) {
  const items = views(props).map(item => ({ assigneeEmail: item.assignee, sla: item.sla }))
  const dash = supportDashboard(items, props.now, 7 * 24 * 60 * 60 * 1000)
  const known = items.some(item => item.sla.known)
  const operators = props.rows.filter(row => row.tableId === props.kit.operatorsTableId)
  const activeId = props.kit.activeChoiceId
  const onShift = operators.filter(row => row.values[props.kit.operator.active] === activeId)
  const openDelta = dash.open - dash.openYesterday
  const overdueDelta = dash.overdue - dash.overdueYesterday
  const resolvedDelta = dash.resolvedToday - dash.resolvedYesterday
  const maxPriority = Math.max(1, ...dash.age.map(item => item.count))
  const openHeat = (priority: SupportSlaPriority, age?: SupportAgeBucket) => {
    props.onOpenQueue({ scope: 'open', priority: supportSlaPriorityName(priority), ...(age ? { ageBucket: age } : {}) })
  }
  return <div className={css.root} data-support-root data-support-screen="dashboard">
    <div className={css.dashHero} data-support-hero>
      <div className={css.dashHeroCopy}>
        <p className={css.dashEyebrow}>{formatDateRu(props.now)}</p>
        <h1>Служба поддержки</h1>
        <p className={css.dashShiftMeta}>{onShift.length} из {operators.length} на смене</p>
      </div>
      <div className={css.teamRow} aria-label="Команда на смене">
        {operators.map(row => {
          const name = String(row.values[props.kit.operator.name] ?? 'Без имени')
          const email = String(row.values[props.kit.operator.email] ?? '').trim().toLowerCase()
          const shift = row.values[props.kit.operator.active] === activeId
          const open = dash.openByAssignee[email] ?? 0
          return <article key={row.id} className={css.teamCard} data-overload={open >= OVERLOAD || undefined} data-off={!shift || undefined}>
            <SupportPerson name={name} size={44} onShift={shift} />
            <div className={css.teamCopy}>
              <strong>{name}</strong>
              <span>{shift ? 'На смене' : 'Не на смене'}</span>
            </div>
            <button type="button" className={css.teamLoad} data-overload={open >= OVERLOAD || undefined} onClick={() => props.onOpenQueue(shift ? 'mine' : 'open')} aria-label={`Открытых у ${name}: ${open}`}>
              <em>{open}</em>
              <span>открытых</span>
            </button>
          </article>
        })}
      </div>
    </div>

    <div className={css.kpiGrid} aria-label="Показатели службы">
      {([
        { key: 'open', value: dash.open, label: 'Открытые', icon: 'clipboard' as const, tone: 'neutral' as const, trend: trendLabel(openDelta, true), scope: 'open' as const },
        { key: 'overdue', value: dash.overdue, label: 'Просрочено', icon: 'warning' as const, tone: 'terra' as const, trend: trendLabel(overdueDelta, true), scope: 'overdue' as const },
        { key: 'resolved', value: known ? dash.resolvedToday : '—', label: 'Решено сегодня', icon: 'check' as const, tone: 'sage' as const, trend: trendLabel(resolvedDelta), scope: 'all' as const },
        { key: 'first', value: dash.avgFirstResponseMs == null ? 'Нет данных' : clock(dash.avgFirstResponseMs), compact: dash.avgFirstResponseMs == null ? undefined : clock(dash.avgFirstResponseMs, true), label: 'Средний первый ответ', icon: 'send' as const, tone: 'neutral' as const, trend: trendMs(dash.avgFirstResponseMs, dash.avgFirstYesterdayMs), scope: 'all' as const },
        { key: 'resolve', value: dash.avgResolutionMs == null ? 'Нет данных' : clock(dash.avgResolutionMs), compact: dash.avgResolutionMs == null ? undefined : clock(dash.avgResolutionMs, true), label: 'Среднее решение', icon: 'clock' as const, tone: 'neutral' as const, trend: trendMs(dash.avgResolutionMs, dash.avgResolutionYesterdayMs), scope: 'all' as const },
      ]).map(card => <button key={card.key} type="button" className={css.kpiCard} data-tone={card.tone} onClick={() => props.onOpenQueue(card.scope)}>
        <span className={css.kpiIcon} aria-hidden="true"><ProtoIcon name={card.icon} size={18} /></span>
        <strong data-compact={card.compact || undefined}>{card.compact ? <><span className={css.kpiFull}>{card.value}</span><span className={css.kpiShort}>{card.compact}</span></> : card.value}</strong>
        <span className={css.kpiLabel}>{card.label}</span>
        <span className={css.kpiTrend} data-tone={card.trend.tone}>{card.trend.text}</span>
      </button>)}
    </div>

    <div className={css.dashPanels}>
      <section className={css.priorityPanel} aria-label="Открытые по приоритету">
        <h2>Открытые по приоритету</h2>
        {dash.age.length ? <ul className={css.priorityList}>{dash.age.map(bucket => {
          const name = supportSlaPriorityName(bucket.priority)
          return <li key={bucket.priority}>
            <button type="button" className={css.priorityRow} onClick={() => openHeat(bucket.priority)}>
              <span className={css.priorityPill} data-priority={priorityTone(bucket.priority)}>{name}</span>
              <span className={css.priorityTrack} data-priority={priorityTone(bucket.priority)}><i style={{ width: `${Math.max(10, Math.round(bucket.count / maxPriority * 100))}%` }} /></span>
              <strong>{bucket.count}</strong>
              <span className={css.quiet}>самое старое {oldestLabel(bucket.oldestMs)}</span>
            </button>
          </li>
        })}</ul> : <p className={css.quiet}>Нет открытых обращений</p>}
      </section>

      <section className={css.heatPanel} aria-label="Тепловая карта приоритет и возраст">
        <div className={css.heatHead}>
          <h2>Тепловая карта: приоритет × возраст</h2>
          <p className={css.quiet}>Нажмите ячейку, чтобы открыть очередь с этим приоритетом и возрастом.</p>
        </div>
        <div className={css.heatScroll}>
          <table className={css.heatTable}>
            <thead>
              <tr>
                <th scope="col" className={css.heatPriorityHead}><span className={css.heatLabelFull}>Приоритет</span><span className={css.heatLabelShort}>Прио.</span></th>
                {SUPPORT_HEAT_AGES.map(age => <th key={age.id} scope="col"><span className={css.heatLabelFull}>{age.label}</span><span className={css.heatLabelShort}>{age.shortLabel}</span></th>)}
                <th scope="col" className={css.heatTotalHead}>Всего</th>
              </tr>
            </thead>
            <tbody>
              {dash.heat.map(row => <tr key={row.priority}>
                <th scope="row">
                  <span className={css.priorityPill} data-priority={priorityTone(row.priority)} data-heat-priority>
                    <i className={css.priorityDot} aria-hidden="true" />
                    <span className={css.priorityFull}>{supportSlaPriorityName(row.priority)}</span>
                    <span className={css.priorityShort}>{supportSlaPriorityShort(row.priority)}</span>
                  </span>
                </th>
                {SUPPORT_AGE_BUCKETS.map(age => {
                  const cell = row.cells[age.id]
                  return <td key={age.id}>
                    <button type="button" className={css.heatCell} data-level={heatLevel(cell.count, age.id)} data-breach={cell.breached > 0 || undefined} onClick={() => openHeat(row.priority, age.id)} aria-label={`${supportSlaPriorityName(row.priority)}, ${age.label}: ${cell.count}`}>
                      <span>{cell.count || '·'}</span>
                      {cell.breached > 0 ? <i className={css.heatBreach} aria-label="Есть просрочка" /> : null}
                    </button>
                  </td>
                })}
                <td className={css.heatTotalCell}>
                  <button type="button" className={css.heatCell} data-level="total" onClick={() => openHeat(row.priority)} aria-label={`${supportSlaPriorityName(row.priority)}, всего: ${row.total.count}`}>
                    <span>{row.total.count || '·'}</span>
                  </button>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <ul className={css.heatLegend} aria-label="Легенда">
          <li><span data-level="fresh" />Свежие</li>
          <li><span data-level="aging" />Стареют</li>
          <li><span data-level="critical" />Критично</li>
          <li><i className={css.heatBreach} />Есть просрочка</li>
        </ul>
      </section>
    </div>
  </div>
}

export function SupportBoard(props: DeskProps & { phone: boolean }) {
  const [column, setColumn] = useState<SupportStatusName>('В работе')
  const [error, setError] = useState('')
  const [dragId, setDragId] = useState('')
  const statusName = (id: string) => {
    const names: Record<string, SupportStatusName> = {
      [props.kit.statuses.fresh]: 'Новое', [props.kit.statuses.progress]: 'В работе', [props.kit.statuses.waiting]: 'Ждём клиента',
      [props.kit.statuses.resolved]: 'Решено', [props.kit.statuses.closed]: 'Закрыто',
    }
    return names[id] ?? 'Новое'
  }
  const cards = views(props).map(item => ({ ...item, statusName: statusName(item.status) }))
  const columns = props.phone ? STATUSES.filter(status => status === column) : STATUSES
  const move = async (id: string, status: SupportStatusName) => {
    const result = await props.onStatus(id, status)
    if (!result.ok) setError(result.error ?? 'Статус не изменён.')
    else setError('')
  }
  return <div className={css.root} data-support-root data-support-screen="board">
    <ListScreenShell title="Доска" meta="Обращения по статусам.">
      {error ? <p className={css.error} role="alert">{error}</p> : null}
      {props.phone ? <div className={css.chips} role="tablist" aria-label="Колонка">{STATUSES.map(status => <button key={status} type="button" className={css.chip} aria-pressed={column === status} onClick={() => setColumn(status)}>{status}</button>)}</div> : null}
      <div className={css.board}>
        {columns.map(status => <section key={status} aria-label={status} onDragOver={event => { if (!props.phone) event.preventDefault() }} onDrop={event => { event.preventDefault(); if (dragId) void move(dragId, status); setDragId('') }}>
          <h3>{status}</h3>
          {cards.filter(card => card.statusName === status).map(card => {
            const advance = boardAdvanceLabel(card.statusName)
            const next = boardNextStatus(card.statusName)
            return <article key={card.id} draggable={!props.phone} onDragStart={() => setDragId(card.id)} data-board-card>
              <button type="button" className={css.rowButton} onClick={() => props.onOpenTicket(card.id)}><span className={css.subject}>{card.subject}</span>{card.number ? <span className={css.number}>{card.number}</span> : null}</button>
              {card.assigneeName ? <span className={css.personInline}><SupportPerson name={card.assigneeName} size={22} /><span>{card.assigneeName}</span></span> : <p className={css.quiet}>Не назначен</p>}
              <p className={card.sla.currentOverdue ? css.late : css.quiet}>{supportSlaLabel(card.sla) || 'В срок'}</p>
              <div className={css.cardActions}>
                {props.phone && advance && next ? <button type="button" className={css.statusChip} data-board-advance onClick={() => void move(card.id, next)}>{advance}</button> : null}
                <BoardStatusMenu status={card.statusName} onPick={nextStatus => void move(card.id, nextStatus)} />
              </div>
            </article>
          })}
        </section>)}
      </div>
    </ListScreenShell>
  </div>
}

export function SupportSlaSettings(props: DeskProps) {
  const policy = policyOf(props) ?? SUPPORT_SLA_STARTER
  const [minutes, setMinutes] = useState<Record<string, number>>({
    urgentFirst: policy.firstResponseMinutes.urgent, highFirst: policy.firstResponseMinutes.high, normalFirst: policy.firstResponseMinutes.normal, lowFirst: policy.firstResponseMinutes.low,
    urgentResolve: policy.resolutionMinutes.urgent, highResolve: policy.resolutionMinutes.high, normalResolve: policy.resolutionMinutes.normal, lowResolve: policy.resolutionMinutes.low,
    riskMinutes: policy.riskMinutes,
  })
  const [message, setMessage] = useState('')
  const fields: [string, string][] = [
    ['urgentFirst', 'Срочный, первый ответ'], ['highFirst', 'Высокий, первый ответ'], ['normalFirst', 'Обычный, первый ответ'], ['lowFirst', 'Низкий, первый ответ'],
    ['urgentResolve', 'Срочный, решение'], ['highResolve', 'Высокий, решение'], ['normalResolve', 'Обычный, решение'], ['lowResolve', 'Низкий, решение'],
    ['riskMinutes', 'Порог «скоро срок»'],
  ]
  return <form className={css.sla} onSubmit={event => { event.preventDefault(); void props.onSaveSla(minutes).then(result => setMessage(result.ok ? 'Нормативы сохранены.' : result.error ?? 'Не сохранилось.')) }}>
    <h3>Нормативы</h3>
    <p className={css.quiet}>Сроки первого ответа и решения в минутах. Часы идут круглосуточно.</p>
    <div className={css.slaGrid}>{fields.map(([key, label]) => <label key={key}><span>{label}, мин</span><input inputMode="numeric" value={minutes[key] ?? ''} onChange={event => setMinutes(current => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div>
    <button type="submit" className={css.primary}>Сохранить нормативы</button>
    {message ? <p role="status">{message}</p> : null}
  </form>
}

export function slaFacts(kit: DeskProps['kit'], rows: DeskProps['rows'], ticketId: string, now: number): SupportSlaView {
  return supportSlaView(supportStoredEvents(kit, rows, ticketId), supportPolicyFromRows(kit, rows), now)
}

export function slaWhen(at: number | null) {
  if (at == null) return ''
  const wall = instantToWallClock(new Date(at), 'Europe/Moscow')
  if (!wall) return ''
  const [year, month, day] = wall.date.split('-')
  return `${day}.${month}.${year}, ${wall.time}`
}
