'use client'
import { useEffect, useRef, useState } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import { supportPolicyFromRows, supportStoredEvents } from '@/lib/support-persist'
import { SUPPORT_SLA_STARTER, supportDashboard, supportSlaLabel, supportSlaPriorityName, supportSlaView, type SupportQueueScope, type SupportSlaPolicy, type SupportSlaView } from '@/lib/support-sla'
import { operatorTransitions, type SupportStatusName } from '@/lib/support-logic'
import css from './support.module.css'

/** Phone-only advance verb on the board card. */
export function boardAdvanceLabel(status: SupportStatusName): string | null {
  if (status === 'Новое') return 'В работу'
  if (status === 'В работе') return 'Ждём клиента'
  if (status === 'Ждём клиента') return 'В работу'
  if (status === 'Решено') return 'В работу'
  if (status === 'Закрыто') return 'В работу'
  return null
}

export function boardNextStatus(status: SupportStatusName): SupportStatusName | null {
  return operatorTransitions(status)[0] ?? null
}

function BoardStatusMenu(props: { status: SupportStatusName; onPick: (status: SupportStatusName) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const next = operatorTransitions(props.status)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className={css.cardMenu} ref={root} data-board-menu>
    <button type="button" className={css.cardMenuButton} aria-label="Ещё" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}>⋯</button>
    {open ? <div className={css.cardMenuPanel} role="menu" aria-label="Сменить статус">
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
  onOpenQueue: (scope: SupportQueueScope) => void
  onOpenTicket: (id: string) => void
  onStatus: (id: string, status: SupportStatusName) => Promise<{ ok: boolean; error?: string }>
  onSaveSla: (minutes: Record<string, number>) => Promise<{ ok: boolean; error?: string }>
}

const STATUSES: SupportStatusName[] = ['Новое', 'В работе', 'Ждём клиента', 'Решено', 'Закрыто']

function clock(ms: number | null) {
  if (ms == null) return 'Нет данных'
  const sign = ms < 0 ? '−' : ''
  const abs = Math.abs(ms)
  const hours = Math.floor(abs / 3_600_000)
  const minutes = Math.round((abs % 3_600_000) / 60_000)
  if (!hours) return `${sign}${minutes} мин`
  return minutes ? `${sign}${hours} ч ${minutes} мин` : `${sign}${hours} ч`
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
    status: String(row.values[props.kit.ticket.status] ?? ''),
    sla: supportSlaView(supportStoredEvents(props.kit, props.rows, row.id), policy, props.now),
  }))
}

export function SupportDashboard(props: DeskProps) {
  const [days, setDays] = useState<7 | 30>(7)
  const items = views(props).map(item => ({ assigneeEmail: item.assignee, sla: item.sla }))
  const dash = supportDashboard(items, props.now, days * 24 * 60 * 60 * 1000)
  const known = items.some(item => item.sla.known)
  const ratio = (met: number, total: number) => total ? `${Math.round(met / total * 100)}%` : 'Нет данных'
  return <div className={css.root} data-support-root data-support-screen="dashboard">
    <header className={css.dashHead}>
      <div>
        <h2>Служба поддержки</h2>
        <p>Календарные часы, круглосуточно. Период закрытых циклов — {days} дней.</p>
      </div>
      <div className={css.chips} role="group" aria-label="Период">
        <button type="button" className={css.chip} aria-pressed={days === 7} onClick={() => setDays(7)}>7 дней</button>
        <button type="button" className={css.chip} aria-pressed={days === 30} onClick={() => setDays(30)}>30 дней</button>
      </div>
    </header>
    <div className={css.summary} aria-label="Сводка службы">
      {([
        ['open', dash.open, 'Открытые'],
        ['unassigned', dash.unassigned, 'Без ответственного'],
        ['risk', dash.risk, 'Скоро срок'],
        ['overdue', dash.overdue, 'Просрочены'],
      ] as const).map(([scope, value, label]) => <button key={scope} type="button" onClick={() => props.onOpenQueue(scope)}><strong>{value}</strong><span>{label}</span></button>)}
    </div>
    <div className={css.metrics}>
      <p><span>Решено за период</span><strong>{known ? dash.resolvedInPeriod : 'Нет данных'}</strong></p>
      <p><span>Средний первый ответ</span><strong>{dash.avgFirstResponseMs == null ? 'Нет данных' : clock(dash.avgFirstResponseMs)}</strong></p>
      <p><span>Среднее решение</span><strong>{dash.avgResolutionMs == null ? 'Нет данных' : clock(dash.avgResolutionMs)}</strong></p>
      <p><span>Первый ответ в срок</span><strong>{ratio(dash.firstMet, dash.firstClosed)}</strong></p>
      <p><span>Решение в срок</span><strong>{ratio(dash.resolutionMet, dash.resolutionClosed)}</strong></p>
    </div>
    <section className={css.age} aria-label="Возраст открытых обращений">
      <h3>Открытые по приоритету</h3>
      {dash.age.length ? <ul>{dash.age.map(bucket => <li key={bucket.priority}><span>{supportSlaPriorityName(bucket.priority)}</span><strong>{bucket.count}</strong><span>самое старое {clock(bucket.oldestMs)}</span><span className={css.track}><i style={{ width: `${Math.max(8, Math.min(100, bucket.oldestMs / (48 * 3_600_000) * 100))}%` }} /></span></li>)}</ul> : <p>Нет данных</p>}
    </section>
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
    <header className={css.dashHead}><h2>Доска</h2><p>Перетаскивание на компьютере. На телефоне — кнопка и меню статуса.</p></header>
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
            <p className={card.sla.currentOverdue ? css.late : css.quiet}>{supportSlaLabel(card.sla) || 'Норматив в срок'}</p>
            <div className={css.cardActions}>
              {props.phone && advance && next ? <button type="button" className={css.statusChip} data-board-advance onClick={() => void move(card.id, next)}>{advance}</button> : null}
              <BoardStatusMenu status={card.statusName} onPick={nextStatus => void move(card.id, nextStatus)} />
            </div>
          </article>
        })}
      </section>)}
    </div>
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
    <p className={css.quiet}>Календарные часы, 24/7, без рабочего календаря и без писем наружу. Срок решения по умолчанию — пример Glide: 4 / 8 / 24 / 48 часов. Первый ответ — учебные 1 / 2 / 8 / 24 часа, это не рыночный стандарт. Назначенный руками срок остаётся отдельным полем.</p>
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

