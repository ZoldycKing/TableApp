import { compareRows, customerWorkflows, dateInstant, evalFilter, fieldTimeZone, indexFields, type App, type Field, type ScreenOf, type View } from '@tableapp/schema'
import { canOpenScreen, fieldPolicy, onlyReadable, type Visitor } from './app-roles'
import { bookingVisitSection } from './booking-lifecycle'
import { readingVisitor } from './customer-read-access'
import { formatCell } from './format'
import type { RelatedTitles } from './queries'
import { canAccessRow, rulesFor } from './row-access'
import { runtimeQuery, type RuntimePageRequest } from './runtime-page-types'
import type { RuntimeSourceRow } from './runtime-project'

type CollectionScreen = ScreenOf<'list'> | ScreenOf<'tiles'>
type Sortable = Pick<RuntimeSourceRow, 'id' | 'position' | 'data'>

/** Search follows the displayed permitted representation, including choice and relation labels. */
export function runtimeCollectionText(field: Field, value: unknown, titles: RelatedTitles): string {
  if (field.type !== 'relation') return formatCell(field, value)
  if (!Array.isArray(value)) return ''
  const names = new Map((titles[field.options.tableId] ?? []).map(item => [item.id, item.title]))
  return value.map(id => names.get(id) ?? 'Запись недоступна').join(', ')
}

/** Pure semantics shared by the streaming reader and its regression checks. */
export function runtimeCollectionPlan(app: App, visitor: Visitor, screen: CollectionScreen, view: View, fields: readonly Field[],
  views: Record<string, View>, request: RuntimePageRequest, asOf: number) {
  const index = indexFields(fields), reading = readingVisitor(app, view.tableId, visitor)
  const policy = fieldPolicy(app, view.tableId, reading, views)
  const rules = rulesFor(app, view.tableId, visitor)
  const viewer = visitor.email ? { email: visitor.email, company: visitor.company, enrolled: visitor.enrolled } : null
  const customer = customerWorkflows(app).find(config => config.listScreenId === screen.id && config.tableId === view.tableId)
  const booking = app.booking && view.tableId === app.booking.tables.visits && screen.id === (app.booking.listScreenId ?? app.homeScreenId) ? app.booking : null
  const query = runtimeQuery({ query: request.query, choiceId: request.choiceId,
    ...(booking ? { bookingSection: request.bookingSection ?? 'upcoming' } : customer ? { customerSection: request.customerSection ?? 'active' } : {}) })
  const statusField = screen.statusFieldId && policy.fields.has(screen.statusFieldId) ? index.get(screen.statusFieldId) : undefined
  const choices = statusField?.type === 'single_select' || statusField?.type === 'multi_select' ? statusField.options.choices : []
  const searchFields = screen.source.searchFieldIds.flatMap(id => {
    const field = index.get(id)
    if (!field || !policy.fields.has(id)) return []
    // The visit history deliberately displays overdue unmarked outcomes with this label.
    if (booking && query.bookingSection === 'history' && field.id === booking.visit.status && field.type === 'single_select') return [{ ...field,
      options: { ...field.options, choices: field.options.choices.map(choice => [booking.statuses.booked, booking.statuses.arrived].includes(choice.id)
        ? { ...choice, name: 'Результат не отмечен', color: 'gray' as const } : choice) } }]
    return [field]
  })
  const zone = booking ? fieldTimeZone(index.get(booking.visit.start) ?? { type: 'datetime', options: {} }) : undefined
  const section = (row: Sortable): string | null => {
    // User-controlled sections must not disclose a lifecycle value hidden from that user.
    const data = onlyReadable(row.data, { ...policy, restricted: true })
    return booking ? bookingVisitSection(booking, { ...row, data }, zone!, asOf)
      : customer ? customer.terminalStatuses.includes(String(data[customer.statusFieldId])) ? 'history' : 'active' : null
  }
  const selectedSection = query.bookingSection ?? query.customerSection ?? null
  const hasChoice = (row: Sortable, id: string) => statusField ? Array.isArray(row.data[statusField.id])
    ? (row.data[statusField.id] as unknown[]).includes(id) : row.data[statusField.id] === id : false
  const compare = (a: Sortable, b: Sortable): number => {
    if (booking) {
      const left = policy.fields.has(booking.visit.start) ? dateInstant(a.data[booking.visit.start], zone) ?? 0 : 0
      const right = policy.fields.has(booking.visit.start) ? dateInstant(b.data[booking.visit.start], zone) ?? 0 : 0
      const delta = query.bookingSection === 'history' ? right - left : left - right
      if (delta) return delta
    } else if (customer) {
      const created = customer.createdFieldId ?? ''
      const delta = policy.fields.has(created) ? (dateInstant(b.data[created]) ?? 0) - (dateInstant(a.data[created]) ?? 0) : 0
      if (delta) return delta
    }
    return compareRows(a, b, view.config.sorts, index) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }
  return {
    query, policy, rules, viewer, reading, choices, hasChoice, section, compare,
    validChoice: query.choiceId === null || choices.some(choice => choice.id === query.choiceId),
    ownerAllowed: (row: Sortable) => canOpenScreen(screen, reading) && (reading !== visitor || canAccessRow(rules, viewer, row.data)),
    baseAllowed: (row: Sortable) => evalFilter(view.config.filter, row.data, index) && evalFilter(screen.source.extraFilter, row.data, index),
    sectionAllowed: (row: Sortable) => selectedSection === null || section(row) === selectedSection,
    queryAllowed: (row: Sortable, titles: RelatedTitles) => (query.choiceId === null || hasChoice(row, query.choiceId)) &&
      (!query.query || searchFields.some(field => runtimeCollectionText(field, row.data[field.id], titles).toLowerCase().includes(query.query))),
  }
}
