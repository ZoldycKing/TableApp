import { describe, expect, it } from 'vitest'
import { templateExample } from './templates/presentation'
import { materialRecordSummary } from './table-record-summary'

describe('material record summaries', () => {
  it('keeps current stock and minimum when the configured columns are renamed', () => {
    const example = templateExample('proizvodstvo'), config = example.app.production!
    const fields = example.byTable.get(config.tables.materials)!
    const summary = materialRecordSummary(config.tables.materials, fields.map(field => ({ ...field, name: `Моя колонка ${field.id}` })), [config])!
    expect(summary).toEqual({ fieldIds: [example.field('materials', 'stock').id, example.field('materials', 'min').id], unitFieldId: config.material.unit })
    expect(summary.fieldIds).not.toContain(config.material.opening)
  })
  it('supports existing definitions and orphaned template tables without changing them', () => {
    const example = templateExample('proizvodstvo'), config = example.app.production!, fields = example.byTable.get(config.tables.materials)!
    const legacy = { ...config, material: { name: config.material.name, unit: config.material.unit, opening: config.material.opening, movements: config.material.movements } }
    expect(materialRecordSummary(config.tables.materials, fields, [legacy])).toEqual(materialRecordSummary(config.tables.materials, fields, []))
    expect(materialRecordSummary('another-table', fields, [config])?.fieldIds).not.toContain(config.material.opening)
    expect(legacy.material).not.toHaveProperty('stock')
  })
  it('does not return fields hidden by table permissions', () => {
    const example = templateExample('proizvodstvo'), config = example.app.production!
    const visible = example.byTable.get(config.tables.materials)!.filter(field => [config.material.name, config.material.unit].includes(field.id))
    expect(materialRecordSummary(config.tables.materials, visible, [config])).toBeUndefined()
  })
})
