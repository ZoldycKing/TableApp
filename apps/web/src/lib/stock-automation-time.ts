import { APP_TIME_ZONE, instantToWallClock, wallClockToInstant } from '@tableapp/schema'

export const STOCK_AUTOMATION_ZONES = [
  ['Europe/Kaliningrad', 'Калининград (UTC+2)'],
  [APP_TIME_ZONE, 'Москва (UTC+3)'],
  ['Europe/Samara', 'Самара (UTC+4)'],
  ['Asia/Yekaterinburg', 'Екатеринбург (UTC+5)'],
  ['Asia/Omsk', 'Омск (UTC+6)'],
  ['Asia/Novosibirsk', 'Новосибирск (UTC+7)'],
  ['Asia/Irkutsk', 'Иркутск (UTC+8)'],
  ['Asia/Yakutsk', 'Якутск (UTC+9)'],
  ['Asia/Vladivostok', 'Владивосток (UTC+10)'],
  ['Asia/Magadan', 'Магадан (UTC+11)'],
  ['Asia/Kamchatka', 'Камчатка (UTC+12)'],
  ['UTC', 'UTC'],
] as const

export function stockScheduleValid(time: string, zone: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) && STOCK_AUTOMATION_ZONES.some(([value]) => value === zone)
}

/** Schedule on the next local day when today's time has already passed. */
export function nextStockCheck(now: Date, time: string, zone: string): Date {
  if (!stockScheduleValid(time, zone)) throw new Error('Invalid stock automation schedule')
  const day = instantToWallClock(now, zone)!.date
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const today = wallClockToInstant({ year: year!, month: month!, day: date!, hour, minute }, zone)
  return today > now ? today : wallClockToInstant({ year: year!, month: month!, day: date! + 1, hour, minute }, zone)
}
