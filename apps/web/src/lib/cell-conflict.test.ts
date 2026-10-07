import { describe, expect, it } from 'vitest'
import { sameCellValue } from './cell-conflict'

/**
 * Сверка основания правки.
 *
 * Ошибка в любую сторону дорогая: слишком строгое сравнение отклоняет
 * нормальные правки и человек не может работать, слишком мягкое — пропускает
 * затирание чужой работы, о котором никто не узнает.
 */

describe('значение не изменилось', () => {
  it('пустое, отсутствующее и пустая строка — одно и то же', () => {
    // Колонка, которой не касались, и колонка, которую очистили, для человека
    // выглядят одинаково; отличать их значило бы отклонять правку на ровном месте.
    expect(sameCellValue(null, undefined)).toBe(true)
    expect(sameCellValue('', null)).toBe(true)
    expect(sameCellValue(undefined, '')).toBe(true)
  })

  it('числа, строки и логические сравниваются как есть', () => {
    expect(sameCellValue(42, 42)).toBe(true)
    expect(sameCellValue('Вектор', 'Вектор')).toBe(true)
    expect(sameCellValue(false, false)).toBe(true)
  })

  it('порядок ключей в объекте значения не меняет', () => {
    // Вложение приезжает из браузера и из базы с разным порядком полей.
    expect(sameCellValue({ key: 'a', name: 'б' }, { name: 'б', key: 'a' })).toBe(true)
  })

  it('массивы сравниваются по содержимому', () => {
    expect(sameCellValue(['sel_1', 'sel_2'], ['sel_1', 'sel_2'])).toBe(true)
    expect(sameCellValue([{ key: 'k', size: 10 }], [{ size: 10, key: 'k' }])).toBe(true)
  })
})

describe('значение изменилось', () => {
  it('другое число, строка или логическое', () => {
    expect(sameCellValue(42, 43)).toBe(false)
    expect(sameCellValue('Вектор', 'Вектор ')).toBe(false)
    expect(sameCellValue(false, true)).toBe(false)
  })

  it('ноль и пусто — разные вещи', () => {
    // Иначе правка «0 → 5» проходила бы поверх чужого «null → 7».
    expect(sameCellValue(0, null)).toBe(false)
    expect(sameCellValue(0, '')).toBe(false)
  })

  it('порядок элементов массива значим', () => {
    expect(sameCellValue(['a', 'b'], ['b', 'a'])).toBe(false)
  })

  it('добавленный элемент виден', () => {
    expect(sameCellValue([{ key: 'k' }], [{ key: 'k' }, { key: 'j' }])).toBe(false)
  })
})
