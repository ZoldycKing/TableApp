import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Actor, AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { authorizeAppV2Write, projectAppV2Row } from '@tableapp/schema/app-v2'
import { canOperatorTransition, clientCanReply, isSupportStatus, nextTicketNumber, sameEmail, statusAfterClientReply, type SupportStatusName } from './support-logic'
import { type SupportSlaEvent, type SupportSlaPolicy } from './support-sla'

export type SupportApp = NonNullable<AppV2['support']>

export function guardSupportUpdate(app: AppV2, actor: AppV2Actor, row: AppV2Record, values: Record<string, AppV2Json>) {
  return authorizeAppV2Write(app, actor, { operation: 'update', row, values })
}

export function guardSupportCreate(app: AppV2, actor: AppV2Actor, tableId: string, values: Record<string, AppV2Json>) {
  return authorizeAppV2Write(app, actor, { operation: 'create', tableId, values })
}

/** Desk staff and the owner. A client role never becomes an operator from request data. */
export function isSupportDesk(actor: AppV2Actor) {
  return actor.authenticated && (actor.roleIds.includes('owner') || actor.roleIds.includes('staff'))
}

export function isSupportClient(actor: AppV2Actor) {
  return actor.authenticated && actor.roleIds.includes('client') && !isSupportDesk(actor)
}

export function supportActorEmail(actor: AppV2Actor) {
  return actor.authenticated && actor.email ? actor.email.trim().toLowerCase() : ''
}

export function ownsSupportTicket(ticket: SupportApp['ticket'], row: AppV2Record, actor: AppV2Actor) {
  return sameEmail(row.values[ticket.clientEmail], supportActorEmail(actor))
}

/** Drop every row the actor cannot read. Notes have no client grant, so they disappear entirely. */
export function projectSupportRows(app: AppV2, actor: AppV2Actor, rows: readonly AppV2Record[]): AppV2Record[] {
  return rows.flatMap(row => {
    const values = projectAppV2Row(app, actor, row)
    return Object.keys(values).length ? [{ ...row, values }] : []
  })
}

export function ticketCreateValues(ticket: SupportApp['ticket'], input: {
  number: string
  subject: string
  description: string
  categoryId: string
  clientId?: string
  clientName: string
  clientEmail?: string
  statusId: string
  priorityId: string
  createdAt: string
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {
    [ticket.number]: input.number,
    [ticket.subject]: input.subject,
    [ticket.description]: input.description,
    [ticket.category]: [input.categoryId],
    [ticket.clientName]: input.clientName,
    [ticket.status]: input.statusId,
    [ticket.priority]: input.priorityId,
    [ticket.createdAt]: input.createdAt,
    [ticket.updatedAt]: input.createdAt,
  }
  if (input.clientId) values[ticket.client] = [input.clientId]
  if (input.clientEmail) values[ticket.clientEmail] = input.clientEmail
  return values
}

export function ticketPatchValues(ticket: SupportApp['ticket'], input: {
  assigneeId?: string | null
  assigneeEmail?: string | null
  lineId?: string | null
  priorityId?: string
  categoryId?: string
  statusId?: string
  deadline?: string | null
  updatedAt: string
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = { [ticket.updatedAt]: input.updatedAt }
  if (input.assigneeId !== undefined) values[ticket.assignee] = input.assigneeId ? [input.assigneeId] : []
  if (input.assigneeEmail !== undefined) values[ticket.assigneeEmail] = input.assigneeEmail ?? ''
  if (input.lineId !== undefined && ticket.line) values[ticket.line] = input.lineId ?? ''
  if (input.priorityId) values[ticket.priority] = input.priorityId
  if (input.categoryId) values[ticket.category] = [input.categoryId]
  if (input.statusId) values[ticket.status] = input.statusId
  if (input.deadline !== undefined) values[ticket.deadline] = input.deadline
  return values
}

export function operatorValues(operator: SupportApp['operator'], input: {
  name?: string
  email?: string
  phone?: string
  roleId?: string
  lineId?: string | null
  activeId?: string
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {}
  if (input.name !== undefined) values[operator.name] = input.name
  if (input.email !== undefined) values[operator.email] = input.email
  if (input.phone !== undefined) values[operator.phone] = input.phone
  if (input.roleId !== undefined) values[operator.role] = input.roleId
  if (input.lineId !== undefined && operator.line) values[operator.line] = input.lineId ?? ''
  if (input.activeId !== undefined) values[operator.active] = input.activeId
  return values
}

export function replyValues(reply: SupportApp['reply'], input: {
  text: string
  ticketId: string
  at: string
  author: string
  authorEmail: string
  clientEmail?: string
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {
    [reply.text]: input.text,
    [reply.ticket]: [input.ticketId],
    [reply.at]: input.at,
    [reply.author]: input.author,
    [reply.authorEmail]: input.authorEmail,
  }
  if (input.clientEmail) values[reply.clientEmail] = input.clientEmail
  return values
}

export function noteValues(note: SupportApp['note'], input: {
  text: string
  ticketId: string
  at: string
  author: string
  authorEmail: string
}): Record<string, AppV2Json> {
  return {
    [note.text]: input.text,
    [note.ticket]: [input.ticketId],
    [note.at]: input.at,
    [note.author]: input.author,
    [note.authorEmail]: input.authorEmail,
  }
}

export function categoryValues(category: SupportApp['category'], input: { name?: string; description?: string; active?: boolean }): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {}
  if (input.name !== undefined) values[category.name] = input.name
  if (input.description !== undefined) values[category.description] = input.description
  if (input.active !== undefined) values[category.active] = input.active
  return values
}

export function assertDesk(actor: AppV2Actor): { ok: true } | { ok: false; error: string } {
  return isSupportDesk(actor) ? { ok: true } : { ok: false, error: 'Это действие доступно оператору.' }
}

export function assertTicketAccess(support: SupportApp, actor: AppV2Actor, row: AppV2Record): { ok: true } | { ok: false; error: string } {
  if (isSupportDesk(actor)) return { ok: true }
  if (isSupportClient(actor) && ownsSupportTicket(support.ticket, row, actor)) return { ok: true }
  return { ok: false, error: 'Это обращение вам недоступно.' }
}

export function assertOperatorStatus(from: string, to: string): { ok: true } | { ok: false; error: string } {
  if (!isSupportStatus(from) || !isSupportStatus(to)) return { ok: false, error: 'Неизвестный статус.' }
  if (from === to) return { ok: true }
  return canOperatorTransition(from, to) ? { ok: true } : { ok: false, error: 'Такой переход статуса недоступен.' }
}

export function supportStatusName(support: SupportApp, id: unknown): SupportStatusName | '' {
  if (id === support.statuses.fresh) return 'Новое'
  if (id === support.statuses.progress) return 'В работе'
  if (id === support.statuses.waiting) return 'Ждём клиента'
  if (id === support.statuses.resolved) return 'Решено'
  if (id === support.statuses.closed) return 'Закрыто'
  return ''
}

export function supportStatusId(support: SupportApp, name: string) {
  if (name === 'Новое') return support.statuses.fresh
  if (name === 'В работе') return support.statuses.progress
  if (name === 'Ждём клиента') return support.statuses.waiting
  if (name === 'Решено') return support.statuses.resolved
  if (name === 'Закрыто') return support.statuses.closed
  return ''
}

const textOf = (value: unknown) => typeof value === 'string' ? value : ''

export function supportPriorityName(support: SupportApp, id: string) {
  if (id === support.priorities.urgent) return 'Срочный'
  if (id === support.priorities.high) return 'Высокий'
  if (id === support.priorities.low) return 'Низкий'
  return 'Обычный'
}

export function supportEventRecord(support: SupportApp, input: { ticketId: string; kind: SupportSlaEvent['kind']; at: string; priority: string; status: string; actorEmail: string }): AppV2Record | null {
  if (!support.eventsTableId || !support.event) return null
  return {
    id: newId('row'), tableId: support.eventsTableId,
    values: {
      [support.event.ticket]: [input.ticketId],
      [support.event.kind]: input.kind,
      [support.event.at]: input.at,
      [support.event.priority]: input.priority,
      [support.event.status]: input.status,
      [support.event.actorEmail]: input.actorEmail,
    },
  }
}

export function supportStoredEvents(support: SupportApp, rows: readonly AppV2Record[], ticketId: string): SupportSlaEvent[] {
  if (!support.eventsTableId || !support.event) return []
  const event = support.event
  return rows.flatMap(row => {
    if (row.tableId !== support.eventsTableId) return []
    const link = row.values[event.ticket]
    const linked = Array.isArray(link) ? link.find((item): item is string => typeof item === 'string') : ''
    if (linked !== ticketId) return []
    const at = Date.parse(String(row.values[event.at] ?? ''))
    const kind = row.values[event.kind]
    if (!Number.isFinite(at) || (kind !== 'created' && kind !== 'status' && kind !== 'priority' && kind !== 'public_reply')) return []
    return [{ at, kind, priority: String(row.values[event.priority] ?? ''), status: String(row.values[event.status] ?? '') }]
  })
}

export function supportPolicyFromRows(support: SupportApp, rows: readonly AppV2Record[]): SupportSlaPolicy | null {
  const base = support.sla
  if (!base) return null
  const fields = support.slaFields
  const row = support.slaTableId ? rows.find(item => item.tableId === support.slaTableId) : undefined
  if (!fields || !row) return base
  const minutes = (id: string, fallback: number) => {
    const value = row.values[id]
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 7 * 24 * 60 ? value : fallback
  }
  return {
    calendarHours: true,
    riskMinutes: minutes(fields.riskMinutes, base.riskMinutes),
    firstResponseMinutes: {
      urgent: minutes(fields.urgentFirst, base.firstResponseMinutes.urgent),
      high: minutes(fields.highFirst, base.firstResponseMinutes.high),
      normal: minutes(fields.normalFirst, base.firstResponseMinutes.normal),
      low: minutes(fields.lowFirst, base.firstResponseMinutes.low),
    },
    resolutionMinutes: {
      urgent: minutes(fields.urgentResolve, base.resolutionMinutes.urgent),
      high: minutes(fields.highResolve, base.resolutionMinutes.high),
      normal: minutes(fields.normalResolve, base.resolutionMinutes.normal),
      low: minutes(fields.lowResolve, base.resolutionMinutes.low),
    },
  }
}

export type SupportChange =
  | { kind: 'create'; subject: string; description: string; categoryId: string; clientId?: string; priorityId?: string; lineId?: string | null }
  | { kind: 'reply'; recordId: string; text: string }
  | { kind: 'note'; recordId: string; text: string }
  | { kind: 'client_note'; recordId: string; note: string }
  | { kind: 'status'; recordId: string; statusId: string }
  | { kind: 'assign'; recordId: string; assigneeId: string | null; priorityId: string; categoryId: string; deadline: string | null; lineId?: string | null }
  | { kind: 'category'; recordId?: string; name: string; description: string; active: boolean }
  | { kind: 'operator'; recordId?: string; name: string; email: string; phone: string; roleId: string; lineId: string | null; activeId: string }
  | { kind: 'sla'; minutes: Record<string, number> }

/** In-memory twin of the published action, so the gallery uses the same rules as the server. */
export function applySupportChange(app: AppV2, actor: AppV2Actor, rows: readonly AppV2Record[], change: SupportChange, now: string): { ok: true; rows: AppV2Record[]; message: string } | { ok: false; error: string } {
  const support = app.support
  if (!support || !actor.authenticated) return { ok: false, error: 'Для сохранения нужно войти' }
  const replace = (row: AppV2Record, values: Record<string, AppV2Json>) => rows.map(item => item.id === row.id ? { ...item, values: { ...item.values, ...values } } : item)
  const ticketRow = (id: string) => rows.find(row => row.id === id && row.tableId === support.ticketsTableId)
  if (change.kind === 'sla') {
    if (!actor.roleIds.includes('owner') || !support.slaTableId || !support.slaFields) return { ok: false, error: 'Нормативы меняет руководитель.' }
    const current = rows.find(row => row.tableId === support.slaTableId)
    if (!current) return { ok: false, error: 'Нормативы не найдены.' }
    const values: Record<string, AppV2Json> = {}
    for (const [key, fieldId] of Object.entries(support.slaFields)) {
      const value = change.minutes[key]
      if (value == null || !Number.isInteger(value) || value <= 0 || value > 7 * 24 * 60) return { ok: false, error: 'Укажите минуты от 1 до 10080.' }
      values[fieldId] = value
    }
    const decision = guardSupportUpdate(app, actor, current, values)
    if (!decision.ok) return decision
    return { ok: true, rows: replace(current, values), message: 'Нормативы сохранены.' }
  }
  if (change.kind === 'category') {
    if (!actor.roleIds.includes('owner')) return { ok: false, error: 'Категории меняет руководитель.' }
    const values = categoryValues(support.category, change)
    if (change.recordId) {
      const current = rows.find(row => row.id === change.recordId && row.tableId === support.categoriesTableId)
      if (!current) return { ok: false, error: 'Категория не найдена.' }
      const decision = guardSupportUpdate(app, actor, current, values)
      if (!decision.ok) return decision
      return { ok: true, rows: replace(current, values), message: 'Категория сохранена.' }
    }
    const decision = guardSupportCreate(app, actor, support.categoriesTableId, values)
    if (!decision.ok) return decision
    return { ok: true, rows: [...rows, { id: newId('row'), tableId: support.categoriesTableId, values }], message: 'Категория сохранена.' }
  }
  if (change.kind === 'operator') {
    if (!actor.roleIds.includes('owner')) return { ok: false, error: 'Операторов меняет руководитель.' }
    const name = change.name.trim()
    const email = change.email.trim().toLowerCase()
    const phone = change.phone.trim()
    if (!name) return { ok: false, error: 'Укажите имя оператора.' }
    if (!email || !email.includes('@')) return { ok: false, error: 'Укажите почту оператора.' }
    if (!change.roleId || !change.activeId) return { ok: false, error: 'Выберите роль и статус.' }
    const values = operatorValues(support.operator, {
      name, email, phone, roleId: change.roleId, lineId: change.lineId, activeId: change.activeId,
    })
    if (change.recordId) {
      const current = rows.find(row => row.id === change.recordId && row.tableId === support.operatorsTableId)
      if (!current) return { ok: false, error: 'Оператор не найден.' }
      const decision = guardSupportUpdate(app, actor, current, values)
      if (!decision.ok) return decision
      return { ok: true, rows: replace(current, values), message: 'Оператор сохранён.' }
    }
    const decision = guardSupportCreate(app, actor, support.operatorsTableId, values)
    if (!decision.ok) return decision
    return { ok: true, rows: [...rows, { id: newId('row'), tableId: support.operatorsTableId, values }], message: 'Оператор добавлен.' }
  }
  if (change.kind === 'client_note') {
    const desk = assertDesk(actor)
    if (!desk.ok) return { ok: false, error: 'Заметку о клиенте меняет оператор.' }
    const client = rows.find(row => row.id === change.recordId && row.tableId === support.clientsTableId)
    if (!client) return { ok: false, error: 'Клиент не найден.' }
    const note = change.note.trim()
    if (note.length > 2000) return { ok: false, error: 'Заметка слишком длинная.' }
    const values = { [support.client.note]: note }
    const decision = guardSupportUpdate(app, actor, client, values)
    if (!decision.ok) return decision
    return { ok: true, rows: replace(client, values), message: 'Заметка о клиенте сохранена.' }
  }
  if (change.kind === 'create') {
    const category = rows.find(row => row.id === change.categoryId && row.tableId === support.categoriesTableId)
    if (!category || category.values[support.category.active] !== true) return { ok: false, error: 'Выберите доступную категорию.' }
    const priorityId = change.priorityId && Object.values(support.priorities).includes(change.priorityId) ? change.priorityId : support.priorities.normal
    const number = nextTicketNumber(rows.filter(row => row.tableId === support.ticketsTableId).map(row => textOf(row.values[support.ticket.number])))
    let clientId: string | undefined
    let clientName = actor.name?.trim() || supportActorEmail(actor)
    let clientEmail: string | undefined
    if (isSupportDesk(actor)) {
      const client = rows.find(row => row.id === change.clientId && row.tableId === support.clientsTableId)
      const email = textOf(client?.values[support.client.email]).trim()
      const name = textOf(client?.values[support.client.name]).trim()
      if (!client || !email || !name) return { ok: false, error: 'Выберите клиента с именем и почтой.' }
      clientId = client.id
      clientName = name
      clientEmail = email.toLowerCase()
    } else if (!isSupportClient(actor)) return { ok: false, error: 'Создать обращение может клиент или оператор.' }
    // Clients must not write ticket.client — ownership is stamped via clientEmail ownerValues.
    const linked = !clientId && isSupportClient(actor)
      ? rows.find(row => row.tableId === support.clientsTableId && sameEmail(row.values[support.client.email], supportActorEmail(actor)))
      : undefined
    const values = ticketCreateValues(support.ticket, {
      number, subject: change.subject.trim(), description: change.description.trim(), categoryId: category.id,
      clientId: isSupportDesk(actor) ? clientId : undefined, clientName, clientEmail, statusId: support.statuses.fresh, priorityId, createdAt: now,
    })
    if (change.lineId !== undefined && support.ticket.line) values[support.ticket.line] = change.lineId ?? ''
    const decision = guardSupportCreate(app, actor, support.ticketsTableId, values)
    if (!decision.ok) return decision
    const stored = { ...values, ...decision.ownerValues }
    if (linked && !stored[support.ticket.client]) stored[support.ticket.client] = [linked.id]
    const ticketId = newId('row')
    const event = supportEventRecord(support, { ticketId, kind: 'created', at: now, priority: supportPriorityName(support, priorityId), status: 'Новое', actorEmail: supportActorEmail(actor) })
    return { ok: true, rows: [...rows, { id: ticketId, tableId: support.ticketsTableId, values: stored }, ...(event ? [event] : [])], message: 'Обращение создано.' }
  }
  const ticket = ticketRow(change.recordId)
  if (!ticket) return { ok: false, error: 'Обращение не найдено.' }
  const access = assertTicketAccess(support, actor, ticket)
  if (!access.ok) return access
  const statusName = supportStatusName(support, ticket.values[support.ticket.status])
  const author = actor.name?.trim() || supportActorEmail(actor)
  if (change.kind === 'note') {
    const desk = assertDesk(actor)
    if (!desk.ok) return { ok: false, error: 'Внутренние заметки доступны только оператору.' }
    const values = noteValues(support.note, { text: change.text.trim(), ticketId: ticket.id, at: now, author, authorEmail: supportActorEmail(actor) })
    const decision = guardSupportCreate(app, actor, support.notesTableId, values)
    if (!decision.ok) return decision
    const patch = ticketPatchValues(support.ticket, { updatedAt: now })
    const update = guardSupportUpdate(app, actor, ticket, patch)
    if (!update.ok) return update
    return { ok: true, rows: [...replace(ticket, patch), { id: newId('row'), tableId: support.notesTableId, values }], message: 'Заметка сохранена. Клиент её не видит.' }
  }
  if (change.kind === 'reply') {
    const clientEmail = textOf(ticket.values[support.ticket.clientEmail]).trim().toLowerCase()
    if (isSupportClient(actor)) {
      const next = assertClientReply(statusName)
      if (!next.ok) return next
      const values = replyValues(support.reply, { text: change.text.trim(), ticketId: ticket.id, at: now, author, authorEmail: supportActorEmail(actor) })
      const decision = guardSupportCreate(app, actor, support.repliesTableId, values)
      if (!decision.ok) return decision
      const statusId = supportStatusId(support, next.next)
      const patch = ticketPatchValues(support.ticket, { statusId, updatedAt: now })
      const update = guardSupportUpdate(app, actor, ticket, patch)
      if (!update.ok) return update
      const statusEvent = next.next !== statusName ? supportEventRecord(support, { ticketId: ticket.id, kind: 'status', at: now, priority: supportPriorityName(support, textOf(ticket.values[support.ticket.priority])), status: next.next, actorEmail: supportActorEmail(actor) }) : null
      return { ok: true, rows: [...replace(ticket, patch), { id: newId('row'), tableId: support.repliesTableId, values: { ...values, ...decision.ownerValues } }, ...(statusEvent ? [statusEvent] : [])], message: 'Ответ сохранён.' }
    }
    const desk = assertDesk(actor)
    if (!desk.ok) return desk
    const values = replyValues(support.reply, { text: change.text.trim(), ticketId: ticket.id, at: now, author, authorEmail: supportActorEmail(actor), clientEmail })
    const decision = guardSupportCreate(app, actor, support.repliesTableId, values)
    if (!decision.ok) return decision
    const patch = ticketPatchValues(support.ticket, { updatedAt: now })
    const update = guardSupportUpdate(app, actor, ticket, patch)
    if (!update.ok) return update
    const replyEvent = supportEventRecord(support, { ticketId: ticket.id, kind: 'public_reply', at: now, priority: supportPriorityName(support, textOf(ticket.values[support.ticket.priority])), status: statusName, actorEmail: supportActorEmail(actor) })
    return { ok: true, rows: [...replace(ticket, patch), { id: newId('row'), tableId: support.repliesTableId, values }, ...(replyEvent ? [replyEvent] : [])], message: 'Ответ клиенту сохранён.' }
  }
  if (change.kind === 'status') {
    const desk = assertDesk(actor)
    if (!desk.ok) return desk
    const nextName = supportStatusName(support, change.statusId)
    const allowed = assertOperatorStatus(statusName, nextName)
    if (!allowed.ok) return allowed
    let assigneeId: string | undefined
    let assigneeEmail: string | undefined
    if (statusName === 'Новое' && nextName === 'В работе' && !textOf(ticket.values[support.ticket.assigneeEmail]).trim()) {
      const email = supportActorEmail(actor)
      const self = rows.find(row => row.tableId === support.operatorsTableId && sameEmail(row.values[support.operator.email], email) && row.values[support.operator.active] === support.activeChoiceId)
      if (self) { assigneeId = self.id; assigneeEmail = email }
    }
    const patch = ticketPatchValues(support.ticket, { statusId: change.statusId, updatedAt: now, ...(assigneeId ? { assigneeId, assigneeEmail } : {}) })
    const decision = guardSupportUpdate(app, actor, ticket, patch)
    if (!decision.ok) return decision
    const statusEvent = supportEventRecord(support, { ticketId: ticket.id, kind: 'status', at: now, priority: supportPriorityName(support, textOf(ticket.values[support.ticket.priority])), status: nextName, actorEmail: supportActorEmail(actor) })
    return { ok: true, rows: [...replace(ticket, patch), ...(statusEvent ? [statusEvent] : [])], message: 'Статус сохранён.' }
  }
  const desk = assertDesk(actor)
  if (!desk.ok) return desk
  if (statusName === 'Закрыто') return { ok: false, error: 'Закрытое обращение сначала переоткрывают.' }
  if (!Object.values(support.priorities).includes(change.priorityId)) return { ok: false, error: 'Выберите приоритет.' }
  const category = rows.find(row => row.id === change.categoryId && row.tableId === support.categoriesTableId)
  if (!category) return { ok: false, error: 'Выберите категорию.' }
  let assigneeEmail: string | null = null
  if (change.assigneeId) {
    const operator = rows.find(row => row.id === change.assigneeId && row.tableId === support.operatorsTableId)
    const email = textOf(operator?.values[support.operator.email]).trim()
    if (!operator || operator.values[support.operator.active] !== support.activeChoiceId || !email) return { ok: false, error: 'Назначьте активного оператора.' }
    assigneeEmail = email.toLowerCase()
  }
  const patch = ticketPatchValues(support.ticket, {
    assigneeId: change.assigneeId, assigneeEmail, lineId: change.lineId, priorityId: change.priorityId,
    categoryId: category.id, deadline: change.deadline, updatedAt: now,
  })
  const decision = guardSupportUpdate(app, actor, ticket, patch)
  if (!decision.ok) return decision
  const previousPriority = textOf(ticket.values[support.ticket.priority])
  const priorityEvent = previousPriority !== change.priorityId ? supportEventRecord(support, { ticketId: ticket.id, kind: 'priority', at: now, priority: supportPriorityName(support, change.priorityId), status: statusName, actorEmail: supportActorEmail(actor) }) : null
  return { ok: true, rows: [...replace(ticket, patch), ...(priorityEvent ? [priorityEvent] : [])], message: 'Обращение сохранено.' }
}

export function assertClientReply(status: string): { ok: true; next: string } | { ok: false; error: string } {
  if (!clientCanReply(status)) return { ok: false, error: 'Ответить в этом статусе нельзя.' }
  const next = statusAfterClientReply(status)
  if (!next) return { ok: false, error: 'Неизвестный статус.' }
  return { ok: true, next }
}
