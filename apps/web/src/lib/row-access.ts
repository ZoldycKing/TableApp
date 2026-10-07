import type { App, RoleId, RowAccessRule } from '@tableapp/schema'
import type { Visitor } from './app-roles'

/**
 * Правила видимости строк для пользователей приложения.
 *
 * Чтение и запись обязаны решать одинаково: если предикат разойдётся,
 * появится строка, которую видно, но нельзя изменить, — или, что хуже,
 * наоборот. Поэтому логика живёт здесь одна на оба пути.
 */

export type AccessViewer = {
  email: string
  company?: string
  /**
   * Пришёл с витрины, а не по приглашению владельца.
   *
   * Различие нужно ровно в одном месте — ниже, в `canAccessRow`, — и больше
   * нигде: во всём остальном это обычный пользователь приложения.
   */
  enrolled?: boolean
} | null

/**
 * Правила для этой таблицы и этого посетителя.
 *
 * Роль обязательна: без неё правило применялось ко всем, и в клиентском
 * портале сотрудник видел только «свои» обращения — то есть ни одного,
 * потому что его почты в них нет.
 *
 * Не вошедшему правила не выдаются, и это не поблажка: у него нет ни почты,
 * ни организации, сравнивать не с чем, и «своих» строк не бывает. Что ему
 * показать, решается не здесь, а отбором публичного экрана — там, где эта
 * выборка задана владельцем явно.
 */
export function rulesFor(app: App, tableId: string, visitor: Visitor): RowAccessRule[] {
  if (!visitor.authenticated || visitor.roleId === null) return []
  const roleId = visitor.roleId
  return app.rowAccessRules.filter(
    (rule) => rule.tableId === tableId && rule.appliesTo.includes(roleId),
  )
}

/**
 * Можно ли пускать в эту таблицу человека с витрины.
 *
 * Правил на таблицу может не быть вовсе — и тогда `canAccessRow` пропускает
 * всё. Для сотрудника, которого владелец внёс сам, это нормально: он и должен
 * видеть таблицу целиком. Для незнакомца, пришедшего по общедоступной ссылке,
 * это означало бы выдать ему чужие заказы вместе с телефонами и суммами.
 *
 * Поэтому приём заказов от посторонних требует, чтобы владелец **заранее**
 * сказал, где чьи строки. Пока он этого не сказал, кабинет не заводится:
 * «личный кабинет», показывающий всю таблицу, — это не личный кабинет.
 *
 * Отдельной ветки в проверке прав здесь нет намеренно. Условие стоит один раз,
 * на входе, а дальше человек с витрины проходит по тем же правилам, что все.
 */
export function ownRowsDeclared(app: App, tableId: string, roleId: RoleId | null): boolean {
  if (roleId === null) return false
  return app.rowAccessRules.some(
    (rule) => rule.tableId === tableId && rule.appliesTo.includes(roleId),
  )
}

function same(left: unknown, right: string | undefined): boolean {
  if (!right || right.trim() === '') return false
  return String(left ?? '').trim().toLowerCase() === right.trim().toLowerCase()
}

/** Свойство вошедшего, с которым сравнивается поле строки. */
function property(rule: RowAccessRule, viewer: NonNullable<AccessViewer>): string | undefined {
  return rule.match === 'company' ? viewer.company : viewer.email
}

/**
 * Доступна ли строка посетителю.
 *
 * Правил на таблицу может быть несколько, и они складываются: строка доступна,
 * если подошло хотя бы одно. Так «видит свои заказы и заказы своей фирмы»
 * получается двумя правилами, а добавление правила только расширяет доступ —
 * и рассуждать об этом можно, не держа в голове всю таблицу.
 */
export function canAccessRow(
  rules: readonly RowAccessRule[],
  viewer: AccessViewer,
  data: Record<string, unknown>,
): boolean {
  if (rules.length === 0) {
    /*
     * Правил нет — таблица видна целиком. Для сотрудника, которого владелец
     * внёс сам, это и есть ожидаемое: он должен видеть всё.
     *
     * Для пришедшего с витрины — наоборот. Его в таблицу никто не звал, и
     * «правил не задано» должно означать «ничего не видно», а не «видно всё».
     * Иначе владелец, убравший правило, раздаст незнакомцам чужие заказы
     * с телефонами и суммами, ничего об этом не узнав.
     */
    return !viewer?.enrolled
  }
  // Анонимный посетитель не может владеть строкой, поэтому не видит ни одной.
  if (!viewer) return false
  return rules.some((rule) => same(data[rule.fieldId], property(rule, viewer)))
}

/** Владелец проставляется сервером: создать строку на чужой адрес нельзя. */
export function stampOwner(
  rules: readonly RowAccessRule[],
  viewer: AccessViewer,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (!viewer) return values

  const stamped = { ...values }
  for (const rule of rules) {
    const value = property(rule, viewer)
    // Пустую организацию не проставляем: иначе строка станет ничьей
    // и потеряется для всех, включая самого автора.
    if (value && value.trim() !== '') stamped[rule.fieldId] = value
  }
  return stamped
}

/** При изменении строки поле владельца игнорируется: сменить хозяина нельзя. */
export function dropOwnerChange(
  rules: readonly RowAccessRule[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (rules.length === 0) return values

  const locked = new Set(rules.map((rule) => rule.fieldId))
  const rest: Record<string, unknown> = {}
  for (const [fieldId, value] of Object.entries(values)) {
    if (!locked.has(fieldId)) rest[fieldId] = value
  }
  return rest
}

/** Поле, которым правило определяет владельца: правкам с устройства недоступно. */
export function isOwnerField(rules: readonly RowAccessRule[], fieldId: string): boolean {
  return rules.some((rule) => rule.fieldId === fieldId)
}
