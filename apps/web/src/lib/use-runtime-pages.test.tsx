// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScreenRuntime } from './use-screen-runtime'
import type { RuntimeApp } from './app-runtime'
import { runtimeQueryKey, type RuntimePageRequest } from './runtime-page-types'
import { modularPilotExample } from './templates/modular-pilot-example'
import { templateAppPreview } from './templates/app-preview'

const mocks = vi.hoisted(() => ({ page: vi.fn(), rows: vi.fn(), legacy: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/runtime-screen-actions', () => ({ loadRuntimePageAction: mocks.page, loadRuntimeRowsAction: mocks.rows, loadRuntimeScreenAction: mocks.legacy }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks() })

function ids(value: RuntimeApp) {
  const config = value.app.customer!
  const catalogue = value.app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') && screen.source.viewId === config.catalog!.viewId)!
  return { tableId: config.catalog!.tableId, catalogueId: catalogue.id, detailId: config.catalog!.detailScreenId, formId: config.formScreenId, name: config.catalog!.titleFieldId, price: config.cart!.priceFieldId }
}
function pageRuntime(value: RuntimeApp, rowIds: string[], request: RuntimePageRequest = {}, next: string | null = null): RuntimeApp {
  const config = ids(value)
  return { ...value,
    lazy: { ...value.lazy!, loadedScreenIds: [config.catalogueId], paged: true },
    tables: { ...value.tables, [config.tableId]: { ...value.tables[config.tableId]!, rows: rowIds.map((id, index) => ({ id, position: id, version: 0, data: { [config.name]: id, [config.price]: 100 + index } })) } },
    screens: { ...value.screens, [config.catalogueId]: { rowIds, page: { key: runtimeQueryKey(request), next, total: 100, matched: 100, choiceCounts: {}, sectionCounts: {}, asOf: 1_800_000_000_000, dataRevision: 'd'.repeat(64) } } },
  }
}
function base() {
  const runtime = templateAppPreview(modularPilotExample(), 'client', 'irina@example.com', 'Ирина').runtime
  return pageRuntime({ ...runtime, lazy: { revision: 'a'.repeat(64), loadedScreenIds: [], paged: true, loadedRows: {} } }, ['first-row'], {}, 'next-one')
}
type Result = { ok: true; runtime: RuntimeApp } | { ok: false; error: string; reload?: boolean; reset?: boolean }
function pending() {
  let resolve!: (result: Result) => void
  const promise = new Promise<Result>(done => { resolve = done })
  return { promise, resolve }
}
function Harness({ initial, query = '', screenId, rowId = null, cartProductIds = [], request }: { initial: RuntimeApp; query?: string; screenId?: string; rowId?: string | null; cartProductIds?: string[]; request?: RuntimePageRequest }) {
  const config = ids(initial), id = screenId ?? config.catalogueId
  const result = useScreenRuntime(initial, id, false, { rowId, listStates: { [config.catalogueId]: { query, choiceId: null }, ...(request ? { [id]: request } : {}) }, cartProductIds })
  const controls = result.pageControls[id]
  return <>
    <output aria-label="Collection rows">{result.runtime.screens[config.catalogueId]?.rowIds.join(',') ?? ''}</output>
    <output aria-label="Active rows">{result.runtime.screens[id]?.rowIds.join(',') ?? ''}</output>
    <output aria-label="Loaded products">{result.runtime.tables[config.tableId]?.rows.map(row => `${row.id}:${row.data[config.price]}`).join(',') ?? ''}</output>
    <output aria-label="Related products">{result.runtime.relatedTitles[config.tableId]?.map(row => row.id).join(',') ?? ''}</output>
    <output aria-label="Acknowledged rows">{JSON.stringify(result.runtime.lazy?.loadedRows ?? {})}</output>
    <span>{result.error ?? (result.loading ? 'Screen loading' : 'Screen ready')}</span>
    {controls?.error ? <span>{controls.error}</span> : null}
    <button disabled={controls?.loading} onClick={() => controls?.onMore()}>More</button>
    <button onClick={() => controls?.onRetry()}>Retry page</button>
  </>
}

describe('paged runtime loading', () => {
  it('appends a continuation once, merges duplicate IDs and leaves the first page visible while loading', async () => {
    const initial = base(), request = pending(), config = ids(initial)
    mocks.page.mockReturnValueOnce(request.promise)
    const ui = render(<Harness initial={initial} />)
    expect(ui.getByLabelText('Collection rows').textContent).toBe('first-row')
    fireEvent.click(ui.getByRole('button', { name: 'More' })); fireEvent.click(ui.getByRole('button', { name: 'More' }))
    await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(1))
    expect(mocks.page.mock.calls[0]!.slice(0, 3)).toEqual([initial.app.slug, config.catalogueId, initial.lazy!.revision])
    expect(mocks.page.mock.calls[0]![4]).toBe('next-one')
    expect(ui.getByLabelText('Collection rows').textContent).toBe('first-row')
    await act(async () => request.resolve({ ok: true, runtime: pageRuntime(initial, ['first-row', 'second-row'], {}, 'next-two') }))
    expect(ui.getByLabelText('Collection rows').textContent).toBe('first-row,second-row')
    expect(ui.getByLabelText('Loaded products').textContent?.split(',').filter(value => value.startsWith('first-row:'))).toHaveLength(1)
  })

  it('keeps loaded rows on a continuation failure and retries the same cursor', async () => {
    const initial = base()
    mocks.page.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, runtime: pageRuntime(initial, ['second-row']) })
    const ui = render(<Harness initial={initial} />)
    fireEvent.click(ui.getByRole('button', { name: 'More' }))
    expect(await ui.findByText(/Проверьте соединение/)).toBeTruthy()
    expect(ui.getByLabelText('Collection rows').textContent).toBe('first-row')
    fireEvent.click(ui.getByRole('button', { name: 'Retry page' }))
    await waitFor(() => expect(ui.getByLabelText('Collection rows').textContent).toBe('first-row,second-row'))
    expect(mocks.page.mock.calls.map(call => call[4])).toEqual(['next-one', 'next-one'])
  })

  it('clears the previous query page and ignores its slower response when search changes', async () => {
    const initial = base(), old = pending(), current = pending()
    mocks.page.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const ui = render(<Harness initial={initial} query="old" />)
    await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(1))
    ui.rerender(<Harness initial={initial} query="new" />)
    expect(ui.getByLabelText('Collection rows').textContent).toBe('')
    await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(2))
    expect(mocks.page.mock.calls[1]![4]).toBeUndefined()
    await act(async () => old.resolve({ ok: true, runtime: pageRuntime(initial, ['old-result'], { query: 'old' }) }))
    expect(ui.getByLabelText('Collection rows').textContent).not.toContain('old-result')
    await act(async () => current.resolve({ ok: true, runtime: pageRuntime(initial, ['new-result'], { query: 'new' }) }))
    expect(ui.getByLabelText('Collection rows').textContent).toBe('new-result')
  })

  it('drops the previous identity immediately and ignores its pending continuation', async () => {
    const initial = base(), old = pending()
    mocks.page.mockReturnValueOnce(old.promise)
    const ui = render(<Harness initial={initial} />)
    fireEvent.click(ui.getByRole('button', { name: 'More' }))
    await waitFor(() => expect(mocks.page).toHaveBeenCalledOnce())
    const fresh = pageRuntime({ ...initial, lazy: { ...initial.lazy!, revision: 'b'.repeat(64) } }, ['new-identity-row'])
    ui.rerender(<Harness initial={fresh} />)
    expect(ui.getByLabelText('Collection rows').textContent).toBe('new-identity-row')
    expect(ui.getByLabelText('Loaded products').textContent).not.toContain('first-row')
    await act(async () => old.resolve({ ok: true, runtime: pageRuntime(initial, ['old-identity-row']) }))
    expect(ui.getByLabelText('Collection rows').textContent).toBe('new-identity-row')
    expect(ui.getByLabelText('Loaded products').textContent).not.toContain('old-identity-row')
  })

  it('refreshes the app when continuation authorization changes', async () => {
    const initial = base()
    mocks.page.mockResolvedValue({ ok: false, error: 'Access changed', reload: true })
    const ui = render(<Harness initial={initial} />)
    fireEvent.click(ui.getByRole('button', { name: 'More' }))
    expect(await ui.findByText('Access changed')).toBeTruthy()
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('resets stale continuation membership and fetches a fresh first page with the current query', async () => {
    const initial = base(), firstPage = pending(), config = ids(initial)
    initial.relatedTitles[config.tableId] = [{ id: 'first-row', title: 'first-row' }]
    initial.lazy!.loadedRows = { [config.detailId]: ['first-row'] }
    mocks.page.mockResolvedValueOnce({ ok: false, error: 'List changed', reset: true }).mockReturnValueOnce(firstPage.promise)
    const ui = render(<Harness initial={initial} />)
    fireEvent.click(ui.getByRole('button', { name: 'More' }))
    await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(2))
    expect(mocks.page.mock.calls.map(call => call[4])).toEqual(['next-one', undefined])
    expect(ui.getByLabelText('Collection rows').textContent).toBe('')
    expect(ui.getByLabelText('Loaded products').textContent).not.toContain('first-row')
    expect(ui.getByLabelText('Related products').textContent).not.toContain('first-row')
    expect(ui.getByLabelText('Acknowledged rows').textContent).not.toContain('first-row')
    await act(async () => firstPage.resolve({ ok: true, runtime: pageRuntime(initial, ['fresh-first-row']) }))
    expect(ui.getByLabelText('Collection rows').textContent).toBe('fresh-first-row')
  })

  it('allows loading more again after leaving a catalogue and abandoning its pending response', async () => {
    const initial = base(), request = pending(), config = ids(initial)
    initial.lazy!.loadedScreenIds.push(config.detailId)
    initial.lazy!.loadedRows = { [config.detailId]: ['first-row'] }
    mocks.page.mockReturnValueOnce(request.promise).mockResolvedValueOnce({ ok: true, runtime: pageRuntime(initial, ['second-row']) })
    const ui = render(<Harness initial={initial} />)
    fireEvent.click(ui.getByRole('button', { name: 'More' }))
    await waitFor(() => expect(mocks.page).toHaveBeenCalledOnce())
    ui.rerender(<Harness initial={initial} screenId={config.detailId} rowId="first-row" />)
    await act(async () => request.resolve({ ok: true, runtime: pageRuntime(initial, ['abandoned-result']) }))
    ui.rerender(<Harness initial={initial} />)
    expect((ui.getByRole('button', { name: 'More' }) as HTMLButtonElement).disabled).toBe(false)
    expect(ui.getByLabelText('Collection rows').textContent).not.toContain('abandoned-result')
    fireEvent.click(ui.getByRole('button', { name: 'More' }))
    await waitFor(() => expect(ui.getByLabelText('Collection rows').textContent).toBe('first-row,second-row'))
    expect(mocks.page.mock.calls.map(call => call[4])).toEqual(['next-one', 'next-one'])
  })

  it('loads an off-page detail product by ID without adding it to the catalogue page', async () => {
    const initial = base(), config = ids(initial), request = pending()
    initial.lazy!.loadedScreenIds.push(config.detailId)
    mocks.rows.mockReturnValueOnce(request.promise)
    const ui = render(<Harness initial={initial} screenId={config.detailId} rowId="off-page-product" />)
    await waitFor(() => expect(mocks.rows).toHaveBeenCalledOnce())
    expect(mocks.rows.mock.calls[0]).toEqual([initial.app.slug, config.detailId, initial.lazy!.revision, ['off-page-product']])
    const pinned = pageRuntime(initial, ['off-page-product'])
    pinned.screens = {}
    pinned.lazy = { ...initial.lazy!, loadedScreenIds: [config.detailId], loadedRows: { [config.detailId]: ['off-page-product'] } }
    await act(async () => request.resolve({ ok: true, runtime: pinned }))
    expect(ui.getByLabelText('Loaded products').textContent).toContain('off-page-product:100')
    expect(ui.getByLabelText('Collection rows').textContent).toBe('first-row')
    expect(ui.getByText('Screen ready')).toBeTruthy()
  })

  it('loads a restored basket product and its price outside the current catalogue page', async () => {
    const initial = base(), config = ids(initial), pinned = pageRuntime(initial, ['basket-product'])
    initial.lazy!.loadedScreenIds.push(config.formId)
    pinned.screens = {}
    pinned.lazy = { ...initial.lazy!, loadedRows: { [config.detailId]: ['basket-product'] } }
    mocks.rows.mockResolvedValueOnce({ ok: true, runtime: pinned })
    const ui = render(<Harness initial={initial} screenId={config.formId} cartProductIds={['basket-product']} />)
    await waitFor(() => expect(mocks.rows).toHaveBeenCalledOnce())
    expect(mocks.rows.mock.calls[0]).toEqual([initial.app.slug, config.detailId, initial.lazy!.revision, ['basket-product']])
    await waitFor(() => expect(ui.getByLabelText('Loaded products').textContent).toContain('basket-product:100'))
    expect(ui.getByLabelText('Collection rows').textContent).toBe('first-row')
    expect(mocks.legacy).not.toHaveBeenCalled()
  })

  it('loads a full restored basket plus another deep-linked product in bounded batches without expanding the catalogue', async () => {
    const initial = base(), config = ids(initial), basket = Array.from({ length: 100 }, (_, index) => `basket-${index}`)
    mocks.rows.mockImplementation(async (_slug: string, _screenId: string, _revision: string, rowIds: string[]) => {
      if (rowIds.length > 100) return { ok: false, error: 'Row limit exceeded' }
      const pinned = pageRuntime(initial, rowIds)
      pinned.screens = {}
      pinned.lazy = { ...initial.lazy!, loadedRows: { [config.detailId]: rowIds } }
      return { ok: true, runtime: pinned }
    })
    const ui = render(<Harness initial={initial} screenId={config.detailId} rowId="another-product" cartProductIds={basket} />)
    await waitFor(() => expect(ui.getByText('Screen ready')).toBeTruthy())
    expect(mocks.rows.mock.calls.map(call => call[3].length)).toEqual([100, 1])
    const requested = mocks.rows.mock.calls.flatMap(call => call[3] as string[])
    expect(new Set(requested)).toEqual(new Set(['another-product', ...basket]))
    expect(requested).toHaveLength(101)
    for (const id of requested) expect(ui.getByLabelText('Loaded products').textContent).toContain(`${id}:`)
    expect(ui.getByLabelText('Collection rows').textContent).toBe('first-row')
    expect(mocks.legacy).not.toHaveBeenCalled()
  })

  it('discards acknowledged rows after a fresh search observes reassignment and reloads the old card on back', async () => {
    const initial = base(), config = ids(initial)
    initial.lazy!.loadedRows = { [config.detailId]: ['first-row'] }
    initial.relatedTitles[config.tableId] = [{ id: 'first-row', title: 'Previously mine' }]
    const fresh = pageRuntime(initial, ['current-result'], { query: 'current' })
    fresh.screens[config.catalogueId]!.page!.dataRevision = 'e'.repeat(64)
    fresh.relatedTitles = {}
    fresh.lazy!.loadedRows = {}
    mocks.page.mockResolvedValueOnce({ ok: true, runtime: fresh })
    const ui = render(<Harness initial={initial} />)
    ui.rerender(<Harness initial={initial} query="current" />)
    await waitFor(() => expect(ui.getByLabelText('Collection rows').textContent).toBe('current-result'))
    expect(ui.getByLabelText('Loaded products').textContent).not.toContain('first-row')
    expect(ui.getByLabelText('Related products').textContent).not.toContain('first-row')
    expect(ui.getByLabelText('Acknowledged rows').textContent).not.toContain('first-row')
    const denied = pageRuntime(initial, [])
    denied.screens = {}
    denied.relatedTitles = {}
    denied.lazy!.loadedRows = { [config.detailId]: ['first-row'] }
    mocks.rows.mockResolvedValueOnce({ ok: true, runtime: denied })
    ui.rerender(<Harness initial={initial} screenId={config.detailId} rowId="first-row" />)
    await waitFor(() => expect(mocks.rows).toHaveBeenCalledOnce())
    expect(mocks.rows.mock.calls[0]![3]).toEqual(['first-row'])
    await waitFor(() => expect(ui.getByText('Screen ready')).toBeTruthy())
    expect(ui.getByLabelText('Loaded products').textContent).not.toContain('first-row')
  })

  it('refreshes the active booking snapshot at the nearest visit end, retains the query and does not loop on an empty result', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const now = Date.UTC(2027, 0, 15, 10), initial = base(), config = initial.app.booking!
    vi.setSystemTime(now)
    const id = config.listScreenId!, request: RuntimePageRequest = { query: 'визит', bookingSection: 'upcoming' }, next = pending(), periodic = pending()
    initial.tables[config.tables.visits] = { ...initial.tables[config.tables.visits]!, rows: [{ id: 'ending-visit', position: 'a', data: {
      [config.visit.start]: new Date(now - 59_000).toISOString(), [config.visit.minutes]: 1, [config.visit.status]: config.statuses.booked,
    } }] }
    initial.screens[id] = { rowIds: ['ending-visit'], page: { key: runtimeQueryKey({ ...request, choiceId: null }), next: 'old-booking-cursor',
      total: 1, matched: 1, choiceCounts: {}, sectionCounts: { upcoming: 1, history: 0 }, asOf: now, dataRevision: 'd'.repeat(64) } }
    initial.lazy!.loadedScreenIds.push(id)
    mocks.page.mockReturnValueOnce(next.promise).mockReturnValueOnce(periodic.promise)
    const ui = render(<Harness initial={initial} screenId={id} request={request} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(999) })
    expect(mocks.page).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(mocks.page).toHaveBeenCalledOnce()
    expect(mocks.page.mock.calls[0]!.slice(1)).toEqual([id, initial.lazy!.revision, { query: 'визит', choiceId: null, bookingSection: 'upcoming' }, undefined])
    expect(ui.getByLabelText('Active rows').textContent).toBe('ending-visit')
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(mocks.page).toHaveBeenCalledOnce()
    const fresh = { ...initial, screens: { [id]: { rowIds: [], page: { ...initial.screens[id]!.page!, next: null, total: 0, matched: 0, asOf: Date.now() } } },
      tables: { ...initial.tables, [config.tables.visits]: { ...initial.tables[config.tables.visits]!, rows: [] } } }
    await act(async () => next.resolve({ ok: true, runtime: fresh }))
    expect(ui.getByLabelText('Active rows').textContent).toBe('')
    expect(ui.getByLabelText('Loaded products').textContent).toContain('first-row')
    await act(async () => { await vi.advanceTimersByTimeAsync(299_999) })
    expect(mocks.page).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(mocks.page).toHaveBeenCalledTimes(2)
  })
})
