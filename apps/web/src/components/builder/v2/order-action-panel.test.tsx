// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BuilderV2OrderActionPanel } from './order-detail'

afterEach(cleanup)

describe('BuilderV2OrderActionPanel', () => {
  it('keeps the processing form open in persistent mode', () => {
    render(<BuilderV2OrderActionPanel title="Обработка заказа"><p>Поля статуса</p></BuilderV2OrderActionPanel>)
    expect(screen.getByText('Поля статуса')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Обработка заказа' })).toBeNull()
  })

  it('reveals the form only after the primary action and closes on cancel', () => {
    render(<BuilderV2OrderActionPanel title="Добавить запись" mode="reveal"><label>Новая запись<input /></label></BuilderV2OrderActionPanel>)
    expect(screen.queryByLabelText('Новая запись')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить запись' }))
    expect(screen.getByLabelText('Новая запись')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByLabelText('Новая запись')).toBeNull()
    expect(screen.getByRole('button', { name: 'Добавить запись' })).toBeTruthy()
  })
})
