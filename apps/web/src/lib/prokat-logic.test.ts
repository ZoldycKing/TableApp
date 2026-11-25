import { describe, expect, it } from 'vitest'
import { wallClockToInstant } from '@tableapp/schema'
import {
  computeLateFee, computeItemLateFee, computeRentalPrice, describeLateFee, findItemBookingConflict,
  buildTimelineWindow, catalogItemFreeLabel, catalogItemBusyUntil, clientInitials,
  formatMoney, formatMoneyOrZero, formatProkatDateTime, isOverdueReturn,
  itemBusyUntil, nextBookingNumber, prokatDashboard, prokatRangesOverlap, shortClientName,
  staffTransitions, timelineBarLabel, timelineBookingSegments, timelineSegmentPct,
  timelineStartForToday, weekendDaysInRange, type ProkatCatalogItem, type ProkatListItem,
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
    expect(timelineBarLabel('ПР-1007', 'Елена Волкова')).toBe('Елена В.')
    expect(clientInitials('Мария Петрова')).toBe('МП')
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

describe('timeline bar geometry', () => {
  const rangeStart = Date.parse('2026-11-22T00:00:00+03:00')
  const rangeEnd = Date.parse('2026-11-28T23:59:59.999+03:00')
  const now = Date.parse('2026-11-25T12:00:00+03:00')

  it('places bars by exact rental hours without a one-day floor', () => {
    // 12:00–18:00 on day 0 of a 7-day window → 6h / 7d ≈ 3.57%
    const pct = timelineSegmentPct(
      Date.parse('2026-11-22T12:00:00+03:00'),
      Date.parse('2026-11-22T18:00:00+03:00'),
      rangeStart,
      rangeEnd,
    )
    expect(pct).not.toBeNull()
    expect(pct!.left).toBeCloseTo((12 / 24) * (100 / 7), 1)
    expect(pct!.width).toBeCloseTo((6 / 24) * (100 / 7), 1)
    expect(pct!.clippedStart).toBe(false)
    expect(pct!.clippedEnd).toBe(false)
  })

  it('clips multi-day bars at the visible edge', () => {
    const pct = timelineSegmentPct(
      Date.parse('2026-11-20T10:00:00+03:00'),
      Date.parse('2026-11-24T18:00:00+03:00'),
      rangeStart,
      rangeEnd,
    )
    expect(pct!.clippedStart).toBe(true)
    expect(pct!.clippedEnd).toBe(false)
    expect(pct!.left).toBe(0)
  })

  it('draws an overdue hatched tail from planned end to now', () => {
    const { booking, overdueTail } = timelineBookingSegments({
      from: moscow(2026, 11, 22, 10),
      to: moscow(2026, 11, 23, 18),
      status: 'Просрочен возврат',
      now,
      rangeStart,
      rangeEnd,
    })
    expect(booking?.tone).toBe('overdue')
    expect(booking?.kind).toBe('booking')
    expect(overdueTail?.tone).toBe('overdue')
    expect(overdueTail?.kind).toBe('overdue-tail')
    // Tail starts at planned end (23rd 18:00) and ends at now (25th 12:00).
    const expectedLeft = ((Date.parse(moscow(2026, 11, 23, 18)) - rangeStart) / (rangeEnd - rangeStart)) * 100
    expect(overdueTail!.left).toBeCloseTo(expectedLeft, 1)
  })

  it('builds a day window as 08:00–22:00 hours', () => {
    const window = buildTimelineWindow({ mode: 'day', startDate: '2026-11-25', now })
    expect(window.columns).toHaveLength(14)
    expect(window.rangeStart).toBe(Date.parse('2026-11-25T08:00:00+03:00'))
    expect(window.rangeEnd).toBe(Date.parse('2026-11-25T22:00:00+03:00'))
    expect(window.nowPct).toBeCloseTo(((12 - 8) / 14) * 100, 1)
  })

  it('anchors «Сегодня» with a short lookback for fortnight', () => {
    expect(timelineStartForToday('fortnight', now)).toBe('2026-11-22')
    expect(timelineStartForToday('day', now)).toBe('2026-11-25')
  })

  it('labels catalogue free-from dates', () => {
    const spans = [{
      id: 'b1', itemIds: ['bike'], from: moscow(2026, 11, 24, 10), to: moscow(2026, 11, 27, 18), status: 'Выдано',
    }]
    expect(catalogItemFreeLabel({ id: 'free', status: 'Свободен' }, [], now)).toBe('Свободен сейчас')
    expect(catalogItemFreeLabel({ id: 'bike', status: 'В прокате', busyUntil: moscow(2026, 11, 27, 18) }, spans, now))
      .toBe('Свободен с 27.11')
  })
})
