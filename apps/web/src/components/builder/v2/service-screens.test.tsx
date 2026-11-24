// @vitest-environment jsdom
vi.hoisted(() => { process.env.DATABASE_URL ??= 'postgres://tableapp:tableapp@127.0.0.1:5433/tableapp' })
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/service-actions', () => ({ savePublishedServiceAction: vi.fn() }))
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

import { ServiceDemo } from './service-demo'

afterEach(() => cleanup())

describe('service screens', () => {
  it('shows repair list views and hides internal notes from the client', async () => {
    const list = render(<ServiceDemo view="repairs" bare />)
    expect(await screen.findByRole('heading', { name: 'Ремонты' })).toBeTruthy()
    expect(screen.getByText('Все ремонты сервисного центра.')).toBeTruthy()
    const views = await screen.findByRole('tablist', { name: 'Представления ремонтов' })
    expect(within(views).getByRole('tab', { name: /Все/ })).toBeTruthy()
    expect(within(views).getByRole('tab', { name: /Новые/ })).toBeTruthy()
    expect(within(views).getByRole('tab', { name: /В работе/ })).toBeTruthy()
    expect(within(views).getByRole('tab', { name: /Ждём запчасти/ })).toBeTruthy()
    expect(within(views).getByRole('tab', { name: /Готово к выдаче/ })).toBeTruthy()
    expect(within(views).getByRole('tab', { name: /Выдано/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Стиральная машина Bosch/ }).length).toBeGreaterThan(0)
    list.unmount()

    const desk = render(<ServiceDemo view="repair" bare />)
    expect(await screen.findByRole('heading', { name: 'Стиральная машина Bosch WLG' })).toBeTruthy()
    expect(await screen.findByText(/Заказали манжету у поставщика/)).toBeTruthy()
    const note = screen.getByText(/Заказали манжету у поставщика/).closest('[data-internal]') as HTMLElement
    expect(note).toBeTruthy()
    expect(within(note).getByText('Внутренняя заметка')).toBeTruthy()
    expect(screen.getByText(/когда будет готово/i)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Диагностика' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Работы и запчасти' })).toBeTruthy()
    expect(screen.getByText('Манжет люка Bosch')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull()
    expect(document.querySelector('[data-correspondence-sla]')).toBeNull()
    expect(await screen.findByRole('button', { name: 'Прикрепить файл' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy()
    desk.unmount()

    for (const phone of [false, true]) {
      const client = render(<ServiceDemo view="client-repair" bare phone={phone} />)
      expect(await screen.findByRole('heading', { name: 'Стиральная машина Bosch WLG' })).toBeTruthy()
      expect(await screen.findByText(/когда будет готово/i)).toBeTruthy()
      expect(screen.getByText(/Манжет люка изношен/)).toBeTruthy()
      expect(screen.queryByText(/Смету согласовываю/)).toBeNull()
      expect(screen.queryByText(/Заказали манжету у поставщика/)).toBeNull()
      expect(screen.queryByText('Внутренняя заметка')).toBeNull()
      expect(screen.queryByText('Серийный / IMEI')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Статус' })).toBeNull()
      expect(screen.getByLabelText('Прогресс ремонта')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Согласовать стоимость' })).toBeTruthy()
      expect(screen.getByText(/ул\. Сервисная/)).toBeTruthy()
      client.unmount()
    }
  })

  it('keeps the conversation composer on the repair shot page', async () => {
    render(<ServiceDemo view="repair" bare />)
    await screen.findByRole('heading', { name: 'Стиральная машина Bosch WLG' })
    expect(screen.getByRole('heading', { name: 'Переписка' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Прикрепить файл' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Убрать файл' }).length).toBeGreaterThan(0)
    expect(document.querySelector('[data-conversation-shot-panel]')).toBeTruthy()
  })

  it('opens create dialog without native select/checkbox/date', async () => {
    render(<ServiceDemo view="create" bare />)
    const dialog = await screen.findByRole('dialog', { name: 'Новый ремонт' })
    expect(within(dialog).getByRole('button', { name: 'Принять в ремонт' })).toBeTruthy()
    expect(dialog.querySelector('select')).toBeNull()
    expect(dialog.querySelector('input[type="checkbox"]')).toBeNull()
    expect(dialog.querySelector('input[type="date"]')).toBeNull()
  })

  it('shows the client cabinet with open and finished groups', async () => {
    render(<ServiceDemo view="client" bare />)
    expect(await screen.findByRole('heading', { name: /Открытые/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Завершённые/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Мои ремонты' })).toBeTruthy()
  })

  it('fills the dashboard with status counts, masters load and revenue bars', async () => {
    render(<ServiceDemo view="dashboard" bare />)
    expect(await screen.findByRole('heading', { name: 'Сервисный центр' })).toBeTruthy()
    expect(screen.getByLabelText('Показатели сервиса')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Загрузка мастеров' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Выручка по неделям' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Нужно согласование клиента' })).toBeTruthy()
    expect(screen.getAllByText('Готово к выдаче').length).toBeGreaterThan(0)
  })

  it('opens assign dialog with custom controls and Moscow date format', async () => {
    render(<ServiceDemo view="assign" bare />)
    const dialog = await screen.findByRole('dialog', { name: 'Мастер и срок' })
    expect(dialog.querySelector('select')).toBeNull()
    expect(dialog.querySelector('input[type="date"]')).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Мастер' })).toBeTruthy()
    expect(within(dialog).getByRole('radiogroup', { name: 'Статус' })).toBeTruthy()
    const date = within(dialog).getByRole('button', { name: 'Дата срока' })
    expect(date.textContent).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
  })

  it('puts conversation before facts on phone repair card', async () => {
    render(<ServiceDemo view="repair" bare phone />)
    await screen.findByRole('heading', { name: 'Стиральная машина Bosch WLG' })
    expect(screen.getByRole('button', { name: '← Ремонты' })).toBeTruthy()
    const problem = screen.getByRole('heading', { name: 'Неисправность' })
    const thread = screen.getByRole('heading', { name: 'Переписка' })
    const facts = screen.getByRole('heading', { name: 'Сведения' })
    expect(problem.compareDocumentPosition(thread) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(thread.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
