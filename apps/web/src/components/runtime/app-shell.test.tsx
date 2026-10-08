// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inventoryFixture } from '@/lib/templates/inventory-fixture.test-utils'
import { AppShell } from './app-shell'
import { navFromHistory } from './nav-history'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/auth-actions', () => ({ signOutAppAction: vi.fn() }))
vi.mock('@/app/production-actions', () => ({ saveMovementAction: vi.fn(), saveProductionAction: vi.fn() }))
vi.mock('@/app/runtime-actions', () => ({ appCreateRowAction: vi.fn(), appDeleteRowAction: vi.fn(), appUpdateRowAction: vi.fn() }))
vi.mock('@/app/inventory-actions', () => ({ receiveStockAction: vi.fn() }))
vi.mock('@/lib/use-live-app', () => ({ useLiveApp: vi.fn() }))
vi.mock('@/components/motion/enter-motion', () => ({ useEnterMotion: () => ({ current: null }) }))
vi.mock('./intake-verify', () => ({ IntakeVerify: () => null }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/') })

describe('runtime navigation during live refresh', () => {
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
})
