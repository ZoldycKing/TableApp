import { normalizeFieldOptions, type Field } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { decideMutation, MISSING_ROW, type Mutation, type RowState } from './sync-merge'

const field = (id: string, type: string, options: Record<string, unknown> = {}): Field =>
  ({ id, name: id, type, options: normalizeFieldOptions(type as never, options) }) as unknown as Field

const FIELDS = [
  field('fld_name', 'text'),
  field('fld_stock', 'number'),
  field('fld_total', 'rollup', { relationFieldId: 'fld_r', targetFieldId: 'fld_t', fn: 'sum' }),
]

const row = (data: Record<string, unknown>, extra: Partial<RowState> = {}): RowState => ({
  exists: true,
  deleted: false,
  version: 1,
  data,
  ...extra,
})

const edit = (patch: Partial<Mutation> = {}): Mutation => ({
  id: 'mut_1',
  op: 'update',
  rowId: 'row_1',
  fieldId: 'fld_stock',
  base: 8,
  next: 7,
  ...patch,
})

describe('правка ячейки', () => {
  it('применяется, если ячейку не трогали', () => {
    expect(decideMutation(edit(), row({ fld_stock: 8 }), FIELDS, false)).toEqual({ status: 'applied', value: 7 })
  })

  it('уходит в конфликт, если значение успели поменять', () => {
    const decision = decideMutation(edit(), row({ fld_stock: 5 }), FIELDS, false)
    expect(decision).toMatchObject({ status: 'conflict', current: 5 })
  })

  it('не считает конфликтом разную запись одного значения', () => {
    // В старых строках число могло сохраниться строкой.
    const decision = decideMutation(edit({ base: 8 }), row({ fld_stock: '8' }), FIELDS, false)
    expect(decision.status).toBe('applied')
  })

  it('правка соседнего поля не мешает: конфликт считается по ячейке', () => {
    const decision = decideMutation(
      edit({ fieldId: 'fld_name', base: 'Перфоратор', next: 'Перфоратор 800' }),
      row({ fld_name: 'Перфоратор', fld_stock: 5 }),
      FIELDS,
      false,
    )
    expect(decision.status).toBe('applied')
  })

  it('повторная отправка не применяется дважды', () => {
    expect(decideMutation(edit(), row({ fld_stock: 8 }), FIELDS, true)).toEqual({ status: 'duplicate' })
  })

  it('правка в уже такое же значение закрывается, а не висит в очереди', () => {
    const decision = decideMutation(edit({ next: 8 }), row({ fld_stock: 8 }), FIELDS, false)
    expect(decision.status).toBe('applied')
  })
})

describe('изменения схемы, пока человек был офлайн', () => {
  it('правка в удалённое поле отбрасывается с объяснением', () => {
    const decision = decideMutation(edit({ fieldId: 'fld_gone' }), row({}), FIELDS, false)
    expect(decision).toEqual({ status: 'dropped', reason: 'Поле удалили' })
  })

  it('вычисляемое поле с устройства не принимается', () => {
    const decision = decideMutation(edit({ fieldId: 'fld_total', base: 100, next: 200 }), row({ fld_total: 100 }), FIELDS, false)
    expect(decision.status).toBe('dropped')
  })

  it('значение, не подходящее новому типу поля, отбрасывается', () => {
    const decision = decideMutation(edit({ next: { что: 'то' } }), row({ fld_stock: 8 }), FIELDS, false)
    expect(decision).toEqual({ status: 'dropped', reason: 'Значение не подходит типу поля' })
  })
})

describe('операции над строкой', () => {
  it('создание применяется всегда: идентификатор выдан на устройстве', () => {
    expect(decideMutation(edit({ op: 'create' }), MISSING_ROW, FIELDS, false)).toEqual({ status: 'applied' })
  })

  it('повторное создание той же строки не плодит дубль', () => {
    expect(decideMutation(edit({ op: 'create' }), row({}), FIELDS, false)).toEqual({ status: 'duplicate' })
  })

  it('удаление применяется, если строку не меняли', () => {
    const decision = decideMutation(edit({ op: 'delete', baseVersion: 1 }), row({}, { version: 1 }), FIELDS, false)
    expect(decision.status).toBe('applied')
  })

  it('удаление уходит в разбор, если строку успели изменить', () => {
    const decision = decideMutation(edit({ op: 'delete', baseVersion: 1 }), row({}, { version: 4 }), FIELDS, false)
    expect(decision).toMatchObject({ status: 'conflict' })
  })

  it('правка в удалённую строку не теряется, а предлагает вернуть её', () => {
    const decision = decideMutation(edit(), row({ fld_stock: 8 }, { deleted: true }), FIELDS, false)
    expect(decision).toMatchObject({ status: 'conflict', reason: 'Строку удалили, пока вы были офлайн' })
  })

  it('правка в никогда не существовавшую строку отбрасывается', () => {
    expect(decideMutation(edit(), MISSING_ROW, FIELDS, false)).toEqual({ status: 'dropped', reason: 'Строка не найдена' })
  })
})
