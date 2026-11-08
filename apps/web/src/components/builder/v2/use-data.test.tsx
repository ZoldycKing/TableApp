// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readBuilderV2DataAction } from '@/app/builder-v2-data-actions'
import type { BuilderV2DataPage, BuilderV2DataResult } from '@/lib/builder-v2-data-types'
import { appV2Fixture } from './fixture.test-utils'
import { updateNodeSource } from './model'
import { useBuilderV2NodeData } from './use-data'

vi.mock('@/app/builder-v2-data-actions', () => ({ readBuilderV2DataAction: vi.fn() }))
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks() })
afterEach(() => { cleanup(); vi.useRealTimers() })
const page = (id: string, next: string | null = null): BuilderV2DataPage => ({ kind: 'collection', total: 2, rows: [{ id, tableId: 'requests', values: { r_title: id }, display: { r_title: id } }], value: null, next })
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(350) })
const collection = (app: ReturnType<typeof appV2Fixture>) => app.nodes.find(node => node.id === 'request_list')!

describe('v2 live source loading', () => {
  it('ignores an older response after the block switches its configuration', async () => {
    let finish!: (result: BuilderV2DataResult) => void
    vi.mocked(readBuilderV2DataAction).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ ok: true, page: page('new') })
    const app = appV2Fixture()
    const hook = renderHook(({ app }) => useBuilderV2NodeData(app, collection(app), true, ''), { initialProps: { app } })
    await tick()
    hook.rerender({ app: updateNodeSource(app, 'request_list', { sorts: [{ fieldId: 'r_amount', direction: 'desc' }] }) })
    expect(hook.result.current.page).toBeUndefined()
    await tick()
    expect(hook.result.current.page?.rows[0]!.id).toBe('new')
    await act(async () => { finish({ ok: true, page: page('old') }) })
    expect(hook.result.current.page?.rows[0]!.id).toBe('new')
  })

  it('keeps loaded records after a failed continuation and replaces them on explicit refresh', async () => {
    vi.mocked(readBuilderV2DataAction).mockResolvedValueOnce({ ok: true, page: page('first', 'cursor') }).mockResolvedValueOnce({ ok: false, error: 'Список изменился', stale: true }).mockResolvedValueOnce({ ok: true, page: page('refreshed') })
    const app = appV2Fixture(), hook = renderHook(() => useBuilderV2NodeData(app, collection(app), true, ''))
    await tick(); await act(async () => hook.result.current.loadMore())
    expect(hook.result.current.page?.rows[0]!.id).toBe('first')
    expect(hook.result.current.stale).toBe(true)
    expect(readBuilderV2DataAction).toHaveBeenLastCalledWith(app.id, app, { nodeId: 'request_list', search: '', cursor: 'cursor' })
    act(() => hook.result.current.reload()); await tick()
    expect(hook.result.current.page?.rows[0]!.id).toBe('refreshed')
    expect(hook.result.current.error).toBe('')
  })

  it('debounces search, replaces rather than appends its results and never loads a disabled preview', async () => {
    vi.mocked(readBuilderV2DataAction).mockResolvedValue({ ok: true, page: page('first') })
    const app = appV2Fixture(), hook = renderHook(({ search, enabled }) => useBuilderV2NodeData(app, collection(app), enabled, search), { initialProps: { search: '', enabled: false } })
    await tick(); expect(readBuilderV2DataAction).not.toHaveBeenCalled()
    hook.rerender({ search: 'за', enabled: true }); hook.rerender({ search: 'заявка', enabled: true }); await tick()
    expect(readBuilderV2DataAction).toHaveBeenCalledTimes(1)
    expect(readBuilderV2DataAction).toHaveBeenLastCalledWith(app.id, app, { nodeId: 'request_list', search: 'заявка' })
    vi.mocked(readBuilderV2DataAction).mockResolvedValue({ ok: true, page: page('second') })
    hook.rerender({ search: 'другое', enabled: true }); expect(hook.result.current.page).toBeUndefined(); await tick()
    expect(hook.result.current.page?.rows.map(row => row.id)).toEqual(['second'])
  })
})

it('binds paging to the selected folder and discards late pages from a previous folder', async () => {
  let finish!: (result: BuilderV2DataResult) => void
  vi.mocked(readBuilderV2DataAction).mockResolvedValueOnce({ ok: true, page: page('A', 'cursor-A') }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce({ ok: true, page: page('B') })
  const app = appV2Fixture(), hook = renderHook(({ recordId }) => useBuilderV2NodeData(app, collection(app), true, '', { screenId: 'detail', recordId }), { initialProps: { recordId: 'A' } })
  await tick(); act(() => { void hook.result.current.loadMore() }); hook.rerender({ recordId: 'B' })
  expect(hook.result.current.page).toBeUndefined()
  await tick(); await act(async () => finish({ ok: true, page: page('late-A') }))
  expect(hook.result.current.page?.rows[0]!.id).toBe('B')
  expect(readBuilderV2DataAction).toHaveBeenLastCalledWith(app.id, app, { nodeId: 'request_list', search: '', screenId: 'detail', recordId: 'B' })
})

 it('appends only the requested kanban column and preserves its neighbor after a failed continuation',async()=>{
  const a=page('a1').rows[0]!,b=page('b1').rows[0]!,a2=page('a2').rows[0]!,columns=[{key:'c:a',name:'Новый',rows:[a],total:3,next:'next-a'},{key:'c:b',name:'Готово',rows:[b],total:2,next:'next-b'}],initial={...page('a1'),rows:[a,b],total:5,board:{columns}}
  vi.mocked(readBuilderV2DataAction).mockResolvedValueOnce({ok:true,page:initial}).mockResolvedValueOnce({ok:false,error:'Соединение прервано'}).mockResolvedValueOnce({ok:true,page:{...initial,rows:[a2],board:{columns:[{...columns[0]!,rows:[a2],next:'last-a'}]}}})
  const app=appV2Fixture(),hook=renderHook(()=>useBuilderV2NodeData(app,collection(app),true,''));await tick();await act(async()=>hook.result.current.loadMore('c:a'));expect(hook.result.current.errorColumn).toBe('c:a');expect(hook.result.current.page?.board?.columns[1]).toEqual(columns[1]);await act(async()=>hook.result.current.loadMore('c:a'));expect(hook.result.current.page?.board?.columns[0]?.rows.map(row=>row.id)).toEqual(['a1','a2']);expect(hook.result.current.page?.board?.columns[1]).toEqual(columns[1]);expect(readBuilderV2DataAction).toHaveBeenLastCalledWith(app.id,app,{nodeId:'request_list',search:'',cursor:'next-a',boardColumn:'c:a'})
 })
