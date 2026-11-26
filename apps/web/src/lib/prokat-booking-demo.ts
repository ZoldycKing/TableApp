/**
 * Dense, template-neutral inventory for the «Новая бронь» demo. Pure data — no clock, no randomness.
 */

export type DemoBookingItem = {
  id: string
  name: string
  rate: number
  deposit: number
  /** Short unit label under the price, e.g. «за сутки». */
  unit: string
  /** Availability line under the name. */
  hint: string
  /** Icon tile tone. */
  tone: 'blue' | 'beige'
  /** free = selectable, stock = selectable with stock hint, busy = disabled. */
  status: 'free' | 'stock' | 'busy'
}

export const DEMO_BOOKING_TODAY = '2026-11-27'
export const DEMO_BOOKING_FROM = '2026-11-28'
export const DEMO_BOOKING_TO = '2026-11-30'
/** Phone mockup keeps the range inside one week strip. */
export const DEMO_BOOKING_TO_PHONE = '2026-11-29'
export const DEMO_BOOKING_TIME = '10:00'

export const DEMO_BOOKING_CLIENT = {
  id: 'demo-booking-client',
  name: 'Мария Петрова',
  phone: '+7 921 330-44-55',
  visits: 3,
  gender: 'f' as const,
}

export function prokatDemoBookingItems(): DemoBookingItem[] {
  return [
    {
      id: 'demo-item-sup-red',
      name: 'SUP-доска Red Paddle 10\'6"',
      rate: 1500,
      deposit: 4000,
      unit: 'за сутки',
      hint: 'свободна на эти даты',
      tone: 'blue',
      status: 'free',
    },
    {
      id: 'demo-item-sup-aqua',
      name: 'SUP-доска Aqua Marina Beast',
      rate: 1200,
      deposit: 4000,
      unit: 'за сутки',
      hint: 'свободна на эти даты',
      tone: 'blue',
      status: 'free',
    },
    {
      id: 'demo-item-bag',
      name: 'Гидромешок 20 л',
      rate: 150,
      deposit: 500,
      unit: 'за сутки',
      hint: 'осталось 4 из 6',
      tone: 'beige',
      status: 'stock',
    },
    {
      id: 'demo-item-sup-glad',
      name: 'SUP-доска Gladiator 11\'',
      rate: 1500,
      deposit: 4000,
      unit: 'за сутки',
      hint: 'занята до 02.12.2026',
      tone: 'blue',
      status: 'busy',
    },
  ]
}

export function prokatDemoBookingSelectedIds() {
  return ['demo-item-sup-red', 'demo-item-sup-aqua']
}
