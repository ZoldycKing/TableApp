import { calendarDay, type BookingConfig } from '@tableapp/schema'
import { bookingScheduleInputSchema, type AppV2Json, type BookingScheduleInput, type BookingScheduleScope, type BookingScheduleRequest } from '@tableapp/schema/app-v2'
export { bookingScheduleInputSchema, bookingScheduleScopeSchema, bookingScheduleRequestSchema, type BookingScheduleInput, type BookingScheduleScope, type BookingScheduleRequest } from '@tableapp/schema/app-v2'
export type BookingScheduleState = { revision: string; fingerprint: string; masters: { id: string; name: string }[]; values: Record<string, AppV2Json> }
export type BookingScheduleRead = { ok: true; state: BookingScheduleState } | { ok: false; error: string }
export type BookingScheduleResult = { ok: true; repeated: boolean } | { ok: false; error: string; stale?: boolean; uncertain?: boolean }
export type BookingScheduleAdapter = { read: (scope: BookingScheduleScope) => Promise<BookingScheduleRead>; save: (request: BookingScheduleRequest) => Promise<BookingScheduleResult> }

export const BOOKING_WEEKDAYS = [
  { value: 1, short: 'Пн', name: 'Понедельник' }, { value: 2, short: 'Вт', name: 'Вторник' },
  { value: 3, short: 'Ср', name: 'Среда' }, { value: 4, short: 'Чт', name: 'Четверг' },
  { value: 5, short: 'Пт', name: 'Пятница' }, { value: 6, short: 'Сб', name: 'Суббота' },
  { value: 0, short: 'Вс', name: 'Воскресенье' },
] as const

/** One UI submission becomes ordinary schedule rows, all saved in one transaction. */
export function bookingSchedulePlan(config: BookingConfig, input: BookingScheduleInput, masterName: string): { ok: true; rows: Record<string, AppV2Json>[] } | { ok: false; error: string } {
  if (!bookingScheduleInputSchema.safeParse(input).success) return { ok: false, error: 'Проверьте мастера, дни и часы работы.' }
  if (input.mode === 'weekly' ? !input.weekdays.length : !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || calendarDay(input.date) !== input.date) return { ok: false, error: input.mode === 'weekly' ? 'Выберите хотя бы один рабочий день.' : 'Укажите корректную дату.' }
  const clock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : -1
  const start = clock(input.start), end = clock(input.end), fromBreak = clock(input.breakStart), toBreak = clock(input.breakEnd), hasBreak = Boolean(input.breakStart || input.breakEnd)
  if (!input.closed && (start < 0 || end <= start)) return { ok: false, error: 'Укажите часы работы: окончание должно быть позже начала.' }
  if (!input.closed && hasBreak && (fromBreak <= start || toBreak <= fromBreak || toBreak >= end)) return { ok: false, error: 'Перерыв должен начинаться и заканчиваться внутри рабочего времени.' }
  const days = input.mode === 'date' ? [null] : BOOKING_WEEKDAYS.filter(day => input.weekdays.includes(day.value)).map(day => day.value)
  const windows = input.closed ? [['', '']] : hasBreak ? [[input.start, input.breakStart], [input.breakEnd, input.end]] : [[input.start, input.end]]
  const fields = config.schedule
  return { ok: true, rows: days.flatMap(day => windows.map(([from, to]) => ({
    [fields.name]: `${masterName} · ${day === null ? input.date : BOOKING_WEEKDAYS.find(item => item.value === day)!.short} · ${input.closed ? 'Выходной' : `${from}–${to}`}`,
    [fields.master]: [input.masterId], [fields.weekday]: day === null ? null : config.weekdays[day]!,
    [fields.date]: day === null ? input.date : null, [fields.start]: from!, [fields.end]: to!, [fields.closed]: input.closed,
  }))) }
}
