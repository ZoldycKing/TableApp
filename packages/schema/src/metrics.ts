import type { BlockOf, MetricRange } from './app'
import type { Field } from './fields'
import { APP_TIME_ZONE, instantToWallClock } from './time'

/**
 * Подсчёт чисел для плиток сводки.
 *
 * Модуль чистый: на входе строки, поля и описание плитки, на выходе число
 * и сравнение с прошлым сроком. Проверяемость здесь важнее, чем где бы то ни
 * было: неверное число в сводке человек примет за правду и будет по нему
 * принимать решения.
 *
 * Сроки считаются по московскому времени — тому же, в котором человек вводит
 * даты. Иначе «за сегодня» после девяти вечера показывало бы завтрашний день.
 */

export type MetricValue = {
  value: number | null
  /** Значение за предыдущий такой же срок; null, если сравнение не запрошено. */
  previous: number | null
  /** Рост в процентах; null, когда сравнивать не с чем. */
  delta: number | null
  /** Сколько строк попало в расчёт. */
  rows: number
}

type Row = { data: Record<string, unknown> }

const DAY = 24 * 60 * 60 * 1000

/** Границы срока: начало включительно, конец исключительно. */
export type Span = { from: number; to: number }

function startOfDay(instant: Date): number {
  const wall = instantToWallClock(instant, APP_TIME_ZONE)
  if (!wall) return instant.getTime()
  // Полночь в Москве: смещение берём из самого мгновения, а не из машины.
  const [hours, minutes] = wall.time.split(':').map(Number)
  return instant.getTime() - ((hours ?? 0) * 60 + (minutes ?? 0)) * 60 * 1000
}

/**
 * Отрезок времени для срока и такой же отрезок перед ним.
 *
 * Неделя считается от понедельника, месяц и квартал — от первого числа:
 * «за месяц» для владельца значит календарный месяц, а не тридцать дней.
 */
export function spansFor(range: MetricRange, now = new Date()): { current: Span; previous: Span } | null {
  if (range === 'all') return null

  const today = startOfDay(now)
  const wall = instantToWallClock(now, APP_TIME_ZONE)
  const [year, month, day] = (wall?.date ?? '').split('-').map(Number)

  if (range === 'today') {
    return { current: { from: today, to: today + DAY }, previous: { from: today - DAY, to: today } }
  }

  if (range === 'week') {
    // Дни недели считаем по той же настенной дате, а не по часовому поясу машины.
    const weekday = (new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay() + 6) % 7
    const from = today - weekday * DAY
    return { current: { from, to: from + 7 * DAY }, previous: { from: from - 7 * DAY, to: from } }
  }

  const monthStart = (y: number, m: number) => startOfDay(new Date(Date.UTC(y, m - 1, 1, 12)))

  if (range === 'month') {
    const from = monthStart(year ?? 1970, month ?? 1)
    const next = month === 12 ? monthStart((year ?? 1970) + 1, 1) : monthStart(year ?? 1970, (month ?? 1) + 1)
    const before = month === 1 ? monthStart((year ?? 1970) - 1, 12) : monthStart(year ?? 1970, (month ?? 1) - 1)
    return { current: { from, to: next }, previous: { from: before, to: from } }
  }

  if (range === 'quarter') {
    const first = Math.floor(((month ?? 1) - 1) / 3) * 3 + 1
    const from = monthStart(year ?? 1970, first)
    const next = first + 3 > 12 ? monthStart((year ?? 1970) + 1, 1) : monthStart(year ?? 1970, first + 3)
    const before = first - 3 < 1 ? monthStart((year ?? 1970) - 1, 10) : monthStart(year ?? 1970, first - 3)
    return { current: { from, to: next }, previous: { from: before, to: from } }
  }

  const from = monthStart(year ?? 1970, 1)
  const next = monthStart((year ?? 1970) + 1, 1)
  const before = monthStart((year ?? 1970) - 1, 1)
  return { current: { from, to: next }, previous: { from: before, to: from } }
}

function instantOf(value: unknown): number | null {
  if (typeof value !== 'string' || value === '') return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function aggregate(kind: BlockOf<'metric'>['kind'], numbers: number[], rows: number): number | null {
  if (kind === 'count') return rows
  if (numbers.length === 0) return null
  if (kind === 'sum') return numbers.reduce((total, item) => total + item, 0)
  if (kind === 'avg') return numbers.reduce((total, item) => total + item, 0) / numbers.length
  if (kind === 'min') return Math.min(...numbers)
  return Math.max(...numbers)
}

function within(rows: readonly Row[], dateFieldId: string | null, span: Span | null): Row[] {
  if (!span || !dateFieldId) return [...rows]
  return rows.filter((row) => {
    const time = instantOf(row.data[dateFieldId])
    return time !== null && time >= span.from && time < span.to
  })
}

/**
 * Отбор «поле равно значению».
 *
 * Значения множественного выбора хранятся списком, поэтому для них проверяем
 * вхождение: «Статус равен Новая» должно срабатывать и там, и там.
 */
function matching(rows: readonly Row[], where: { fieldId: string; value: unknown } | null): Row[] {
  if (!where) return [...rows]
  return rows.filter((row) => {
    const value = row.data[where.fieldId]
    if (Array.isArray(value)) return value.some((item) => item === where.value)
    if (typeof where.value === 'boolean') return Boolean(value) === where.value
    return value === where.value
  })
}

/** Пусто — это отсутствие значения, пустая строка и пустой список. */
function filled(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

function valueOf(
  rows: readonly Row[],
  kind: BlockOf<'metric'>['kind'],
  fieldId: string | null,
): number | null {
  if (kind === 'count') return rows.length
  if (!fieldId) return null
  // «Сколько заполнено» считает любые значения, а не только числа:
  // так считают заполненность телефона или подписанного договора.
  if (kind === 'count_filled') return rows.filter((row) => filled(row.data[fieldId])).length
  const numbers = rows
    .map((row) => numberOf(row.data[fieldId]))
    .filter((item): item is number => item !== null)
  return aggregate(kind, numbers, rows.length)
}

/**
 * Число для плитки.
 *
 * Строки приходят уже отобранными правилом доступа и фильтром представления:
 * плитка считает ровно то, что человеку и так видно в списке, — иначе сводка
 * и список разошлись бы, и доверия к обоим не осталось.
 */
export function computeMetric(
  block: Pick<BlockOf<'metric'>, 'kind' | 'fieldId' | 'dateFieldId' | 'range' | 'compare'> & {
    where?: { fieldId: string; value: unknown } | null
  },
  rows: readonly Row[],
  now = new Date(),
): MetricValue {
  const spans = spansFor(block.range, now)
  const picked = matching(rows, block.where ?? null)
  const current = within(picked, block.dateFieldId, spans?.current ?? null)
  const value = valueOf(current, block.kind, block.fieldId)

  if (!block.compare || !spans || !block.dateFieldId) {
    return { value, previous: null, delta: null, rows: current.length }
  }

  const previous = valueOf(within(picked, block.dateFieldId, spans.previous), block.kind, block.fieldId)
  const delta =
    previous === null || previous === 0 || value === null
      ? null
      : ((value - previous) / Math.abs(previous)) * 100

  return { value, previous, delta, rows: current.length }
}

/** Счётчики по колонкам доски: сколько записей в каждом статусе. */
export function countByChoice(
  rows: readonly Row[],
  field: Field | undefined,
): { id: string; name: string; color: string; count: number }[] {
  if (!field || (field.type !== 'single_select' && field.type !== 'multi_select')) return []

  return field.options.choices.map((choice) => ({
    id: choice.id,
    name: choice.name,
    color: choice.color,
    count: rows.filter((row) => {
      const value = row.data[field.id]
      return Array.isArray(value) ? value.includes(choice.id) : value === choice.id
    }).length,
  }))
}

export const RANGE_LABELS: Record<MetricRange, string> = {
  all: 'за всё время',
  today: 'сегодня',
  week: 'на этой неделе',
  month: 'в этом месяце',
  quarter: 'в этом квартале',
  year: 'в этом году',
}

export const RANGE_COMPARE: Record<MetricRange, string> = {
  all: '',
  today: 'ко вчера',
  week: 'к прошлой неделе',
  month: 'к прошлому месяцу',
  quarter: 'к прошлому кварталу',
  year: 'к прошлому году',
}
