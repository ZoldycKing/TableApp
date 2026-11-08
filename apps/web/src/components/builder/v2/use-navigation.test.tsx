// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { appV2Fixture } from './fixture.test-utils'
import { useBuilderV2Navigation } from './use-navigation'

afterEach(cleanup)
it('preserves a reloadable record URL, supports browser Back and Forward, and clears context for menu screens', async () => {
  window.history.replaceState({ next: 'preserved' }, '', '/apps/app_pilot/preview?device=mobile')
  const app = appV2Fixture(), hook = renderHook(() => useBuilderV2Navigation(app))
  act(() => hook.result.current.navigate('detail', 'folder_A'))
  expect(window.location.search).toContain('row=folder_A'); expect(window.location.search).toContain('device=mobile')
  expect(window.history.state.next).toBe('preserved')
  act(() => hook.result.current.navigate('task_detail', 'task_B'))
  act(() => hook.result.current.back())
  await waitFor(() => expect(hook.result.current.recordId).toBe('folder_A'))
  act(() => window.history.forward())
  await waitFor(() => expect(hook.result.current.recordId).toBe('task_B'))
  act(() => hook.result.current.navigate('home'))
  expect(hook.result.current.recordId).toBeUndefined(); expect(window.location.search).not.toContain('row=')
  window.history.replaceState(null, '', '/apps/app_pilot/preview?screen=detail&row=folder_A')
  const direct = renderHook(() => useBuilderV2Navigation(app, 'detail', 'folder_A'))
  expect(direct.result.current).toMatchObject({ screenId: 'detail', recordId: 'folder_A' })
  act(() => direct.result.current.back())
  expect(direct.result.current.screenId).toBe('home')
})

it('keeps a newly created screen selected after the app graph updates and uses external Next history calls', () => {
  window.history.replaceState({ __NA: true, custom: 'keep' }, '', '/apps/app_pilot')
  const app = appV2Fixture(), push = vi.spyOn(window.history, 'pushState'), hook = renderHook(({ app }) => useBuilderV2Navigation(app), { initialProps: { app } })
  act(() => hook.result.current.navigate('just_created'))
  hook.rerender({ app: { ...app, screens: [...app.screens, { ...app.screens[0]!, id: 'just_created', name: 'Новый', rootIds: [] }] } })
  expect(hook.result.current.screenId).toBe('just_created')
  expect(push.mock.calls.at(-1)![0]).toMatchObject({ custom: 'keep' })
  expect(push.mock.calls.at(-1)![0]).not.toHaveProperty('__NA')
  push.mockRestore()
})
