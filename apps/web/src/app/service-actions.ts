'use server'
import { rows } from '@tableapp/db'
import type { Field } from '@tableapp/schema'
import type { AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { and, eq, isNull } from 'drizzle-orm'
import { publishedV2Context, publishedV2Definition, publishedV2Screen } from '@/lib/builder-v2-published'
import { nextRepairNumber } from '@/lib/service-logic'
import {
  assertDesk, assertRepairAccess, assertStaffStatus, guardServiceCreate, guardServiceUpdate,
  isServiceClient, noteValues, repairCreateValues, repairPatchValues, replyValues,
  serviceActorEmail, type ServiceApp,
} from '@/lib/service-persist'
import { RowWriteError, createRow, mutationFields, updateRow, writeRows } from '@/lib/row-mutations'

type CreateRequest = { kind: 'create'; revision: string; screenId: string; clientId: string; device: string; serial: string; problem: string; deadline: string | null }
type ReplyRequest = { kind: 'reply'; revision: string; screenId: string; recordId: string; text: string }
type NoteRequest = { kind: 'note'; revision: string; screenId: string; recordId: string; text: string }
type StatusRequest = { kind: 'status'; revision: string; screenId: string; recordId: string; statusId: string }
type AssignRequest = {
  kind: 'assign'; revision: string; screenId: string; recordId: string; masterId: string | null
  statusId?: string; deadline?: string | null; diagnosis?: string; work?: string; parts?: string; cost?: number | null
}
type Request = CreateRequest | ReplyRequest | NoteRequest | StatusRequest | AssignRequest

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
const optionalText = (value: unknown, max: number) => value == null || value === '' ? '' : typeof value === 'string' && value.trim().length <= max ? value.trim() : null
const idValue = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 80 ? value : null
const instant = (value: unknown) => value === null ? null : typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined
const money = (value: unknown) => value == null || value === '' ? null : typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

function readRequest(input: unknown): Request | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  if (typeof value.revision !== 'string' || value.revision.length < 8 || typeof value.screenId !== 'string' || !value.kind || typeof value.kind !== 'string') return null
  if (value.kind === 'create') {
    const clientId = idValue(value.clientId), device = text(value.device, 200), problem = text(value.problem, 4000)
    const serial = optionalText(value.serial, 120)
    const deadline = instant(value.deadline)
    if (!clientId || !device || !problem || serial == null || deadline === undefined) return null
    return { kind: 'create', revision: value.revision, screenId: value.screenId, clientId, device, serial, problem, deadline }
  }
  const recordId = idValue(value.recordId)
  if (value.kind === 'reply' || value.kind === 'note') {
    const body = text(value.text, 4000)
    if (!recordId || !body) return null
    return { kind: value.kind, revision: value.revision, screenId: value.screenId, recordId, text: body }
  }
  if (value.kind === 'status') {
    const statusId = idValue(value.statusId)
    if (!recordId || !statusId) return null
    return { kind: 'status', revision: value.revision, screenId: value.screenId, recordId, statusId }
  }
  if (value.kind === 'assign') {
    const masterId = value.masterId == null || value.masterId === '' ? null : idValue(value.masterId)
    if (!recordId || (value.masterId != null && value.masterId !== '' && !masterId)) return null
    const statusId = value.statusId == null || value.statusId === '' ? undefined : idValue(value.statusId)
    if (value.statusId != null && value.statusId !== '' && !statusId) return null
    const deadline = value.deadline === undefined ? undefined : instant(value.deadline)
    if (value.deadline !== undefined && deadline === undefined) return null
    const diagnosis = value.diagnosis === undefined ? undefined : optionalText(value.diagnosis, 4000)
    const work = value.work === undefined ? undefined : optionalText(value.work, 4000)
    const parts = value.parts === undefined ? undefined : optionalText(value.parts, 4000)
    if (diagnosis === null || work === null || parts === null) return null
    const cost = value.cost === undefined ? undefined : money(value.cost)
    if (value.cost !== undefined && cost === undefined) return null
    return {
      kind: 'assign', revision: value.revision, screenId: value.screenId, recordId, masterId,
      ...(statusId ? { statusId } : {}), ...(deadline !== undefined ? { deadline } : {}),
      ...(diagnosis !== undefined ? { diagnosis } : {}), ...(work !== undefined ? { work } : {}),
      ...(parts !== undefined ? { parts } : {}), ...(cost !== undefined ? { cost } : {}),
    }
  }
  return null
}

function choiceName(fields: readonly Field[], fieldId: string, value: unknown) {
  const field = fields.find(item => item.id === fieldId)
  return field?.type === 'single_select' && typeof value === 'string' ? field.options.choices.find(choice => choice.id === value)?.name ?? '' : ''
}

export async function savePublishedServiceAction(slug: string, input: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = readRequest(input)
  if (!parsed) return { ok: false, error: 'Проверьте данные ремонта.' }
  try {
    const definition = await publishedV2Definition(slug)
    if (!definition) throw new RowWriteError('missing', 'Приложение недоступно')
    return await writeRows(definition.app.workspaceId, async context => {
      const { app, actor, revision } = await publishedV2Context(slug, context.tx, true)
      if (revision !== parsed.revision) throw new RowWriteError('conflict', 'Приложение обновлено. Обновите страницу.')
      const service = app.service
      if (!service) throw new RowWriteError('denied', 'Это не приложение сервиса.')
      if (!actor.authenticated || !actor.id) throw new RowWriteError('denied', 'Для сохранения нужно войти')
      publishedV2Screen(app, actor, parsed.screenId)
      const actorRef = { id: actor.id, kind: 'app_user' as const }
      const now = new Date().toISOString()
      const author = actor.name?.trim() || serviceActorEmail(actor)
      const load = async (tableId: string, id: string) => {
        const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, id), eq(rows.tableId, tableId), isNull(rows.deletedAt))).limit(1)
        return stored ? { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> } satisfies AppV2Record : null
      }
      const repairOf = async (id: string) => {
        const row = await load(service.repairsTableId, id)
        if (!row) throw new RowWriteError('missing', 'Ремонт не найден.')
        const access = assertRepairAccess(service, actor, row)
        if (!access.ok) throw new RowWriteError('denied', access.error)
        return row
      }
      if (parsed.kind === 'create') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        const client = await load(service.clientsTableId, parsed.clientId)
        const email = client?.values[service.client.email]
        const name = client?.values[service.client.name]
        if (!client || typeof email !== 'string' || !email.trim() || typeof name !== 'string' || !name.trim()) throw new RowWriteError('invalid', 'Выберите клиента с именем и почтой.')
        const existing = await context.tx.select({ data: rows.data }).from(rows).where(and(eq(rows.tableId, service.repairsTableId), isNull(rows.deletedAt)))
        const number = nextRepairNumber(existing.map(row => String((row.data as Record<string, unknown>)[service.repair.number] ?? '')))
        const values = repairCreateValues(service.repair, {
          number, device: parsed.device, serial: parsed.serial, problem: parsed.problem,
          clientId: client.id, clientName: name.trim(), clientEmail: email.trim().toLowerCase(),
          statusId: service.statuses.fresh, deadline: parsed.deadline, createdAt: now,
        })
        const decision = guardServiceCreate(app, actor, service.repairsTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, service.repairsTableId, values, actorRef, { origin: 'runtime' })
        return { ok: true as const, message: 'Ремонт принят.' }
      }
      const repair = await repairOf(parsed.recordId)
      const repairFields = await mutationFields(context, service.repairsTableId)
      const statusName = choiceName(repairFields, service.repair.status, repair.values[service.repair.status])
      if (parsed.kind === 'note') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', 'Внутренние заметки доступны только мастеру.')
        const values = noteValues(service.note, { text: parsed.text, repairId: repair.id, at: now, author, authorEmail: serviceActorEmail(actor) })
        const decision = guardServiceCreate(app, actor, service.notesTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, service.notesTableId, values, actorRef, { origin: 'runtime' })
        await touchRepair(context, app, actor, service, repair, actorRef, now)
        return { ok: true as const, message: 'Заметка сохранена. Клиент её не видит.' }
      }
      if (parsed.kind === 'reply') {
        const storedEmail = repair.values[service.repair.clientEmail]
        const clientEmail = typeof storedEmail === 'string' ? storedEmail.trim().toLowerCase() : ''
        if (isServiceClient(actor)) {
          const values = replyValues(service.reply, { text: parsed.text, repairId: repair.id, at: now, author, authorEmail: serviceActorEmail(actor) })
          const decision = guardServiceCreate(app, actor, service.repliesTableId, values)
          if (!decision.ok) throw new RowWriteError('denied', decision.error)
          await createRow(context, service.repliesTableId, { ...values, ...decision.ownerValues }, actorRef, { origin: 'runtime' })
          await touchRepair(context, app, actor, service, repair, actorRef, now)
          return { ok: true as const, message: 'Ответ сохранён.' }
        }
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        const values = replyValues(service.reply, { text: parsed.text, repairId: repair.id, at: now, author, authorEmail: serviceActorEmail(actor), clientEmail })
        const decision = guardServiceCreate(app, actor, service.repliesTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, service.repliesTableId, values, actorRef, { origin: 'runtime' })
        await touchRepair(context, app, actor, service, repair, actorRef, now)
        return { ok: true as const, message: 'Ответ клиенту сохранён.' }
      }
      if (parsed.kind === 'status') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        const nextName = choiceName(repairFields, service.repair.status, parsed.statusId)
        const allowed = assertStaffStatus(statusName, nextName)
        if (!allowed.ok) throw new RowWriteError('invalid', allowed.error)
        const patch = repairPatchValues(service.repair, {
          statusId: parsed.statusId, updatedAt: now,
          ...(await claimValues(context, service, actor, repair, statusName, nextName)),
        })
        const decision = guardServiceUpdate(app, actor, repair, patch)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, service.repairsTableId, repair.id, patch, actorRef)
        return { ok: true as const, message: 'Статус сохранён.' }
      }
      const desk = assertDesk(actor)
      if (!desk.ok) throw new RowWriteError('denied', desk.error)
      if (parsed.statusId) {
        const nextName = choiceName(repairFields, service.repair.status, parsed.statusId)
        const allowed = assertStaffStatus(statusName, nextName)
        if (!allowed.ok) throw new RowWriteError('invalid', allowed.error)
      }
      let masterEmail: string | null = null
      if (parsed.masterId) {
        const master = await load(service.mastersTableId, parsed.masterId)
        const email = master?.values[service.master.email]
        if (!master || master.values[service.master.active] !== service.activeChoiceId || typeof email !== 'string' || !email.trim()) throw new RowWriteError('invalid', 'Назначьте активного мастера.')
        masterEmail = email.trim().toLowerCase()
      }
      const patch = repairPatchValues(service.repair, {
        masterId: parsed.masterId, masterEmail, statusId: parsed.statusId, deadline: parsed.deadline,
        diagnosis: parsed.diagnosis, work: parsed.work, parts: parsed.parts, cost: parsed.cost, updatedAt: now,
      })
      const decision = guardServiceUpdate(app, actor, repair, patch)
      if (!decision.ok) throw new RowWriteError('denied', decision.error)
      await updateRow(context, service.repairsTableId, repair.id, patch, actorRef)
      return { ok: true as const, message: 'Ремонт сохранён.' }
    })
  } catch (error) {
    return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось сохранить ремонт.' }
  }
}

async function touchRepair(context: Parameters<typeof updateRow>[0], app: Parameters<typeof guardServiceUpdate>[0], actor: Parameters<typeof guardServiceUpdate>[1], service: ServiceApp, repair: AppV2Record, actorRef: { id: string; kind: 'app_user' }, now: string) {
  const patch = repairPatchValues(service.repair, { updatedAt: now })
  const decision = guardServiceUpdate(app, actor, repair, patch)
  if (!decision.ok) throw new RowWriteError('denied', decision.error)
  await updateRow(context, service.repairsTableId, repair.id, patch, actorRef)
}

async function claimValues(context: Parameters<typeof mutationFields>[0], service: ServiceApp, actor: Parameters<typeof assertDesk>[0], repair: AppV2Record, from: string, to: string) {
  if (from !== 'Новые' || to !== 'В работе' || repair.values[service.repair.masterEmail]) return {}
  const email = serviceActorEmail(actor)
  const masters = await context.tx.select().from(rows).where(and(eq(rows.tableId, service.mastersTableId), isNull(rows.deletedAt)))
  const self = masters.find(row => String((row.data as Record<string, unknown>)[service.master.email] ?? '').trim().toLowerCase() === email && (row.data as Record<string, unknown>)[service.master.active] === service.activeChoiceId)
  if (!self) return {}
  return { masterId: self.id, masterEmail: email }
}
