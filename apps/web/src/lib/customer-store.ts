import { apps, rows } from '@tableapp/db'
import { appSchema, customerWorkflows, dateInstant, type CustomerWorkflow } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { shopCustomerWorkflow } from './templates/shop-v2'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { RowWriteError, type RowActor, type RowTransaction } from './row-mutations'

/** Applies to workspace edits as well as runtime forms, inside their shared write transaction. */
export async function prepareCustomerWrite(context: RowTransaction, tableId: string, input: Record<string, unknown>, before: Record<string, unknown> | null, actor: RowActor, rowId: string) {
  if (!context.customerConfigCache) {
    const records = await context.tx.select({ draft: apps.draft, published: apps.published }).from(apps).where(eq(apps.workspaceId, context.workspaceId))
    context.customerConfigCache = records.flatMap(record => [record.draft, record.published].flatMap(value => {
      const parsed = appSchema.safeParse(value)
      const legacy = parsed.success ? customerWorkflows(parsed.data) : []
      const read = readAppDefinition(value)
      const shop = read.ok && read.formatVersion === 2 ? shopCustomerWorkflow(read.app) : null
      return shop ? [...legacy, shop] : legacy
    }))
  }
  const configs = context.customerConfigCache.filter(config => config.tableId === tableId)
  const unique = new Map(configs.map(config => [JSON.stringify(config), config]))
  const data = { ...input }
  for (const config of unique.values()) {
    const approval = config.approval
    if (approval) {
      const price = data[approval.priceFieldId]
      if (!before && actor.kind !== 'customer_decision' && data[approval.approvedPriceFieldId] != null) throw new RowWriteError('denied', 'Согласие на стоимость подтверждает клиент в кабинете')
      if (before && actor.kind !== 'customer_decision' && data[approval.approvedPriceFieldId] !== before[approval.approvedPriceFieldId]) throw new RowWriteError('denied', 'Согласие на стоимость подтверждает клиент в кабинете')
      const changed = before && before[approval.priceFieldId] !== price
      if (changed && before[approval.approvedPriceFieldId] != null) {
        data[approval.approvedPriceFieldId] = null
        if (!config.terminalStatuses.includes(String(data[config.statusFieldId]))) data[config.statusFieldId] = approval.waitingStatus
      }
      if (data[config.statusFieldId] === approval.waitingStatus && (typeof price !== 'number' || !Number.isFinite(price) || price < 0)) throw new RowWriteError('invalid', 'Укажите стоимость перед согласованием с клиентом')
      if ((approval.consentRequiredStatuses ?? [approval.approvedStatus]).includes(String(data[config.statusFieldId])) && (data[approval.approvedPriceFieldId] !== price || typeof price !== 'number')) throw new RowWriteError('invalid', 'Дождитесь согласия клиента со стоимостью ремонта')
    }
    await checkAppointment(context, config, data, rowId)
    if (config.cart) {
      const cart = config.cart
      const positions = Array.isArray(data[cart.positionsFieldId]) ? data[cart.positionsFieldId] as string[] : []
      if (new Set(positions).size !== positions.length) throw new RowWriteError('invalid', 'Позиция повторяется в составе заказа')
      const siblings = await context.tx.select({ data: rows.data }).from(rows).where(and(eq(rows.tableId, tableId), ne(rows.id, rowId), isNull(rows.deletedAt)))
      for (const sibling of siblings) {
        const linked = (sibling.data as Record<string, unknown>)[cart.positionsFieldId]
        if (Array.isArray(linked) && linked.some(id => positions.includes(id))) throw new RowWriteError('invalid', 'Позиция уже принадлежит другому заказу. Создайте отдельную позицию.')
      }
      for (const id of positions) {
        const [line] = await context.tx.select({ data: rows.data }).from(rows).where(and(eq(rows.id, id), eq(rows.tableId, cart.itemsTableId), isNull(rows.deletedAt)))
        if (!line || (line.data as Record<string, unknown>)[cart.itemEmailFieldId] !== data[config.emailFieldId]) throw new RowWriteError('invalid', 'Состав заказа должен принадлежать этому клиенту')
      }
    }
    if (config.cart && config.assignmentFieldId && (!before || before[config.assignmentFieldId] !== data[config.assignmentFieldId] || JSON.stringify(before[config.cart.positionsFieldId]) !== JSON.stringify(data[config.cart.positionsFieldId]))) {
      // Child lines inherit assignment, so a worker cannot read another worker's order composition.
      const positions = Array.isArray(data[config.cart.positionsFieldId]) ? data[config.cart.positionsFieldId] as string[] : []
      const { updateRow } = await import('./row-mutations')
      for (const id of positions) await updateRow(context, config.cart.itemsTableId, id,
        { [config.cart.itemAssignmentFieldId]: data[config.assignmentFieldId] ?? '' }, actor,
        { guard: line => line[config.cart!.itemEmailFieldId] === data[config.emailFieldId] })
    }
  }
  return data
}

async function checkAppointment(context: RowTransaction, config: CustomerWorkflow, data: Record<string, unknown>, rowId: string) {
  const appointment = config.appointment
  if (!appointment || data[config.statusFieldId] !== appointment.confirmedStatus) return
  const start = dateInstant(data[appointment.fieldId])
  const assignee = config.assignmentFieldId ? data[config.assignmentFieldId] : null
  if (!start || typeof assignee !== 'string' || !assignee.trim()) throw new RowWriteError('invalid', 'Для назначения просмотра укажите время и почту агента')
  const candidates = await context.tx.select({ id: rows.id, data: rows.data }).from(rows).where(and(eq(rows.tableId, config.tableId), ne(rows.id, rowId), isNull(rows.deletedAt)))
  const end = start + appointment.minutes * 60_000
  for (const candidate of candidates) {
    const other = candidate.data as Record<string, unknown>
    if (other[config.statusFieldId] !== appointment.confirmedStatus || String(other[config.assignmentFieldId!]).toLowerCase() !== assignee.toLowerCase()) continue
    const otherStart = dateInstant(other[appointment.fieldId])
    if (otherStart && start < otherStart + appointment.minutes * 60_000 && otherStart < end) throw new RowWriteError('invalid', 'У агента уже назначен просмотр в это время. Выберите другое время.')
  }
}
