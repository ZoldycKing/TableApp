// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { templateExample } from '@/lib/templates/presentation'
import { templateAppPreview } from '@/lib/templates/app-preview'
import { AppShell } from './app-shell'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/auth-actions', () => ({ signOutAppAction: vi.fn(), consumeAppCodeAction: vi.fn(), requestAppLoginAction: vi.fn() }))
vi.mock('@/app/question-auth-actions', () => ({ beginGeneralQuestionAction: vi.fn() }))
vi.mock('@/app/production-actions', () => ({ saveMovementAction: vi.fn(), saveProductionAction: vi.fn() }))
vi.mock('@/app/runtime-actions', () => ({ appCreateRowAction: vi.fn(), appDeleteRowAction: vi.fn(), appUpdateRowAction: vi.fn() }))
vi.mock('@/app/booking-actions', () => ({ bookingAvailabilityAction: vi.fn(), cancelBookingAction: vi.fn(), setupBookingMasterAction: vi.fn(), setBookingDayOffAction: vi.fn() }))
vi.mock('@/app/customer-actions', () => ({ customerDecisionAction: vi.fn() }))
vi.mock('@/app/inventory-actions', () => ({ receiveStockAction: vi.fn(), saveStockOperationAction: vi.fn() }))
vi.mock('@/app/conversation-actions', () => ({ listConversationInboxAction: vi.fn().mockResolvedValue({ ok: true, value: { items: [], next: null } }) }))
vi.mock('./conversation-panel', () => ({ ConversationPanel: () => null }))
vi.mock('./intake-verify', () => ({ IntakeVerify: () => null }))
vi.mock('./customer-history-panel', () => ({ CustomerHistoryPanel: () => null }))
vi.mock('./customer-directory', () => ({ CustomerDirectory: () => null }))
vi.mock('./order-delivery-panel', () => ({ OrderDeliveryPanel: () => null }))
vi.mock('./order-stock-panel', () => ({ OrderStockPanel: () => null, InventoryBalancePanel: () => null }))
vi.mock('@/lib/use-live-app', () => ({ useLiveApp: vi.fn() }))
vi.mock('@/lib/use-screen-runtime', () => ({ useScreenRuntime: (runtime: unknown) => ({ runtime, loading: false, error: null, retry: vi.fn(), pageControls: {} }) }))
vi.mock('@/components/motion/enter-motion', () => ({ useEnterMotion: () => ({ current: null }) }))

afterEach(() => { cleanup(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

function preview(templateId: string, role: string) {
  const example = templateExample(templateId)
  example.app.communications = { enabled: true }
  const result = templateAppPreview(example, role, role === 'guest' ? null : 'person@example.invalid', 'Проверка')
  // The live server removes invitation addresses before sending runtime to the browser.
  result.runtime.app.allowlist = []
  if (result.runtime.app.moduleAccess) result.runtime.app.moduleAccess = { grants: [] }
  return result
}

describe('messages audience in permission-projected applications', () => {
  it.each(['service', 'dostavka'])('%s: opens the assigned record conversation from a staff detail without a client detail screen', async templateId => {
    const example = templateExample(templateId), config = example.app.customer!, email = 'person@example.invalid'
    example.app.communications = { enabled: true }
    const assigned = example.rows.find(row => row.tableId === config.tableId)!
    assigned.data[config.assignmentFieldId!] = email
    const { runtime, viewer } = templateAppPreview(example, 'staff', email, 'Исполнитель')
    runtime.app.allowlist = []
    expect(runtime.app.screens.some(screen => screen.id === config.detailScreenId)).toBe(false)
    const detail = runtime.app.screens.find(screen => screen.type === 'detail' && screen.tableId === config.tableId)!
    expect(runtime.tables[config.tableId]!.rows.map(row => row.id)).toContain(assigned.id)
    window.history.replaceState(null, '', `/a/review?e=${detail.id}&r=${assigned.id}`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    fireEvent.click(await ui.findByRole('button', { name: 'Открыть переписку' }))
    expect(await ui.findByText('Вопросы клиентов и переписка по заказам и записям, к которым у вас есть доступ.')).toBeTruthy()
    const search = new URLSearchParams(window.location.search)
    expect(search.get('e')).toBe('__tableapp_messages')
    expect(JSON.parse(search.get('r')!)).toEqual({ slug: runtime.app.slug, tableId: config.tableId, rowId: assigned.id })
  })

  it.each(['service', 'dostavka', 'salon', 'zakazy'].flatMap(templateId => ['staff', 'manager'].map(role => [templateId, role])))('%s: shows %s the work inbox without a customer question action', async (templateId, role) => {
    const { runtime, viewer } = preview(templateId!, role!)
    window.history.replaceState(null, '', `/a/review?e=__tableapp_messages`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    expect(await ui.findByText('Вопросы клиентов и переписка по заказам и записям, к которым у вас есть доступ.')).toBeTruthy()
    expect(ui.queryByRole('button', { name: 'Задать вопрос' })).toBeNull()
    expect(ui.queryByText('Вопросы бизнесу и переписка по вашим заказам и записям.')).toBeNull()
  })

  it.each(['service', 'dostavka', 'salon', 'zakazy'])('%s: keeps the client inbox and question action', async templateId => {
    const { runtime, viewer } = preview(templateId, 'client')
    window.history.replaceState(null, '', `/a/review?e=__tableapp_messages`)
    const ui = render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    expect(await ui.findByText('Вопросы бизнесу и переписка по вашим заказам и записям.')).toBeTruthy()
    expect(ui.getByRole('button', { name: 'Задать вопрос' })).toBeTruthy()
  })

  it.each(['service', 'dostavka', 'salon', 'zakazy'])('%s: still lets a guest ask a question from the public catalog', templateId => {
    const { runtime } = preview(templateId, 'guest')
    const ui = render(<AppShell runtime={runtime} viewer={null} />)
    expect(ui.getByRole('button', { name: 'Задать вопрос' })).toBeTruthy()
    expect(ui.queryByRole('button', { name: 'Сообщения' })).toBeNull()
  })
})
