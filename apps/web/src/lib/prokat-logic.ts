import { instantToWallClock, wallClockToInstant } from '@tableapp/schema'
import { bookingRangesOverlap } from './booking-rules'

export const PROKAT_ZONE = 'Europe/Moscow'

export const PROKAT_BOOKING_STATUSES = [
  'Заявка',
  'Подтверждена',
  'Выдано',
  'Возвращено',
  'Просрочен возврат',
  'Отменена',
] as const
export type ProkatBookingStatus = typeof PROKAT_BOOKING_STATUSES[number]

export const PROKAT_ITEM_STATUSES = ['Свободен', 'В прокате', 'На обслуживании', 'Списан'] as const
export type ProkatItemStatus = typeof PROKAT_ITEM_STATUSES[number]

export const PROKAT_TARIFFS = ['За час', 'За сутки', 'Выходные'] as const
export type ProkatTariff = typeof PROKAT_TARIFFS[number]

export const PROKAT_CATEGORIES = ['Велосипеды', 'SUP', 'Инструменты', 'Фототехника'] as const

/** Statuses that occupy an item on the timeline. */
export const PROKAT_BLOCKING_STATUSES = ['Заявка', 'Подтверждена', 'Выдано', 'Просрочен возврат'] as const

export const PROKAT_BOOKING_VIEWS = [
  { id: 'all', label: 'Все' },
  { id: 'todayIssue', label: 'Выдача сегодня' },
  { id: 'todayReturn', label: 'Возврат сегодня' },
  { id: 'overdue', label: 'Просрочено' },
  { id: 'request', label: 'Заявки' },
  { id: 'confirmed', label: 'Подтверждены' },
  { id: 'issued', label: 'Выдано' },
  { id: 'returned', label: 'Возвращено' },
] as const
export type ProkatBookingViewId = typeof PROKAT_BOOKING_VIEWS[number]['id']

export const PROKAT_CLIENT_STEPS = ['Заявка', 'Подтверждена', 'Выдано', 'Возвращено'] as const

export function isProkatBookingStatus(value: string): value is ProkatBookingStatus {
  return (PROKAT_BOOKING_STATUSES as readonly string[]).includes(value)
}

export function isProkatTariff(value: string): value is ProkatTariff {
  return (PROKAT_TARIFFS as readonly string[]).includes(value)
}

export function sameEmail(a: unknown, b: unknown) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
}

export function prokatRangesOverlap(left: { start: number; end: number }, right: { start: number; end: number }) {
  return bookingRangesOverlap(left, right)
}

export function nextBookingNumber(existing: readonly string[]) {
  let max = 1000
  for (const value of existing) {
    const match = /^ПР-(\d+)$/.exec(value.trim())
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `ПР-${max + 1}`
}

export function staffTransitions(from: string): ProkatBookingStatus[] {
  if (from === 'Заявка') return ['Подтверждена', 'Отменена']
  if (from === 'Подтверждена') return ['Выдано', 'Отменена']
  if (from === 'Выдано') return ['Возвращено', 'Просрочен возврат']
  if (from === 'Просрочен возврат') return ['Возвращено']
  if (from === 'Возвращено') return []
  if (from === 'Отменена') return ['Заявка']
  return []
}

export function canStaffTransition(from: string, to: string) {
  if (from === to) return true
  return staffTransitions(from).includes(to as ProkatBookingStatus)
}

export function clientCanRequestCancel(status: string) {
  return status === 'Заявка' || status === 'Подтверждена'
}

export function isOpenBooking(status: string) {
  return status !== 'Возвращено' && status !== 'Отменена'
}

export function isOverdueReturn(status: string, to: unknown, now: number) {
  if (status === 'Просрочен возврат') return true
  if (status !== 'Выдано') return false
  if (typeof to !== 'string' || !to) return false
  const at = Date.parse(to)
  return Number.isFinite(at) && at < now
}

export function formatMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value)
}

export function formatProkatDateTime(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  const wall = instantToWallClock(value, PROKAT_ZONE)
  if (!wall) return '—'
  const [year, month, day] = wall.date.split('-')
  if (!year || !month || !day) return '—'
  return `${day}.${month}.${year}, ${wall.time}`
}

export function formatProkatDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  const wall = instantToWallClock(value, PROKAT_ZONE)
  if (!wall) return '—'
  const [year, month, day] = wall.date.split('-')
  if (!year || !month || !day) return '—'
  return `${day}.${month}.${year}`
}

export function prokatInstantParts(value: string) {
  if (!value) return { date: '', time: '' }
  const wall = instantToWallClock(value, PROKAT_ZONE)
  if (!wall) return { date: '', time: '' }
  return { date: wall.date, time: wall.time }
}

export function prokatWallInstant(date: string, time: string) {
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return null
  const [hour, minute] = (time || '12:00').split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return wallClockToInstant({ year, month, day, hour: hour ?? 12, minute: minute ?? 0, second: 0 }, PROKAT_ZONE).toISOString()
}

function wallParts(ms: number) {
  return instantToWallClock(new Date(ms).toISOString(), PROKAT_ZONE)
}

function ceilHours(fromMs: number, toMs: number) {
  if (toMs <= fromMs) return 1
  return Math.max(1, Math.ceil((toMs - fromMs) / 3_600_000))
}

function calendarDaysInclusive(fromMs: number, toMs: number) {
  const start = wallParts(fromMs)
  const end = wallParts(toMs)
  if (!start || !end) return 1
  const [ys, ms, ds] = start.date.split('-').map(Number)
  const [ye, me, de] = end.date.split('-').map(Number)
  if (!ys || !ms || !ds || !ye || !me || !de) return 1
  const a = Date.UTC(ys, ms - 1, ds)
  const b = Date.UTC(ye, me - 1, de)
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1)
}

/** Count Sat+Sun civil days in Moscow that the rental covers (inclusive). */
export function weekendDaysInRange(fromMs: number, toMs: number) {
  const start = wallParts(Math.min(fromMs, toMs))
  const end = wallParts(Math.max(fromMs, toMs))
  if (!start || !end) return 0
  const [ys, ms, ds] = start.date.split('-').map(Number)
  const [ye, me, de] = end.date.split('-').map(Number)
  if (!ys || !ms || !ds || !ye || !me || !de) return 0
  let count = 0
  for (let t = Date.UTC(ys, ms - 1, ds); t <= Date.UTC(ye, me - 1, de); t += 86_400_000) {
    const day = new Date(t).getUTCDay()
    if (day === 0 || day === 6) count += 1
  }
  return count
}

export function computeRentalPrice(input: { tariff: string; rate: number; from: string | number; to: string | number }) {
  const rate = Number(input.rate)
  if (!Number.isFinite(rate) || rate < 0) return 0
  const fromMs = typeof input.from === 'number' ? input.from : Date.parse(input.from)
  const toMs = typeof input.to === 'number' ? input.to : Date.parse(input.to)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0
  if (input.tariff === 'За час') return ceilHours(fromMs, toMs) * rate
  if (input.tariff === 'Выходные') {
    const weekends = weekendDaysInRange(fromMs, toMs)
    return Math.max(1, weekends || 1) * rate
  }
  // За сутки — calendar days in Moscow, min 1
  return calendarDaysInclusive(fromMs, toMs) * rate
}

export function computeLateFee(input: { tariff: string; rate: number; to: string | number; now: string | number }) {
  const rate = Number(input.rate)
  if (!Number.isFinite(rate) || rate < 0) return 0
  const toMs = typeof input.to === 'number' ? input.to : Date.parse(input.to)
  const nowMs = typeof input.now === 'number' ? input.now : Date.parse(input.now)
  if (!Number.isFinite(toMs) || !Number.isFinite(nowMs) || nowMs <= toMs) return 0
  if (input.tariff === 'За час') return ceilHours(toMs, nowMs) * rate
  // day / weekend: ceil days overdue * rate
  return Math.max(1, Math.ceil((nowMs - toMs) / 86_400_000)) * rate
}

export type ProkatBookingConflict = {
  bookingId: string
  number: string
  itemId: string
  from: string
  to: string
}

export type ProkatBookingSpan = {
  id: string
  number?: string
  itemIds: readonly string[]
  from: string
  to: string
  status: string
}

export function findItemBookingConflict(
  existingBookings: readonly ProkatBookingSpan[],
  itemIds: readonly string[],
  from: string | number,
  to: string | number,
  excludeBookingId?: string,
): ProkatBookingConflict | null {
  const fromMs = typeof from === 'number' ? from : Date.parse(from)
  const toMs = typeof to === 'number' ? to : Date.parse(to)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || itemIds.length === 0) return null
  const wanted = new Set(itemIds)
  for (const booking of existingBookings) {
    if (excludeBookingId && booking.id === excludeBookingId) continue
    if (!(PROKAT_BLOCKING_STATUSES as readonly string[]).includes(booking.status)) continue
    const bFrom = Date.parse(booking.from)
    const bTo = Date.parse(booking.to)
    if (!Number.isFinite(bFrom) || !Number.isFinite(bTo)) continue
    if (!prokatRangesOverlap({ start: fromMs, end: toMs }, { start: bFrom, end: bTo })) continue
    const hit = booking.itemIds.find(id => wanted.has(id))
    if (!hit) continue
    return {
      bookingId: booking.id,
      number: booking.number || booking.id,
      itemId: hit,
      from: booking.from,
      to: booking.to,
    }
  }
  return null
}

export type ProkatListItem = {
  id: string
  number: string
  title: string
  clientName: string
  clientEmail: string
  staffName: string
  staffEmail: string
  status: ProkatBookingStatus | string
  from: string
  to: string
  price: number
  deposit: number
  lateFee: number
  itemIds: readonly string[]
  itemNames: readonly string[]
  updatedAt: string
}

export type ProkatCatalogItem = {
  id: string
  name: string
  category: string
  serial: string
  tariff: string
  rate: number
  deposit: number
  condition: string
  status: string
  photo?: string
}

export function prokatClientStepIndex(status: string) {
  if (status === 'Возвращено') return 3
  if (status === 'Выдано' || status === 'Просрочен возврат') return 2
  if (status === 'Подтверждена') return 1
  if (status === 'Отменена') return -1
  return 0
}

export function sameMoscowDay(iso: unknown, now: number) {
  if (typeof iso !== 'string' || !iso) return false
  const wall = instantToWallClock(iso, PROKAT_ZONE)
  const today = instantToWallClock(new Date(now).toISOString(), PROKAT_ZONE)
  return Boolean(wall && today && wall.date === today.date)
}

export function filterBookings(
  items: readonly ProkatListItem[],
  filter: { search: string; view: ProkatBookingViewId; staffEmail?: string },
  now: number,
) {
  const needle = filter.search.trim().toLowerCase()
  return items.filter(item => {
    if (filter.view === 'request' && item.status !== 'Заявка') return false
    if (filter.view === 'confirmed' && item.status !== 'Подтверждена') return false
    if (filter.view === 'issued' && item.status !== 'Выдано' && item.status !== 'Просрочен возврат') return false
    if (filter.view === 'returned' && item.status !== 'Возвращено') return false
    if (filter.view === 'todayIssue') {
      if (!sameMoscowDay(item.from, now)) return false
      if (item.status !== 'Подтверждена' && item.status !== 'Заявка') return false
    }
    if (filter.view === 'todayReturn') {
      if (!sameMoscowDay(item.to, now)) return false
      if (item.status !== 'Выдано' && item.status !== 'Просрочен возврат') return false
    }
    if (filter.view === 'overdue' && !isOverdueReturn(item.status, item.to, now)) return false
    if (filter.staffEmail === '__none__' && item.staffEmail) return false
    if (filter.staffEmail && filter.staffEmail !== '__none__' && !sameEmail(item.staffEmail, filter.staffEmail)) return false
    if (!needle) return true
    return [item.number, item.title, item.clientName, item.staffName, ...item.itemNames].join(' ').toLowerCase().includes(needle)
  }).sort((a, b) => {
    const overdueA = isOverdueReturn(a.status, a.to, now) ? 0 : 1
    const overdueB = isOverdueReturn(b.status, b.to, now) ? 0 : 1
    if (overdueA !== overdueB) return overdueA - overdueB
    return (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.id.localeCompare(b.id)
  })
}

export function prokatDashboard(
  items: readonly ProkatCatalogItem[],
  bookings: readonly ProkatListItem[],
  now: number,
) {
  const byStatus = (name: string) => bookings.filter(item => item.status === name).length
  const overdue = bookings.filter(item => isOverdueReturn(item.status, item.to, now))
  const out = bookings.filter(item => item.status === 'Выдано' || item.status === 'Просрочен возврат')
  const returnsDueToday = bookings.filter(item =>
    (item.status === 'Выдано' || item.status === 'Просрочен возврат') && sameMoscowDay(item.to, now))
  const issuesToday = bookings.filter(item =>
    (item.status === 'Заявка' || item.status === 'Подтверждена') && sameMoscowDay(item.from, now))

  const weekMs = 7 * 86_400_000
  const revenueByWeek = [0, 1, 2, 3].map(offset => {
    const end = now - offset * weekMs
    const start = end - weekMs
    const sum = bookings
      .filter(item => item.status === 'Возвращено' && item.updatedAt && Date.parse(item.updatedAt) >= start && Date.parse(item.updatedAt) < end)
      .reduce((total, item) => total + (Number.isFinite(item.price) ? item.price : 0) + (Number.isFinite(item.lateFee) ? item.lateFee : 0), 0)
    return { label: offset === 0 ? 'Эта нед.' : offset === 1 ? 'Прошл.' : `−${offset} нед.`, value: sum }
  }).reverse()

  const rentedIds = new Set(out.flatMap(booking => booking.itemIds))
  const utilisable = items.filter(item => item.status !== 'Списан')
  const utilisation = utilisable.length
    ? Math.round((utilisable.filter(item => rentedIds.has(item.id) || item.status === 'В прокате').length / utilisable.length) * 100)
    : 0

  const byCategory = new Map<string, { name: string; total: number; out: number }>()
  for (const item of utilisable) {
    const row = byCategory.get(item.category) ?? { name: item.category, total: 0, out: 0 }
    row.total += 1
    if (rentedIds.has(item.id) || item.status === 'В прокате') row.out += 1
    byCategory.set(item.category, row)
  }
  const utilisationByCategory = [...byCategory.values()].map(row => ({
    name: row.name,
    total: row.total,
    out: row.out,
    percent: row.total ? Math.round((row.out / row.total) * 100) : 0,
  })).sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, 'ru'))

  const itemHits = new Map<string, { id: string; name: string; count: number; revenue: number }>()
  for (const booking of bookings) {
    if (booking.status === 'Отменена') continue
    booking.itemIds.forEach((id, index) => {
      const name = booking.itemNames[index] || id
      const row = itemHits.get(id) ?? { id, name, count: 0, revenue: 0 }
      row.count += 1
      if (booking.status === 'Возвращено') row.revenue += (Number.isFinite(booking.price) ? booking.price : 0)
      itemHits.set(id, row)
    })
  }
  const topItems = [...itemHits.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue || a.name.localeCompare(b.name, 'ru')).slice(0, 5)

  return {
    request: byStatus('Заявка'),
    confirmed: byStatus('Подтверждена'),
    issued: byStatus('Выдано'),
    returned: byStatus('Возвращено'),
    overdueCount: overdue.length,
    cancelled: byStatus('Отменена'),
    itemsOut: out.length,
    returnsDueToday: returnsDueToday.length,
    issuesToday: issuesToday.length,
    overdue,
    returnsDueTodayList: returnsDueToday,
    issuesTodayList: issuesToday,
    utilisation,
    utilisationByCategory,
    revenueByWeek,
    topItems,
    freeItems: items.filter(item => item.status === 'Свободен').length,
    open: bookings.filter(item => isOpenBooking(item.status)).length,
  }
}
