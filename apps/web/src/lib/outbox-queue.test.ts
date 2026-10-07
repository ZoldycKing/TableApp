import { describe, expect, it } from 'vitest'
import { squash } from './outbox-queue'
import type { Mutation } from './sync-merge'

const edit = (id: string, next: unknown, base: unknown, fieldId = 'fld_a', rowId = 'row_1'): Mutation =>
  ({ id, op: 'update', rowId, fieldId, base, next })

describe('схлопывание очереди', () => {
  it('серия правок одной ячейки сжимается в одну', () => {
    const result = squash([edit('m1', 1, 0), edit('m2', 2, 1), edit('m3', 3, 2)])
    expect(result).toHaveLength(1)
    // «Было» от самой первой правки — сервер сравнивает с тем, что человек видел.
    expect(result[0]).toMatchObject({ base: 0, next: 3, id: 'm3' })
  })

  it('правки разных ячеек не смешиваются', () => {
    const result = squash([edit('m1', 1, 0, 'fld_a'), edit('m2', 'x', null, 'fld_b')])
    expect(result).toHaveLength(2)
  })

  it('правки одной ячейки в разных строках не смешиваются', () => {
    const result = squash([edit('m1', 1, 0, 'fld_a', 'row_1'), edit('m2', 2, 0, 'fld_a', 'row_2')])
    expect(result).toHaveLength(2)
  })

  it('порядок сохраняется', () => {
    const result = squash([edit('m1', 'a', null, 'fld_a'), edit('m2', 'b', null, 'fld_b'), edit('m3', 'a2', 'a', 'fld_a')])
    expect(result.map((item) => item.fieldId)).toEqual(['fld_a', 'fld_b'])
    expect(result[0]).toMatchObject({ next: 'a2' })
  })

  it('создание и удаление не склеиваются между собой', () => {
    const create: Mutation = { id: 'm1', op: 'create', rowId: 'row_9', next: {} }
    const remove: Mutation = { id: 'm2', op: 'delete', rowId: 'row_9', baseVersion: 1 }
    expect(squash([create, remove])).toHaveLength(2)
  })

  it('правки до и после события строки не склеиваются друг с другом', () => {
    const result = squash([
      edit('m1', 1, 0, 'fld_a', 'row_9'),
      { id: 'm2', op: 'delete', rowId: 'row_9', baseVersion: 1 } as Mutation,
      edit('m3', 5, 4, 'fld_a', 'row_9'),
    ])
    expect(result.map((item) => item.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('пустая очередь остаётся пустой', () => {
    expect(squash([])).toEqual([])
  })
})
