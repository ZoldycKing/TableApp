// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appSchema, type App } from '@tableapp/schema'
import { AppEditor } from './app-editor'

const mocks = vi.hoisted(() => ({ update: vi.fn(), publish: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/app-actions', () => ({ updateAppDraftAction: mocks.update, publishAppAction: mocks.publish }))
vi.mock('@/app/inventory-setup-actions', () => ({ enableInventoryAction: vi.fn(), enableStockOperationsAction: vi.fn() }))
vi.mock('@/app/dispatch-setup-actions', () => ({ enableDispatchAction: vi.fn() }))
vi.mock('@/app/portal-setup-actions', () => ({ enableRepeatRequestsAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks }))
vi.mock('@/components/runtime/app-shell', () => ({ AppShell: () => <div>App preview</div> }))
vi.mock('./component-settings', () => ({ COMPONENT_LABELS: {}, ComponentSettings: () => null, describeComponent: () => '', makeComponent: vi.fn() }))
vi.mock('./dashboard-editor', () => ({ DashboardEditor: () => null }))
vi.mock('./component-access', () => ({ ComponentAccess: () => null }))
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); mocks.update.mockResolvedValue({ ok: true }); mocks.publish.mockResolvedValue({ ok: true }) })
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals() })
const app = appSchema.parse({ id: 'app-1', workspaceId: 'space', name: 'Shop', slug: 'shop', theme: {}, screens: [{ id: 'screen-1', appId: 'app-1', name: 'Initial screen', position: 'a0', type: 'dashboard', blocks: [] }] })
const props = { initialApp: app, tables: [], views: [], runtimeTables: {}, relatedTitles: {}, publishedAt: null }

describe('editor publication and server refresh', () => {
  it('saves the latest edit before an immediate publish click', async () => {
    const ui = render(<AppEditor {...props} />)
    fireEvent.change(ui.getByRole('textbox', { name: 'Название экрана' }), { target: { value: 'Latest screen' } })
    fireEvent.click(ui.getByRole('button', { name: 'Опубликовать' }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledOnce())
    const saved = mocks.update.mock.calls[0]![1] as App
    expect(saved.screens[0]!.name).toBe('Latest screen')
    expect(mocks.publish).toHaveBeenCalledWith(app.id, saved)
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0]!)
  })
  it('does not publish after a transport failure and keeps the latest text available for retry', async () => {
    mocks.update.mockRejectedValueOnce(new Error('offline'))
    const ui = render(<AppEditor {...props} />)
    fireEvent.change(ui.getByRole('textbox', { name: 'Название экрана' }), { target: { value: 'Keep this edit' } })
    fireEvent.click(ui.getByRole('button', { name: 'Опубликовать' }))
    expect(await ui.findByText(/Не удалось сохранить черновик/)).toBeTruthy()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect((ui.getByRole('textbox', { name: 'Название экрана' }) as HTMLInputElement).value).toBe('Keep this edit')
    fireEvent.click(ui.getByRole('button', { name: 'Повторить сохранение черновика' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2))
  })
  it('keeps newer local edits during a stale RSC refresh and applies a clean external change', async () => {
    const ui = render(<AppEditor {...props} />)
    fireEvent.change(ui.getByRole('textbox', { name: 'Название экрана' }), { target: { value: 'Local unsaved' } })
    const external = { ...app, name: 'Externally changed' }
    ui.rerender(<AppEditor {...props} initialApp={external} />)
    expect((ui.getByRole('textbox', { name: 'Название экрана' }) as HTMLInputElement).value).toBe('Local unsaved')
    fireEvent.click(ui.getByRole('button', { name: 'Опубликовать' }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledOnce())
    const restored = { ...app, screens: app.screens.map(screen => ({ ...screen, name: 'Restored screen' })) }
    await act(async () => { ui.rerender(<AppEditor {...props} initialApp={restored} />) })
    expect((ui.getByRole('textbox', { name: 'Название экрана' }) as HTMLInputElement).value).toBe('Restored screen')
  })
  it('disables mutations for viewers while retaining screen and device preview navigation', () => {
    const ui = render(<AppEditor {...props} canEdit={false} />)
    expect(ui.getByRole('textbox', { name: 'Название экрана' }).matches(':disabled')).toBe(true)
    expect(ui.getByRole('button', { name: 'Опубликовать' }).matches(':disabled')).toBe(true)
    expect(ui.getByRole('button', { name: 'Удалить экран' }).matches(':disabled')).toBe(true)
    expect(ui.getByRole('button', { name: 'Телефон' }).matches(':disabled')).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
