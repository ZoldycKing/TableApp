// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inventoryFixture } from '@/lib/templates/inventory-fixture.test-utils'
import { AppShell } from './app-shell'
import { navFromHistory } from './nav-history'
import { appCreateRowAction, appUpdateRowAction } from '@/app/runtime-actions'
import { templateExample } from '@/lib/templates/presentation'
import { templateAppPreview } from '@/lib/templates/app-preview'
import { consumeAppCodeAction, requestAppLoginAction } from '@/app/auth-actions'
import { TemplatePreviewShell } from '@/components/marketing/template-preview-shell'
import { modularPilotExample } from '@/lib/templates/modular-pilot-example'
import { composeModules } from '@/lib/module-composition'
import { customerCartWorkflow, customerWorkflows, normalizeView, type Field } from '@tableapp/schema'
import { connectSalesInventory } from '@/lib/sales-inventory-connection'
import { connectProductionInventory } from '@/lib/production-inventory-connection'
import { projectRuntime } from '@/lib/runtime-project'
import { visibleScreensFor, visitorFor } from '@/lib/app-roles'
import { beginGeneralQuestionAction } from '@/app/question-auth-actions'
import { sendConversationAction } from '@/app/conversation-actions'
import { previewConsumptionAction, saveProductionAction } from '@/app/production-actions'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/auth-actions', () => ({ signOutAppAction: vi.fn(), consumeAppCodeAction: vi.fn(), requestAppLoginAction: vi.fn() }))
vi.mock('@/app/question-auth-actions', () => ({ beginGeneralQuestionAction: vi.fn().mockResolvedValue({ ok: true, authenticated: false }) }))
vi.mock('@/app/production-actions', () => ({ saveMovementAction: vi.fn(), saveProductionAction: vi.fn(), previewConsumptionAction: vi.fn() }))
vi.mock('@/app/runtime-actions', () => ({ appCreateRowAction: vi.fn(), appDeleteRowAction: vi.fn(), appUpdateRowAction: vi.fn() }))
vi.mock('@/app/booking-actions', () => ({ bookingAvailabilityAction: vi.fn(), cancelBookingAction: vi.fn(), setupBookingMasterAction: vi.fn(), setBookingDayOffAction: vi.fn() }))
vi.mock('@/app/customer-actions', () => ({ customerDecisionAction: vi.fn() }))
vi.mock('./conversation-panel', () => ({ ConversationPanel: () => null }))
vi.mock('@/app/conversation-actions', () => ({ sendConversationAction: vi.fn(), listConversationInboxAction: vi.fn().mockResolvedValue({ ok: true, value: { items: [], next: null } }) }))
vi.mock('./order-delivery-panel', () => ({ OrderDeliveryPanel: () => <p>Связь заказа с доставкой</p> }))
vi.mock('./order-stock-panel', () => ({ OrderStockPanel: () => null, InventoryBalancePanel: () => null }))
vi.mock('./conversation-inbox', () => ({ MESSAGES_SCREEN: '__tableapp_messages', parseConversationTarget: (value: string | null) => value ? JSON.parse(value) : null, ConversationInbox: () => <p>Список переписок бизнеса</p> }))
const inventoryMocks = vi.hoisted(() => ({ receive: vi.fn(), operation: vi.fn() }))
vi.mock('@/app/inventory-actions', () => ({ receiveStockAction: inventoryMocks.receive, saveStockOperationAction: inventoryMocks.operation }))
vi.mock('@/lib/use-live-app', () => ({ useLiveApp: vi.fn() }))
vi.mock('@/components/motion/enter-motion', () => ({ useEnterMotion: () => ({ current: null }) }))
vi.mock('./intake-verify', () => ({ IntakeVerify: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>Подтверждение тестовой почты</button> }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.sessionStorage.clear(); window.history.replaceState(null, '', '/') })

async function demoLogin(ui: ReturnType<typeof render>) {
  expect(ui.queryByLabelText(/^Ваше имя/)).toBeNull()
  fireEvent.change(ui.getByLabelText('Ваша почта'), { target: { value: 'irina@example.com' } })
  fireEvent.click(ui.getByRole('button', { name: 'Получить код' }))
  fireEvent.change(await ui.findByLabelText('Код из письма'), { target: { value: '123456' } })
  fireEvent.click(ui.getByRole('button', { name: 'Подтвердить и продолжить' }))
}

describe('first visit interactive demo', () => {
  it('previews fictional production consumption and shortages without calling server actions', () => {
    const example = templateExample('proizvodstvo'), config = example.app.production!
    const initial = templateAppPreview(example, 'foreman')
    const ui = render(<TemplatePreviewShell initial={initial} signedIn={null} initialScreenId={config.formScreenId ?? undefined} />)
    const product = example.rows.find(row => row.tableId === example.table('products').id)!
    fireEvent.change(ui.getByLabelText('Продукт'), { target: { value: product.id } })
    fireEvent.change(ui.getByLabelText('Годных изделий'), { target: { value: '100' } })
    expect(ui.getByText('Расход материалов')).toBeTruthy()
    expect(ui.getByText('1,2 кг')).toBeTruthy()
    fireEvent.change(ui.getByLabelText('Годных изделий'), { target: { value: '2000000' } })
    expect(ui.getByText(/На складе не хватает/)).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Сохранить выпуск' }))
    expect(vi.mocked(previewConsumptionAction)).not.toHaveBeenCalled()
    expect(vi.mocked(saveProductionAction)).not.toHaveBeenCalled()
    expect(example.rows.filter(row => row.tableId === config.tables.production)).toHaveLength(2)
  })
  it('starts a newly generated template example with fresh screen IDs', () => {
    const first = templateExample('proizvodstvo')
    const initial = templateAppPreview(first, 'director')
    const ui = render(<TemplatePreviewShell initial={initial} signedIn={null} initialScreenId={first.app.production!.formScreenId ?? undefined} />)
    expect(ui.getByRole('heading', { name: 'Новый выпуск' })).toBeTruthy()
    const next = templateAppPreview(templateExample('proizvodstvo'), 'director')
    ui.rerender(<TemplatePreviewShell initial={next} signedIn={null} />)
    expect(ui.getByRole('heading', { name: 'Сводка' })).toBeTruthy()
    expect(ui.queryByText('Экран не найден')).toBeNull()
  })
})

function joinExamples(first: ReturnType<typeof templateExample>, second: ReturnType<typeof templateExample>) {
  const views = [...first.views, ...second.views]
  return { ...first, app: composeModules(first.app, second.app, new Map(views.map(view => [view.id, view]))), views,
    fields: [...first.fields, ...second.fields], rows: [...first.rows, ...second.rows], byTable: new Map([...first.byTable, ...second.byTable]),
    built: { ...first.built, tables: [...first.built.tables, ...second.built.tables], fields: [...first.built.fields, ...second.built.fields],
      views: [...first.built.views, ...second.built.views], rows: [...first.built.rows, ...second.built.rows] } }
}

function workshopPreview() {
  const sales = templateExample('zakazy'), email = 'navigation@example.invalid'
  sales.app.allowlist = [{ email, roleId: 'manager', company: '' }]
  const fields = new Map<string, Field>(sales.fields.map(field => [field.id, field])), views = new Map(sales.views.map(view => [view.id, view]))
  const stock = connectSalesInventory(sales.app, email, fields, views)
  for (const field of stock.fields) fields.set(field.id, field as Field)
  for (const view of stock.views) views.set(view.id, normalizeView(view))
  const production = connectProductionInventory(stock.app, email, fields, views)
  for (const field of production.fields) fields.set(field.id, field as Field)
  for (const view of production.views) views.set(view.id, normalizeView(view))
  const app = production.app, visitor = visitorFor(app, email), tables = [...sales.built.tables, ...stock.tables, ...production.tables]
  const byTable = new Map<string, Field[]>()
  for (const field of fields.values()) { const list = byTable.get(field.tableId) ?? []; list.push(field); byTable.set(field.tableId, list) }
  const now = new Date(), runtime = projectRuntime({ ...app, screens: visibleScreensFor(app, visitor) }, visitor, Object.fromEntries(views), tables, byTable,
    sales.rows.map(row => ({ ...row, version: 0, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null })), new Map(tables.map(table => [table.id, table.primaryFieldId])))
  return { runtime, viewer: { id: 'workshop-preview', email, name: 'Проверка' } }
}

describe('runtime navigation during live refresh', () => {
  it('keeps delivery with the order status and preserves the position for custom order layouts', async () => {
    const example = joinExamples(templateExample('zakazy'), templateExample('dostavka'))
    const { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com')
    const config = runtime.app.customer!, table = runtime.tables[config.tableId]!, row = table.rows[0]!
    window.history.replaceState(null, '', `/a/${runtime.app.slug}?e=${config.detailScreenId}&r=${row.id}`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    expect(within(await ui.findByRole('region', { name: 'Состояние заказа' })).getByText('Связь заказа с доставкой')).toBeTruthy()
    expect(ui.getAllByText('Связь заказа с доставкой')).toHaveLength(1)
    const custom = structuredClone(runtime)
    const detail = custom.app.screens.find(screen => screen.id === config.detailScreenId)!
    if (detail.type !== 'detail') throw new Error('Missing order detail')
    detail.components.push({ id: 'custom-copy', type: 'heading', source: { kind: 'literal', value: 'Условия заказа' }, size: 'm', position: 'z', roles: null, visibleWhen: null })
    ui.rerender(<AppShell runtime={custom} viewer={viewer} browserHistory />)
    expect(ui.queryByRole('region', { name: 'Состояние заказа' })).toBeNull()
    expect(ui.getByRole('heading', { name: 'Условия заказа' })).toBeTruthy()
    expect(ui.getAllByText('Связь заказа с доставкой')).toHaveLength(1)
  })
  it('keeps a saved shopping cart on catalogue screens and hides its checkout action on work screens', async () => {
    const { runtime, viewer } = workshopPreview(), app = runtime.app, sales = customerCartWorkflow(app)!
    const product = runtime.tables[sales.catalog!.tableId]!.rows[0]!
    sessionStorage.setItem(`tableapp:cart:${app.id}`, JSON.stringify({ requestId: crypto.randomUUID(), items: [{ id: product.id, qty: 1 }] }))
    const list = app.screens.find(screen => screen.type === 'list' && runtime.views[screen.source.viewId]?.tableId === sales.tableId)!
    const ui = render(<AppShell runtime={runtime} viewer={viewer} initialScreenId={list.id} />)
    await waitFor(() => expect(ui.getByRole('heading', { name: 'Заказы' })).toBeTruthy())
    expect(ui.queryByRole('button', { name: /Оформить заказ ·/ })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Каталог' }))
    await ui.findByRole('button', { name: 'Оформить заказ · 1 поз.' })
    expect(JSON.parse(sessionStorage.getItem(`tableapp:cart:${app.id}`)!).items).toEqual([{ id: product.id, qty: 1 }])
  })
  it.each([true, false])('shows a changed app name beside company identity with editing=%s', (editing) => {
    const example = templateExample('proizvodstvo')
    example.app.name = 'Цех Север'
    example.app.theme.accent = 'orange'
    const preview = templateAppPreview(example, example.app.roles[0]!.id)
    const runtime = { ...preview.runtime, business: { name: 'Мастерская Север', location: '', phone: '' } }
    const ui = render(<AppShell runtime={runtime} viewer={null} editing={editing} />)
    expect(ui.getByText('Мастерская Север · Цех Север')).toBeTruthy()
    expect(ui.container.querySelector('.text-orange-700')).toBeTruthy()
  })
  it('keeps a general question through email verification and sends it only after explicit confirmation, without creating a booking', async () => {
    const example = templateExample('salon')
    example.app.communications = { enabled: true }
    const guest = templateAppPreview(example, 'guest'), client = templateAppPreview(example, 'client', 'question@example.invalid', 'Анна')
    vi.mocked(beginGeneralQuestionAction).mockResolvedValue({ ok: true, authenticated: false })
    vi.mocked(requestAppLoginAction).mockResolvedValue({ ok: true, delivered: true, via: 'sent', hint: null })
    vi.mocked(consumeAppCodeAction).mockResolvedValue({ ok: true })
    vi.mocked(sendConversationAction).mockClear().mockResolvedValue({ ok: true, value: { id: 'msg_question' } })
    vi.mocked(appCreateRowAction).mockClear()
    const ui = render(<AppShell runtime={guest.runtime} viewer={null} />)
    fireEvent.click(ui.getByRole('button', { name: 'Задать вопрос' }))
    fireEvent.change(await ui.findByLabelText('Ваш вопрос'), { target: { value: 'Можно прийти со своим красителем?' } })
    fireEvent.click(ui.getByRole('button', { name: 'Задать вопрос' }))
    fireEvent.change(await ui.findByLabelText('Ваша почта'), { target: { value: 'question@example.invalid' } })
    fireEvent.click(ui.getByRole('button', { name: 'Получить код' }))
    fireEvent.change(await ui.findByLabelText('Код из письма'), { target: { value: '123456' } })
    fireEvent.click(ui.getByRole('button', { name: 'Подтвердить и написать' }))
    await waitFor(() => expect(consumeAppCodeAction).toHaveBeenCalled())
    expect(requestAppLoginAction).toHaveBeenCalledWith(example.app.slug, 'question@example.invalid', 'question')
    const key = `tableapp:question:${example.app.workspaceId}:${example.app.id}`
    const requestId = JSON.parse(sessionStorage.getItem(key)!).requestId
    expect(sendConversationAction).not.toHaveBeenCalled()
    ui.rerender(<AppShell runtime={client.runtime} viewer={client.viewer} />)
    await waitFor(() => expect(ui.getByLabelText('Ваш вопрос')).toHaveProperty('value', 'Можно прийти со своим красителем?'))
    expect(sendConversationAction).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: 'Отправить вопрос' }))
    await ui.findByText('Список переписок бизнеса')
    expect(sendConversationAction).toHaveBeenCalledExactlyOnceWith(example.app.slug, '__tableapp_general', 'self', { body: 'Можно прийти со своим красителем?', requestId }, false)
    expect(appCreateRowAction).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('restores an unfinished question after reloading the login step in the same business', async () => {
    const example = templateExample('salon'); example.app.communications = { enabled: true }
    const guest = templateAppPreview(example, 'guest')
    const ui = render(<AppShell runtime={guest.runtime} viewer={null} />)
    fireEvent.click(ui.getByRole('button', { name: 'Задать вопрос' }))
    fireEvent.change(await ui.findByLabelText('Ваш вопрос'), { target: { value: 'Есть ли парковка?' } })
    fireEvent.click(ui.getByRole('button', { name: 'Задать вопрос' }))
    await ui.findByLabelText('Ваша почта')
    ui.unmount()
    const restored = render(<AppShell runtime={guest.runtime} viewer={null} />)
    await restored.findByLabelText('Ваша почта')
    fireEvent.click(restored.getByRole('button', { name: 'Вернуться к вопросу' }))
    expect(restored.getByLabelText('Ваш вопрос')).toHaveProperty('value', 'Есть ли парковка?')
  })
  it('selects the stock section for a directly opened shared product card instead of the catalogue home', async () => {
    const { runtime, viewer } = workshopPreview(), app = runtime.app, module = app.modules!.find(module => module.kind === 'inventory')!
    const list = app.screens.find(screen => screen.type === 'list' && module.screenIds!.includes(screen.id) && runtime.views[screen.source.viewId]?.tableId === app.inventory!.tables.items)!
    if (list.type !== 'list') throw new Error('Missing stock list')
    const product = runtime.tables[app.inventory!.tables.items]!.rows[0]!
    window.history.replaceState(null, '', `/a/review?e=${list.onTapScreenId}&r=${product.id}`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} demo browserHistory />)
    const nav = within(ui.getByRole('navigation', { name: 'Разделы приложения' }))
    await waitFor(() => expect(nav.getByRole('button', { name: 'Остатки' }).getAttribute('aria-current')).toBe('page'))
    expect(nav.getByRole('button', { name: 'Каталог' }).getAttribute('aria-current')).toBeNull()
    expect(nav.getByRole('group', { name: 'Продажи' })).toBeTruthy()
    expect(nav.getByRole('group', { name: 'Склад' })).toBeTruthy()
    expect(nav.getByRole('group', { name: 'Производство' })).toBeTruthy()
  })
  it('moves a work create action into its list and preserves search when returning from the form', async () => {
    const { runtime, viewer } = workshopPreview(), app = runtime.app
    const list = app.screens.find(screen => screen.type === 'list' && !screen.access.public && runtime.views[screen.source.viewId]?.tableId === app.customer!.tableId)!
    const ui = render(<AppShell runtime={runtime} viewer={viewer} demo initialScreenId={list.id} />)
    expect(within(ui.getByRole('navigation', { name: 'Разделы приложения' })).queryByRole('button', { name: 'Новый заказ' })).toBeNull()
    fireEvent.change(ui.getByRole('textbox', { name: 'Поиск по списку' }), { target: { value: 'Стрижка' } })
    fireEvent.click(ui.getByRole('button', { name: 'Новый заказ' }))
    expect(ui.getByRole('heading', { name: 'Новый заказ' })).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Назад' }))
    expect(ui.getByRole('textbox', { name: 'Поиск по списку' })).toHaveProperty('value', 'Стрижка')
    expect(ui.getByRole('heading', { name: 'Заказы' })).toBeTruthy()
  })
  it('shows domain names for an existing sales app without changing its stored definition or records', async () => {
    const example = templateExample('zakazy'), config = example.app.customer!, { runtime, viewer } = templateAppPreview(example, 'manager', 'manager@example.invalid')
    const list = runtime.app.screens.find(screen => (screen.type === 'list' || screen.type === 'tiles') && runtime.views[screen.source.viewId]?.tableId === config.tableId)!
    const create = runtime.app.screens.find(screen => screen.type === 'form' && screen.mode === 'create' && screen.tableId === config.tableId)!
    list.name = 'Все обращения'; list.tab!.label = 'Все обращения'
    create.name = 'Добавить обращение'; create.tab!.label = 'Добавить'
    const stored = JSON.stringify(runtime.app), records = JSON.stringify(runtime.tables[config.tableId]!.rows)
    window.history.replaceState(null, '', `/a/review?e=${list.id}`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} demo browserHistory />)
    await ui.findByRole('heading', { name: 'Заказы' })
    expect(ui.queryByText('Все обращения')).toBeNull()
    fireEvent.click(ui.getAllByRole('button', { name: 'Новый заказ' })[0]!)
    await ui.findByRole('heading', { name: 'Новый заказ' })
    expect(ui.queryByText('Добавить обращение')).toBeNull()
    expect(JSON.stringify(runtime.app)).toBe(stored)
    expect(JSON.stringify(runtime.tables[config.tableId]!.rows)).toBe(records)
  })
  it('keeps the CRM contact directory selected when a client card is opened directly', async () => {
    const example = templateExample('crm'), crm = example.app.customer!.crm!, { runtime, viewer } = templateAppPreview(example, 'manager', 'manager@example.invalid')
    const client = runtime.tables[crm.clientsTableId]!.rows[0]!
    window.history.replaceState(null, '', `/a/review?e=${crm.detailScreenId}&r=${client.id}`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} demo browserHistory />)
    await waitFor(() => expect(ui.getAllByRole('button', { name: 'Клиенты' }).every(button => button.getAttribute('aria-current') === 'page')).toBe(true))
  })
  it('marks a directly opened CRM client list as current and retains it when opening a client card', async () => {
    const example = templateExample('crm'), crm = example.app.customer!.crm!, { runtime, viewer } = templateAppPreview(example, 'manager', 'manager@example.invalid')
    window.history.replaceState(null, '', `/a/review?e=${crm.listScreenId}`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} demo browserHistory />)
    await waitFor(() => expect(ui.getAllByRole('button', { name: 'Клиенты' }).every(button => button.getAttribute('aria-current') === 'page')).toBe(true))
    const client = runtime.tables[crm.clientsTableId]!.rows[0]!, name = String(client.data[crm.nameFieldId])
    fireEvent.click(ui.getByRole('button', { name: text => text.includes(name) }))
    expect(ui.getAllByRole('button', { name: 'Клиенты' }).every(button => button.getAttribute('aria-current') === 'page')).toBe(true)
  })
  it('marks messages as the current tab when opened through a deep link above the catalog home', async () => {
    const { runtime, viewer } = templateAppPreview(templateExample('salon'), 'client', 'irina@example.com', 'Ирина')
    window.history.replaceState(null, '', '/a/review?e=__tableapp_messages')
    const ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    await ui.findByText('Список переписок бизнеса')
    expect(ui.getAllByRole('button', { name: 'Чат' }).at(-1)!.getAttribute('aria-current')).toBe('page')
    for (const button of ui.queryAllByRole('button', { name: /^(Услуги|Каталог)$/ })) expect(button.getAttribute('aria-current')).toBeNull()
  })
  it('keeps a secondary sales cart through two repair submissions, rotating the repair key and selecting the right service', async () => {
    const repairExample = templateExample('service'), repair = repairExample.app.customer!, firstOption = repairExample.rows.find(row => row.tableId === repair.catalog!.tableId)!
    const selected = { ...firstOption, id: 'row_special_repair', position: 'zz', data: { ...firstOption.data, [repair.catalog!.titleFieldId]: 'Особая диагностика' } }
    repairExample.rows.push(selected)
    const example = joinExamples(joinExamples(templateExample('crm'), repairExample), templateExample('zakazy'))
    const { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина'), sales = customerCartWorkflow(example.app)!
    expect(runtime.relatedTitles[repair.catalog!.tableId]).toContainEqual({ id: selected.id, title: 'Особая диагностика' })
    vi.mocked(appCreateRowAction).mockClear().mockResolvedValue({ ok: true })
    const ui = render(<AppShell runtime={runtime} viewer={viewer} />)
    const product = runtime.tables[sales.catalog!.tableId]!.rows[0]!, name = String(product.data[sales.catalog!.titleFieldId])
    fireEvent.click(ui.getByRole('button', { name: text => text.includes(name) }))
    fireEvent.click(ui.getByRole('button', { name: 'Добавить в заказ' }))
    const savedCart = sessionStorage.getItem(`tableapp:cart:${example.app.id}`)!
    expect(JSON.parse(savedCart).items).toEqual([{ id: product.id, qty: 1 }])
    const primaryField = runtime.tables[repair.tableId]!.fields.find(field => field.id === runtime.tables[repair.tableId]!.primaryFieldId)!
    const selectionField = runtime.tables[repair.tableId]!.fields.find(field => field.id === repair.catalog!.selectionFieldId)!
    for (const label of ['Ноутбук', 'Телефон']) {
      fireEvent.click(ui.getAllByRole('button', { name: /^Каталог$/ })[0]!)
      fireEvent.click(ui.getByRole('button', { name: /Особая диагностика/ }))
      fireEvent.click(ui.getByRole('button', { name: /^Отправить заявку на ремонт$/ }))
      expect((ui.getByLabelText(new RegExp(`^${selectionField.name}`)) as HTMLSelectElement).value).toBe(selected.id)
      expect((ui.getByLabelText(new RegExp(`^${primaryField.name}`)) as HTMLInputElement).value).toBe('')
      fireEvent.change(ui.getByLabelText(new RegExp(`^${primaryField.name}`)), { target: { value: label } })
      fireEvent.change(ui.getByLabelText(/^Ваше имя/), { target: { value: 'Ирина' } })
      fireEvent.change(ui.getByLabelText(/^Ваш телефон/), { target: { value: '+7 900 000-00-00' } })
      fireEvent.change(ui.getByLabelText(/^Неисправность со слов клиента/), { target: { value: 'Не включается' } })
      fireEvent.click(ui.getByRole('button', { name: /^Отправить заявку на ремонт$/ }))
      await ui.findByRole('heading', { name: /^Мои ремонты$/ })
      expect(sessionStorage.getItem(`tableapp:cart:${example.app.id}`)).toBe(savedCart)
    }
    const calls = vi.mocked(appCreateRowAction).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls.every(call => call[1] === repair.tableId)).toBe(true)
    expect(calls[0]![2][repair.submissionFieldId!]).not.toBe(calls[1]![2][repair.submissionFieldId!])
    expect(ui.queryByRole('button', { name: /Оформить заказ.*1/ })).toBeNull()
    fireEvent.click(ui.getAllByRole('button', { name: 'Каталог' })[0]!)
    fireEvent.click(ui.getByRole('button', { name: /Оформить заказ.*1/ }))
    expect(ui.getByLabelText(`Количество: ${name}`)).toBeTruthy()
    expect(customerWorkflows(example.app).find(config => config.formScreenId === sales.formScreenId)!.tableId).toBe(sales.tableId)
  })
  it('shows both catalogs in one guest screen and opens the correct workflow after signing in', async () => {
    const example = modularPilotExample(), config = example.app.booking!
    const guest = templateAppPreview(example, 'guest'), client = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const ui = render(<TemplatePreviewShell initial={guest} signedIn={client} />)
    expect(ui.getByRole('heading', { name: 'Услуги' })).toBeTruthy()
    expect(ui.getByRole('heading', { name: 'Товары' })).toBeTruthy()
    expect(ui.queryByRole('button', { name: 'Записи' })).toBeNull()
    const service = example.rows.find(row => row.tableId === config.tables.services && row.data[config.service.active] === true)!
    const title = String(service.data[config.service.name])
    fireEvent.change(ui.getByPlaceholderText('Найти услугу или товар'), { target: { value: title } })
    expect(ui.getByRole('button', { name: new RegExp(title) })).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: new RegExp(title) }))
    fireEvent.click(ui.getByRole('button', { name: 'Записаться' }))
    await demoLogin(ui)
    expect((await ui.findByLabelText(/^Услуга/)) as HTMLSelectElement).toHaveProperty('value', service.id)
    expect(ui.getAllByRole('button', { name: 'Записи' }).length).toBeGreaterThan(0)
    expect(ui.getAllByRole('button', { name: 'Мои заказы' }).length).toBeGreaterThan(0)
    fireEvent.click(ui.getAllByRole('button', { name: 'Записи' })[0]!)
    expect(ui.getByRole('button', { name: /^Предстоящие/ })).toHaveProperty('ariaPressed', 'true')
    fireEvent.click(ui.getByRole('button', { name: /^История/ }))
    expect(ui.getByText('Завершено')).toBeTruthy()
    expect(ui.getByText('Отменил')).toBeTruthy()
    fireEvent.click(ui.getAllByRole('button', { name: 'Каталог' })[0]!)
    expect(ui.getByPlaceholderText('Найти услугу или товар')).toHaveProperty('value', title)
    fireEvent.change(ui.getByPlaceholderText('Найти услугу или товар'), { target: { value: '' } })
    const sales = example.app.customer!, productTable = example.built.tables.find(table => table.id === sales.catalog!.tableId)!
    const product = client.runtime.tables[productTable.id]!.rows[0]!
    fireEvent.click(ui.getByRole('button', { name: new RegExp(String(product.data[productTable.primaryFieldId!])) }))
    fireEvent.click(ui.getByRole('button', { name: 'Добавить в заказ' }))
    fireEvent.click(ui.getByRole('button', { name: /Оформить заказ.*1/ }))
    expect(ui.getByLabelText(/^Ваше имя/)).toBeTruthy()
    expect(ui.queryByLabelText('Код из письма')).toBeNull()
    expect(ui.queryByLabelText(/^Услуга/)).toBeNull()
  })
  it('keeps the business visible and opens a support form from the customer’s own order', () => {
    const example = templateExample('portal'), { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const ui = render(<AppShell runtime={runtime} viewer={viewer} demo />)
    expect(ui.getAllByText('Сервис «Мастерская»').length).toBeGreaterThan(0)
    fireEvent.click(ui.getByRole('button', { name: /Ремонт ноутбука Lenovo/ }))
    fireEvent.click(ui.getByRole('button', { name: 'Задать вопрос по заказу' }))
    const support = example.app.customerSections![0]!, parent = support.parent!
    const own = runtime.tables[parent.tableId]!.rows.find(row => String(row.data[example.field('orders', 'title').id]).includes('Lenovo'))!
    expect((ui.getByLabelText(/^Заказ/) as HTMLSelectElement).value).toBe(own.id)
    expect(ui.getByLabelText(/^Тема/)).toBeTruthy()
    expect(ui.queryByLabelText('Ключ оформления')).toBeNull()
    expect(ui.queryByLabelText('Статус')).toBeNull()
  })
  it('opens personal fields only after the code, and creates the first request only on final submission', async () => {
    vi.mocked(appCreateRowAction).mockClear().mockResolvedValue({ ok: true })
    vi.mocked(requestAppLoginAction).mockResolvedValue({ ok: true, delivered: true, hint: null, via: 'sent' })
    vi.mocked(consumeAppCodeAction).mockResolvedValueOnce({ ok: false, error: 'Неверный код' }).mockResolvedValueOnce({ ok: true })
    const example = templateExample('portal'), guest = templateAppPreview(example, 'guest')
    const ui = render(<AppShell runtime={guest.runtime} viewer={null} />)
    fireEvent.click(ui.getByRole('button', { name: /Диагностика техники/ }))
    fireEvent.click(ui.getByRole('button', { name: 'Оставить заявку' }))
    expect(ui.queryByLabelText(/^Ваше имя/)).toBeNull()
    fireEvent.change(ui.getByLabelText('Ваша почта'), { target: { value: 'irina@example.com' } })
    fireEvent.click(ui.getByRole('button', { name: 'Получить код' }))
    fireEvent.change(await ui.findByLabelText('Код из письма'), { target: { value: '000000' } })
    fireEvent.click(ui.getByRole('button', { name: 'Подтвердить и продолжить' }))
    expect(await ui.findByText('Неверный код')).toBeTruthy()
    expect(ui.queryByLabelText(/^Ваше имя/)).toBeNull()
    fireEvent.change(ui.getByLabelText('Код из письма'), { target: { value: '123456' } })
    fireEvent.click(ui.getByRole('button', { name: 'Подтвердить и продолжить' }))
    await ui.findByText(/Почта подтверждена/)
    expect(appCreateRowAction).not.toHaveBeenCalled()
    const customer = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    ui.rerender(<AppShell runtime={customer.runtime} viewer={customer.viewer} />)
    fireEvent.change(await ui.findByLabelText(/^Ваше имя/), { target: { value: 'Ирина' } })
    fireEvent.change(ui.getByLabelText(/^Ваш телефон/), { target: { value: '+7 900 000-00-00' } })
    expect((ui.getByLabelText(/^Что нужно сделать/) as HTMLInputElement).value).toBe('Диагностика техники')
    expect(appCreateRowAction).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: 'Отправить заявку' }))
    await waitFor(() => expect(appCreateRowAction).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(ui.getByRole('heading', { name: 'Мои заказы' })).toBeTruthy())
    expect(ui.getByRole('button', { name: 'История 1' })).toBeTruthy()
    expect(ui.getByRole('status').textContent).toContain('оплаты')
  })
  it('retains the guest cart and checkout selection after login and a page reload, with no order before submit', async () => {
    const example = templateExample('katalog'), guest = templateAppPreview(example, 'guest'), config = example.app.customer!
    vi.mocked(appCreateRowAction).mockClear().mockResolvedValue({ ok: true })
    vi.mocked(requestAppLoginAction).mockResolvedValue({ ok: true, delivered: true, hint: null, via: 'sent' })
    vi.mocked(consumeAppCodeAction).mockResolvedValue({ ok: true })
    const ui = render(<AppShell runtime={guest.runtime} viewer={null} />)
    const product = guest.runtime.tables[config.catalog!.tableId]!.rows[0]!, name = String(product.data[config.catalog!.titleFieldId])
    fireEvent.click(ui.getByRole('button', { name: text => text.includes(name) }))
    fireEvent.click(ui.getByRole('button', { name: 'Добавить в заказ' }))
    fireEvent.click(ui.getByRole('button', { name: /Оформить заказ.*1/ }))
    expect(ui.queryByRole('heading', { name: 'Ваш заказ' })).toBeNull()
    expect(ui.queryByLabelText(/^Ваше имя/)).toBeNull()
    fireEvent.change(ui.getByLabelText('Ваша почта'), { target: { value: 'irina@example.com' } })
    fireEvent.click(ui.getByRole('button', { name: 'Получить код' }))
    fireEvent.change(await ui.findByLabelText('Код из письма'), { target: { value: '123456' } })
    fireEvent.click(ui.getByRole('button', { name: 'Подтвердить и продолжить' }))
    await ui.findByText(/Почта подтверждена/)
    expect(appCreateRowAction).not.toHaveBeenCalled()
    const savedIntent = sessionStorage.getItem(`tableapp:checkout:${example.app.id}`)!
    expect(JSON.parse(savedIntent)).toEqual({ screenId: config.formScreenId, rowId: product.id })
    expect(savedIntent).not.toContain('irina@example.com')
    ui.unmount()
    const customer = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const resumed = render(<AppShell runtime={customer.runtime} viewer={customer.viewer} />)
    expect(await resumed.findByLabelText(/^Ваше имя/)).toBeTruthy()
    expect((resumed.getByLabelText(`Количество: ${name}`) as HTMLInputElement).value).toBe('1')
    expect(sessionStorage.getItem(`tableapp:checkout:${example.app.id}`)).toBeNull()
    expect(appCreateRowAction).not.toHaveBeenCalled()
    fireEvent.change(resumed.getByLabelText(/^Ваше имя/), { target: { value: 'Ирина' } })
    fireEvent.change(resumed.getByLabelText(/^Ваш телефон/), { target: { value: '+7 900 000-00-00' } })
    fireEvent.click(resumed.getByRole('button', { name: 'Оформить заказ' }))
    await waitFor(() => expect(appCreateRowAction).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(sessionStorage.getItem(`tableapp:cart:${example.app.id}`)).toBeNull())
  })
  it('returns to the selected service when checkout login is cancelled, without exposing a personal form', () => {
    const example = templateExample('service'), guest = templateAppPreview(example, 'guest')
    const ui = render(<AppShell runtime={guest.runtime} viewer={null} />)
    fireEvent.click(ui.getByRole('button', { name: /Диагностика и ремонт/ }))
    fireEvent.click(ui.getByRole('button', { name: 'Отправить заявку на ремонт' }))
    fireEvent.click(ui.getByRole('button', { name: 'Вернуться к выбору' }))
    expect(ui.getByRole('heading', { name: 'Диагностика и ремонт' })).toBeTruthy()
    expect(ui.queryByLabelText(/^Ваше имя/)).toBeNull()
    expect(sessionStorage.getItem(`tableapp:checkout:${example.app.id}`)).toBeNull()
  })
  it('submits the selected products and quantities while hiding technical cart fields', async () => {
    const example = templateExample('zakazy'), { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина'), config = example.app.customer!
    vi.mocked(appCreateRowAction).mockResolvedValue({ ok: true })
    const ui = render(<AppShell runtime={runtime} viewer={viewer} />)
    fireEvent.click(ui.getAllByRole('button', { name: 'Каталог' })[0]!)
    const product = runtime.tables[config.catalog!.tableId]!.rows[0]!, name = String(product.data[config.catalog!.titleFieldId])
    fireEvent.click(ui.getByRole('button', { name: text => text.includes(name) }))
    fireEvent.click(ui.getByRole('button', { name: 'Добавить в заказ' }))
    fireEvent.click(ui.getByRole('button', { name: /Оформить заказ.*1/ }))
    fireEvent.change(ui.getByLabelText(`Количество: ${name}`), { target: { value: '3' } })
    fireEvent.change(ui.getByLabelText(/^Ваше имя/), { target: { value: 'Ирина' } })
    fireEvent.change(ui.getByLabelText(/^Ваш телефон/), { target: { value: '+7 900 000-00-00' } })
    expect(ui.queryByLabelText('Состав нового заказа')).toBeNull()
    expect(ui.queryByLabelText('Ключ оформления')).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Оформить заказ' }))
    await waitFor(() => expect(appCreateRowAction).toHaveBeenCalled())
    const submitted = vi.mocked(appCreateRowAction).mock.calls.at(-1)!
    expect(submitted.slice(0, 2)).toEqual([runtime.app.slug, config.tableId])
    expect(JSON.parse(String(submitted[2][config.cart!.fieldId])).items).toEqual([{ id: product.id, qty: 3 }])
    expect(submitted[2][config.submissionFieldId!]).toBeTruthy()
  })
  it('separates upcoming salon visits from history and restores the selected section after a card and a refresh', () => {
    const { runtime, viewer, bookingData } = templateAppPreview(templateExample('salon'), 'client', 'irina@example.com', 'Ирина')
    const ui = render(<AppShell runtime={runtime} viewer={viewer} demo demoBookingData={bookingData} />)
    expect(ui.getByRole('button', { name: 'Предстоящие 1' }).getAttribute('aria-pressed')).toBe('true')
    expect(ui.queryByRole('button', { name: /Женская стрижка.*Завершено/ })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'История 2' }))
    expect(ui.getByRole('button', { name: /Женская стрижка.*Отменил/ })).toBeTruthy()
    expect(ui.queryByRole('button', { name: /Окрашивание в один тон.*Записан/ })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: /Женская стрижка.*Завершено/ }))
    expect(ui.queryByRole('button', { name: 'Услуга оказана' })).toBeNull()
    expect(ui.queryByRole('button', { name: 'Перенести запись' })).toBeNull()
    expect(ui.queryByRole('button', { name: 'Отменить запись' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Назад' }))
    ui.rerender(<AppShell runtime={structuredClone(runtime)} viewer={viewer} demo demoBookingData={bookingData} />)
    expect(ui.getByRole('button', { name: 'История 2' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('labels an elapsed appointment as unconfirmed without granting customers a completion action', () => {
    const example = templateExample('salon'), config = example.app.booking!
    const { runtime, viewer } = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const elapsed = runtime.tables[config.tables.visits]!.rows.find(row => row.data[config.visit.status] === config.statuses.booked)!
    elapsed.data[config.visit.start] = new Date(Date.now() - 3 * 60 * 60_000).toISOString()
    const ui = render(<AppShell runtime={runtime} viewer={viewer} demo />)
    expect(ui.getByText('Предстоящих записей нет')).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'История 3' }))
    fireEvent.click(ui.getByRole('button', { name: /Окрашивание в один тон.*Результат не отмечен/ }))
    expect(ui.queryByRole('button', { name: 'Услуга оказана' })).toBeNull()
    expect(elapsed.data[config.visit.status]).toBe(config.statuses.booked)
  })
  it('lets an assigned employee complete a begun visit but hides completion for future visits', async () => {
    const example = templateExample('salon'), config = example.app.booking!
    const { runtime, viewer } = templateAppPreview(example, 'staff', 'olga@example.com', 'Оля')
    const arrived = runtime.tables[config.tables.visits]!.rows.find(row => row.data[config.visit.status] === config.statuses.arrived)!
    arrived.data[config.visit.start] = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    vi.mocked(appUpdateRowAction).mockResolvedValue({ ok: true })
    const ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory={false} />)
    fireEvent.click(ui.getByRole('button', { name: /Ирина П\..*Записан/ }))
    expect(ui.queryByRole('button', { name: 'Услуга оказана' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Назад' }))
    fireEvent.click(ui.getByRole('button', { name: /Мария К\./ }))
    fireEvent.click(ui.getByRole('button', { name: 'Услуга оказана' }))
    await waitFor(() => expect(appUpdateRowAction).toHaveBeenCalledWith(runtime.app.slug, config.tables.visits, arrived.id,
      { [config.visit.status]: config.statuses.completed }, arrived.version))
  })
  it('starts guests in the service catalog and carries the chosen salon service into booking', async () => {
    const example = templateExample('salon'), config = example.app.booking!
    const ui = render(<TemplatePreviewShell initial={templateAppPreview(example, 'guest')} signedIn={templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')} />)
    expect(ui.getByRole('heading', { name: 'Услуги и цены' })).toBeTruthy()
    expect(ui.queryByRole('button', { name: 'Записаться' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: /Женская стрижка/ }))
    expect(ui.getByText(/Подберём форму и длину/)).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Записаться' }))
    await demoLogin(ui)
    const first = example.rows.find(row => row.data[config.service.name] === 'Женская стрижка')!
    expect((await ui.findByLabelText('Услуга') as HTMLSelectElement).value).toBe(first.id)
    await waitFor(() => expect(ui.getByRole('option', { name: 'Оля' })).toBeTruthy())
    fireEvent.click(ui.getByRole('button', { name: 'Назад' }))
    fireEvent.click(ui.getByRole('button', { name: 'Назад' }))
    fireEvent.click(ui.getByRole('button', { name: /Мужская стрижка/ }))
    fireEvent.click(ui.getByRole('button', { name: 'Записаться' }))
    const second = example.rows.find(row => row.data[config.service.name] === 'Мужская стрижка')!
    expect((ui.getByLabelText('Услуга') as HTMLSelectElement).value).toBe(second.id)
    await waitFor(() => expect(ui.getByRole('option', { name: 'Женя' })).toBeTruthy())
  })
  it('keeps the signed-in salon cabinet and opens new booking through a service card', () => {
    const { runtime, viewer, bookingData } = templateAppPreview(templateExample('salon'), 'client', 'irina@example.com', 'Ирина')
    const ui = render(<AppShell runtime={runtime} viewer={viewer} demo demoBookingData={bookingData} />)
    expect(ui.getByRole('heading', { name: 'Мои записи' })).toBeTruthy()
    expect(ui.queryByRole('button', { name: 'Записаться' })).toBeNull()
    fireEvent.click(ui.getAllByRole('button', { name: 'Услуги' })[0]!)
    fireEvent.click(ui.getByRole('button', { name: /Женская стрижка/ }))
    expect(ui.getByRole('button', { name: 'Записаться' })).toBeTruthy()
  })
  it('opens a portal request from a service card after demo login and preserves the customer draft', async () => {
    const example = templateExample('portal'), guest = templateAppPreview(example, 'guest'), customer = templateAppPreview(example, 'client', 'irina@example.com', 'Ирина')
    const preview = <TemplatePreviewShell initial={guest} signedIn={customer} />
    const ui = render(preview)
    expect(ui.getByRole('heading', { name: 'Услуги' })).toBeTruthy()
    expect(ui.queryByRole('button', { name: 'Заявка' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: /Диагностика техники/ }))
    fireEvent.click(ui.getByRole('button', { name: 'Оставить заявку' }))
    await demoLogin(ui)
    expect((await ui.findByLabelText(/Что нужно сделать/) as HTMLInputElement).value).toBe('Диагностика техники')
    fireEvent.change(ui.getByLabelText(/Что нужно сделать/), { target: { value: 'Диагностика моего ноутбука' } })
    ui.rerender(<TemplatePreviewShell initial={structuredClone(guest)} signedIn={structuredClone(customer)} />)
    expect((ui.getByLabelText(/Что нужно сделать/) as HTMLInputElement).value).toBe('Диагностика моего ноутбука')
  })
  it('does not mutate published data from an action in the builder preview', () => {
    const { runtime } = inventoryFixture()
    const detail = runtime.app.screens.find(screen => screen.type === 'detail' && screen.tableId === runtime.app.inventory!.tables.items)!
    if (detail.type !== 'detail') throw new Error('Expected the item detail')
    detail.components.push({ id: 'preview-update', position: 'zz', type: 'button', label: 'Тестовое изменение', style: 'secondary',
      roles: null, visibleWhen: null, action: { id: 'preview-action', type: 'update_row', values: {} } })
    const ui = render(<AppShell runtime={runtime} viewer={null} editing />)
    fireEvent.click(ui.getByRole('button', { name: /Шуруповёрт аккумуляторный/ }))
    fireEvent.click(ui.getByRole('button', { name: 'Тестовое изменение' }))
    expect(appUpdateRowAction).not.toHaveBeenCalled()
    expect(ui.getByText(/В предпросмотре изменения не сохраняются/)).toBeTruthy()
  })
  it('uses native history without Next internal flags and preserves the receipt draft on refresh', () => {
    window.history.replaceState({ __NA: true }, '', '/a/warehouse')
    const originalPush = window.history.pushState.bind(window.history)
    const originalReplace = window.history.replaceState.bind(window.history)
    const push = vi.spyOn(window.history, 'pushState').mockImplementation((state, unused, url) => originalPush({ ...state, __NA: true }, unused, url))
    const replace = vi.spyOn(window.history, 'replaceState').mockImplementation((state, unused, url) => originalReplace({ ...state, __NA: true }, unused, url))
    const { runtime } = inventoryFixture()
    const ui = render(<AppShell runtime={runtime} viewer={null} browserHistory />)
    fireEvent.click(ui.getByRole('button', { name: /Шуруповёрт аккумуляторный/ }))
    fireEvent.click(ui.getByRole('button', { name: 'Принять товар' }))
    fireEvent.change(ui.getByRole('spinbutton'), { target: { value: '4' } })
    const receiptUrl = window.location.href
    const refreshed = structuredClone(runtime)
    const config = refreshed.app.inventory!
    refreshed.tables[config.tables.items]!.rows.find(row => String(row.data[config.item.name]).includes('Шуруповёрт'))!.data[config.item.stock] = 8
    ui.rerender(<AppShell runtime={refreshed} viewer={null} browserHistory />)
    expect(window.location.href).toBe(receiptUrl)
    expect((ui.getByRole('spinbutton') as HTMLInputElement).value).toBe('4')
    expect(navFromHistory(window.history.state, () => true)?.stack).toHaveLength(3)
    expect([...push.mock.calls, ...replace.mock.calls].every(([state]) => !state.__NA && !state._N)).toBe(true)
    ui.unmount()
    const restored = render(<AppShell runtime={refreshed} viewer={null} browserHistory />)
    expect(restored.getByRole('heading', { name: 'Приёмка товара' })).toBeTruthy()
    expect(navFromHistory(window.history.state, () => true)?.stack).toHaveLength(3)
  })
  it('restores saved confirmations when a framework refresh replaces custom history state', async () => {
    const { runtime } = inventoryFixture()
    window.history.replaceState(null, '', '/a/warehouse')
    inventoryMocks.operation.mockResolvedValue({ ok: true, name: 'Фильтр', before: 4, quantity: 2, after: 2, repeated: false, operation: 'issue' })
    const ui = render(<AppShell runtime={runtime} viewer={null} browserHistory />)
    fireEvent.click(ui.getByRole('button', { name: /Фильтр воздушный/ }))
    expect(ui.getByText('Ещё действия').closest('details')?.open).toBe(false)
    expect(ui.queryByRole('button', { name: 'Пересчитать остаток' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Выдать товар' }))
    fireEvent.change(ui.getByRole('spinbutton'), { target: { value: '2' } })
    fireEvent.click(ui.getByRole('button', { name: 'Выдать товар' }))
    await waitFor(() => expect(ui.getByRole('status').textContent).toContain('4 → 2'))
    window.history.replaceState({ __NA: true }, '')
    const refreshed = structuredClone(runtime)
    ui.rerender(<AppShell runtime={refreshed} viewer={null} browserHistory />)
    expect(navFromHistory(window.history.state, () => true)?.stack.at(-1)?.receipt?.result.after).toBe(2)
    ui.unmount()
    const restored = render(<AppShell runtime={refreshed} viewer={null} browserHistory />)
    expect(restored.getByRole('status').textContent).toContain('4 → 2')
    expect(restored.queryByRole('spinbutton')).toBeNull()
  })
})
vi.mock('@/app/customer-history-actions', () => ({ readCustomerHistoryAction: vi.fn(), readCustomerDirectoryAction: vi.fn() }))
