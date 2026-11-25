// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModuleManager } from './module-manager'
import { templateExample } from '@/lib/templates/presentation'
import { connectSalesInventory } from '@/lib/sales-inventory-connection'

const mocks = vi.hoisted(() => ({ preview: vi.fn(), connect: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks }))
vi.mock('@/app/module-actions', () => ({ previewModuleConnectionAction: mocks.preview, connectModuleAction: mocks.connect,
  enableModuleAccessAction: vi.fn(), setModuleIntakeAction: vi.fn(), setPrimaryClientAppAction: vi.fn(), setCommunicationsAction: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

async function openList(ui: ReturnType<typeof render>, label: string) {
  fireEvent.click(ui.getByRole('button', { name: label }))
  return ui.findByRole('listbox', { name: label })
}

async function pickOption(ui: ReturnType<typeof render>, label: string, name: string | RegExp) {
  const list = await openList(ui, label)
  fireEvent.click(within(list).getByRole('option', { name }))
}

describe('technical module attachment controls', () => {
  it('offers communication settings for a legacy customer app without stored module metadata', () => {
    const app = { ...templateExample('salon').app, modules: undefined, communications: undefined }
    const ui = render(<ModuleManager app={app} primary sources={[]} />)
    expect(ui.getByRole('button', { name: 'Включить переписку' })).toBeTruthy()
    expect(ui.getByText(/В карточке записи и в разделе «Чат» \/ «Сообщения»/)).toBeTruthy()
    expect(ui.getByRole('button', { name: 'Добавить возможность' })).toBeTruthy()
    expect(ui.container.querySelector('select')).toBeNull()
  })
  it('clears a previous preview and reused source when selecting another scenario', async () => {
    const app = templateExample('salon').app
    mocks.preview.mockResolvedValue({ ok: true, expectedHash: 'hash', newTables: 3, resources: ['Заказы'], already: false, reused: true, sourceHash: 'source-hash' })
    const ui = render(<ModuleManager app={app} primary sources={[{ id: 'existing-sales', name: 'Продажи', kind: 'sales' }]} />)
    const choices = await openList(ui, 'Добавить возможность')
    expect(within(choices).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Продажа товаров', 'Ремонт', 'Доставка', 'Заявки и выезды', 'Недвижимость', 'Клиенты и сделки',
    ])
    fireEvent.click(within(choices).getByRole('option', { name: 'Продажа товаров' }))
    await pickOption(ui, 'Данные нового раздела', 'Использовать таблицы: Продажи')
    fireEvent.click(ui.getByRole('button', { name: 'Проверить подключение' }))
    await ui.findByRole('button', { name: 'Подключить в черновик' })
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith(app.id, 'zakazy', 'existing-sales'))
    await pickOption(ui, 'Добавить возможность', 'Ремонт')
    expect(ui.queryByRole('button', { name: 'Подключить в черновик' })).toBeNull()
    expect(ui.getByRole('button', { name: 'Данные нового раздела' }).textContent).toMatch(/Создать пустые таблицы/)
    fireEvent.click(ui.getByRole('button', { name: 'Проверить подключение' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenLastCalledWith(app.id, 'service', undefined))
  })
  it('keeps internal CRM out of the primary-client-app choice', () => {
    const ui = render(<ModuleManager app={templateExample('crm').app} primary={false} sources={[]} />)
    expect(ui.queryByRole('button', { name: 'Выбрать основным для клиентов' })).toBeNull()
    expect(ui.getByRole('button', { name: 'Добавить возможность' })).toBeTruthy()
  })
  it('does not offer unintegrated stock/production combinations', () => {
    const ui = render(<ModuleManager app={templateExample('sklad').app} primary={false} sources={[]} />)
    expect(ui.queryByRole('button', { name: 'Добавить возможность' })).toBeNull()
  })
  it('offers production only after sales and the shared warehouse are connected', async () => {
    const sales = templateExample('zakazy')
    const ui = render(<ModuleManager app={sales.app} primary sources={[]} />)
    expect(within(await openList(ui, 'Добавить возможность')).queryByRole('option', { name: 'Производство' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Добавить возможность' }))
    const connected = connectSalesInventory(sales.app, 'owner@example.invalid', new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))
    ui.rerender(<ModuleManager app={connected.app} primary sources={[]} />)
    expect(within(await openList(ui, 'Добавить возможность')).getByRole('option', { name: 'Производство' })).toBeTruthy()
  })
  it('keeps warehouse installation on the shared catalogue instead of offering existing warehouse sources', async () => {
    const ui = render(<ModuleManager app={templateExample('zakazy').app} primary sources={[{ id: 'existing-stock', name: 'Действующий склад', kind: 'inventory' }]} />)
    await pickOption(ui, 'Добавить возможность', 'Склад и остатки')
    const source = await openList(ui, 'Данные нового раздела')
    expect(within(source).getAllByRole('option').map(option => option.textContent)).toEqual(['Создать пустые таблицы для нового раздела'])
  })
  it('clears reused data and preview when selecting production, explains shared stock and connects the checked draft', async () => {
    const sales = templateExample('zakazy')
    const connected = connectSalesInventory(sales.app, 'owner@example.invalid', new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))
    mocks.preview.mockResolvedValueOnce({ ok: true, expectedHash: 'repair-hash', newTables: 0, resources: [], already: false, reused: true, sourceHash: 'source-hash' })
    mocks.preview.mockResolvedValueOnce({ ok: true, expectedHash: 'production-hash', newTables: 4, resources: ['Выпуски', 'Нормы расхода', 'Материалы', 'Движение материалов'], already: false, reused: false, sourceHash: null })
    mocks.connect.mockResolvedValue({ ok: true })
    const ui = render(<ModuleManager app={connected.app} primary sources={[{ id: 'existing-repair', name: 'Ремонт', kind: 'repair' }, { id: 'existing-production', name: 'Действующее производство', kind: 'production' }]} />)
    await pickOption(ui, 'Добавить возможность', 'Ремонт')
    await pickOption(ui, 'Данные нового раздела', 'Использовать таблицы: Ремонт')
    fireEvent.click(ui.getByRole('button', { name: 'Проверить подключение' }))
    await ui.findByRole('button', { name: 'Подключить в черновик' })
    await pickOption(ui, 'Добавить возможность', 'Производство')
    expect(ui.queryByRole('button', { name: 'Подключить в черновик' })).toBeNull()
    expect(ui.getByRole('button', { name: 'Данные нового раздела' }).textContent).toMatch(/Создать пустые таблицы/)
    const source = await openList(ui, 'Данные нового раздела')
    expect(within(source).getAllByRole('option').map(option => option.textContent)).toEqual(['Создать пустые таблицы для нового раздела'])
    fireEvent.click(ui.getByRole('button', { name: 'Данные нового раздела' }))
    fireEvent.click(ui.getByRole('button', { name: 'Проверить подключение' }))
    await ui.findByText('Годные изделия поступят на общий склад; материалы списываются по нормам. Резервы заказов сохраняются.')
    expect(mocks.preview).toHaveBeenLastCalledWith(connected.app.id, 'proizvodstvo', undefined)
    const connect = ui.getByRole('button', { name: 'Подключить в черновик' })
    await waitFor(() => expect(connect.matches(':disabled')).toBe(false))
    fireEvent.click(connect)
    await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith(connected.app.id, 'proizvodstvo', 'production-hash', undefined, null))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
  })
})
