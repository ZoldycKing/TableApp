/**
 * Время в продукте.
 *
 * Хранится мгновение в ISO, показывается и вводится по московскому времени.
 * Раньше это соглашение расходилось: импорт понимал «14.03.2026 09:30» как
 * время UTC, а таблица рисовала его же в Москве — и дата из файла съезжала
 * на три часа. Преобразование живёт здесь, чтобы у импорта, редактора ячейки
 * и отображения был один источник правды.
 */
import type { Field } from './fields'
export const APP_TIME_ZONE = 'Europe/Moscow'

export function validTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
}
export function fieldTimeZone(field: Pick<Field, 'type' | 'options'>): string {
  const zone = field.type === 'datetime' ? (field.options as { timeZone?: unknown }).timeZone : APP_TIME_ZONE
  return typeof zone === 'string' && validTimeZone(zone) ? zone : APP_TIME_ZONE
}
function civilDate(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const check = new Date(`${value}T12:00:00Z`)
  if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== value) return null
  return { year, month, day }
}
/** Bare dates are civil dates; timestamps denote instants in the field's zone. */
export function calendarDay(value: unknown, timeZone = APP_TIME_ZONE): string | null {
  if (civilDate(value)) return value as string
  const instant = dateInstant(value, timeZone)
  return instant === null ? null : instantToWallClock(new Date(instant), timeZone)?.date ?? null
}
export function dateInstant(value: unknown, timeZone = APP_TIME_ZONE): number | null {
  const civil = civilDate(value)
  if (civil) return wallClockToInstant(civil, timeZone).getTime()
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  if (typeof value === 'string') {
    const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value)
    if (local) {
      const day = civilDate(local[1]), hour = Number(local[2]), minute = Number(local[3]), second = Number(local[4] ?? 0)
      if (!day || hour > 23 || minute > 59 || second > 59) return null
      const instant = wallClockToInstant({ ...day, hour, minute, second }, timeZone)
      const wall = instantToWallClock(instant, timeZone)
      if (!wall || wall.date !== local[1] || wall.time !== `${local[2]}:${local[3]}`) return null
      return instant.getTime() + Number((local[5] ?? '').padEnd(3, '0'))
    }
    // Reject ambiguous host-local formats and dates that Date would roll over.
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) || !civilDate(value.slice(0, 10))) return null
  }
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function partsInZone(instant: Date, timeZone: string): Parts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const found: Record<string, number> = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') found[part.type] = Number(part.value)
  }

  return {
    year: found.year ?? 0,
    month: found.month ?? 1,
    day: found.day ?? 1,
    hour: found.hour ?? 0,
    minute: found.minute ?? 0,
    second: found.second ?? 0,
  }
}

function offsetMillis(instant: Date, timeZone: string): number {
  const parts = partsInZone(instant, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - instant.getTime()
}

/**
 * Настенное время в зоне продукта → мгновение.
 * Второй проход нужен зонам с переходом на летнее время: смещение зависит
 * от самого мгновения, и первая догадка может попасть не в тот отрезок.
 * В Москве перехода нет, но закладываться на это незачем.
 */
export function wallClockToInstant(
  wall: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone = APP_TIME_ZONE,
): Date {
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour ?? 0,
    wall.minute ?? 0,
    wall.second ?? 0,
  )

  const first = naive - offsetMillis(new Date(naive), timeZone)
  const second = naive - offsetMillis(new Date(first), timeZone)
  return new Date(second)
}

/** Мгновение → строки для полей ввода браузера: «ГГГГ-ММ-ДД» и «ЧЧ:ММ». */
export function instantToWallClock(
  value: string | Date,
  timeZone = APP_TIME_ZONE,
): { date: string; time: string } | null {
  const instant = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(instant.getTime())) return null

  const parts = partsInZone(instant, timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')

  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
  }
}
