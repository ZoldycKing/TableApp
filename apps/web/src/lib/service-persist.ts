import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Actor, AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { authorizeAppV2Write, projectAppV2Row } from '@tableapp/schema/app-v2'
import {
  canStaffTransition, clientCanReply, isServiceStatus, nextRepairNumber, sameEmail, type ServiceStatusName,
} from './service-logic'

export type ServiceApp = NonNullable<AppV2['service']>

export function guardServiceUpdate(app: AppV2, actor: AppV2Actor, row: AppV2Record, values: Record<string, AppV2Json>) {
  return authorizeAppV2Write(app, actor, { operation: 'update', row, values })
}

export function guardServiceCreate(app: AppV2, actor: AppV2Actor, tableId: string, values: Record<string, AppV2Json>) {
  return authorizeAppV2Write(app, actor, { operation: 'create', tableId, values })
}

export function isServiceDesk(actor: AppV2Actor) {
  return actor.authenticated && (actor.roleIds.includes('owner') || actor.roleIds.includes('staff'))
}

export function isServiceClient(actor: AppV2Actor) {
  return actor.authenticated && actor.roleIds.includes('client') && !isServiceDesk(actor)
}

export function serviceActorEmail(actor: AppV2Actor) {
  return actor.authenticated && actor.email ? actor.email.trim().toLowerCase() : ''
}

export function ownsServiceRepair(repair: ServiceApp['repair'], row: AppV2Record, actor: AppV2Actor) {
  return sameEmail(row.values[repair.clientEmail], serviceActorEmail(actor))
}

export function projectServiceRows(app: AppV2, actor: AppV2Actor, rows: readonly AppV2Record[]): AppV2Record[] {
  return rows.flatMap(row => {
    const values = projectAppV2Row(app, actor, row)
    return Object.keys(values).length ? [{ ...row, values }] : []
  })
}

export function repairCreateValues(repair: ServiceApp['repair'], input: {
  number: string
  device: string
  serial: string
  problem: string
  clientId: string
  clientName: string
  clientEmail: string
  statusId: string
  deadline?: string | null
  createdAt: string
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {
    [repair.number]: input.number,
    [repair.device]: input.device,
    [repair.serial]: input.serial,
    [repair.problem]: input.problem,
    [repair.client]: [input.clientId],
    [repair.clientName]: input.clientName,
    [repair.clientEmail]: input.clientEmail,
    [repair.status]: input.statusId,
    [repair.createdAt]: input.createdAt,
    [repair.updatedAt]: input.createdAt,
  }
  if (repair.acceptedAt) values[repair.acceptedAt] = input.createdAt
  if (input.deadline) values[repair.deadline] = input.deadline
  return values
}

export function repairPatchValues(repair: ServiceApp['repair'], input: {
  masterId?: string | null
  masterEmail?: string | null
  statusId?: string
  deadline?: string | null
  diagnosis?: string
  work?: string
  parts?: string
  cost?: number | null
  updatedAt: string
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = { [repair.updatedAt]: input.updatedAt }
  if (input.masterId !== undefined) values[repair.master] = input.masterId ? [input.masterId] : []
  if (input.masterEmail !== undefined) values[repair.masterEmail] = input.masterEmail ?? ''
  if (input.statusId) values[repair.status] = input.statusId
  if (input.deadline !== undefined) values[repair.deadline] = input.deadline
  if (input.diagnosis !== undefined) values[repair.diagnosis] = input.diagnosis
  if (input.work !== undefined) values[repair.work] = input.work
  if (input.parts !== undefined) values[repair.parts] = input.parts
  if (input.cost !== undefined) values[repair.cost] = input.cost
  return values
}

export function replyValues(reply: ServiceApp['reply'], input: {
  text: string
  repairId: string
  at: string
  author: string
  authorEmail: string
  clientEmail?: string
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {
    [reply.text]: input.text,
    [reply.repair]: [input.repairId],
    [reply.at]: input.at,
    [reply.author]: input.author,
    [reply.authorEmail]: input.authorEmail,
  }
  if (input.clientEmail) values[reply.clientEmail] = input.clientEmail
  return values
}

export function noteValues(note: ServiceApp['note'], input: {
  text: string
  repairId: string
  at: string
  author: string
  authorEmail: string
}): Record<string, AppV2Json> {
  return {
    [note.text]: input.text,
    [note.repair]: [input.repairId],
    [note.at]: input.at,
    [note.author]: input.author,
    [note.authorEmail]: input.authorEmail,
  }
}

export function assertDesk(actor: AppV2Actor): { ok: true } | { ok: false; error: string } {
  return isServiceDesk(actor) ? { ok: true } : { ok: false, error: 'Это действие доступно мастеру.' }
}

export function assertRepairAccess(service: ServiceApp, actor: AppV2Actor, row: AppV2Record): { ok: true } | { ok: false; error: string } {
  if (isServiceDesk(actor)) return { ok: true }
  if (isServiceClient(actor) && ownsServiceRepair(service.repair, row, actor)) return { ok: true }
  return { ok: false, error: 'Этот ремонт вам недоступен.' }
}

export function assertStaffStatus(from: string, to: string): { ok: true } | { ok: false; error: string } {
  if (!isServiceStatus(from) || !isServiceStatus(to)) return { ok: false, error: 'Неизвестный статус.' }
  if (from === to) return { ok: true }
  return canStaffTransition(from, to) ? { ok: true } : { ok: false, error: 'Такой переход статуса недоступен.' }
}

export function serviceStatusName(service: ServiceApp, id: unknown): ServiceStatusName | '' {
  if (id === service.statuses.fresh) return 'Новые'
  if (id === service.statuses.progress) return 'В работе'
  if (id === service.statuses.waitingParts) return 'Ждём запчасти'
  if (id === service.statuses.ready) return 'Готово к выдаче'
  if (id === service.statuses.done) return 'Выдано'
  if (id === service.statuses.cancelled) return 'Отменён'
  return ''
}

export function serviceStatusId(service: ServiceApp, name: string) {
  if (name === 'Новые') return service.statuses.fresh
  if (name === 'В работе') return service.statuses.progress
  if (name === 'Ждём запчасти') return service.statuses.waitingParts
  if (name === 'Готово к выдаче') return service.statuses.ready
  if (name === 'Выдано') return service.statuses.done
  if (name === 'Отменён') return service.statuses.cancelled
  return ''
}

const textOf = (value: unknown) => typeof value === 'string' ? value : ''

export type ServiceChange =
  | { kind: 'create'; clientId: string; device: string; serial: string; problem: string; deadline?: string | null }
  | { kind: 'reply'; recordId: string; text: string }
  | { kind: 'note'; recordId: string; text: string }
  | { kind: 'status'; recordId: string; statusId: string }
  | { kind: 'assign'; recordId: string; masterId: string | null; statusId?: string; deadline?: string | null; diagnosis?: string; work?: string; parts?: string; cost?: number | null }

/** In-memory twin of the published action for gallery demos. */
export function applyServiceChange(app: AppV2, actor: AppV2Actor, rows: readonly AppV2Record[], change: ServiceChange, now: string): { ok: true; rows: AppV2Record[]; message: string } | { ok: false; error: string } {
  const service = app.service
  if (!service || !actor.authenticated) return { ok: false, error: 'Для сохранения нужно войти' }
  const replace = (row: AppV2Record, values: Record<string, AppV2Json>) => rows.map(item => item.id === row.id ? { ...item, values: { ...item.values, ...values } } : item)
  const repairRow = (id: string) => rows.find(row => row.id === id && row.tableId === service.repairsTableId)
  if (change.kind === 'create') {
    const desk = assertDesk(actor)
    if (!desk.ok) return desk
    const client = rows.find(row => row.id === change.clientId && row.tableId === service.clientsTableId)
    const email = textOf(client?.values[service.client.email]).trim()
    const name = textOf(client?.values[service.client.name]).trim()
    if (!client || !email || !name) return { ok: false, error: 'Выберите клиента с именем и почтой.' }
    const number = nextRepairNumber(rows.filter(row => row.tableId === service.repairsTableId).map(row => textOf(row.values[service.repair.number])))
    const values = repairCreateValues(service.repair, {
      number, device: change.device.trim(), serial: change.serial.trim(), problem: change.problem.trim(),
      clientId: client.id, clientName: name, clientEmail: email.toLowerCase(),
      statusId: service.statuses.fresh, deadline: change.deadline, createdAt: now,
    })
    const decision = guardServiceCreate(app, actor, service.repairsTableId, values)
    if (!decision.ok) return decision
    return { ok: true, rows: [...rows, { id: newId('row'), tableId: service.repairsTableId, values }], message: 'Ремонт принят.' }
  }
  const repair = repairRow(change.recordId)
  if (!repair) return { ok: false, error: 'Ремонт не найден.' }
  const access = assertRepairAccess(service, actor, repair)
  if (!access.ok) return access
  const statusName = serviceStatusName(service, repair.values[service.repair.status])
  const author = actor.name?.trim() || serviceActorEmail(actor)
  if (change.kind === 'note') {
    const desk = assertDesk(actor)
    if (!desk.ok) return { ok: false, error: 'Внутренние заметки доступны только мастеру.' }
    const values = noteValues(service.note, { text: change.text.trim(), repairId: repair.id, at: now, author, authorEmail: serviceActorEmail(actor) })
    const decision = guardServiceCreate(app, actor, service.notesTableId, values)
    if (!decision.ok) return decision
    const patch = repairPatchValues(service.repair, { updatedAt: now })
    const update = guardServiceUpdate(app, actor, repair, patch)
    if (!update.ok) return update
    return { ok: true, rows: [...replace(repair, patch), { id: newId('row'), tableId: service.notesTableId, values }], message: 'Заметка сохранена. Клиент её не видит.' }
  }
  if (change.kind === 'reply') {
    const clientEmail = textOf(repair.values[service.repair.clientEmail]).trim().toLowerCase()
    if (isServiceClient(actor)) {
      if (!clientCanReply(statusName)) return { ok: false, error: 'Ответить в этом статусе нельзя.' }
      const values = replyValues(service.reply, { text: change.text.trim(), repairId: repair.id, at: now, author, authorEmail: serviceActorEmail(actor) })
      const decision = guardServiceCreate(app, actor, service.repliesTableId, values)
      if (!decision.ok) return decision
      const patch = repairPatchValues(service.repair, { updatedAt: now })
      const update = guardServiceUpdate(app, actor, repair, patch)
      if (!update.ok) return update
      return { ok: true, rows: [...replace(repair, patch), { id: newId('row'), tableId: service.repliesTableId, values: { ...values, ...decision.ownerValues } }], message: 'Ответ сохранён.' }
    }
    const desk = assertDesk(actor)
    if (!desk.ok) return desk
    const values = replyValues(service.reply, { text: change.text.trim(), repairId: repair.id, at: now, author, authorEmail: serviceActorEmail(actor), clientEmail })
    const decision = guardServiceCreate(app, actor, service.repliesTableId, values)
    if (!decision.ok) return decision
    const patch = repairPatchValues(service.repair, { updatedAt: now })
    const update = guardServiceUpdate(app, actor, repair, patch)
    if (!update.ok) return update
    return { ok: true, rows: [...replace(repair, patch), { id: newId('row'), tableId: service.repliesTableId, values }], message: 'Ответ клиенту сохранён.' }
  }
  if (change.kind === 'status') {
    const desk = assertDesk(actor)
    if (!desk.ok) return desk
    const nextName = serviceStatusName(service, change.statusId)
    const allowed = assertStaffStatus(statusName, nextName)
    if (!allowed.ok) return allowed
    let masterId: string | undefined
    let masterEmail: string | undefined
    if (statusName === 'Новые' && nextName === 'В работе' && !textOf(repair.values[service.repair.masterEmail]).trim()) {
      const email = serviceActorEmail(actor)
      const self = rows.find(row => row.tableId === service.mastersTableId && sameEmail(row.values[service.master.email], email) && row.values[service.master.active] === service.activeChoiceId)
      if (self) { masterId = self.id; masterEmail = email }
    }
    const patch = repairPatchValues(service.repair, { statusId: change.statusId, updatedAt: now, ...(masterId ? { masterId, masterEmail } : {}) })
    const decision = guardServiceUpdate(app, actor, repair, patch)
    if (!decision.ok) return decision
    return { ok: true, rows: replace(repair, patch), message: 'Статус сохранён.' }
  }
  const desk = assertDesk(actor)
  if (!desk.ok) return desk
  if (statusName === 'Отменён' || statusName === 'Выдано') {
    if (change.statusId) {
      const nextName = serviceStatusName(service, change.statusId)
      const allowed = assertStaffStatus(statusName, nextName)
      if (!allowed.ok) return allowed
    } else if (statusName === 'Отменён') return { ok: false, error: 'Отменённый ремонт сначала возвращают в «Новые».' }
  }
  let masterEmail: string | null = null
  if (change.masterId) {
    const master = rows.find(row => row.id === change.masterId && row.tableId === service.mastersTableId)
    const email = textOf(master?.values[service.master.email]).trim()
    if (!master || master.values[service.master.active] !== service.activeChoiceId || !email) return { ok: false, error: 'Назначьте активного мастера.' }
    masterEmail = email.toLowerCase()
  }
  if (change.statusId) {
    const nextName = serviceStatusName(service, change.statusId)
    const allowed = assertStaffStatus(statusName, nextName)
    if (!allowed.ok) return allowed
  }
  const patch = repairPatchValues(service.repair, {
    masterId: change.masterId, masterEmail, statusId: change.statusId, deadline: change.deadline,
    diagnosis: change.diagnosis, work: change.work, parts: change.parts, cost: change.cost, updatedAt: now,
  })
  const decision = guardServiceUpdate(app, actor, repair, patch)
  if (!decision.ok) return decision
  return { ok: true, rows: replace(repair, patch), message: 'Ремонт сохранён.' }
}
