// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrderStockPanel, InventoryBalancePanel } from './order-stock-panel'
import { confirmOrderStockAction, readOrderStockAction, readInventoryBalanceAction } from '@/app/order-stock-actions'
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/app/order-stock-actions', () => ({ confirmOrderStockAction: vi.fn(), issueOrderStockAction: vi.fn(), readOrderStockAction: vi.fn(), readInventoryBalanceAction: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const waiting = { state: 'waiting' as const, canConfirm: true, canIssue: false }
describe('stock runtime controls', () => {
  it('confirms the displayed version and replaces the button only after the server accepts it', async () => {
    vi.mocked(readOrderStockAction).mockResolvedValueOnce({ ok: true, state: waiting }).mockResolvedValue({ ok: true, state: { state: 'reserved', canConfirm: false, canIssue: true } })
    vi.mocked(confirmOrderStockAction).mockResolvedValue({ ok: true, value: { state: 'reserved', repeated: false } })
    const ui = render(<OrderStockPanel tableId="orders" rowId="order" version={7} slug="shop" />)
    fireEvent.click(await ui.findByRole('button', { name: 'Подтвердить заказ' }))
    await ui.findByRole('button', { name: 'Выдать заказ' })
    expect(confirmOrderStockAction).toHaveBeenCalledWith('orders', 'order', 7, 'shop', false)
    expect(mocks.refresh).toHaveBeenCalled()
  })
  it('shows a failed or lost response without pretending the order was confirmed', async () => {
    vi.mocked(readOrderStockAction).mockResolvedValue({ ok: true, state: waiting })
    vi.mocked(confirmOrderStockAction).mockRejectedValue(new Error('Connection lost'))
    const ui = render(<OrderStockPanel tableId="orders" rowId="order" version={7} slug="shop" />)
    fireEvent.click(await ui.findByRole('button', { name: 'Подтвердить заказ' }))
    expect((await ui.findByRole('alert')).textContent).toContain('проверьте состояние')
    expect(ui.getByRole('button', { name: 'Подтвердить заказ' }).hasAttribute('disabled')).toBe(false)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it('discards a delayed response from a previous product and refreshes balance with the current version', async () => {
    let finish!: (value: Awaited<ReturnType<typeof readInventoryBalanceAction>>) => void
    vi.mocked(readInventoryBalanceAction).mockReturnValueOnce(new Promise(resolve => { finish = resolve })).mockResolvedValue({ ok: true, state: { stock: 8, reserved: 3, available: 5 } })
    const ui = render(<InventoryBalancePanel tableId="goods" rowId="old" version={1} slug="shop" />)
    await waitFor(() => expect(readInventoryBalanceAction).toHaveBeenCalledTimes(1))
    ui.rerender(<InventoryBalancePanel tableId="goods" rowId="new" version={2} slug="shop" />)
    await ui.findByText('5')
    finish({ ok: true, state: { stock: 100, reserved: 0, available: 100 } })
    await waitFor(() => expect(ui.queryByText('100')).toBeNull())
  })
})
