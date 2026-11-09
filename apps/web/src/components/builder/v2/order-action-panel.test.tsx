// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BuilderV2OrderActionPanel } from './order-detail'

afterEach(cleanup)

describe('BuilderV2OrderActionPanel', () => {
  it('keeps the processing form open in persistent mode', () => {
    render(createElement(BuilderV2OrderActionPanel, { title: 'Обработка заказа' }, createElement('p', null, 'Поля статуса')))
    expect(screen.getByText('Поля статуса')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Обработка заказа' })).toBeNull()
  })

  it('reveals the form only after the primary action and closes on cancel', () => {
    render(createElement(BuilderV2OrderActionPanel, { title: 'Добавить запись', mode: 'reveal' }, createElement('label', null, 'Новая запись', createElement('input'))))
    expect(screen.queryByLabelText('Новая запись')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить запись' }))
    expect(screen.getByLabelText('Новая запись')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByLabelText('Новая запись')).toBeNull()
    expect(screen.getByRole('button', { name: 'Добавить запись' })).toBeTruthy()
  })

  it('opens pencil and journal triggers separately', () => {
    render(createElement(BuilderV2OrderActionPanel, {
      mode: 'reveal',
      triggers: [
        { id: 'edit', title: 'Изменить сделку', icon: 'edit', children: createElement('label', null, 'Этап', createElement('input')) },
        { id: 'journal', title: 'Добавить запись', primary: true, children: createElement('label', null, 'Новая запись', createElement('input')) },
      ],
    }))
    expect(screen.getByRole('button', { name: 'Изменить сделку' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Изменить сделку' }))
    expect(screen.getByLabelText('Этап')).toBeTruthy()
    expect(screen.queryByLabelText('Новая запись')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    fireEvent.click(screen.getByRole('button', { name: 'Добавить запись' }))
    expect(screen.getByLabelText('Новая запись')).toBeTruthy()
  })
})
