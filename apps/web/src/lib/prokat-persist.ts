import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Actor, AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { authorizeAppV2Write, projectAppV2Row } from '@tableapp/schema/app-v2'
import {
  canStaffTransition, clientCanRequestCancel, findItemBookingConflict, isProkatBookingStatus,
  nextBookingNumber, sameEmail, type ProkatBookingStatus, type ProkatBookingSpan,
} from './prokat-logic'

export type ProkatApp = NonNullable<AppV2['prokat']>

export function guardProkatUpdate(app: AppV2, actor: AppV2Actor, row: AppV2Record, values: Record<string, AppV2Json>) {
  return authorizeAppV2Write(app, actor, { operation: 'update', row, values })
}

export function guardProkatCreate(app: AppV2, actor: AppV2Actor, tableId: string, values: Record<string, AppV2Json>) {
  return authorizeAppV2Write(app, actor, { operation: 'create', tableId, values })
}

export function isProkatDesk(actor: AppV2Actor) {
  return actor.authenticated && (actor.roleIds.includes('owner') || actor.roleIds.includes('staff'))
}

export function isProkatClient(actor: AppV2Actor) {
  return actor.authenticated && actor.roleIds.includes('client') && !isProkatDesk(actor)
}

export function prokatActorEmail(actor: AppV2Actor) {
  return actor.authenticated && actor.email ? actor.email.trim().toLowerCase() : ''
}

export function ownsProkatBooking(booking: ProkatApp['booking'], row: AppV2Record, actor: AppV2Actor) {
  return sameEmail(row.values[booking.clientEmail], prokatActorEmail(actor))
}

export function projectProkatRows(app: AppV2, actor: AppV2Actor, rows: readonly AppV2Record[]): AppV2Record[] {
  return rows.flatMap(row => {
    const values = projectAppV2Row(app, actor, row)
    return Object.keys(values).length ? [{ ...row, values }] : []
  })
}

export function assertDesk(actor: AppV2Actor): { ok: true } | { ok: false; error: string } {
  return isProkatDesk(actor) ? { ok: true } : { ok: false, error: 'Это действие доступно сотруднику проката.' }
}

export function assertClient(actor: AppV2Actor): { ok: true } | { ok: false; error: string } {
  return isProkatClient(actor) ? { ok: true } : { ok: false, error: 'Это действие доступно клиенту.' }
}

export function assertBookingAccess(prokat: ProkatApp, actor: AppV2Actor, row: AppV2Record): { ok: true } | { ok: false; error: string } {
  if (isProkatDesk(actor)) return { ok: true }
  if (isProkatClient(actor) && ownsProkatBooking(prokat.booking, row, actor)) return { ok: true }
  return { ok: false, error: 'Эта бронь вам недоступна.' }
}

export function assertStaffStatus(from: string, to: string): { ok: true } | { ok: false; error: string } {
  if (!isProkatBookingStatus(from) || !isProkatBookingStatus(to)) return { ok: false, error: 'Неизвестный статус.' }
  if (from === to) return { ok: true }
  return canStaffTransition(from, to) ? { ok: true } : { ok: false, error: 'Такой переход статуса недоступен.' }
}

export function prokatStatusName(prokat: ProkatApp, id: unknown): ProkatBookingStatus | '' {
  if (id === prokat.statuses.request) return 'Заявка'
  if (id === prokat.statuses.confirmed) return 'Подтверждена'
  if (id === prokat.statuses.issued) return 'Выдано'
  if (id === prokat.statuses.returned) return 'Возвращено'
  if (id === prokat.statuses.overdue) return 'Просрочен возврат'
  if (id === prokat.statuses.cancelled) return 'Отменена'
  return ''
}

export function prokatStatusId(prokat: ProkatApp, name: string) {
  if (name === 'Заявка') return prokat.statuses.request
  if (name === 'Подтверждена') return prokat.statuses.confirmed
  if (name === 'Выдано') return prokat.statuses.issued
  if (name === 'Возвращено') return prokat.statuses.returned
  if (name === 'Просрочен возврат') return prokat.statuses.overdue
  if (name === 'Отменена') return prokat.statuses.cancelled
  return ''
}

const textOf = (value: unknown) => typeof value === 'string' ? value : ''
const idsOf = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []

export function bookingSpansFromRows(prokat: ProkatApp, rows: readonly AppV2Record[]): ProkatBookingSpan[] {
  return rows.filter(row => row.tableId === prokat.bookingsTableId).map(row => ({
    id: row.id,
    number: textOf(row.values[prokat.booking.number]),
    itemIds: idsOf(row.values[prokat.booking.items]),
    from: textOf(row.values[prokat.booking.from]),
    to: textOf(row.values[prokat.booking.to]),
    status: prokatStatusName(prokat, row.values[prokat.booking.status]) || textOf(row.values[prokat.booking.status]),
  }))
}

export function bookingCreateValues(booking: ProkatApp['booking'], input: {
  number: string
  title: string
  clientId: string
  clientName: string
  clientEmail: string
  itemIds: readonly string[]
  from: string
  to: string
  price: number
  deposit: number
  statusId: string
  staffId?: string | null
  staffEmail?: string | null
  createdAt: string
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {
    [booking.number]: input.number,
    [booking.title]: input.title,
    [booking.client]: [input.clientId],
    [booking.clientName]: input.clientName,
    [booking.clientEmail]: input.clientEmail,
    [booking.items]: [...input.itemIds],
    [booking.from]: input.from,
    [booking.to]: input.to,
    [booking.price]: input.price,
    [booking.deposit]: input.deposit,
    [booking.lateFee]: 0,
    [booking.status]: input.statusId,
    [booking.issuePhotos]: '[]',
    [booking.returnPhotos]: [],
    [booking.createdAt]: input.createdAt,
    [booking.updatedAt]: input.createdAt,
  }
  if (input.staffId) values[booking.staff] = [input.staffId]
  if (input.staffEmail) values[booking.staffEmail] = input.staffEmail
  return values
}

export function bookingIssueValues(booking: ProkatApp['booking'], input: {
  condition: string
  damages: string
  photos?: string
  issueAt: string
  statusId: string
  updatedAt: string
}): Record<string, AppV2Json> {
  return {
    [booking.issueCondition]: input.condition,
    [booking.issueDamages]: input.damages,
    [booking.issuePhotos]: input.photos ?? '[]',
    [booking.issueAt]: input.issueAt,
    [booking.status]: input.statusId,
    [booking.updatedAt]: input.updatedAt,
  }
}

export function bookingReturnValues(booking: ProkatApp['booking'], input: {
  condition: string
  damages: string
  photos?: AppV2Json
  returnAt: string
  lateFee?: number
  depositReturned?: number
  depositWithheld?: number
  depositReason?: string
  statusId: string
  updatedAt: string
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {
    [booking.returnCondition]: input.condition,
    [booking.returnDamages]: input.damages,
    [booking.returnPhotos]: input.photos ?? [],
    [booking.returnAt]: input.returnAt,
    [booking.status]: input.statusId,
    [booking.updatedAt]: input.updatedAt,
  }
  if (input.lateFee !== undefined) values[booking.lateFee] = input.lateFee
  if (input.depositReturned !== undefined) values[booking.depositReturned] = input.depositReturned
  if (input.depositWithheld !== undefined) values[booking.depositWithheld] = input.depositWithheld
  if (input.depositReason !== undefined) values[booking.depositReason] = input.depositReason
  return values
}

export type ProkatChange =
  | { kind: 'create'; clientId: string; itemIds: string[]; title: string; from: string; to: string; price: number; deposit: number }
  | { kind: 'clientRequest'; itemIds: string[]; title: string; from: string; to: string; price: number; deposit: number; clientName: string }
  | { kind: 'confirm'; recordId: string }
  | { kind: 'cancel'; recordId: string }
  | { kind: 'issue'; recordId: string; condition: string; damages: string; photos?: string }
  | { kind: 'return'; recordId: string; condition: string; damages: string; photos?: AppV2Json; lateFee?: number; depositReturned?: number; depositWithheld?: number; depositReason?: string }
  | { kind: 'status'; recordId: string; statusId: string }
  | { kind: 'itemPatch'; recordId: string; values: Record<string, AppV2Json> }

/** Mark catalog items free/rented after issue or return. Staff policy allows item updates. */
export function syncItemStatuses(
  app: AppV2,
  actor: AppV2Actor,
  rows: readonly AppV2Record[],
  itemIds: readonly string[],
  statusId: string,
  busyUntil: string | null = null,
): { ok: true; rows: AppV2Record[] } | { ok: false; error: string } {
  const prokat = app.prokat
  if (!prokat) return { ok: false, error: 'Это не приложение проката.' }
  let next = [...rows]
  for (const itemId of itemIds) {
    const item = next.find(row => row.id === itemId && row.tableId === prokat.itemsTableId)
    if (!item) continue
    const patch: Record<string, AppV2Json> = { [prokat.item.status]: statusId }
    if (prokat.item.busyUntil) patch[prokat.item.busyUntil] = busyUntil
    const decision = guardProkatUpdate(app, actor, item, patch)
    if (!decision.ok) return decision
    next = next.map(row => row.id === item.id ? { ...row, values: { ...row.values, ...patch } } : row)
  }
  return { ok: true, rows: next }
}

/** In-memory twin of the published action for gallery demos. */
export function applyProkatChange(
  app: AppV2,
  actor: AppV2Actor,
  rows: readonly AppV2Record[],
  change: ProkatChange,
  now: string,
): { ok: true; rows: AppV2Record[]; message: string } | { ok: false; error: string } {
  const prokat = app.prokat
  if (!prokat || !actor.authenticated) return { ok: false, error: 'Для сохранения нужно войти' }
  const replace = (row: AppV2Record, values: Record<string, AppV2Json>) =>
    rows.map(item => item.id === row.id ? { ...item, values: { ...item.values, ...values } } : item)
  const bookingRow = (id: string) => rows.find(row => row.id === id && row.tableId === prokat.bookingsTableId)
  const spans = () => bookingSpansFromRows(prokat, rows)

  if (change.kind === 'create' || change.kind === 'clientRequest') {
    const itemIds = change.itemIds.filter(Boolean)
    if (!itemIds.length) return { ok: false, error: 'Выберите хотя бы один предмет.' }
    if (!change.from || !change.to) return { ok: false, error: 'Укажите срок аренды.' }
    const conflict = findItemBookingConflict(spans(), itemIds, change.from, change.to)
    if (conflict) return { ok: false, error: `Предмет уже занят в брони ${conflict.number}.` }

    let clientId = ''
    let clientName = ''
    let clientEmail = ''
    let statusId = prokat.statuses.request

    if (change.kind === 'create') {
      const desk = assertDesk(actor)
      if (!desk.ok) return desk
      const client = rows.find(row => row.id === change.clientId && row.tableId === prokat.clientsTableId)
      clientEmail = textOf(client?.values[prokat.client.email]).trim().toLowerCase()
      clientName = textOf(client?.values[prokat.client.name]).trim()
      if (!client || !clientEmail || !clientName) return { ok: false, error: 'Выберите клиента с именем и почтой.' }
      clientId = client.id
      statusId = prokat.statuses.confirmed
    } else {
      const clientOk = assertClient(actor)
      if (!clientOk.ok) return clientOk
      clientEmail = prokatActorEmail(actor)
      clientName = change.clientName.trim() || actor.name?.trim() || clientEmail
      if (!clientEmail) return { ok: false, error: 'Нужна подтверждённая почта.' }
      const existing = rows.find(row => row.tableId === prokat.clientsTableId && sameEmail(row.values[prokat.client.email], clientEmail))
      if (existing) {
        clientId = existing.id
        if (!clientName) clientName = textOf(existing.values[prokat.client.name]).trim() || clientEmail
      } else {
        const createdClient: AppV2Record = {
          id: newId('row'),
          tableId: prokat.clientsTableId,
          values: {
            [prokat.client.name]: clientName,
            [prokat.client.phone]: '',
          },
        }
        const clientCreate = guardProkatCreate(app, actor, prokat.clientsTableId, createdClient.values)
        if (!clientCreate.ok) return clientCreate
        const number = nextBookingNumber(rows.filter(row => row.tableId === prokat.bookingsTableId).map(row => textOf(row.values[prokat.booking.number])))
        const values = bookingCreateValues(prokat.booking, {
          number, title: change.title.trim(), clientId: createdClient.id, clientName, clientEmail,
          itemIds, from: change.from, to: change.to, price: change.price, deposit: change.deposit,
          statusId, createdAt: now,
        })
        const authorizeValues = Object.fromEntries(Object.entries(values).filter(([key]) => key !== prokat.booking.clientEmail))
        const decision = guardProkatCreate(app, actor, prokat.bookingsTableId, authorizeValues)
        if (!decision.ok) return decision
        return {
          ok: true,
          rows: [
            ...rows,
            { ...createdClient, values: { ...createdClient.values, [prokat.client.email]: clientEmail, ...clientCreate.ownerValues } },
            { id: newId('row'), tableId: prokat.bookingsTableId, values: { ...values, ...decision.ownerValues } },
          ],
          message: 'Заявка отправлена.',
        }
      }
    }

    const number = nextBookingNumber(rows.filter(row => row.tableId === prokat.bookingsTableId).map(row => textOf(row.values[prokat.booking.number])))
    const values = bookingCreateValues(prokat.booking, {
      number, title: change.title.trim(), clientId, clientName, clientEmail,
      itemIds, from: change.from, to: change.to, price: change.price, deposit: change.deposit,
      statusId, createdAt: now,
    })
    // Owner-stamped clientEmail must not appear in the authorize payload for clients.
    const authorizeValues = change.kind === 'clientRequest'
      ? Object.fromEntries(Object.entries(values).filter(([key]) => key !== prokat.booking.clientEmail))
      : values
    const decision = guardProkatCreate(app, actor, prokat.bookingsTableId, authorizeValues)
    if (!decision.ok) return decision
    return {
      ok: true,
      rows: [...rows, { id: newId('row'), tableId: prokat.bookingsTableId, values: { ...values, ...(decision.ownerValues ?? {}) } }],
      message: change.kind === 'create' ? 'Бронь создана.' : 'Заявка отправлена.',
    }
  }

  if (change.kind === 'itemPatch') {
    const desk = assertDesk(actor)
    if (!desk.ok) return desk
    const item = rows.find(row => row.id === change.recordId && row.tableId === prokat.itemsTableId)
    if (!item) return { ok: false, error: 'Предмет не найден.' }
    const allowed = new Set([
      prokat.item.showInCatalog, prokat.item.lateFeeMode, prokat.item.lateFeeValue,
      prokat.item.lateFeeGraceHours, prokat.item.lateFeeCapPerDay, prokat.item.condition, prokat.item.status,
    ].filter((id): id is string => Boolean(id)))
    const patch: Record<string, AppV2Json> = {}
    for (const [key, value] of Object.entries(change.values)) {
      if (!allowed.has(key)) return { ok: false, error: 'Это поле предмета нельзя менять здесь.' }
      patch[key] = value
    }
    if (!Object.keys(patch).length) return { ok: false, error: 'Нет изменений.' }
    const decision = guardProkatUpdate(app, actor, item, patch)
    if (!decision.ok) return decision
    return { ok: true, rows: replace(item, patch), message: 'Параметры предмета сохранены.' }
  }

  const booking = bookingRow(change.recordId)
  if (!booking) return { ok: false, error: 'Бронь не найдена.' }
  const access = assertBookingAccess(prokat, actor, booking)
  if (!access.ok) return access
  const statusName = prokatStatusName(prokat, booking.values[prokat.booking.status])

  if (change.kind === 'confirm') {
    const desk = assertDesk(actor)
    if (!desk.ok) return desk
    const allowed = assertStaffStatus(statusName, 'Подтверждена')
    if (!allowed.ok) return allowed
    const itemIds = idsOf(booking.values[prokat.booking.items])
    const from = textOf(booking.values[prokat.booking.from])
    const to = textOf(booking.values[prokat.booking.to])
    const conflict = findItemBookingConflict(spans(), itemIds, from, to, booking.id)
    if (conflict) return { ok: false, error: `Предмет уже занят в брони ${conflict.number}.` }
    const patch: Record<string, AppV2Json> = {
      [prokat.booking.status]: prokat.statuses.confirmed,
      [prokat.booking.updatedAt]: now,
    }
    const decision = guardProkatUpdate(app, actor, booking, patch)
    if (!decision.ok) return decision
    return { ok: true, rows: replace(booking, patch), message: 'Бронь подтверждена.' }
  }

  if (change.kind === 'cancel') {
    if (isProkatClient(actor)) {
      if (!clientCanRequestCancel(statusName)) return { ok: false, error: 'Отменить эту бронь уже нельзя.' }
    } else {
      const desk = assertDesk(actor)
      if (!desk.ok) return desk
      const allowed = assertStaffStatus(statusName, 'Отменена')
      if (!allowed.ok) return allowed
    }
    const patch: Record<string, AppV2Json> = {
      [prokat.booking.status]: prokat.statuses.cancelled,
      [prokat.booking.updatedAt]: now,
    }
    const decision = guardProkatUpdate(app, actor, booking, patch)
    if (!decision.ok) return decision
    return { ok: true, rows: replace(booking, patch), message: 'Бронь отменена.' }
  }

  if (change.kind === 'issue') {
    const desk = assertDesk(actor)
    if (!desk.ok) return desk
    const allowed = assertStaffStatus(statusName, 'Выдано')
    if (!allowed.ok) return allowed
    const itemIds = idsOf(booking.values[prokat.booking.items])
    const from = textOf(booking.values[prokat.booking.from])
    const to = textOf(booking.values[prokat.booking.to])
    const conflict = findItemBookingConflict(spans(), itemIds, from, to, booking.id)
    if (conflict) return { ok: false, error: `Предмет уже занят в брони ${conflict.number}.` }
    const patch = bookingIssueValues(prokat.booking, {
      condition: change.condition.trim(),
      damages: change.damages.trim(),
      photos: change.photos,
      issueAt: now,
      statusId: prokat.statuses.issued,
      updatedAt: now,
    })
    const decision = guardProkatUpdate(app, actor, booking, patch)
    if (!decision.ok) return decision
    const itemStatus = syncItemStatuses(app, actor, replace(booking, patch), itemIds, prokat.itemStatuses.rented, to || null)
    if (!itemStatus.ok) return itemStatus
    return { ok: true, rows: itemStatus.rows, message: 'Акт выдачи сохранён.' }
  }

  if (change.kind === 'return') {
    const desk = assertDesk(actor)
    if (!desk.ok) return desk
    const allowed = assertStaffStatus(statusName, 'Возвращено')
    if (!allowed.ok) return allowed
    const itemIds = idsOf(booking.values[prokat.booking.items])
    const patch = bookingReturnValues(prokat.booking, {
      condition: change.condition.trim(),
      damages: change.damages.trim(),
      photos: change.photos,
      returnAt: now,
      lateFee: change.lateFee,
      depositReturned: change.depositReturned,
      depositWithheld: change.depositWithheld,
      depositReason: change.depositReason,
      statusId: prokat.statuses.returned,
      updatedAt: now,
    })
    const decision = guardProkatUpdate(app, actor, booking, patch)
    if (!decision.ok) return decision
    const itemStatus = syncItemStatuses(app, actor, replace(booking, patch), itemIds, prokat.itemStatuses.free, null)
    if (!itemStatus.ok) return itemStatus
    return { ok: true, rows: itemStatus.rows, message: 'Акт возврата сохранён.' }
  }

  const desk = assertDesk(actor)
  if (!desk.ok) return desk
  const nextName = prokatStatusName(prokat, change.statusId)
  const allowed = assertStaffStatus(statusName, nextName)
  if (!allowed.ok) return allowed
  if (nextName === 'Подтверждена' || nextName === 'Выдано') {
    const itemIds = idsOf(booking.values[prokat.booking.items])
    const from = textOf(booking.values[prokat.booking.from])
    const to = textOf(booking.values[prokat.booking.to])
    const conflict = findItemBookingConflict(spans(), itemIds, from, to, booking.id)
    if (conflict) return { ok: false, error: `Предмет уже занят в брони ${conflict.number}.` }
  }
  const patch: Record<string, AppV2Json> = {
    [prokat.booking.status]: change.statusId,
    [prokat.booking.updatedAt]: now,
  }
  const decision = guardProkatUpdate(app, actor, booking, patch)
  if (!decision.ok) return decision
  return { ok: true, rows: replace(booking, patch), message: 'Статус сохранён.' }
}
