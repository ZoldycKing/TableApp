// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    expect(within(summary).getByRole('button', { name: /Просрочены/ }).textContent).toMatch(/\d/)
    expect(screen.getByRole('button', { name: 'Ждём клиента' })).toBeTruthy()
    const openTicket = screen.getAllByRole('button', { name: /Не открывается кабинет/ })[0]
    expect(openTicket?.textContent).toMatch(/ОБР-1048/)
    expect(openTicket?.textContent?.trim().startsWith('Не открывается кабинет')).toBe(true)
    expect(screen.getAllByText(/просроч/i).length).toBeGreaterThan(0)
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

  it('edits and sets a deadline in Moscow time without shifting it on a second save', async () => {
    for (const phone of [false, true]) {
      const view = render(<SupportDemo view="assign" bare phone={phone} />)
      const dialog = await screen.findByRole('dialog', { name: 'Ответственный и срок' })
      const date = within(dialog).getByRole('button', { name: 'Дата срока' })
      const time = within(dialog).getByLabelText('Время срока') as HTMLInputElement
      expect(date.textContent).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
      expect(time.value).toMatch(/^\d{2}:\d{2}$/)
      expect(dialog.textContent).not.toMatch(/AM|PM/)
      expect(dialog.querySelector('input[type="date"]')).toBeNull()
      fireEvent.click(date)
      const calendar = within(dialog).getByRole('dialog', { name: 'Дата срока' })
      fireEvent.click(within(calendar).getByRole('button', { name: '15' }))
      expect(date.textContent).toMatch(/^15\.\d{2}\.\d{4}$/)
      fireEvent.change(time, { target: { value: '09:05' } })
      expect(time.value).toBe('09:05')
      const shown = date.textContent?.trim() ?? ''
      fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
      const deadline = () => [...document.querySelectorAll('dt')].find(term => term.textContent?.trim() === 'Срок')?.nextElementSibling?.textContent?.trim() ?? ''
      expect(await screen.findByText((_, node) => node?.tagName === 'DD' && (node.textContent ?? '').startsWith(`${shown}, 09:05`))).toBeTruthy()
      const afterEdit = deadline()
      fireEvent.click(screen.getByText('Статус и назначение'))
      fireEvent.click(screen.getByRole('button', { name: 'Назначить' }))
      const again = await screen.findByRole('dialog', { name: 'Ответственный и срок' })
      expect(within(again).getByRole('button', { name: 'Дата срока' }).textContent?.trim()).toBe(shown)
      expect((within(again).getByLabelText('Время срока') as HTMLInputElement).value).toBe('09:05')
      fireEvent.click(within(again).getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Ответственный и срок' })).toBeNull()
        expect(deadline()).toBe(afterEdit)
      })
      expect(screen.queryByText(/AM|PM/)).toBeNull()
      view.unmount()
    }
  })

  it('opens the client form with the save action visible', async () => {
    render(<SupportDemo view="create" bare />)
    const dialog = await screen.findByRole('dialog', { name: 'Новое обращение' })
    expect(screen.getByRole('button', { name: 'Отправить обращение' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Написать на почту' })).toBeNull()
    expect(dialog.querySelector('select')).toBeNull()
    expect(dialog.querySelector('input[type="checkbox"]')).toBeNull()
    expect(dialog.querySelector('input[type="date"]')).toBeNull()
    expect(within(dialog).getByRole('radiogroup', { name: 'Категория' })).toBeTruthy()
  })

  it('uses choice chips instead of native selects in assign', async () => {
    render(<SupportDemo view="assign" bare />)
    const dialog = await screen.findByRole('dialog', { name: 'Ответственный и срок' })
    expect(dialog.querySelector('select')).toBeNull()
    expect(dialog.querySelector('input[type="date"]')).toBeNull()
    expect(within(dialog).getByRole('radiogroup', { name: 'Ответственный' })).toBeTruthy()
    expect(within(dialog).getByRole('radiogroup', { name: 'Категория' })).toBeTruthy()
    expect(within(dialog).getByRole('radiogroup', { name: 'Приоритет' })).toBeTruthy()
  })

  it('desktop board: drag cards and ⋯ status menu, no advance or arrows', async () => {
    render(<SupportDemo view="board" bare />)
    await screen.findByRole('heading', { name: 'Доска' })
    expect(document.querySelector('[data-board-advance]')).toBeNull()
    expect(screen.queryByText('▶ Статус')).toBeNull()
    expect(screen.queryByText('→')).toBeNull()
    const menuButtons = screen.getAllByLabelText('Ещё')
    expect(menuButtons.length).toBeGreaterThan(0)
    fireEvent.click(menuButtons[0]!)
    const menu = screen.getByRole('menu', { name: 'Сменить статус' })
    expect(within(menu).getByText('Сменить статус')).toBeTruthy()
    expect(menu.querySelector('select')).toBeNull()
  })

  it('phone board: one advance verb plus ⋯ menu', async () => {
    render(<SupportDemo view="board" bare phone />)
    await screen.findByRole('heading', { name: 'Доска' })
    expect(screen.queryByText('▶ Статус')).toBeNull()
    expect((await screen.findAllByText('Ждём клиента')).some(node => node.closest('[data-board-advance]'))).toBe(true)
    expect(document.querySelectorAll('[data-board-advance]').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByLabelText('Ещё')[0]!)
    expect(screen.getByRole('menu', { name: 'Сменить статус' })).toBeTruthy()
  })
})
