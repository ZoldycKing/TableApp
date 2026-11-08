// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessNavigation, BusinessNavigationResult } from '@/lib/business-navigation-types'

const actions = vi.hoisted(() => ({ navigate: vi.fn(), create: vi.fn() }))
vi.mock('@/app/business-navigation-actions', () => ({
  navigateBusinessResourceAction: actions.navigate,
  createBusinessAction: actions.create,
}))
const { BusinessTree } = await import('./business-tree')

const BUSINESSES: BusinessNavigation[] = [
  {
    workspaceId: 'wsp_shop', workspaceName: 'Рабочее пространство', businessName: 'ООО «Ромашка»', role: 'owner',
    tables: [{ id: 'tbl_goods', name: 'Товары', icon: 'table' }, { id: 'tbl_orders', name: 'Заказы', icon: 'table' }],
    apps: [{ id: 'app_shop', name: 'Магазин «Ромашка»', published: true }],
  },
  {
    workspaceId: 'wsp_salon', workspaceName: 'Салон', businessName: 'ИП Иванов', role: 'owner',
    tables: [{ id: 'tbl_services', name: 'Услуги', icon: 'table' }],
    apps: [{ id: 'app_salon', name: 'Салон Иванова', published: false }],
  },
]
const assign = vi.fn()
const originalWindow = window

function show(overrides: Partial<Parameters<typeof BusinessTree>[0]> = {}) {
  return render(<BusinessTree businesses={BUSINESSES} activeWorkspaceId="wsp_shop" pathname="/t/tbl_goods" variant="wide" {...overrides} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  actions.navigate.mockResolvedValue({ ok: true, href: '/tables/tbl_services' })
  actions.create.mockResolvedValue({ ok: true, href: '/app', workspaceId: 'wsp_new' })
  // jsdom's Location is not replaceable; keep the real browser surface except for navigation.
  vi.stubGlobal('window', new Proxy(originalWindow, {
    get(target, property) {
      if (property === 'location') return { assign }
      return Reflect.get(target, property, target)
    },
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('owner business tree', () => {
  it('opens the current business first and lets other branches expand without switching context', () => {
    show({ activeWorkspaceId: 'wsp_salon', pathname: '/apps/app_salon/settings' })
    const headers = screen.getAllByRole('button', { name: /^(Свернуть|Развернуть) разделы:/ })
    expect(headers[0]!.getAttribute('aria-label')).toBe('Свернуть разделы: Салон')
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('true')
    expect(headers[1]!.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Товары' })).toBeNull()

    fireEvent.click(headers[1]!)
    expect(screen.getByRole('button', { name: 'Товары' })).toBeTruthy()
    expect(actions.navigate).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { current: 'page' }).textContent).toContain('Салон Иванова')
  })

  it('switches business by its name independently from branch expansion', async () => {
    actions.navigate.mockResolvedValue({ ok: true, href: '/app' })
    show()
    expect(screen.getByRole('button', { name: 'Развернуть разделы: Салон' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Пространство: Салон' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/app'))
    expect(actions.navigate).toHaveBeenCalledWith('wsp_salon', { kind: 'home' })
  })

  it('navigates through the server action for the exact business and closes the drawer only on success', async () => {
    const onNavigate = vi.fn()
    show({ onNavigate })
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть разделы: Салон' }))
    fireEvent.click(screen.getByRole('button', { name: 'Услуги' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/tables/tbl_services'))
    expect(actions.navigate).toHaveBeenCalledWith('wsp_salon', { kind: 'table', id: 'tbl_services' })
    expect(onNavigate).toHaveBeenCalledOnce()
  })

  it('keeps the current context and reports a refused resource navigation', async () => {
    actions.navigate.mockResolvedValue({ ok: false, error: 'Таблица не найдена в этом бизнесе' })
    const onNavigate = vi.fn()
    show({ onNavigate })
    fireEvent.click(screen.getByRole('button', { name: 'Заказы' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toContain('Таблица не найдена')
    expect(assign).not.toHaveBeenCalled()
    expect(onNavigate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { current: 'page' }).textContent).toBe('Товары')
  })

  it('matches resource paths at their boundary and only within the active business', () => {
    const duplicate: BusinessNavigation = { ...BUSINESSES[1]!, apps: [{ id: 'app_shop', name: 'Другой магазин', published: true }] }
    const ui = show({ businesses: [BUSINESSES[0]!, duplicate], pathname: '/apps/app_shop/settings' })
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть разделы: Салон' }))
    expect(screen.getAllByRole('button', { current: 'page' }).map(item => item.textContent)).toEqual(['Магазин «Ромашка»'])
    ui.rerender(<BusinessTree businesses={BUSINESSES} activeWorkspaceId="wsp_shop" pathname="/apps/app_shop_extra" variant="wide" />)
    expect(screen.queryByRole('button', { current: 'page' })).toBeNull()
  })

  it('groups collapse independently and empty businesses retain collection destinations', async () => {
    const empty: BusinessNavigation = { ...BUSINESSES[0]!, tables: [], apps: [] }
    show({ businesses: [empty] })
    expect(screen.getByText('Таблиц пока нет')).toBeTruthy()
    expect(screen.getByText('Приложений пока нет')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Таблицы: Рабочее пространство' }))
    expect(screen.queryByText('Таблиц пока нет')).toBeNull()
    expect(screen.getByText('Приложений пока нет')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Все приложения: Рабочее пространство' }))
    await waitFor(() => expect(actions.navigate).toHaveBeenCalledWith('wsp_shop', { kind: 'apps' }))
  })

  it('on mobile shows only the chosen business and waits for a validated switch before showing other resources', async () => {
    let finish!: (result: BusinessNavigationResult) => void
    actions.navigate.mockImplementation(() => new Promise<BusinessNavigationResult>(resolve => { finish = resolve }))
    show({ mobile: true })
    expect(screen.getByRole('button', { name: 'Товары' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Услуги' })).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Пространство' }), { target: { value: 'wsp_salon' } })
    expect(actions.navigate).toHaveBeenCalledWith('wsp_salon', { kind: 'home' })
    expect(screen.getByRole('status').textContent).toBe('Открываем пространство…')
    expect(screen.queryByRole('button', { name: 'Товары' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Услуги' })).toBeNull()
    expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(true)
    await act(async () => finish({ ok: false, error: 'У вас нет доступа к этому бизнесу' }))
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('wsp_shop')
    expect(screen.getByRole('button', { name: 'Товары' })).toBeTruthy()
    expect(assign).not.toHaveBeenCalled()
  })

  it('validates the business name, creates it through the action, and prevents duplicate submission', async () => {
    let finish!: (result: BusinessNavigationResult) => void
    actions.create.mockImplementation(() => new Promise<BusinessNavigationResult>(resolve => { finish = resolve }))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить пространство' }))
    const input = screen.getByRole('textbox', { name: 'Название пространства' })
    expect(document.activeElement).toBe(input)
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect(actions.create).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('от 1 до 100')
    fireEvent.change(input, { target: { value: '  ООО «Лист»  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect(actions.create).toHaveBeenCalledWith('ООО «Лист»')
    expect(screen.getByRole('button', { name: 'Создаём…' }).hasAttribute('disabled')).toBe(true)
    fireEvent.submit(input.closest('form')!)
    expect(actions.create).toHaveBeenCalledOnce()
    await act(async () => finish({ ok: true, href: '/app' }))
    expect(assign).toHaveBeenCalledWith('/app')
  })

  it('Escape dismisses business creation and returns focus to its trigger', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить пространство' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Название пространства' }), { key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Добавить пространство' }))
  })
})
