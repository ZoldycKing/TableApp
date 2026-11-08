import { fieldTimeZone } from '@tableapp/schema'
import { ANONYMOUS, asRole, visibleScreensFor } from '../app-roles'
import type { BookingData } from '../booking'
import type { DemoProductionData } from '../demo-production'
import { formatCell } from '../format'
import { projectRuntime } from '../runtime-project'
import type { templateExample } from './presentation'
import { shopSampleImage } from './shop-samples'

type Example = ReturnType<typeof templateExample>
const catalogPhotos: Record<string, { table: string; photos: readonly number[] }> = {
  salon: { table: 'services', photos: [0, 1, 2, 3, 4] },
  katalog: { table: 'goods', photos: [5, 6, 11, 11, 9, 10] },
  nedvizhimost: { table: 'objects', photos: [12, 13, 14, 15, 16, 17] },
  sklad: { table: 'items', photos: [18, 19, 20, 21, 8, 22, 23, 24] },
}

/** A default customer role may have no screens in an internal-only template. */
export function templatePreviewRole(example: Example): string {
  if (!example.template.internalOnly && !example.template.inventory && !example.template.production) return 'guest'
  const candidates = [example.app.roles.find(role => role.isDefault)?.id, 'manager', ...example.app.roles.map(role => role.id)]
  return candidates.find(role => role && visibleScreensFor(example.app, asRole(role)).length > 0) ?? 'guest'
}

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
  const names: Record<string, string> = { salon: 'Салон «Лилия»', zakazy: 'Стол и свет', katalog: 'Магазин «Климат»', service: 'Сервис «Мастерская»', zayavki: 'Сервис «Мастерская»', portal: 'Сервис «Мастерская»', dostavka: 'Доставка «Маршрут»', nedvizhimost: 'Агентство «Ключ»', crm: 'Компания «Вектор»', sklad: 'Склад «Климат»', proizvodstvo: 'Производство «Фабрика»' }
  runtime.business = { name: names[example.template.id] ?? example.template.name, location: '', phone: '' }
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
  const production = example.app.production
  const stockFieldId = production?.material.stock
  const relation = (value: unknown): string => Array.isArray(value) && typeof value[0] === 'string' ? value[0] : ''
  const productionData: DemoProductionData | undefined = production && stockFieldId ? {
    norms: sourceRows.filter(row => row.tableId === production.tables.norms && (!production.norm.active || row.data[production.norm.active] === true)).map(row => ({
      productId: relation(row.data[production.norm.product]), materialId: relation(row.data[production.norm.material]), perUnit: Number(row.data[production.norm.perUnit] ?? 0),
    })),
    materials: sourceRows.filter(row => row.tableId === production.tables.materials).map(row => ({ id: row.id,
      name: String(row.data[production.material.name] ?? ''), stock: Number(row.data[stockFieldId] ?? 0),
      unit: formatCell(example.fields.find(field => field.id === production.material.unit)!, row.data[production.material.unit]),
    })),
  } : undefined
  const demoMedia: Record<string, number | string> = {}
  if (example.template.id === 'zakazy') {
    const name = example.field('goods', 'name')
    for (const row of runtime.tables[name.tableId]?.rows ?? []) {
      const image = shopSampleImage(row.data[name.id])
      if (image) demoMedia[row.id] = `/template-media/shop/${image}`
    }
  }
  const atlas = catalogPhotos[example.template.id]
  if (atlas) {
    const table = example.table(atlas.table)
    const visible = new Set(runtime.tables[table.id]?.rows.map(row => row.id))
    example.built.rows.filter(row => row.tableId === table.id).forEach((row, index) => {
      const photo = atlas.photos[index]
      if (visible.has(row.id) && photo !== undefined) demoMedia[row.id] = photo
    })
  }
  return { runtime, bookingData, productionData, demoMedia, viewer: email ? { id: 'template-preview', email, name } : null }
}
