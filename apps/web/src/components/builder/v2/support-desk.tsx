'use client'
import { useEffect, useRef, useState } from 'react'
import { instantToWallClock } from '@tableapp/schema'
import { supportPolicyFromRows, supportStoredEvents } from '@/lib/support-persist'
import { SUPPORT_AGE_BUCKETS, type SupportAgeBucket, type SupportQueueFocus, operatorTransitions, type SupportStatusName } from '@/lib/support-logic'
import { SUPPORT_HEAT_AGES, SUPPORT_SLA_STARTER, supportDashboard, supportSlaLabel, supportSlaPriorityName, supportSlaPriorityShort, supportSlaView, type SupportQueueScope, type SupportSlaPolicy, type SupportSlaPriority, type SupportSlaView } from '@/lib/support-sla'
import { supportPortraitUrl } from '@/lib/templates/support-portraits'
import { Select } from '@/components/ui/select'
import { durationUnitLabel, splitMinutes } from '@/components/ui/format'
import { ProtoIcon } from '../prototype/icons'
import css from './support.module.css'

/** Status menu for a ticket row or card. Outside click and Esc close it. */
export function TicketStatusMenu(props: { status: SupportStatusName; onPick: (status: SupportStatusName) => void }) {
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
  if (!next.length) return null
  return <div className={css.cardMenu} ref={root} data-ticket-menu data-flip={flip || undefined}>
    <button type="button" className={css.cardMenuButton} aria-label="Сменить статус" aria-expanded={open} aria-haspopup="menu" onClick={event => { event.stopPropagation(); setOpen(value => !value) }}>⋯</button>
    {open ? <div className={css.cardMenuPanel} ref={panel} role="menu" aria-label="Сменить статус" data-flip={flip || undefined} onClick={event => event.stopPropagation()}>
      <p className={css.cardMenuTitle}>Сменить статус</p>
      {next.map(item => <button key={item} type="button" role="menuitem" onClick={() => { props.onPick(item); setOpen(false) }}>{item}</button>)}
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

export function SupportPerson({ name, size = 32, onShift, photo }: { name: string; size?: number; onShift?: boolean; photo?: string }) {
  const url = photo || supportPortraitUrl(name)
  const icon = size <= 24 ? 12 : size >= 40 ? 20 : 14
  return <span className={css.avatar} data-size={size <= 24 ? 'sm' : size >= 40 ? 'lg' : 'md'} data-onshift={onShift || undefined}>
    {url ? <img src={url} alt="" width={size} height={size} /> : <ProtoIcon name="user" size={icon} />}
    {onShift != null ? <i className={css.shiftDot} data-on={onShift || undefined} aria-hidden="true" /> : null}
  </span>
}

export const SUPPORT_TEAM_CARD_LIMIT = 6

function operatorPhoto(kit: DeskProps['kit'], row: DeskProps['rows'][number]) {
  if (!kit.operator.photo) return undefined
  const value = row.values[kit.operator.photo]
  return typeof value === 'string' && value ? value : undefined
}

function openByAssigneeFromRows(kit: DeskProps['kit'], rows: DeskProps['rows']) {
  const openStatuses = new Set([kit.statuses.fresh, kit.statuses.progress, kit.statuses.waiting])
  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (row.tableId !== kit.ticketsTableId) continue
    if (!openStatuses.has(String(row.values[kit.ticket.status] ?? ''))) continue
    const email = String(row.values[kit.ticket.assigneeEmail] ?? '').trim().toLowerCase()
    if (!email) continue
    counts[email] = (counts[email] ?? 0) + 1
  }
  return counts
}

type TeamOperator = {
  id: string
  name: string
  email: string
  photo?: string
  shift: boolean
  open: number
  line: string
  lineId: string
}

function teamOperators(props: DeskProps & { lineLabel?: (id: string) => string }): TeamOperator[] {
  const activeId = props.kit.activeChoiceId
  const loads = openByAssigneeFromRows(props.kit, props.rows)
  return props.rows.filter(row => row.tableId === props.kit.operatorsTableId).map(row => {
    const lineId = props.kit.operator.line ? String(row.values[props.kit.operator.line] ?? '') : ''
    const email = String(row.values[props.kit.operator.email] ?? '').trim().toLowerCase()
    return {
      id: row.id,
      name: String(row.values[props.kit.operator.name] ?? 'Без имени'),
      email,
      photo: operatorPhoto(props.kit, row),
      shift: row.values[props.kit.operator.active] === activeId,
      open: loads[email] ?? 0,
      lineId,
      line: lineId && props.lineLabel ? props.lineLabel(lineId) : '',
    }
  })
}

function CompactTeamBlock(props: {
  operators: TeamOperator[]
  onOpenTeam: () => void
  onOpenQueue: DeskProps['onOpenQueue']
  actorEmail: string
}) {
  const onShift = props.operators.filter(item => item.shift)
  const overloaded = [...onShift].filter(item => item.open >= OVERLOAD).sort((a, b) => b.open - a.open)
  const free = [...onShift].filter(item => item.open < OVERLOAD).sort((a, b) => a.open - b.open || a.name.localeCompare(b.name, 'ru'))
  const avg = onShift.length ? Math.round((onShift.reduce((sum, item) => sum + item.open, 0) / onShift.length) * 10) / 10 : 0
  const stack = onShift.slice(0, 8)
  const extra = Math.max(0, onShift.length - stack.length)
  const lines = (() => {
    const map = new Map<string, { name: string; on: number; total: number; open: number }>()
    for (const item of props.operators) {
      const key = item.line || 'Без линии'
      const entry = map.get(key) ?? { name: key, on: 0, total: 0, open: 0 }
      entry.total += 1
      if (item.shift) entry.on += 1
      entry.open += item.open
      map.set(key, entry)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  })()
  return <div className={css.teamCompact} aria-label="Команда на смене">
    <div className={css.teamCompactTop}>
      <div className={css.avatarStack} aria-hidden="true">
        {stack.map((item, index) => <span key={item.id} className={css.avatarStackItem} style={{ zIndex: stack.length - index }}>
          <SupportPerson name={item.name} photo={item.photo} size={36} onShift={item.shift} />
        </span>)}
        {extra > 0 ? <span className={css.avatarStackMore}>+{extra}</span> : null}
      </div>
      <div className={css.teamCompactStats}>
        <p><strong>{avg}</strong><span>средняя нагрузка</span></p>
        <p data-terra={overloaded.length > 0 || undefined}><strong>{overloaded.length}</strong><span>перегружены</span></p>
      </div>
    </div>
    <div className={css.teamCompactLists}>
      <section className={css.teamMiniList} data-tone="terra" aria-label="Перегружены">
        <h3>Перегружены</h3>
        <ul>{(overloaded.length ? overloaded : []).slice(0, 3).map(item => {
          const self = item.email && item.email === props.actorEmail.trim().toLowerCase()
          return <li key={item.id}>
            <button type="button" onClick={() => props.onOpenQueue(self ? { view: 'mine', scope: 'mine' } : { view: 'open', scope: 'open', assigneeEmail: item.email || undefined })}>
              <SupportPerson name={item.name} photo={item.photo} size={28} onShift />
              <span className={css.teamMiniCopy}><strong>{item.name}</strong><span>{item.line || 'Линия не указана'}</span></span>
              <span className={css.teamMiniLoad}><em>{item.open}</em><span>откр.</span></span>
            </button>
          </li>
        })}
        {!overloaded.length ? <li className={css.quiet}>Никого нет</li> : null}
        </ul>
      </section>
      <section className={css.teamMiniList} data-tone="sage" aria-label="Свободны">
        <h3>Свободны</h3>
        <ul>{free.slice(0, 3).map(item => {
          const self = item.email && item.email === props.actorEmail.trim().toLowerCase()
          return <li key={item.id}>
            <button type="button" onClick={() => props.onOpenQueue(self ? { view: 'mine', scope: 'mine' } : { view: 'open', scope: 'open', assigneeEmail: item.email || undefined })}>
              <SupportPerson name={item.name} photo={item.photo} size={28} onShift />
              <span className={css.teamMiniCopy}><strong>{item.name}</strong><span>{item.line || 'Линия не указана'}</span></span>
              <span className={css.teamMiniLoad}><em>{item.open}</em><span>откр.</span></span>
            </button>
          </li>
        })}
        {!free.length ? <li className={css.quiet}>Никого нет</li> : null}
        </ul>
      </section>
    </div>
    {lines.length > 1 ? <ul className={css.lineSummary} aria-label="Сводка по линиям">
      {lines.map(line => <li key={line.name}><strong>{line.name}</strong><span>{line.on} из {line.total} на смене</span><span>{line.open} откр.</span></li>)}
    </ul> : null}
    <button type="button" className={css.teamAllLink} onClick={props.onOpenTeam}>Вся команда →</button>
  </div>
}

export function SupportDashboard(props: DeskProps & { onOpenTeam?: () => void; lineLabel?: (id: string) => string }) {
  const items = views(props).map(item => ({ assigneeEmail: item.assignee, sla: item.sla }))
  const dash = supportDashboard(items, props.now, 7 * 24 * 60 * 60 * 1000)
  const known = items.some(item => item.sla.known)
  const operators = teamOperators(props)
  const onShift = operators.filter(item => item.shift)
  const compact = operators.length > SUPPORT_TEAM_CARD_LIMIT
  const openDelta = dash.open - dash.openYesterday
  const overdueDelta = dash.overdue - dash.overdueYesterday
  const resolvedDelta = dash.resolvedToday - dash.resolvedYesterday
  const maxPriority = Math.max(1, ...dash.age.map(item => item.count))
  const openHeat = (priority: SupportSlaPriority, age?: SupportAgeBucket) => {
    props.onOpenQueue({ view: 'open', scope: 'open', priority: supportSlaPriorityName(priority), ...(age ? { ageBucket: age } : {}) })
  }
  return <div className={css.root} data-support-root data-support-screen="dashboard" data-team={compact ? 'compact' : 'cards'}>
    <div className={css.dashHero} data-support-hero>
      <div className={css.dashHeroCopy}>
        <p className={css.dashEyebrow}>{formatDateRu(props.now)}</p>
        <h1>Служба поддержки</h1>
        <p className={css.dashShiftMeta}>{onShift.length} из {operators.length} на смене</p>
      </div>
      {compact ? <CompactTeamBlock
        operators={operators}
        actorEmail={props.actorEmail}
        onOpenQueue={props.onOpenQueue}
        onOpenTeam={() => props.onOpenTeam?.()}
      /> : <div className={css.teamRow} aria-label="Команда на смене">
        {operators.map(row => {
          const self = row.email && row.email === props.actorEmail.trim().toLowerCase()
          return <article key={row.id} className={css.teamCard} data-overload={row.open >= OVERLOAD || undefined} data-off={!row.shift || undefined}>
            <SupportPerson name={row.name} photo={row.photo} size={44} onShift={row.shift} />
            <div className={css.teamCopy}>
              <strong>{row.name}</strong>
              <span>{row.line ? `${row.shift ? 'На смене' : 'Не на смене'} · ${row.line}` : (row.shift ? 'На смене' : 'Не на смене')}</span>
            </div>
            <button
              type="button"
              className={css.teamLoad}
              data-overload={row.open >= OVERLOAD || undefined}
              onClick={() => props.onOpenQueue(self ? { view: 'mine', scope: 'mine' } : { view: 'open', scope: 'open', assigneeEmail: row.email || undefined })}
              aria-label={`Открытых у ${row.name}: ${row.open}`}
            >
              <em>{row.open}</em>
              <span>открытых</span>
            </button>
          </article>
        })}
        {props.onOpenTeam ? <button type="button" className={css.teamAllLink} data-inline onClick={props.onOpenTeam}>Вся команда →</button> : null}
      </div>}
    </div>

    <div className={css.kpiGrid} aria-label="Показатели службы">
      {([
        { key: 'open', value: dash.open, label: 'Открытые', icon: 'clipboard' as const, tone: 'neutral' as const, trend: trendLabel(openDelta, true), focus: { view: 'open' as const, scope: 'open' as const } },
        { key: 'overdue', value: dash.overdue, label: 'Просрочено', icon: 'warning' as const, tone: 'terra' as const, trend: trendLabel(overdueDelta, true), focus: { view: 'hot' as const, scope: 'hot' as const } },
        { key: 'resolved', value: known ? dash.resolvedToday : '—', label: 'Решено сегодня', icon: 'check' as const, tone: 'sage' as const, trend: trendLabel(resolvedDelta), focus: { view: 'closed' as const, scope: 'closed' as const } },
        { key: 'first', value: dash.avgFirstResponseMs == null ? 'Нет данных' : clock(dash.avgFirstResponseMs), compact: dash.avgFirstResponseMs == null ? undefined : clock(dash.avgFirstResponseMs, true), label: 'Средний первый ответ', icon: 'send' as const, tone: 'neutral' as const, trend: trendMs(dash.avgFirstResponseMs, dash.avgFirstYesterdayMs), focus: { view: 'open' as const, scope: 'open' as const } },
        { key: 'resolve', value: dash.avgResolutionMs == null ? 'Нет данных' : clock(dash.avgResolutionMs), compact: dash.avgResolutionMs == null ? undefined : clock(dash.avgResolutionMs, true), label: 'Среднее решение', icon: 'clock' as const, tone: 'neutral' as const, trend: trendMs(dash.avgResolutionMs, dash.avgResolutionYesterdayMs), focus: { view: 'open' as const, scope: 'open' as const } },
      ]).map(card => <button key={card.key} type="button" className={css.kpiCard} data-tone={card.tone} onClick={() => props.onOpenQueue(card.focus)}>
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
          <p className={css.quiet}>Нажмите ячейку, чтобы открыть тикеты с этим приоритетом и возрастом.</p>
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

const SLA_PICK_MINUTES = [15, 30, 60, 120, 240, 480, 720, 1440, 2880, 4320, 10080]

/** Human duration for a minute count: 120 → «2 часа», 1440 → «1 день». */
export function slaDuration(total: number) {
  const parts = splitMinutes(total)
  return `${parts.amount} ${durationUnitLabel(parts.unit, parts.amount)}`
}

function slaPickOptions(current: number) {
  const values = current > 0 && !SLA_PICK_MINUTES.includes(current) ? [...SLA_PICK_MINUTES, current].sort((a, b) => a - b) : SLA_PICK_MINUTES
  return values.map(total => ({ value: String(total), label: slaDuration(total) }))
}

export function SupportSlaSettings(props: DeskProps) {
  const policy = policyOf(props) ?? SUPPORT_SLA_STARTER
  const [minutes, setMinutes] = useState<Record<string, number>>({
    urgentFirst: policy.firstResponseMinutes.urgent, highFirst: policy.firstResponseMinutes.high, normalFirst: policy.firstResponseMinutes.normal, lowFirst: policy.firstResponseMinutes.low,
    urgentResolve: policy.resolutionMinutes.urgent, highResolve: policy.resolutionMinutes.high, normalResolve: policy.resolutionMinutes.normal, lowResolve: policy.resolutionMinutes.low,
    riskMinutes: policy.riskMinutes,
  })
  const [error, setError] = useState('')
  const fields: [string, string][] = [
    ['urgentFirst', 'Срочный, первый ответ'], ['highFirst', 'Высокий, первый ответ'], ['normalFirst', 'Обычный, первый ответ'], ['lowFirst', 'Низкий, первый ответ'],
    ['urgentResolve', 'Срочный, решение'], ['highResolve', 'Высокий, решение'], ['normalResolve', 'Обычный, решение'], ['lowResolve', 'Низкий, решение'],
    ['riskMinutes', 'Порог «скоро срок»'],
  ]
  const pick = (key: string, total: number) => {
    const next = { ...minutes, [key]: total }
    setMinutes(next)
    setError('')
    void props.onSaveSla(next).then(result => { if (!result.ok) setError(result.error ?? 'Не сохранилось.') })
  }
  return <div className={css.setGroup}>
    {fields.map(([key, label]) => <div key={key} className={css.setRow}>
      <div className={css.setRowText}><strong>{label}</strong></div>
      <div className={css.setRowEnd}>
        <div className={css.setPick}>
          <Select label={label} labelHidden value={String(minutes[key] ?? 0)} options={slaPickOptions(minutes[key] ?? 0)} onValue={value => pick(key, Number(value))} />
        </div>
      </div>
    </div>)}
    {error ? <p className={css.error} role="alert">{error}</p> : null}
  </div>
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
