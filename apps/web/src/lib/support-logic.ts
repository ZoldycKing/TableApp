/** Status names, transitions, deadlines and list filters for the support starter. */
import { instantToWallClock, wallClockToInstant } from '@tableapp/schema'
import { supportQueueMatch, supportSlaView, type SupportQueueScope, type SupportSlaView } from './support-sla'
export type { SupportQueueScope }

/** Wall clock for ticket deadlines. Moscow has no daylight-saving shift. */
export const SUPPORT_DEADLINE_ZONE = 'Europe/Moscow'

export const SUPPORT_STATUS_NAMES = ['Новое', 'В работе', 'Ждём клиента', 'Решено', 'Закрыто'] as const
export type SupportStatusName = (typeof SUPPORT_STATUS_NAMES)[number]

const OPERATOR_NEXT: Record<SupportStatusName, readonly SupportStatusName[]> = {
  'Новое': ['В работе', 'Закрыто'],
  'В работе': ['Ждём клиента', 'Решено', 'Закрыто'],
  'Ждём клиента': ['В работе', 'Решено', 'Закрыто'],
  'Решено': ['В работе', 'Закрыто'],
  'Закрыто': ['В работе'],
}

export function isSupportStatus(value: string): value is SupportStatusName {
  return (SUPPORT_STATUS_NAMES as readonly string[]).includes(value)
}

export function isOpenStatus(status: string) {
  return status !== 'Решено' && status !== 'Закрыто'
}

export function deadlineTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

/** `ГГГГ-ММ-ДД` and `ЧЧ:ММ` in Moscow → an ISO instant. Empty date clears the deadline. */
export function supportDeadlineInstant(date: string, time: string): string | null {
  if (!date.trim()) return null
  const [year, month, day] = date.split('-').map(Number)
  const clock = /^(\d{2}):(\d{2})$/.exec(time.trim())
  const hour = clock ? Number(clock[1]) : 18
  const minute = clock ? Number(clock[2]) : 0
  if (!year || !month || !day || month > 12 || day > 31 || hour > 23 || minute > 59) return null
  return wallClockToInstant({ year, month, day, hour, minute, second: 0 }, SUPPORT_DEADLINE_ZONE).toISOString()
}

/** Instant → the same Moscow date and 24-hour time the form edits. */
export function supportDeadlineParts(value: unknown): { date: string; time: string } {
  if (typeof value !== 'string' || !value.trim()) return { date: '', time: '' }
  const wall = instantToWallClock(value, SUPPORT_DEADLINE_ZONE)
  return wall ?? { date: '', time: '' }
}

/** Open tickets past the deadline. Resolved and closed tickets are not overdue. */
export function isOverdue(status: string, deadline: unknown, now: number) {
  if (!isOpenStatus(status)) return false
  const time = deadlineTime(deadline)
  return time != null && time < now
}

export function operatorTransitions(status: string): SupportStatusName[] {
  return isSupportStatus(status) ? [...OPERATOR_NEXT[status]] : []
}

export function canOperatorTransition(from: string, to: string) {
  return isSupportStatus(to) && operatorTransitions(from).includes(to)
}

/** A client reply returns a waiting, resolved or closed ticket to work. Other statuses stay. */
export function statusAfterClientReply(status: string): SupportStatusName | null {
  if (!isSupportStatus(status)) return null
  if (status === 'Ждём клиента' || status === 'Решено' || status === 'Закрыто') return 'В работе'
  return status
}

export function clientCanReply(status: string) {
  return isSupportStatus(status)
}

export type SupportListItem = {
  id: string
  number: string
  subject: string
  description: string
  clientName: string
  status: string
  priority: string
  category: string
  assigneeEmail: string
  assigneeName: string
  deadline: unknown
  createdAt?: unknown
  updatedAt?: unknown
  sla?: SupportSlaView
}

export type SupportAgeBucket = 'lt4h' | '4to12h' | '12to24h' | '1to3d' | 'gt3d'

export const SUPPORT_AGE_BUCKETS: { id: SupportAgeBucket; label: string }[] = [
  { id: 'lt4h', label: 'до 4 ч' },
  { id: '4to12h', label: '4–12 ч' },
  { id: '12to24h', label: '12–24 ч' },
  { id: '1to3d', label: '1–3 дня' },
  { id: 'gt3d', label: 'больше 3 дней' },
]

export function supportAgeBucket(ageMs: number): SupportAgeBucket {
  if (ageMs < 4 * 3_600_000) return 'lt4h'
  if (ageMs < 12 * 3_600_000) return '4to12h'
  if (ageMs < 24 * 3_600_000) return '12to24h'
  if (ageMs < 3 * 24 * 3_600_000) return '1to3d'
  return 'gt3d'
}

/** Saved list views on the operator «Тикеты» page. Stable ids go into the URL. */
export const SUPPORT_TICKET_VIEWS = [
  { id: 'open', label: 'Все открытые', scope: 'open' as const },
  { id: 'mine', label: 'Мои', scope: 'mine' as const },
  { id: 'unassigned', label: 'Без ответственного', scope: 'unassigned' as const },
  { id: 'hot', label: 'Горит по сроку', scope: 'hot' as const },
  { id: 'waiting', label: 'Ждём клиента', scope: 'waiting' as const },
  { id: 'closed', label: 'Закрытые', scope: 'closed' as const },
] as const

export type SupportTicketViewId = (typeof SUPPORT_TICKET_VIEWS)[number]['id']

export function supportTicketViewId(value: string | null | undefined): SupportTicketViewId {
  return SUPPORT_TICKET_VIEWS.some(view => view.id === value) ? value as SupportTicketViewId : 'open'
}

export function supportTicketViewScope(view: SupportTicketViewId): SupportQueueScope {
  return SUPPORT_TICKET_VIEWS.find(item => item.id === view)?.scope ?? 'open'
}

/** Status chips that still make sense inside a saved view. */
export function supportStatusesForView(view: SupportTicketViewId): string[] {
  if (view === 'waiting') return ['Ждём клиента']
  if (view === 'closed') return ['Решено', 'Закрыто']
  if (view === 'open' || view === 'unassigned' || view === 'hot') return ['Новое', 'В работе', 'Ждём клиента']
  return ['Новое', 'В работе', 'Ждём клиента', 'Решено', 'Закрыто']
}

export type SupportFilter = {
  search: string
  /** Multi-select status names. Empty = any status allowed by the view. */
  statuses: string[]
  /** Multi-select priority names. Empty = any priority. */
  priorities: string[]
  ageBucket?: SupportAgeBucket | ''
  /** Empty = any assignee. `__none__` = unassigned. Otherwise operator email. */
  assigneeEmail?: string
  mine: boolean
  scope: SupportQueueScope
  view?: SupportTicketViewId
}

export type SupportQueueFocus = {
  scope?: SupportQueueScope
  view?: SupportTicketViewId
  priority?: string
  ageBucket?: SupportAgeBucket
  assigneeEmail?: string
}

export function filterTickets(items: readonly SupportListItem[], filter: SupportFilter, actorEmail: string, now: number) {
  const query = filter.search.trim().toLocaleLowerCase('ru-RU')
  const mine = actorEmail.trim().toLowerCase()
  const assignee = (filter.assigneeEmail ?? '').trim().toLowerCase()
  return items.filter(item => {
    const manualOverdue = isOverdue(item.status, item.deadline, now)
    const sla = item.sla ?? supportSlaView([], null, now)
    if (!supportQueueMatch({ status: item.status, assigneeEmail: item.assigneeEmail, sla, manualOverdue }, filter.scope, mine)) return false
    if (filter.statuses.length && !filter.statuses.includes(item.status)) return false
    if (filter.priorities.length && !filter.priorities.includes(item.priority)) return false
    if (filter.ageBucket) {
      if (!sla.known || !sla.open || sla.createdAt == null) return false
      if (supportAgeBucket(Math.max(0, now - sla.createdAt)) !== filter.ageBucket) return false
    }
    if (assignee === '__none__') {
      if (item.assigneeEmail.trim()) return false
    } else if (assignee && item.assigneeEmail.trim().toLowerCase() !== assignee) return false
    if (filter.mine && item.assigneeEmail.trim().toLowerCase() !== mine) return false
    if (!query) return true
    const haystack = [item.number, item.subject, item.description, item.clientName, item.assigneeName, item.category, item.status, item.priority].join('\n').toLocaleLowerCase('ru-RU')
    return haystack.includes(query)
  })
}

/** Map a dashboard KPI / heatmap click onto a tickets view (+ optional filters). */
export function supportFocusToFilter(focus: SupportQueueFocus | SupportQueueScope): Pick<SupportFilter, 'scope' | 'view' | 'priorities' | 'ageBucket' | 'assigneeEmail' | 'mine'> {
  const next = typeof focus === 'string' ? { scope: focus } : focus
  const scope = next.scope ?? (next.view ? supportTicketViewScope(next.view) : 'open')
  let view: SupportTicketViewId = next.view ?? 'open'
  if (!next.view) {
    if (scope === 'mine') view = 'mine'
    else if (scope === 'unassigned') view = 'unassigned'
    else if (scope === 'waiting') view = 'waiting'
    else if (scope === 'closed') view = 'closed'
    else if (scope === 'overdue' || scope === 'risk' || scope === 'hot') view = 'hot'
    else if (scope === 'open' || scope === 'all') view = 'open'
  }
  return {
    view,
    scope: supportTicketViewScope(view),
    priorities: next.priority ? [next.priority] : [],
    ageBucket: next.ageBucket ?? '',
    assigneeEmail: next.assigneeEmail ?? '',
    mine: false,
  }
}

export function supportSummary(items: readonly { status: string; deadline: unknown }[], now: number) {
  let open = 0
  let overdue = 0
  let waiting = 0
  for (const item of items) {
    if (item.status === 'Ждём клиента') waiting += 1
    if (!isOpenStatus(item.status)) continue
    open += 1
    if (isOverdue(item.status, item.deadline, now)) overdue += 1
  }
  return { open, overdue, waiting }
}

export function nextTicketNumber(existing: readonly string[]) {
  let max = 1000
  for (const value of existing) {
    const match = /^ОБР-(\d+)$/.exec(value.trim())
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `ОБР-${max + 1}`
}

export function sameEmail(left: unknown, right: unknown) {
  return typeof left === 'string' && typeof right === 'string' && left.trim().toLowerCase() === right.trim().toLowerCase() && left.trim() !== ''
}

/** Who wrote a public message. Email wins when both sides have it; otherwise the client name. Width and theme do not matter. */
export function supportAuthorKind(input: { author: string; authorEmail?: string; clientName: string; clientEmail?: string }): 'client' | 'operator' {
  const authorEmail = (input.authorEmail ?? '').trim().toLowerCase()
  const clientEmail = (input.clientEmail ?? '').trim().toLowerCase()
  if (authorEmail && clientEmail && authorEmail === clientEmail) return 'client'
  const author = input.author.trim()
  const clientName = input.clientName.trim()
  if (author && clientName && author.localeCompare(clientName, 'ru', { sensitivity: 'accent' }) === 0) return 'client'
  return 'operator'
}

export function supportAuthorLabel(kind: 'client' | 'operator') {
  return kind === 'client' ? 'Клиент' : 'Ответ клиенту'
}
