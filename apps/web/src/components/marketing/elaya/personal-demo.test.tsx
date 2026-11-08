// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonalSectionsDemo } from './personal-demo'
import { CalculationStory, ViewsStory } from './feature-scenes'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('./motion', () => ({
  useStoryClock: () => {
    const [step, setStep] = useState(0)
    return { ref: useRef(null), step, select: setStep, entered: true, reduced: preference.reduced, playing: false, toggle: vi.fn() }
  },
}))
beforeEach(() => { preference.reduced = false })
afterEach(cleanup)

describe('personal table to app example', () => {
  it('shows separate personal sections with their own records and the expense total', () => {
    const ui = render(<PersonalSectionsDemo />)
    fireEvent.click(ui.getByRole('button', { name: 'Расходы' }))
    expect(ui.getByText('7 970 ₽')).toBeTruthy()
    expect(ui.getByText('Продукты')).toBeTruthy()
    expect(ui.queryByText('Поездка в Карелию')).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Книги' }))
    expect(ui.getByText('Маленький принц')).toBeTruthy()
    expect(ui.queryByText('Продукты')).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Планы' }))
    expect(ui.getByText('Поездка в Карелию')).toBeTruthy()
  })

  it('retains all four work tasks when switching between the table, board and calendar', () => {
    const ui = render(<ViewsStory />)
    for (const view of ['Таблица', 'Доска', 'Календарь']) {
      fireEvent.click(ui.getByRole('button', { name: view }))
      for (const plan of ['Подготовить смету', 'Заказать материалы', 'Согласовать макет', 'Передать заказ']) expect(ui.getByText(plan)).toBeTruthy()
    }
  })

  it('recalculates an order total when a quantity changes', () => {
    const ui = render(<CalculationStory />)
    const total = () => ui.container.querySelector('[data-order-total]')!.textContent!.replace(/\s/g, '')
    expect(total()).toBe('9690₽')
    fireEvent.click(ui.getByRole('button', { name: 'Увеличить: Полка' }))
    expect(total()).toBe('12180₽')
    fireEvent.click(ui.getByRole('button', { name: 'Уменьшить: Полка' }))
    expect(total()).toBe('9690₽')
  })
})
