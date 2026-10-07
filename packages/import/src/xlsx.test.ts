import { describe, expect, it } from 'vitest'
import { cellText } from './xlsx'

describe('значение ячейки Excel', () => {
  it('пустая ячейка становится пустой строкой, а не «null»', () => {
    expect(cellText(null)).toBe('')
    expect(cellText(undefined)).toBe('')
  })

  it('дата приводится к виду, который узнаёт определение типов', () => {
    expect(cellText(new Date(Date.UTC(2026, 2, 14)))).toBe('14.03.2026')
  })

  it('время добавляется только когда оно есть', () => {
    expect(cellText(new Date(Date.UTC(2026, 2, 14, 9, 5)))).toBe('14.03.2026 09:05')
  })

  it('логическое значение становится словом, понятным импорту', () => {
    expect(cellText(true)).toBe('да')
    expect(cellText(false)).toBe('нет')
  })

  it('число отдаётся с точкой, без разделителей разрядов', () => {
    expect(cellText(1250000.5)).toBe('1250000.5')
  })

  it('формула отдаёт посчитанное значение, а не текст формулы', () => {
    expect(cellText({ formula: 'A1*2', result: 84 })).toBe('84')
  })

  it('ошибка вычисления видна, а не молча пропадает', () => {
    expect(cellText({ error: '#DIV/0!' })).toBe('#DIV/0!')
  })

  it('форматированный текст склеивается в обычную строку', () => {
    expect(cellText({ richText: [{ text: 'ООО ' }, { text: '«Вектор»' }] })).toBe('ООО «Вектор»')
  })

  it('ссылка отдаётся подписью, а не адресом', () => {
    expect(cellText({ text: 'сайт', hyperlink: 'https://example.ru' })).toBe('сайт')
  })

  it('обрезает пробелы по краям строки', () => {
    expect(cellText('  Перфоратор  ')).toBe('Перфоратор')
  })
})
