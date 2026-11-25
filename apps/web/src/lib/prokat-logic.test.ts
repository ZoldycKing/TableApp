import { describe, expect, it } from 'vitest'
import { wallClockToInstant } from '@tableapp/schema'
import {
  computeLateFee, computeItemLateFee, computeRentalPrice, describeLateFee, findItemBookingConflict,
  formatMoney, formatMoneyOrZero, catalogItemBusyUntil, formatProkatDateTime, isOverdueReturn,
  itemBusyUntil, nextBookingNumber, prokatDashboard, prokatRangesOverlap, shortClientName,
  staffTransitions, timelineBarLabel, weekendDaysInRange, type ProkatCatalogItem, type ProkatListItem,
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

  it('itemBusyUntil returns conflicting booking end', () => {
    expect(itemBusyUntil(existing, 'bike-city', moscow(2026, 11, 24, 15), moscow(2026, 11, 24, 18))).toBe(existing[0]!.to)
    expect(itemBusyUntil(existing, 'bike-mtb', moscow(2026, 11, 24, 15), moscow(2026, 11, 24, 18))).toBeNull()
  })

  it('catalogItemBusyUntil falls back to public item.busyUntil for rented gear', () => {
    const busy = moscow(2026, 11, 27, 12)
    expect(catalogItemBusyUntil([], { id: 'sup', status: 'В прокате', busyUntil: busy }, moscow(2026, 11, 25, 12), moscow(2026, 11, 26, 18))).toBe(busy)
    expect(catalogItemBusyUntil([], { id: 'sup', status: 'Свободен', busyUntil: busy }, moscow(2026, 11, 25, 12), moscow(2026, 11, 26, 18))).toBeNull()
    expect(catalogItemBusyUntil([], { id: 'kids', status: 'На обслуживании' }, moscow(2026, 11, 25, 12), moscow(2026, 11, 26, 18))).toBe('service')
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
  it('applies grace then hourly fee with daily cap (SUP seed)', () => {
    // Due Mon 18:00, grace 1h → charge from 19:00; now Tue 12:00 → 17h × 500 = 8500, cap 3500/day → 3500
    expect(computeLateFee({
      mode: 'Сумма за час', value: 500, graceHours: 1, capPerDay: 3500, rate: 3500,
      to: moscow(2026, 11, 23, 18), now: moscow(2026, 11, 24, 12),
    })).toBe(3500)
  })

  it('charges percent of tariff per day for bikes and tools', () => {
    // Due 18:00 + 1h grace → 19:00; to next day 12:00 ≈ 17h → 1 day × 20% × 1500
    expect(computeLateFee({
      mode: 'Процент от тарифа за сутки', value: 20, graceHours: 1, rate: 1500,
      to: moscow(2026, 11, 24, 18), now: moscow(2026, 11, 25, 12),
    })).toBe(300)
    // ~41h after grace → 2 days × 100% × 800
    expect(computeLateFee({
      mode: 'Процент от тарифа за сутки', value: 100, graceHours: 1, rate: 800,
      to: moscow(2026, 11, 24, 18), now: moscow(2026, 11, 26, 12),
    })).toBe(1600)
  })

  it('charges fixed sum per day after grace', () => {
    expect(computeLateFee({
      mode: 'Сумма за сутки', value: 400, graceHours: 1, rate: 0,
      to: moscow(2026, 11, 24, 18), now: moscow(2026, 11, 25, 12),
    })).toBe(400)
  })

  it('is zero within grace or when mode is none', () => {
    expect(computeLateFee({
      mode: 'Сумма за час', value: 500, graceHours: 1, rate: 1800,
      to: moscow(2026, 11, 24, 18), now: moscow(2026, 11, 24, 18, 30),
    })).toBe(0)
    expect(computeLateFee({
      mode: 'Нет', value: 500, graceHours: 0, rate: 1800,
      to: moscow(2026, 11, 24, 18), now: moscow(2026, 11, 25, 12),
    })).toBe(0)
  })

  it('describes the formula in plain Russian and shortens client names', () => {
    expect(describeLateFee({ mode: 'Сумма за час', value: 500, graceHours: 1, capPerDay: 3500 }))
      .toMatch(/1 час льготы.*500.*час.*3.?500.*сутки/i)
    expect(describeLateFee({ mode: 'Процент от тарифа за сутки', value: 20, graceHours: 1, rate: 1500 }))
      .toMatch(/20%.*тарифа/i)
    expect(shortClientName('Елена Волкова')).toBe('Елена В.')
    expect(timelineBarLabel('ПР-1007', 'Елена Волкова')).toBe('ПР-1007 · Елена В.')
    expect(computeItemLateFee({
      category: 'SUP', lateFeeMode: 'Сумма за час', lateFeeValue: 500, lateFeeGraceHours: 1,
      lateFeeCapPerDay: 3500, rate: 3500,
    }, moscow(2026, 11, 23, 18), moscow(2026, 11, 24, 12))).toBe(3500)
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
    expect(formatMoney(0)).toBe('—')
    expect(formatMoneyOrZero(0)).toMatch(/0/)
    expect(formatMoneyOrZero(1500)).toMatch(/1.?500/)
    expect(formatProkatDateTime(moscow(2026, 11, 24, 12))).toBe('24.11.2026, 12:00')
    expect(nextBookingNumber(['ПР-1008', 'черновик'])).toBe('ПР-1009')
    expect(staffTransitions('Заявка')).toEqual(['Подтверждена', 'Отменена'])
    expect(staffTransitions('Выдано')).toContain('Просрочен возврат')
  })
})
