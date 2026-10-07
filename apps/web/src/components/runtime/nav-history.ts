/**
 * Где человек находится внутри приложения — и как это пережить нажатие «Назад».
 *
 * Приложение живёт на одном адресе: экраны переключаются в браузере, сервер
 * об этом не спрашивают. Пока состояние лежало только в памяти страницы,
 * кнопка «Назад» уводила с приложения целиком — из карточки заказа сразу
 * на предыдущий сайт. На телефоне это тот же жест, которым закрывают
 * что угодно, и люди нажимают его не задумываясь.
 *
 * Поэтому каждый переход кладётся в историю браузера. Разбор адреса и разбор
 * `history.state` живут здесь, отдельно от самой оболочки: это чистые
 * функции, их видно целиком и можно проверить тестом.
 *
 * `history.state` — не наши данные. Туда пишет и Next, и страница до нас,
 * и там лежит то, что осталось от прошлой версии приложения у человека
 * в открытой вкладке. Поэтому всё, что оттуда приходит, разбирается
 * с проверкой, а не приводится к типу.
 */

export type NavEntry = { screenId: string; rowId: string | null }

/** Отбор одного списка: выбранный статус и строка поиска. */
export type ListState = { choiceId: string | null; query: string }

export const EMPTY_LIST_STATE: ListState = { choiceId: null, query: '' }

export type NavState = {
  /** Путь вглубь: последний элемент — то, что человек видит сейчас. */
  stack: NavEntry[]
  /** Отбор по каждому списку: чтобы «Назад» возвращал и его. */
  lists: Record<string, ListState>
}

/** Ключ, под которым наше состояние лежит в `history.state` рядом с чужим. */
export const NAV_KEY = 'tableapp:nav'

/** Имена параметров короткие: адрес приложения человек видит и пересылает. */
const SCREEN_PARAM = 'e'
const ROW_PARAM = 'r'

/**
 * Адрес текущего экрана.
 *
 * Нужен не ради красоты: по нему страница, открытая заново или присланная
 * коллеге, показывает то же самое, а не начинается сначала. У домашнего
 * экрана параметров нет — адрес приложения должен оставаться коротким.
 */
export function navSearch(entry: NavEntry, home: string): string {
  if (entry.screenId === home && entry.rowId === null) return ''
  const params = new URLSearchParams()
  params.set(SCREEN_PARAM, entry.screenId)
  if (entry.rowId) params.set(ROW_PARAM, entry.rowId)
  return `?${params.toString()}`
}

/**
 * Куда вести при открытии страницы.
 *
 * Экран из адреса берётся только если он есть в приложении **и** открыт этому
 * человеку — это решает `known`. Иначе по ссылке можно было бы попасть
 * на чужой экран: показать его нечем, но пытаться не нужно.
 */
export function navFromSearch(search: string, known: (screenId: string) => boolean): NavEntry | null {
  const params = new URLSearchParams(search)
  const screenId = params.get(SCREEN_PARAM)
  if (!screenId || !known(screenId)) return null
  return { screenId, rowId: params.get(ROW_PARAM) || null }
}

function isEntry(value: unknown, known: (screenId: string) => boolean): value is NavEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as { screenId?: unknown; rowId?: unknown }
  if (typeof entry.screenId !== 'string' || !known(entry.screenId)) return false
  return entry.rowId === null || typeof entry.rowId === 'string'
}

function readLists(value: unknown): Record<string, ListState> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, ListState> = {}
  for (const [screenId, state] of Object.entries(value as Record<string, unknown>)) {
    if (!state || typeof state !== 'object') continue
    const list = state as { choiceId?: unknown; query?: unknown }
    out[screenId] = {
      choiceId: typeof list.choiceId === 'string' ? list.choiceId : null,
      query: typeof list.query === 'string' ? list.query : '',
    }
  }
  return out
}

/**
 * Наше состояние из `history.state`.
 *
 * Возвращает `null` на всём, что не похоже на наше: на чужой записи, на пустой
 * истории и на состоянии, сохранённом прошлой версией приложения, где экранов
 * с такими идентификаторами уже нет. Вернуть `null` значит «не трогаем» —
 * человек останется там, где стоял, а не провалится на пустой экран.
 */
export function navFromHistory(
  state: unknown,
  known: (screenId: string) => boolean,
): NavState | null {
  if (!state || typeof state !== 'object') return null
  const mine = (state as Record<string, unknown>)[NAV_KEY]
  if (!mine || typeof mine !== 'object') return null

  const { stack, lists } = mine as { stack?: unknown; lists?: unknown }
  if (!Array.isArray(stack) || stack.length === 0) return null
  if (!stack.every((entry) => isEntry(entry, known))) return null

  return { stack: stack as NavEntry[], lists: readLists(lists) }
}

/**
 * Состояние для записи в историю: наше кладём рядом с чужим, не затирая.
 *
 * Next держит в `history.state` своё, и переписать запись целиком значит
 * сломать его собственную навигацию по страницам.
 */
export function withNav(existing: unknown, nav: NavState): Record<string, unknown> {
  const base = existing && typeof existing === 'object' ? (existing as Record<string, unknown>) : {}
  return { ...base, [NAV_KEY]: nav }
}
