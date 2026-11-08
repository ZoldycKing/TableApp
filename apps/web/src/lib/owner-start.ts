export const OWNER_START_PATHS = {
  import: { href: '/import', label: 'Загрузить таблицу', next: 'Продолжить к загрузке', description: 'Выберите файл Excel или CSV. Перед загрузкой сможете проверить данные.' },
  templates: { href: '/templates', label: 'Выбрать шаблон', next: 'Продолжить к шаблонам', description: 'Выберите шаблон под свою задачу, затем добавьте свои данные.' },
  blank: { href: '/tables', label: 'Создать пустую таблицу', next: 'Продолжить к таблицам', description: 'Создайте таблицу, добавьте колонки и заполните данные.' },
} as const
export type OwnerStartPath = keyof typeof OWNER_START_PATHS

export function isOwnerStartPath(value: unknown): value is OwnerStartPath {
  return typeof value === 'string' && Object.hasOwn(OWNER_START_PATHS, value)
}
