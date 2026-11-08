// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeferredTemplatePreview } from './deferred-preview'
import { templateExample } from '@/lib/templates/presentation'
import { templateAppPreview } from '@/lib/templates/app-preview'

vi.mock('next/dynamic', () => ({ default: () => () => <p>Рабочий пример</p> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('deferred marketing previews', () => {
  it('mounts the runtime only near the viewport and disconnects its observer', () => {
    let enter!: IntersectionObserverCallback
    const disconnect = vi.fn(), observe = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { enter = callback }
      observe = observe
      disconnect = disconnect
    })
    const ui = render(<DeferredTemplatePreview initial={templateAppPreview(templateExample('sklad'), 'staff')} signedIn={null} />)
    expect(observe).toHaveBeenCalledOnce()
    expect(ui.queryByText('Рабочий пример')).toBeNull()
    act(() => enter([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    expect(ui.queryByText('Рабочий пример')).toBeNull()
    act(() => enter([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    expect(ui.getByText('Рабочий пример')).toBeTruthy()
    expect(disconnect).toHaveBeenCalled()
  })

  it('still opens the example in browsers without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const ui = render(<DeferredTemplatePreview initial={templateAppPreview(templateExample('sklad'), 'staff')} signedIn={null} />)
    expect(ui.getByText('Рабочий пример')).toBeTruthy()
  })
})
