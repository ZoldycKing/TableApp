import { describe, expect, it } from 'vitest'
import type { ProkatCatalogItem } from './prokat-logic'
import { buildProkatDaySchedule, PROKAT_SCHEDULE_AT, PROKAT_SCHEDULE_DAY, shortResourceLabel, visibleGaps } from './prokat-day-demo'

function item(index: number, status = 'Свободен'): ProkatCatalogItem {
  return {
    id: `item_${index}`,
    name: `Предмет ${index}`,
    category: 'Велосипеды',
    serial: `СЕР-${index}`,
    tariff: 'За сутки',
    rate: 900 + index * 100,
    deposit: 3000,
    condition: 'Хорошее',
    status,
  }
}

describe('prokat day schedule demo', () => {
  it('pins the screenshot clock to Friday 27.11.2026 14:20 Moscow', () => {
    expect(new Date(PROKAT_SCHEDULE_AT).toISOString()).toBe('2026-11-27T11:20:00.000Z')
    expect(PROKAT_SCHEDULE_DAY).toBe('2026-11-27')
  })

  it('builds a dense day from template items without assuming a fixed column count in the grid', () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(index => item(index, index === 7 ? 'На обслуживании' : 'Свободен'))
    const first = buildProkatDaySchedule(items)
    const second = buildProkatDaySchedule(items)
    expect(first.columns).toHaveLength(6)
    expect(first.columns.filter(column => column.off)).toHaveLength(1)
    expect(first.blocks.length).toBeGreaterThanOrEqual(20)
    expect(first.blocks.length).toBeLessThanOrEqual(24)
    expect(first.blocks.filter(block => block.tone === 'w')).toHaveLength(2)
    expect(first.blocks.filter(block => block.tone === 'br')).toHaveLength(1)
    expect(first.blocks.filter(block => block.oneLine).length).toBeGreaterThanOrEqual(2)
    expect(first.selectedId).toBeTruthy()
    expect(first.blocks.map(block => block.id)).toEqual(second.blocks.map(block => block.id))
    expect(first.blocks.every(block => !/отзыв|рейтинг|довольн/i.test(`${block.title} ${block.note}`))).toBe(true)
    const gaps = visibleGaps(first.columns, first.blocks)
    expect(gaps.length).toBeGreaterThanOrEqual(1)
    expect(gaps.length).toBeLessThanOrEqual(2)
    const fewer = buildProkatDaySchedule(items.slice(0, 3))
    expect(fewer.columns.length).toBeLessThan(6)
    expect(fewer.blocks.length).toBeGreaterThan(0)
  })

  it('keeps column titles short enough to read at 1440', () => {
    expect(shortResourceLabel('Горный велосипед Trek Marlin 7')).toBe('Trek Marlin')
    expect(shortResourceLabel('Городской велосипед Electra')).toBe('Electra')
    expect(shortResourceLabel('Шоссейный велосипед Giant Contend')).toBe('Giant Contend')
    expect(shortResourceLabel('Детский велосипед 20"')).toBe('Детский 20"')
    expect(shortResourceLabel('SUP Red Paddle 10\'6"')).toBe('Red Paddle')
    expect(shortResourceLabel('SUP детский 8\'')).toBe('SUP 8\'')
  })
})
