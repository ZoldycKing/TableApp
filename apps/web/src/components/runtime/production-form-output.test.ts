import { describe, expect, it, vi } from 'vitest'
import type { SavedProduction } from '@/app/production-actions'
import { describeSaved } from './production-form'

vi.mock('@/app/production-actions', () => ({ previewConsumptionAction: vi.fn() }))

const saved: SavedProduction = { ok: true, repeated: false, product: 'Корпус', quantity: 10,
  wrote: [{ material: 'Пластик', amount: 0.3, unit: 'кг' }] }

describe('production completion message', () => {
  it('preserves standalone production consumption and retry messages', () => {
    expect(describeSaved(saved)).toBe('Выпуск сохранён: Корпус, 10. Списано: Пластик — 0,3 кг.')
    expect(describeSaved({ ...saved, wrote: [] })).toBe('Выпуск сохранён: Корпус, 10. Материалы не списаны: для этого изделия не задано ни одной действующей нормы.')
    expect(describeSaved({ ...saved, repeated: true })).toBe('Этот выпуск уже сохранён — второй раз материалы не списывались.')
  })
  it('shows the recorded receipt quantity and resulting shared stock together with consumption', () => {
    expect(describeSaved({ ...saved, stockReceipt: { quantity: 10, before: 5, after: 15 } })).toBe('Выпуск сохранён: Корпус, 10. На склад поступило 10 шт. Остаток — 15 шт. Списано: Пластик — 0,3 кг.')
  })
  it('reports finished stock even when the product has no active material norms', () => {
    expect(describeSaved({ ...saved, wrote: [], stockReceipt: { quantity: 10, before: 5, after: 15 } })).toBe('Выпуск сохранён: Корпус, 10. На склад поступило 10 шт. Остаток — 15 шт. Материалы не списаны: для этого изделия не задано ни одной действующей нормы.')
  })
  it('reports the receipt without exposing a stock balance hidden from the production role', () => {
    expect(describeSaved({ ...saved, stockReceipt: { quantity: 10 } })).toBe('Выпуск сохранён: Корпус, 10. На склад поступило 10 шт. Списано: Пластик — 0,3 кг.')
  })
  it('explains that retrying a connected run creates no second material consumption or finished-goods receipt', () => {
    expect(describeSaved({ ...saved, repeated: true, stockReceipt: { quantity: 10, before: 5, after: 15 } })).toBe('Этот выпуск уже сохранён — второй раз материалы не списывались и готовая продукция на склад не поступала.')
  })
})
