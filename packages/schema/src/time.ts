/**
 * Время в продукте.
 *
 * Хранится мгновение в ISO, показывается и вводится по московскому времени.
 * Раньше это соглашение расходилось: импорт понимал «14.03.2026 09:30» как
 * время UTC, а таблица рисовала его же в Москве — и дата из файла съезжала
 * на три часа. Преобразование живёт здесь, чтобы у импорта, редактора ячейки
 * и отображения был один источник правды.
 */
export const APP_TIME_ZONE = 'Europe/Moscow'

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
