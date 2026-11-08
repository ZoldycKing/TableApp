import { describe, expect, it } from 'vitest'
import { appV2Fixture, v2Catalog } from './fixture.test-utils'
import { appV2Schema } from './schema'
import { evaluateAppV2Condition, resolveAppV2Binding } from './values'
import { validateAppV2 } from './validate'

describe('selected screen record and repeated list item', () => {
  const context = { actor: { authenticated: true, roleIds: [], id: 'u', email: 'a@example.com', name: '', company: '' }, row: { id: 'task', tableId: 'tasks', values: { folder: ['folder'], title: 'Задача' } }, screenRow: { id: 'folder', tableId: 'requests', values: { title: 'Личное' } } }
  it('resolves the two records independently and fails closed without the selected record', () => {
    expect(resolveAppV2Binding({ kind: 'row_id' }, context)).toEqual({ ok: true, value: 'task' })
    expect(resolveAppV2Binding({ kind: 'screen_row_id' }, context)).toEqual({ ok: true, value: 'folder' })
    expect(resolveAppV2Binding({ kind: 'screen_row', fieldId: 'title' }, context)).toEqual({ ok: true, value: 'Личное' })
    const filter = { op: 'includes' as const, left: { kind: 'row' as const, fieldId: 'folder' }, right: { kind: 'screen_row_id' as const } }
    expect(evaluateAppV2Condition(filter, context)).toEqual({ ok: true, value: true })
    expect(evaluateAppV2Condition(filter, { ...context, screenRow: { ...context.screenRow, id: 'other' } })).toEqual({ ok: true, value: false })
    expect(evaluateAppV2Condition(filter, { ...context, screenRow: undefined }).ok).toBe(false)
    expect(evaluateAppV2Condition({ ...filter, left: { kind: 'literal', value: 'folder' } }, context).ok).toBe(false)
  })
  it('validates both source contexts, relation targets, and screen placement', () => {
    const app = appV2Fixture(), list = app.nodes.find(node => node.id === 'task_list')!
    if (list.type !== 'collection') throw new Error('fixture')
    app.nodes.push({ ...list, id: 'nested_tasks', sourceId: 'nested_source' })
    app.screens.find(screen => screen.id === 'detail')!.rootIds.push('nested_tasks')
    app.sources.push({ ...app.sources[1]!, id: 'nested_source', screenTableId: 'requests', filter: { op: 'includes', left: { kind: 'row', fieldId: 'task_folder' }, right: { kind: 'screen_row_id' } } })
    const catalog = { ...v2Catalog, fields: new Map([...v2Catalog.fields, ['task_folder', { tableId: 'tasks', type: 'relation' as const, relationTableId: 'requests' }]]) }
    expect(validateAppV2(appV2Schema.parse(app), catalog)).toEqual([])
    expect(validateAppV2(app, { ...catalog, fields: new Map([...catalog.fields, ['task_folder', { tableId: 'tasks', type: 'relation', relationTableId: 'tasks' }]]) }).some(issue => issue.code === 'relation_context')).toBe(true)
    app.sources.at(-1)!.screenTableId = null
    expect(validateAppV2(app, catalog).some(issue => issue.code === 'missing_screen_context')).toBe(true)
    app.sources.at(-1)!.screenTableId = 'tasks'
    expect(validateAppV2(app, catalog).some(issue => issue.code === 'source_screen_context')).toBe(true)
  })
  it('keeps existing definitions structurally unchanged', () => {
    const app = appV2Fixture()
    expect(appV2Schema.parse(app)).toEqual(app)
    expect(app.sources.every(source => !Object.hasOwn(source, 'screenTableId'))).toBe(true)
  })
})
