import { describe, expect, it } from 'vitest'
import { appSchema } from '../app'
import { readAppDefinition, validateAppV2Definition } from '../app-definition'
import { appV2Fixture, v2Catalog } from './fixture.test-utils'
import { validateAppV2 } from './validate'
import {appV2Schema, type AppV2, type AppV2Node } from './schema'
import { appDefinitionInputError } from './values'

const codes = (app: AppV2) => validateAppV2(app, v2Catalog).map(issue => issue.code)
function node<T extends AppV2Node['type']>(app: AppV2, id: string, type: T): Extract<AppV2Node, { type: T }> {
  const value = app.nodes.find(node => node.id === id)
  if (value?.type !== type) throw new Error('fixture node')
  return value as Extract<AppV2Node, { type: T }>
}
describe('versioned application definitions', () => {
  it('reads unversioned and explicit v1 definitions through the same legacy parser', () => {
    const input = { id: 'app', workspaceId: 'workspace', name: 'Старое приложение', slug: 'legacy-app', theme: {}, allowlist: ['anna@example.com'], screens: [] }
    const expected = appSchema.parse(input), result = readAppDefinition(input)
    expect(result).toEqual({ ok: true, formatVersion: 1, app: expected })
    expect(Object.hasOwn(expected, 'formatVersion')).toBe(false)
    expect(readAppDefinition({ ...input, formatVersion: 1 })).toEqual({ ok: true, formatVersion: 1, app: { ...expected, formatVersion: 1 } })
  })
  it.each([0, 3, '2', null, true])('never treats unsupported format %s as v1', formatVersion => {
    const legacy = appSchema.parse({ id: 'app', workspaceId: 'workspace', name: 'App', slug: 'legacy-app', theme: {} })
    expect(readAppDefinition({ ...legacy, formatVersion })).toMatchObject({ ok: false, code: 'unsupported_version' })
    expect(appSchema.safeParse({ ...legacy, formatVersion }).success).toBe(false)
  })
  it('roundtrips the two-table pilot and keeps v2 out of the old runtime', () => {
    const value = appV2Fixture()
    expect(validateAppV2Definition(JSON.parse(JSON.stringify(value)), v2Catalog, { mode: 'publish' })).toEqual({ ok: true, app: value })
    expect(appSchema.safeParse(value).success).toBe(false)
    expect(readAppDefinition({ ...value, unknownOption: true }).ok).toBe(false)
  })
  it('allows an empty draft but requires a home screen before publication', () => {
    const value = appV2Fixture(); value.screens = []; value.nodes = []; value.workflows = []; value.policy.workflows = []; value.homeScreenId = null
    expect(validateAppV2Definition(value, v2Catalog).ok).toBe(true)
    expect(validateAppV2Definition(value, v2Catalog, { mode: 'publish' })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: 'missing_home' })]) })
  })
  it('rejects cyclic, excessively nested, executable and accessor-bearing input before parsing', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle
    expect(readAppDefinition(cycle).ok).toBe(false)
    let deep: unknown = null; for (let i = 0; i < 50; i++) deep = { child: deep }
    expect(appDefinitionInputError(deep)).not.toBeNull()
    expect(appDefinitionInputError({ callback: () => null })).not.toBeNull()
    const getter = Object.defineProperty({}, 'value', { enumerable: true, get: () => { throw new Error('must not run') } })
    expect(() => appDefinitionInputError(getter)).not.toThrow()
    expect(appDefinitionInputError(getter)).not.toBeNull()
    expect(appDefinitionInputError(Array(100_001).fill(0))).not.toBeNull()
  })
  it('does not invoke a hidden version getter and returns a controlled error for a hostile object', () => {
    let called = false
    const getter = Object.defineProperty({}, 'formatVersion', { get: () => { called = true; return 2 } })
    expect(readAppDefinition(getter).ok).toBe(false)
    expect(called).toBe(false)
    expect(readAppDefinition(new Proxy({}, { getPrototypeOf: () => { throw new Error('invalid object') } })).ok).toBe(false)
  })
  it('preserves reference-looking and prototype-named keys inside ordinary literal data', () => {
    const app = appV2Fixture()
    const value = JSON.parse('{"constructor":"Модель","prototype":"Образец","tableId":"foreign"}')
    node(app, 'welcome', 'heading').value = { kind: 'literal', value }
    expect(validateAppV2Definition(app, v2Catalog).ok).toBe(true)
  })
})
describe('component graph and internal references', () => {
  it('rejects a duplicate node, repeated placement, self-cycle and orphan node', () => {
    let value = appV2Fixture(); value.nodes.push(structuredClone(value.nodes[0]!)); expect(codes(value)).toContain('duplicate_id')
    value = appV2Fixture(); value.screens[0]!.rootIds.push('request_title'); expect(codes(value)).toContain('multiple_parents')
    value = appV2Fixture(); node(value, 'metrics', 'columns').childIds.push('metrics'); expect(codes(value)).toContain('component_cycle')
    value = appV2Fixture(); value.nodes.push({ ...value.nodes[0]!, id: 'orphan' }); expect(codes(value)).toContain('orphan_node')
  })
  it('checks table ownership, view ownership, deleted fields and source references', () => {
    let value = appV2Fixture(); value.sources[0]!.tableId = 'foreign'; expect(codes(value)).toContain('unavailable_table')
    value = appV2Fixture(); value.sources[0]!.viewId = 'tasks_view'; expect(codes(value)).toContain('unavailable_view')
    value = appV2Fixture(); node(value, 'request_list', 'collection').titleFieldId = 't_title'; expect(codes(value)).toContain('unavailable_field')
    value = appV2Fixture(); node(value, 'request_list', 'collection').sourceId = 'deleted'; expect(codes(value)).toContain('missing_source')
  })
  it('binds the document to the authoritative workspace and rejects record-dependent navigation', () => {
    let value = appV2Fixture(); value.workspaceId = 'other_workspace'; expect(codes(value)).toContain('workspace_mismatch')
    value = appV2Fixture(); value.screens.find(screen => screen.id === 'detail')!.navigation = true
    expect(codes(value)).toContain('navigation_context')
  })
  it('resolves collection template fields against the collection table, not its enclosing screen', () => {
    const value = appV2Fixture()
    value.nodes.push({ id: 'item_text', name: 'Описание задачи', type: 'text', visibleTo: null, visibleWhen: null, value: { kind: 'row', fieldId: 't_title' } })
    node(value, 'task_list', 'collection').itemIds.push('item_text')
    expect(codes(value)).toEqual([])
    node(value, 'item_text', 'text').value = { kind: 'row', fieldId: 'r_title' }
    expect(codes(value)).toContain('unavailable_field')
  })
  it('keeps reference-looking literal objects as data', () => {
    const value = appV2Fixture()
    node(value, 'welcome', 'heading').value = { kind: 'literal', value: { type: 'create_row', tableId: 'foreign', fieldId: 'deleted' } }
    expect(validateAppV2Definition(value, v2Catalog).ok).toBe(true)
  })
  it('checks event row/form contexts and form membership', () => {
    let value = appV2Fixture(); node(value, 'task_list', 'collection').events.itemPress = 'open_request'; expect(codes(value)).toContain('workflow_context')
    value = appV2Fixture(); value.screens.find(screen => screen.id === 'new')!.rootIds = ['title_input']; expect(codes(value)).toContain('input_outside_form')
    value = appV2Fixture(); const create = value.workflows.find(flow => flow.id === 'create')!.steps[0]!
    if (create.type !== 'create_row') throw new Error('fixture')
    create.values.r_title = { kind: 'form', formId: 'create_form', fieldId: 'r_owner' }
    expect(codes(value)).toContain('missing_form_input')
    create.values.r_title = { kind: 'form', formId: 'another_form', fieldId: 'r_title' }
    expect(codes(value)).toContain('invalid_form_context')
  })
})
describe('action contexts and policy references', () => {
  it('rejects future step results and results from only one branch', () => {
    const value = appV2Fixture(), flow = value.workflows.find(flow => flow.id === 'create')!
    flow.steps.unshift({ id: 'too_early', type: 'notify', message: { kind: 'result_id', stepId: 'new_request' } })
    expect(codes(value)).toContain('unavailable_result')
    flow.steps.shift()
    const create = flow.steps.shift()!
    flow.steps.unshift({ id: 'conditional', type: 'branch', condition: { op: 'not_empty', value: { kind: 'form', formId: 'create_form', fieldId: 'r_title' } }, then: [create], else: [] })
    expect(codes(value)).toContain('unavailable_result')
  })
  it('allows a created record result within the same definite branch', () => {
    const value = appV2Fixture(), flow = value.workflows.find(flow => flow.id === 'create')!
    const steps = flow.steps
    flow.steps = [{ id: 'conditional', type: 'branch', condition: { op: 'not_empty', value: { kind: 'form', formId: 'create_form', fieldId: 'r_title' } }, then: steps, else: [] }]
    expect(codes(value)).toEqual([])
  })
  it('checks writable fields, literal types, record targets and navigation targets', () => {
    const value = appV2Fixture(), flow = value.workflows.find(flow => flow.id === 'complete')!
    flow.steps.push({ id: 'bad', type: 'update_row', tableId: 'tasks', target: { kind: 'current' }, values: { t_title: { kind: 'literal', value: 'Wrong table' } } })
    expect(codes(value)).toContain('record_table_mismatch')
    flow.steps.pop()
    flow.steps.push({ id: 'computed', type: 'update_row', tableId: 'requests', target: { kind: 'current' }, values: { r_total: { kind: 'literal', value: 1 }, r_amount: { kind: 'literal', value: 'text' } } })
    expect(codes(value)).toEqual(expect.arrayContaining(['readonly_field', 'literal_type']))
    flow.steps.pop()
    flow.steps.push({ id: 'bad_nav', type: 'open_screen', screenId: 'task_detail', record: { kind: 'current' } })
    expect(codes(value)).toContain('screen_context')
  })
  it('rejects text sources for numeric writes and numeric conditions with textual operands', () => {
    const value = appV2Fixture(), flow = value.workflows.find(flow => flow.id === 'complete')!
    flow.steps.push({ id: 'wrong_type', type: 'update_row', tableId: 'requests', target: { kind: 'current' }, values: { r_amount: { kind: 'row', fieldId: 'r_title' } } })
    expect(codes(value)).toContain('binding_type')
    flow.steps.push({ id: 'wrong_condition', type: 'require', condition: { op: 'gt', left: { kind: 'row', fieldId: 'r_title' }, right: { kind: 'literal', value: 100 } }, message: 'Ошибка сравнения' })
    expect(codes(value)).toContain('condition_type')
  })
  it('requires unique step IDs, known roles, known workflows and noneditable creation ownership', () => {
    let value = appV2Fixture(); value.workflows[0]!.steps.push(structuredClone(value.workflows[0]!.steps[0]!)); expect(codes(value)).toContain('duplicate_step')
    value = appV2Fixture(); value.roles = []; expect(codes(value)).toContain('missing_role')
    value = appV2Fixture(); value.policy.workflows[0]!.workflowId = 'deleted'; expect(codes(value)).toContain('missing_workflow')
    value = appV2Fixture(); value.policy.tables[0]!.grants[1]!.create!.fieldIds.push('r_owner'); expect(codes(value)).toContain('editable_owner')
  })
  it('does not accept public data writes, hidden executable code or unknown node types', () => {
    const value = appV2Fixture(), raw = value as unknown as Record<string, unknown>
    value.policy.tables[0]!.grants[0]!.audience = { kind: 'public' }
    expect(readAppDefinition(value).ok).toBe(false)
    raw.nodes = [{ id: 'script', type: 'javascript', code: 'anything()' }]
    expect(readAppDefinition(raw).ok).toBe(false)
  })
  it('rejects an unsafe literal URL and checks dynamic URLs at resolution time', () => {
    const value = appV2Fixture()
    value.workflows[0]!.steps.push({ id: 'bad_link', type: 'open_url', value: { kind: 'literal', value: 'javascript:alert(1)' } })
    expect(codes(value)).toContain('unsafe_url')
  })
})

it('validates collection date and status fields against their own source table without changing old definitions',()=>{
 const app=appV2Fixture(),list=node(app,'request_list','collection'),catalog={...v2Catalog,fields:new Map([...v2Catalog.fields,['r_date',{tableId:'requests',type:'date'}],['r_stage',{tableId:'requests',type:'single_select'}]])}
 expect(readAppDefinition(app)).toMatchObject({ok:true,app});expect(list).not.toHaveProperty('dateFieldId');list.layout='calendar';expect(validateAppV2(app,catalog).some(issue=>issue.code==='missing_calendar_field')).toBe(true);list.dateFieldId='r_date';expect(validateAppV2(app,catalog)).toEqual([]);list.dateFieldId='t_title';expect(validateAppV2(app,catalog).length).toBeGreaterThan(0)
 delete list.dateFieldId;list.layout='kanban';list.groupFieldId='r_stage';list.kanbanMoveRoleIds=['worker'];expect(validateAppV2(app,catalog)).toEqual([]);list.kanbanMoveRoleIds=['forged'];expect(validateAppV2(app,catalog).length).toBeGreaterThan(0);list.kanbanMoveRoleIds=['worker'];list.groupFieldId='r_title';expect(validateAppV2(app,catalog).length).toBeGreaterThan(0)
})

it('validates chart grouping, numeric values, line dates and the repeated-item boundary',()=>{
 const app=appV2Fixture(),catalog={...v2Catalog,fields:new Map([...v2Catalog.fields,['r_date',{tableId:'requests',type:'date'}]])},chart:AppV2Node={id:'chart',name:'Итоги',type:'chart',sourceId:'requests_source',visibleTo:null,visibleWhen:null,groupFieldId:'r_title',operation:'sum',fieldId:'r_amount',chartType:'bar',dateGrouping:'month',limit:10};app.nodes.push(chart);app.screens[0]!.rootIds.push(chart.id);expect(validateAppV2(app,catalog)).toEqual([]);chart.chartType='line';expect(validateAppV2(app,catalog).some(issue=>issue.code==='chart_line_date')).toBe(true);chart.groupFieldId='r_date';expect(validateAppV2(app,catalog)).toEqual([]);chart.fieldId='t_title';expect(validateAppV2(app,catalog).length).toBeGreaterThan(0);chart.fieldId='r_amount';chart.chartType='donut';chart.operation='avg';expect(validateAppV2(app,catalog).some(issue=>issue.code==='chart_donut_average')).toBe(true);chart.operation='count';chart.fieldId=null;app.screens[0]!.rootIds=app.screens[0]!.rootIds.filter(id=>id!==chart.id);node(app,'request_list','collection').itemIds.push(chart.id);expect(validateAppV2(app,catalog).some(issue=>issue.code==='repeated_chart')).toBe(true)
})


it('preserves optional appearance and menu labels without changing old definitions or accepting arbitrary layout values',()=>{
  const old=appV2Fixture(),parsed=appV2Schema.parse(old)
  expect(parsed).toEqual(old);expect(Object.hasOwn(parsed,'appearance')).toBe(false)
  expect(parsed.screens.every(screen=>!Object.hasOwn(screen,'menuLabel'))).toBe(true)
  const next={...old,appearance:{navigation:'sidebar',icon:'folder'},screens:old.screens.map((screen,index)=>index===0?{...screen,menuLabel:'Итоги'}:screen)}
  expect(appV2Schema.parse(next)).toEqual(next);expect(codes(next as AppV2)).toEqual([])
  expect(appV2Schema.safeParse({...next,appearance:{navigation:'floating',icon:'apps'}}).success).toBe(false)
  expect(appV2Schema.safeParse({...next,screens:[{...next.screens[0],menuLabel:'x'.repeat(121)}]}).success).toBe(false)
})


it('accepts gallery and file bindings in record context without changing old definitions or grants',()=>{
 const app=appV2Fixture(),node={id:'gallery',name:'Фотографии',type:'gallery' as const,value:{kind:'row' as const,fieldId:'r_title'},caption:'',columns:3,visibleTo:null,visibleWhen:null};app.nodes.push(node);app.screens.find(screen=>screen.id==='detail')!.rootIds.push(node.id)
 expect(appV2Schema.safeParse(app).success).toBe(true);expect(codes(app)).toEqual([])
 app.nodes[app.nodes.length-1]={...node,value:{kind:'row',fieldId:'r_amount'}};expect(codes(app)).toContain('media_field_type')
 expect(appV2Schema.safeParse({...app,nodes:[{...node,columns:8}]}).success).toBe(false)
})
