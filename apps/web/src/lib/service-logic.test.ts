import { describe, expect, it } from 'vitest'
import {
  filterRepairs, formatMoney, isOverdueRepair, parseServiceLines, serviceClientStepIndex,
  serviceDashboard, serviceDeadlineCountdown, waitingPickupDays, type ServiceListItem,
} from './service-logic'

const item = (partial: Partial<ServiceListItem> & Pick<ServiceListItem, 'id' | 'status'>): ServiceListItem => ({
  number: 'РМ-1', device: 'Устройство', serial: '', problem: '', clientName: '', masterName: '', masterEmail: '',
  cost: 0, deadline: '', updatedAt: '', ...partial,
})

describe('serviceDashboard', () => {
  it('counts statuses, overdue and revenue; ready-for-pickup is not overdue', () => {
    const now = Date.parse('2026-11-24T12:00:00+03:00')
    const items = [
      item({ id: '1', status: 'Новые' }),
      item({ id: '2', status: 'В работе', deadline: '2026-11-20T17:00:00.000Z', cost: 1000 }),
      item({ id: '3', status: 'Ждём запчасти', cost: 2000 }),
      item({ id: '4', status: 'Готово к выдаче', deadline: '2026-11-20T17:00:00.000Z', cost: 5000 }),
      item({ id: '5', status: 'Выдано', cost: 3000, updatedAt: '2026-11-22T10:00:00.000Z' }),
      item({ id: '6', status: 'Отменён', cost: 100 }),
      item({ id: '7', status: 'В работе', approval: 'На согласовании', cost: 7800, masterEmail: 'a@x.ru', masterName: 'Андрей' }),
    ]
    expect(isOverdueRepair('Готово к выдаче', '2026-11-20T17:00:00.000Z', now)).toBe(false)
    expect(isOverdueRepair('В работе', '2026-11-20T17:00:00.000Z', now)).toBe(true)
    expect(waitingPickupDays('Готово к выдаче', '2026-11-20T17:00:00.000Z', now)).toBeGreaterThan(0)
    const dash = serviceDashboard(items, now)
    expect(dash.fresh).toBe(1)
    expect(dash.overdue).toBe(1)
    expect(dash.ready).toBe(1)
    expect(dash.needsApproval).toHaveLength(1)
    expect(dash.masters[0]?.open).toBe(1)
    expect(formatMoney(14700)).toMatch(/14.?700/)
  })

  it('formats deadline badges with sage/amber/overdue/ready tones', () => {
    const now = Date.parse('2026-11-24T12:00:00+03:00')
    expect(serviceDeadlineCountdown('В работе', '2026-11-28T12:00:00+03:00', now).tone).toBe('sage')
    expect(serviceDeadlineCountdown('В работе', '2026-11-24T12:30:00+03:00', now).tone).toBe('amber')
    expect(serviceDeadlineCountdown('В работе', '2026-11-20T12:00:00+03:00', now).tone).toBe('overdue')
    expect(serviceDeadlineCountdown('Готово к выдаче', '2026-11-20T12:00:00+03:00', now).tone).toBe('ready')
    expect(serviceDeadlineCountdown('Готово к выдаче', '2026-11-24T18:00:00+03:00', now)).toMatchObject({
      tone: 'ready',
      label: 'Ждёт выдачи',
    })
    expect(waitingPickupDays('Готово к выдаче', '2026-11-24T18:00:00+03:00', now)).toBe(0)
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

  it('parses estimate lines and client stepper', () => {
    expect(parseServiceLines('[{"name":"Манжет","qty":1,"price":3200,"kind":"part"}]')).toEqual([
      { name: 'Манжет', qty: 1, price: 3200, kind: 'part' },
    ])
    expect(serviceClientStepIndex('Новые', '')).toBe(0)
    expect(serviceClientStepIndex('В работе', '')).toBe(1)
    expect(serviceClientStepIndex('В работе', 'Износ')).toBe(2)
    expect(serviceClientStepIndex('Готово к выдаче', 'x')).toBe(3)
    expect(serviceClientStepIndex('Выдано', 'x')).toBe(4)
  })
})
