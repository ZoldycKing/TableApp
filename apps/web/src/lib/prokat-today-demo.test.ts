import { describe, expect, it } from 'vitest'
import {
  DEMO_TODAY_ISO,
  DEMO_TODAY_METRICS,
  prokatDemoTodayAgenda,
  prokatDemoTodaySubtitle,
  prokatDemoTodayUrgent,
} from './prokat-today-demo'

describe('prokat today demo', () => {
  it('keeps Friday 27.11.2026 and metrics 2 / 2 / 1', () => {
    expect(DEMO_TODAY_ISO).toBe('2026-11-27')
    expect(DEMO_TODAY_METRICS).toEqual({ issue: 2, return: 2, overdue: 1 })
    expect(prokatDemoTodaySubtitle()).toBe('Пятница, 27.11.2026 · 14 предметов в прокате')
  })

  it('lists one urgent and four day tasks', () => {
    const urgent = prokatDemoTodayUrgent()
    const agenda = prokatDemoTodayAgenda()
    expect(urgent).toHaveLength(1)
    expect(urgent[0]?.action).toBe('Позвонить')
    expect(urgent[0]?.stamp).toBe('вчера')
    expect(agenda).toHaveLength(4)
    expect(agenda.map(row => row.stamp)).toEqual(['10:00', '12:00', '18:00', '20:00'])
    expect(agenda.filter(row => row.kind === 'issue')).toHaveLength(2)
    expect(agenda.filter(row => row.kind === 'return')).toHaveLength(2)
  })
})
