import { describe, expect, it } from 'vitest'
import { filterRepairs, formatMoney, isOverdueRepair, serviceDashboard, type ServiceListItem } from './service-logic'

const item = (partial: Partial<ServiceListItem> & Pick<ServiceListItem, 'id' | 'status'>): ServiceListItem => ({
  number: 'РМ-1', device: 'Устройство', serial: '', problem: '', clientName: '', masterName: '', masterEmail: '',
  cost: 0, deadline: '', updatedAt: '', ...partial,
})

describe('serviceDashboard', () => {
  it('counts statuses, overdue and revenue for ready/done repairs', () => {
    const now = Date.parse('2026-11-24T12:00:00+03:00')
    const items = [
      item({ id: '1', status: 'Новые' }),
      item({ id: '2', status: 'В работе', deadline: '2026-11-20T17:00:00.000Z', cost: 1000 }),
      item({ id: '3', status: 'Ждём запчасти', cost: 2000 }),
      item({ id: '4', status: 'Готово к выдаче', cost: 5000 }),
      item({ id: '5', status: 'Выдано', cost: 3000 }),
      item({ id: '6', status: 'Отменён', cost: 100 }),
    ]
    expect(serviceDashboard(items, now)).toEqual({
      fresh: 1, progress: 1, parts: 1, ready: 1, done: 1, cancelled: 1,
      overdue: 1, revenue: 8000, open: 4,
    })
    expect(isOverdueRepair('В работе', '2026-11-20T17:00:00.000Z', now)).toBe(true)
    expect(isOverdueRepair('Выдано', '2026-11-20T17:00:00.000Z', now)).toBe(false)
    expect(formatMoney(14700)).toMatch(/14.?700/)
  })

  it('filters repair list views by status', () => {
    const now = Date.parse('2026-11-24T12:00:00+03:00')
    const items = [
      item({ id: 'a', status: 'Новые' }),
      item({ id: 'b', status: 'В работе' }),
      item({ id: 'c', status: 'Готово к выдаче', device: 'Кофемашина' }),
    ]
    expect(filterRepairs(items, { search: '', view: 'fresh' }, now).map(row => row.id)).toEqual(['a'])
    expect(filterRepairs(items, { search: '', view: 'progress' }, now).map(row => row.id)).toEqual(['b'])
    expect(filterRepairs(items, { search: 'кофе', view: 'all' }, now).map(row => row.id)).toEqual(['c'])
  })
})
