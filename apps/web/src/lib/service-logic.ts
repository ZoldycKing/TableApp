import { instantToWallClock, wallClockToInstant } from '@tableapp/schema'

export const SERVICE_STATUSES = ['Новые', 'В работе', 'Ждём запчасти', 'Готово к выдаче', 'Выдано', 'Отменён'] as const
export type ServiceStatusName = typeof SERVICE_STATUSES[number]

export const SERVICE_REPAIR_VIEWS = [
  { id: 'all', label: 'Все' },
  { id: 'fresh', label: 'Новые' },
  { id: 'progress', label: 'В работе' },
  { id: 'parts', label: 'Ждём запчасти' },
  { id: 'ready', label: 'Готово к выдаче' },
  { id: 'done', label: 'Выдано' },
] as const

export type ServiceRepairViewId = typeof SERVICE_REPAIR_VIEWS[number]['id']

export type ServiceListItem = {
  id: string
  number: string
  device: string
  serial: string
  problem: string
  clientName: string
  masterName: string
  masterEmail: string
  status: ServiceStatusName | string
  cost: number
  deadline: string
  updatedAt: string
}

export function isServiceStatus(value: string): value is ServiceStatusName {
  return (SERVICE_STATUSES as readonly string[]).includes(value)
}

export function isOpenRepair(status: string) {
  return status !== 'Выдано' && status !== 'Отменён'
}

export function isOverdueRepair(status: string, deadline: unknown, now: number) {
  if (!isOpenRepair(status) || typeof deadline !== 'string' || !deadline) return false
  const at = Date.parse(deadline)
  return Number.isFinite(at) && at < now
}

export function sameEmail(a: unknown, b: unknown) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
}

export function nextRepairNumber(existing: readonly string[]) {
  let max = 1000
  for (const value of existing) {
    const match = /^РМ-(\d+)$/.exec(value.trim())
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `РМ-${max + 1}`
}

export function staffTransitions(from: string): ServiceStatusName[] {
  if (from === 'Новые') return ['В работе', 'Отменён']
  if (from === 'В работе') return ['Ждём запчасти', 'Готово к выдаче', 'Отменён']
  if (from === 'Ждём запчасти') return ['В работе', 'Готово к выдаче', 'Отменён']
  if (from === 'Готово к выдаче') return ['Выдано', 'В работе']
  if (from === 'Выдано') return ['В работе']
  if (from === 'Отменён') return ['Новые']
  return []
}

export function canStaffTransition(from: string, to: string) {
  if (from === to) return true
  return staffTransitions(from).includes(to as ServiceStatusName)
}

export function clientCanReply(status: string) {
  return status !== 'Отменён' && status !== 'Выдано'
}

export function serviceAuthorKind(input: { author: string; authorEmail?: string; clientName: string; clientEmail?: string }) {
  if (input.authorEmail && input.clientEmail && sameEmail(input.authorEmail, input.clientEmail)) return 'client' as const
  if (input.author && input.clientName && input.author.trim().toLowerCase() === input.clientName.trim().toLowerCase()) return 'client' as const
  return 'staff' as const
}

export function serviceAuthorLabel(kind: 'client' | 'staff') {
  return kind === 'client' ? 'Клиент' : 'Ответ клиенту'
}

export function serviceDeadlineInstant(date: string, time: string) {
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return null
  const [hour, minute] = (time || '12:00').split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return wallClockToInstant({ year, month, day, hour: hour ?? 12, minute: minute ?? 0, second: 0 }, 'Europe/Moscow').toISOString()
}

export function serviceDeadlineParts(value: string) {
  if (!value) return { date: '', time: '' }
  const wall = instantToWallClock(value, 'Europe/Moscow')
  if (!wall) return { date: '', time: '' }
  return { date: wall.date, time: wall.time }
}

export function filterRepairs(
  items: readonly ServiceListItem[],
  filter: { search: string; view: ServiceRepairViewId; masterEmail?: string },
  now: number,
) {
  const needle = filter.search.trim().toLowerCase()
  return items.filter(item => {
    if (filter.view === 'fresh' && item.status !== 'Новые') return false
    if (filter.view === 'progress' && item.status !== 'В работе') return false
    if (filter.view === 'parts' && item.status !== 'Ждём запчасти') return false
    if (filter.view === 'ready' && item.status !== 'Готово к выдаче') return false
    if (filter.view === 'done' && item.status !== 'Выдано') return false
    if (filter.masterEmail === '__none__' && item.masterEmail) return false
    if (filter.masterEmail && filter.masterEmail !== '__none__' && !sameEmail(item.masterEmail, filter.masterEmail)) return false
    if (!needle) return true
    return [item.number, item.device, item.serial, item.problem, item.clientName, item.masterName].join(' ').toLowerCase().includes(needle)
  }).sort((a, b) => {
    const overdueA = isOverdueRepair(a.status, a.deadline, now) ? 0 : 1
    const overdueB = isOverdueRepair(b.status, b.deadline, now) ? 0 : 1
    if (overdueA !== overdueB) return overdueA - overdueB
    return (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.id.localeCompare(b.id)
  })
}

export function serviceDashboard(items: readonly ServiceListItem[], now: number) {
  const byStatus = (name: string) => items.filter(item => item.status === name).length
  const overdue = items.filter(item => isOverdueRepair(item.status, item.deadline, now)).length
  const ready = byStatus('Готово к выдаче')
  const revenue = items.filter(item => item.status === 'Выдано' || item.status === 'Готово к выдаче').reduce((sum, item) => sum + (Number.isFinite(item.cost) ? item.cost : 0), 0)
  return {
    fresh: byStatus('Новые'),
    progress: byStatus('В работе'),
    parts: byStatus('Ждём запчасти'),
    ready,
    done: byStatus('Выдано'),
    cancelled: byStatus('Отменён'),
    overdue,
    revenue,
    open: items.filter(item => isOpenRepair(item.status)).length,
  }
}

export function formatMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value)
}
