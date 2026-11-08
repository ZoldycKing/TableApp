import { describe, expect, it } from 'vitest'
import { appV2Schema, validateAppV2 } from '@tableapp/schema/app-v2'
import { appV2Fixture, v2Catalog } from '../../../../../../packages/schema/src/app-v2/fixture.test-utils'
import { builderV2FormInputs } from '@/lib/builder-v2-form-types'
import { fixtureTables } from './fixture.test-utils'
import { createCollectionCard, setCollectionCard, addNode, duplicateNode, moveNode, newScreen, nodeContext, placeNode, removeNode, removeScreen, updateNodeSource } from './model'

describe('v2 editor graph operations', () => {
  it('gives duplicated blocks independent data settings without widening application policy', () => {
    const app = appV2Fixture(), copied = duplicateNode(app, 'home', 'request_list')
    const changed = updateNodeSource(copied.app, copied.id, { pageSize: 10, searchFieldIds: ['r_status'], sorts: [{ fieldId: 'r_amount', direction: 'desc' }] })
    const original = changed.nodes.find(node => node.id === 'request_list')!, copy = changed.nodes.find(node => node.id === copied.id)!
    if (original.type !== 'collection' || copy.type !== 'collection') throw new Error('fixture')
    expect(original.sourceId).not.toBe(copy.sourceId)
    expect(changed.sources.find(source => source.id === original.sourceId)).toEqual(app.sources.find(source => source.id === original.sourceId))
    expect(changed.sources.find(source => source.id === copy.sourceId)).toMatchObject({ pageSize: 10, searchFieldIds: ['r_status'] })
    expect(changed.policy).toEqual(app.policy)
    expect(validateAppV2(changed, v2Catalog)).toEqual([])
  })

  it('adds independent screens and a second table collection without granting access by placement', () => {
    const original = appV2Fixture(), empty = { ...original, nodes: [], screens: [], homeScreenId: null, workflows: [], sources: [], policy: { tables: [], workflows: [] } }
    const first = newScreen(empty, 'Мои задачи'), created = addNode(first, first.screens[0]!.id, 'collection', fixtureTables, null, 'tasks')
    expect(created.app.sources[0]!.tableId).toBe('tasks')
    expect(created.app.policy).toEqual({ tables: [], workflows: [] })
    expect(validateAppV2(created.app, v2Catalog)).toEqual([])
  })
  it('clones forms and their workflows with independent node/form references', () => {
    const app = appV2Fixture()
    app.nodes.find(node => node.id === 'create_form')!.name = 'А'.repeat(120)
    const result = duplicateNode(app, 'new', 'create_form')
    const form = result.app.nodes.find(node => node.id === result.id)!
    if (form.type !== 'form') throw new Error('fixture')
    expect(form.events.submit).not.toBe('create')
    expect(result.app.workflows.find(flow => flow.id === form.events.submit)!.input.formId).toBe(form.id)
    expect(validateAppV2(result.app, v2Catalog)).toEqual([])
    expect(appV2Schema.safeParse(result.app).success).toBe(true)
    expect(app.nodes.find(node => node.id === 'create_form')!.name).toBe('А'.repeat(120))
  })
  it('moves nodes within and between containers while preventing cycles', () => {
    const app = appV2Fixture(), withText = addNode(app, 'home', 'text', fixtureTables, null, '')
    const moved = placeNode(withText.app, 'home', withText.id, 'metrics')
    expect(validateAppV2(moved, v2Catalog)).toEqual([])
    expect(moveNode(moved, withText.id, -1).nodes.find(node => node.id === 'metrics')).toMatchObject({ childIds: ['requests_count', withText.id, 'tasks_count'] })
    expect(() => placeNode(moved, 'home', 'metrics', 'metrics')).toThrow()
    const invalid = placeNode(app, 'home', 'request_title', 'task_list')
    expect(validateAppV2(invalid, v2Catalog).some(issue => issue.code === 'unavailable_field')).toBe(true)
  })
  it('removes only UI definitions and clears obsolete page/form dependencies', () => {
    const app = appV2Fixture(), next = removeScreen(app, 'detail')
    expect(next.screens.some(screen => screen.id === 'detail')).toBe(false)
    expect(next.workflows.some(flow => flow.id === 'open_request')).toBe(false)
    expect(validateAppV2(next, v2Catalog)).toEqual([])
    expect(next.policy.tables).toEqual(app.policy.tables)
    const withoutFormInput = removeNode(app, 'title_input')
    expect(withoutFormInput.workflows.some(flow => flow.id === 'create')).toBe(false)
    expect(validateAppV2(withoutFormInput, v2Catalog)).toEqual([])
  })
  it('resolves nested collection and form contexts for the inspector', () => {
    const app = appV2Fixture()
    expect(nodeContext(app, 'home', 'task_list')).toEqual({ rowTableId: 'tasks', formId: null })
    expect(nodeContext(app, 'new', 'title_input')).toEqual({ rowTableId: null, formId: 'create_form' })
  })
})

it('creates, duplicates, relinks and removes cards without modifying application policy', () => {
  const original = appV2Fixture(), created = createCollectionCard(original, 'request_list', fixtureTables)
  expect(created.app.homeScreenId).toBe(original.homeScreenId)
  expect(created.app.screens.find(screen => screen.id === created.screenId)).toMatchObject({ contextTableId: 'requests', navigation: false })
  expect(created.app.policy).toEqual(original.policy)
  expect(validateAppV2(appV2Schema.parse(created.app), v2Catalog)).toEqual([])
  const copied = duplicateNode(created.app, 'home', 'request_list')
  expect(validateAppV2(copied.app, v2Catalog)).toEqual([])
  const relinked = setCollectionCard(created.app, 'request_list', 'detail')
  expect(validateAppV2(relinked, v2Catalog)).toEqual([])
  expect(relinked.workflows.length).toBe(created.app.workflows.length)
  expect(validateAppV2(removeScreen(copied.app, created.screenId), v2Catalog)).toEqual([])
})

it('prefills one unambiguous relation in a new form and preserves it when cloning the form', () => {
  const app = appV2Fixture(), tables = fixtureTables.map(table => table.id === 'tasks' ? { ...table, fields: [...table.fields, { id: 't_parent', name: 'Заявка', type: 'relation' as const, relationTableId: 'requests' }] } : table)
  const result = addNode(app, 'detail', 'form', tables, null, 'tasks'), form = result.app.nodes.find(node => node.id === result.id)!
  if (form.type !== 'form') throw new Error('fixture')
  expect(builderV2FormInputs(result.app, form).find(input => input.fieldId === 't_parent')).toMatchObject({ readOnly: true, initialValue: { kind: 'record_ids', tableId: 'requests', record: { kind: 'screen' } } })
  expect(result.app.policy).toEqual(app.policy)
  const copy = duplicateNode(result.app, 'detail', result.id), copied = copy.app.nodes.find(node => node.id === copy.id)!
  if (copied.type !== 'form') throw new Error('fixture')
  expect(builderV2FormInputs(copy.app, copied).find(input => input.fieldId === 't_parent')?.initialValue).toEqual({ kind: 'record_ids', tableId: 'requests', record: { kind: 'screen' } })
})

it('adds exactly the chosen form field and rejects adding the same field twice', () => {
  const app = appV2Fixture(), result = addNode(app, 'new', 'input', fixtureTables, 'create_form', '', 'r_owner')
  expect(result.app.nodes.find(node => node.id === result.id)).toMatchObject({ fieldId: 'r_owner', name: 'r_owner' })
  expect(() => addNode(result.app, 'new', 'input', fixtureTables, 'create_form', '', 'r_owner')).toThrow()
})

it('creates chart defaults on a usable field, with independent sources and no additional access grants',()=>{
 const app=appV2Fixture(),added=addNode(app,'home','chart',fixtureTables,null,'requests'),node=added.app.nodes.find(node=>node.id===added.id)!;expect(node).toMatchObject({type:'chart',groupFieldId:'r_title',operation:'count',fieldId:null,chartType:'bar'});expect(added.app.policy).toEqual(app.policy);expect(validateAppV2(added.app,v2Catalog)).toEqual([]);expect(()=>addNode(app,'home','chart',fixtureTables,'request_list','requests')).toThrow('вне строк списка');const copy=duplicateNode(added.app,'home',added.id);expect(updateNodeSource(copy.app,copy.id,{viewId:null}).sources).toHaveLength(added.app.sources.length+1)
})
