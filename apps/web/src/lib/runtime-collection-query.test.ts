import { describe, expect, it } from 'vitest'
import type { Field, ScreenOf, View } from '@tableapp/schema'
import { ANONYMOUS, asRole } from './app-roles'
import { runtimeCollectionPlan, runtimeCollectionText } from './runtime-collection-query'
import { runtimeQueryKey } from './runtime-page-types'
import { templateExample } from './templates/presentation'

type Collection = ScreenOf<'list'> | ScreenOf<'tiles'>
function fixture(personal = false) {
  const example = templateExample('zakazy'), app = example.app, config = app.customer!
  const screen = app.screens.find(screen => personal ? screen.id === config.listScreenId
    : (screen.type === 'list' || screen.type === 'tiles') && screen.source.viewId === config.catalog!.viewId) as Collection
  const views = Object.fromEntries(example.views.map(view => [view.id, view as View])), view = views[screen.source.viewId]!
  const fields = example.fields.filter(field => field.tableId === view.tableId) as Field[]
  return { app, config, screen, view, views, fields }
}
const row = (id: string, data: Record<string, unknown>, position = 'a') => ({ id, data, position })

describe('server collection query semantics', () => {
  it('intersects an OR view with the precise source AND filter', () => {
    const f = fixture(), name = f.config.catalog!.titleFieldId, active = f.config.catalog!.activeFieldId, gate = 'field_gate'
    f.fields.push({ id: gate, tableId: f.view.tableId, name: 'Publication gate', type: 'checkbox', options: {}, position: 'z', description: null })
    f.view.config.filter = { id: 'filter_view', conjunction: 'or', conditions: [
      { id: 'condition_active', fieldId: active, op: 'is', value: true }, { id: 'condition_override', fieldId: name, op: 'contains', value: 'override' },
    ] }
    f.screen.source.extraFilter = { id: 'filter_source', conjunction: 'and', conditions: [{ id: 'condition_gate', fieldId: gate, op: 'is', value: true }] }
    const plan = runtimeCollectionPlan(f.app, ANONYMOUS, f.screen, f.view, f.fields, f.views, {}, 1)
    expect(plan.baseAllowed(row('active', { [active]: true, [gate]: true }))).toBe(true)
    expect(plan.baseAllowed(row('allowed-override', { [active]: false, [name]: 'Override item', [gate]: true }))).toBe(true)
    expect(plan.baseAllowed(row('forbidden-override', { [active]: false, [name]: 'Override item', [gate]: false }))).toBe(false)
  })

  it('never turns configured search over a hidden field into a match oracle', () => {
    const f = fixture(), hidden = 'field_hidden'
    f.fields.push({ id: hidden, tableId: f.view.tableId, name: 'Private note', type: 'text', options: {}, position: 'z', description: null })
    f.screen.source.searchFieldIds.push(hidden)
    const plan = runtimeCollectionPlan(f.app, ANONYMOUS, f.screen, f.view, f.fields, f.views, { query: ' secret ' }, 1)
    expect(plan.query.query).toBe('secret')
    expect(plan.queryAllowed(row('item', { [f.config.catalog!.titleFieldId]: 'Ordinary item', [hidden]: 'SECRET' }), {})).toBe(false)
    expect(plan.queryAllowed(row('item', { [f.config.catalog!.titleFieldId]: 'Visible secret' }), {})).toBe(true)
  })

  it('searches permitted relation and choice names rather than stored IDs', () => {
    const relation: Field = { id: 'field_relation', tableId: 'table_source', name: 'Product', type: 'relation',
      options: { tableId: 'table_target', allowMultiple: false, symmetricFieldId: null }, position: 'a', description: null }
    const choice: Field = { id: 'field_choice', tableId: 'table_source', name: 'Status', type: 'single_select',
      options: { choices: [{ id: 'status_code', name: 'Готово', color: 'green' }] }, position: 'b', description: null }
    expect(runtimeCollectionText(relation, ['opaque-row-id'], { table_target: [{ id: 'opaque-row-id', title: 'Кружка' }] })).toBe('Кружка')
    expect(runtimeCollectionText(relation, ['opaque-row-id'], {})).toBe('Запись недоступна')
    expect(runtimeCollectionText(choice, 'status_code', {})).toBe('Готово')
  })

  it('finds the displayed customer subtitle when only the repetitive order title was configured for search', () => {
    const f = fixture(true), visitor = asRole('client', 'client@example.invalid', '', true)
    f.screen.subtitleFieldId = f.config.profile!.nameFieldId
    f.screen.source.searchFieldIds = [f.screen.titleFieldId!]
    const plan = runtimeCollectionPlan(f.app, visitor, f.screen, f.view, f.fields, f.views, { query: 'Ирина' }, 1)
    expect(plan.queryAllowed(row('irina', { [f.screen.titleFieldId!]: 'Заказ · 1 поз.', [f.config.profile!.nameFieldId]: 'Ирина Проверкина' }), {})).toBe(true)
    expect(plan.queryAllowed(row('maria', { [f.screen.titleFieldId!]: 'Заказ · 1 поз.', [f.config.profile!.nameFieldId]: 'Мария' }), {})).toBe(false)
  })

  it('does not search a display field that the current visitor cannot read', () => {
    const f = fixture(), hidden = 'field_private_subtitle'
    f.fields.push({ id: hidden, tableId: f.view.tableId, name: 'Private customer', type: 'text', options: {}, position: 'z', description: null })
    f.screen.subtitleFieldId = hidden
    const plan = runtimeCollectionPlan(f.app, ANONYMOUS, f.screen, f.view, f.fields, f.views, { query: 'Secret customer' }, 1)
    expect(plan.policy.fields.has(hidden)).toBe(false)
    expect(plan.queryAllowed(row('item', { [f.screen.titleFieldId!]: 'Ordinary item', [hidden]: 'Secret customer' }), {})).toBe(false)
  })

  it('keeps configured numeric ordering, empty values last and an ID tie breaker', () => {
    const f = fixture(), price = f.config.cart!.priceFieldId
    f.view.config.sorts = [{ fieldId: price, direction: 'desc' }]
    const plan = runtimeCollectionPlan(f.app, ANONYMOUS, f.screen, f.view, f.fields, f.views, {}, 1)
    const sorted = [row('row_c', { [price]: null }), row('row_b', { [price]: 20 }), row('row_a', { [price]: 20 }), row('row_d', { [price]: 2 })].sort(plan.compare)
    expect(sorted.map(row => row.id)).toEqual(['row_a', 'row_b', 'row_d', 'row_c'])
  })

  it('binds the effective personal section and preserves authoritative owner matching', () => {
    const f = fixture(true), visitor = asRole('client', 'client@example.invalid', '', true)
    const plan = runtimeCollectionPlan(f.app, visitor, f.screen, f.view, f.fields, f.views, { bookingSection: 'history' }, 1)
    expect(plan.query).toEqual({ query: '', choiceId: null, customerSection: 'active' })
    expect(runtimeQueryKey(plan.query)).toBe(runtimeQueryKey({ customerSection: 'active' }))
    expect(plan.ownerAllowed(row('own', { [f.config.emailFieldId]: ['client@example.invalid'] }))).toBe(true)
    expect(plan.ownerAllowed(row('trimmed', { [f.config.emailFieldId]: '\tCLIENT@example.invalid\n' }))).toBe(true)
    expect(plan.ownerAllowed(row('foreign', { [f.config.emailFieldId]: 'other@example.invalid' }))).toBe(false)
    expect(plan.section(row('past', { [f.config.statusFieldId]: f.config.terminalStatuses[0] }))).toBe('history')
    expect(plan.sectionAllowed(row('past', { [f.config.statusFieldId]: f.config.terminalStatuses[0] }))).toBe(false)
  })

  it('does not reveal a hidden lifecycle field through history membership or counts', () => {
    const f = fixture(true), visitor = asRole('client', 'client@example.invalid', '', true)
    f.app.screens = [f.screen]; f.screen.statusFieldId = null; f.screen.source.searchFieldIds = []
    f.screen.components = []; f.screen.metaFieldId = null; f.screen.subtitleFieldId = null
    const plan = runtimeCollectionPlan(f.app, visitor, f.screen, f.view, f.fields, f.views, { customerSection: 'history' }, 1)
    expect(plan.policy.fields.has(f.config.statusFieldId)).toBe(false)
    expect(plan.section(row('secret-stage', { [f.config.statusFieldId]: f.config.terminalStatuses[0] }))).toBe('active')
    expect(plan.sectionAllowed(row('secret-stage', { [f.config.statusFieldId]: f.config.terminalStatuses[0] }))).toBe(false)
  })
})
