import { describe, expect, it } from 'vitest'
import { APP_TIME_ZONE, instantToWallClock, wallClockToInstant } from './time'

describe('настенное время зоны продукта', () => {
  it('полночь в Москве — это 21:00 предыдущего дня по UTC', () => {
    const instant = wallClockToInstant({ year: 2026, month: 3, day: 14 })
    expect(instant.toISOString()).toBe('2026-03-13T21:00:00.000Z')
  })

  it('время из файла сохраняется как введённое, а не сдвигается', () => {
    const instant = wallClockToInstant({ year: 2026, month: 3, day: 16, hour: 9, minute: 30 })
    expect(instant.toISOString()).toBe('2026-03-16T06:30:00.000Z')
  })

  it('обратное преобразование возвращает те же цифры', () => {
    const instant = wallClockToInstant({ year: 2026, month: 3, day: 16, hour: 9, minute: 30 })
    expect(instantToWallClock(instant)).toEqual({ date: '2026-03-16', time: '09:30' })
  })

  it('переживает круговой обход в обе стороны', () => {
    const iso = '2026-12-31T21:00:00.000Z'
    const wall = instantToWallClock(iso)!
    const [year, month, day] = wall.date.split('-').map(Number)
    const [hour, minute] = wall.time.split(':').map(Number)
    expect(wallClockToInstant({ year: year!, month: month!, day: day!, hour, minute }).toISOString()).toBe(iso)
  })

  it('зона с переходом на летнее время считается по самому мгновению', () => {
    // Берлин летом UTC+2, зимой UTC+1 — смещение зависит от даты.
    expect(wallClockToInstant({ year: 2026, month: 7, day: 1, hour: 12 }, 'Europe/Berlin').toISOString())
      .toBe('2026-07-01T10:00:00.000Z')
    expect(wallClockToInstant({ year: 2026, month: 1, day: 1, hour: 12 }, 'Europe/Berlin').toISOString())
      .toBe('2026-01-01T11:00:00.000Z')
  })

  it('на мусоре молчит, а не выдаёт битую дату', () => {
    expect(instantToWallClock('не дата')).toBeNull()
  })

  it('зона продукта — московская', () => {
    expect(APP_TIME_ZONE).toBe('Europe/Moscow')
  })
})
