// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearFormDraftsForActor, useFormDrafts } from './form-drafts'

type Draft = { values: Record<string, unknown>; baseVersion?: number }
const prefix = 'tableapp:form-drafts:'
const scope = 'business-a:app-a:person-a'
const draft: Draft = { values: { name: 'Несохранённая заявка' }, baseVersion: 3 }
const saved = (drafts: unknown, savedAt = Date.now()) => JSON.stringify({ savedAt, drafts })

beforeEach(() => sessionStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear() })

describe('scoped runtime form drafts', () => {
  it('restores values and their edit version after the form unmounts, then removes a saved draft', () => {
    const first = renderHook(() => useFormDrafts<Draft>(scope))
    expect(first.result.current.ready).toBe(true)
    act(() => first.result.current.save('edit:row-a', draft))
    first.unmount()
    const reopened = renderHook(() => useFormDrafts<Draft>(scope))
    expect(reopened.result.current.drafts['edit:row-a']).toEqual(draft)
    act(() => reopened.result.current.remove('edit:row-a'))
    expect(reopened.result.current.drafts).toEqual({})
    expect(sessionStorage.getItem(`${prefix}${scope}`)).toBeNull()
  })
  it('isolates actors, businesses and apps and ignores a late callback from the previous actor', () => {
    const hook = renderHook(({ selected }) => useFormDrafts<Draft>(selected), { initialProps: { selected: scope } })
    act(() => hook.result.current.save('create:new', draft))
    const oldSave = hook.result.current.save
    for (const selected of ['business-a:app-a:person-b', 'business-b:app-a:person-a', 'business-a:app-b:person-a']) {
      hook.rerender({ selected })
      expect(hook.result.current.ready).toBe(true)
      expect(hook.result.current.drafts).toEqual({})
      act(() => oldSave('create:new', { values: { name: 'Late response' } }))
      expect(hook.result.current.drafts).toEqual({})
      expect(sessionStorage.getItem(`${prefix}${selected}`)).toBeNull()
    }
    hook.rerender({ selected: scope })
    expect(hook.result.current.drafts['create:new']).toEqual(draft)
  })
  it.each([
    ['invalid JSON', '{broken'], ['array instead of drafts', saved([])],
    ['expired', saved({ form: draft }, Date.now() - 24 * 60 * 60 * 1000 - 10)],
    ['future timestamp', saved({ form: draft }, Date.now() + 60_000)],
    ['oversized', saved({ form: { values: { note: 'x'.repeat(500_001) } } })],
  ])('ignores %s browser storage', (_description, raw) => {
    sessionStorage.setItem(`${prefix}${scope}`, raw)
    const hook = renderHook(() => useFormDrafts<Draft>(scope))
    expect(hook.result.current.ready).toBe(true)
    expect(hook.result.current.drafts).toEqual({})
    act(() => hook.result.current.save('create:new', draft))
    expect(hook.result.current.drafts['create:new']).toEqual(draft)
  })
  it('keeps the page usable when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
    const hook = renderHook(() => useFormDrafts<Draft>(scope))
    expect(hook.result.current.ready).toBe(true)
    act(() => hook.result.current.save('create:new', draft))
    expect(hook.result.current.drafts['create:new']).toEqual(draft)
    act(() => hook.result.current.remove('create:new'))
    expect(hook.result.current.drafts).toEqual({})
  })
  it('discards invalid stored entries through the supplied validator without losing a valid draft', () => {
    sessionStorage.setItem(`${prefix}${scope}`, saved({ valid: draft, invalid: { values: ['broken'], baseVersion: 'old' }, null: null }))
    const validate = (value: unknown): value is Draft => Boolean(value && typeof value === 'object' && 'values' in value && value.values && typeof value.values === 'object' && !Array.isArray(value.values)
      && (!('baseVersion' in value) || typeof value.baseVersion === 'number'))
    const hook = renderHook(() => useFormDrafts<Draft>(scope, validate))
    expect(hook.result.current.ready).toBe(true)
    expect(hook.result.current.drafts).toEqual({ valid: draft })
    act(() => hook.result.current.save('new', { values: { name: 'Новая форма' } }))
    expect(JSON.parse(sessionStorage.getItem(`${prefix}${scope}`)!).drafts).toEqual({ valid: draft, new: { values: { name: 'Новая форма' } } })
  })
  it('clears only the signed-out actor across businesses and preserves other people and unrelated storage', () => {
    const own = [`${prefix}${scope}`, `${prefix}business-b:app-b:person-a`]
    const keep = [`${prefix}business-a:app-a:person-b`, `${prefix}business-a:app-a:other-person-a`, 'tableapp:cart:app-a']
    for (const key of [...own, ...keep]) sessionStorage.setItem(key, saved({ form: draft }))
    clearFormDraftsForActor('person-a')
    for (const key of own) expect(sessionStorage.getItem(key)).toBeNull()
    for (const key of keep) expect(sessionStorage.getItem(key)).not.toBeNull()
  })
})
