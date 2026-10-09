import { fieldTimeZone } from '@tableapp/schema'
import { ANONYMOUS, asRole, visibleScreensFor } from '../app-roles'
import type { BookingData } from '../booking'
import { projectRuntime } from '../runtime-project'
import type { templateExample } from './presentation'

type Example = ReturnType<typeof templateExample>

/** Only synthetic template records enter this preview, never stored application data. */
export function templateAppPreview(example: Example, role: string, email: string | null = null, name: string | null = null) {
  const visitor = role === 'guest' ? ANONYMOUS : asRole(role, email, '', role === 'client')
  let sourceRows = example.rows
  const booking = example.app.booking
  // Include a previous cancellation for the same fictional customer to demonstrate retained history.
  if (booking && email) {
    const own = sourceRows.find(row => row.tableId === booking.tables.visits && row.data[booking.visit.email] === email)
    if (own) sourceRows = sourceRows.map(row => row.tableId === booking.tables.visits && row.data[booking.visit.status] === booking.statuses.cancelled
      ? { ...row, data: { ...row.data, [booking.visit.client]: own.data[booking.visit.client], [booking.visit.phone]: own.data[booking.visit.phone], [booking.visit.email]: email } } : row)
  }
  const app = { ...example.app, screens: visibleScreensFor(example.app, visitor) }
  const now = new Date()
  const runtime = projectRuntime(app, visitor, Object.fromEntries(example.views.map(view => [view.id, view])), example.built.tables, example.byTable,
    sourceRows.map(row => ({ ...row, version: 0, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null })),
    new Map(example.built.tables.map(table => [table.id, table.primaryFieldId])))
  let bookingData: BookingData | undefined
  if (booking) {
    const of = (tableId: string, keys: string[]) => sourceRows.filter(row => row.tableId === tableId).map(row => ({ id: row.id,
      data: Object.fromEntries(keys.map(key => [key, row.data[key]])) }))
    bookingData = { services: of(booking.tables.services, Object.values(booking.service)),
      masters: of(booking.tables.masters, [booking.master.name, booking.master.services, booking.master.active]),
      schedule: of(booking.tables.schedule, Object.values(booking.schedule)),
      visits: of(booking.tables.visits, [booking.visit.master, booking.visit.start, booking.visit.minutes, booking.visit.status]),
      timeZone: fieldTimeZone(example.fields.find(field => field.id === booking.visit.start)!) }
  }
  return { runtime, bookingData, viewer: email ? { id: 'template-preview', email, name } : null }
}
