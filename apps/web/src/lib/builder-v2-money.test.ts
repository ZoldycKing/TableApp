import { describe, expect, it } from 'vitest'
import { builderV2FormatMoneyGrouped, builderV2IsMoneyFieldLabel, builderV2MoneyInputChange, builderV2ParseMoneyInput } from './builder-v2-money'

describe('builder-v2 money input', () => {
  it('detects money labels', () => {
    expect(builderV2IsMoneyFieldLabel('Сумма')).toBe(true)
    expect(builderV2IsMoneyFieldLabel('Сумма, ₽')).toBe(true)
    expect(builderV2IsMoneyFieldLabel('Этап')).toBe(false)
  })

  it('parses grouped and nbsp values', () => {
    expect(builderV2ParseMoneyInput('778 000')).toBe(778000)
    expect(builderV2ParseMoneyInput('778\u00A0000')).toBe(778000)
    expect(builderV2ParseMoneyInput('1\u202F234,5')).toBe(1234.5)
    expect(builderV2ParseMoneyInput('')).toBeNull()
    expect(Number.isNaN(builderV2ParseMoneyInput('12a'))).toBe(true)
  })

  it('formats with grouping spaces', () => {
    expect(builderV2FormatMoneyGrouped(778000)).toBe('778 000')
    expect(builderV2FormatMoneyGrouped(1234.5)).toBe('1 234,5')
    expect(builderV2FormatMoneyGrouped(null)).toBe('')
  })

  it('keeps intermediate decimals and caret while grouping', () => {
    expect(builderV2MoneyInputChange('12,', 3)).toEqual({ text: '12,', caret: 3 })
    expect(builderV2MoneyInputChange('12,5', 4)?.text).toBe('12,5')
    expect(builderV2MoneyInputChange('778000', 6)).toEqual({ text: '778 000', caret: 7 })
    expect(builderV2ParseMoneyInput('12,5')).toBe(12.5)
  })
})
