/**
 * Diagnose why client ticket create hits «Одно из полей недоступно для изменения».
 * Mirrors applySupportChange / support-actions create values for i.petrova@mail.ru.
 */
import { newId } from '@tableapp/schema'
import { authorizeAppV2Write, type AppV2Actor } from '@tableapp/schema/app-v2'
import { buildTemplate } from '../src/lib/templates/build.ts'
import { findTemplate } from '../src/lib/templates/catalog.ts'
import { buildSupportV2App } from '../src/lib/templates/support-v2.ts'
import { nextTicketNumber } from '../src/lib/support-logic.ts'
import { ticketCreateValues } from '../src/lib/support-persist.ts'

const workspaceId = 'wsp_diag'
const built = buildTemplate({ template: findTemplate('podderzhka')!, workspaceId })
const app = buildSupportV2App(built, {
  id: 'app_diag',
  workspaceId,
  name: 'Обращения',
  slug: 'podderzhka-diag',
  email: 'owner@example.invalid',
})
app.authentication.members.push({ email: 'i.petrova@mail.ru', roleIds: ['client'], company: '' })
const support = app.support!

const fieldName = (id: string) => built.fields.find(f => f.id === id)?.name ?? id
const ticketFields = Object.entries(support.ticket).map(([key, id]) => ({ key, id, name: fieldName(id) }))

const clientGrant = app.policy.tables
  .find(t => t.tableId === support.ticketsTableId)!
  .grants.find(g => g.audience.kind === 'roles' && g.audience.roleIds.includes('client'))!
const createGrantIds = new Set(clientGrant.create!.fieldIds)
const ownerFieldId = clientGrant.create!.owner!.fieldId

const category = built.rows.find(
  row => row.tableId === support.categoriesTableId && row.data[support.category.name] === 'Вопрос по работе',
)!
const number = nextTicketNumber(
  built.rows.filter(row => row.tableId === support.ticketsTableId).map(row => String(row.data[support.ticket.number] ?? '')),
)
const now = '2026-11-24T08:00:00.000Z'

const actor: AppV2Actor = {
  authenticated: true,
  id: 'usr_irina',
  email: 'i.petrova@mail.ru',
  name: 'Ирина Петрова',
  roleIds: ['client'],
}

// Same shape as ticketCreateValues for a client (no clientId / clientEmail — owner stamps email).
const baseValues = ticketCreateValues(support.ticket, {
  number,
  subject: 'Учебный вопрос про срок',
  description: 'Это учебная проверка сохранения.',
  categoryId: category.id,
  clientName: actor.name!,
  statusId: support.statuses.fresh,
  priorityId: support.priorities.normal,
  createdAt: now,
})

// support-actions readRequest always returns lineId: null when the client omits lineId.
const withDefaultedLine = { ...baseValues, [support.ticket.line!]: '' as const }

// applySupportChange with an accidental directory link (pre-fix path).
const linked = built.rows.find(
  row => row.tableId === support.clientsTableId && String(row.data[support.client.email]).toLowerCase() === 'i.petrova@mail.ru',
)
const withClientRelation = { ...baseValues, [support.ticket.client]: [linked!.id] }

function report(label: string, values: Record<string, unknown>) {
  const valueIds = Object.keys(values)
  const unauthorized = valueIds.filter(id => !createGrantIds.has(id) || id === ownerFieldId)
  const decision = authorizeAppV2Write(app, actor, {
    operation: 'create',
    tableId: support.ticketsTableId,
    values: values as never,
  })
  console.log(`\n=== ${label} ===`)
  console.log('value field ids:', valueIds.map(id => `${fieldName(id)} (${id})`).join(', '))
  console.log('grant field ids:', [...createGrantIds].map(id => `${fieldName(id)} (${id})`).join(', '))
  console.log('owner field:', `${fieldName(ownerFieldId)} (${ownerFieldId})`)
  console.log('unauthorized vs grant/owner:', unauthorized.length
    ? unauthorized.map(id => `${fieldName(id)} [${ticketFields.find(f => f.id === id)?.key ?? '?'}] (${id})`).join(', ')
    : '(none)')
  console.log('decision:', decision)
}

console.log('ticket field map:', ticketFields)
console.log('clientTicketCreate keys:', clientGrant.create!.fieldIds.map(id => ticketFields.find(f => f.id === id)?.key ?? fieldName(id)))

report('client create via ticketCreateValues only', baseValues)
report('client create mimicking support-actions default lineId:null', withDefaultedLine)
report('client create with ticket.client linked (old applySupportChange bug)', withClientRelation)

const suspects = [
  ['ticket.number', support.ticket.number],
  ['ticket.client', support.ticket.client],
  ['ticket.clientEmail', support.ticket.clientEmail],
  ['ticket.line', support.ticket.line],
] as const
console.log('\n=== suspect field membership ===')
for (const [label, id] of suspects) {
  console.log(label, { id, name: fieldName(id!), inCreateGrant: createGrantIds.has(id!), isOwner: id === ownerFieldId })
}
