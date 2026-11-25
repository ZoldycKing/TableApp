import { describe, expect, it } from 'vitest'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { buildServiceV2App } from './templates/service-v2'
import { MESSAGES_SCREEN, v2MessagesAvailable, v2MessagesLabel, v2MessagesOperator, withV2MessagesNav } from './builder-v2-messages'

describe('App V2 messages tab helpers', () => {
  const built = buildTemplate({ template: findTemplate('service')!, workspaceId: 'wsp' })
  const app = buildServiceV2App(built, { id: 'app_service', workspaceId: 'wsp', name: 'Сервис', slug: 'service', email: 'owner@example.invalid' })

  it('offers the inbox only to authenticated service/support visitors', () => {
    expect(v2MessagesAvailable(app, { authenticated: false })).toBe(false)
    expect(v2MessagesAvailable(app, { authenticated: true })).toBe(true)
    expect(v2MessagesAvailable({ service: undefined, support: undefined }, { authenticated: true })).toBe(false)
  })

  it('labels the tab Чат for clients and Сообщения for desk roles', () => {
    expect(v2MessagesLabel({ roleIds: ['client'] })).toBe('Чат')
    expect(v2MessagesLabel({ roleIds: ['staff'] })).toBe('Сообщения')
    expect(v2MessagesLabel({ roleIds: ['owner'] })).toBe('Сообщения')
    expect(v2MessagesOperator({ roleIds: ['client'] })).toBe(false)
    expect(v2MessagesOperator({ roleIds: ['staff'] })).toBe(true)
  })

  it('injects a virtual chat screen into navigation without duplicating it', () => {
    const actor = { authenticated: true as const, roleIds: ['client'], email: 'a@b.c', name: null, company: '', id: 'u1' }
    const withTab = withV2MessagesNav(app, actor)
    expect(withTab.screens.filter(screen => screen.id === MESSAGES_SCREEN)).toHaveLength(1)
    expect(withTab.screens.find(screen => screen.id === MESSAGES_SCREEN)).toMatchObject({
      name: 'Чат', menuLabel: 'Чат', icon: 'chat', navigation: true, contextTableId: null,
    })
    expect(withV2MessagesNav(withTab, actor).screens.filter(screen => screen.id === MESSAGES_SCREEN)).toHaveLength(1)
  })
})
