/** Russian noun after a number: 1 запись, 2 записи, 5 записей. */
export function ruPlural(value: number, one: string, few: string, many: string) {
  const n = Math.abs(Math.trunc(value)) % 100
  if (n >= 11 && n <= 14) return many
  const digit = n % 10
  if (digit === 1) return one
  if (digit >= 2 && digit <= 4) return few
  return many
}

export function ruCount(value: number, one: string, few: string, many: string) {
  return `${value} ${ruPlural(value, one, few, many)}`
}

/** Calendar date as `дд.мм.гггг`. The value stored by pickers stays `YYYY-MM-DD`. */
export function formatRuDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return match ? `${match[3]}.${match[2]}.${match[1]}` : ''
}

/** Clock as `чч:мм` in 24-hour form. */
export function formatRuTime(value: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(value)
  return match ? `${match[1]}:${match[2]}` : ''
}

export function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export type DurationUnit = 'min' | 'hour' | 'day'

const UNIT_MINUTES: Record<DurationUnit, number> = { min: 1, hour: 60, day: 1440 }

/** Human reading of a minute count: 1440 → 1 день, 120 → 2 часа. */
export function splitMinutes(total: number): { amount: number; unit: DurationUnit } {
  if (total > 0 && total % UNIT_MINUTES.day === 0) return { amount: total / UNIT_MINUTES.day, unit: 'day' }
  if (total > 0 && total % UNIT_MINUTES.hour === 0) return { amount: total / UNIT_MINUTES.hour, unit: 'hour' }
  return { amount: total, unit: 'min' }
}

export function joinMinutes(amount: number, unit: DurationUnit): number {
  return Math.round(amount * UNIT_MINUTES[unit])
}

export function durationUnitLabel(unit: DurationUnit, amount: number): string {
  const n = Math.abs(amount)
  const mod10 = n % 10
  const mod100 = n % 100
  if (unit === 'min') {
    if (mod10 === 1 && mod100 !== 11) return 'минута'
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'минуты'
    return 'минут'
  }
  if (unit === 'hour') {
    if (mod10 === 1 && mod100 !== 11) return 'час'
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'часа'
    return 'часов'
  }
  if (mod10 === 1 && mod100 !== 11) return 'день'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня'
  return 'дней'
}
