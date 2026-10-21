// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnerHelp, OwnerHelpButton, OwnerKnowledgeBase } from './owner-help'
import { ownerHelpAppId, OWNER_HELP_EVENT } from '@/lib/owner-help'

vi.mock('next/navigation', () => ({ usePathname: () => '/apps/app-a', useSearchParams: () => new URLSearchParams() }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('task knowledge base', () => {
  it('opens contextual help without navigating or losing a form value', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: vi.fn() })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() })
    const ui = render(<><input aria-label="Draft" defaultValue="Keep this" /><OwnerHelpButton href="/help?article=company&app=selected" /><OwnerHelp /></>)
    const button = ui.getByRole('button', { name: 'Помощь с этим шагом' })
    button.focus()
    fireEvent.click(button)
    expect(ui.getByRole('article', { hidden: true }).textContent).toContain('Название и контакты компании')
    expect((ui.getByLabelText('Draft') as HTMLInputElement).value).toBe('Keep this')
    fireEvent.click(ui.getByRole('button', { name: 'Все инструкции', hidden: true }))
    fireEvent.click(ui.getByRole('button', { name: 'Заменить учебные данные', hidden: true }))
    expect(ui.getByRole('article', { hidden: true }).textContent).toContain('Заменить учебные данные')
    fireEvent(ui.container.querySelector('dialog')!, new Event('cancel', { cancelable: true }))
    expect(document.activeElement).toBe(button)
    fireEvent.click(button)
    expect(ui.getByRole('article', { hidden: true }).textContent).toContain('Название и контакты компании')
  })
  it('opens the requested help article first while keeping the rest available', () => {
    const ui = render(<OwnerKnowledgeBase context="/setup" appId="chosen-app" articleId="tables" />)
    expect(ui.getByRole('article').textContent).toContain('Таблица и форма записи')
    expect(ui.container.querySelector('details')).toBeNull()
    expect(ui.getByRole('navigation', { name: 'Инструкции' })).toBeTruthy()
    fireEvent.change(ui.getByRole('searchbox'), { target: { value: 'занятые интервалы' } })
    fireEvent.click(ui.getByRole('button', { name: 'Подготовить запись по времени' }))
    expect(ui.getByRole('link', { name: /Открыть рабочие условия/ }).getAttribute('href')).toContain('app=chosen-app')
  })
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
    fireEvent.click(ui.getByRole('button', { name: 'Показать подсказки на экране', hidden: true }))
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
    fireEvent.click(ui.getByRole('button', { name: 'Подготовить запись по времени' }))
    const action = ui.getByRole('link', { name: /Открыть рабочие условия/ })
    const destination = new URL(action.getAttribute('href')!, 'https://tableapp.test')
    expect(destination.searchParams.get('app')).toBe('app-a')
    expect(destination.searchParams.get('step')).toBe('work')
  })
  it('asks for an application when schedule help has no application context', () => {
    const ui = render(<OwnerKnowledgeBase />)
    fireEvent.change(ui.getByRole('searchbox'), { target: { value: 'занятые интервалы' } })
    fireEvent.click(ui.getByRole('button', { name: 'Подготовить запись по времени' }))
    expect(ui.getByRole('link', { name: /Выбрать приложение/ }).getAttribute('href')).toBe('/apps')
  })
  it('finds relation instructions by their contents and provides a real working destination', () => {
    const ui = render(<OwnerKnowledgeBase context="/t/test" />)
    fireEvent.change(ui.getByRole('searchbox', { name: 'Найти ответ' }), { target: { value: 'Rollup' } })
    expect(ui.getByRole('status').textContent).toBe('Найдено статей: 1')
    fireEvent.click(ui.getByRole('button', { name: 'Связать таблицы' }))
    expect(ui.getByRole('link', { name: /Открыть таблицы/ }).getAttribute('href')).toBe('/tables')
    fireEvent.change(ui.getByRole('searchbox'), { target: { value: 'nonexistent-query' } })
    expect(ui.getByText(/Попробуйте другое слово/)).toBeTruthy()
  })
})
