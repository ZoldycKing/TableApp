// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeApp } from '@/lib/app-runtime'
import { templateExample } from '@/lib/templates/presentation'
import { templateAppPreview } from '@/lib/templates/app-preview'
import { AppShell } from './app-shell'

const mocks = vi.hoisted(() => ({
  request: vi.fn(), consume: vi.fn(), signOut: vi.fn(), create: vi.fn(), update: vi.fn(), refresh: vi.fn(),
  availability: vi.fn(), decision: vi.fn(),
  loading: false, runtime: null as RuntimeApp | null,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/app/auth-actions', () => ({ requestAppLoginAction: mocks.request, consumeAppCodeAction: mocks.consume, signOutAppAction: mocks.signOut }))
vi.mock('@/app/runtime-actions', () => ({ appCreateRowAction: mocks.create, appUpdateRowAction: mocks.update, appDeleteRowAction: vi.fn() }))
vi.mock('@/lib/use-screen-runtime', () => ({ useScreenRuntime: (initial: RuntimeApp) => ({ runtime: mocks.runtime ?? initial, loading: mocks.loading, error: null, retry: vi.fn(), pageControls: {} }) }))
vi.mock('@/lib/use-live-app', () => ({ useLiveApp: vi.fn() }))
vi.mock('@/components/motion/enter-motion', () => ({ useEnterMotion: () => ({ current: null }) }))
vi.mock('@/app/question-auth-actions', () => ({ beginGeneralQuestionAction: vi.fn() }))
vi.mock('@/app/conversation-actions', () => ({ sendConversationAction: vi.fn(), listConversationInboxAction: vi.fn() }))
vi.mock('@/app/production-actions', () => ({ saveMovementAction: vi.fn(), saveProductionAction: vi.fn() }))
vi.mock('@/app/booking-actions', () => ({ bookingAvailabilityAction: mocks.availability, cancelBookingAction: vi.fn(), setupBookingMasterAction: vi.fn(), setBookingDayOffAction: vi.fn() }))
vi.mock('@/app/customer-actions', () => ({ customerDecisionAction: mocks.decision }))
vi.mock('@/app/inventory-actions', () => ({ receiveStockAction: vi.fn(), saveStockOperationAction: vi.fn() }))
vi.mock('./order-stock-panel', () => ({ OrderStockPanel: () => null, InventoryBalancePanel: () => null }))
vi.mock('./order-delivery-panel', () => ({ OrderDeliveryPanel: () => null }))
vi.mock('./conversation-panel', () => ({ ConversationPanel: () => null }))
vi.mock('./conversation-inbox', () => ({ MESSAGES_SCREEN: '__tableapp_messages', parseConversationTarget: () => null, ConversationInbox: () => null }))
vi.mock('./intake-verify', () => ({ IntakeVerify: () => null }))
vi.mock('./customer-history-panel', () => ({ CustomerHistoryPanel: () => null }))
vi.mock('./customer-directory', () => ({ CustomerDirectory: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loading = false; mocks.runtime = null
  mocks.request.mockResolvedValue({ ok: true, delivered: true, via: 'sent', hint: null })
  mocks.consume.mockResolvedValue({ ok: true })
  mocks.update.mockResolvedValue({ ok: true })
  mocks.decision.mockResolvedValue({ ok: true })
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})
afterEach(() => { cleanup(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

const exactField = (name: string) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`)

describe('browser audit runtime integration regressions', () => {
  it('keeps the account menu available without a desktop sidebar in a single-tab staff app', () => {
    const { runtime, viewer } = templateAppPreview(templateExample('crm'), 'staff', 'worker@example.invalid')
    const ui = render(<AppShell runtime={runtime} viewer={viewer} />)
    const account = ui.getByRole('button', { name: 'Мой аккаунт' })
    expect(account.parentElement!.className).not.toContain('@min-[860px]:hidden')
    fireEvent.click(account)
    expect(ui.getByRole('button', { name: /^Выйти$/ })).toBeTruthy()
  })
  it('keeps a single page heading when confirming email for a property request', async () => {
    const example = templateExample('nedvizhimost'), config = example.app.customer!
    const { runtime } = templateAppPreview(example, 'guest')
    const property = runtime.tables[config.catalog!.tableId]!.rows[0]!
    const name = String(property.data[config.catalog!.titleFieldId])
    const ui = render(<AppShell runtime={runtime} viewer={null} />)
    fireEvent.click(ui.getByRole('button', { name: text => text.includes(name) }))
    fireEvent.click(ui.getByRole('button', { name: 'Запросить просмотр' }))
    expect(ui.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(ui.queryByText(/заказа или записи/)).toBeNull()
    fireEvent.change(ui.getByRole('textbox', { name: 'Ваша почта' }), { target: { value: 'viewing@example.invalid' } })
    fireEvent.click(ui.getByRole('button', { name: 'Получить код' }))
    await ui.findByRole('textbox', { name: 'Код из письма' })
    expect(ui.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it.each(['single catalog', 'multiple public tabs'])('keeps one returning-user login entry in the header with %s', async navigation => {
    const { runtime } = templateAppPreview(templateExample('zayavki'), 'guest')
    if (navigation === 'multiple public tabs') {
      const catalog = runtime.app.screens.find(screen => screen.tab)!
      runtime.app.screens.push({ ...catalog, id: 'screen_second_public_catalog', name: 'Другие услуги', tab: { label: 'Другие услуги', icon: 'grid' } })
    }
    const ui = render(<AppShell runtime={runtime} viewer={null} canSignIn />)
    const login = within(ui.getByRole('banner')).getByRole('link', { name: 'Войти' })
    expect(login.getAttribute('href')).toBe('?login=1')
    expect(ui.getAllByRole('link', { name: 'Войти' })).toEqual([login])
    expect(ui.queryByRole('textbox', { name: 'Ваша почта' })).toBeNull()
  })

  it.each(['decline', 'cancel'] as const)('opens history after a successful repair %s and keeps the resulting record visible after refresh', async decision => {
    const example = templateExample('service'), config = example.app.customer!
    const { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const row = runtime.tables[config.tableId]!.rows[0]!
    row.data[config.statusFieldId] = decision === 'decline' ? config.approval!.waitingStatus : config.initialStatus
    const title = String(row.data[runtime.tables[config.tableId]!.primaryFieldId!])
    window.history.replaceState(null, '', `/a/review?e=${config.detailScreenId}&r=${row.id}`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    await ui.findByRole('heading', { name: title })
    if (decision === 'decline') fireEvent.click(ui.getByRole('button', { name: 'Отказаться от ремонта' }))
    else {
      fireEvent.click(ui.getByRole('button', { name: 'Отменить заявку на ремонт' }))
      fireEvent.click(ui.getByRole('button', { name: 'Да, отменить' }))
    }
    await waitFor(() => expect(mocks.decision).toHaveBeenCalledExactlyOnceWith(runtime.app.slug, row.id, row.version, decision, config.tableId))
    await waitFor(() => expect(ui.getByRole('button', { name: /^История/ }).getAttribute('aria-pressed')).toBe('true'))
    const refreshed = structuredClone(runtime)
    refreshed.tables[config.tableId]!.rows.find(item => item.id === row.id)!.data[config.statusFieldId] = decision === 'decline' ? config.approval!.declinedStatus : config.cancelStatus
    ui.rerender(<AppShell runtime={refreshed} viewer={viewer} browserHistory />)
    expect(ui.getByRole('button', { name: text => text.includes(title) })).toBeTruthy()
    expect(ui.queryByText('Активных заявок на ремонт пока нет')).toBeNull()
  })

  it('keeps a new delivery confirmation on its refreshed card, then removes it after cancellation and from history', async () => {
    const example = templateExample('dostavka'), config = example.app.customer!
    const { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const table = runtime.tables[config.tableId]!, createdId = 'row_delivery_confirmation_test'
    const created = { ...table.rows[0]!, id: createdId, version: 0, data: { ...table.rows[0]!.data, [config.statusFieldId]: config.initialStatus } }
    mocks.create.mockImplementation(async (_slug, _tableId, values) => {
      created.data = { ...created.data, ...values }
      return { ok: true, rowId: createdId }
    })
    window.history.replaceState(null, '', `/a/review?e=${config.formScreenId}`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    fireEvent.change(await ui.findByLabelText(/^Имя получателя/), { target: { value: 'Ирина' } })
    fireEvent.change(ui.getByLabelText(/^Телефон получателя/), { target: { value: '+7 900 000-00-00' } })
    fireEvent.change(ui.getByLabelText(exactField(example.field('deliveries', 'address').name)), { target: { value: 'Адрес новой доставки' } })
    fireEvent.change(ui.getByLabelText(exactField(example.field('deliveries', 'what').name)), { target: { value: 'Тестовая посылка' } })
    fireEvent.click(ui.getByRole('button', { name: 'Заказать доставку' }))
    await ui.findByText('Загружаем карточку…')
    const refreshed = { ...runtime, tables: { ...runtime.tables, [config.tableId]: { ...table, rows: [...table.rows, created] } },
      screens: { ...runtime.screens, [config.listScreenId]: { ...runtime.screens[config.listScreenId]!, rowIds: [...runtime.screens[config.listScreenId]!.rowIds, createdId] } } }
    ui.rerender(<AppShell runtime={refreshed} viewer={viewer} browserHistory />)
    await ui.findByRole('heading', { name: 'Адрес новой доставки' })
    expect(ui.getByText(/Оформлено. Ответственный сотрудник/)).toBeTruthy()
    ui.rerender(<AppShell runtime={structuredClone(refreshed)} viewer={viewer} browserHistory />)
    expect(ui.getByText(/Оформлено. Ответственный сотрудник/)).toBeTruthy()

    mocks.decision.mockResolvedValueOnce({ ok: false, error: 'Не удалось отменить доставку' })
    fireEvent.click(ui.getByRole('button', { name: 'Отменить доставку' }))
    fireEvent.click(ui.getByRole('button', { name: 'Да, отменить' }))
    await ui.findByText('Не удалось отменить доставку')
    expect(ui.getByText(/Оформлено. Ответственный сотрудник/)).toBeTruthy()
    await waitFor(() => expect(ui.getByRole('button', { name: 'Да, отменить' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(ui.getByRole('button', { name: 'Да, отменить' }))
    await waitFor(() => expect(ui.getByRole('button', { name: /^История/ }).getAttribute('aria-pressed')).toBe('true'))
    const cancelled = structuredClone(refreshed)
    cancelled.tables[config.tableId]!.rows.find(row => row.id === createdId)!.data[config.statusFieldId] = config.cancelStatus
    ui.rerender(<AppShell runtime={cancelled} viewer={viewer} browserHistory />)
    expect(ui.getByRole('button', { name: text => text.includes('Адрес новой доставки') })).toBeTruthy()
    expect(ui.queryByText(/Оформлено. Ответственный сотрудник/)).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: text => text.includes('Адрес новой доставки') }))
    await ui.findByRole('heading', { name: 'Адрес новой доставки' })
    expect(ui.queryByText(/Оформлено. Ответственный сотрудник/)).toBeNull()
  })

  it.each(['zakazy', 'service'])('%s: retains the guest email/code form through a runtime refresh, then resumes the selected purchase', async templateId => {
    const example = templateExample(templateId), config = example.app.customer!
    const guest = templateAppPreview(example, 'guest'), client = templateAppPreview(example, 'client', 'new@example.invalid', 'Анна')
    const product = guest.runtime.tables[config.catalog!.tableId]!.rows[0]!, productName = String(product.data[config.catalog!.titleFieldId])
    const ui = render(<AppShell runtime={guest.runtime} viewer={null} />)
    fireEvent.click(ui.getByRole('button', { name: text => text.includes(productName) }))
    if (config.cart) {
      fireEvent.click(ui.getByRole('button', { name: 'Добавить в заказ' }))
      fireEvent.click(ui.getByRole('button', { name: /Оформить заказ.*1/ }))
    } else fireEvent.click(ui.getByRole('button', { name: 'Отправить заявку на ремонт' }))
    fireEvent.change(await ui.findByRole('textbox', { name: 'Ваша почта' }), { target: { value: 'new@example.invalid' } })
    fireEvent.click(ui.getByRole('button', { name: 'Получить код' }))
    fireEvent.change(await ui.findByRole('textbox', { name: 'Код из письма' }), { target: { value: '123456' } })
    mocks.loading = true
    ui.rerender(<AppShell runtime={{ ...guest.runtime, app: { ...guest.runtime.app } }} viewer={null} />)
    expect((ui.getByRole('textbox', { name: 'Код из письма' }) as HTMLInputElement).value).toBe('123456')
    expect(ui.getByText(/new@example.invalid/)).toBeTruthy()
    expect(ui.queryByText('Загружаем раздел…')).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Подтвердить и продолжить' }))
    await waitFor(() => expect(mocks.consume).toHaveBeenCalledWith(example.app.slug, '123456'))
    mocks.loading = false
    ui.rerender(<AppShell runtime={client.runtime} viewer={client.viewer} />)
    await ui.findByLabelText(/^Ваше имя/)
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith(example.app.slug, 'new@example.invalid')
    if (config.cart) {
      expect(ui.getByLabelText(`Количество: ${productName}`)).toHaveProperty('value', '1')
      const stored = JSON.parse(sessionStorage.getItem(`tableapp:cart:${example.app.id}`)!)
      expect(stored.items).toEqual([{ id: product.id, qty: 1 }])
    } else {
      const selection = client.runtime.tables[config.tableId]!.fields.find(field => field.id === config.catalog!.selectionFieldId)!
      expect(ui.getByLabelText(exactField(selection.name))).toHaveProperty('value', product.id)
    }
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('restores a staff edit after navigation and reload, retains it after a network error, and clears it after a confirmed save', async () => {
    const example = templateExample('zakazy'), config = example.app.customer!
    const { runtime, viewer } = templateAppPreview(example, 'manager', 'manager@example.invalid', 'Оператор')
    const edit = runtime.app.screens.find(screen => screen.type === 'form' && screen.mode === 'edit' && screen.tableId === config.tableId)!
    const row = runtime.tables[config.tableId]!.rows[0]!
    window.history.replaceState(null, '', `/a/review?e=${edit.id}&r=${row.id}`)
    let ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    fireEvent.change(await ui.findByLabelText(/^Имя клиента/), { target: { value: 'Ирина Аудит' } })
    const key = `tableapp:form-drafts:${runtime.app.workspaceId}:${runtime.app.id}:${viewer!.id}`, draftId = `${edit.id}:${row.id}`
    expect(JSON.parse(sessionStorage.getItem(key)!).drafts[draftId].form.values[config.profile!.nameFieldId]).toBe('Ирина Аудит')
    fireEvent.click(ui.getByRole('button', { name: 'Назад' }))
    const listButton = ui.getAllByRole('button', { name: 'Заказы' })[0]!
    fireEvent.click(listButton)
    const title = String(row.data[runtime.tables[config.tableId]!.primaryFieldId!])
    fireEvent.click(ui.getByRole('button', { name: text => text.includes(title) }))
    fireEvent.click(ui.getByRole('button', { name: 'Изменить' }))
    expect(await ui.findByLabelText(/^Имя клиента/)).toHaveProperty('value', 'Ирина Аудит')
    ui.unmount()
    ui = render(<AppShell runtime={{ ...runtime }} viewer={viewer} browserHistory />)
    expect(await ui.findByLabelText(/^Имя клиента/)).toHaveProperty('value', 'Ирина Аудит')
    mocks.update.mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить' }))
    await ui.findByText(/Не удалось получить ответ сервера/)
    expect(ui.getByLabelText(/^Имя клиента/)).toHaveProperty('value', 'Ирина Аудит')
    expect(JSON.parse(sessionStorage.getItem(key)!).drafts[draftId].form.baseVersion).toBe(row.version)
    await waitFor(() => expect(ui.getByRole('button', { name: 'Сохранить' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(ui.queryByLabelText(/^Имя клиента/)).toBeNull())
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.update.mock.calls[1]!.slice(0, 3)).toEqual([runtime.app.slug, config.tableId, row.id])
    expect(mocks.update.mock.calls[1]![4]).toBe(row.version)
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('waits for the created record to refresh and returns to its list with header and browser Back without reopening the submitted form', async () => {
    const example = templateExample('service'), config = example.app.customer!
    const { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const product = runtime.tables[config.catalog!.tableId]!.rows[0]!, productName = String(product.data[config.catalog!.titleFieldId])
    const catalog = runtime.app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') && runtime.views[screen.source.viewId]?.tableId === config.catalog!.tableId)!
    const createdId = 'row_created_by_audit_test', table = runtime.tables[config.tableId]!
    let refreshed = runtime
    mocks.create.mockImplementation(async (_slug, _tableId, values) => {
      const newRow = { ...table.rows[0]!, id: createdId, version: 0, data: { ...table.rows[0]!.data, ...values, [config.statusFieldId]: config.initialStatus, [config.emailFieldId]: viewer!.email } }
      refreshed = { ...runtime, tables: { ...runtime.tables, [config.tableId]: { ...table, rows: [...table.rows, newRow] } } }
      return { ok: true, rowId: createdId }
    })
    window.history.replaceState(null, '', `/a/review?e=${catalog.id}`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    fireEvent.click(await ui.findByRole('button', { name: text => text.includes(productName) }))
    fireEvent.click(ui.getByRole('button', { name: 'Отправить заявку на ремонт' }))
    fireEvent.change(ui.getByLabelText(/^Ваше имя/), { target: { value: 'Ирина' } })
    fireEvent.change(ui.getByLabelText(/^Ваш телефон/), { target: { value: '+7 900 000-00-00' } })
    fireEvent.change(ui.getByLabelText(exactField(example.field('repairs', 'device').name)), { target: { value: 'Ноутбук аудита' } })
    fireEvent.change(ui.getByLabelText(/^Неисправность со слов клиента/), { target: { value: 'Не включается' } })
    fireEvent.click(ui.getByRole('button', { name: 'Отправить заявку на ремонт' }))
    await ui.findByText('Загружаем карточку…')
    expect(ui.queryByText('Запись недоступна')).toBeNull()
    expect(new URLSearchParams(window.location.search).get('r')).toBe(createdId)
    ui.rerender(<AppShell runtime={refreshed} viewer={viewer} browserHistory />)
    await ui.findByRole('heading', { name: 'Ноутбук аудита' })
    expect(new URLSearchParams(window.location.search).get('r')).toBe(createdId)
    expect(new URLSearchParams(window.location.search).get('e')).toBe(config.detailScreenId)
    expect(ui.getByText(/Оформлено. Ответственный сотрудник/)).toBeTruthy()
    expect(mocks.create).toHaveBeenCalledOnce()

    const expectList = async () => {
      await waitFor(() => {
        const search = new URLSearchParams(window.location.search)
        expect(search.get('e') ?? runtime.app.homeScreenId).toBe(config.listScreenId)
        expect(search.get('r')).toBeNull()
      })
      expect(ui.queryByLabelText(/^Неисправность со слов клиента/)).toBeNull()
      expect(ui.queryByRole('heading', { name: 'Ноутбук аудита' })).toBeNull()
      expect(ui.queryByText(/Оформлено. Ответственный сотрудник/)).toBeNull()
    }
    fireEvent.click(ui.getByRole('button', { name: 'Назад' }))
    await expectList()
    await act(async () => { window.history.forward() })
    await ui.findByRole('heading', { name: 'Ноутбук аудита' })
    expect(ui.queryByText(/Оформлено. Ответственный сотрудник/)).toBeNull()
    await act(async () => { window.history.back() })
    await expectList()
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it.each(['fresh snapshot', 'timeout and retry'])('ends creation loading with %s instead of waiting forever for an unavailable record', async path => {
    const example = templateExample('service'), config = example.app.customer!
    const { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const product = runtime.tables[config.catalog!.tableId]!.rows[0]!, productName = String(product.data[config.catalog!.titleFieldId])
    const catalog = runtime.app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') && runtime.views[screen.source.viewId]?.tableId === config.catalog!.tableId)!
    mocks.create.mockResolvedValue({ ok: true, rowId: 'row_created_then_unavailable' })
    window.history.replaceState(null, '', `/a/review?e=${catalog.id}`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    fireEvent.click(await ui.findByRole('button', { name: text => text.includes(productName) }))
    fireEvent.click(ui.getByRole('button', { name: 'Отправить заявку на ремонт' }))
    fireEvent.change(ui.getByLabelText(/^Ваше имя/), { target: { value: 'Ирина' } })
    fireEvent.change(ui.getByLabelText(/^Ваш телефон/), { target: { value: '+7 900 000-00-00' } })
    fireEvent.change(ui.getByLabelText(exactField(example.field('repairs', 'device').name)), { target: { value: 'Ноутбук аудита' } })
    fireEvent.change(ui.getByLabelText(/^Неисправность со слов клиента/), { target: { value: 'Не включается' } })
    if (path === 'timeout and retry') vi.useFakeTimers()
    try {
      await act(async () => { fireEvent.click(ui.getByRole('button', { name: 'Отправить заявку на ремонт' })) })
      expect(ui.getByText('Загружаем карточку…')).toBeTruthy()
      expect(ui.queryByText('Запись недоступна')).toBeNull()
      if (path === 'timeout and retry') {
        await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
        expect(ui.getByRole('alert').textContent).toBe('Запись оформлена, но карточку пока не удалось загрузить.')
        expect(ui.queryByText('Загружаем карточку…')).toBeNull()
        fireEvent.click(ui.getByRole('button', { name: 'Обновить карточку' }))
        expect(mocks.refresh).toHaveBeenCalledTimes(2)
        expect(ui.getByText('Загружаем карточку…')).toBeTruthy()
      }
      ui.rerender(<AppShell runtime={structuredClone(runtime)} viewer={viewer} browserHistory />)
      expect(ui.getByText('Запись недоступна')).toBeTruthy()
      expect(ui.queryByText('Загружаем карточку…')).toBeNull()
      expect(mocks.create).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })

  it('reuses the original non-cart submission key after an unknown response, an edit and a full remount', async () => {
    const example = templateExample('service'), config = example.app.customer!
    const { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const product = runtime.tables[config.catalog!.tableId]!.rows[0]!, productName = String(product.data[config.catalog!.titleFieldId])
    const catalog = runtime.app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') && runtime.views[screen.source.viewId]?.tableId === config.catalog!.tableId)!
    const committed = new Map<string, string>()
    mocks.create.mockImplementation(async (_slug, _tableId, values: Record<string, unknown>) => {
      const token = String(values[config.submissionFieldId!])
      if (!committed.has(token)) {
        committed.set(token, `row_committed_${committed.size}`)
        throw new Error('The server committed the record but its response was lost')
      }
      return { ok: true, rowId: committed.get(token) }
    })
    window.history.replaceState(null, '', `/a/review?e=${catalog.id}`)
    let ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    fireEvent.click(await ui.findByRole('button', { name: text => text.includes(productName) }))
    fireEvent.click(ui.getByRole('button', { name: 'Отправить заявку на ремонт' }))
    fireEvent.change(ui.getByLabelText(/^Ваше имя/), { target: { value: 'Ирина' } })
    fireEvent.change(ui.getByLabelText(/^Ваш телефон/), { target: { value: '+7 900 000-00-00' } })
    const deviceLabel = exactField(example.field('repairs', 'device').name)
    fireEvent.change(ui.getByLabelText(deviceLabel), { target: { value: 'Ноутбук' } })
    fireEvent.change(ui.getByLabelText(/^Неисправность со слов клиента/), { target: { value: 'Не включается' } })
    fireEvent.click(ui.getByRole('button', { name: 'Отправить заявку на ремонт' }))
    await ui.findByText(/Не удалось получить ответ сервера/)
    const firstToken = mocks.create.mock.calls[0]![2][config.submissionFieldId!]
    expect(firstToken).toEqual(expect.any(String))
    fireEvent.change(ui.getByLabelText(deviceLabel), { target: { value: 'Ноутбук с уточнением' } })
    const key = `tableapp:form-drafts:${runtime.app.workspaceId}:${runtime.app.id}:${viewer!.id}`
    const draft = JSON.parse(sessionStorage.getItem(key)!).drafts[`${config.formScreenId}:new`].form
    expect(draft.values[config.submissionFieldId!]).toBe(firstToken)
    ui.unmount()
    ui = render(<AppShell runtime={structuredClone(runtime)} viewer={viewer} browserHistory />)
    expect(await ui.findByLabelText(deviceLabel)).toHaveProperty('value', 'Ноутбук с уточнением')
    fireEvent.click(ui.getByRole('button', { name: 'Отправить заявку на ремонт' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2))
    expect(mocks.create.mock.calls[1]![2][config.submissionFieldId!]).toBe(firstToken)
    expect(committed.size).toBe(1)
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('r')).toBe(committed.get(String(firstToken))))
  })

  it('opens the mobile account menu and handles a failed logout without clearing the person’s drafts', async () => {
    const { runtime, viewer } = templateAppPreview(templateExample('zakazy'), 'client', 'irina@example.com', 'Ирина')
    const key = `tableapp:form-drafts:${runtime.app.workspaceId}:${runtime.app.id}:${viewer!.id}`
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), drafts: { form: { form: { values: { note: 'Черновик' } } } } }))
    mocks.signOut.mockRejectedValue(new Error('offline'))
    const ui = render(<AppShell runtime={runtime} viewer={viewer} />)
    fireEvent.click(ui.getByRole('button', { name: 'Мой аккаунт' }))
    const account = within(ui.getByRole('region', { name: 'Мой аккаунт' }))
    expect(account.getByText('Ирина')).toBeTruthy()
    expect(account.getByText('irina@example.com')).toBeTruthy()
    fireEvent.click(account.getByRole('button', { name: 'Выйти' }))
    await ui.findByText('Не удалось выйти. Проверьте соединение и попробуйте ещё раз.')
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(key)).not.toBeNull()
    expect(ui.getByRole('region', { name: 'Мой аккаунт' })).toBeTruthy()
  })

  it('preserves the original appointment version across reload and only adopts a newer version after explicitly discarding the draft', async () => {
    const example = templateExample('salon'), config = example.app.booking!
    const { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const row = runtime.tables[config.tables.visits]!.rows.find(row => row.data[config.visit.status] === config.statuses.booked)!
    const masterId = (row.data[config.visit.master] as string[])[0]!
    const firstSlot = { start: '2099-10-10T09:00:00.000Z', time: '12:00', masterId, masterName: 'Оля' }
    const latestSlot = { start: '2099-10-11T10:00:00.000Z', time: '13:00', masterId, masterName: 'Оля' }
    row.version = 1; row.data[config.visit.start] = '2099-10-10T08:00:00.000Z'
    mocks.availability.mockImplementation(async (_slug, _service, day) => ({ ok: true,
      slots: day === '2099-10-11' ? [latestSlot] : [firstSlot], masters: [{ id: masterId, name: 'Оля' }], timeZone: 'Europe/Moscow' }))
    mocks.update.mockResolvedValueOnce({ ok: false, error: 'Запись изменена другим сотрудником. Обновите данные.' }).mockResolvedValue({ ok: true })
    window.history.replaceState(null, '', `/a/review?e=${config.rescheduleScreenId}&r=${row.id}`)
    let ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    fireEvent.click(await ui.findByRole('button', { name: '12:00 Оля' }))
    const key = `tableapp:form-drafts:${runtime.app.workspaceId}:${runtime.app.id}:${viewer!.id}`
    const draftId = `${config.rescheduleScreenId}:${row.id}`
    expect(JSON.parse(sessionStorage.getItem(key)!).drafts[draftId].booking.baseVersion).toBe(1)
    ui.unmount()

    const updated = structuredClone(runtime)
    const latest = updated.tables[config.tables.visits]!.rows.find(item => item.id === row.id)!
    latest.version = 2; latest.data[config.visit.start] = latestSlot.start
    ui = render(<AppShell runtime={updated} viewer={viewer} browserHistory />)
    await waitFor(() => expect(ui.getByRole('button', { name: '12:00 Оля' }).getAttribute('aria-pressed')).toBe('true'))
    expect(ui.getByRole('button', { name: 'Загрузить актуальные данные' })).toBeTruthy()
    fireEvent.submit(ui.getByRole('button', { name: 'Сохранить новое время' }).closest('form')!)
    await ui.findByText('Запись изменена другим сотрудником. Обновите данные.')
    expect(mocks.update.mock.calls[0]!.slice(0, 3)).toEqual([runtime.app.slug, config.tables.visits, row.id])
    expect(mocks.update.mock.calls[0]![3][config.visit.start]).toBe(firstSlot.start)
    expect(mocks.update.mock.calls[0]![4]).toBe(1)

    fireEvent.click(ui.getByRole('button', { name: 'Загрузить актуальные данные' }))
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(key)!).drafts[draftId].booking.baseVersion).toBe(2))
    await waitFor(() => expect(ui.getByLabelText('Дата')).toHaveProperty('value', '2099-10-11'))
    fireEvent.click(await ui.findByRole('button', { name: '13:00 Оля' }))
    expect(JSON.parse(sessionStorage.getItem(key)!).drafts[draftId].booking.baseVersion).toBe(2)
    expect(ui.queryByRole('button', { name: 'Загрузить актуальные данные' })).toBeNull()
    fireEvent.submit(ui.getByRole('button', { name: 'Сохранить новое время' }).closest('form')!)
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2))
    expect(mocks.update.mock.calls[1]![3][config.visit.start]).toBe(latestSlot.start)
    expect(mocks.update.mock.calls[1]![4]).toBe(2)
  })
})
