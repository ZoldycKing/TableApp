import { describe, expect, it } from 'vitest'
import {
  actualMinutesOf, billingTotal, checklistFromTemplate, checklistProgress, completionChecklistWarning,
  correctActualMinutes, distinctJobAddress, formatDuration, parseChecklist, parseMoneyLines,
  recurrenceOccurrences, repeatRuleFromName, seriesEditIds, startVisit, stopVisit, toggleChecklistItem,
} from './dispatch-stage2'

describe('field service timer', () => {
  const start = Date.parse('2026-11-17T07:00:00.000Z')
  it('starts on arrival and stops with the elapsed minutes', () => {
    const opened = startVisit(start)
    expect(opened.onSiteAt).toBe('2026-11-17T07:00:00.000Z')
    const stopped = stopVisit(opened.onSiteAt, start + 38 * 60_000)
    expect(stopped.actualMinutes).toBe(38)
    expect(actualMinutesOf({ ...opened, ...stopped, now: start + 90 * 60_000 })).toBe(38)
    expect(formatDuration(38)).toBe('38 мин')
    expect(formatDuration(90)).toBe('1 ч 30 мин')
  })
  it('keeps a running timer until it is stopped and lets the dispatcher correct it', () => {
    expect(actualMinutesOf({ onSiteAt: new Date(start).toISOString(), now: start + 8 * 60_000 })).toBe(8)
    expect(correctActualMinutes(42)).toEqual({ ok: true, minutes: 42 })
    expect(correctActualMinutes(-1).ok).toBe(false)
    expect(correctActualMinutes(24 * 60 + 1).ok).toBe(false)
    expect(actualMinutesOf({ onSiteAt: new Date(start).toISOString(), actualMinutes: 42, now: start })).toBe(42)
  })
})

describe('field service checklist', () => {
  const template = 'Осмотреть блок\nПромыть фильтры\nПромыть фильтры\n\nПроверить дренаж'
  it('builds a template, counts progress and warns about open points', () => {
    const items = checklistFromTemplate(template)
    expect(items.map(item => item.label)).toEqual(['Осмотреть блок', 'Промыть фильтры', 'Проверить дренаж'])
    const marked = toggleChecklistItem(toggleChecklistItem(items, 0), 2)
    expect(checklistProgress(marked)).toEqual({ done: 2, total: 3 })
    expect(parseChecklist(JSON.stringify(marked))).toEqual(marked)
    expect(completionChecklistWarning(marked)).toBe('Не отмечено 1 из 3 пунктов чек-листа. Можно завершить — в акте они будут помечены как невыполненные.')
    expect(completionChecklistWarning(marked.map(item => ({ ...item, done: true })))).toBeNull()
    expect(completionChecklistWarning([])).toBeNull()
  })
})

describe('field service recurrence', () => {
  const start = '2026-11-17T07:00:00.000Z'
  it('generates a weekly series until the count, the until-date or three months', () => {
    const weekly = recurrenceOccurrences({ start, rule: 'weekly', count: 4 })
    expect(weekly).toHaveLength(4)
    expect(weekly[0]).toBe(start)
    expect(weekly[1]).toBe('2026-11-24T07:00:00.000Z')
    expect(weekly[3]).toBe('2026-12-08T07:00:00.000Z')
    expect(recurrenceOccurrences({ start, rule: 'weekly', until: '2026-11-30' })).toEqual([
      start, '2026-11-24T07:00:00.000Z',
    ])
    expect(recurrenceOccurrences({ start, rule: 'biweekly', count: 3 })[2]).toBe('2026-12-15T07:00:00.000Z')
    expect(recurrenceOccurrences({ start: '2026-01-31T07:00:00.000Z', rule: 'monthly', count: 3 })).toEqual([
      '2026-01-31T07:00:00.000Z', '2026-02-28T07:00:00.000Z', '2026-03-31T07:00:00.000Z',
    ])
    expect(recurrenceOccurrences({ start: '2026-01-31T07:00:00.000Z', rule: 'quarterly', count: 2 })[1]).toBe('2026-04-30T07:00:00.000Z')
    const horizon = recurrenceOccurrences({ start, rule: 'weekly' })
    expect(horizon.at(-1)! <= '2027-02-17T07:00:00.000Z').toBe(true)
    expect(horizon.length).toBeGreaterThan(4)
    expect(repeatRuleFromName('Ежемесячно')).toBe('monthly')
    expect(repeatRuleFromName('каждый день')).toBeNull()
  })
  it('edits one visit or the later open visits of the series', () => {
    const jobs = [
      { id: 'a', seriesId: 's', when: '2026-11-17T07:00:00.000Z', status: 'Назначена' },
      { id: 'b', seriesId: 's', when: '2026-11-24T07:00:00.000Z', status: 'Назначена' },
      { id: 'c', seriesId: 's', when: '2026-12-01T07:00:00.000Z', status: 'Выполнено' },
      { id: 'd', seriesId: 'other', when: '2026-11-24T07:00:00.000Z', status: 'Назначена' },
    ]
    expect(seriesEditIds(jobs, 'a', 'one')).toEqual(['a'])
    expect(seriesEditIds(jobs, 'a', 'series')).toEqual(['a', 'b'])
    expect(seriesEditIds(jobs, 'b', 'series')).toEqual(['b'])
  })
})

describe('field service billing and address', () => {
  it('sums works and materials and hides a repeated client address', () => {
    const works = parseMoneyLines(JSON.stringify([{ name: 'Замена ламп', amount: 2800 }, { name: 'Выезд', amount: 1000 }]))
    const materials = parseMoneyLines(JSON.stringify([{ name: 'Лампа LED', amount: 400 }]))
    expect(billingTotal(works, materials)).toBe(4200)
    expect(distinctJobAddress('Москва, ул. Арбат, 12', 'Москва, ул. Арбат, 12')).toBeNull()
    expect(distinctJobAddress('Москва, ул. Арбат, 12, летняя веранда', 'Москва, ул. Арбат, 12')).toBe('Москва, ул. Арбат, 12, летняя веранда')
    expect(distinctJobAddress('', 'Москва, ул. Арбат, 12')).toBeNull()
  })
})
