// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InventoryPreparation } from './inventory-preparation'

const mocks = vi.hoisted(() => ({ clear: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/template-actions', () => ({ clearInventorySamplesAction: mocks.clear }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
beforeEach(() => { vi.clearAllMocks(); mocks.clear.mockResolvedValue({ ok: true }) })
afterEach(cleanup)
describe('warehouse example preparation', () => {
  it('requires an explicit confirmation before clearing and can retain examples', () => {
    render(<InventoryPreparation appId="app" sampleCount={8} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Начать со своих данных' }))
    expect(mocks.clear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Оставить примеры' }))
    expect(screen.queryByRole('button', { name: 'Убрать примеры' })).toBeNull()
  })
  it('clears this app once and gives a next action', async () => {
    render(<InventoryPreparation appId="app" sampleCount={8} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Начать со своих данных' }))
    fireEvent.click(screen.getByRole('button', { name: 'Убрать примеры' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Можно добавлять свои товары'))
    expect(mocks.clear).toHaveBeenCalledExactlyOnceWith('app')
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
  it('keeps the confirmation and permits a retry after failure', async () => {
    mocks.clear.mockRejectedValueOnce(new Error('network'))
    render(<InventoryPreparation appId="app" sampleCount={8} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Начать со своих данных' }))
    fireEvent.click(screen.getByRole('button', { name: 'Убрать примеры' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Попробуйте ещё раз'))
    fireEvent.click(await screen.findByRole('button', { name: 'Убрать примеры' }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
  })
  it('locks repeated clicks until the operation ends', async () => {
    let finish!: (result: { ok: true }) => void
    mocks.clear.mockReturnValue(new Promise(resolve => { finish = resolve }))
    render(<InventoryPreparation appId="app" sampleCount={8} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Начать со своих данных' }))
    const button = screen.getByRole('button', { name: 'Убрать примеры' })
    fireEvent.click(button); fireEvent.click(button)
    expect(mocks.clear).toHaveBeenCalledOnce()
    finish({ ok: true })
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
  })
  it('offers no mutation to a viewer and no panel after cleanup', () => {
    const view = render(<InventoryPreparation appId="app" sampleCount={8} canEdit={false} />)
    expect(screen.queryByRole('button')).toBeNull()
    view.rerender(<InventoryPreparation appId="app" sampleCount={0} canEdit />)
    expect(screen.queryByRole('region')).toBeNull()
  })
})
