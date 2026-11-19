// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/projects-actions', () => ({ savePublishedProjectsAction: vi.fn() }))
vi.mock('@/app/builder-v2-data-actions', () => ({ readBuilderV2DataAction: vi.fn(), readBuilderV2RecordAction: vi.fn() }))
vi.mock('@/app/builder-v2-published-actions', () => ({
  readPublishedV2DataAction: vi.fn(),
  readPublishedV2RecordAction: vi.fn(),
  inspectPublishedV2FormAction: vi.fn(),
  submitPublishedV2FormAction: vi.fn(),
  inspectPublishedV2ButtonAction: vi.fn(),
  submitPublishedV2ButtonAction: vi.fn(),
  inspectPublishedV2DeleteAction: vi.fn(),
  submitPublishedV2DeleteAction: vi.fn(),
}))
vi.mock('@/app/dispatch-actions', () => ({
  savePublishedDispatchAction: vi.fn(),
  savePublishedDispatchActAction: vi.fn(),
}))

import { InvoicesDemo } from './invoices-demo'

afterEach(() => cleanup())

describe('invoices UI polish', () => {
  it('list uses sage primary new-document button and filters modal', async () => {
    render(<InvoicesDemo view="home" bare />)
    const create = await screen.findByRole('button', { name: /Новый документ/ })
    expect(create.querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Все' })).toBeTruthy()
    expect(screen.queryByText('Все даты')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByText('Все даты')).toBeTruthy()
  })

  it('editor uses searchable client picker and secondary manual line', async () => {
    render(<InvoicesDemo view="edit" bare />)
    await screen.findByRole('heading', { name: 'Редактировать документ' })
    expect(screen.queryByText('—')).toBeNull()
    expect(screen.getByRole('button', { name: 'Строка вручную' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Выберите клиента|ООО/ }))
    expect(screen.getByLabelText('Найти клиента')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Новый клиент/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeTruthy()
  })

  it('document detail shows compact badge, totals and action verbs', async () => {
    render(<InvoicesDemo view="document" bare />)
    await screen.findByText(/СЧ-2026/)
    expect(screen.getByRole('button', { name: 'Редактировать' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Внести оплату' })).toBeTruthy()
    expect(screen.getByText('Подытог')).toBeTruthy()
    expect(screen.getByText('без НДС')).toBeTruthy()
    const badge = document.querySelector('[class*="badge"]') as HTMLElement
    expect(badge).toBeTruthy()
    expect(badge.className).toMatch(/badge/)
  })
})
