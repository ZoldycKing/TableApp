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

export const SERVICE_CLIENT_STEPS = ['Принят', 'Диагностика', 'Ремонт', 'Готов к выдаче', 'Выдан'] as const

export const SERVICE_PICKUP = {
  address: 'Москва, ул. Сервисная, 12',
  hours: 'Пн–Сб 10:00–20:00, Вс выходной',
  phone: '+7 495 120-40-40',
} as const

export type ServiceApprovalName = 'Не требуется' | 'На согласовании' | 'Согласовано'

export type ServiceLineItem = {
  name: string
  qty: number
  price: number
  kind: 'work' | 'part'
}

export type ServiceDeadlineCountdown = {
  known: boolean
  label: string
  shortLabel: string
  tone: 'sage' | 'amber' | 'overdue' | 'ready' | 'neutral'
}

export type ServiceListItem = {
  id: string
  number: string
  device: string
  serial: string
  problem: string
  clientName: string
  masterName: string
  masterEmail: string
  masterPhoto?: string
  status: ServiceStatusName | string
  cost: number
  deadline: string
  updatedAt: string
  approval?: ServiceApprovalName | string
  partsEta?: string
  lines?: ServiceLineItem[]
}

export function isServiceStatus(value: string): value is ServiceStatusName {
  return (SERVICE_STATUSES as readonly string[]).includes(value)
}

export function isOpenRepair(status: string) {
  return status !== 'Выдано' && status !== 'Отменён'
}

/** Overdue applies to open repairs still in the shop — not to ready-for-pickup. */
export function isOverdueRepair(status: string, deadline: unknown, now: number) {
  if (status === 'Готово к выдаче' || status === 'Выдано' || status === 'Отменён') return false
  if (!isOpenRepair(status) || typeof deadline !== 'string' || !deadline) return false
  const at = Date.parse(deadline)
  return Number.isFinite(at) && at < now
}

/** Ready-for-pickup never uses repair overdue/remaining — only «Ждёт выдачи». */
export function waitingPickupDays(status: string, deadline: unknown, now: number) {
  if (status !== 'Готово к выдаче') return null
  if (typeof deadline !== 'string' || !deadline) return 0
  const at = Date.parse(deadline)
  if (!Number.isFinite(at)) return 0
  if (at >= now) return 0
  return Math.max(1, Math.ceil((now - at) / 86_400_000))
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

function formatDurationRu(ms: number) {
  const totalMinutes = Math.max(1, Math.round(Math.abs(ms) / 60_000))
  if (totalMinutes < 60) return `${totalMinutes} мин`
  const hours = Math.floor(totalMinutes / 60)
  if (hours < 24) {
    const minutes = totalMinutes % 60
    return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`
  }
  const days = Math.floor(hours / 24)
  return `${days} дн`
}

/** Deadline chip for lists/headers — sage / amber / terracotta overdue; ready uses muted pickup wait. */
export function serviceDeadlineCountdown(status: string, deadline: unknown, now: number): ServiceDeadlineCountdown {
  const pickup = waitingPickupDays(status, deadline, now)
  if (pickup != null) {
    const label = pickup > 0 ? `Ждёт выдачи ${pickup} дн` : 'Ждёт выдачи'
    const shortLabel = pickup > 0 ? `Ждёт выдачи ${pickup} дн` : 'Ждёт выдачи'
    return { known: true, label, shortLabel, tone: 'ready' }
  }
  if (status === 'Выдано' || status === 'Отменён' || typeof deadline !== 'string' || !deadline) {
    return { known: false, label: '', shortLabel: '', tone: 'neutral' }
  }
  const at = Date.parse(deadline)
  if (!Number.isFinite(at)) return { known: false, label: '', shortLabel: '', tone: 'neutral' }
  const remaining = at - now
  if (remaining <= 0) {
    const late = formatDurationRu(-remaining)
    return { known: true, label: `Просрочено ${late}`, shortLabel: `Просрочено ${late}`, tone: 'overdue' }
  }
  const label = `Осталось ${formatDurationRu(remaining)}`
  const short = remaining < 86_400_000
    ? `Осталось ${formatDurationRu(remaining)}`
    : `Осталось ${Math.ceil(remaining / 86_400_000)} дн`
  const amber = remaining < 3_600_000 || remaining <= 86_400_000 * 0.25
  return { known: true, label, shortLabel: short, tone: amber ? 'amber' : 'sage' }
}

export function parseServiceLines(raw: unknown): ServiceLineItem[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const row = item as Record<string, unknown>
      const name = String(row.name ?? '').trim()
      const qty = Number(row.qty)
      const price = Number(row.price)
      if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) return []
      return [{ name, qty, price, kind: row.kind === 'work' ? 'work' as const : 'part' as const }]
    })
  } catch {
    return []
  }
}

export function encodeServiceLines(lines: readonly ServiceLineItem[]) {
  return JSON.stringify(lines)
}

export function serviceLinesTotal(lines: readonly ServiceLineItem[]) {
  return lines.reduce((sum, line) => sum + line.qty * line.price, 0)
}

export function serviceClientStepIndex(status: string, diagnosis: string) {
  if (status === 'Выдано') return 4
  if (status === 'Готово к выдаче') return 3
  if (status === 'Отменён') return -1
  if (status === 'Новые') return 0
  if (status === 'В работе' || status === 'Ждём запчасти') return diagnosis.trim() ? 2 : 1
  return 0
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
  const needsApproval = items.filter(item => item.approval === 'На согласовании')
  const waitingParts = items.filter(item => item.status === 'Ждём запчасти')
  const masterLoad = new Map<string, { name: string; email: string; photo?: string; open: number }>()
  for (const item of items) {
    if (!isOpenRepair(item.status) || item.status === 'Готово к выдаче') continue
    if (!item.masterEmail) continue
    const key = item.masterEmail.toLowerCase()
    const row = masterLoad.get(key) ?? { name: item.masterName || item.masterEmail, email: item.masterEmail, photo: item.masterPhoto, open: 0 }
    row.open += 1
    if (!row.photo && item.masterPhoto) row.photo = item.masterPhoto
    masterLoad.set(key, row)
  }
  const weekMs = 7 * 86_400_000
  const revenueByWeek = [0, 1, 2, 3].map(offset => {
    const end = now - offset * weekMs
    const start = end - weekMs
    const sum = items
      .filter(item => item.status === 'Выдано' && item.updatedAt && Date.parse(item.updatedAt) >= start && Date.parse(item.updatedAt) < end)
      .reduce((total, item) => total + (Number.isFinite(item.cost) ? item.cost : 0), 0)
    return { label: offset === 0 ? 'Эта нед.' : offset === 1 ? 'Прошл.' : `−${offset} нед.`, value: sum }
  }).reverse()
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
    needsApproval,
    waitingParts,
    masters: [...masterLoad.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, 'ru')),
    revenueByWeek,
  }
}

export function formatMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value)
}
