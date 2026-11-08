import { describe, expect, it, vi } from 'vitest'
import { tablesApp, putSection } from './app-sections'
import { defaultViewConfig, normalizeFieldOptions, viewSchema, type Field } from '@tableapp/schema'
import { previewRuntime } from './preview-runtime'
import { boundedEditorPreview } from './editor-preview'

vi.mock('./app-runtime', () => ({ loadWorkspaceRuntime: vi.fn() }))

describe('bounded constructor preview', () => {
  it('keeps accurate full-table totals but ships only the first 100 list rows', () => {
    const fields = [{ id: 'data_name', tableId: 'data', name: 'Название', type: 'text', options: {}, description: null, position: 'a0' },
      { id: 'data_amount', tableId: 'data', name: 'Сумма', type: 'number', options: normalizeFieldOptions('number', {}), description: null, position: 'a1' }] as Field[]
    const source = { table: { id: 'data', name: 'Данные', primaryFieldId: 'data_name', fields }, view: viewSchema.parse({ id: 'view', tableId: 'data', name: 'Все', position: 'a0', type: 'grid', config: defaultViewConfig('grid', 'filter') }) }
    let app = tablesApp({ id: 'app', workspaceId: 'workspace', slug: 'example', name: 'Тест', email: 'owner@example.invalid', sources: [source] }, 'business')
    app = putSection(app, { source, type: 'dashboard', name: 'Обзор', icon: 'chart' }).app
    const runtimeTable = { ...source.table, rows: Array.from({ length: 10_000 }, (_, i) => ({ id: `r-${i}`, position: String(i), data: { data_name: `Строка ${i}`, data_amount: i } })) }
    const full = previewRuntime(app, [source.view], { data: runtimeTable }, {}, null)
    const sample = boundedEditorPreview(full)
    expect(sample.truncated).toBe(true)
    expect(sample.runtime.tables.data!.rows).toHaveLength(100)
    expect(Object.values(sample.runtime.screens).every(screen => screen.rowIds.length <= 100)).toBe(true)
    expect(sample.runtime.blocks).toEqual(full.blocks)
    expect(Object.values(sample.runtime.blocks).some(block => block.kind === 'metric' && Number(block.text.replace(/\D/g, '')) === 10_000)).toBe(true)
    expect(JSON.stringify(sample.runtime).length).toBeLessThan(JSON.stringify(full).length / 10)
    expect(runtimeTable.rows).toHaveLength(10_000)
  })
})
