import { expect, it } from 'vitest'
import { appV2Fixture, v2Catalog } from './fixture.test-utils'
import { appV2Schema } from './schema'
import { resolveAppV2Binding } from './values'
import { validateAppV2 } from './validate'

it('resolves typed relation values and rejects records from the wrong table', () => {
  const binding = { kind: 'record_ids' as const, tableId: 'requests', record: { kind: 'screen' as const } }, actor = { authenticated: true, roleIds: [], id: 'u', email: 'u@example.ru', company: '' }
  const context = { actor, row: { id: 'task', tableId: 'tasks', values: {} }, screenRow: { id: 'request', tableId: 'requests', values: {} } }
  expect(resolveAppV2Binding(binding, context)).toEqual({ ok: true, value: ['request'] })
  expect(resolveAppV2Binding({ ...binding, tableId: 'tasks' }, context).ok).toBe(false)
  expect(resolveAppV2Binding({ ...binding, record: { kind: 'row' } }, context).ok).toBe(false)
  expect(resolveAppV2Binding(binding, { actor }).ok).toBe(false)
})
it('checks initial value types, relation targets and backwards compatible optional properties', () => {
  const app = appV2Fixture(), input = app.nodes.find(node => node.id === 'title_input')!
  if (input.type !== 'input') throw new Error('fixture')
  input.initialValue = { kind: 'literal', value: 123 }
  expect(validateAppV2(app, v2Catalog).some(issue => issue.code === 'literal_type')).toBe(true)
  input.fieldId = 'task_parent'; input.initialValue = { kind: 'record_ids', tableId: 'requests', record: { kind: 'screen' } }; input.readOnly = true
  const form = app.nodes.find(node => node.id === 'create_form')!
  if (form.type !== 'form') throw new Error('fixture')
  form.tableId = 'tasks'; form.childIds = ['title_input']; form.events.submit = null
  // Keep the existing create workflow and its inputs intact; use a separate contextual form instead.
  const original = appV2Fixture()
  original.nodes.push({ ...form, id: 'linked_form', events: { submit: null }, childIds: ['linked_input'] }, { ...input, id: 'linked_input' })
  original.screens.find(screen => screen.id === 'detail')!.rootIds.push('linked_form')
  const catalog = { ...v2Catalog, fields: new Map([...v2Catalog.fields, ['task_parent', { tableId: 'tasks', type: 'relation' as const, relationTableId: 'requests' }]]) }
  expect(validateAppV2(appV2Schema.parse(original), catalog)).toEqual([])
  expect(validateAppV2(original, { ...catalog, fields: new Map([...catalog.fields, ['task_parent', { tableId: 'tasks', type: 'relation', relationTableId: 'history' }]]) }).some(issue => issue.code === 'relation_target')).toBe(true)
  expect(appV2Schema.parse(appV2Fixture())).toEqual(appV2Fixture())
})
