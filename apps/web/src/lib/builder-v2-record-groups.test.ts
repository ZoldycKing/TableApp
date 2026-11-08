import { expect, it } from 'vitest'
import type { AppV2Json } from '@tableapp/schema/app-v2'
import { readBuilderV2RecordGroups } from './builder-v2-record-groups'

it('paginates whole groups, includes non-matching line items in totals, and omits an incomplete amount', async () => {
  const rows: { id: string; data: Record<string, AppV2Json> }[] = [
    { id: '1', data: { order: 'A', amount: 120, item: 'Кресло' } },
    { id: '2', data: { order: 'B', amount: 360, item: 'Стол' } },
    { id: '3', data: { order: 'A', amount: 80, item: 'Стол' } },
    { id: '4', data: { order: 'B', item: 'Скрытая цена' } },
    { id: '5', data: { order: '', item: 'Стол' } },
    { id: '6', data: { order: '', item: 'Стол' } },
  ]
  const page = (anchor?: typeof rows[number]) => readBuilderV2RecordGroups({
    config: { fieldId: 'order', amountFieldId: 'amount' },
    rows: (async function* () { yield* rows })(),
    anchor,
    pageSize: 1,
    matchesSearch: row => row.data.item === 'Стол',
    compare: (left, right) => left.id.localeCompare(right.id),
    project: row => ({ id: row.id, tableId: 'orders', values: row.data, display: {} }),
    next: (row, hasNext) => hasNext ? row?.id ?? null : null,
  })
  expect(await page()).toMatchObject({ total: 4, next: '1', rows: [{ id: '1', summary: { count: 2, amount: 200 } }] })
  expect(await page(rows[0])).toMatchObject({ total: 4, next: '2', rows: [{ id: '2', summary: { count: 2, amount: null } }] })
  expect(await page(rows[4])).toMatchObject({ total: 4, next: null, rows: [{ id: '6', summary: { count: 1, amount: null } }] })
})
