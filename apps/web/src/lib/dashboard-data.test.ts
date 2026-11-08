import type { Block, Field, View } from '@tableapp/schema'
import { newBlock } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { computeBlocks, type ComputeArgs } from './dashboard-data'
import type { TableRow } from './table-store'

/**
 * Проверки расчёта блоков сводки.
 *
 * Главное здесь — не арифметика, а порядок: права применяются до подсчёта,
 * и ничто после них выборку не расширяет. Ошибку в этом месте глазом
 * не увидеть — число выглядит одинаково правдоподобно и верное, и чужое.
 */

const title = { id: 'fld_title', tableId: 'tbl_1', name: 'Заказ', type: 'text', position: 'a', options: {} } as unknown as Field
const status = {
  id: 'fld_status',
  tableId: 'tbl_1',
  name: 'Статус',
  type: 'single_select',
  position: 'b',
  options: {
    choices: [
      { id: 'new', name: 'Новый', color: 'blue' },
      { id: 'done', name: 'Готов', color: 'green' },
    ],
  },
} as unknown as Field
const total = {
  id: 'fld_total',
  tableId: 'tbl_1',
  name: 'Сумма',
  type: 'number',
  position: 'c',
  options: { precision: 0, format: 'currency' },
} as unknown as Field
const margin = {
  id: 'fld_margin',
  tableId: 'tbl_1',
  name: 'Себестоимость',
  type: 'number',
  position: 'd',
  options: { precision: 0, format: 'plain' },
} as unknown as Field

const fields = [title, status, total, margin]

const view = {
  id: 'viw_1',
  tableId: 'tbl_1',
  name: 'Все заказы',
  position: 'a',
  type: 'grid',
  config: { filter: null, sorts: [], groupBy: [], hiddenFieldIds: [], fieldOrder: [], rowHeight: 'short' },
} as unknown as View

/** Строки, какими они приходят из рантайма: уже отобранные правами. */
function rows(count: number, from = 0): TableRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row_${from + index}`,
    position: String.fromCharCode(97 + index),
    data: {
      [title.id]: `Заказ ${from + index + 1}`,
      [status.id]: index % 2 === 0 ? 'new' : 'done',
      [total.id]: 100,
      [margin.id]: 40,
    },
  }))
}

function args(blocks: Block[], patch: Partial<ComputeArgs> = {}): ComputeArgs {
  return {
    blocks,
    views: { viw_1: view },
    tables: { tbl_1: { fields, rows: rows(10) } },
    screenIds: new Set(['scr_list', 'scr_detail']),
    roleIds: new Set(['client', 'staff']),
    ...patch,
  }
}

function metric(patch: Record<string, unknown> = {}, id = 'blk_1'): Block {
  return { ...newBlock('metric', { id, position: 'a', viewId: 'viw_1' }), ...patch } as Block
}

describe('подсчёт идёт по тем строкам, что человеку положены', () => {
  it('отличает измеренный ноль от отсутствующих значений', () => {
    const block = metric({ kind: 'sum', fieldId: total.id, format: 'plain' })
    const zero = computeBlocks(args([block], { tables: { tbl_1: { fields, rows: [{ id: 'row_zero', position: 'a', data: { [total.id]: 0 } }] } } }))
    const missing = computeBlocks(args([block], { tables: { tbl_1: { fields, rows: [] } } }))
    expect(zero[block.id]).toMatchObject({ kind: 'metric', empty: false, text: '0', caption: 'за всё время' })
    expect(missing[block.id]).toMatchObject({ kind: 'metric', empty: true, text: '—', caption: 'Нет данных для расчёта' })
  })
  it('клиент со своими тремя заказами из ста видит три', () => {
    // Рантайм отдаёт сюда только свои строки. Блок не может дотянуться
    // до остальных: других строк у него просто нет.
    const block = metric({ kind: 'count' })
    const own = computeBlocks(args([block], { tables: { tbl_1: { fields, rows: rows(3) } } }))
    const all = computeBlocks(args([block], { tables: { tbl_1: { fields, rows: rows(100) } } }))

    expect((own[block.id] as { text: string }).text).toBe('3')
    expect((all[block.id] as { text: string }).text).toBe('100')
  })

  it('сумма по колонке, закрытой роли, не считается вовсе', () => {
    const block = metric({ kind: 'sum', fieldId: margin.id, title: 'Себестоимость' })
    const result = computeBlocks(
      args([block], { readable: { tbl_1: new Set([title.id, status.id, total.id]) }, roleName: 'Клиент' }),
    )

    // Не ноль и не прочерк в разметке, а отсутствие числа: показывать нечего.
    expect(result[block.id]!.kind).toBe('broken')
    expect(JSON.stringify(result[block.id])).not.toContain('400')
  })

  it('по открытой колонке та же сумма считается', () => {
    const block = metric({ kind: 'sum', fieldId: total.id })
    const result = computeBlocks(
      args([block], { readable: { tbl_1: new Set([title.id, status.id, total.id]) } }),
    )

    expect(result[block.id]!.kind).toBe('metric')
    expect((result[block.id] as { text: string }).text).toContain('1')
  })

  it('в готовом итоге нет значений отдельных строк', () => {
    const block = metric({ kind: 'sum', fieldId: total.id })
    const result = computeBlocks(args([block]))
    // Наружу уходит одна строка с числом, а не сто значений колонки.
    expect(Object.keys(result[block.id]!).sort()).toEqual(['caption', 'compared', 'delta', 'empty', 'kind', 'text'])
  })
})

describe('отбор блока', () => {
  it('сужает выборку', () => {
    const block = metric({
      kind: 'count',
      filter: {
        id: 'flt_1',
        conjunction: 'and',
        conditions: [{ id: 'cnd_1', fieldId: status.id, op: 'is', value: 'new' }],
      },
    })

    expect((computeBlocks(args([block]))[block.id] as { text: string }).text).toBe('5')
  })

  it('не может расширить: строк, которых нет, отбор не вернёт', () => {
    const block = metric({
      kind: 'count',
      filter: {
        id: 'flt_1',
        conjunction: 'or',
        conditions: [{ id: 'cnd_1', fieldId: status.id, op: 'is_not_empty', value: null }],
      },
    })

    const result = computeBlocks(args([block], { tables: { tbl_1: { fields, rows: rows(3) } } }))
    expect((result[block.id] as { text: string }).text).toBe('3')
  })
})

describe('пустота и поломки', () => {
  it('без данных число ноль, а список пустой', () => {
    const number = metric({ kind: 'count' })
    const list = { ...newBlock('list', { id: 'blk_2', position: 'b', viewId: 'viw_1' }), titleFieldId: title.id } as Block
    const result = computeBlocks(args([number, list], { tables: { tbl_1: { fields, rows: [] } } }))

    expect((result[number.id] as { text: string }).text).toBe('0')
    expect((result[list.id] as { items: unknown[] }).items).toEqual([])
  })

  it('удалённая колонка не роняет расчёт остальных блоков', () => {
    const broken = metric({ kind: 'sum', fieldId: 'fld_udalili' }, 'blk_broken')
    const fine = metric({ kind: 'count' }, 'blk_fine')
    const result = computeBlocks(args([broken, fine]))

    expect(result['blk_broken']!.kind).toBe('broken')
    expect((result['blk_fine'] as { text: string }).text).toBe('10')
  })

  it('удалённое представление не роняет расчёт', () => {
    const block = metric({ source: { viewId: 'viw_udalili' } })
    expect(computeBlocks(args([block]))[block.id]!.kind).toBe('broken')
  })
})

describe('данные читаются по разу', () => {
  it('шесть блоков по одному представлению не читают таблицу шесть раз', () => {
    // Иначе каждый блок прогонял бы фильтры представления заново по всей
    // таблице: на десятке блоков это десяток проходов по тысячам строк.
    const count = (howMany: number) => {
      let reads = 0
      const counted = new Proxy(
        { tbl_1: { fields, rows: rows(10) } },
        {
          get(target, key: string) {
            reads += 1
            return target[key as 'tbl_1']
          },
        },
      )
      const blocks = Array.from({ length: howMany }, (_, index) => metric({ kind: 'count' }, `blk_${index}`))
      const result = computeBlocks(args(blocks, { tables: counted }))
      expect(Object.keys(result)).toHaveLength(howMany)
      return reads
    }

    // Число обращений к таблице не зависит от числа блоков над ней.
    expect(count(6)).toBe(count(1))
  })
})

describe('доска', () => {
  it('считает по вариантам колонки выбора', () => {
    const block = {
      ...newBlock('pipeline', { id: 'blk_p', position: 'a', viewId: 'viw_1' }),
      stackFieldId: status.id,
    } as Block

    const result = computeBlocks(args([block])) as Record<string, { columns: { id: string; count: number }[] }>
    expect(result['blk_p']!.columns.map((column) => [column.id, column.count])).toEqual([
      ['new', 5],
      ['done', 5],
    ])
  })

  it('карточки в колонках появляются только когда их попросили', () => {
    const base = {
      ...newBlock('pipeline', { id: 'blk_p', position: 'a', viewId: 'viw_1' }),
      stackFieldId: status.id,
      cardTitleFieldId: title.id,
    }
    const bare = computeBlocks(args([base as Block])) as Record<string, { columns: { cards: unknown[] }[] }>
    const withCards = computeBlocks(args([{ ...base, cardLimit: 2 } as Block])) as Record<
      string,
      { columns: { cards: unknown[] }[] }
    >

    expect(bare['blk_p']!.columns[0]!.cards).toEqual([])
    expect(withCards['blk_p']!.columns[0]!.cards).toHaveLength(2)
  })
})
