import { describe, it, expect } from 'vitest'
import { appV2AuthoringContract, appV2ComponentCatalog } from './components'
import { appV2Fixture, v2Catalog } from './fixture.test-utils'
import { appV2Schema, type AppV2Node } from './schema'
import { validateAppV2 } from './validate'

describe('shared authoring vocabulary', () => {
  it('exports a serializable executable contract covering every component and workflow type', () => {
    const contract = appV2AuthoringContract(), json = JSON.stringify(contract)
    expect(contract.version).toBe(1)
    for (const node of appV2Schema.shape.nodes.element.options) expect(appV2ComponentCatalog[node.shape.type.value]).toBeTruthy()
    for (const feature of ['profile','history','create_row','open_screen','record_inventory_movement','visibleWhen','policy']) expect(json).toContain(feature)
    expect(json).not.toContain('owner@example.com')
  })
  it('validates profile bindings in their actual record context and rejects cross-table references', () => {
    const app = appV2Fixture(), profile: AppV2Node = { id: 'profile', name: 'Профиль', type: 'profile', title: { kind: 'row', fieldId: 'r_title' }, subtitle: null, image: null, contacts: [{ label:'Почта', kind:'email', value:{kind:'row',fieldId:'r_owner'} }], childIds: [], visibleTo:null,visibleWhen:null }
    app.nodes.push(profile); app.screens.find(screen => screen.id === 'detail')!.rootIds.push(profile.id)
    expect(validateAppV2(app,v2Catalog)).toEqual([])
    profile.contacts[0]!.value = { kind:'row',fieldId:'t_owner' }
    expect(validateAppV2(app,v2Catalog).some(issue => issue.path.includes('contacts'))).toBe(true)
  })
  it('requires a real date and a status field of the correct type for a history block', () => {
    const app = appV2Fixture(), node = app.nodes.find(node => node.id === 'request_list')!
    if (node.type !== 'collection') throw Error('fixture')
    node.layout='history'
    expect(validateAppV2(app,v2Catalog).some(issue => issue.code==='missing_history_field')).toBe(true)
    node.dateFieldId='r_amount'; node.statusFieldId='r_title'
    expect(validateAppV2(app,v2Catalog).some(issue => issue.code==='calendar_field_type')).toBe(true)
    expect(validateAppV2(app,v2Catalog).some(issue => issue.code==='history_status_type')).toBe(true)
  })
})
