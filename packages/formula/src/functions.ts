import { FormulaError } from './ast'
import type { Value } from './values'
import { fromDate, isBlankValue, toBool, toDate, toNumber, toText } from './values'

export type EvalContext = {
  /** Значения ячеек текущей строки по id поля. */
  values: Record<string, unknown>
  /** Фиксируется на весь пересчёт: TODAY() и NOW() в одной формуле согласованы. */
  now: Date
  timeZone: string
}

export type FormulaFunction = {
  minArgs: number
  maxArgs: number
  /** Аргументы IF вычисляются лениво: невыбранная ветка не должна падать. */
  lazy?: boolean
  call: (args: Value[], ctx: EvalContext) => Value
}

const DATE_UNITS: Record<string, string> = {
  ms: 'ms', milliseconds: 'ms',
  s: 'seconds', sec: 'seconds', seconds: 'seconds', 'секунды': 'seconds',
  m: 'minutes', min: 'minutes', minutes: 'minutes', 'минуты': 'minutes',
  h: 'hours', hours: 'hours', 'часы': 'hours',
  d: 'days', days: 'days', 'дни': 'days', 'день': 'days',
  w: 'weeks', weeks: 'weeks', 'недели': 'weeks',
  mo: 'months', months: 'months', 'месяцы': 'months', 'месяц': 'months',
  y: 'years', years: 'years', 'годы': 'years', 'год': 'years',
}

function unitOf(raw: Value): string {
  const key = toText(raw).trim().toLowerCase()
  const unit = DATE_UNITS[key]
  if (!unit) throw new FormulaError(`Неизвестная единица времени «${key}»`)
  return unit
}

function shift(date: Date, amount: number, unit: string): Date {
  const next = new Date(date.getTime())
  switch (unit) {
    case 'ms': next.setTime(next.getTime() + amount); break
    case 'seconds': next.setTime(next.getTime() + amount * 1000); break
    case 'minutes': next.setTime(next.getTime() + amount * 60000); break
    case 'hours': next.setTime(next.getTime() + amount * 3600000); break
    case 'days': next.setTime(next.getTime() + amount * 86400000); break
    case 'weeks': next.setTime(next.getTime() + amount * 604800000); break
    // 31 января плюс месяц — это 28 (или 29) февраля, а не 3 марта.
    // Без этого сроки оплаты и напоминания незаметно уезжают на несколько дней.
    case 'months': return clampedShift(next, amount, 0)
    case 'years': return clampedShift(next, 0, amount)
  }
  return next
}

function clampedShift(date: Date, months: number, years: number): Date {
  const day = date.getUTCDate()
  const result = new Date(date.getTime())
  result.setUTCDate(1)
  result.setUTCFullYear(result.getUTCFullYear() + years)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDayOfMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDayOfMonth))
  return result
}

function requireNumber(value: Value, what: string): number {
  const n = toNumber(value)
  if (n === null) throw new FormulaError(`${what}: ожидалось число`)
  return n
}

function numericArgs(args: Value[]): number[] {
  return args.map((a) => toNumber(a)).filter((n): n is number => n !== null)
}

function fn(minArgs: number, maxArgs: number, call: FormulaFunction['call']): FormulaFunction {
  return { minArgs, maxArgs, call }
}

const INF = Number.POSITIVE_INFINITY

export const FUNCTIONS: Record<string, FormulaFunction> = {
  // --- Логика ---
  IF: { minArgs: 2, maxArgs: 3, lazy: true, call: () => null },
  AND: fn(1, INF, (args) => args.every((a) => toBool(a))),
  OR: fn(1, INF, (args) => args.some((a) => toBool(a))),
  NOT: fn(1, 1, (args) => !toBool(args[0] ?? null)),
  ISBLANK: fn(1, 1, (args) => isBlankValue(args[0] ?? null)),

  // --- Текст ---
  CONCAT: fn(1, INF, (args) => args.map(toText).join('')),
  LEN: fn(1, 1, (args) => toText(args[0] ?? null).length),
  LEFT: fn(2, 2, (args) => toText(args[0] ?? null).slice(0, Math.max(0, requireNumber(args[1] ?? null, 'LEFT')))),
  RIGHT: fn(2, 2, (args) => {
    const count = Math.max(0, requireNumber(args[1] ?? null, 'RIGHT'))
    return count === 0 ? '' : toText(args[0] ?? null).slice(-count)
  }),
  MID: fn(3, 3, (args) => {
    const text = toText(args[0] ?? null)
    // Позиция считается с единицы: формулы пишут не программисты.
    const start = Math.max(1, requireNumber(args[1] ?? null, 'MID'))
    const count = Math.max(0, requireNumber(args[2] ?? null, 'MID'))
    return text.slice(start - 1, start - 1 + count)
  }),
  UPPER: fn(1, 1, (args) => toText(args[0] ?? null).toUpperCase()),
  LOWER: fn(1, 1, (args) => toText(args[0] ?? null).toLowerCase()),
  TRIM: fn(1, 1, (args) => toText(args[0] ?? null).trim()),
  REPLACE: fn(3, 3, (args) => {
    const text = toText(args[0] ?? null)
    const search = toText(args[1] ?? null)
    const replacement = toText(args[2] ?? null)
    return search === '' ? text : text.split(search).join(replacement)
  }),
  VALUE: fn(1, 1, (args) => toNumber(args[0] ?? null)),

  // --- Числа ---
  ROUND: fn(1, 2, (args) => {
    const n = toNumber(args[0] ?? null)
    if (n === null) return null
    const digits = args.length > 1 ? Math.trunc(requireNumber(args[1] ?? null, 'ROUND')) : 0
    const factor = 10 ** digits
    return Math.round((n + Number.EPSILON) * factor) / factor
  }),
  ABS: fn(1, 1, (args) => {
    const n = toNumber(args[0] ?? null)
    return n === null ? null : Math.abs(n)
  }),
  MIN: fn(1, INF, (args) => {
    const nums = numericArgs(args)
    return nums.length === 0 ? null : Math.min(...nums)
  }),
  MAX: fn(1, INF, (args) => {
    const nums = numericArgs(args)
    return nums.length === 0 ? null : Math.max(...nums)
  }),
  SUM: fn(1, INF, (args) => numericArgs(args).reduce((a, b) => a + b, 0)),

  // --- Даты ---
  TODAY: fn(0, 0, (_args, ctx) => {
    const d = new Date(ctx.now.getTime())
    d.setUTCHours(0, 0, 0, 0)
    return fromDate(d)
  }),
  NOW: fn(0, 0, (_args, ctx) => fromDate(ctx.now)),
  DATEADD: fn(3, 3, (args) => {
    const date = toDate(args[0] ?? null)
    if (date === null) return null
    return fromDate(shift(date, requireNumber(args[1] ?? null, 'DATEADD'), unitOf(args[2] ?? null)))
  }),
  DATEDIFF: fn(3, 3, (args) => {
    const from = toDate(args[0] ?? null)
    const to = toDate(args[1] ?? null)
    if (from === null || to === null) return null
    const unit = unitOf(args[2] ?? null)
    const ms = to.getTime() - from.getTime()
    switch (unit) {
      case 'ms': return ms
      case 'seconds': return Math.trunc(ms / 1000)
      case 'minutes': return Math.trunc(ms / 60000)
      case 'hours': return Math.trunc(ms / 3600000)
      case 'days': return Math.trunc(ms / 86400000)
      case 'weeks': return Math.trunc(ms / 604800000)
      case 'months':
        return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
      case 'years':
        return to.getUTCFullYear() - from.getUTCFullYear()
      default: return null
    }
  }),
  FORMAT_DATE: fn(1, 2, (args, ctx) => {
    const date = toDate(args[0] ?? null)
    if (date === null) return null
    const pattern = args.length > 1 ? toText(args[1] ?? null) : 'ДД.ММ.ГГГГ'
    const parts = new Intl.DateTimeFormat('ru-RU', {
      timeZone: ctx.timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return pattern
      .replace(/ГГГГ|YYYY/g, get('year'))
      .replace(/ММ|MM/g, get('month'))
      .replace(/ДД|DD/g, get('day'))
      .replace(/чч|HH/g, get('hour'))
      .replace(/мм|mm/g, get('minute'))
      .replace(/сс|ss/g, get('second'))
  }),
}

export function lookupFunction(name: string): FormulaFunction {
  const found = FUNCTIONS[name]
  if (!found) throw new FormulaError(`Неизвестная функция ${name}`)
  return found
}

export const FUNCTION_NAMES = Object.keys(FUNCTIONS).sort()
