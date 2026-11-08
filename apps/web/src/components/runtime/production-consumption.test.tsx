// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { templateExample } from '@/lib/templates/presentation'
import { useConsumption } from './production-form'

const preview = vi.hoisted(() => vi.fn())
vi.mock('@/app/production-actions', () => ({ previewConsumptionAction: preview }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks() })

it('discards a pending material preview after clearing the product', async () => {
  vi.useFakeTimers()
  const config = templateExample('proizvodstvo').app.production!
  let resolve!: (value: unknown) => void
  preview.mockReturnValue(new Promise(done => { resolve = done }))
  const ui = renderHook(({ product }) => useConsumption('factory', config, { [config.run.product]: [product], [config.run.qty]: 3 }, true), { initialProps: { product: 'product' } })
  await act(async () => { await vi.advanceTimersByTimeAsync(350) })
  expect(preview).toHaveBeenCalledOnce()
  ui.rerender({ product: '' })
  await act(async () => { resolve({ ok: true, lines: [{ material: 'Stale' }] }) })
  expect(ui.result.current).toEqual({ loading: false, preview: null })
})

it('ends loading after a transport failure and permits a new calculation', async () => {
  vi.useFakeTimers()
  const config = templateExample('proizvodstvo').app.production!
  preview.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, lines: [] })
  const ui = renderHook(({ qty }) => useConsumption('factory', config, { [config.run.product]: ['product'], [config.run.qty]: qty }, true), { initialProps: { qty: 3 } })
  await act(async () => { await vi.advanceTimersByTimeAsync(350) })
  expect(ui.result.current.loading).toBe(false)
  ui.rerender({ qty: 4 })
  await act(async () => { await vi.advanceTimersByTimeAsync(350) })
  expect(ui.result.current.preview).toEqual({ quantity: 4, lines: [] })
})
