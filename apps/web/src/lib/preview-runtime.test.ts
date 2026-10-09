import { describe, expect, it } from 'vitest'
import { asRole, visibleScreensFor } from './app-roles'
import { previewRuntime } from './preview-runtime'
import { templateExample } from './templates/presentation'
import type { RuntimeTable } from './app-runtime'

describe('preview identity selects both records and dashboard totals', () => {
  const example = templateExample('portal', undefined, true)
  const tables: Record<string, RuntimeTable> = Object.fromEntries(example.built.tables.map(table => [table.id, { ...table,
    fields: example.byTable.get(table.id)!, rows: example.rows.filter(row => row.tableId === table.id).map(row => ({ ...row, version: 0 })) }]))
  it('shows each customer their records and excludes other amounts before aggregation', () => {
    const orders = example.table('orders').id
    const email = example.field('orders', 'email').id
    const people = [...new Set(tables[orders]!.rows.map(row => row.data[email] as string))]
    for (const person of people) {
      const visitor = asRole('client', person)
      const app = { ...example.app, screens: visibleScreensFor(example.app, visitor) }
      const result = previewRuntime(app, example.views, tables, {}, visitor)
      const expected = tables[orders]!.rows.filter(row => row.data[email] === person)
      expect(result.tables[orders]!.rows.map(row => row.id).sort()).toEqual(expected.map(row => row.id).sort())
      const home = app.screens.find(screen => screen.type === 'dashboard')!
      if (home.type !== 'dashboard') throw new Error('dashboard missing')
      const count = home.blocks.find(block => block.type === 'metric' && block.kind === 'count' && !block.where)!
      expect(result.blocks[count.id]).toMatchObject({ kind: 'metric', text: String(expected.length) })
      const sum = home.blocks.find(block => block.type === 'metric' && block.kind === 'sum')!
      if (sum.type !== 'metric' || !sum.fieldId) throw new Error('sum missing')
      const month = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date())
      const expectedSum = expected.filter(row => sum.range !== 'month' || String(row.data[sum.dateFieldId!]).startsWith(month))
        .reduce((total, row) => total + Number(row.data[sum.fieldId!] ?? 0), 0)
      const value = result.blocks[sum.id]!
      if (value.kind !== 'metric') throw new Error('metric result missing')
      expect(Number(value.text.replace(/[^0-9,.-]/g, '').replace(',', '.'))).toBe(expectedSum)
    }
  })
  it('does not select a random customer when no email is provided', () => {
    const visitor = asRole('client')
    const result = previewRuntime({ ...example.app, screens: visibleScreensFor(example.app, visitor) }, example.views, tables, {}, visitor)
    expect(result.tables[example.table('orders').id]!.rows).toEqual([])
  })
})
