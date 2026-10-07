import { wallClockToInstant, type FieldType } from '@tableapp/schema'

/**
 * Определение типа колонки по её значениям.
 * Ошибиться здесь безопасно — пользователь правит тип на экране предпросмотра,
 * но каждое верное угадывание экономит ему клик на онбординге.
 */

const TRUE_WORDS = new Set(['да', 'true', 'истина', 'yes', '1', '+', 'v', 'х', 'x'])
const FALSE_WORDS = new Set(['нет', 'false', 'ложь', 'no', '0', '-', ''])

const DATE_PATTERNS = [
  /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/,
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2})$/,
]
const TIME_PATTERN = /\d{1,2}:\d{2}(:\d{2})?/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-zа-я]{2,}$/i
const URL_PATTERN = /^(https?:\/\/|www\.)\S+$/i
const CURRENCY_CHARS = /[₽$€\s\u00a0]/g

export function isBlankCell(value: string): boolean {
  return value.trim() === ''
}

export function parseNumber(value: string): number | null {
  const cleaned = value.replace(CURRENCY_CHARS, '').replace(',', '.')
  if (cleaned === '' || !/^-?\d*\.?\d+%?$/.test(cleaned)) return null
  const percent = cleaned.endsWith('%')
  const n = Number(percent ? cleaned.slice(0, -1) : cleaned)
  if (!Number.isFinite(n)) return null
  return percent ? n / 100 : n
}

export function parseDate(value: string): string | null {
  const trimmed = value.trim()
  const datePart = trimmed.split(/[ T]/)[0] ?? ''

  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(datePart)
    if (!match) continue
    let year: number
    let month: number
    let day: number
    if (pattern === DATE_PATTERNS[1]) {
      year = Number(match[1]); month = Number(match[2]); day = Number(match[3])
    } else {
      day = Number(match[1]); month = Number(match[2]); year = Number(match[3])
      if (year < 100) year += year < 50 ? 2000 : 1900
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null

    const time = TIME_PATTERN.exec(trimmed)
    const [hours = 0, minutes = 0, seconds = 0] = time
      ? time[0].split(':').map(Number)
      : []
    // В файле записано настенное время, а не UTC: «16.03.2026 09:30» —
    // это половина десятого утра у того, кто вёл таблицу. Раньше оно
    // понималось как UTC и в интерфейсе уезжало на три часа вперёд.
    const checkUtc = new Date(Date.UTC(year, month - 1, day))
    if (checkUtc.getUTCMonth() !== month - 1 || checkUtc.getUTCDate() !== day) return null

    return wallClockToInstant({ year, month, day, hour: hours, minute: minutes, second: seconds }).toISOString()
  }
  return null
}

export function parseBoolean(value: string): boolean | null {
  const key = value.trim().toLowerCase()
  if (TRUE_WORDS.has(key)) return true
  if (FALSE_WORDS.has(key)) return false
  return null
}

export type InferredColumn = {
  type: FieldType
  /** Варианты для полей выбора, в порядке первого появления в файле. */
  choices?: string[]
  hasTime?: boolean
}

export function inferColumn(values: readonly string[]): InferredColumn {
  const filled = values.filter((v) => !isBlankCell(v)).map((v) => v.trim())
  if (filled.length === 0) return { type: 'text' }

  const every = (test: (value: string) => boolean) => filled.every(test)

  if (every((v) => parseBoolean(v) !== null)) return { type: 'checkbox' }
  /*
   * Ведущий ноль превращает число в обозначение: «007» — это артикул,
   * табельный номер или код, и в числовой колонке он молча станет семёркой.
   * Обратно из семёрки ноль уже не достать, поэтому такая колонка — текст.
   */
  if (every((v) => parseNumber(v) !== null) && !filled.some(hasLeadingZero)) return { type: 'number' }
  if (every((v) => parseDate(v) !== null)) {
    const hasTime = filled.some((v) => TIME_PATTERN.test(v))
    return { type: hasTime ? 'datetime' : 'date', hasTime }
  }
  if (every((v) => EMAIL_PATTERN.test(v))) return { type: 'email' }
  if (every((v) => URL_PATTERN.test(v))) return { type: 'url' }
  if (every(looksLikePhone)) return { type: 'phone' }

  const distinct = [...new Set(filled)]
  // Колонка-справочник: мало разных значений, каждое встречается многократно.
  if (filled.length >= 5 && distinct.length <= 20 && distinct.length * 2 <= filled.length) {
    const maxLength = Math.max(...distinct.map((v) => v.length))
    if (maxLength <= 60) return { type: 'single_select', choices: distinct }
  }

  const longest = Math.max(...filled.map((v) => v.length))
  if (longest > 120) return { type: 'long_text' }

  return { type: 'text' }
}

/** «007», «-007»: ноль впереди значащей цифры. «0.5» и «0,5» — обычные числа. */
function hasLeadingZero(value: string): boolean {
  return /^-?0\d/.test(value.trim())
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return false
  return /^[+\d][\d\s()\-.]*$/.test(value.trim())
}
