import { describe, expect, it } from 'vitest'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { buildServiceV2App } from './templates/service-v2'
import { conversationDetailScreenV2, conversationResourceV2 } from './conversation-resource-v2'

describe('conversationResourceV2 detail screens', () => {
  it('returns separate staff and client card ids for repairs', () => {
    const built = buildTemplate({ template: findTemplate('service')!, workspaceId: 'wsp' })
    const app = buildServiceV2App(built, { id: 'app', workspaceId: 'wsp', name: 'Сервис', slug: 'service', email: 'owner@example.invalid' })
    const resource = conversationResourceV2(app, app.service!.repairsTableId)
    expect(resource).toMatchObject({
      staffDetailScreenId: app.service!.repairScreenId,
      clientDetailScreenId: app.service!.clientRepairScreenId,
      titleFieldId: app.service!.repair.device,
    })
    expect(conversationDetailScreenV2(resource!, true)).toBe(app.service!.repairScreenId)
    expect(conversationDetailScreenV2(resource!, false)).toBe(app.service!.clientRepairScreenId)
  })
})
