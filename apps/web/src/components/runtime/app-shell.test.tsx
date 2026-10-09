// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inventoryFixture } from '@/lib/templates/inventory-fixture.test-utils'
import { AppShell } from './app-shell'
import { navFromHistory } from './nav-history'
import { appUpdateRowAction } from '@/app/runtime-actions'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/auth-actions', () => ({ signOutAppAction: vi.fn() }))
vi.mock('@/app/production-actions', () => ({ saveMovementAction: vi.fn(), saveProductionAction: vi.fn() }))
vi.mock('@/app/runtime-actions', () => ({ appCreateRowAction: vi.fn(), appDeleteRowAction: vi.fn(), appUpdateRowAction: vi.fn() }))
vi.mock('@/app/booking-actions', () => ({ bookingAvailabilityAction: vi.fn(), cancelBookingAction: vi.fn(), setupBookingMasterAction: vi.fn(), setBookingDayOffAction: vi.fn() }))
const inventoryMocks = vi.hoisted(() => ({ receive: vi.fn(), operation: vi.fn() }))
vi.mock('@/app/inventory-actions', () => ({ receiveStockAction: inventoryMocks.receive, saveStockOperationAction: inventoryMocks.operation }))
vi.mock('@/lib/use-live-app', () => ({ useLiveApp: vi.fn() }))
vi.mock('@/components/motion/enter-motion', () => ({ useEnterMotion: () => ({ current: null }) }))
vi.mock('./intake-verify', () => ({ IntakeVerify: () => null }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })

describe('runtime navigation during live refresh', () => {
  it('does not mutate published data from an action in the builder preview', () => {
    const { runtime } = inventoryFixture()
    const detail = runtime.app.screens.find(screen => screen.type === 'detail' && screen.tableId === runtime.app.inventory!.tables.items)!
    if (detail.type !== 'detail') throw new Error('Expected the item detail')
    detail.components.push({ id: 'preview-update', position: 'zz', type: 'button', label: 'Тестовое изменение', style: 'secondary',
      roles: null, visibleWhen: null, action: { id: 'preview-action', type: 'update_row', values: {} } })
    const ui = render(<AppShell runtime={runtime} viewer={null} editing />)
    fireEvent.click(ui.getByRole('button', { name: /Шуруповёрт аккумуляторный/ }))
    fireEvent.click(ui.getByRole('button', { name: 'Тестовое изменение' }))
    expect(appUpdateRowAction).not.toHaveBeenCalled()
    expect(ui.getByText(/Это демонстрация: изменения не сохраняются/)).toBeTruthy()
  })
  it('uses native history without Next internal flags and preserves the receipt draft on refresh', () => {
    window.history.replaceState({ __NA: true }, '', '/a/warehouse')
    const originalPush = window.history.pushState.bind(window.history)
    const originalReplace = window.history.replaceState.bind(window.history)
    const push = vi.spyOn(window.history, 'pushState').mockImplementation((state, unused, url) => originalPush({ ...state, __NA: true }, unused, url))
    const replace = vi.spyOn(window.history, 'replaceState').mockImplementation((state, unused, url) => originalReplace({ ...state, __NA: true }, unused, url))
    const { runtime } = inventoryFixture()
    const ui = render(<AppShell runtime={runtime} viewer={null} browserHistory />)
    fireEvent.click(ui.getByRole('button', { name: /Шуруповёрт аккумуляторный/ }))
    fireEvent.click(ui.getByRole('button', { name: 'Принять товар' }))
    fireEvent.change(ui.getByRole('spinbutton'), { target: { value: '4' } })
    const receiptUrl = window.location.href
    const refreshed = structuredClone(runtime)
    const config = refreshed.app.inventory!
    refreshed.tables[config.tables.items]!.rows.find(row => String(row.data[config.item.name]).includes('Шуруповёрт'))!.data[config.item.stock] = 8
    ui.rerender(<AppShell runtime={refreshed} viewer={null} browserHistory />)
    expect(window.location.href).toBe(receiptUrl)
    expect((ui.getByRole('spinbutton') as HTMLInputElement).value).toBe('4')
    expect(navFromHistory(window.history.state, () => true)?.stack).toHaveLength(3)
    expect([...push.mock.calls, ...replace.mock.calls].every(([state]) => !state.__NA && !state._N)).toBe(true)
    ui.unmount()
    const restored = render(<AppShell runtime={refreshed} viewer={null} browserHistory />)
    expect(restored.getByRole('heading', { name: 'Приёмка товара' })).toBeTruthy()
    expect(navFromHistory(window.history.state, () => true)?.stack).toHaveLength(3)
  })
  it('restores saved confirmations when a framework refresh replaces custom history state', async () => {
    const { runtime } = inventoryFixture()
    window.history.replaceState(null, '', '/a/warehouse')
    inventoryMocks.operation.mockResolvedValue({ ok: true, name: 'Фильтр', before: 4, quantity: 2, after: 2, repeated: false, operation: 'issue' })
    const ui = render(<AppShell runtime={runtime} viewer={null} browserHistory />)
    fireEvent.click(ui.getByRole('button', { name: /Фильтр воздушный/ }))
    expect(ui.getByText('Ещё действия').closest('details')?.open).toBe(false)
    expect(ui.queryByRole('button', { name: 'Пересчитать остаток' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Выдать товар' }))
    fireEvent.change(ui.getByRole('spinbutton'), { target: { value: '2' } })
    fireEvent.click(ui.getByRole('button', { name: 'Выдать товар' }))
    await waitFor(() => expect(ui.getByRole('status').textContent).toContain('4 → 2'))
    window.history.replaceState({ __NA: true }, '')
    const refreshed = structuredClone(runtime)
    ui.rerender(<AppShell runtime={refreshed} viewer={null} browserHistory />)
    expect(navFromHistory(window.history.state, () => true)?.stack.at(-1)?.receipt?.result.after).toBe(2)
    ui.unmount()
    const restored = render(<AppShell runtime={refreshed} viewer={null} browserHistory />)
    expect(restored.getByRole('status').textContent).toContain('4 → 2')
    expect(restored.queryByRole('spinbutton')).toBeNull()
  })
})
