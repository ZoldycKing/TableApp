// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrepareImportedApp } from './prepare-imported-app'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), replace: vi.fn(), router: { replace: vi.fn() } }))
vi.mock('@/app/builder-v2-actions', () => ({ prepareImportedBuilderAppAction: mocks.prepare }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
beforeEach(() => { vi.resetAllMocks(); mocks.prepare.mockResolvedValue({ ok: true, appId: 'app_result' }) })
afterEach(cleanup)
describe('automatic app preparation', () => {
  it('opens the saved draft automatically, including after a remount on the durable result URL', async () => {
    const ui = render(<StrictMode><PrepareImportedApp runId="run_import123456" primaryTableId="table_main" /></StrictMode>)
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/apps/app_result?start=1'))
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith('run_import123456', 'table_main')
    ui.unmount()
    render(<PrepareImportedApp runId="run_import123456" primaryTableId="table_main" />)
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(2))
    expect(mocks.prepare.mock.calls[1]).toEqual(mocks.prepare.mock.calls[0])
  })
  it('keeps saved data reachable and retries the same run after a lost response', async () => {
    mocks.prepare.mockRejectedValueOnce(new Error('offline'))
    const ui = render(<PrepareImportedApp runId="run_import123456" />)
    expect((await ui.findByRole('alert')).textContent).toContain('Данные уже загружены')
    expect(ui.getByRole('link', { name: 'К моим таблицам' }).getAttribute('href')).toBe('/app')
    fireEvent.click(ui.getByRole('button', { name: 'Повторить подготовку' }))
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/apps/app_result?start=1'))
    expect(mocks.prepare).toHaveBeenCalledTimes(2)
    expect(mocks.prepare.mock.calls[1]).toEqual(mocks.prepare.mock.calls[0])
  })
  it('does not navigate after leaving the preparation page', async () => {
    let finish!: (value: unknown) => void
    mocks.prepare.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const ui = render(<PrepareImportedApp runId="run_import123456" />)
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1))
    ui.unmount()
    await act(async () => finish({ ok: true, appId: 'app_old' }))
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })
})
