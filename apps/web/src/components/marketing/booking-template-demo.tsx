import { fieldTimeZone, type Field } from '@tableapp/schema'
import type { AppV2Record } from '@tableapp/schema/app-v2'
import { templateExample } from '@/lib/templates/presentation'
import { buildBookingV2App } from '@/lib/templates/booking-v2'
import { bookingSampleImage } from '@/lib/templates/booking-samples'
import { BookingDemo } from '@/components/builder/v2/booking-demo'
import type { BuilderV2Table } from '@/lib/builder-v2'

export function BookingTemplateDemo({ example = templateExample('salon'), phone = false }: { example?: ReturnType<typeof templateExample>; phone?: boolean }) {
  const app = buildBookingV2App(example.built, { id: example.app.id, workspaceId: example.app.workspaceId, name: 'Тихая студия', slug: 'online-booking-example', email: 'owner@example.com' })
  const booking = app.booking!
  const tables: BuilderV2Table[] = example.built.tables.map(table => ({ ...table, views: [], fields: example.built.fields.filter(field => field.tableId === table.id).map(field => ({ id: field.id, name: field.name, type: field.type as Field['type'], ...(['date', 'datetime'].includes(field.type) ? { timeZone: fieldTimeZone(field as unknown as Field) } : {}), ...(field.type === 'relation' ? { relationTableId: String(field.options.tableId) } : {}), ...(field.options.choices ? { choices: field.options.choices as { id: string; name: string }[] } : {}) })) }))
  const rows = example.rows.map(row => {
    const image = row.tableId === booking.tables.services ? bookingSampleImage(row.data[booking.service.name]) : null
    return { id: row.id, tableId: row.tableId, values: { ...row.data, ...(image ? { [booking.servicePhotoFieldId]: `/template-media/booking/${image}` } : {}) } } as AppV2Record
  })
  return <BookingDemo app={app} tables={tables} initialRows={rows} phone={phone} />
}
