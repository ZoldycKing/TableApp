import { describe, expect, it } from 'vitest'
import { durationUnitLabel, formatRuDate, formatRuTime, splitMinutes } from '@/components/ui/format'
import { landingMarkup } from './markup'

describe('landing markup', () => {
  it('keeps the approved copy and points actions at live routes', () => {
    const html = landingMarkup('/login?next=%2Fimport', false)
    expect(html).toContain('Приложение')
    expect(html).toContain('собранное')
    expect(html).toContain('за&nbsp;вечер.')
    expect(html).toContain('href="/templates"')
    expect(html).toContain('href="/pricing"')
    expect(html).toContain('href="/login?next=%2Fimport"')
    expect(html).toContain('href="/login"')
    expect(html).not.toContain('href="#"')
    expect(html).not.toMatch(/\d+\s+шаблон/)
  })
})

describe('shared dates and durations', () => {
  it('formats calendar dates and clocks without a locale-dependent field', () => {
    expect(formatRuDate('2026-11-24')).toBe('24.11.2026')
    expect(formatRuTime('12:00')).toBe('12:00')
    expect(formatRuDate('')).toBe('')
  })

  it('reads raw minutes as hours and days', () => {
    expect(splitMinutes(1440)).toEqual({ amount: 1, unit: 'day' })
    expect(splitMinutes(2880)).toEqual({ amount: 2, unit: 'day' })
    expect(splitMinutes(120)).toEqual({ amount: 2, unit: 'hour' })
    expect(durationUnitLabel('hour', 2)).toBe('часа')
    expect(durationUnitLabel('day', 1)).toBe('день')
  })
})
