// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModuleManager } from './module-manager'
import { templateExample } from '@/lib/templates/presentation'
import { connectSalesInventory } from '@/lib/sales-inventory-connection'

const mocks = vi.hoisted(() => ({ preview: vi.fn(), connect: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks }))
vi.mock('@/app/module-actions', () => ({ previewModuleConnectionAction: mocks.preview, connectModuleAction: mocks.connect,
  enableModuleAccessAction: vi.fn(), setModuleIntakeAction: vi.fn(), setPrimaryClientAppAction: vi.fn(), setCommunicationsAction: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('technical module attachment controls', () => {
  it('offers communication settings for a legacy customer app without stored module metadata', () => {
    const app = { ...templateExample('salon').app, modules: undefined, communications: undefined }
    const ui = render(<ModuleManager app={app} primary sources={[]} />)
    expect(ui.getByRole('button', { name: 'Включить переписку' })).toBeTruthy()
    expect(ui.getByText(/В карточке записи и в разделе «Сообщения»/)).toBeTruthy()
    expect(ui.getByLabelText('Добавить возможность')).toBeTruthy()
  })
  it('clears a previous preview and reused source when selecting another scenario', async () => {
    const app = templateExample('salon').app
    mocks.preview.mockResolvedValue({ ok: true, expectedHash: 'hash', newTables: 3, resources: ['Заказы'], already: false, reused: true, sourceHash: 'source-hash' })
    const ui = render(<ModuleManager app={app} primary sources={[{ id: 'existing-sales', name: 'Продажи', kind: 'sales' }]} />)
    const choices = ui.getByLabelText('Добавить возможность') as HTMLSelectElement
    expect([...choices.options].map(option => option.value)).toEqual(['zakazy', 'service', 'dostavka', 'zayavki', 'nedvizhimost', 'crm'])
    fireEvent.change(ui.getByLabelText('Данные нового раздела'), { target: { value: 'existing-sales' } })
    fireEvent.click(ui.getByRole('button', { name: 'Проверить подключение' }))
    await ui.findByRole('button', { name: 'Подключить в черновик' })
    await waitFor(() => expect(choices.disabled).toBe(false))
    expect(mocks.preview).toHaveBeenCalledWith(app.id, 'zakazy', 'existing-sales')
    fireEvent.change(choices, { target: { value: 'service' } })
    expect(ui.queryByRole('button', { name: 'Подключить в черновик' })).toBeNull()
    expect((ui.getByLabelText('Данные нового раздела') as HTMLSelectElement).value).toBe('')
    fireEvent.click(ui.getByRole('button', { name: 'Проверить подключение' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenLastCalledWith(app.id, 'service', undefined))
  })
  it('keeps internal CRM out of the primary-client-app choice', () => {
    const ui = render(<ModuleManager app={templateExample('crm').app} primary={false} sources={[]} />)
    expect(ui.queryByRole('button', { name: 'Выбрать основным для клиентов' })).toBeNull()
    expect(ui.getByLabelText('Добавить возможность')).toBeTruthy()
  })
  it('does not offer unintegrated stock/production combinations', () => {
    const ui = render(<ModuleManager app={templateExample('sklad').app} primary={false} sources={[]} />)
    expect(ui.queryByLabelText('Добавить возможность')).toBeNull()
  })
  it('offers production only after sales and the shared warehouse are connected', () => {
    const sales = templateExample('zakazy')
    const ui = render(<ModuleManager app={sales.app} primary sources={[]} />)
    expect(ui.queryByRole('option', { name: 'Производство' })).toBeNull()
    const connected = connectSalesInventory(sales.app, 'owner@example.invalid', new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))
    ui.rerender(<ModuleManager app={connected.app} primary sources={[]} />)
    expect(ui.getByRole('option', { name: 'Производство' })).toBeTruthy()
  })
  it('keeps warehouse installation on the shared catalogue instead of offering existing warehouse sources', () => {
    const ui = render(<ModuleManager app={templateExample('zakazy').app} primary sources={[{ id: 'existing-stock', name: 'Действующий склад', kind: 'inventory' }]} />)
    fireEvent.change(ui.getByLabelText('Добавить возможность'), { target: { value: 'sklad' } })
    const source = ui.getByLabelText('Данные нового раздела') as HTMLSelectElement
    expect([...source.options].map(option => option.value)).toEqual([''])
  })
  it('clears reused data and preview when selecting production, explains shared stock and connects the checked draft', async () => {
    const sales = templateExample('zakazy')
    const connected = connectSalesInventory(sales.app, 'owner@example.invalid', new Map(sales.fields.map(field => [field.id, field])), new Map(sales.views.map(view => [view.id, view])))
    mocks.preview.mockResolvedValueOnce({ ok: true, expectedHash: 'repair-hash', newTables: 0, resources: [], already: false, reused: true, sourceHash: 'source-hash' })
    mocks.preview.mockResolvedValueOnce({ ok: true, expectedHash: 'production-hash', newTables: 4, resources: ['Выпуски', 'Нормы расхода', 'Материалы', 'Движение материалов'], already: false, reused: false, sourceHash: null })
    mocks.connect.mockResolvedValue({ ok: true })
    const ui = render(<ModuleManager app={connected.app} primary sources={[{ id: 'existing-repair', name: 'Ремонт', kind: 'repair' }, { id: 'existing-production', name: 'Действующее производство', kind: 'production' }]} />)
    const choices = ui.getByLabelText('Добавить возможность')
    fireEvent.change(choices, { target: { value: 'service' } })
    fireEvent.change(ui.getByLabelText('Данные нового раздела'), { target: { value: 'existing-repair' } })
    fireEvent.click(ui.getByRole('button', { name: 'Проверить подключение' }))
    await ui.findByRole('button', { name: 'Подключить в черновик' })
    await waitFor(() => expect(choices.matches(':disabled')).toBe(false))
    fireEvent.change(choices, { target: { value: 'proizvodstvo' } })
    expect(ui.queryByRole('button', { name: 'Подключить в черновик' })).toBeNull()
    const source = ui.getByLabelText('Данные нового раздела') as HTMLSelectElement
    expect(source.value).toBe('')
    expect([...source.options].map(option => option.value)).toEqual([''])
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
