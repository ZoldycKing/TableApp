import { describe, expect, it } from 'vitest'
import { removableSamples, type SampleRow } from './template-samples'

const row = (id: string, tableId: string, sample = true, data = {}): SampleRow => ({ id, tableId, sample, data, deletedAt: null })
const relations = [{ id: 'item', tableId: 'movements', targetTableId: 'items' }, { id: 'movements', tableId: 'items', targetTableId: 'movements' }]
describe('preparing a template without deleting retained data', () => {
  it('removes an untouched connected set, including cyclic sample links', () => {
    expect(removableSamples(['items', 'movements'], [row('a', 'items', true, { movements: ['b'] }), row('b', 'movements', true, { item: ['a'] })], relations).map(row => row.id)).toEqual(['a', 'b'])
  })
  it('preserves a sample product once a real operation uses it, transitively retaining its history', () => {
    const records = [row('a', 'items', true, { movements: ['b', 'real'] }), row('b', 'movements', true, { item: ['a'] }), row('real', 'movements', false, { item: ['a'] }), row('unused', 'items')]
    expect(removableSamples(['items', 'movements'], records, relations).map(row => row.id)).toEqual(['unused'])
  })
  it('keeps edited examples, and ignores deleted incoming references', () => {
    const records = [row('a', 'items', false), row('b', 'items'), { ...row('old', 'movements', false, { item: ['b'] }), deletedAt: new Date() }]
    expect(removableSamples(['items', 'movements'], records, relations).map(row => row.id)).toEqual(['b'])
  })
  it('protects references from another table even when that row is another template example', () => {
    expect(removableSamples(['items'], [row('a', 'items'), row('order', 'orders', true, { product: ['a'] })], [{ id: 'product', tableId: 'orders', targetTableId: 'items' }])).toEqual([])
  })
  it('keeps sample operations of an edited product even without a stored backlink', () => {
    expect(removableSamples(['items', 'movements'], [row('a', 'items', false), row('b', 'movements', true, { item: ['a'] })], relations)).toEqual([])
  })
  it('only follows a reference in its declared target table', () => {
    expect(removableSamples(['items'], [row('a', 'items'), row('real', 'orders', false, { product: ['a'] })], [{ id: 'product', tableId: 'orders', targetTableId: 'other' }]).map(row => row.id)).toEqual(['a'])
  })
})
