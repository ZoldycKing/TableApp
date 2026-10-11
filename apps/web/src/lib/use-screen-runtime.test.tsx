// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScreenRuntime } from './use-screen-runtime'
import type { RuntimeApp } from './app-runtime'
import { modularPilotExample } from './templates/modular-pilot-example'
import { templateAppPreview } from './templates/app-preview'

const mocks = vi.hoisted(() => ({ load: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/runtime-screen-actions', () => ({ loadRuntimeScreenAction: mocks.load }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const base = () => {
  const runtime = templateAppPreview(modularPilotExample(), 'client', 'irina@example.com', 'Ирина').runtime
  return { ...runtime, lazy: { revision: 'a'.repeat(64), loadedScreenIds: [runtime.app.homeScreenId!] } }
}
function Harness({ initial, id }: { initial: RuntimeApp; id: string }) {
  const result = useScreenRuntime(initial, id, false)
  return <><span>{result.error ?? (result.loading ? 'Loading' : result.runtime.app.name)}</span><button onClick={result.retry}>Retry</button></>
}
function pending() {
  let resolve!: (result: { ok: true; runtime: RuntimeApp }) => void
  const promise = new Promise<{ ok: true; runtime: RuntimeApp }>(done => { resolve = done })
  return { promise, resolve }
}

describe('on-demand runtime data', () => {
  it('ignores a slower response from a screen the user has already left', async () => {
    const initial = base(), first = pending(), second = pending()
    mocks.load.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const ui = render(<Harness initial={initial} id="screen-a" />)
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
    ui.rerender(<Harness initial={initial} id="screen-b" />)
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2))
    await act(async () => second.resolve({ ok: true, runtime: { ...initial, app: { ...initial.app, name: 'Screen B' }, lazy: { ...initial.lazy, loadedScreenIds: ['screen-b'] } } }))
    expect(ui.getByText('Screen B')).toBeTruthy()
    await act(async () => first.resolve({ ok: true, runtime: { ...initial, app: { ...initial.app, name: 'Stale screen A' }, lazy: { ...initial.lazy, loadedScreenIds: ['screen-a'] } } }))
    expect(ui.queryByText('Stale screen A')).toBeNull()
    expect(ui.getByText('Screen B')).toBeTruthy()
  })
  it('drops old data immediately after a server refresh and ignores its pending response', async () => {
    const initial = base(), request = pending()
    mocks.load.mockReturnValueOnce(request.promise)
    const ui = render(<Harness initial={initial} id="history" />)
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
    const fresh = { ...initial, app: { ...initial.app, name: 'Fresh identity' }, lazy: { revision: 'b'.repeat(64), loadedScreenIds: ['history'] } }
    ui.rerender(<Harness initial={fresh} id="history" />)
    expect(ui.getByText('Fresh identity')).toBeTruthy()
    await act(async () => request.resolve({ ok: true, runtime: { ...initial, app: { ...initial.app, name: 'Previous identity' }, lazy: { ...initial.lazy, loadedScreenIds: ['history'] } } }))
    expect(ui.queryByText('Previous identity')).toBeNull()
  })
  it('allows retry after a network failure and refreshes when authorization changes', async () => {
    const initial = base()
    mocks.load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: false, error: 'Access changed', reload: true })
    const ui = render(<Harness initial={initial} id="history" />)
    expect(await ui.findByText(/Проверьте соединение/)).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Retry' }))
    expect(await ui.findByText('Access changed')).toBeTruthy()
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
