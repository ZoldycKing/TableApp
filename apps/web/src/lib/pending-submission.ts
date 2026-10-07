import { randomBytes } from 'node:crypto'
import type { App, Field, Screen } from '@tableapp/schema'
import { parseCellValue } from '@tableapp/schema'
import { stripDerived } from '@tableapp/formula'
import { ANONYMOUS, canOpenScreen, formFields, writableFields, type Visitor } from './app-roles'

/**
 * Заявка, ожидающая подтверждения почты.
 *
 * Целевой путь приёма заявок от посторонних людей: человек заполняет форму,
 * подтверждает почту кодом, и только после этого появляется запись — уже
 * от проверенного человека, с владельцем, проставленным сервером.
 *
 * Это единственный путь, которым посторонний попадает в таблицу. Прямой
 * записи от не вошедшего не осталось нигде: `permits` отказывает ему всегда.
 *
 * Прав в отложенной заявке не хранится намеренно. Ни роли, ни списка полей:
 * пока человек ищет письмо, владелец мог убрать поле или закрыть форму, и
 * доверять тому, что было позволено десять минут назад, нельзя.
 */

/** Сколько живёт незавершённая заявка. Успеть найти письмо и не больше. */
export const PENDING_TTL_MS = 45 * 60 * 1000

/**
 * Ключ отложенной заявки.
 *
 * Он же предъявитель права её завершить, поэтому угадать его нельзя:
 * 32 случайных байта, а не порядковый номер и не идентификатор строки.
 */
export function newPendingToken(): string {
  return randomBytes(32).toString('base64url')
}

export function pendingExpiry(now = new Date()): Date {
  return new Date(now.getTime() + PENDING_TTL_MS)
}

export type PendingRecord = {
  id: string
  appId: string
  screenId: string
  tableId: string
  values: Record<string, unknown>
  email: string
  expiresAt: Date
  usedAt: Date | null
}

export type PendingRejection =
  | 'not_found'
  | 'expired'
  | 'already_used'
  | 'screen_gone'
  | 'not_allowed'
  | 'nothing_to_write'
  | 'too_large'

/**
 * Годна ли заявка к завершению.
 *
 * Одноразовость и срок проверяются до всего остального: просроченный или уже
 * использованный ключ не должен доходить до проверки прав, иначе по нему
 * можно узнать, что происходит с приложением.
 */
export function checkPending(
  record: PendingRecord | null,
  now = new Date(),
): { ok: true; record: PendingRecord } | { ok: false; reason: PendingRejection } {
  if (!record) return { ok: false, reason: 'not_found' }
  if (record.usedAt !== null) return { ok: false, reason: 'already_used' }
  if (record.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' }
  return { ok: true, record }
}

/**
 * Пересчёт прав и значений по **текущему** определению приложения.
 *
 * Самое важное место всего пути. Между заполнением формы и подтверждением
 * почты проходят минуты, за которые владелец мог удалить поле, закрыть форму
 * или поменять роли. Поэтому от отложенной заявки берутся только сырые
 * значения, а что из них можно записать — решается заново и здесь.
 *
 * Функция чистая: ни базы, ни сессии. Всё, что она знает о человеке, — это
 * контекст, собранный после подтверждения почты, а не то, что прислал браузер.
 */
export function revalidatePending(
  app: App,
  record: Pick<PendingRecord, 'screenId' | 'tableId' | 'values'>,
  fields: readonly Field[],
  visitor: Visitor,
): { ok: true; values: Record<string, unknown> } | { ok: false; reason: PendingRejection } {
  const screen: Screen | undefined = app.screens.find((item) => item.id === record.screenId)
  if (!screen || screen.type !== 'form' || screen.mode !== 'create') {
    return { ok: false, reason: 'screen_gone' }
  }
  if (screen.tableId !== record.tableId) return { ok: false, reason: 'screen_gone' }

  // Подтверждённый человек должен иметь право на эту форму сам по себе —
  // не потому, что когда-то её открыл кто-то другой.
  if (!canOpenScreen(screen, visitor)) return { ok: false, reason: 'not_allowed' }

  const allowed = writableFields(app, record.tableId, visitor, 'create')
  if (allowed.size === 0) return { ok: false, reason: 'not_allowed' }

  const byId = new Map(fields.map((field) => [field.id, field]))
  const clean: Record<string, unknown> = {}
  for (const [fieldId, value] of Object.entries(stripDerived(record.values, [...fields]))) {
    const field = byId.get(fieldId)
    // Поле удалили или закрыли для записи — значение просто не берётся.
    if (!field || !allowed.has(fieldId)) continue
    try {
      clean[fieldId] = parseCellValue(field, value)
    } catch {
      // Значение, не подходящее типу, отбрасывается, а не пишется как есть.
    }
  }

  if (Object.keys(clean).length === 0) return { ok: false, reason: 'nothing_to_write' }
  return { ok: true, values: clean }
}

/**
 * Можно ли уже переводить приём заявок на подтверждение почты.
 *
 * Пока рассылки нет, ответ — нет: потребовать код у постороннего человека
 * значит закрыть приём заявок совсем. Одно место, где это решается, чтобы
 * включение свелось к подключению почты, а не к поиску условий по коду.
 */
export function verifiedIntakeEnabled(): boolean {
  return Boolean(process.env.SMTP_URL)
}

/**
 * Потолок на объём заявки.
 *
 * Форму отправляет тот, кого мы не знаем по имени, и присланный объект
 * попадает в базу до всякой проверки типов. Без потолка одна заявка весит
 * столько, сколько захочет отправитель.
 */
export const MAX_VALUES_BYTES = 64 * 1024

/**
 * Что из присланного вообще берём на хранение.
 *
 * Права здесь ещё не считаются — их посчитает `revalidatePending` после
 * подтверждения почты, и другого решения быть не должно. Здесь только
 * отсев заведомо негодного: форма не та, поля не её, объём не тот.
 *
 * Лишние ключи отбрасываются сразу, а не при подтверждении: через сорок
 * пять минут их всё равно выбросит пересчёт, а место в базе они займут
 * сейчас — и займут ровно столько, сколько пришлёт посторонний.
 */
export function draftFromAnonymous(
  app: App,
  screen: Screen,
  values: Record<string, unknown>,
  limitBytes: number = MAX_VALUES_BYTES,
): { ok: true; values: Record<string, unknown> } | { ok: false; reason: PendingRejection } {
  if (screen.type !== 'form' || screen.mode !== 'create') return { ok: false, reason: 'screen_gone' }
  // Форму он видеть должен — иначе заявка пришла мимо интерфейса.
  if (!canOpenScreen(screen, ANONYMOUS)) return { ok: false, reason: 'not_allowed' }

  const offered = formFields(app, screen, ANONYMOUS)
  const kept: Record<string, unknown> = {}
  for (const [fieldId, value] of Object.entries(values)) {
    if (offered.has(fieldId)) kept[fieldId] = value
  }

  if (Object.keys(kept).length === 0) return { ok: false, reason: 'nothing_to_write' }
  if (JSON.stringify(kept).length > limitBytes) return { ok: false, reason: 'too_large' }
  return { ok: true, values: kept }
}
