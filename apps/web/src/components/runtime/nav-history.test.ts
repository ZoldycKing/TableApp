import { describe, expect, it } from 'vitest'
import {
  NAV_KEY,
  navFromHistory,
  navFromSearch,
  navSearch,
  withNav,
  type NavState,
} from './nav-history'

/**
 * Разбор адреса и `history.state`.
 *
 * Проверяется в первую очередь стойкость к мусору: в `history.state` пишет
 * не только оболочка, и то, что оттуда приходит, — данные, а не наш тип.
 * Ошибка здесь роняет страницу на нажатии «Назад», то есть в том самом месте,
 * куда человек жмёт, когда уже что-то пошло не так.
 */

const known = (id: string) => id.startsWith('scr_')

it('restores the salon history section and ignores invalid section values', () => {
  const state = (bookingSection: unknown) => ({ [NAV_KEY]: { stack: [{ screenId: 'scr_list', rowId: null }],
    lists: { scr_list: { query: '', choiceId: null, bookingSection } } } })
  expect(navFromHistory(state('history'), known)?.lists.scr_list?.bookingSection).toBe('history')
  expect(navFromHistory(state('upcoming'), known)?.lists.scr_list?.bookingSection).toBe('upcoming')
  expect(navFromHistory(state('foreign'), known)?.lists.scr_list?.bookingSection).toBeUndefined()
})

it('validates receipt confirmations restored from browser history', () => {
  const result = { ok: true, name: 'Товар', before: 3, quantity: 4, after: 7, repeated: false }
  const state = (receipt: unknown) => withNav(null, { stack: [{ screenId: 'scr_receipt', rowId: 'row_item', receipt }], lists: {} } as NavState)
  expect(navFromHistory(state({ operationId: 'row_12345678', result }), known)?.stack[0]!.receipt?.result.after).toBe(7)
  for (const receipt of [null, { operationId: 'bad', result }, { operationId: 'row_12345678', result: { ...result, after: Infinity } }, { operationId: 'row_12345678', result: { ...result, quantity: -1 } }]) {
    expect(navFromHistory(state(receipt), known)).toBeNull()
  }
})
const state = (stack: { screenId: string; rowId: string | null }[]): NavState => ({
  stack,
  lists: {},
})

describe('адрес экрана', () => {
  it('у домашнего экрана параметров нет', () => {
    // Адрес приложения человек видит и пересылает — он должен быть коротким.
    expect(navSearch({ screenId: 'scr_home', rowId: null }, 'scr_home')).toBe('')
  })

  it('у остальных — экран, а при открытой записи и она', () => {
    expect(navSearch({ screenId: 'scr_list', rowId: null }, 'scr_home')).toBe('?e=scr_list')
    expect(navSearch({ screenId: 'scr_card', rowId: 'row_7' }, 'scr_home')).toBe(
      '?e=scr_card&r=row_7',
    )
  })

  it('домашний экран с открытой записью адрес всё-таки получает', () => {
    // Иначе перезагрузка на карточке вернула бы к пустому экрану.
    expect(navSearch({ screenId: 'scr_home', rowId: 'row_7' }, 'scr_home')).toBe(
      '?e=scr_home&r=row_7',
    )
  })

  it('читается обратно', () => {
    expect(navFromSearch('?e=scr_card&r=row_7', known)).toEqual({
      screenId: 'scr_card',
      rowId: 'row_7',
    })
    expect(navFromSearch('?e=scr_list', known)).toEqual({ screenId: 'scr_list', rowId: null })
  })

  it('экран, которого человеку не видно, из адреса не берётся', () => {
    /*
     * Иначе по присланной ссылке можно было бы попасть на чужой экран.
     * Показать его всё равно нечем, но и пытаться незачем — человек увидит
     * своё начало, а не «экран не найден».
     */
    expect(navFromSearch('?e=tbl_secret', known)).toBe(null)
    expect(navFromSearch('?e=', known)).toBe(null)
    expect(navFromSearch('', known)).toBe(null)
  })
})

describe('состояние в истории браузера', () => {
  it('кладётся рядом с чужим, не затирая его', () => {
    // В `history.state` пишет и Next: переписать запись целиком значит
    // сломать его собственную навигацию по страницам.
    const written = withNav({ __NA: 'next', tree: [1] }, state([{ screenId: 'scr_a', rowId: null }]))
    expect(written.__NA).toBe('next')
    expect(written.tree).toEqual([1])
    expect(written[NAV_KEY]).toBeTruthy()
  })

  it('читается обратно целиком, вместе с отбором списков', () => {
    const mine: NavState = {
      stack: [
        { screenId: 'scr_list', rowId: null },
        { screenId: 'scr_card', rowId: 'row_7' },
      ],
      lists: { scr_list: { choiceId: 'sel_2', query: 'ромашка' } },
    }
    const restored = navFromHistory(withNav(null, mine), known)
    expect(restored).toEqual(mine)
  })

  it('пустая история ничего не восстанавливает', () => {
    // Так браузер приходит на самом первом заходе.
    expect(navFromHistory(null, known)).toBe(null)
    expect(navFromHistory(undefined, known)).toBe(null)
    expect(navFromHistory({}, known)).toBe(null)
  })

  it('чужая запись не принимается за нашу', () => {
    expect(navFromHistory({ __NA: 'next' }, known)).toBe(null)
    expect(navFromHistory({ [NAV_KEY]: 'что-то' }, known)).toBe(null)
    expect(navFromHistory({ [NAV_KEY]: { stack: 'не массив' } }, known)).toBe(null)
    expect(navFromHistory({ [NAV_KEY]: { stack: [] } }, known)).toBe(null)
  })

  it('состояние от прошлой версии приложения не применяется', () => {
    /*
     * Вкладка могла провисеть неделю, а за это время экран удалили. Вернуть
     * человека на несуществующий экран — значит показать ему пустоту вместо
     * приложения; лучше оставить там, где он стоит.
     */
    const stale = withNav(null, state([{ screenId: 'scr_gone', rowId: null }]))
    expect(navFromHistory(stale, (id) => id === 'scr_alive')).toBe(null)
  })

  it('битый элемент в пути отменяет восстановление целиком', () => {
    // Половина пути хуже, чем ничего: человек окажется неизвестно где.
    const broken = { [NAV_KEY]: { stack: [{ screenId: 'scr_a', rowId: null }, { rowId: 'row_1' }] } }
    expect(navFromHistory(broken, known)).toBe(null)
  })

  it('испорченный отбор списка чинится, а не отменяет переход', () => {
    /*
     * Отбор — не путь: с пустым поиском человек увидит список целиком,
     * и это гораздо лучше, чем не вернуться назад вовсе.
     */
    const odd = {
      [NAV_KEY]: {
        stack: [{ screenId: 'scr_list', rowId: null }],
        lists: { scr_list: { choiceId: 42, query: null }, scr_x: 'мусор' },
      },
    }
    const restored = navFromHistory(odd, known)
    expect(restored?.lists.scr_list).toEqual({ choiceId: null, query: '' })
    expect(restored?.stack).toHaveLength(1)
  })
})
