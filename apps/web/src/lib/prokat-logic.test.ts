import { describe, expect, it } from 'vitest'
import { wallClockToInstant } from '@tableapp/schema'
import {
  computeLateFee, computeRentalPrice, findItemBookingConflict, formatMoney, formatProkatDateTime,
  isOverdueReturn, nextBookingNumber, prokatDashboard, prokatRangesOverlap, staffTransitions,
  weekendDaysInRange, type ProkatCatalogItem, type ProkatListItem,
} from './prokat-logic'

const moscow = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  wallClockToInstant({ year, month, day, hour, minute }, 'Europe/Moscow').toISOString()

describe('prokatRangesOverlap', () => {
  it('reuses half-open overlap semantics from booking rules', () => {
    expect(prokatRangesOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false)
    expect(prokatRangesOverlap({ start: 0, end: 11 }, { start: 10, end: 20 })).toBe(true)
    expect(prokatRangesOverlap({ start: 5, end: 8 }, { start: 1, end: 20 })).toBe(true)
  })
})

describe('findItemBookingConflict', () => {
  const existing = [
    {
      id: 'b1', number: 'ПР-1005', itemIds: ['bike-city'], from: moscow(2026, 11, 24, 10), to: moscow(2026, 11, 24, 20),
      status: 'Выдано',
    },
    {
      id: 'b2', number: 'ПР-1002', itemIds: ['bike-road'], from: moscow(2026, 11, 10, 9), to: moscow(2026, 11, 12, 18),
      status: 'Возвращено',
    },
    {
      id: 'b3', number: 'ПР-1001', itemIds: ['laser'], from: moscow(2026, 11, 24, 12), to: moscow(2026, 11, 24, 16),
      status: 'Отменена',
    },
  ]

  it('blocks double-booking on overlapping active statuses', () => {
    const hit = findItemBookingConflict(existing, ['bike-city'], moscow(2026, 11, 24, 15), moscow(2026, 11, 24, 18))
    expect(hit).toMatchObject({ bookingId: 'b1', itemId: 'bike-city', number: 'ПР-1005' })
  })

  it('ignores returned and cancelled bookings', () => {
    expect(findItemBookingConflict(existing, ['bike-road'], moscow(2026, 11, 10, 10), moscow(2026, 11, 11, 10))).toBeNull()
    expect(findItemBookingConflict(existing, ['laser'], moscow(2026, 11, 24, 12), moscow(2026, 11, 24, 16))).toBeNull()
  })

  it('allows adjacent ranges and excludeBookingId', () => {
    expect(findItemBookingConflict(existing, ['bike-city'], moscow(2026, 11, 24, 20), moscow(2026, 11, 24, 22))).toBeNull()
    expect(findItemBookingConflict(existing, ['bike-city'], moscow(2026, 11, 24, 12), moscow(2026, 11, 24, 14), 'b1')).toBeNull()
  })

  it('detects multi-item conflicts', () => {
    const hit = findItemBookingConflict(existing, ['bike-mtb', 'bike-city'], moscow(2026, 11, 24, 11), moscow(2026, 11, 24, 13))
    expect(hit?.itemId).toBe('bike-city')
  })
})

describe('computeRentalPrice', () => {
  it('charges by ceil hours for hourly tariff', () => {
    expect(computeRentalPrice({
      tariff: 'За час', rate: 200,
      from: moscow(2026, 11, 24, 10), to: moscow(2026, 11, 24, 12, 1),
    })).toBe(600)
  })

  it('charges calendar days for daily tariff (min 1)', () => {
    expect(computeRentalPrice({
      tariff: 'За сутки', rate: 1500,
      from: moscow(2026, 11, 24, 10), to: moscow(2026, 11, 24, 18),
    })).toBe(1500)
    expect(computeRentalPrice({
      tariff: 'За сутки', rate: 1500,
      from: moscow(2026, 11, 24, 10), to: moscow(2026, 11, 26, 18),
    })).toBe(4500)
  })

  it('charges Sat+Sun days for weekend tariff in Moscow', () => {
    // Sat 21 Nov 2026 → Mon 23 Nov 2026 → Sat+Sun = 2
    expect(weekendDaysInRange(
      Date.parse(moscow(2026, 11, 21, 10)),
      Date.parse(moscow(2026, 11, 23, 18)),
    )).toBe(2)
    expect(computeRentalPrice({
      tariff: 'Выходные', rate: 3500,
      from: moscow(2026, 11, 21, 10), to: moscow(2026, 11, 23, 18),
    })).toBe(7000)
  })
})

describe('computeLateFee', () => {
  it('charges overdue hours for hourly tariff', () => {
    expect(computeLateFee({
      tariff: 'За час', rate: 200,
      to: moscow(2026, 11, 24, 12), now: moscow(2026, 11, 24, 14, 30),
    })).toBe(600)
  })

  it('charges ceil days for daily and weekend tariffs', () => {
    expect(computeLateFee({
      tariff: 'За сутки', rate: 1500,
      to: moscow(2026, 11, 24, 18), now: moscow(2026, 11, 25, 10),
    })).toBe(1500)
    expect(computeLateFee({
      tariff: 'Выходные', rate: 3500,
      to: moscow(2026, 11, 23, 18), now: moscow(2026, 11, 25, 12),
    })).toBe(7000)
  })

  it('is zero when still on time', () => {
    expect(computeLateFee({
      tariff: 'За сутки', rate: 1500,
      to: moscow(2026, 11, 24, 18), now: moscow(2026, 11, 24, 17),
    })).toBe(0)
  })
})

describe('isOverdueReturn and dashboard', () => {
  it('marks dedicated overdue status and issued past due', () => {
    const now = Date.parse(moscow(2026, 11, 24, 12))
    expect(isOverdueReturn('Просрочен возврат', moscow(2026, 11, 30, 18), now)).toBe(true)
    expect(isOverdueReturn('Выдано', moscow(2026, 11, 23, 18), now)).toBe(true)
    expect(isOverdueReturn('Выдано', moscow(2026, 11, 25, 18), now)).toBe(false)
    expect(isOverdueReturn('Возвращено', moscow(2026, 11, 20, 18), now)).toBe(false)
  })

  it('summarises utilisation and overdue returns', () => {
    const now = Date.parse(moscow(2026, 11, 24, 12))
    const catalog: ProkatCatalogItem[] = [
      { id: '1', name: 'Вел', category: 'Велосипеды', serial: 'A', tariff: 'За сутки', rate: 900, deposit: 3000, condition: '', status: 'В прокате' },
      { id: '2', name: 'SUP', category: 'SUP', serial: 'B', tariff: 'Выходные', rate: 3500, deposit: 8000, condition: '', status: 'Свободен' },
      { id: '3', name: 'Пила', category: 'Инструменты', serial: 'C', tariff: 'За сутки', rate: 700, deposit: 3500, condition: '', status: 'Списан' },
    ]
    const bookings: ProkatListItem[] = [
      {
        id: 'b1', number: 'ПР-1', title: 'Вел', clientName: 'А', clientEmail: 'a@x.ru', staffName: '', staffEmail: '',
        status: 'Выдано', from: moscow(2026, 11, 24, 10), to: moscow(2026, 11, 24, 20), price: 900, deposit: 3000, lateFee: 0,
        itemIds: ['1'], itemNames: ['Вел'], updatedAt: moscow(2026, 11, 24, 10),
      },
      {
        id: 'b2', number: 'ПР-2', title: 'SUP', clientName: 'Б', clientEmail: 'b@x.ru', staffName: '', staffEmail: '',
        status: 'Просрочен возврат', from: moscow(2026, 11, 20, 10), to: moscow(2026, 11, 22, 18), price: 3500, deposit: 8000, lateFee: 3500,
        itemIds: ['2'], itemNames: ['SUP'], updatedAt: moscow(2026, 11, 22, 19),
      },
    ]
    const dash = prokatDashboard(catalog, bookings, now)
    expect(dash.itemsOut).toBe(2)
    expect(dash.overdueCount).toBe(1)
    expect(dash.utilisation).toBe(100)
    expect(dash.returnsDueToday).toBe(1)
    expect(formatMoney(3500)).toMatch(/3.?500/)
    expect(formatProkatDateTime(moscow(2026, 11, 24, 12))).toBe('24.11.2026, 12:00')
    expect(nextBookingNumber(['ПР-1008', 'черновик'])).toBe('ПР-1009')
    expect(staffTransitions('Заявка')).toEqual(['Подтверждена', 'Отменена'])
    expect(staffTransitions('Выдано')).toContain('Просрочен возврат')
  })
})
