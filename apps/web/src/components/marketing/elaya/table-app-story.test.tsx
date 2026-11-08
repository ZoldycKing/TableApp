// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TableAppStory } from './table-app-story'

const preference = vi.hoisted(() => ({ reduced: false, initial: 0 }))
vi.mock('./motion', () => ({
  useStoryClock: () => {
    const [step, setStep] = useState(preference.initial)
    return { ref: useRef(null), step, select: setStep, entered: true, reduced: preference.reduced, playing: false, toggle: vi.fn() }
  },
}))
beforeEach(() => { preference.reduced = false; preference.initial = 0 })
afterEach(cleanup)

const compact = (text: string | null) => text?.replace(/\s/g, '')

describe('tables to a configurable application', () => {
  it('shows the selected sheet as an application section and calculates the expense total', () => {
    const ui = render(<TableAppStory audience="personal" />)
    fireEvent.click(ui.getByRole('tab', { name: 'Расходы' }))
    const source = ui.getByRole('table', { name: 'Лист «Расходы»' })
    const phone = within(ui.getByRole('group', { name: 'Пример вашего приложения' }))
    expect(compact(phone.getByText(/13.*650/).textContent)).toBe('13650₽')
    for (const name of ['Краска и кисти', 'Билеты на поезд', 'Курс фотографии']) {
      expect(within(source).getByRole('button', { name: `Открыть: ${name}` })).toBeTruthy()
      expect(phone.getByRole('button', { name: new RegExp(name) })).toBeTruthy()
    }
    expect(within(ui.getByRole('navigation', { name: 'Разделы приложения' })).getByRole('button', { name: 'Бюджет' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('opens a project from the table, updates its status on both screens, and can undo', () => {
    const ui = render(<TableAppStory audience="personal" />)
    const source = ui.getByRole('table', { name: 'Лист «Проекты»' })
    const row = within(source).getByRole('button', { name: 'Открыть: Ремонт комнаты' }).closest('tr')!
    fireEvent.click(within(row).getByRole('button'))
    const phone = within(ui.getByRole('group', { name: 'Пример вашего приложения' }))
    expect(phone.getByRole('heading', { name: 'Ремонт комнаты' })).toBeTruthy()
    expect(compact(phone.getByText(/28.*700/).textContent)).toBe('28700₽')
    fireEvent.click(phone.getByRole('button', { name: 'Завершить проект' }))
    expect(within(row).getByText('Готово')).toBeTruthy()
    expect(phone.getByText('Готово')).toBeTruthy()
    expect(phone.getByRole('status').textContent).toBe('Статус изменился и в таблице')
    fireEvent.click(phone.getByRole('button', { name: 'Отменить отметку' }))
    expect(within(row).getByText('В работе')).toBeTruthy()
    fireEvent.click(phone.getByRole('button', { name: 'К списку' }))
    expect(phone.getByRole('list', { name: 'Проекты' })).toBeTruthy()
  })

  it('uses custom screen names and completes only the selected task', () => {
    const ui = render(<TableAppStory audience="personal" />)
    const navigation = within(ui.getByRole('navigation', { name: 'Разделы приложения' }))
    fireEvent.click(navigation.getByRole('button', { name: 'Мои дела' }))
    const table = within(ui.getByRole('table', { name: 'Лист «Задачи»' }))
    const first = table.getByRole('button', { name: 'Открыть: Выбрать материалы' }).closest('tr')!
    const second = table.getByRole('button', { name: 'Открыть: Забронировать жильё' }).closest('tr')!
    fireEvent.click(within(first).getByRole('button'))
    fireEvent.click(ui.getByRole('button', { name: 'Отметить выполненным' }))
    expect(within(first).getByText('Готово')).toBeTruthy()
    expect(within(second).getByText('Сделать')).toBeTruthy()
    fireEvent.click(navigation.getByRole('button', { name: 'Проекты' }))
    fireEvent.click(navigation.getByRole('button', { name: 'Мои дела' }))
    expect(within(ui.getByRole('table', { name: 'Лист «Задачи»' })).getByText('Готово')).toBeTruthy()
  })

  it('preserves focus when selecting sheets with the keyboard', () => {
    const ui = render(<TableAppStory audience="personal" />)
    fireEvent.keyDown(ui.getByRole('tab', { name: 'Проекты' }), { key: 'End' })
    const expenses = ui.getByRole('tab', { name: 'Расходы' })
    expect(document.activeElement).toBe(expenses)
    expect(expenses.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(expenses, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(ui.getByRole('tab', { name: 'Проекты' }))
  })

  it('keeps the application usable without autoplay under reduced motion', () => {
    preference.reduced = true
    const ui = render(<TableAppStory audience="personal" />)
    expect(ui.getByRole('button', { name: 'Продолжить показ' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(ui.getByRole('tab', { name: 'Проекты' }))
    fireEvent.click(ui.getByRole('button', { name: 'Открыть: Ремонт комнаты' }))
    fireEvent.click(ui.getByRole('button', { name: 'Завершить проект' }))
    expect(ui.getByRole('status').textContent).toBe('Статус изменился и в таблице')
  })

  it('opens the budget correctly when autoplay reaches that section', () => {
    preference.initial = 2
    const ui = render(<TableAppStory audience="personal" />)
    expect(ui.getByRole('tab', { name: 'Расходы' }).getAttribute('aria-selected')).toBe('true')
    expect(ui.getByText('Всего расходов')).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Открыть: Билеты на поезд' }))
    const phone = within(ui.getByRole('group', { name: 'Пример вашего приложения' }))
    expect(phone.getByRole('heading', { name: 'Билеты на поезд' })).toBeTruthy()
    expect(compact(phone.getByText(/2.*490/).textContent)).toBe('2490₽')
    expect(phone.queryByRole('button', { name: 'Завершить проект' })).toBeNull()
  })
})


describe('business as the primary audience', () => {
  it('updates the compact mobile result when the same order is completed and undone', () => {
    const ui = render(<TableAppStory />)
    const mobile = within(ui.getByRole('table', { name: 'Результат в таблице «Заказы»' }))
    const phone = within(ui.getByRole('group', { name: 'Пример вашего приложения' }))
    expect(mobile.getByText('Стеллаж для офиса')).toBeTruthy()
    expect(mobile.getByText('В работе')).toBeTruthy()
    fireEvent.click(phone.getByRole('button', { name: /Стеллаж для офиса/ }))
    fireEvent.click(phone.getByRole('button', { name: 'Завершить заказ' }))
    expect(mobile.getByText('Готово')).toBeTruthy()
    fireEvent.click(phone.getByRole('button', { name: 'Отменить отметку' }))
    expect(mobile.getByText('В работе')).toBeTruthy()
    fireEvent.click(within(ui.getByRole('navigation', { name: 'Разделы приложения' })).getByRole('button', { name: 'Финансы' }))
    expect(ui.getByRole('table', { name: 'Результат в таблице «Расходы»' }).textContent).toContain('Мебельные щиты')
  })
  it('opens business orders by default and updates the order in both views', () => {
    const ui = render(<TableAppStory />)
    const table = within(ui.getByRole('table', { name: 'Лист «Заказы»' }))
    expect(ui.getByText('Учёт мастерской.xlsx')).toBeTruthy()
    fireEvent.click(table.getByRole('button', { name: 'Открыть: Стеллаж для офиса' }))
    fireEvent.click(ui.getByRole('button', { name: 'Завершить заказ' }))
    expect(table.getByText('Готово')).toBeTruthy()
    expect(ui.getByRole('status').textContent).toBe('Статус изменился и в таблице')
    expect(ui.queryByText('Поездка в Карелию')).toBeNull()
  })

  it('shows team tasks and business expenses in their sections', () => {
    const ui = render(<TableAppStory />)
    fireEvent.click(ui.getByRole('button', { name: 'Команда' }))
    expect(ui.getByRole('table', { name: 'Лист «Задачи»' })).toBeTruthy()
    expect(ui.getByRole('button', { name: 'Открыть: Подготовить чертёж' })).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Финансы' }))
    const phone = within(ui.getByRole('group', { name: 'Пример вашего приложения' }))
    expect(phone.getByText('Расходы мастерской')).toBeTruthy()
    expect(compact(phone.getByText(/13.*650/).textContent)).toBe('13650₽')
  })
})
