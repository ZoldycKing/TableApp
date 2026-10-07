/**
 * Политика ролей воркспейса.
 * Чистый модуль без обращений к базе: правило «кто что может» должно быть
 * проверяемо тестом и одинаково читаться на сервере и в интерфейсе.
 */

export const MEMBER_ROLES = ['owner', 'editor', 'viewer'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Владелец',
  editor: 'Редактор',
  viewer: 'Зритель',
}

const WRITERS = new Set<string>(['owner', 'editor'])

/** Право на изменение данных и схемы. Неизвестная роль прав не даёт. */
export function canEdit(role: string): boolean {
  return WRITERS.has(role)
}

/** Право управлять участниками и приложениями воркспейса. */
export function canAdminister(role: string): boolean {
  return role === 'owner'
}

export function isKnownRole(role: string): role is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(role)
}
