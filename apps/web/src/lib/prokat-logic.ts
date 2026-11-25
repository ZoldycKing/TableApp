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
  { id: 'todayIssue', label: 'Сегодня выдача' },
  { id: 'todayReturn', label: 'Сегодня возврат' },
  { id: 'overdue', label: 'Просрочены' },
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

/** Like formatMoney, but shows «0 ₽» for zero instead of «—». */
export function formatMoneyOrZero(value: number) {
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value === 0) {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(0)
  }
  return formatMoney(value)
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

export const PROKAT_LATE_FEE_MODES = ['Нет', 'Сумма за час', 'Сумма за сутки', 'Процент от тарифа за сутки'] as const
export type ProkatLateFeeMode = typeof PROKAT_LATE_FEE_MODES[number]

export function isProkatLateFeeMode(value: string): value is ProkatLateFeeMode {
  return (PROKAT_LATE_FEE_MODES as readonly string[]).includes(value)
}

export type ProkatLateFeeInput = {
  mode: string
  /** Rub/hour, rub/day, or percent depending on mode. */
  value: number
  /** Hours after planned return before fees start. Default 1. */
  graceHours?: number
  /** Daily ceiling for hourly fees (usually the item day tariff). */
  capPerDay?: number
  /** Item rental rate — used for percent-of-tariff mode. */
  rate: number
  to: string | number
  now: string | number
}

function lateFeeBillableMs(toMs: number, nowMs: number, graceHours: number) {
  const graceMs = Math.max(0, graceHours) * 3_600_000
  return nowMs - (toMs + graceMs)
}

/**
 * Server-side late fee. Grace first, then:
 * - Нет → 0
 * - Сумма за час → started hours × value, capped by capPerDay × started days
 * - Сумма за сутки → started days × value
 * - Процент от тарифа за сутки → started days × rate × (value / 100)
 */
export function computeLateFee(input: ProkatLateFeeInput) {
  const mode = isProkatLateFeeMode(input.mode) ? input.mode : 'Нет'
  if (mode === 'Нет') return 0
  const value = Number(input.value)
  const rate = Number(input.rate)
  const graceHours = Number.isFinite(input.graceHours) ? Math.max(0, Number(input.graceHours)) : 1
  const toMs = typeof input.to === 'number' ? input.to : Date.parse(input.to)
  const nowMs = typeof input.now === 'number' ? input.now : Date.parse(input.now)
  if (!Number.isFinite(toMs) || !Number.isFinite(nowMs)) return 0
  const billable = lateFeeBillableMs(toMs, nowMs, graceHours)
  if (billable <= 0) return 0
  const hours = Math.max(1, Math.ceil(billable / 3_600_000))
  const days = Math.max(1, Math.ceil(billable / 86_400_000))
  if (mode === 'Сумма за час') {
    if (!Number.isFinite(value) || value < 0) return 0
    const raw = hours * value
    const cap = Number(input.capPerDay)
    if (Number.isFinite(cap) && cap > 0) return Math.min(raw, days * cap)
    return raw
  }
  if (mode === 'Сумма за сутки') {
    if (!Number.isFinite(value) || value < 0) return 0
    return days * value
  }
  // Процент от тарифа за сутки
  if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(value) || value < 0) return 0
  return Math.round(days * rate * (value / 100))
}

/** Plain-Russian formula for staff overdue cards and item settings. */
export function describeLateFee(input: {
  mode: string
  value: number
  graceHours?: number
  capPerDay?: number
  rate?: number
}) {
  const mode = isProkatLateFeeMode(input.mode) ? input.mode : 'Нет'
  const grace = Number.isFinite(input.graceHours) ? Math.max(0, Number(input.graceHours)) : 1
  const graceLabel = grace === 0 ? 'без льготного времени' : grace === 1 ? '1 час льготы' : `${grace} ч льготы`
  if (mode === 'Нет') return 'Штраф не начисляется'
  if (mode === 'Сумма за час') {
    const cap = Number(input.capPerDay)
    const base = `${graceLabel}, затем ${formatMoney(input.value)}/час`
    if (Number.isFinite(cap) && cap > 0) return `${base}, не больше ${formatMoney(cap)} в сутки`
    return base
  }
  if (mode === 'Сумма за сутки') return `${graceLabel}, затем ${formatMoney(input.value)} за сутки просрочки`
  const rate = Number(input.rate)
  const percent = Number(input.value)
  const ofTariff = Number.isFinite(rate) && rate > 0
    ? `${percent}% от тарифа (${formatMoney(rate)}) за сутки`
    : `${percent}% от тарифа за сутки`
  return `${graceLabel}, затем ${ofTariff}`
}

/** «Елена Волкова» → «Елена В.»; single token stays as-is. */
export function shortClientName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'Без имени'
  if (parts.length === 1) return parts[0]!
  const last = parts[parts.length - 1]!
  const initial = [...last][0] ?? ''
  return initial ? `${parts[0]} ${initial}.` : parts[0]!
}

/** Initials for a tight timeline bar: «Мария Петрова» → «МП». */
export function clientInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  if (parts.length === 1) return ([...parts[0]!][0] ?? '—').toUpperCase()
  const first = [...parts[0]!][0] ?? ''
  const last = [...parts[parts.length - 1]!][0] ?? ''
  return `${first}${last}`.toUpperCase() || '—'
}

/** Bar caption: client short name only (booking number lives in the tip). */
export function timelineBarLabel(_number: string, clientName: string) {
  return shortClientName(clientName)
}

export const PROKAT_TIMELINE_RANGES = [
  { id: 'day', label: 'День', days: 1 },
  { id: 'week', label: 'Неделя', days: 7 },
  { id: 'fortnight', label: '2 недели', days: 14 },
  { id: 'month', label: 'Месяц', days: 30 },
] as const
export type ProkatTimelineRangeId = typeof PROKAT_TIMELINE_RANGES[number]['id']

/** Day-mode hour window (Moscow wall clock). */
export const PROKAT_DAY_HOUR_START = 8
export const PROKAT_DAY_HOUR_END = 22

export type TimelineBarTone = 'request' | 'confirmed' | 'issued' | 'overdue'

export type TimelineBarSegment = {
  left: number
  width: number
  tone: TimelineBarTone
  /** True when the real start is before the visible range. */
  clippedStart: boolean
  /** True when the real end is after the visible range. */
  clippedEnd: boolean
  kind: 'booking' | 'overdue-tail'
}

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function addCivilDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  const stamp = Date.UTC(year, month - 1, day + days)
  return new Date(stamp).toISOString().slice(0, 10)
}

function isWeekendCivil(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return false
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 || weekday === 6
}

/** Lookback so overdue bookings stay visible when jumping to «Сегодня». */
export function timelineLookbackDays(mode: ProkatTimelineRangeId) {
  if (mode === 'day') return 0
  if (mode === 'week') return 1
  if (mode === 'fortnight') return 3
  return 5
}

export function timelineToneForStatus(status: string, overdue: boolean): TimelineBarTone {
  if (overdue) return 'overdue'
  if (status === 'Заявка') return 'request'
  if (status === 'Выдано' || status === 'Просрочен возврат') return 'issued'
  return 'confirmed'
}

/**
 * Maps a half-open [from, to] instant range onto the visible timeline as a %.
 * Returns null when fully outside the window. Width follows real duration (no day floor).
 */
export function timelineSegmentPct(
  fromMs: number,
  toMs: number,
  rangeStart: number,
  rangeEnd: number,
): Omit<TimelineBarSegment, 'tone' | 'kind'> | null {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || !Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) {
    return null
  }
  const span = rangeEnd - rangeStart
  if (span <= 0 || toMs <= rangeStart || fromMs >= rangeEnd) return null
  const leftMs = Math.max(fromMs, rangeStart)
  const rightMs = Math.min(toMs, rangeEnd)
  if (rightMs <= leftMs) return null
  const left = clampPct(((leftMs - rangeStart) / span) * 100)
  const right = clampPct(((rightMs - rangeStart) / span) * 100)
  const width = Math.max(0.35, right - left)
  return {
    left,
    width: Math.min(width, 100 - left),
    clippedStart: fromMs < rangeStart,
    clippedEnd: toMs > rangeEnd,
  }
}

/**
 * Planned booking bar + optional hatched overdue tail (planned end → now).
 * Tail only when the booking is overdue and the planned end is before now.
 */
export function timelineBookingSegments(input: {
  from: string | number
  to: string | number
  status: string
  now: number
  rangeStart: number
  rangeEnd: number
}): { booking: TimelineBarSegment | null; overdueTail: TimelineBarSegment | null } {
  const fromMs = typeof input.from === 'number' ? input.from : Date.parse(input.from)
  const toMs = typeof input.to === 'number' ? input.to : Date.parse(input.to)
  const overdue = isOverdueReturn(input.status, input.to, input.now)
  // Planned interval follows status colour; «Просрочен возврат» is solid terracotta.
  // Hatched terracotta is reserved for the overdue tail past the planned end.
  const bookingTone: TimelineBarTone = input.status === 'Просрочен возврат'
    ? 'overdue'
    : timelineToneForStatus(input.status, false)
  const plannedEnd = Number.isFinite(toMs) ? toMs : fromMs
  const bookingPct = timelineSegmentPct(fromMs, plannedEnd, input.rangeStart, input.rangeEnd)
  const booking: TimelineBarSegment | null = bookingPct
    ? { ...bookingPct, tone: bookingTone, kind: 'booking' }
    : null

  let overdueTail: TimelineBarSegment | null = null
  if (overdue && Number.isFinite(toMs) && toMs < input.now) {
    const tailPct = timelineSegmentPct(toMs, input.now, input.rangeStart, input.rangeEnd)
    if (tailPct) overdueTail = { ...tailPct, tone: 'overdue', kind: 'overdue-tail' }
  }
  return { booking, overdueTail }
}

export type TimelineColumn = {
  key: string
  label: string
  today: boolean
  weekend: boolean
}

/** Build the visible window for the staff occupancy board. */
export function buildTimelineWindow(input: {
  mode: ProkatTimelineRangeId
  /** First civil day of the window (Moscow YYYY-MM-DD). */
  startDate: string
  now: number
}): {
  rangeStart: number
  rangeEnd: number
  columns: TimelineColumn[]
  /** 0–100 position of «now» inside the window, or null if outside. */
  nowPct: number | null
  todayKey: string
} {
  const todayWall = instantToWallClock(new Date(input.now).toISOString(), PROKAT_ZONE)
  const todayKey = todayWall?.date ?? input.startDate

  if (input.mode === 'day') {
    const rangeStart = Date.parse(`${input.startDate}T${String(PROKAT_DAY_HOUR_START).padStart(2, '0')}:00:00+03:00`)
    const rangeEnd = Date.parse(`${input.startDate}T${String(PROKAT_DAY_HOUR_END).padStart(2, '0')}:00:00+03:00`)
    const hours = PROKAT_DAY_HOUR_END - PROKAT_DAY_HOUR_START
    const columns: TimelineColumn[] = []
    for (let index = 0; index < hours; index += 1) {
      const hour = PROKAT_DAY_HOUR_START + index
      const label = `${String(hour).padStart(2, '0')}:00`
      columns.push({
        key: `${input.startDate}T${label}`,
        label: hour % 2 === 0 ? label : '',
        today: input.startDate === todayKey,
        weekend: isWeekendCivil(input.startDate),
      })
    }
    const span = Math.max(1, rangeEnd - rangeStart)
    const nowPct = input.now >= rangeStart && input.now <= rangeEnd
      ? clampPct(((input.now - rangeStart) / span) * 100)
      : null
    return { rangeStart, rangeEnd, columns, nowPct, todayKey }
  }

  const days = PROKAT_TIMELINE_RANGES.find(item => item.id === input.mode)?.days ?? 14
  const columns: TimelineColumn[] = []
  for (let index = 0; index < days; index += 1) {
    const iso = addCivilDays(input.startDate, index)
    const [, month, day] = iso.split('-')
    columns.push({
      key: iso,
      label: `${day}.${month}`,
      today: iso === todayKey,
      weekend: isWeekendCivil(iso),
    })
  }
  const last = columns[columns.length - 1]?.key ?? input.startDate
  const rangeStart = Date.parse(`${columns[0]!.key}T00:00:00+03:00`)
  const rangeEnd = Date.parse(`${last}T23:59:59.999+03:00`)
  const span = Math.max(1, rangeEnd - rangeStart)
  const nowPct = input.now >= rangeStart && input.now <= rangeEnd
    ? clampPct(((input.now - rangeStart) / span) * 100)
    : null
  return { rangeStart, rangeEnd, columns, nowPct, todayKey }
}

export function shiftTimelineStart(startDate: string, mode: ProkatTimelineRangeId, direction: -1 | 1) {
  const days = mode === 'day' ? 1 : (PROKAT_TIMELINE_RANGES.find(item => item.id === mode)?.days ?? 7)
  return addCivilDays(startDate, days * direction)
}

export function timelineStartForToday(mode: ProkatTimelineRangeId, now: number) {
  const wall = instantToWallClock(new Date(now).toISOString(), PROKAT_ZONE)
  const today = wall?.date ?? new Date(now).toISOString().slice(0, 10)
  return addCivilDays(today, -timelineLookbackDays(mode))
}

/** Public catalogue line: «Свободен сейчас» / «Свободен с 28.11». */
export function catalogItemFreeLabel(
  item: Pick<ProkatCatalogItem, 'id' | 'status' | 'busyUntil'>,
  spans: readonly ProkatBookingSpan[],
  now: number,
): string {
  if (item.status === 'На обслуживании') return 'На обслуживании'
  if (item.status === 'Списан') return 'Недоступен'

  let busyEnd = 0
  for (const span of spans) {
    if (!(PROKAT_BLOCKING_STATUSES as readonly string[]).includes(span.status)) continue
    if (!span.itemIds.includes(item.id)) continue
    const from = Date.parse(span.from)
    const to = Date.parse(span.to)
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue
    const end = isOverdueReturn(span.status, span.to, now) ? Math.max(to, now) : to
    if (from < now && end > now) busyEnd = Math.max(busyEnd, end)
  }
  if (item.busyUntil) {
    const until = Date.parse(item.busyUntil)
    if (Number.isFinite(until) && until > now) busyEnd = Math.max(busyEnd, until)
  }
  if (busyEnd <= now) {
    if (item.status === 'В прокате') return 'Занят'
    return 'Свободен сейчас'
  }
  const wall = instantToWallClock(new Date(busyEnd).toISOString(), PROKAT_ZONE)
  if (!wall) return 'Свободен сейчас'
  const [, month, day] = wall.date.split('-')
  return `Свободен с ${day}.${month}`
}

/** @deprecated Prefer computeLateFee with explicit mode; kept for older call sites during migration. */
export function computeLateFeeFromTariff(input: { tariff: string; rate: number; to: string | number; now: string | number }) {
  const rate = Number(input.rate)
  if (!Number.isFinite(rate) || rate < 0) return 0
  // Legacy fallback: day/weekend → 100%/day of rate; hourly → rate/hour. No grace.
  if (input.tariff === 'За час') {
    return computeLateFee({ mode: 'Сумма за час', value: rate, graceHours: 0, rate, to: input.to, now: input.now })
  }
  return computeLateFee({ mode: 'Процент от тарифа за сутки', value: 100, graceHours: 0, rate, to: input.to, now: input.now })
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

/** Conflicting booking end instant for an item in [from, to], or null if free. */
export function itemBusyUntil(
  spans: readonly ProkatBookingSpan[],
  itemId: string,
  from: string | number,
  to: string | number,
): string | null {
  return findItemBookingConflict(spans, [itemId], from, to)?.to ?? null
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
  /** When false, the item stays in staff inventory but is hidden from the client catalogue. */
  showInCatalog?: boolean
  lateFeeMode?: string
  lateFeeValue?: number
  lateFeeGraceHours?: number
  lateFeeCapPerDay?: number
  /** Public «занят до» for client catalogue without exposing foreign bookings. */
  busyUntil?: string
}

export function itemLateFeeConfig(item: Pick<ProkatCatalogItem, 'lateFeeMode' | 'lateFeeValue' | 'lateFeeGraceHours' | 'lateFeeCapPerDay' | 'rate' | 'category'>) {
  const mode = item.lateFeeMode && isProkatLateFeeMode(item.lateFeeMode)
    ? item.lateFeeMode
    : defaultLateFeeModeForCategory(item.category)
  const value = Number.isFinite(item.lateFeeValue) ? Number(item.lateFeeValue) : defaultLateFeeValueForCategory(item.category)
  const graceHours = Number.isFinite(item.lateFeeGraceHours) ? Number(item.lateFeeGraceHours) : 1
  const cap = Number(item.lateFeeCapPerDay)
  return {
    mode,
    value,
    graceHours,
    capPerDay: Number.isFinite(cap) && cap > 0 ? cap : undefined,
    rate: item.rate,
  }
}

export function defaultLateFeeModeForCategory(category: string): ProkatLateFeeMode {
  if (category === 'SUP') return 'Сумма за час'
  if (category === 'Велосипеды' || category === 'Инструменты' || category === 'Фототехника') return 'Процент от тарифа за сутки'
  return 'Нет'
}

export function defaultLateFeeValueForCategory(category: string) {
  if (category === 'SUP') return 500
  if (category === 'Велосипеды') return 20
  if (category === 'Инструменты' || category === 'Фототехника') return 100
  return 0
}

export function computeItemLateFee(
  item: Pick<ProkatCatalogItem, 'lateFeeMode' | 'lateFeeValue' | 'lateFeeGraceHours' | 'lateFeeCapPerDay' | 'rate' | 'category'>,
  to: string | number,
  now: string | number,
) {
  const config = itemLateFeeConfig(item)
  return computeLateFee({ ...config, to, now })
}

/** Busy end for [from, to]: booking span first, else public item.busyUntil / service hold. */
export function catalogItemBusyUntil(
  spans: readonly ProkatBookingSpan[],
  item: Pick<ProkatCatalogItem, 'id' | 'status' | 'busyUntil'>,
  from: string | number,
  to: string | number,
): string | null {
  const fromSpan = itemBusyUntil(spans, item.id, from, to)
  if (fromSpan) return fromSpan
  if (item.status === 'На обслуживании') return item.busyUntil || 'service'
  if (item.status !== 'В прокате' || !item.busyUntil) return null
  const fromMs = typeof from === 'number' ? from : Date.parse(from)
  const toMs = typeof to === 'number' ? to : Date.parse(to)
  const busyEnd = Date.parse(item.busyUntil)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || !Number.isFinite(busyEnd)) return null
  // Currently rented: blocked from −∞ until busyUntil.
  if (fromMs < busyEnd && toMs > fromMs) return item.busyUntil
  return null
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
