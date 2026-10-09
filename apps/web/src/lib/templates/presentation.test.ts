import { describe, expect, it } from 'vitest'
import { checkAppReferences } from '../app-references'
import { computeDashboards } from '../dashboard-data'
import { templateExample } from './presentation'
import { TEMPLATES } from './catalog'

describe('examples and dashboards match installed presets', () => {
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
    expect(values[stock.id]).toMatchObject({ kind: 'metric', text: expect.stringMatching(/119\s135/) })
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
