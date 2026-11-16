import { fieldTimeZone, type Field } from '@tableapp/schema'
import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import { templateExample } from '@/lib/templates/presentation'
import { buildBookingV2App } from '@/lib/templates/booking-v2'
import { bookingSampleImage } from '@/lib/templates/booking-samples'
import { salonPortraitUrl } from '@/lib/templates/salon-portrait-names'
import { BookingDemo } from '@/components/builder/v2/booking-demo'
import type { BuilderV2Table } from '@/lib/builder-v2'

/** Service photos and people portraits for every surface that shows the salon teaching data. */
export function salonDemoMedia(booking: NonNullable<AppV2['booking']>, row: { tableId: string; data: Record<string, unknown> }): Record<string, string> {
  if (row.tableId === booking.tables.services) {
    const image = bookingSampleImage(row.data[booking.service.name])
    return image ? { [booking.servicePhotoFieldId]: `/template-media/booking/${image}` } : {}
  }
  if (row.tableId === booking.tables.masters && booking.masterPhotoFieldId) {
    const url = salonPortraitUrl(row.data[booking.master.name])
    return url ? { [booking.masterPhotoFieldId]: url } : {}
  }
  const clients = booking.clients
  if (clients?.photo && row.tableId === clients.tableId) {
    const url = salonPortraitUrl(row.data[clients.name])
    return url ? { [clients.photo]: url } : {}
  }
  return {}
}

export function bookingTemplateDemoModel(example = templateExample('salon')) {
  const app = buildBookingV2App(example.built, { id: example.app.id, workspaceId: example.app.workspaceId, name: 'Тихая студия', slug: 'online-booking-example', email: 'owner@example.com' })
  const booking = app.booking!
  const tables: BuilderV2Table[] = example.built.tables.map(table => ({ ...table, views: [], fields: example.built.fields.filter(field => field.tableId === table.id).map(field => ({ id: field.id, name: field.name, type: field.type as Field['type'], ...(['date', 'datetime'].includes(field.type) ? { timeZone: fieldTimeZone(field as unknown as Field) } : {}), ...(field.type === 'relation' ? { relationTableId: String(field.options.tableId) } : {}), ...(field.options.choices ? { choices: field.options.choices as { id: string; name: string }[] } : {}) })) }))
  const rows = example.rows.map(row => ({ id: row.id, tableId: row.tableId, values: { ...row.data, ...salonDemoMedia(booking, row) } } as AppV2Record))
  return { app, tables, rows }
}

export function BookingTemplateDemo({ example = templateExample('salon'), phone = false, view }: { example?: ReturnType<typeof templateExample>; phone?: boolean; view?: string }) {
  const { app, tables, rows } = bookingTemplateDemoModel(example)
  return <BookingDemo app={app} tables={tables} initialRows={rows} phone={phone} initialView={view} />
}
