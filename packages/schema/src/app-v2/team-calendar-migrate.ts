import type { AppV2, AppV2Node } from './schema'

const staffRoles = (app: AppV2) => ['owner', 'staff'].filter(id => app.roles.some(role => role.id === id))

/** Saved salons keep their screen, but the schedule becomes the shared team calendar. */
export function upgradeBookingTeamCalendar(app: AppV2): AppV2 {
  const booking = app.booking
  if (!booking?.listScreenId) return app
  const screen = app.screens.find(item => item.id === booking.listScreenId)
  if (!screen) return app
  if (screen.rootIds.some(id => app.nodes.some(node => node.id === id && node.type === 'team_calendar'))) return app
  const current = app.nodes.find(node => node.type === 'collection' && screen.rootIds.includes(node.id))
  if (!current) return app
  const roles = staffRoles(app)
  const fallback = screen.audience.kind === 'roles' ? screen.audience.roleIds : []
  const visibleRoles = roles.length ? roles : fallback
  const replacement: Extract<AppV2Node, { type: 'team_calendar' }> = {
    id: current.id,
    name: current.name || 'Расписание',
    type: 'team_calendar',
    visibleTo: visibleRoles.length ? { kind: 'roles', roleIds: visibleRoles } : null,
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
      manageRoleIds: app.roles.some(role => role.id === 'owner') ? ['owner'] : roles,
    },
  }
  return { ...app, nodes: app.nodes.map(node => node.id === current.id ? replacement : node) }
}
