// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/support-actions', () => ({ savePublishedSupportAction: vi.fn() }))
vi.mock('@/app/projects-actions', () => ({ savePublishedProjectsAction: vi.fn() }))
vi.mock('@/app/dispatch-actions', () => ({ savePublishedDispatchAction: vi.fn(), savePublishedDispatchActAction: vi.fn() }))
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

import { SupportDemo } from './support-demo'

afterEach(() => cleanup())

describe('support screens', () => {
  it('shows the operator queue with overdue work and hides internal notes from the client', async () => {
    const queue = render(<SupportDemo view="queue" bare />)
    const summary = await screen.findByRole('group', { name: 'Сводка обращений' })
    expect(within(summary).getByRole('button', { name: /Просроченные/ }).textContent).toContain('2')
    expect(within(summary).getByRole('button', { name: /Ждём клиента/ }).textContent).toContain('2')
    expect(screen.getAllByRole('button', { name: /Не открывается кабинет/ }).length).toBeGreaterThan(0)
    queue.unmount()

    const operator = render(<SupportDemo view="ticket" bare />)
    expect(await screen.findByText(/в ответ клиенту это не писать/)).toBeTruthy()
    expect(screen.getByText('Внутренняя заметка. Клиент это не видит.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ответить' })).toBeTruthy()
    expect(screen.getByText('Статус и назначение')).toBeTruthy()
    operator.unmount()

    for (const phone of [false, true]) {
      const client = render(<SupportDemo view="client-ticket" bare phone={phone} />)
      const thread = await screen.findByRole('list', { name: 'Хронология' })
      const own = within(thread).getByText('Пётр Орлов').closest('li') as HTMLElement
      const reply = within(thread).getByText('Анна Волкова').closest('li') as HTMLElement
      expect(within(own).getByText('Клиент')).toBeTruthy()
      expect(within(own).queryByText('Ответ клиенту')).toBeNull()
      expect(within(reply).getByText('Ответ клиенту')).toBeTruthy()
      expect(screen.queryByText(/в ответ клиенту это не писать/)).toBeNull()
      expect(screen.queryByText('Внутренняя заметка. Клиент это не видит.')).toBeNull()
      expect(screen.getByRole('heading', { name: 'Не сходится сумма в отчёте за октябрь' })).toBeTruthy()
      client.unmount()
    }
  })

  it('opens the client form with the save action visible', async () => {
    render(<SupportDemo view="create" bare />)
    expect(await screen.findByRole('dialog', { name: 'Новое обращение' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить обращение' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Написать на почту' })).toBeNull()
  })
})
