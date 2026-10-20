// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnerHelp, OwnerKnowledgeBase } from './owner-help'
import { ownerHelpAppId, OWNER_HELP_EVENT } from '@/lib/owner-help'

vi.mock('next/navigation', () => ({ usePathname: () => '/apps/app-a', useSearchParams: () => new URLSearchParams() }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('task knowledge base', () => {
  it('skips hidden guide targets and explains the current task instead', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn() })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      return (this.hidden ? [] : [this.getBoundingClientRect()]) as unknown as DOMRectList
    })
    const ui = render(<><main><div hidden data-guide="preview-roles" /><nav hidden data-guide="app-sections" /></main><OwnerHelp /></>)
    fireEvent(window, new Event(OWNER_HELP_EVENT))
    fireEvent.click(ui.getByRole('button', { name: 'Объяснить текущий экран', hidden: true }))
    const guide = ui.getByRole('region', { name: 'Подсказка по экрану' })
    expect(guide.textContent).toContain('Подсказка 1 из 1')
    expect(guide.textContent).toContain('Помощь для вашей задачи')
    expect(ui.container.querySelector('main')?.classList.contains('owner-guide-target')).toBe(true)
    expect(ui.container.querySelector('[hidden].owner-guide-target')).toBeNull()
  })
  it.each(['/apps/app-a', '/setup'])('returns from schedule help to the selected app on %s', (context) => {
    const appId = ownerHelpAppId(context, 'app-a')
    const ui = render(<OwnerKnowledgeBase context={context} appId={appId} />)
    fireEvent.change(ui.getByRole('searchbox'), { target: { value: 'занятые интервалы' } })
    const action = ui.getByRole('link', { name: /Открыть рабочие условия/ })
    const destination = new URL(action.getAttribute('href')!, 'https://tableapp.test')
    expect(destination.searchParams.get('app')).toBe('app-a')
    expect(destination.searchParams.get('step')).toBe('work')
  })
  it('asks for an application when schedule help has no application context', () => {
    const ui = render(<OwnerKnowledgeBase />)
    fireEvent.change(ui.getByRole('searchbox'), { target: { value: 'занятые интервалы' } })
    expect(ui.getByRole('link', { name: /Выбрать приложение/ }).getAttribute('href')).toBe('/apps')
  })
  it('finds relation instructions by their contents and provides a real working destination', () => {
    const ui = render(<OwnerKnowledgeBase context="/t/test" />)
    fireEvent.change(ui.getByRole('searchbox', { name: 'Найти ответ' }), { target: { value: 'Rollup' } })
    expect(ui.getByRole('status').textContent).toBe('Найдено статей: 1')
    expect(ui.getByText('Связать таблицы')).toBeTruthy()
    expect(ui.getByRole('link', { name: /Открыть таблицы/ }).getAttribute('href')).toBe('/tables')
    fireEvent.change(ui.getByRole('searchbox'), { target: { value: 'nonexistent-query' } })
    expect(ui.getByText(/Попробуйте другое слово/)).toBeTruthy()
  })
})
