/** Status names, transitions, deadlines and list filters for the support starter. */

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
}

export type SupportFilter = {
  search: string
  status: string
  mine: boolean
  scope: 'all' | 'open' | 'overdue' | 'waiting'
}

export function filterTickets(items: readonly SupportListItem[], filter: SupportFilter, actorEmail: string, now: number) {
  const query = filter.search.trim().toLocaleLowerCase('ru-RU')
  const mine = actorEmail.trim().toLowerCase()
  return items.filter(item => {
    if (filter.scope === 'open' && !isOpenStatus(item.status)) return false
    if (filter.scope === 'overdue' && !isOverdue(item.status, item.deadline, now)) return false
    if (filter.scope === 'waiting' && item.status !== 'Ждём клиента') return false
    if (filter.status && item.status !== filter.status) return false
    if (filter.mine && item.assigneeEmail.trim().toLowerCase() !== mine) return false
    if (!query) return true
    const haystack = [item.number, item.subject, item.description, item.clientName, item.assigneeName, item.category, item.status, item.priority].join('\n').toLocaleLowerCase('ru-RU')
    return haystack.includes(query)
  })
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
