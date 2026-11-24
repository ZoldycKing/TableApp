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
  it('shows operator tickets with saved views and hides internal notes from the client', async () => {
    const queue = render(<SupportDemo view="queue" bare />)
    expect(await screen.findByRole('heading', { name: 'Тикеты' })).toBeTruthy()
    expect(screen.getByText('Все обращения службы поддержки.')).toBeTruthy()
    const views = await screen.findByRole('tablist', { name: 'Представления тикетов' })
    expect(within(views).getByRole('tab', { name: /Все открытые/ }).getAttribute('aria-selected')).toBe('true')
    expect(within(views).getByRole('tab', { name: /Горит по сроку/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Мои' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Доска' })).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Разделы приложения' }).textContent).not.toMatch(/Очередь|Доска/)
    expect(screen.getByRole('button', { name: 'Ответственный' })).toBeTruthy()
    const openTicket = screen.getAllByRole('button', { name: /Не открывается кабинет/ })[0]
    expect(openTicket?.textContent).toMatch(/ОБР-1048/)
    expect(document.querySelectorAll('[data-sla-badge][data-tone="overdue"]').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/просроч/i).length).toBeGreaterThan(0)
    fireEvent.click(within(views).getByRole('tab', { name: /Горит по сроку/ }))
    expect(within(views).getByRole('tab', { name: /Горит по сроку/ }).getAttribute('aria-selected')).toBe('true')
    queue.unmount()

    const operator = render(<SupportDemo view="ticket" bare />)
    expect(await screen.findByText('Клиент ждёт ответ по акту.')).toBeTruthy()
    const note = screen.getByText('Клиент ждёт ответ по акту.').closest('[data-internal]') as HTMLElement
    expect(note).toBeTruthy()
    expect(within(note).getByText('Внутренняя заметка')).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Режим ответа' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Прикрепить файл' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Убрать файл' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/акт-приёмки\.pdf/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Статус и назначение')).toBeNull()
    expect(screen.getByRole('button', { name: 'Статус' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ответственный' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Приоритет' })).toBeTruthy()
    expect(document.querySelector('[data-sla-badge]')).toBeTruthy()
    expect(screen.getByText(/Ответ за|Решение за/)).toBeTruthy()
    operator.unmount()

    for (const phone of [false, true]) {
      const client = render(<SupportDemo view="client-ticket" bare phone={phone} />)
      expect(await screen.findByRole('heading', { name: 'Не сходится сумма в отчёте за октябрь' })).toBeTruthy()
      expect(screen.getByText('Добрый день. Прикладываю акт и фото по заявке.')).toBeTruthy()
      expect(screen.queryByText('Клиент ждёт ответ по акту.')).toBeNull()
      expect(screen.queryByText('Внутренняя заметка')).toBeNull()
      expect(screen.queryByRole('radio', { name: 'Внутренняя заметка' })).toBeNull()
      client.unmount()
    }
  })

  it('keeps the secure-upload composer with paperclip, pending chips and Отправить on the ticket page', async () => {
    render(<SupportDemo view="ticket" bare />)
    await screen.findByRole('heading', { name: 'Не сходится сумма в отчёте за октябрь' })
    expect(screen.getByRole('button', { name: 'Прикрепить файл' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ответить' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Убрать файл' }).length).toBeGreaterThan(0)
    expect(screen.getByText(/комментарий\.docx/)).toBeTruthy()
    expect(screen.getAllByText(/акт-приёмки\.pdf/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/фото-дефекта\.jpg|Проверяется/).length).toBeGreaterThan(0)
    expect(document.querySelector('[data-support-composer]')).toBeNull()
  })

  it('edits and sets a deadline in Moscow time without shifting it on a second save', async () => {
    for (const phone of [false, true]) {
      const view = render(<SupportDemo view="assign" bare phone={phone} />)
      const dialog = await screen.findByRole('dialog', { name: 'Ответственный и срок' })
      const date = within(dialog).getByRole('button', { name: 'Дата срока' })
      const time = within(dialog).getByRole('button', { name: 'Время срока' })
      expect(date.textContent).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
      expect(time.textContent).toMatch(/^\d{2}:\d{2}$/)
      expect(dialog.textContent).not.toMatch(/AM|PM/)
      expect(dialog.querySelector('input[type="date"]')).toBeNull()
      expect(dialog.querySelector('input[type="time"]')).toBeNull()
      fireEvent.click(date)
      const calendar = within(dialog).getByRole('dialog', { name: 'Дата срока' })
      fireEvent.click(within(calendar).getByRole('button', { name: '15' }))
      expect(date.textContent).toMatch(/^15\.\d{2}\.\d{4}$/)
      fireEvent.click(time)
      const clock = within(dialog).getByRole('dialog', { name: 'Время срока' })
      fireEvent.click(within(within(clock).getByRole('listbox', { name: 'Часы' })).getByRole('option', { name: '09' }))
      fireEvent.click(within(dialog).getByRole('button', { name: 'Время срока' }))
      const clockAgain = within(dialog).getByRole('dialog', { name: 'Время срока' })
      fireEvent.click(within(within(clockAgain).getByRole('listbox', { name: 'Минуты' })).getByRole('option', { name: '05' }))
      expect(time.textContent).toBe('09:05')
      const shown = date.textContent?.trim() ?? ''
      fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
      const deadline = () => [...document.querySelectorAll('dt')].find(term => term.textContent?.trim() === 'Срок')?.nextElementSibling?.textContent?.trim() ?? ''
      expect(await screen.findByText((_, node) => node?.tagName === 'DD' && (node.textContent ?? '').startsWith(`${shown}, 09:05`))).toBeTruthy()
      const afterEdit = deadline()
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${shown.replace('.', '\\.')}`) }))
      const again = await screen.findByRole('dialog', { name: 'Ответственный и срок' })
      expect(within(again).getByRole('button', { name: 'Дата срока' }).textContent?.trim()).toBe(shown)
      expect(within(again).getByRole('button', { name: 'Время срока' }).textContent?.trim()).toBe('09:05')
      fireEvent.click(within(again).getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Ответственный и срок' })).toBeNull()
        expect(deadline()).toBe(afterEdit)
      })
      expect(screen.queryByText(/AM|PM/)).toBeNull()
      view.unmount()
    }
  })

  it('edits status inline in Сведения and keeps the reply composer without a duplicate header button on desktop', async () => {
    const desktop = render(<SupportDemo view="ticket" bare />)
    await screen.findByRole('heading', { name: 'Не сходится сумма в отчёте за октябрь' })
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ответить' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Статус' }))
    const statusMenu = screen.getByRole('listbox', { name: 'Статус' })
    expect(statusMenu.querySelector('select')).toBeNull()
    fireEvent.click(within(statusMenu).getByRole('option', { name: 'Ждём клиента' }))
    await waitFor(() => expect(screen.getAllByText('Ждём клиента').length).toBeGreaterThan(0))
    desktop.unmount()

    render(<SupportDemo view="ticket" bare phone />)
    await screen.findByRole('heading', { name: 'Не сходится сумма в отчёте за октябрь' })
    const modes = screen.getByRole('radiogroup', { name: 'Режим ответа' })
    expect(modes.className).toMatch(/@container/)
    expect(modes.textContent).toContain('Клиенту')
    expect(modes.textContent).toContain('Заметка')
    expect(screen.getByRole('radio', { name: 'Внутренняя заметка' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Прикрепить файл' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeTruthy()
    expect(document.querySelector('[data-support-composer]')).toBeNull()
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

  it('uses custom dropdowns and choice chips instead of native selects in assign', async () => {
    render(<SupportDemo view="assign" bare />)
    const dialog = await screen.findByRole('dialog', { name: 'Ответственный и срок' })
    expect(dialog.querySelector('select')).toBeNull()
    expect(dialog.querySelector('input[type="date"]')).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Ответственный' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Линия' })).toBeTruthy()
    expect(within(dialog).getByRole('radiogroup', { name: 'Категория' })).toBeTruthy()
    expect(within(dialog).getByRole('radiogroup', { name: 'Приоритет' })).toBeTruthy()
  })

  it('keeps status change on the tickets list after the board is removed', async () => {
    render(<SupportDemo view="queue" bare />)
    await screen.findByRole('heading', { name: 'Тикеты' })
    const menuButtons = screen.getAllByLabelText('Сменить статус')
    expect(menuButtons.length).toBeGreaterThan(0)
    fireEvent.click(menuButtons[0]!)
    const menu = screen.getByRole('menu', { name: 'Сменить статус' })
    expect(within(menu).getByText('Сменить статус')).toBeTruthy()
    expect(menu.querySelector('select')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Доска' })).toBeNull()
    expect(document.querySelector('[data-board-card]')).toBeNull()
  })

  it('omits demo notes and shows conversation before facts on phone', async () => {
    const queue = render(<SupportDemo view="queue" bare />)
    expect(await screen.findByRole('heading', { name: 'Тикеты' })).toBeTruthy()
    expect(screen.queryByText(/Пример очереди|Демоданные|Очередь/)).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Разделы приложения' }).textContent).not.toMatch(/Доска/)
    queue.unmount()
    render(<SupportDemo view="ticket" bare phone />)
    await screen.findByRole('heading', { name: 'Не сходится сумма в отчёте за октябрь' })
    expect(screen.getByRole('button', { name: '← Тикеты' })).toBeTruthy()
    expect(screen.queryByText(/Пример очереди|Демоданные/)).toBeNull()
    const description = screen.getByRole('heading', { name: 'Описание' })
    const thread = screen.getByRole('heading', { name: 'Переписка' })
    const facts = screen.getByRole('heading', { name: 'Сведения' })
    expect(description.compareDocumentPosition(thread) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(thread.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('groups the client cabinet and hides SLA jargon', async () => {
    render(<SupportDemo view="client" bare />)
    expect(await screen.findByRole('heading', { name: /Открытые/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Завершённые/ })).toBeTruthy()
    expect(screen.queryByText(/Норматив соблюдён|Ответ и решение просрочены|Просрочено/)).toBeNull()
    expect(screen.getAllByText(/Обновлено/).length).toBeGreaterThan(0)
  })

  it('shows the waiting banner and details grid on the client ticket', async () => {
    render(<SupportDemo view="client-waiting" bare phone />)
    expect(await screen.findByText('Служба поддержки ждёт вашего ответа')).toBeTruthy()
    expect(screen.getByText('Категория')).toBeTruthy()
    expect(screen.getByText('Приоритет / срочность')).toBeTruthy()
    expect(screen.getByText('Ответственный')).toBeTruthy()
    expect(screen.getByText('Отправлено')).toBeTruthy()
    expect(screen.queryByText(/в ответ клиенту это не писать/)).toBeNull()
  })

  it('lets an operator preview a client cabinet with a custom dropdown', async () => {
    render(<SupportDemo view="client-preview" bare />)
    expect(await screen.findByText('Посмотреть как клиент')).toBeTruthy()
    expect(screen.getByRole('listbox', { name: 'Клиент для просмотра' })).toBeTruthy()
    expect(screen.getAllByText('Ирина Петрова').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Написать обращение' })).toBeNull()
  })

  it('fills the operator dashboard with team, KPIs and a heatmap', async () => {
    render(<SupportDemo view="dashboard" bare />)
    expect(await screen.findByRole('heading', { name: 'Служба поддержки' })).toBeTruthy()
    expect(screen.getByText(/из .* на смене/)).toBeTruthy()
    expect(screen.getByLabelText('Показатели службы')).toBeTruthy()
    expect(screen.getByText('Просрочено')).toBeTruthy()
    expect(screen.getByText('Тепловая карта: приоритет × возраст')).toBeTruthy()
    expect(screen.getByText('Открытые по приоритету')).toBeTruthy()
  })

  it('shows the compact team block for a large roster and the Команда page', async () => {
    const large = render(<SupportDemo view="dashboard" bare team="large" />)
    expect(await screen.findByRole('heading', { name: 'Служба поддержки' })).toBeTruthy()
    expect(screen.getAllByText(/из .* на смене/).length).toBeGreaterThan(0)
    expect(document.querySelector('[data-team="compact"]')).toBeTruthy()
    expect(screen.getByText('Перегружены')).toBeTruthy()
    expect(screen.getByText('Свободны')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Вся команда →' })).toBeTruthy()
    large.unmount()
    render(<SupportDemo view="team" bare team="large" />)
    expect(await screen.findByRole('heading', { name: 'Команда' })).toBeTruthy()
    expect(screen.getByLabelText('Поиск операторов')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Линия' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Статус' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('1-я линия').length).toBeGreaterThan(0)
    expect(screen.queryByRole('columnheader', { name: 'Линия' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Действия' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull()
  })
})
