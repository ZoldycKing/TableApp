import { describe, expect, it } from 'vitest'
import type { Block } from './app'
import { blockSchema, SPAN_BY_SIZE } from './app'
import { blockIsBroken, newBlock, validateBlock, type BlockContext } from './blocks'
import type { Field } from './fields'

/**
 * Проверки блоков сводки.
 *
 * Сломанный блок опаснее отсутствующего: он не падает, а тихо показывает ноль,
 * и человек принимает этот ноль за правду. Поэтому каждая поломка описана
 * отдельным случаем.
 */

const status: Field = {
  id: 'fld_status',
  tableId: 'tbl_1',
  name: 'Статус',
  type: 'single_select',
  position: 'b',
  options: {
    choices: [
      { id: 'new', name: 'Новая', color: 'blue' },
      { id: 'done', name: 'Готово', color: 'green' },
    ],
  },
} as unknown as Field

const cost: Field = {
  id: 'fld_cost',
  tableId: 'tbl_1',
  name: 'Себестоимость',
  type: 'number',
  position: 'c',
  options: { precision: 0, format: 'currency' },
} as unknown as Field

const title: Field = {
  id: 'fld_title',
  tableId: 'tbl_1',
  name: 'Название',
  type: 'text',
  position: 'a',
  options: {},
} as unknown as Field

const ctx: BlockContext = {
  views: { viw_1: { id: 'viw_1', name: 'Все', tableId: 'tbl_1' } },
  fields: { tbl_1: [title, status, cost] },
  screenIds: new Set(['scr_list', 'scr_detail']),
  roleIds: new Set(['client', 'staff']),
}

function metric(patch: Record<string, unknown> = {}): Block {
  return { ...newBlock('metric', { id: 'blk_1', position: 'a', viewId: 'viw_1' }), ...patch } as Block
}

describe('чтение определения', () => {
  it('новый блок проходит схему без правок', () => {
    for (const type of ['metric', 'list', 'pipeline', 'actions', 'note'] as const) {
      const parsed = blockSchema.safeParse(newBlock(type, { id: 'blk_1', position: 'a', viewId: 'viw_1' }))
      expect(parsed.success, type).toBe(true)
    }
  })

  it('прежняя ширина разворачивается в колонки', () => {
    // Определения, сохранённые до появления сетки, должны читаться дальше.
    const parsed = blockSchema.parse({
      id: 'blk_1',
      position: 'a',
      size: 'small',
      type: 'note',
      text: 'Привет',
    }) as Block

    expect(parsed.span).toEqual(SPAN_BY_SIZE.small)
    expect('size' in parsed).toBe(false)
  })

  it('заданные колонки прежняя ширина не перебивает', () => {
    const parsed = blockSchema.parse({
      id: 'blk_1',
      position: 'a',
      size: 'small',
      span: { desktop: 12, tablet: 12, mobile: 12 },
      type: 'note',
      text: '',
    }) as Block

    expect(parsed.span.desktop).toBe(12)
  })
})

describe('что сломано в блоке', () => {
  it('у исправного блока замечаний нет', () => {
    expect(validateBlock(metric({ title: 'Всего' }), ctx)).toEqual([])
  })

  it('удалённое представление — ошибка', () => {
    const problems = validateBlock(metric({ source: { viewId: 'viw_yok' } }), ctx)
    expect(blockIsBroken(problems)).toBe(true)
  })

  it('сумма без колонки — ошибка', () => {
    expect(blockIsBroken(validateBlock(metric({ kind: 'sum' }), ctx))).toBe(true)
  })

  it('сумма по удалённой колонке — ошибка', () => {
    expect(blockIsBroken(validateBlock(metric({ kind: 'sum', fieldId: 'fld_yok' }), ctx))).toBe(true)
  })

  it('срок без колонки даты — предупреждение, а не ошибка', () => {
    // Число всё равно посчитается, просто за всё время: показывать его можно.
    const problems = validateBlock(metric({ range: 'month' }), ctx)
    expect(problems).toHaveLength(1)
    expect(blockIsBroken(problems)).toBe(false)
  })

  it('колонка, закрытая роли, не даёт посчитать по ней сумму', () => {
    const problems = validateBlock(metric({ kind: 'sum', fieldId: cost.id }), {
      ...ctx,
      readable: { tbl_1: new Set([title.id, status.id]) },
      roleName: 'Клиент',
    })

    expect(blockIsBroken(problems)).toBe(true)
    expect(problems[0]!.text).toContain('Себестоимость')
  })

  it('доске нужна колонка выбора, а не любая', () => {
    const base = newBlock('pipeline', { id: 'blk_2', position: 'b', viewId: 'viw_1' })
    expect(blockIsBroken(validateBlock(base, ctx))).toBe(true)
    expect(blockIsBroken(validateBlock({ ...base, stackFieldId: cost.id } as Block, ctx))).toBe(true)
    expect(blockIsBroken(validateBlock({ ...base, stackFieldId: status.id } as Block, ctx))).toBe(false)
  })

  it('кнопка без цели — ошибка, на удалённый экран — тоже', () => {
    const base = newBlock('actions', { id: 'blk_3', position: 'c' })
    const item = { id: 'itm_1', label: 'Новая заявка', icon: 'plus', screenId: '', url: '' }

    expect(blockIsBroken(validateBlock({ ...base, items: [item] } as Block, ctx))).toBe(true)
    expect(
      blockIsBroken(validateBlock({ ...base, items: [{ ...item, screenId: 'scr_yok' }] } as Block, ctx)),
    ).toBe(true)
    expect(
      blockIsBroken(validateBlock({ ...base, items: [{ ...item, screenId: 'scr_list' }] } as Block, ctx)),
    ).toBe(false)
    expect(
      blockIsBroken(validateBlock({ ...base, items: [{ ...item, url: 'https://x.ru' }] } as Block, ctx)),
    ).toBe(false)
  })

  it('удалённый экран перехода — предупреждение: список сам по себе работает', () => {
    const base = newBlock('list', { id: 'blk_4', position: 'd', viewId: 'viw_1' })
    const problems = validateBlock({ ...base, titleFieldId: title.id, onTapScreenId: 'scr_yok' } as Block, ctx)

    expect(blockIsBroken(problems)).toBe(false)
    expect(problems).toHaveLength(1)
  })

  it('условие отбора по удалённой колонке замечено', () => {
    const problems = validateBlock(
      metric({
        filter: {
          id: 'flt_1',
          conjunction: 'and',
          conditions: [{ id: 'cnd_1', fieldId: 'fld_yok', op: 'is', value: 1 }],
        },
      }),
      ctx,
    )
    expect(problems.some((problem) => problem.text.includes('отборе'))).toBe(true)
  })

  it('галочка удалённой роли замечена', () => {
    const problems = validateBlock(metric({ roles: ['client', 'rol_yok'] }), ctx)
    expect(problems).toHaveLength(1)
    expect(blockIsBroken(problems)).toBe(false)
  })
})
