import { describe, expect, it } from 'vitest'
import { checkAppReferences } from '../app-references'
import { computeDashboards } from '../dashboard-data'
import { templateExample } from './presentation'
import { TEMPLATES } from './catalog'

describe('examples and dashboards match installed presets', () => {
  it.each(['2026-10-30T00:15:00Z', '2026-10-30T22:15:00Z', '2026-12-31T23:30:00Z'])('production has a current-day run with matching movements at %s', instant => {
    const now = new Date(instant)
    const example = templateExample('proizvodstvo', now)
    const production = example.built.production!
    const values = computeDashboards(example.app, { now, role: 'director',
      views: Object.fromEntries(example.views.map(view => [view.id, view])),
      tables: Object.fromEntries(example.built.tables.map(table => [table.id, { fields: example.byTable.get(table.id)!,
        rows: example.rows.filter(row => row.tableId === table.id).map(row => ({ ...row, version: 0 })) }])) })
    const home = example.app.screens.find(screen => screen.type === 'dashboard')!
    if (home.type !== 'dashboard') throw new Error('missing production summary')
    for (const [title, expected] of [['Произведено сегодня', '20000'], ['Брак сегодня', '320']]) {
      const block = home.blocks.find(block => block.title === title)!
      const value = values[block.id]!
      expect(value.kind).toBe('metric')
      if (value.kind === 'metric') expect(value.text.replace(/\s/g, '')).toBe(expected)
    }
    for (const movement of example.rows.filter(row => row.tableId === production.tables.movements)) {
      const runIds = movement.data[production.movement.run] as string[] | undefined
      if (!runIds?.length) continue
      const run = example.rows.find(row => row.id === runIds[0])!
      expect(movement.data[production.movement.date]).toBe(run.data[production.run.date])
    }
  })

  it('keeps production lookup helpers for formulas while hiding duplicate names in starter views', () => {
    const example = templateExample('proizvodstvo')
    for (const [tableKey, helperKeys] of [['production', ['productName']], ['norms', ['productName', 'materialName']], ['movements', ['materialName']]] as const) {
      for (const key of helperKeys) {
        const field = example.field(tableKey, key)
        expect(field.type).toBe('lookup')
        const views = example.views.filter(view => view.tableId === example.table(tableKey).id)
        expect(views.length).toBeGreaterThan(0)
        expect(views.every(view => view.config.hiddenFieldIds.includes(field.id))).toBe(true)
      }
    }
    const title = example.field('production', 'name')
    const run = example.rows.find(row => row.tableId === title.tableId)!
    expect(String(run.data[title.id])).toContain('Пивной пакет 1 л')
  })
  it('builds every template using actual fields and valid screen references', () => {
    for (const template of TEMPLATES) {
      const example = templateExample(template.id)
      expect(checkAppReferences(example.app, { tableIds: new Set(example.built.tables.map(table => table.id)),
        fields: new Map(example.fields.map(field => [field.id, field])), views: new Map(example.views.map(view => [view.id, view])) }), template.id).toBeNull()
      expect(example.rows.length).toBe(template.tables.reduce((n, table) => n + table.rows.length, 0))
    }
  })
  it('warehouse counts all four low items including equality and values the actual stock', () => {
    const example = templateExample('sklad')
    const items = example.rows.filter(row => row.tableId === example.table('items').id)
    expect(items.filter(row => row.data[example.field('items', 'low').id])).toHaveLength(4)
    const values = computeDashboards(example.app, { views: Object.fromEntries(example.views.map(view => [view.id, view])),
      tables: Object.fromEntries(example.built.tables.map(table => [table.id, { fields: example.byTable.get(table.id)!,
        rows: example.rows.filter(row => row.tableId === table.id).map(row => ({ ...row, version: 0 })) }])), role: 'manager' })
    const home = example.app.screens.find(screen => screen.type === 'dashboard')!
    if (home.type !== 'dashboard') throw new Error('missing dashboard')
    const stock = home.blocks.find(block => block.title === 'Стоимость запасов')!
    expect(values[stock.id]).toMatchObject({ kind: 'metric', text: expect.stringMatching(/130\s295/) })
  })
  it('does not sum price lists or use next-callback dates as sales months', () => {
    for (const id of ['katalog', 'nedvizhimost', 'crm']) {
      const example = templateExample(id, undefined, true)
      for (const screen of example.app.screens) {
        if (screen.type !== 'dashboard') continue
        const metrics = screen.blocks.filter(block => block.type === 'metric' && block.kind === 'sum')
        if (id === 'crm') expect(metrics.every(block => block.type === 'metric' && block.dateFieldId === null && block.range === 'all')).toBe(true)
        else expect(metrics).toHaveLength(0)
      }
    }
  })
  it('labels categories and unit groupings by their field and picks the actual real estate state', () => {
    for (const id of ['sklad', 'katalog', 'nedvizhimost']) {
      const example = templateExample(id, undefined, true)
      const pipelines = example.app.screens.flatMap(screen => screen.type === 'dashboard' ? screen.blocks.filter(block => block.type === 'pipeline') : [])
      for (const pipeline of pipelines) expect(pipeline.title).not.toContain('по статусам')
      if (id === 'nedvizhimost') expect(pipelines.some(block => block.type === 'pipeline' && block.stackFieldId === example.field('objects', 'status').id)).toBe(true)
    }
  })
})
