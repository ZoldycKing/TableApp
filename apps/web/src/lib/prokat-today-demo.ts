/**
 * Deterministic demo for the cabinet «Сегодня» screen (SPEC §6 / #m-today).
 * Fixed Friday 27.11.2026 so phone and desktop shots stay stable.
 */

export type TodayTaskKind = 'issue' | 'return' | 'call'

export type DemoTodayTask = {
  id: string
  kind: TodayTaskKind
  /** Left column: time or «вчера». */
  stamp: string
  title: string
  /** Second line under the title. */
  detail: string
  action: string
  /** Optional booking id for live actions; demo ids are synthetic. */
  bookingId?: string
  phone?: string
}

export const DEMO_TODAY_ISO = '2026-11-27'
export const DEMO_TODAY_LABEL = '27.11.2026'
export const DEMO_TODAY_WEEKDAY = 'Пятница'
export const DEMO_TODAY_ITEMS_OUT = 14

export const DEMO_TODAY_METRICS = {
  issue: 2,
  return: 2,
  overdue: 1,
} as const

export function prokatDemoTodayUrgent(): DemoTodayTask[] {
  return [{
    id: 'demo-today-urgent-1',
    kind: 'call',
    stamp: 'вчера',
    title: 'SUP-доска Red Paddle 10\'6"',
    detail: 'Дмитрий Соколов · не вернул 26.11.2026, 18:00',
    action: 'Позвонить',
    phone: '+7 903 210-66-77',
    bookingId: 'demo-today-urgent-1',
  }]
}

export function prokatDemoTodayAgenda(): DemoTodayTask[] {
  return [
    {
      id: 'demo-today-issue-1',
      kind: 'issue',
      stamp: '10:00',
      title: 'Палатка MSR, 3 места',
      detail: 'Выдать · Елена Волкова',
      action: 'Выдать',
      bookingId: 'demo-today-issue-1',
    },
    {
      id: 'demo-today-issue-2',
      kind: 'issue',
      stamp: '12:00',
      title: 'Велосипед Trek Marlin 7',
      detail: 'Выдать · Алексей Иванов',
      action: 'Выдать',
      bookingId: 'demo-today-issue-2',
    },
    {
      id: 'demo-today-return-1',
      kind: 'return',
      stamp: '18:00',
      title: 'Гидрокостюм 3 мм',
      detail: 'Вернуть · Кирилл Ан',
      action: 'Принять',
      bookingId: 'demo-today-return-1',
    },
    {
      id: 'demo-today-return-2',
      kind: 'return',
      stamp: '20:00',
      title: 'Перфоратор Bosch GBH 2-26',
      detail: 'Вернуть · Ольга Нечаева',
      action: 'Принять',
      bookingId: 'demo-today-return-2',
    },
  ]
}

export function prokatDemoTodaySubtitle() {
  return `${DEMO_TODAY_WEEKDAY}, ${DEMO_TODAY_LABEL} · ${DEMO_TODAY_ITEMS_OUT} предметов в прокате`
}
