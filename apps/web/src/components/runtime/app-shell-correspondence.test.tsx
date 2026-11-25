// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { templateExample } from '@/lib/templates/presentation'
import { templateAppPreview } from '@/lib/templates/app-preview'
import { AppShell } from './app-shell'
import { conversationShotPage } from './conversation-shot'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  send: vi.fn(),
  change: vi.fn(),
  history: vi.fn(),
  close: vi.fn(),
  mark: vi.fn(),
  list: vi.fn().mockResolvedValue({ ok: true, value: { items: [], next: null } }),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/auth-actions', () => ({ signOutAppAction: vi.fn(), consumeAppCodeAction: vi.fn(), requestAppLoginAction: vi.fn() }))
vi.mock('@/app/question-auth-actions', () => ({ beginGeneralQuestionAction: vi.fn() }))
vi.mock('@/app/production-actions', () => ({ saveMovementAction: vi.fn(), saveProductionAction: vi.fn() }))
vi.mock('@/app/runtime-actions', () => ({ appCreateRowAction: vi.fn(), appDeleteRowAction: vi.fn(), appUpdateRowAction: vi.fn() }))
vi.mock('@/app/booking-actions', () => ({ bookingAvailabilityAction: vi.fn(), cancelBookingAction: vi.fn(), setupBookingMasterAction: vi.fn(), setBookingDayOffAction: vi.fn() }))
vi.mock('@/app/customer-actions', () => ({ customerDecisionAction: vi.fn() }))
vi.mock('@/app/inventory-actions', () => ({ receiveStockAction: vi.fn(), saveStockOperationAction: vi.fn() }))
vi.mock('@/app/conversation-actions', () => ({
  readConversationAction: mocks.read,
  sendConversationAction: mocks.send,
  changeConversationMessageAction: mocks.change,
  conversationMessageHistoryAction: mocks.history,
  closeConversationAction: mocks.close,
  markConversationReadAction: mocks.mark.mockResolvedValue({ ok: true }),
  listConversationInboxAction: mocks.list,
}))
vi.mock('./intake-verify', () => ({ IntakeVerify: () => null }))
vi.mock('./customer-history-panel', () => ({ CustomerHistoryPanel: () => null }))
vi.mock('./customer-directory', () => ({ CustomerDirectory: () => null }))
vi.mock('./order-delivery-panel', () => ({ OrderDeliveryPanel: () => null }))
vi.mock('./order-stock-panel', () => ({ OrderStockPanel: () => null, InventoryBalancePanel: () => null }))
vi.mock('@/lib/use-live-app', () => ({ useLiveApp: vi.fn() }))
vi.mock('@/lib/use-screen-runtime', () => ({ useScreenRuntime: (runtime: unknown) => ({ runtime, loading: false, error: null, retry: vi.fn(), pageControls: {} }) }))
vi.mock('@/components/motion/enter-motion', () => ({ useEnterMotion: () => ({ current: null }) }))

afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

function openDetail(templateId: string, role: 'staff' | 'client' | 'manager', email: string) {
  const example = templateExample(templateId)
  example.app.communications = { enabled: true }
  const config = example.app.customer!
  const row = example.rows.find(item => item.tableId === config.tableId)!
  if (role !== 'client') row.data[config.assignmentFieldId!] = email
  if (role === 'client') row.data[config.emailFieldId] = email
  const { runtime, viewer } = templateAppPreview(example, role, email, role === 'client' ? 'Клиент' : 'Сотрудник')
  runtime.app.allowlist = []
  const detail = runtime.app.screens.find(screen => screen.type === 'detail' && screen.tableId === config.tableId
    && (role === 'client' ? screen.id === config.detailScreenId : screen.id !== config.detailScreenId))!
  window.history.replaceState(null, '', `/a/review?e=${detail.id}&r=${row.id}`)
  return { runtime, viewer, row, config, detail }
}

describe('CorrespondenceModule on runtime detail screens', () => {
  it('shows internal notes and Клиенту/Заметка tabs to the operator', async () => {
    mocks.read.mockResolvedValue({ ok: true, value: conversationShotPage(true) })
    const { runtime, viewer, row, config } = openDetail('dostavka', 'staff', 'worker@example.invalid')
    render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    expect(document.querySelector(`[data-correspondence-module][data-table="${config.tableId}"][data-row="${row.id}"]`)).toBeTruthy()
    expect(await screen.findByRole('radiogroup', { name: 'Режим ответа' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Внутренняя заметка' })).toBeTruthy()
    expect(document.querySelector('[data-internal]')).toBeTruthy()
    expect(screen.getByText('Клиент ждёт ответ по акту.')).toBeTruthy()
  })

  it('hides internal notes from the client detail', async () => {
    mocks.read.mockResolvedValue({ ok: true, value: conversationShotPage(false) })
    const { runtime, viewer, row, config } = openDetail('dostavka', 'client', 'irina@example.com')
    render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    expect(document.querySelector(`[data-correspondence-module][data-table="${config.tableId}"][data-row="${row.id}"]`)).toBeTruthy()
    await screen.findByText('Добрый день. Прикладываю акт и фото по заявке.')
    expect(screen.queryByText('Внутренняя заметка')).toBeNull()
    expect(screen.queryByText('Клиент ждёт ответ по акту.')).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Режим ответа' })).toBeNull()
  })

  it('renders nothing when communications are disabled and there is no thread', async () => {
    mocks.read.mockResolvedValue({
      ok: true,
      value: { ...conversationShotPage(true), conversationId: null, enabled: false, messages: [], notes: [] },
    })
    const example = templateExample('dostavka')
    example.app.communications = { enabled: false }
    const config = example.app.customer!
    const row = example.rows.find(item => item.tableId === config.tableId)!
    row.data[config.assignmentFieldId!] = 'worker@example.invalid'
    const { runtime, viewer } = templateAppPreview(example, 'staff', 'worker@example.invalid', 'Сотрудник')
    runtime.app.allowlist = []
    const detail = runtime.app.screens.find(screen => screen.type === 'detail' && screen.tableId === config.tableId && screen.id !== config.detailScreenId)!
    window.history.replaceState(null, '', `/a/review?e=${detail.id}&r=${row.id}`)
    render(<AppShell runtime={runtime} viewer={viewer} browserHistory />)
    expect(document.querySelector(`[data-correspondence-module][data-table="${config.tableId}"][data-row="${row.id}"]`)).toBeTruthy()
    await waitFor(() => expect(mocks.read).toHaveBeenCalled())
    expect(screen.queryByRole('radiogroup', { name: 'Режим ответа' })).toBeNull()
    expect(screen.queryByText('Переписка и документы')).toBeNull()
    expect(screen.queryByLabelText('Переписка по обращению')).toBeNull()
  })
})
