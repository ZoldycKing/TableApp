import { describe, expect, it, vi } from 'vitest'
import { listenerCount, publishTable, subscribeTable } from './live'

/**
 * Шина живых обновлений.
 *
 * Проверяется ровно то, что ломается молча: событие не должно уходить
 * в чужую таблицу, отписка обязана освобождать место (иначе каждая закрытая
 * вкладка оставляла бы слушателя навсегда), а сломавшийся слушатель не должен
 * мешать остальным — на той стороне запись в базу, и ронять её из-за оборванного
 * соединения нельзя.
 */

describe('кому уходит событие', () => {
  it('только тем, кто смотрит на эту таблицу', () => {
    const mine = vi.fn()
    const other = vi.fn()
    const offMine = subscribeTable('tbl_1', mine)
    const offOther = subscribeTable('tbl_2', other)

    publishTable('tbl_1', 'rows')

    expect(mine).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
    expect(mine.mock.calls[0]![0]).toMatchObject({ kind: 'rows' })

    offMine()
    offOther()
  })

  it('после отписки не уходит ничего, и слушатель не остаётся в памяти', () => {
    const listener = vi.fn()
    const off = subscribeTable('tbl_3', listener)
    expect(listenerCount('tbl_3')).toBe(1)

    off()
    publishTable('tbl_3', 'rows')

    expect(listener).not.toHaveBeenCalled()
    expect(listenerCount('tbl_3')).toBe(0)
  })

  it('упавший слушатель не мешает остальным', () => {
    const broken = vi.fn(() => {
      throw new Error('соединение оборвалось')
    })
    const fine = vi.fn()
    const offBroken = subscribeTable('tbl_4', broken)
    const offFine = subscribeTable('tbl_4', fine)

    expect(() => publishTable('tbl_4', 'structure')).not.toThrow()
    expect(fine).toHaveBeenCalledTimes(1)

    offBroken()
    offFine()
  })

  it('без слушателей публикация ничего не делает', () => {
    expect(() => publishTable('tbl_nobody', 'rows')).not.toThrow()
    expect(listenerCount('tbl_nobody')).toBe(0)
  })
})
