export const OWNER_START_PATHS = {
  import: { href: '/import', label: 'Загрузить таблицу', next: 'Продолжить к загрузке', description: 'Затем выберете файл Excel или CSV и проверите данные перед импортом.' },
  templates: { href: '/templates', label: 'Выбрать сценарий', next: 'Продолжить к сценариям', description: 'Затем выберете готовый сценарий с таблицами, связями и экранами.' },
  blank: { href: '/tables', label: 'Создать пустую таблицу', next: 'Продолжить к таблицам', description: 'Затем сможете создать таблицу и самостоятельно добавить поля и записи.' },
} as const
export type OwnerStartPath = keyof typeof OWNER_START_PATHS

export function isOwnerStartPath(value: unknown): value is OwnerStartPath {
  return typeof value === 'string' && Object.hasOwn(OWNER_START_PATHS, value)
}
