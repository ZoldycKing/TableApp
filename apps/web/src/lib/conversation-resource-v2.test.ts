import { describe, expect, it } from 'vitest'
import { buildTemplate } from './templates/build'
import { findTemplate } from './templates/catalog'
import { buildProkatV2App } from './templates/prokat-v2'
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

  it('binds prokat bookings to staff/client screens with titleFieldId = booking.title', () => {
    const built = buildTemplate({ template: findTemplate('prokat')!, workspaceId: 'wsp_prokat' })
    const app = buildProkatV2App(built, {
      id: 'app_prokat', workspaceId: 'wsp_prokat', name: 'Прокат', slug: 'prokat', email: 'owner@prokat-demo.ru',
    })
    const resource = conversationResourceV2(app, app.prokat!.bookingsTableId)
    expect(resource).toMatchObject({
      staffDetailScreenId: app.prokat!.bookingScreenId,
      clientDetailScreenId: app.prokat!.clientBookingScreenId,
      titleFieldId: app.prokat!.booking.title,
      emailFieldId: app.prokat!.booking.clientEmail,
      moduleId: `mod_prokat_${app.prokat!.bookingsTableId}`,
    })
    expect(conversationDetailScreenV2(resource!, true)).toBe(app.prokat!.bookingScreenId)
    expect(conversationDetailScreenV2(resource!, false)).toBe(app.prokat!.clientBookingScreenId)
  })
})
