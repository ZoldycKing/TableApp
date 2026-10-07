import type { Field } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { diffChange } from './history'

const text = (id: string, name: string): Field =>
  ({ id, name, type: 'text', options: {} }) as unknown as Field

const rollup = (id: string, name: string): Field =>
  ({ id, name, type: 'rollup', options: {} }) as unknown as Field

const fields = [text('fld_a', 'Клиент'), text('fld_b', 'Статус'), rollup('fld_r', 'Итого')]

describe('разбор записи журнала', () => {
  it('показывает изменённое поле как «было — стало»', () => {
    const diffs = diffChange('update', { fld_b: 'Новая' }, { fld_b: 'Готово' }, fields)
    expect(diffs).toEqual([{ fieldId: 'fld_b', name: 'Статус', from: 'Новая', to: 'Готово' }])
  })

  it('молчит, если значение не изменилось', () => {
    expect(diffChange('update', { fld_b: 'Готово' }, { fld_b: 'Готово' }, fields)).toEqual([])
  })

  it('пропускает вычисляемые поля: их никто не правил руками', () => {
    const diffs = diffChange('update', { fld_r: 1 }, { fld_r: 2 }, fields)
    expect(diffs).toEqual([])
  })

  it('при создании перечисляет только заполненное', () => {
    const diffs = diffChange('create', null, { fld_a: 'ООО «Вектор»', fld_b: '' }, fields)
    expect(diffs.map((item) => item.name)).toEqual(['Клиент'])
    expect(diffs[0]!.from).toBe('')
  })

  it('при удалении показывает, что было', () => {
    const diffs = diffChange('delete', { fld_a: 'ООО «Вектор»' }, null, fields)
    expect(diffs[0]).toMatchObject({ name: 'Клиент', from: 'ООО «Вектор»', to: '' })
  })

  it('не врёт про имя поля, удалённого после правки', () => {
    const diffs = diffChange('update', { fld_x: 'было' }, { fld_x: 'стало' }, fields)
    expect(diffs[0]!.name).toBe('Удалённое поле fld_x')
  })

  it('сортирует по имени поля, чтобы порядок не прыгал', () => {
    const diffs = diffChange('update', { fld_b: 'Новая', fld_a: 'Ромашка' }, { fld_b: 'Готово', fld_a: 'Вектор' }, fields)
    expect(diffs.map((item) => item.name)).toEqual(['Клиент', 'Статус'])
  })
})
