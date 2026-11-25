// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTemplate } from '@/lib/templates/build'
import { findTemplate } from '@/lib/templates/catalog'
import { buildServiceV2App } from '@/lib/templates/service-v2'
import { MESSAGES_SCREEN, withV2MessagesNav } from '@/lib/builder-v2-messages'
import { PublishedV2Runtime } from './published-runtime'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('./use-published-back', () => ({ usePublishedV2Back: () => ({ beforeNavigate: vi.fn(), back: vi.fn() }) }))
vi.mock('@/app/builder-v2-published-actions', () => ({
  inspectPublishedV2DeleteAction: vi.fn(), submitPublishedV2DeleteAction: vi.fn(),
  readPublishedV2DataAction: vi.fn(), readPublishedV2RecordAction: vi.fn(),
  inspectPublishedV2FormAction: vi.fn(), submitPublishedV2FormAction: vi.fn(),
  inspectPublishedV2ButtonAction: vi.fn(), submitPublishedV2ButtonAction: vi.fn(),
}))
vi.mock('@/app/conversation-actions', () => ({
  listConversationInboxAction: vi.fn().mockResolvedValue({ ok: true, value: { items: [], next: null } }),
}))
vi.mock('@/components/runtime/conversation-panel', () => ({ ConversationPanel: () => null }))

afterEach(cleanup)

function page(roleIds: string[]) {
  const built = buildTemplate({ template: findTemplate('service')!, workspaceId: 'wsp' })
  const base = buildServiceV2App(built, { id: 'app_service', workspaceId: 'wsp', name: 'Сервисный центр', slug: 'service-demo', email: 'owner@example.invalid' })
  const actor = { authenticated: true as const, roleIds, email: 'person@example.invalid', name: 'Участник', company: '', id: 'user_1' }
  const app = withV2MessagesNav({
    ...base,
    authentication: { mode: 'invite_only', defaultRoleId: null, members: [] },
    roles: base.roles.filter(role => roleIds.includes(role.id)),
    policy: { tables: [], workflows: [] },
    nodes: [], sources: [], workflows: [],
  }, actor)
  return {
    login: false as const,
    app,
    actor,
    revision: 'rev',
    screenId: MESSAGES_SCREEN,
    recordId: undefined,
    record: undefined,
    title: roleIds.includes('staff') || roleIds.includes('owner') ? 'Сообщения' : 'Чат',
    buttons: {},
    rowActions: {},
    tables: [],
  }
}

describe('PublishedV2Runtime messages inbox', () => {
  it('shows the client Чат tab and empty inbox copy', async () => {
    const data = page(['client'])
    expect(data.app.screens.find(screen => screen.id === MESSAGES_SCREEN)?.menuLabel).toBe('Чат')
    const ui = render(<PublishedV2Runtime data={data} />)
    // jsdom gives the nav row zero width, so pills are [hidden]; query with hidden:true.
    expect(ui.getAllByRole('button', { name: 'Чат', hidden: true }).length).toBeGreaterThan(0)
    expect(await ui.findByText('Вопросы бизнесу и переписка по вашим заказам и записям.')).toBeTruthy()
    expect(ui.queryByRole('button', { name: 'Сообщения', hidden: true })).toBeNull()
  })

  it('shows the staff Сообщения tab with operator copy', async () => {
    const data = page(['staff'])
    expect(data.app.screens.find(screen => screen.id === MESSAGES_SCREEN)?.menuLabel).toBe('Сообщения')
    const ui = render(<PublishedV2Runtime data={data} />)
    expect(ui.getAllByRole('button', { name: 'Сообщения', hidden: true }).length).toBeGreaterThan(0)
    expect(await ui.findByText('Вопросы клиентов и переписка по заказам и записям, к которым у вас есть доступ.')).toBeTruthy()
    expect(ui.queryByRole('button', { name: 'Чат', hidden: true })).toBeNull()
  })
})
