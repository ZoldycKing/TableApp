// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrderDeliveryPanel } from './order-delivery-panel'
import { handoffOrderDeliveryAction, readOrderDeliveryAction } from '@/app/order-delivery-actions'
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/app/order-delivery-actions', () => ({ readOrderDeliveryAction: vi.fn(), handoffOrderDeliveryAction: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const linked = { canCreate: false, linked: { side: 'order' as const, stage: 'waiting' as const, status: 'Ожидает передачи курьеру', target: { tableId: 'shipping', rowId: 'shipment', screenId: 'shipment-detail' } } }

describe('order delivery panel', () => {
  it('hands off the displayed order and opens the same authorized delivery without a second create button', async () => {
    vi.mocked(readOrderDeliveryAction).mockResolvedValueOnce({ ok: true, state: { canCreate: true } }).mockResolvedValue({ ok: true, state: linked })
    vi.mocked(handoffOrderDeliveryAction).mockResolvedValue({ ok: true, id: 'shipment', duplicate: false })
    const open = vi.fn(), ui = render(<OrderDeliveryPanel tableId="orders" rowId="order" version={7} slug="shop" onOpen={open} />)
    fireEvent.click(await ui.findByRole('button', { name: 'Передать в доставку' }))
    await ui.findByText('Ожидает передачи курьеру')
    expect(handoffOrderDeliveryAction).toHaveBeenCalledWith('orders', 'order', 7, 'shop', false)
    expect(ui.queryByRole('button', { name: 'Передать в доставку' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Открыть доставку' }))
    expect(open).toHaveBeenCalledWith('shipment-detail', 'shipment')
  })
  it('uses the platform circuit and a table record link explicitly', async () => {
    vi.mocked(readOrderDeliveryAction).mockResolvedValue({ ok: true, state: linked })
    const ui = render(<OrderDeliveryPanel tableId="orders" rowId="order" version={1} business />)
    expect((await ui.findByRole('link', { name: 'Открыть доставку' })).getAttribute('href')).toBe('/t/shipping?r=shipment')
    expect(readOrderDeliveryAction).toHaveBeenCalledWith('orders', 'order', undefined, true)
  })
  it('does not show a response from a previously opened order', async () => {
    let finish!: (value: Awaited<ReturnType<typeof readOrderDeliveryAction>>) => void
    vi.mocked(readOrderDeliveryAction).mockReturnValueOnce(new Promise(resolve => { finish = resolve })).mockResolvedValue({ ok: true, state: null })
    const ui = render(<OrderDeliveryPanel tableId="orders" rowId="old-order" version={1} slug="shop" />)
    await waitFor(() => expect(readOrderDeliveryAction).toHaveBeenCalledTimes(1))
    ui.rerender(<OrderDeliveryPanel tableId="orders" rowId="new-order" version={1} slug="shop" />)
    finish({ ok: true, state: linked })
    await waitFor(() => expect(readOrderDeliveryAction).toHaveBeenCalledTimes(2))
    expect(ui.queryByRole('button', { name: 'Открыть доставку' })).toBeNull()
  })
  it('preserves the order and permits a retry after the server rejects stale input', async () => {
    vi.mocked(readOrderDeliveryAction).mockResolvedValue({ ok: true, state: { canCreate: true } })
    vi.mocked(handoffOrderDeliveryAction).mockResolvedValue({ ok: false, error: 'Запись изменилась. Обновите карточку.' })
    const ui = render(<OrderDeliveryPanel tableId="orders" rowId="order" version={1} slug="shop" />)
    fireEvent.click(await ui.findByRole('button', { name: 'Передать в доставку' }))
    expect((await ui.findByRole('alert')).textContent).toContain('Обновите карточку')
    expect(ui.getByRole('button', { name: 'Передать в доставку' }).hasAttribute('disabled')).toBe(false)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
