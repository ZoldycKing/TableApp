import { describe, expect, it } from 'vitest'
import { clearUnsaved, hasUnsaved, markUnsaved, unsavedKeys } from './unsaved'

/**
 * Реестр несохранённого.
 *
 * Проверяется ровно то, из-за чего он заведён: пока открыт хоть один
 * редактор, живые обновления не трогают страницу, а забытая отметка
 * не должна останавливать их навсегда.
 */

describe('кто держит обновление', () => {
  it('пустой реестр никого не держит', () => {
    for (const key of unsavedKeys()) clearUnsaved(key)
    expect(hasUnsaved()).toBe(false)
  })

  it('открытый редактор держит, закрытый отпускает', () => {
    markUnsaved('cell:fld_1')
    expect(hasUnsaved()).toBe(true)
    clearUnsaved('cell:fld_1')
    expect(hasUnsaved()).toBe(false)
  })

  it('несколько редакторов сразу: отпускает последний', () => {
    markUnsaved('cell:fld_1')
    markUnsaved('row-card')
    clearUnsaved('cell:fld_1')
    expect(hasUnsaved()).toBe(true)
    clearUnsaved('row-card')
    expect(hasUnsaved()).toBe(false)
  })

  it('повторная отметка тем же ключом не копится', () => {
    markUnsaved('row-card')
    markUnsaved('row-card')
    clearUnsaved('row-card')
    expect(hasUnsaved()).toBe(false)
  })
})
