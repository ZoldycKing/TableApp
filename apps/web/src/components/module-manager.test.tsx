// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModuleManager } from './module-manager'
import { templateExample } from '@/lib/templates/presentation'

const mocks = vi.hoisted(() => ({ preview: vi.fn(), connect: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks }))
vi.mock('@/app/module-actions', () => ({ previewModuleConnectionAction: mocks.preview, connectModuleAction: mocks.connect,
  enableModuleAccessAction: vi.fn(), setModuleIntakeAction: vi.fn(), setPrimaryClientAppAction: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('technical module attachment controls', () => {
  it('clears a previous preview and reused source when selecting another scenario', async () => {
    const app = templateExample('salon').app
    mocks.preview.mockResolvedValue({ ok: true, expectedHash: 'hash', newTables: 3, resources: ['Заказы'], already: false, reused: true, sourceHash: 'source-hash' })
    const ui = render(<ModuleManager app={app} primary sources={[{ id: 'existing-sales', name: 'Продажи', kind: 'sales' }]} />)
    const choices = ui.getByLabelText('Добавить возможность') as HTMLSelectElement
    expect([...choices.options].map(option => option.value)).toEqual(['zakazy', 'service', 'dostavka', 'zayavki', 'nedvizhimost', 'crm'])
    fireEvent.change(ui.getByLabelText('Данные нового раздела'), { target: { value: 'existing-sales' } })
    fireEvent.click(ui.getByRole('button', { name: 'Проверить подключение' }))
    await ui.findByRole('button', { name: 'Подключить в черновик' })
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
})
