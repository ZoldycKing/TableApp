'use server'
import { newId } from '@tableapp/schema'
import { rows } from '@tableapp/db'
import type { Field } from '@tableapp/schema'
import type { AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { and, eq, isNull } from 'drizzle-orm'
import { publishedV2Context, publishedV2Definition, publishedV2Screen } from '@/lib/builder-v2-published'
import { nextTicketNumber } from '@/lib/support-logic'
import {
  assertClientReply, assertDesk, assertOperatorStatus, assertTicketAccess, categoryValues, isSupportClient, isSupportDesk,
  noteValues, operatorValues, replyValues, supportActorEmail, ticketCreateValues, ticketPatchValues, supportEventRecord, supportPriorityName,
  guardSupportCreate, guardSupportUpdate, type SupportApp,
} from '@/lib/support-persist'
import { RowWriteError, createRow, mutationFields, updateRow, writeRows } from '@/lib/row-mutations'

type CreateRequest = { kind: 'create'; revision: string; screenId: string; subject: string; description: string; categoryId: string; clientId?: string; priorityId?: string; lineId?: string | null }
type ReplyRequest = { kind: 'reply'; revision: string; screenId: string; recordId: string; text: string }
type NoteRequest = { kind: 'note'; revision: string; screenId: string; recordId: string; text: string }
type StatusRequest = { kind: 'status'; revision: string; screenId: string; recordId: string; statusId: string }
type AssignRequest = { kind: 'assign'; revision: string; screenId: string; recordId: string; assigneeId: string | null; priorityId: string; categoryId: string; deadline: string | null; lineId?: string | null }
type CategoryRequest = { kind: 'category'; revision: string; screenId: string; recordId?: string; name: string; description: string; active: boolean }
type OperatorRequest = { kind: 'operator'; revision: string; screenId: string; recordId?: string; name: string; email: string; phone: string; roleId: string; lineId: string | null; activeId: string }
type ClientNoteRequest = { kind: 'client_note'; revision: string; screenId: string; recordId: string; note: string }
type SlaRequest = { kind: 'sla'; revision: string; screenId: string; minutes: Record<string, number> }
type Request = CreateRequest | ReplyRequest | NoteRequest | ClientNoteRequest | StatusRequest | AssignRequest | CategoryRequest | OperatorRequest | SlaRequest

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
const optionalText = (value: unknown, max: number) => value == null || value === '' ? '' : typeof value === 'string' && value.trim().length <= max ? value.trim() : null
const idValue = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 80 ? value : null
const instant = (value: unknown) => value === null ? null : typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined

function readRequest(input: unknown): Request | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  if (typeof value.revision !== 'string' || value.revision.length < 8 || typeof value.screenId !== 'string' || !value.kind || typeof value.kind !== 'string') return null
  if (value.kind === 'create') {
    const subject = text(value.subject, 200), description = text(value.description, 4000), categoryId = idValue(value.categoryId)
    if (!subject || !description || !categoryId) return null
    const clientId = value.clientId == null || value.clientId === '' ? undefined : idValue(value.clientId)
    if (value.clientId != null && value.clientId !== '' && !clientId) return null
    const priorityId = value.priorityId == null || value.priorityId === '' ? undefined : idValue(value.priorityId)
    if (value.priorityId != null && value.priorityId !== '' && !priorityId) return null
    const lineId = value.lineId == null || value.lineId === '' ? null : idValue(value.lineId)
    if (value.lineId != null && value.lineId !== '' && !lineId) return null
    return { kind: 'create', revision: value.revision, screenId: value.screenId, subject, description, categoryId, lineId, ...(clientId ? { clientId } : {}), ...(priorityId ? { priorityId } : {}) }
  }
  const recordId = idValue(value.recordId)
  if (value.kind === 'reply' || value.kind === 'note') {
    const body = text(value.text, 4000)
    if (!recordId || !body) return null
    return { kind: value.kind, revision: value.revision, screenId: value.screenId, recordId, text: body }
  }
  if (value.kind === 'client_note') {
    const note = optionalText(value.note, 2000)
    if (!recordId || note == null) return null
    return { kind: 'client_note', revision: value.revision, screenId: value.screenId, recordId, note }
  }
  if (value.kind === 'status') {
    const statusId = idValue(value.statusId)
    if (!recordId || !statusId) return null
    return { kind: 'status', revision: value.revision, screenId: value.screenId, recordId, statusId }
  }
  if (value.kind === 'assign') {
    const priorityId = idValue(value.priorityId), categoryId = idValue(value.categoryId)
    const deadline = instant(value.deadline)
    const assigneeId = value.assigneeId == null || value.assigneeId === '' ? null : idValue(value.assigneeId)
    const lineId = value.lineId == null || value.lineId === '' ? null : idValue(value.lineId)
    if (!recordId || !priorityId || !categoryId || deadline === undefined || (value.assigneeId != null && value.assigneeId !== '' && !assigneeId)) return null
    if (value.lineId != null && value.lineId !== '' && !lineId) return null
    return { kind: 'assign', revision: value.revision, screenId: value.screenId, recordId, assigneeId, priorityId, categoryId, deadline, lineId }
  }
  if (value.kind === 'operator') {
    const name = text(value.name, 80), email = text(value.email, 120), phone = optionalText(value.phone, 40)
    const roleId = idValue(value.roleId), activeId = idValue(value.activeId)
    const lineId = value.lineId == null || value.lineId === '' ? null : idValue(value.lineId)
    if (!name || !email || phone == null || !roleId || !activeId) return null
    if (value.lineId != null && value.lineId !== '' && !lineId) return null
    const operatorId = value.recordId == null || value.recordId === '' ? undefined : idValue(value.recordId)
    if (value.recordId != null && value.recordId !== '' && !operatorId) return null
    return { kind: 'operator', revision: value.revision, screenId: value.screenId, ...(operatorId ? { recordId: operatorId } : {}), name, email, phone, roleId, lineId, activeId }
  }
  if (value.kind === 'sla') {
    if (!value.minutes || typeof value.minutes !== 'object') return null
    const minutes: Record<string, number> = {}
    for (const [key, item] of Object.entries(value.minutes as Record<string, unknown>)) {
      if (!Number.isInteger(item) || Number(item) <= 0 || Number(item) > 7 * 24 * 60) return null
      minutes[key] = Number(item)
    }
    return { kind: 'sla', revision: value.revision, screenId: value.screenId, minutes }
  }
  if (value.kind === 'category') {
    const name = text(value.name, 80)
    const description = optionalText(value.description, 500)
    if (!name || description == null || typeof value.active !== 'boolean') return null
    const categoryId = value.recordId == null || value.recordId === '' ? undefined : idValue(value.recordId)
    if (value.recordId != null && value.recordId !== '' && !categoryId) return null
    return { kind: 'category', revision: value.revision, screenId: value.screenId, ...(categoryId ? { recordId: categoryId } : {}), name, description, active: value.active }
  }
  return null
}

function choiceName(fields: readonly Field[], fieldId: string, value: unknown) {
  const field = fields.find(item => item.id === fieldId)
  return field?.type === 'single_select' && typeof value === 'string' ? field.options.choices.find(choice => choice.id === value)?.name ?? '' : ''
}

function choiceIds(fields: readonly Field[], fieldId: string) {
  const field = fields.find(item => item.id === fieldId)
  return field?.type === 'single_select' ? new Set(field.options.choices.map(choice => choice.id)) : new Set<string>()
}

export async function savePublishedSupportAction(slug: string, input: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = readRequest(input)
  if (!parsed) return { ok: false, error: 'Проверьте данные обращения.' }
  try {
    const definition = await publishedV2Definition(slug)
    if (!definition) throw new RowWriteError('missing', 'Приложение недоступно')
    return await writeRows(definition.app.workspaceId, async context => {
      const { app, actor, revision } = await publishedV2Context(slug, context.tx, true)
      if (revision !== parsed.revision) throw new RowWriteError('conflict', 'Приложение обновлено. Обновите страницу.')
      const support = app.support
      if (!support) throw new RowWriteError('denied', 'Это не приложение обращений.')
      if (!actor.authenticated || !actor.id) throw new RowWriteError('denied', 'Для сохранения нужно войти')
      publishedV2Screen(app, actor, parsed.screenId)
      const actorRef = { id: actor.id, kind: 'app_user' as const }
      const now = new Date().toISOString()
      const author = actor.name?.trim() || supportActorEmail(actor)
      const load = async (tableId: string, id: string) => {
        const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, id), eq(rows.tableId, tableId), isNull(rows.deletedAt))).limit(1)
        return stored ? { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> } satisfies AppV2Record : null
      }
      const ticketOf = async (id: string) => {
        const row = await load(support.ticketsTableId, id)
        if (!row) throw new RowWriteError('missing', 'Обращение не найдено.')
        const access = assertTicketAccess(support, actor, row)
        if (!access.ok) throw new RowWriteError('denied', access.error)
        return row
      }
      if (parsed.kind === 'create') {
        const category = await load(support.categoriesTableId, parsed.categoryId)
        if (!category || category.values[support.category.active] !== true) throw new RowWriteError('invalid', 'Выберите доступную категорию.')
        const ticketFields = await mutationFields(context, support.ticketsTableId)
        const priorityId = parsed.priorityId && choiceIds(ticketFields, support.ticket.priority).has(parsed.priorityId) ? parsed.priorityId : support.priorities.normal
        const existing = await context.tx.select({ data: rows.data }).from(rows).where(and(eq(rows.tableId, support.ticketsTableId), isNull(rows.deletedAt)))
        const number = nextTicketNumber(existing.map(row => String((row.data as Record<string, unknown>)[support.ticket.number] ?? '')))
        let clientId: string | undefined
        let clientName = author
        let clientEmail: string | undefined
        if (isSupportDesk(actor)) {
          if (!parsed.clientId) throw new RowWriteError('invalid', 'Выберите клиента.')
          const client = await load(support.clientsTableId, parsed.clientId)
          const email = client?.values[support.client.email]
          const name = client?.values[support.client.name]
          if (!client || typeof email !== 'string' || !email.trim() || typeof name !== 'string' || !name.trim()) throw new RowWriteError('invalid', 'Выберите клиента с именем и почтой.')
          clientId = client.id
          clientName = name.trim()
          clientEmail = email.trim().toLowerCase()
        } else if (!isSupportClient(actor)) throw new RowWriteError('denied', 'Создать обращение может клиент или оператор.')
        const values = ticketCreateValues(support.ticket, {
          number, subject: parsed.subject, description: parsed.description, categoryId: category.id,
          clientId, clientName, clientEmail, statusId: support.statuses.fresh, priorityId, createdAt: now,
        })
        if (parsed.lineId !== undefined && support.ticket.line) values[support.ticket.line] = parsed.lineId ?? ''
        const decision = guardSupportCreate(app, actor, support.ticketsTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        const ticketId = newId('row')
        await createRow(context, support.ticketsTableId, { ...values, ...decision.ownerValues }, actorRef, { id: ticketId, origin: 'runtime' })
        await recordEvent(context, support, { ticketId, kind: 'created', at: now, priority: supportPriorityName(support, priorityId), status: 'Новое', actorEmail: supportActorEmail(actor) }, actorRef)
        return { ok: true as const, message: 'Обращение создано.' }
      }
      if (parsed.kind === 'sla') {
        if (!actor.roleIds.includes('owner') || !support.slaTableId || !support.slaFields) throw new RowWriteError('denied', 'Нормативы меняет руководитель.')
        const [stored] = await context.tx.select().from(rows).where(and(eq(rows.tableId, support.slaTableId), isNull(rows.deletedAt))).limit(1)
        if (!stored) throw new RowWriteError('missing', 'Нормативы не найдены.')
        const current = { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> }
        const values: Record<string, AppV2Json> = {}
        for (const [key, fieldId] of Object.entries(support.slaFields)) {
          const value = parsed.minutes[key]
          if (value == null) throw new RowWriteError('invalid', 'Укажите все нормативы в минутах.')
          values[fieldId] = value
        }
        const decision = guardSupportUpdate(app, actor, current, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, support.slaTableId, current.id, values, actorRef)
        return { ok: true as const, message: 'Нормативы сохранены.' }
      }
      if (parsed.kind === 'category') {
        if (!actor.roleIds.includes('owner')) throw new RowWriteError('denied', 'Категории меняет руководитель.')
        const values = categoryValues(support.category, parsed)
        if (parsed.recordId) {
          const current = await load(support.categoriesTableId, parsed.recordId)
          if (!current) throw new RowWriteError('missing', 'Категория не найдена.')
          const decision = guardSupportUpdate(app, actor, current, values)
          if (!decision.ok) throw new RowWriteError('denied', decision.error)
          await updateRow(context, support.categoriesTableId, current.id, values, actorRef)
        } else {
          const decision = guardSupportCreate(app, actor, support.categoriesTableId, values)
          if (!decision.ok) throw new RowWriteError('denied', decision.error)
          await createRow(context, support.categoriesTableId, values, actorRef, { origin: 'runtime' })
        }
        return { ok: true as const, message: 'Категория сохранена.' }
      }
      if (parsed.kind === 'operator') {
        if (!actor.roleIds.includes('owner')) throw new RowWriteError('denied', 'Операторов меняет руководитель.')
        const values = operatorValues(support.operator, {
          name: parsed.name, email: parsed.email.trim().toLowerCase(), phone: parsed.phone,
          roleId: parsed.roleId, lineId: parsed.lineId, activeId: parsed.activeId,
        })
        if (parsed.recordId) {
          const current = await load(support.operatorsTableId, parsed.recordId)
          if (!current) throw new RowWriteError('missing', 'Оператор не найден.')
          const decision = guardSupportUpdate(app, actor, current, values)
          if (!decision.ok) throw new RowWriteError('denied', decision.error)
          await updateRow(context, support.operatorsTableId, current.id, values, actorRef)
          return { ok: true as const, message: 'Оператор сохранён.' }
        }
        const decision = guardSupportCreate(app, actor, support.operatorsTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, support.operatorsTableId, values, actorRef, { origin: 'runtime' })
        return { ok: true as const, message: 'Оператор добавлен.' }
      }
      if (parsed.kind === 'client_note') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', 'Заметку о клиенте меняет оператор.')
        const client = await load(support.clientsTableId, parsed.recordId)
        if (!client) throw new RowWriteError('missing', 'Клиент не найден.')
        const values = { [support.client.note]: parsed.note }
        const decision = guardSupportUpdate(app, actor, client, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, support.clientsTableId, client.id, values, actorRef)
        return { ok: true as const, message: 'Заметка о клиенте сохранена.' }
      }
      const ticket = await ticketOf(parsed.recordId)
      const ticketFields = await mutationFields(context, support.ticketsTableId)
      const statusName = choiceName(ticketFields, support.ticket.status, ticket.values[support.ticket.status])
      if (parsed.kind === 'note') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', 'Внутренние заметки доступны только оператору.')
        const values = noteValues(support.note, { text: parsed.text, ticketId: ticket.id, at: now, author, authorEmail: supportActorEmail(actor) })
        const decision = guardSupportCreate(app, actor, support.notesTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, support.notesTableId, values, actorRef, { origin: 'runtime' })
        await touchTicket(context, app, actor, support, ticket, actorRef, now)
        return { ok: true as const, message: 'Заметка сохранена. Клиент её не видит.' }
      }
      if (parsed.kind === 'reply') {
        const storedEmail = ticket.values[support.ticket.clientEmail]
        const clientEmail = typeof storedEmail === 'string' ? storedEmail.trim().toLowerCase() : ''
        if (isSupportClient(actor)) {
          const next = assertClientReply(statusName)
          if (!next.ok) throw new RowWriteError('invalid', next.error)
          const values = replyValues(support.reply, { text: parsed.text, ticketId: ticket.id, at: now, author, authorEmail: supportActorEmail(actor) })
          const decision = guardSupportCreate(app, actor, support.repliesTableId, values)
          if (!decision.ok) throw new RowWriteError('denied', decision.error)
          await createRow(context, support.repliesTableId, { ...values, ...decision.ownerValues }, actorRef, { origin: 'runtime' })
          const statusId = Object.entries(support.statuses).find(([, id]) => choiceName(ticketFields, support.ticket.status, id) === next.next)?.[1] ?? support.statuses.progress
          const patch = ticketPatchValues(support.ticket, { statusId, updatedAt: now })
          const update = guardSupportUpdate(app, actor, ticket, patch)
          if (!update.ok) throw new RowWriteError('denied', update.error)
          await updateRow(context, support.ticketsTableId, ticket.id, patch, actorRef)
          if (next.next !== statusName) await recordEvent(context, support, { ticketId: ticket.id, kind: 'status', at: now, priority: supportPriorityName(support, String(ticket.values[support.ticket.priority] ?? '')), status: next.next, actorEmail: supportActorEmail(actor) }, actorRef)
          return { ok: true as const, message: next.next === 'В работе' && statusName !== 'В работе' ? 'Ответ сохранён, обращение снова в работе.' : 'Ответ сохранён.' }
        }
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        const values = replyValues(support.reply, { text: parsed.text, ticketId: ticket.id, at: now, author, authorEmail: supportActorEmail(actor), clientEmail })
        const decision = guardSupportCreate(app, actor, support.repliesTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, support.repliesTableId, values, actorRef, { origin: 'runtime' })
        await touchTicket(context, app, actor, support, ticket, actorRef, now)
        await recordEvent(context, support, { ticketId: ticket.id, kind: 'public_reply', at: now, priority: supportPriorityName(support, String(ticket.values[support.ticket.priority] ?? '')), status: statusName, actorEmail: supportActorEmail(actor) }, actorRef)
        return { ok: true as const, message: 'Ответ клиенту сохранён.' }
      }
      if (parsed.kind === 'status') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        const nextName = choiceName(ticketFields, support.ticket.status, parsed.statusId)
        const allowed = assertOperatorStatus(statusName, nextName)
        if (!allowed.ok) throw new RowWriteError('invalid', allowed.error)
        const patch = ticketPatchValues(support.ticket, { statusId: parsed.statusId, updatedAt: now, ...(await claimValues(context, support, actor, ticket, statusName, nextName)) })
        const decision = guardSupportUpdate(app, actor, ticket, patch)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, support.ticketsTableId, ticket.id, patch, actorRef)
        await recordEvent(context, support, { ticketId: ticket.id, kind: 'status', at: now, priority: supportPriorityName(support, String(ticket.values[support.ticket.priority] ?? '')), status: nextName, actorEmail: supportActorEmail(actor) }, actorRef)
        return { ok: true as const, message: 'Статус сохранён.' }
      }
      const desk = assertDesk(actor)
      if (!desk.ok) throw new RowWriteError('denied', desk.error)
      if (statusName === 'Закрыто') throw new RowWriteError('invalid', 'Закрытое обращение сначала переоткрывают.')
      if (!choiceIds(ticketFields, support.ticket.priority).has(parsed.priorityId)) throw new RowWriteError('invalid', 'Выберите приоритет.')
      const category = await load(support.categoriesTableId, parsed.categoryId)
      if (!category) throw new RowWriteError('invalid', 'Выберите категорию.')
      let assigneeEmail: string | null = null
      if (parsed.assigneeId) {
        const operator = await load(support.operatorsTableId, parsed.assigneeId)
        const email = operator?.values[support.operator.email]
        if (!operator || operator.values[support.operator.active] !== support.activeChoiceId || typeof email !== 'string' || !email.trim()) throw new RowWriteError('invalid', 'Назначьте активного оператора.')
        assigneeEmail = email.trim().toLowerCase()
      }
      const patch = ticketPatchValues(support.ticket, {
        assigneeId: parsed.assigneeId, assigneeEmail, lineId: parsed.lineId, priorityId: parsed.priorityId, categoryId: category.id, deadline: parsed.deadline, updatedAt: now,
      })
      const decision = guardSupportUpdate(app, actor, ticket, patch)
      if (!decision.ok) throw new RowWriteError('denied', decision.error)
      await updateRow(context, support.ticketsTableId, ticket.id, patch, actorRef)
      if (String(ticket.values[support.ticket.priority] ?? '') !== parsed.priorityId) await recordEvent(context, support, { ticketId: ticket.id, kind: 'priority', at: now, priority: supportPriorityName(support, parsed.priorityId), status: statusName, actorEmail: supportActorEmail(actor) }, actorRef)
      return { ok: true as const, message: 'Обращение сохранено.' }
    })
  } catch (error) {
    return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось сохранить обращение.' }
  }
}

async function recordEvent(context: Parameters<typeof createRow>[0], support: SupportApp, input: { ticketId: string; kind: 'created' | 'status' | 'priority' | 'public_reply'; at: string; priority: string; status: string; actorEmail: string }, actorRef: { id: string; kind: 'app_user' }) {
  const event = supportEventRecord(support, input)
  if (!event) return
  await createRow(context, event.tableId, event.values, actorRef, { id: event.id, origin: 'runtime' })
}

async function touchTicket(context: Parameters<typeof updateRow>[0], app: Parameters<typeof guardSupportUpdate>[0], actor: Parameters<typeof guardSupportUpdate>[1], support: SupportApp, ticket: AppV2Record, actorRef: { id: string; kind: 'app_user' }, now: string) {
  const patch = ticketPatchValues(support.ticket, { updatedAt: now })
  const decision = guardSupportUpdate(app, actor, ticket, patch)
  if (!decision.ok) throw new RowWriteError('denied', decision.error)
  await updateRow(context, support.ticketsTableId, ticket.id, patch, actorRef)
}

async function claimValues(context: Parameters<typeof mutationFields>[0], support: SupportApp, actor: Parameters<typeof assertDesk>[0], ticket: AppV2Record, from: string, to: string) {
  if (from !== 'Новое' || to !== 'В работе' || ticket.values[support.ticket.assigneeEmail]) return {}
  const email = supportActorEmail(actor)
  const operators = await context.tx.select().from(rows).where(and(eq(rows.tableId, support.operatorsTableId), isNull(rows.deletedAt)))
  const self = operators.find(row => String((row.data as Record<string, unknown>)[support.operator.email] ?? '').trim().toLowerCase() === email && (row.data as Record<string, unknown>)[support.operator.active] === support.activeChoiceId)
  if (!self) return {}
  return { assigneeId: self.id, assigneeEmail: email }
}
