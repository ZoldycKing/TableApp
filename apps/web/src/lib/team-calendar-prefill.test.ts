import { describe, expect, it } from 'vitest'
import { buildTemplate } from './templates/build'
import { salon } from './templates/defs/salon'
import { buildBookingV2App } from './templates/booking-v2'
import { calendarCreateTarget, calendarFormValues, ownerCalendarServiceField } from './team-calendar-prefill'

const built = buildTemplate({ template: salon, workspaceId: 'workspace_calendar' })
const app = buildBookingV2App(built, { id: 'app_calendar', workspaceId: 'workspace_calendar', name: 'Календарь', slug: 'calendar-unit', email: 'owner@example.com' })

describe('creating an appointment from a calendar slot', () => {
  const node = app.nodes.find(item => item.type === 'team_calendar')
  it('opens the owner form with the clicked master and start already filled', () => {
    expect(node?.type).toBe('team_calendar')
    if (node?.type !== 'team_calendar' || !node.data) throw new Error('salon calendar')
    expect(calendarCreateTarget(app, node)).toEqual({
      screenId: app.booking!.formScreenId,
      formId: app.booking!.ownerCreateFormId,
    })
    const values = calendarFormValues(node.data, { resourceId: 'master_olya', day: '2026-11-15', time: '09:00' }, 'Europe/Moscow')
    expect(values.tableId).toBe(node.data.tableId)
    expect(values.values[node.data.resourceFieldId]).toEqual(['master_olya'])
    expect(values.values[node.data.startFieldId]).toBe('2026-11-15T06:00:00.000Z')
  })
  it('lets the owner choose a service only when the form is not already inside a service card', () => {
    const booking = app.booking!
    expect(ownerCalendarServiceField(app, booking.ownerCreateFormId!, undefined, ['owner'])).toBe(booking.visit.service)
    expect(ownerCalendarServiceField(app, booking.ownerCreateFormId!, 'service_row', ['owner'])).toBeNull()
    expect(ownerCalendarServiceField(app, booking.ownerCreateFormId!, undefined, ['client'])).toBeNull()
  })
})
