'use server'
import { apps, rows } from '@tableapp/db'
import type { Field } from '@tableapp/schema'
import type { AppV2, AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { and, eq, isNull } from 'drizzle-orm'
import { publishedV2Context, publishedV2Definition, publishedV2Screen } from '@/lib/builder-v2-published'
import { ensureProkatHoldKit } from '@/lib/prokat-hold-ensure'
import {
  extendHoldUntil, findItemBookingConflict, holdUntilFromStart, isHoldEligibleStatus, isProkatHoldMinutes,
  nextBookingNumber, PROKAT_NOT_PICKED_UP_CHAT, PROKAT_NOT_PICKED_UP_REASON_MANUAL,
  resolveBookingHoldUntil, type ProkatHoldAfterStartMinutes,
} from '@/lib/prokat-logic'
import {
  assertBookingAccess, assertClient, assertDesk, assertStaffStatus, bookingCreateValues,
  bookingIssueValues, bookingReturnValues, bookingSpansFromRows, guardProkatCreate, guardProkatUpdate,
  isProkatClient, prokatActorEmail, prokatHoldMinutes, prokatStatusName, stampBookingHoldUntil,
} from '@/lib/prokat-persist'
import { RowWriteError, createRow, lockedRow, checkRow, mutationFields, updateRow, writeRows } from '@/lib/row-mutations'
import { conversations, conversationMessages } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { createHash, randomUUID } from 'node:crypto'

type CreateRequest = { kind: 'create'; revision: string; screenId: string; clientId: string; itemIds: string[]; title: string; from: string; to: string; price: number; deposit: number }
type ClientRequest = { kind: 'clientRequest'; revision: string; screenId: string; itemIds: string[]; title: string; from: string; to: string; price: number; deposit: number; clientName: string }
type ConfirmRequest = { kind: 'confirm'; revision: string; screenId: string; recordId: string }
type CancelRequest = { kind: 'cancel'; revision: string; screenId: string; recordId: string }
type IssueRequest = { kind: 'issue'; revision: string; screenId: string; recordId: string; condition: string; damages: string; photos?: string }
type ReturnRequest = {
  kind: 'return'; revision: string; screenId: string; recordId: string; condition: string; damages: string; photos?: AppV2Json
  lateFee?: number; depositReturned?: number; depositWithheld?: number; depositReason?: string
}
type StatusRequest = { kind: 'status'; revision: string; screenId: string; recordId: string; statusId: string }
type ExtendHoldRequest = { kind: 'extendHold'; revision: string; screenId: string; recordId: string }
type MarkNotPickedUpRequest = { kind: 'markNotPickedUp'; revision: string; screenId: string; recordId: string }
type HoldSettingRequest = { kind: 'holdSetting'; revision: string; screenId: string; holdAfterStartMinutes: ProkatHoldAfterStartMinutes }
type ItemPatchRequest = { kind: 'itemPatch'; revision: string; screenId: string; recordId: string; values: Record<string, AppV2Json> }
type Request = CreateRequest | ClientRequest | ConfirmRequest | CancelRequest | IssueRequest | ReturnRequest | StatusRequest | ExtendHoldRequest | MarkNotPickedUpRequest | HoldSettingRequest | ItemPatchRequest

const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
const optionalText = (value: unknown, max: number) => value == null || value === '' ? '' : typeof value === 'string' && value.trim().length <= max ? value.trim() : null
const idValue = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 80 ? value : null
const instant = (value: unknown) => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
const ids = (value: unknown) => Array.isArray(value) ? value.map(idValue).filter((id): id is string => Boolean(id)) : null

function readRequest(input: unknown): Request | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  if (typeof value.revision !== 'string' || value.revision.length < 8 || typeof value.screenId !== 'string' || !value.kind || typeof value.kind !== 'string') return null
  if (value.kind === 'create' || value.kind === 'clientRequest') {
    const itemIds = ids(value.itemIds)
    const title = text(value.title, 400) ?? ''
    const from = instant(value.from)
    const to = instant(value.to)
    const price = money(value.price)
    const deposit = money(value.deposit)
    if (!itemIds?.length || !from || !to || price === undefined || deposit === undefined) return null
    if (value.kind === 'create') {
      const clientId = idValue(value.clientId)
      if (!clientId) return null
      return { kind: 'create', revision: value.revision, screenId: value.screenId, clientId, itemIds, title, from, to, price, deposit }
    }
    const clientName = optionalText(value.clientName, 200)
    if (clientName == null) return null
    return { kind: 'clientRequest', revision: value.revision, screenId: value.screenId, itemIds, title, from, to, price, deposit, clientName }
  }
  if (value.kind === 'holdSetting') {
    const minutes = value.holdAfterStartMinutes
    if (!(minutes === null || (typeof minutes === 'number' && isProkatHoldMinutes(minutes)))) return null
    return { kind: 'holdSetting', revision: value.revision, screenId: value.screenId, holdAfterStartMinutes: minutes }
  }
  const recordId = idValue(value.recordId)
  if (!recordId) return null
  if (value.kind === 'itemPatch') {
    if (!value.values || typeof value.values !== 'object' || Array.isArray(value.values)) return null
    const values: Record<string, AppV2Json> = {}
    for (const [key, entry] of Object.entries(value.values as Record<string, unknown>)) {
      if (!idValue(key)) return null
      if (typeof entry === 'boolean' || typeof entry === 'number' || typeof entry === 'string' || entry === null) {
        values[key] = entry as AppV2Json
        continue
      }
      return null
    }
    if (!Object.keys(values).length) return null
    return { kind: 'itemPatch', revision: value.revision, screenId: value.screenId, recordId, values }
  }
  if (value.kind === 'confirm' || value.kind === 'cancel' || value.kind === 'extendHold' || value.kind === 'markNotPickedUp') {
    return { kind: value.kind, revision: value.revision, screenId: value.screenId, recordId }
  }
  if (value.kind === 'status') {
    const statusId = idValue(value.statusId)
    if (!statusId) return null
    return { kind: 'status', revision: value.revision, screenId: value.screenId, recordId, statusId }
  }
  if (value.kind === 'issue') {
    const condition = text(value.condition, 4000)
    const damages = optionalText(value.damages, 4000)
    const photos = value.photos === undefined ? undefined : optionalText(value.photos, 20_000)
    if (!condition || damages == null || photos === null) return null
    return { kind: 'issue', revision: value.revision, screenId: value.screenId, recordId, condition, damages, ...(photos !== undefined ? { photos } : {}) }
  }
  if (value.kind === 'return') {
    const condition = text(value.condition, 4000)
    const damages = optionalText(value.damages, 4000)
    if (!condition || damages == null) return null
    let photos: AppV2Json | undefined
    if (value.photos !== undefined) {
      if (!Array.isArray(value.photos) || value.photos.length > 12) return null
      photos = value.photos as AppV2Json
    }
    const lateFee = value.lateFee === undefined ? undefined : money(value.lateFee)
    const depositReturned = value.depositReturned === undefined ? undefined : money(value.depositReturned)
    const depositWithheld = value.depositWithheld === undefined ? undefined : money(value.depositWithheld)
    if (value.lateFee !== undefined && lateFee === undefined) return null
    if (value.depositReturned !== undefined && depositReturned === undefined) return null
    if (value.depositWithheld !== undefined && depositWithheld === undefined) return null
    let depositReason: string | undefined
    if (value.depositReason !== undefined) {
      const parsed = optionalText(value.depositReason, 2000)
      if (parsed === null) return null
      depositReason = parsed
    }
    const result: ReturnRequest = {
      kind: 'return', revision: value.revision, screenId: value.screenId, recordId, condition, damages,
    }
    if (photos !== undefined) result.photos = photos
    if (lateFee !== undefined) result.lateFee = lateFee
    if (depositReturned !== undefined) result.depositReturned = depositReturned
    if (depositWithheld !== undefined) result.depositWithheld = depositWithheld
    if (depositReason !== undefined) result.depositReason = depositReason
    return result
  }
  return null
}

function choiceName(fields: readonly Field[], fieldId: string, value: unknown) {
  const field = fields.find(item => item.id === fieldId)
  return field?.type === 'single_select' && typeof value === 'string' ? field.options.choices.find(choice => choice.id === value)?.name ?? '' : ''
}

const textOf = (value: unknown) => typeof value === 'string' ? value : ''
const idsOf = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

export async function savePublishedProkatAction(slug: string, input: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = readRequest(input)
  if (!parsed) return { ok: false, error: 'Проверьте данные брони.' }
  try {
    const definition = await publishedV2Definition(slug)
    if (!definition) throw new RowWriteError('missing', 'Приложение недоступно')
    return await writeRows(definition.app.workspaceId, async context => {
      let { app, actor, revision } = await publishedV2Context(slug, context.tx, true)
      if (revision !== parsed.revision) throw new RowWriteError('conflict', 'Приложение обновлено. Обновите страницу.')
      if (!app.prokat) throw new RowWriteError('denied', 'Это не приложение проката.')
      app = await ensureProkatHoldKit(context.tx, app)
      const prokat = app.prokat!
      if (!actor.authenticated || !actor.id) throw new RowWriteError('denied', 'Для сохранения нужно войти')
      publishedV2Screen(app, actor, parsed.screenId)
      const actorRef = { id: actor.id, kind: 'app_user' as const }
      const now = new Date().toISOString()
      const nowMs = Date.parse(now)
      const load = async (tableId: string, id: string) => {
        const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, id), eq(rows.tableId, tableId), isNull(rows.deletedAt))).limit(1)
        return stored ? { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> } satisfies AppV2Record : null
      }
      const bookingOf = async (id: string) => {
        const row = await load(prokat.bookingsTableId, id)
        if (!row) throw new RowWriteError('missing', 'Бронь не найдена.')
        const access = assertBookingAccess(prokat, actor, row)
        if (!access.ok) throw new RowWriteError('denied', access.error)
        return row
      }
      const loadSpans = async () => {
        const stored = await context.tx.select().from(rows).where(and(eq(rows.tableId, prokat.bookingsTableId), isNull(rows.deletedAt)))
        const records = stored.map(row => ({ id: row.id, tableId: row.tableId, values: row.data as Record<string, AppV2Json> }) satisfies AppV2Record)
        return bookingSpansFromRows(prokat, records)
      }
      const itemTitle = async (itemIds: readonly string[]) => {
        const names: string[] = []
        for (const id of itemIds) {
          const item = await load(prokat.itemsTableId, id)
          const name = textOf(item?.values[prokat.item.name]).trim()
          if (name) names.push(name)
        }
        return names.join(', ') || 'Прокат'
      }

      if (parsed.kind === 'holdSetting') {
        if (!actor.roleIds.includes('owner')) throw new RowWriteError('denied', 'Настройку окна брони меняет руководитель.')
        if (!isProkatHoldMinutes(parsed.holdAfterStartMinutes)) throw new RowWriteError('invalid', 'Выберите допустимое окно.')
        const nextProkat = { ...prokat, holdAfterStartMinutes: parsed.holdAfterStartMinutes }
        const nextApp = { ...app, prokat: nextProkat } satisfies AppV2
        const [row] = await context.tx.select({ published: apps.published, draft: apps.draft }).from(apps).where(eq(apps.id, app.id)).limit(1)
        const patchDefinition = (definition: unknown) => {
          if (!definition || typeof definition !== 'object') return nextApp
          const current = definition as AppV2
          if (!current.prokat) return nextApp
          return { ...current, prokat: { ...current.prokat, holdAfterStartMinutes: parsed.holdAfterStartMinutes } }
        }
        await context.tx.update(apps).set({
          published: patchDefinition(row?.published) as AppV2,
          draft: patchDefinition(row?.draft) as AppV2,
        }).where(eq(apps.id, app.id))
        return { ok: true as const, message: 'Окно брони сохранено.' }
      }

      if (parsed.kind === 'itemPatch') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        const item = await load(prokat.itemsTableId, parsed.recordId)
        if (!item) throw new RowWriteError('missing', 'Предмет не найден.')
        const allowed = new Set([
          prokat.item.showInCatalog, prokat.item.lateFeeMode, prokat.item.lateFeeValue,
          prokat.item.lateFeeGraceHours, prokat.item.lateFeeCapPerDay, prokat.item.condition, prokat.item.status,
        ].filter((id): id is string => Boolean(id)))
        const patch: Record<string, AppV2Json> = {}
        for (const [key, entry] of Object.entries(parsed.values)) {
          if (!allowed.has(key)) throw new RowWriteError('denied', 'Это поле предмета нельзя менять здесь.')
          patch[key] = entry
        }
        const decision = guardProkatUpdate(app, actor, item, patch)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, prokat.itemsTableId, item.id, patch, actorRef)
        return { ok: true as const, message: 'Параметры предмета сохранены.' }
      }

      if (parsed.kind === 'create' || parsed.kind === 'clientRequest') {
        const spans = await loadSpans()
        const conflict = findItemBookingConflict(spans, parsed.itemIds, parsed.from, parsed.to)
        if (conflict) throw new RowWriteError('invalid', `Предмет уже занят в брони ${conflict.number}.`)

        let clientId = ''
        let clientName = ''
        let clientEmail = ''
        let statusId = prokat.statuses.request

        if (parsed.kind === 'create') {
          const desk = assertDesk(actor)
          if (!desk.ok) throw new RowWriteError('denied', desk.error)
          const client = await load(prokat.clientsTableId, parsed.clientId)
          clientEmail = textOf(client?.values[prokat.client.email]).trim().toLowerCase()
          clientName = textOf(client?.values[prokat.client.name]).trim()
          if (!client || !clientEmail || !clientName) throw new RowWriteError('invalid', 'Выберите клиента с именем и почтой.')
          clientId = client.id
          statusId = prokat.statuses.confirmed
        } else {
          const clientOk = assertClient(actor)
          if (!clientOk.ok) throw new RowWriteError('denied', clientOk.error)
          clientEmail = prokatActorEmail(actor)
          clientName = parsed.clientName.trim() || actor.name?.trim() || clientEmail
          if (!clientEmail) throw new RowWriteError('denied', 'Нужна подтверждённая почта.')
          const clients = await context.tx.select().from(rows).where(and(eq(rows.tableId, prokat.clientsTableId), isNull(rows.deletedAt)))
          const existing = clients.find(row => textOf((row.data as Record<string, unknown>)[prokat.client.email]).trim().toLowerCase() === clientEmail)
          if (existing) {
            clientId = existing.id
            if (!clientName) clientName = textOf((existing.data as Record<string, unknown>)[prokat.client.name]).trim() || clientEmail
          } else {
            const createdValues: Record<string, AppV2Json> = {
              [prokat.client.name]: clientName,
              [prokat.client.phone]: '',
            }
            const clientCreate = guardProkatCreate(app, actor, prokat.clientsTableId, createdValues)
            if (!clientCreate.ok) throw new RowWriteError('denied', clientCreate.error)
            const created = await createRow(context, prokat.clientsTableId, {
              ...createdValues,
              [prokat.client.email]: clientEmail,
              ...clientCreate.ownerValues,
            }, actorRef, { origin: 'runtime' })
            clientId = created.id
          }
        }

        const existing = await context.tx.select({ data: rows.data }).from(rows).where(and(eq(rows.tableId, prokat.bookingsTableId), isNull(rows.deletedAt)))
        const number = nextBookingNumber(existing.map(row => String((row.data as Record<string, unknown>)[prokat.booking.number] ?? '')))
        const title = parsed.title.trim() || await itemTitle(parsed.itemIds)
        const values = bookingCreateValues(prokat.booking, {
          number, title, clientId, clientName, clientEmail,
          itemIds: parsed.itemIds, from: parsed.from, to: parsed.to, price: parsed.price, deposit: parsed.deposit,
          statusId, createdAt: now, holdUntil: holdUntilFromStart(parsed.from, prokatHoldMinutes(prokat)),
        })
        // Owner-stamped clientEmail must not appear in the authorize payload for clients.
        const authorizeValues = parsed.kind === 'clientRequest'
          ? Object.fromEntries(Object.entries(values).filter(([key]) => key !== prokat.booking.clientEmail))
          : values
        const decision = guardProkatCreate(app, actor, prokat.bookingsTableId, authorizeValues)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, prokat.bookingsTableId, { ...values, ...(decision.ownerValues ?? {}) }, actorRef, { origin: 'runtime' })
        return { ok: true as const, message: parsed.kind === 'create' ? 'Бронь создана.' : 'Заявка отправлена.' }
      }

      const booking = await bookingOf(parsed.recordId)
      const bookingFields = await mutationFields(context, prokat.bookingsTableId)
      const statusName = choiceName(bookingFields, prokat.booking.status, booking.values[prokat.booking.status]) || prokatStatusName(prokat, booking.values[prokat.booking.status])

      if (parsed.kind === 'confirm') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        const allowed = assertStaffStatus(statusName, 'Подтверждена')
        if (!allowed.ok) throw new RowWriteError('invalid', allowed.error)
        const itemIds = idsOf(booking.values[prokat.booking.items])
        const from = textOf(booking.values[prokat.booking.from])
        const to = textOf(booking.values[prokat.booking.to])
        const conflict = findItemBookingConflict(await loadSpans(), itemIds, from, to, booking.id)
        if (conflict) throw new RowWriteError('invalid', `Предмет уже занят в брони ${conflict.number}.`)
        const patch: Record<string, AppV2Json> = {
          [prokat.booking.status]: prokat.statuses.confirmed,
          [prokat.booking.updatedAt]: now,
          ...stampBookingHoldUntil(prokat.booking, from, prokatHoldMinutes(prokat)),
        }
        const decision = guardProkatUpdate(app, actor, booking, patch)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, prokat.bookingsTableId, booking.id, patch, actorRef)
        return { ok: true as const, message: 'Бронь подтверждена.' }
      }

      if (parsed.kind === 'extendHold') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        if (!isHoldEligibleStatus(statusName)) throw new RowWriteError('invalid', 'Продлить можно только заявку или подтверждённую бронь.')
        if (!prokat.booking.holdUntil) throw new RowWriteError('invalid', 'В этом приложении нет поля срока удержания.')
        if (prokatHoldMinutes(prokat) == null) throw new RowWriteError('invalid', 'Автоотмена отключена — продлевать нечего.')
        // Re-lock so a concurrent auto-cancel cannot interleave after we decided to extend.
        const locked = await lockedRow(context, prokat.bookingsTableId, booking.id)
        checkRow(locked)
        const lockedStatus = choiceName(bookingFields, prokat.booking.status, (locked.data as Record<string, unknown>)[prokat.booking.status])
          || prokatStatusName(prokat, (locked.data as Record<string, unknown>)[prokat.booking.status])
        if (!isHoldEligibleStatus(lockedStatus)) throw new RowWriteError('conflict', 'Бронь уже выдана или снята. Обновите карточку.')
        const from = textOf((locked.data as Record<string, unknown>)[prokat.booking.from])
        const current = resolveBookingHoldUntil({
          from,
          holdUntil: textOf((locked.data as Record<string, unknown>)[prokat.booking.holdUntil!]) || null,
          holdAfterStartMinutes: prokatHoldMinutes(prokat),
        })
        const next = extendHoldUntil(current, nowMs)
        const patch: Record<string, AppV2Json> = {
          [prokat.booking.holdUntil]: next,
          [prokat.booking.updatedAt]: now,
        }
        const decision = guardProkatUpdate(app, actor, booking, patch)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, prokat.bookingsTableId, booking.id, patch, actorRef)
        return { ok: true as const, message: 'Бронь продлена на час.' }
      }

      if (parsed.kind === 'markNotPickedUp') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        if (!prokat.statuses.notPickedUp) throw new RowWriteError('invalid', 'Статус «Не забрали» ещё не настроен.')
        const allowed = assertStaffStatus(statusName, 'Не забрали')
        if (!allowed.ok) throw new RowWriteError('invalid', allowed.error)
        const locked = await lockedRow(context, prokat.bookingsTableId, booking.id)
        checkRow(locked)
        const lockedStatus = choiceName(bookingFields, prokat.booking.status, (locked.data as Record<string, unknown>)[prokat.booking.status])
          || prokatStatusName(prokat, (locked.data as Record<string, unknown>)[prokat.booking.status])
        const stillAllowed = assertStaffStatus(lockedStatus, 'Не забрали')
        if (!stillAllowed.ok) throw new RowWriteError('conflict', 'Бронь уже выдана или снята. Обновите карточку.')
        const patch: Record<string, AppV2Json> = {
          [prokat.booking.status]: prokat.statuses.notPickedUp,
          [prokat.booking.updatedAt]: now,
        }
        if (prokat.booking.statusReason) patch[prokat.booking.statusReason] = PROKAT_NOT_PICKED_UP_REASON_MANUAL
        const decision = guardProkatUpdate(app, actor, booking, patch)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, prokat.bookingsTableId, booking.id, patch, actorRef)
        const [thread] = await context.tx.select({ id: conversations.id, closedAt: conversations.closedAt }).from(conversations)
          .where(and(
            eq(conversations.workspaceId, app.workspaceId),
            eq(conversations.tableId, prokat.bookingsTableId),
            eq(conversations.rowId, booking.id),
            eq(conversations.kind, 'record'),
          )).limit(1)
        if (thread && !thread.closedAt) {
          const authorId = `person_${createHash('sha256').update(`${app.workspaceId}:${prokatActorEmail(actor) || actor.id}`).digest('hex')}`
          await context.tx.insert(conversationMessages).values({
            id: `msg_${newId('row').slice(4)}`,
            workspaceId: app.workspaceId,
            conversationId: thread.id,
            authorId,
            authorKind: 'staff',
            authorName: (actor.name ?? 'Сотрудник').slice(0, 80),
            requestId: randomUUID(),
            body: PROKAT_NOT_PICKED_UP_CHAT,
          }).onConflictDoNothing()
        }
        return { ok: true as const, message: 'Отмечено: не забрали.' }
      }

      if (parsed.kind === 'cancel') {
        if (isProkatClient(actor)) {
          if (statusName !== 'Заявка' && statusName !== 'Подтверждена') throw new RowWriteError('invalid', 'Отменить эту бронь уже нельзя.')
        } else {
          const desk = assertDesk(actor)
          if (!desk.ok) throw new RowWriteError('denied', desk.error)
          const allowed = assertStaffStatus(statusName, 'Отменена')
          if (!allowed.ok) throw new RowWriteError('invalid', allowed.error)
        }
        const patch: Record<string, AppV2Json> = { [prokat.booking.status]: prokat.statuses.cancelled, [prokat.booking.updatedAt]: now }
        const decision = guardProkatUpdate(app, actor, booking, patch)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, prokat.bookingsTableId, booking.id, patch, actorRef)
        return { ok: true as const, message: 'Бронь отменена.' }
      }

      if (parsed.kind === 'issue') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        // Lock first so auto-cancel cannot win between the status check and the write.
        const locked = await lockedRow(context, prokat.bookingsTableId, booking.id)
        checkRow(locked)
        const lockedStatus = choiceName(bookingFields, prokat.booking.status, (locked.data as Record<string, unknown>)[prokat.booking.status])
          || prokatStatusName(prokat, (locked.data as Record<string, unknown>)[prokat.booking.status])
        const allowed = assertStaffStatus(lockedStatus, 'Выдано')
        if (!allowed.ok) throw new RowWriteError('conflict', lockedStatus === 'Не забрали'
          ? 'Бронь уже снята как неявка. Обновите карточку.'
          : allowed.error)
        const itemIds = idsOf((locked.data as Record<string, unknown>)[prokat.booking.items] as unknown)
        const from = textOf((locked.data as Record<string, unknown>)[prokat.booking.from])
        const to = textOf((locked.data as Record<string, unknown>)[prokat.booking.to])
        const conflict = findItemBookingConflict(await loadSpans(), itemIds, from, to, booking.id)
        if (conflict) throw new RowWriteError('invalid', `Предмет уже занят в брони ${conflict.number}.`)
        const patch = bookingIssueValues(prokat.booking, {
          condition: parsed.condition, damages: parsed.damages, photos: parsed.photos,
          issueAt: now, statusId: prokat.statuses.issued, updatedAt: now,
        })
        const decision = guardProkatUpdate(app, actor, booking, patch)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, prokat.bookingsTableId, booking.id, patch, actorRef)
        for (const itemId of itemIds) {
          const item = await load(prokat.itemsTableId, itemId)
          if (!item) continue
          const itemPatch: Record<string, AppV2Json> = { [prokat.item.status]: prokat.itemStatuses.rented }
          const itemDecision = guardProkatUpdate(app, actor, item, itemPatch)
          if (!itemDecision.ok) throw new RowWriteError('denied', itemDecision.error)
          await updateRow(context, prokat.itemsTableId, item.id, itemPatch, actorRef)
        }
        return { ok: true as const, message: 'Акт выдачи сохранён.' }
      }

      if (parsed.kind === 'return') {
        const desk = assertDesk(actor)
        if (!desk.ok) throw new RowWriteError('denied', desk.error)
        const allowed = assertStaffStatus(statusName, 'Возвращено')
        if (!allowed.ok) throw new RowWriteError('invalid', allowed.error)
        const itemIds = idsOf(booking.values[prokat.booking.items])
        const patch = bookingReturnValues(prokat.booking, {
          condition: parsed.condition, damages: parsed.damages, photos: parsed.photos,
          returnAt: now, lateFee: parsed.lateFee, depositReturned: parsed.depositReturned,
          depositWithheld: parsed.depositWithheld, depositReason: parsed.depositReason,
          statusId: prokat.statuses.returned, updatedAt: now,
        })
        const decision = guardProkatUpdate(app, actor, booking, patch)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, prokat.bookingsTableId, booking.id, patch, actorRef)
        for (const itemId of itemIds) {
          const item = await load(prokat.itemsTableId, itemId)
          if (!item) continue
          const itemPatch: Record<string, AppV2Json> = { [prokat.item.status]: prokat.itemStatuses.free }
          const itemDecision = guardProkatUpdate(app, actor, item, itemPatch)
          if (!itemDecision.ok) throw new RowWriteError('denied', itemDecision.error)
          await updateRow(context, prokat.itemsTableId, item.id, itemPatch, actorRef)
        }
        return { ok: true as const, message: 'Акт возврата сохранён.' }
      }

      const desk = assertDesk(actor)
      if (!desk.ok) throw new RowWriteError('denied', desk.error)
      const nextName = choiceName(bookingFields, prokat.booking.status, parsed.statusId) || prokatStatusName(prokat, parsed.statusId)
      const allowed = assertStaffStatus(statusName, nextName)
      if (!allowed.ok) throw new RowWriteError('invalid', allowed.error)
      if (nextName === 'Подтверждена' || nextName === 'Выдано') {
        const itemIds = idsOf(booking.values[prokat.booking.items])
        const from = textOf(booking.values[prokat.booking.from])
        const to = textOf(booking.values[prokat.booking.to])
        const conflict = findItemBookingConflict(await loadSpans(), itemIds, from, to, booking.id)
        if (conflict) throw new RowWriteError('invalid', `Предмет уже занят в брони ${conflict.number}.`)
      }
      const patch: Record<string, AppV2Json> = { [prokat.booking.status]: parsed.statusId, [prokat.booking.updatedAt]: now }
      if (nextName === 'Не забрали' && prokat.booking.statusReason) {
        patch[prokat.booking.statusReason] = PROKAT_NOT_PICKED_UP_REASON_MANUAL
      }
      const decision = guardProkatUpdate(app, actor, booking, patch)
      if (!decision.ok) throw new RowWriteError('denied', decision.error)
      await updateRow(context, prokat.bookingsTableId, booking.id, patch, actorRef)
      return { ok: true as const, message: 'Статус сохранён.' }
    })
  } catch (error) {
    return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось сохранить бронь.' }
  }
}
