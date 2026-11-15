import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'

/** Salon configures the shared calendar and keeps its existing forms and grants. */
export function bookingTeamCalendarNode(
  booking: NonNullable<AppV2['booking']>,
  id: string,
): Extract<AppV2Node, { type: 'team_calendar' }> {
  return {
    id,
    name: 'Расписание',
    type: 'team_calendar',
    visibleTo: { kind: 'roles', roleIds: ['owner', 'staff'] },
    visibleWhen: null,
    resourceLabel: 'Мастер',
    resourcesLabel: 'Мастера',
    showMetrics: true,
    data: {
      tableId: booking.tables.visits,
      viewId: null,
      titleFieldId: booking.visit.service,
      subtitleFieldId: booking.visit.client,
      startFieldId: booking.visit.start,
      durationFieldId: booking.visit.minutes,
      endFieldId: null,
      resourceFieldId: booking.visit.master,
      statusFieldId: booking.visit.status,
      amountFieldId: booking.visit.price,
      statusValues: booking.statuses,
      resources: {
        tableId: booking.tables.masters,
        viewId: null,
        titleFieldId: booking.master.name,
        photoFieldId: booking.masterPhotoFieldId ?? null,
        ownerEmailFieldId: booking.master.email,
      },
      hours: {
        tableId: booking.tables.schedule,
        viewId: null,
        resourceFieldId: booking.schedule.master,
        weekdayFieldId: booking.schedule.weekday,
        weekdays: booking.weekdays,
        dateFieldId: booking.schedule.date,
        startFieldId: booking.schedule.start,
        endFieldId: booking.schedule.end,
        closedFieldId: booking.schedule.closed,
      },
    },
    actions: {
      itemScreenId: booking.visitScreenId,
      createScreenId: booking.catalogScreenId,
      configureScreenId: booking.setupScreenId,
      periodScreenId: booking.periodScreenId ?? null,
      manageRoleIds: ['owner'],
    },
  }
}
