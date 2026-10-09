import { describe, expect, it } from 'vitest'
import { appSchema, type App, type Field } from '@tableapp/schema'
import { checkAppReferences, type AppReferenceCatalog } from './app-references'

const catalog: AppReferenceCatalog = {
  tableIds: new Set(['orders', 'items']),
  views: new Map([['orders-view', { tableId: 'orders' }]]),
  fields: new Map([
    ['name', { id: 'name', tableId: 'orders', type: 'text', options: {} } as Field],
    ['item-name', { id: 'item-name', tableId: 'items', type: 'text', options: {} } as Field],
    ['relation', { id: 'relation', tableId: 'orders', type: 'relation', options: { tableId: 'items' } } as Field],
  ]),
}

function app(screen: Record<string, unknown> = { type: 'detail', tableId: 'orders', components: [] }): App {
  return appSchema.parse({
    id: 'app', workspaceId: 'workspace', name: 'App', slug: 'app', theme: {},
    screens: [{ id: 'screen', appId: 'app', name: 'Screen', position: 'a0', ...screen }],
    homeScreenId: 'screen',
  })
}
function component(props: Record<string, unknown>) {
  return { id: 'component', position: 'a0', ...props }
}

describe('app reference ownership', () => {
  it('allows own objects and incomplete draft screens', () => {
    expect(checkAppReferences(app(), catalog)).toBeNull()
    expect(checkAppReferences(app({ type: 'form', tableId: '', components: [] }), catalog)).toBeNull()
    expect(checkAppReferences(app({ type: 'list', source: { viewId: '' } }), catalog)).toBeNull()
  })
  it.each([
    { type: 'detail', tableId: 'foreign', components: [] },
    { type: 'list', source: { viewId: 'foreign-view' } },
    { type: 'tiles', source: { viewId: 'foreign-view' } },
    { type: 'dashboard', blocks: [{ id: 'block', position: 'a0', type: 'metric', source: { viewId: 'foreign-view' } }] },
  ])('rejects foreign tables and views in $type', (screen) => {
    expect(checkAppReferences(app(screen), catalog)).not.toBeNull()
  })
  it.each(['foreign-field', 'item-name'])('rejects an unrelated field %s', (fieldId) => {
    const definition = app({ type: 'detail', tableId: 'orders', components: [component({ type: 'field', fieldId })] })
    expect(checkAppReferences(definition, catalog)).not.toBeNull()
  })
  it('checks search, public fields, conditions and bindings', () => {
    for (const change of [
      { titleFieldId: 'foreign-field' },
      { access: { publicFields: ['foreign-field'] } },
      { source: { viewId: 'orders-view', searchFieldIds: ['foreign-field'] } },
      { source: { viewId: 'orders-view', extraFilter: { id: 'filter', conjunction: 'and', conditions: [{ id: 'c', fieldId: 'foreign-field', op: 'is', value: 'x' }] } } },
      { components: [component({ type: 'text', source: { kind: 'field', fieldId: 'foreign-field' } })] },
    ]) {
      expect(checkAppReferences(app({ type: 'list', source: { viewId: 'orders-view' }, ...change }), catalog)).not.toBeNull()
    }
  })
  it('checks write targets while resolving bindings against the source row', () => {
    const create = (tableId: string, fieldId: string, sourceId: string) => app({ type: 'detail', tableId: 'orders', components: [
      component({ type: 'button', label: 'Create', action: { id: 'action', type: 'create_row', tableId, values: { [fieldId]: { kind: 'field', fieldId: sourceId } } } }),
    ] })
    expect(checkAppReferences(create('items', 'item-name', 'name'), catalog)).toBeNull()
    expect(checkAppReferences(create('foreign', 'foreign-field', 'name'), catalog)).not.toBeNull()
    expect(checkAppReferences(create('items', 'name', 'name'), catalog)).not.toBeNull()
    expect(checkAppReferences(create('items', 'item-name', 'item-name'), catalog)).not.toBeNull()
  })
  it('resolves related-list display fields in the related table', () => {
    const definition = app({ type: 'detail', tableId: 'orders', components: [component({ type: 'related_list', relationFieldId: 'relation', titleFieldId: 'item-name' })] })
    expect(checkAppReferences(definition, catalog)).toBeNull()
    const related = definition.screens[0]!
    if (related.type !== 'detail' || related.components[0]?.type !== 'related_list') throw new Error('fixture')
    related.components[0].titleFieldId = 'name'
    expect(checkAppReferences(definition, catalog)).not.toBeNull()
  })
  it('validates create-form prefills in the target table and source bindings in the current card', () => {
    const definition = app({ type: 'detail', tableId: 'orders', components: [component({ type: 'button', label: 'Request',
      action: { id: 'action', type: 'open_screen', screenId: 'request', initialValues: { 'item-name': { kind: 'field', fieldId: 'name' } } } })] })
    definition.screens.push(appSchema.parse({ ...definition, screens: [{ id: 'request', appId: 'app', name: 'Request', position: 'b0',
      type: 'form', mode: 'create', tableId: 'items', components: [component({ type: 'form_field', fieldId: 'item-name' })] }] }).screens[0]!)
    expect(checkAppReferences(definition, catalog)).toBeNull()
    const invalid = structuredClone(definition)
    const source = invalid.screens[0]!
    if (source.type !== 'detail' || source.components[0]?.type !== 'button' || source.components[0].action.type !== 'open_screen') throw new Error('fixture')
    source.components[0].action.initialValues = { 'item-name': { kind: 'field', fieldId: 'item-name' } }
    expect(checkAppReferences(invalid, catalog)).not.toBeNull()
    source.components[0].action.initialValues = { name: { kind: 'literal', value: 'wrong table' } }
    expect(checkAppReferences(invalid, catalog)).not.toBeNull()
    source.components[0].action.initialValues = { 'item-name': { kind: 'field', fieldId: 'name' } }
    const target = invalid.screens[1]!
    if (target.type !== 'form') throw new Error('fixture')
    target.components = []
    expect(checkAppReferences(invalid, catalog)).not.toBeNull()
  })
  it('ignores arbitrary reference-shaped literal values', () => {
    const definition = app({ type: 'detail', tableId: 'orders', components: [component({ type: 'text', source: { kind: 'literal', value: { tableId: 'foreign', fieldId: 'foreign-field' } } })] })
    expect(checkAppReferences(definition, catalog)).toBeNull()
  })
  it('checks row access rules and screen links', () => {
    const definition = app()
    definition.rowAccessRules = [{ tableId: 'orders', fieldId: 'item-name', match: 'email', appliesTo: ['client'] }]
    expect(checkAppReferences(definition, catalog)).not.toBeNull()
    definition.rowAccessRules = []
    definition.homeScreenId = 'missing-screen'
    expect(checkAppReferences(definition, catalog)).not.toBeNull()
  })
  it('checks production table and field ownership', () => {
    const definition = app()
    definition.production = {
      tables: { production: 'orders', movements: 'items', norms: 'items', materials: 'items' },
      run: { date: 'name', product: 'name', qty: 'name', defects: 'name', shift: 'name', note: 'name' },
      norm: { product: 'item-name', material: 'item-name', perUnit: 'item-name', active: 'item-name' },
      movement: { date: 'item-name', material: 'item-name', kind: 'item-name', qty: 'item-name', run: 'item-name', reason: 'item-name' },
      material: { name: 'item-name', unit: 'item-name', opening: 'item-name', movements: 'item-name' },
      movementKindId: 'choice', formScreenId: null, movementScreenId: null,
    }
    expect(checkAppReferences(definition, catalog)).toBeNull()
    definition.production.movement.run = 'name'
    expect(checkAppReferences(definition, catalog)).not.toBeNull()
    definition.production.movement.run = 'item-name'
    definition.production.tables.materials = 'foreign'
    expect(checkAppReferences(definition, catalog)).not.toBeNull()
  })
})
