import { describe, expect, it } from 'vitest'
import { safeNext } from './safe-next'

describe('возврат после входа', () => {
  it('пропускает внутренний путь', () => {
    expect(safeNext('/templates')).toBe('/templates')
    expect(safeNext('/t/tbl_1?view=viw_2')).toBe('/t/tbl_1?view=viw_2')
  })

  it('не уводит на чужой сайт', () => {
    expect(safeNext('https://evil.example')).toBeNull()
    expect(safeNext('//evil.example')).toBeNull()
    expect(safeNext('/\\evil.example')).toBeNull()
    expect(safeNext('javascript:alert(1)')).toBeNull()
  })

  it('пустое значение означает «как обычно»', () => {
    expect(safeNext(undefined)).toBeNull()
    expect(safeNext('')).toBeNull()
  })
})
