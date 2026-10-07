import type { MemberRole } from './roles'

/**
 * Навигация платформы — один список на все её виды.
 *
 * Боковая панель, свёрнутая панель и выдвижная на телефоне читают отсюда.
 * Держать три копии значило бы получить три расходящиеся навигации: пункт
 * добавили в одну, забыли в двух, и человек находит раздел только с компьютера.
 *
 * Речь именно о платформе: таблицы, шаблоны, приложения, команда, расход.
 * Навигация внутри приложений, которые собирают наши пользователи, — своя
 * и живёт в `components/runtime`.
 */

export type NavGroupId = 'work' | 'workspace'

export type NavGroup = { id: NavGroupId; label: string }

/**
 * Группы разделены воздухом, а не линиями: разделителей на пять пунктов
 * больше, чем самих пунктов.
 *
 * «Работа» — то, чем человек занят каждый день. «Пространство» — то, куда
 * он заходит раз в неделю: кто в команде и сколько всего занято. Сюда же
 * встанут тариф и дорожная карта, когда появятся.
 */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'work', label: 'Работа' },
  { id: 'workspace', label: 'Пространство' },
]

export type NavItem = {
  id: string
  label: string
  href: string
  icon: string
  group: NavGroupId
  /**
   * Пути, на которых пункт считается открытым.
   *
   * Список, а не один адрес: «Данные» — это и перечень таблиц, и сама
   * таблица, и загрузка файла. Сравнивать с `pathname` целиком нельзя —
   * на `/t/tbl_123` подсветка пропала бы ровно там, где человек работает.
   */
  match: string[]
  /**
   * Кому пункт показывается. Пусто — всем участникам.
   *
   * Это **отражение** прав, а не сами права: страницу защищает сервер,
   * а список лишь не показывает того, куда всё равно не пустят. Сейчас
   * ни один раздел платформы не закрыт по роли — закрыты отдельные действия
   * внутри них, — но место для тарифа, который будет только владельцу,
   * оставлено здесь, чтобы его не пришлось выдумывать заново.
   */
  roles?: MemberRole[]
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'data',
    label: 'Данные',
    href: '/app',
    icon: 'table',
    group: 'work',
    // Загрузка файла — тоже про данные: подсветка не должна пропадать.
    match: ['/app', '/t', '/import'],
  },
  {
    id: 'templates',
    label: 'Шаблоны',
    href: '/templates',
    icon: 'template',
    group: 'work',
    match: ['/templates'],
  },
  {
    id: 'apps',
    label: 'Приложения',
    href: '/apps',
    icon: 'apps',
    group: 'work',
    match: ['/apps'],
  },
  {
    id: 'team',
    label: 'Команда',
    href: '/team',
    icon: 'users',
    group: 'workspace',
    match: ['/team'],
  },
  {
    id: 'usage',
    label: 'Использование',
    href: '/usage',
    icon: 'gauge',
    group: 'workspace',
    match: ['/usage'],
  },
]

/** Пункты, положенные этой роли. */
export function navItemsFor(role: string): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(role as MemberRole),
  )
}

/**
 * Какой пункт открыт сейчас.
 *
 * Берётся самое длинное совпадение: будь у нас `/app` и `/app/settings`,
 * на втором должен подсветиться второй, а не оба и не первый. Совпадением
 * считается точный путь или путь с косой чертой — иначе `/apps` подсветило бы
 * и `/app`, и наоборот.
 */
export function activeNavId(pathname: string, items: NavItem[] = NAV_ITEMS): string | null {
  let winner: { id: string; length: number } | null = null

  for (const item of items) {
    for (const prefix of item.match) {
      const hit = pathname === prefix || pathname.startsWith(`${prefix}/`)
      if (!hit) continue
      if (!winner || prefix.length > winner.length) winner = { id: item.id, length: prefix.length }
    }
  }

  return winner?.id ?? null
}
