// @vitest-environment jsdom
import { createElement, type ReactNode, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BuilderV2OrderActionPanel } from './order-detail'
import { PublishedV2Context, type PublishedV2Transport } from './published-context'

afterEach(cleanup)

function withHeaderAccessory(ui: ReactNode) {
  function Harness() {
    const [accessory, setHeaderAccessory] = useState<ReactNode>(null)
    const transport = { setHeaderAccessory } as PublishedV2Transport
    return createElement(PublishedV2Context.Provider, { value: transport },
      createElement('header', null, accessory),
      ui,
    )
  }
  return createElement(Harness)
}

describe('BuilderV2OrderActionPanel', () => {
  it('keeps the processing form open in persistent mode', () => {
    render(createElement(BuilderV2OrderActionPanel, { title: 'Обработка заказа' }, createElement('p', null, 'Поля статуса')))
    expect(screen.getByText('Поля статуса')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Обработка заказа' })).toBeNull()
  })

  it('opens a centered dialog after the primary action and closes on cancel', () => {
    render(createElement(BuilderV2OrderActionPanel, { title: 'Добавить запись', mode: 'reveal' }, createElement('label', null, 'Новая запись', createElement('input'))))
    expect(screen.queryByLabelText('Новая запись')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить запись' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Новая запись')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByLabelText('Новая запись')).toBeNull()
    expect(screen.getByRole('button', { name: 'Добавить запись' })).toBeTruthy()
  })

  it('closes the dialog on Escape and backdrop click', () => {
    render(createElement(BuilderV2OrderActionPanel, { title: 'Добавить запись', mode: 'reveal' }, createElement('label', null, 'Новая запись', createElement('input'))))
    fireEvent.click(screen.getByRole('button', { name: 'Добавить запись' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить запись' }))
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).toBeNull()
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

  it('puts pipeline actions into the identity header and keeps a mobile dock', () => {
    const { container } = render(withHeaderAccessory(createElement(BuilderV2OrderActionPanel, {
      mode: 'reveal',
      identity: { status: 'Переговоры', amount: '780 000 ₽', amountLabel: 'Сумма', client: 'ООО Вектор' },
      triggers: [
        { id: 'edit', title: 'Изменить сделку', icon: 'edit', children: createElement('label', null, 'Этап', createElement('input')) },
        { id: 'journal', title: 'Добавить запись', primary: true, children: createElement('p', null, 'Журнал') },
      ],
    })))
    expect(screen.getByText('Этап')).toBeTruthy()
    expect(screen.getByText('Сумма')).toBeTruthy()
    expect(screen.getByText('780 000 ₽')).toBeTruthy()
    expect(container.querySelector('[data-variant="pipeline"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-placement="desktop"] button')).toHaveLength(2)
    // Mobile dock is text-only (primary action); the pencil is mounted into the page header.
    expect(container.querySelectorAll('[data-placement="mobile"][aria-label="Действия"] button')).toHaveLength(1)
    expect(container.querySelector('header [aria-label="Изменить сделку"]')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Поставка' })).toBeNull()
  })
})
