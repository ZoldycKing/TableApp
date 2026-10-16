// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeApp } from '@/lib/app-runtime'
import { templateExample } from '@/lib/templates/presentation'
import { templateAppPreview } from '@/lib/templates/app-preview'
import { AppShell } from './app-shell'

const mocks = vi.hoisted(() => ({
  request: vi.fn(), consume: vi.fn(), signOut: vi.fn(), create: vi.fn(), update: vi.fn(), refresh: vi.fn(),
  availability: vi.fn(),
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
vi.mock('@/app/customer-actions', () => ({ customerDecisionAction: vi.fn() }))
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
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})
afterEach(() => { cleanup(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

const exactField = (name: string) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`)

describe('browser audit runtime integration regressions', () => {
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

  it('opens the created record and returns to its list with header and browser Back without reopening the submitted form', async () => {
    const example = templateExample('service'), config = example.app.customer!
    const { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const product = runtime.tables[config.catalog!.tableId]!.rows[0]!, productName = String(product.data[config.catalog!.titleFieldId])
    const catalog = runtime.app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') && runtime.views[screen.source.viewId]?.tableId === config.catalog!.tableId)!
    const createdId = 'row_created_by_audit_test', table = runtime.tables[config.tableId]!
    mocks.create.mockImplementation(async (_slug, _tableId, values) => {
      const newRow = { ...table.rows[0]!, id: createdId, version: 0, data: { ...table.rows[0]!.data, ...values, [config.statusFieldId]: config.initialStatus, [config.emailFieldId]: viewer!.email } }
      mocks.runtime = { ...runtime, tables: { ...runtime.tables, [config.tableId]: { ...table, rows: [...table.rows, newRow] } } }
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
    }
    fireEvent.click(ui.getByRole('button', { name: 'Назад' }))
    await expectList()
    await act(async () => { window.history.forward() })
    await ui.findByRole('heading', { name: 'Ноутбук аудита' })
    await act(async () => { window.history.back() })
    await expectList()
    expect(mocks.create).toHaveBeenCalledOnce()
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
