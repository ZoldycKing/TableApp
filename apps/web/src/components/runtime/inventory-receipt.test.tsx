// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inventoryFixture } from '@/lib/templates/inventory-fixture.test-utils'
import { hasUnsaved } from '@/lib/unsaved'
import { InventoryReceipt } from './inventory-receipt'
import { withNav } from './nav-history'

const mocks = vi.hoisted(() => ({ receive: vi.fn(), operation: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/inventory-actions', () => ({ receiveStockAction: mocks.receive, saveStockOperationAction: mocks.operation }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState(null, '') })
function setup(demo = false) {
  const { app, runtime } = inventoryFixture(), config = app.inventory!
  const itemId = runtime.tables[config.tables.items]!.rows[0]!.id
  const props = { runtime, config, itemId, demo, onBack: vi.fn() }
  return { ...props, ui: render(<InventoryReceipt {...props} />) }
}
describe('receipt form', () => {
  it('keeps quantity and note when another worker updates the runtime', () => {
    const { ui, ...props } = setup()
    fireEvent.change(ui.getByRole('spinbutton'), { target: { value: '4' } })
    fireEvent.change(ui.getByRole('textbox'), { target: { value: 'Накладная 17' } })
    expect(hasUnsaved()).toBe(true)
    const runtime = structuredClone(props.runtime)
    runtime.tables[props.config.tables.items]!.rows[0]!.data[props.config.item.stock] = 9
    ui.rerender(<InventoryReceipt {...props} runtime={runtime} />)
    expect((ui.getByRole('spinbutton') as HTMLInputElement).value).toBe('4')
    expect((ui.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Накладная 17')
    expect(ui.getByText('9 шт')).toBeTruthy()
  })
  it('retries using the same operation ID and clears the dirty flag after success', async () => {
    mocks.receive.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ ok: true, name: 'Фильтр', before: 4, quantity: 4, after: 8, repeated: true })
    const { ui } = setup()
    fireEvent.change(ui.getByRole('spinbutton'), { target: { value: '4' } })
    fireEvent.click(ui.getByRole('button', { name: 'Принять товар' }))
    await waitFor(() => expect(ui.getByRole('alert').textContent).toContain('не задвоится'))
    fireEvent.click(ui.getByRole('button', { name: 'Принять товар' }))
    await waitFor(() => expect(ui.getByRole('status').textContent).toContain('Приёмка уже записана'))
    expect(mocks.receive.mock.calls[0]![1].id).toBe(mocks.receive.mock.calls[1]![1].id)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(hasUnsaved()).toBe(false))
  })
  it('does not write in previews', async () => {
    const { ui } = setup(true)
    fireEvent.change(ui.getByRole('spinbutton'), { target: { value: '4' } })
    fireEvent.click(ui.getByRole('button', { name: 'Принять товар' }))
    expect(ui.getByRole('alert').textContent).toContain('предпросмотр')
    expect(mocks.receive).not.toHaveBeenCalled()
  })
  it('retains saved confirmation across a remount but starts a new receipt on a new history entry', async () => {
    const { ui, ...props } = setup()
    mocks.receive.mockResolvedValue({ ok: true, name: 'Фильтр', before: 4, quantity: 4, after: 8, repeated: false })
    const entry = { screenId: props.config.receiptScreenId!, rowId: props.itemId }
    window.history.replaceState(withNav(null, { stack: [entry], lists: {} }), '')
    fireEvent.change(ui.getByRole('spinbutton'), { target: { value: '4' } })
    fireEvent.click(ui.getByRole('button', { name: 'Принять товар' }))
    await waitFor(() => expect(ui.getByRole('status').textContent).toContain('Приёмка записана'))
    ui.unmount()
    const restored = render(<InventoryReceipt {...props} />)
    expect(restored.getByRole('status').textContent).toContain('4 → 8')
    expect(restored.queryByRole('spinbutton')).toBeNull()
    restored.unmount()
    window.history.replaceState(withNav(null, { stack: [entry], lists: {} }), '')
    const fresh = render(<InventoryReceipt {...props} />)
    expect((fresh.getByRole('spinbutton') as HTMLInputElement).value).toBe('')
    expect(fresh.queryByRole('status')).toBeNull()
    expect(mocks.receive).toHaveBeenCalledTimes(1)
  })
  it('omits a note field removed by the role projection', () => {
    const { ui, ...props } = setup()
    const runtime = structuredClone(props.runtime)
    runtime.app.screens = runtime.app.screens.map(screen => screen.type === 'form' ? { ...screen, components: screen.components.filter(component => component.type !== 'form_field' || component.fieldId !== props.config.movement.note) } : screen)
    ui.rerender(<InventoryReceipt {...props} runtime={runtime} />)
    expect(ui.queryByRole('textbox')).toBeNull()
  })
  it('does not offer a submit button when the quantity field is closed to the role', () => {
    const { ui, ...props } = setup()
    const runtime = structuredClone(props.runtime)
    runtime.app.screens = runtime.app.screens.map(screen => screen.type === 'form' ? { ...screen, components: screen.components.filter(component => component.type !== 'form_field' || component.fieldId !== props.config.movement.qty) } : screen)
    ui.rerender(<InventoryReceipt {...props} runtime={runtime} />)
    expect(ui.getByText(/Приёмка вам недоступна/)).toBeTruthy()
    expect(ui.queryByRole('button', { name: 'Принять товар' })).toBeNull()
  })
  it('restores a zero stocktake confirmation after refresh and keeps the opening version for retries', async () => {
    const { app, runtime } = inventoryFixture('manager'), config = app.inventory!
    const item = runtime.tables[config.tables.items]!.rows[0]!
    const props = { runtime, config, itemId: item.id, demo: false, onBack: vi.fn(), operation: 'stocktake' as const }
    const entry = { screenId: config.operations!.screens.stocktake, rowId: item.id }
    window.history.replaceState(withNav(null, { stack: [entry], lists: {} }), '')
    const ui = render(<InventoryReceipt {...props} />)
    fireEvent.change(ui.getByRole('spinbutton'), { target: { value: '0' } })
    fireEvent.change(ui.getByRole('textbox'), { target: { value: 'Пересчёт полки' } })
    const changed = structuredClone(runtime)
    changed.tables[config.tables.items]!.rows[0]!.version = 1
    ui.rerender(<InventoryReceipt {...props} runtime={changed} />)
    expect(ui.getByRole('alert').textContent).toContain('Товар изменился')
    mocks.operation.mockResolvedValue({ ok: true, name: 'Фильтр', before: 4, quantity: 0, after: 0, repeated: true, operation: 'stocktake' })
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить фактический остаток' }))
    await waitFor(() => expect(ui.getByRole('status').textContent).toContain('4 → 0'))
    expect(mocks.operation.mock.calls[0]![2]).toMatchObject({ quantity: 0, baseVersion: 0 })
    ui.unmount()
    const restored = render(<InventoryReceipt {...props} runtime={changed} />)
    expect(restored.getByRole('status').textContent).toContain('4 → 0')
  })
})
