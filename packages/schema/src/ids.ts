import { customAlphabet } from 'nanoid'

/**
 * Идентификаторы префиксные и стабильные. Поля адресуются по id, а не по имени:
 * переименование поля не должно ломать формулы, представления и привязки компонентов.
 */
export const ID_PREFIX = {
  user: 'usr',
  workspace: 'wsp',
  member: 'mbr',
  table: 'tbl',
  field: 'fld',
  row: 'row',
  view: 'viw',
  choice: 'sel',
  app: 'app',
  appConfigVersion: 'acv',
  screen: 'scr',
  component: 'cmp',
  action: 'act',
  filter: 'flt',
  group: 'grp',
  attachment: 'att',
  session: 'ses',
  token: 'tok',
  /** Попытка входа: связывает код из письма с браузером, где его запросили. */
  challenge: 'chl',
  event: 'evt',
  appUser: 'aus',
  businessCustomer: 'bcu',
  /** Роль внутри приложения: их набор задаёт владелец. */
  role: 'rol',
  change: 'chg',
  /** Один запуск импорта: файл и выбранные в нём листы. Ключ защиты от дублей. */
  run: 'run',
  /** Запись о том, что лист этого запуска уже импортирован. */
  import: 'imp',
  /** Платёж за подписку. Он же ключ идемпотентности у провайдера. */
  payment: 'pay',
} as const

export type IdKind = keyof typeof ID_PREFIX
export type Prefix = (typeof ID_PREFIX)[IdKind]
export type Id<K extends IdKind> = `${(typeof ID_PREFIX)[K]}_${string}`

const generate = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16)

export function newId<K extends IdKind>(kind: K): Id<K> {
  return `${ID_PREFIX[kind]}_${generate()}` as Id<K>
}

export function isId<K extends IdKind>(kind: K, value: unknown): value is Id<K> {
  return typeof value === 'string' && value.startsWith(`${ID_PREFIX[kind]}_`)
}
