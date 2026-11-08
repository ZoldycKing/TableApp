import { describe, expect, it } from 'vitest'
import { authorizeAppV2Write, canInvokeAppV2Workflow, canOpenAppV2Screen, projectAppV2Row, readableAppV2Fields } from './access'
import { appV2Fixture } from './fixture.test-utils'
import { appV2NavigationUrl, evaluateAppV2Condition, resolveAppV2Binding, type AppV2Actor, type AppV2Record } from './values'

const worker: AppV2Actor = { authenticated: true, roleIds: ['worker'], id: 'user_anna', email: 'Anna@example.com', company: '' }
const owner: AppV2Actor = { ...worker, roleIds: ['owner'] }
const guest: AppV2Actor = { authenticated: false, roleIds: [], id: null, email: null, company: null }
const record: AppV2Record = { id: 'request_1', tableId: 'requests', values: { r_title: 'Ремонт принтера', r_status: 'В работе', r_owner: 'anna@example.com', r_amount: 1800, r_total: 2000 } }
const other: AppV2Record = { ...record, id: 'request_2', values: { ...record.values, r_owner: 'pavel@example.com' } }

describe('explicit application access', () => {
  it('keeps data grants unchanged when components or entire screens are removed', () => {
    const value = appV2Fixture(), before = projectAppV2Row(value, worker, record)
    expect(before).toEqual({ r_title: 'Ремонт принтера', r_status: 'В работе', r_owner: 'anna@example.com' })
    value.nodes = []; value.screens = []; value.homeScreenId = null
    expect(projectAppV2Row(value, worker, record)).toEqual(before)
    expect(projectAppV2Row(value, owner, record)).toEqual(record.values)
  })
  it('denies ungranted tables and workflows even when their buttons/screens are visible', () => {
    const value = appV2Fixture(); value.policy = { tables: [], workflows: [] }
    expect(canOpenAppV2Screen(value, worker, 'home')).toBe(true)
    expect(readableAppV2Fields(value, worker, record).size).toBe(0)
    expect(canInvokeAppV2Workflow(value, worker, 'complete')).toBe(false)
    expect(authorizeAppV2Write(value, worker, { operation: 'update', row: record, values: { r_status: 'Готово' } }).ok).toBe(false)
  })
  it('requires authentication, field permission and ownership independently', () => {
    const value = appV2Fixture()
    expect(readableAppV2Fields(value, guest, record).size).toBe(0)
    expect(readableAppV2Fields(value, worker, other).size).toBe(0)
    expect(authorizeAppV2Write(value, worker, { operation: 'update', row: record, values: { r_status: 'Готово' } }).ok).toBe(true)
    expect(authorizeAppV2Write(value, worker, { operation: 'update', row: other, values: { r_status: 'Готово' } }).ok).toBe(false)
    expect(authorizeAppV2Write(value, worker, { operation: 'update', row: record, values: { r_amount: 0 } }).ok).toBe(false)
    expect(authorizeAppV2Write(value, { ...guest, roleIds: ['owner'] }, { operation: 'delete', row: record }).ok).toBe(false)
  })
  it('treats public screen/field access as an explicit read projection', () => {
    const value = appV2Fixture()
    value.screens[0]!.audience = { kind: 'public' }
    value.policy.tables[0]!.grants.push({ audience: { kind: 'public' }, read: { fieldIds: ['r_title'], rows: { kind: 'all' } } })
    expect(canOpenAppV2Screen(value, guest, 'home')).toBe(true)
    expect(projectAppV2Row(value, guest, record)).toEqual({ r_title: 'Ремонт принтера' })
    expect(canInvokeAppV2Workflow(value, guest, 'complete')).toBe(false)
  })
  it('never matches empty identity/ownership fields', () => {
    const value = appV2Fixture(), empty = { ...record, values: { ...record.values, r_owner: '' } }
    expect(readableAppV2Fields(value, { ...worker, email: '' }, empty).size).toBe(0)
    expect(authorizeAppV2Write(value, { ...worker, email: null }, { operation: 'create', tableId: 'requests', values: { r_title: 'Заявка' } }).ok).toBe(false)
  })
  it('derives a creation owner from the verified actor and blocks client replacement', () => {
    const value = appV2Fixture()
    expect(authorizeAppV2Write(value, worker, { operation: 'create', tableId: 'requests', values: { r_title: 'Заявка' } })).toEqual({ ok: true, ownerValues: { r_owner: 'anna@example.com' } })
    expect(authorizeAppV2Write(value, worker, { operation: 'create', tableId: 'requests', values: { r_title: 'Заявка', r_owner: 'someone@example.com' } }).ok).toBe(false)
    expect(authorizeAppV2Write(value, worker, { operation: 'update', row: record, values: { r_owner: 'someone@example.com' } }).ok).toBe(false)
    expect(authorizeAppV2Write(value, owner, { operation: 'update', row: record, values: { r_owner: 'someone@example.com' } }).ok).toBe(true)
  })
  it('distinguishes permission to run a workflow from permission for each data operation', () => {
    const value = appV2Fixture()
    expect(canInvokeAppV2Workflow(value, worker, 'complete')).toBe(true)
    expect(authorizeAppV2Write(value, worker, { operation: 'delete', row: record }).ok).toBe(false)
    expect(authorizeAppV2Write(value, owner, { operation: 'delete', row: record }).ok).toBe(true)
  })
  it('restricts history visibility separately from the request list', () => {
    const app = appV2Fixture(), history: AppV2Record = { id: 'log_1', tableId: 'history', values: { h_title: 'Чужая заявка', h_owner: 'pavel@example.com', h_request: 'request_2' } }
    expect(readableAppV2Fields(app, worker, history).size).toBe(0)
    expect(projectAppV2Row(app, owner, history)).toEqual({ h_title: 'Чужая заявка', h_request: 'request_2' })
  })
})
describe('explicit event value contexts', () => {
  it.each(['javascript:alert(1)', 'data:text/html,hello', '//example.com', '/\\example.com', 'https://example.com\n/unsafe', 'file:///C:/private'])('rejects unsafe navigation %s', value => {
    expect(appV2NavigationUrl(value)).toBeNull()
  })
  it('keeps explicit web links and internal paths usable', () => {
    expect(appV2NavigationUrl('https://example.com/orders')).toBe('https://example.com/orders')
    expect(appV2NavigationUrl('/orders?status=new')).toBe('/orders?status=new')
  })
  it('resolves row, form, current user and previous result without mixing the contexts', () => {
    const context = { actor: worker, row: record, forms: new Map([['form', { tableId: 'requests', values: { r_title: 'Новое название' } }]]), results: new Map([['created', other]]) }
    expect(resolveAppV2Binding({ kind: 'row', fieldId: 'r_title' }, context)).toEqual({ ok: true, value: 'Ремонт принтера' })
    expect(resolveAppV2Binding({ kind: 'form', formId: 'form', fieldId: 'r_title' }, context)).toEqual({ ok: true, value: 'Новое название' })
    expect(resolveAppV2Binding({ kind: 'user', property: 'id' }, context)).toEqual({ ok: true, value: 'user_anna' })
    expect(resolveAppV2Binding({ kind: 'result_id', stepId: 'created' }, context)).toEqual({ ok: true, value: 'request_2' })
    expect(resolveAppV2Binding({ kind: 'form', formId: 'other_form', fieldId: 'r_title' }, context).ok).toBe(false)
    expect(resolveAppV2Binding({ kind: 'result_id', stepId: 'future' }, context).ok).toBe(false)
  })
  it('distinguishes an absent field from a permitted empty value and blocks prototype lookup', () => {
    expect(resolveAppV2Binding({ kind: 'row', fieldId: 'missing' }, { actor: worker, row: record }).ok).toBe(false)
    expect(resolveAppV2Binding({ kind: 'row', fieldId: 'constructor' }, { actor: worker, row: record }).ok).toBe(false)
    expect(resolveAppV2Binding({ kind: 'row', fieldId: 'r_title' }, { actor: worker, row: { ...record, values: { r_title: null } } })).toEqual({ ok: true, value: null })
    expect(resolveAppV2Binding({ kind: 'user', property: 'email' }, { actor: { ...guest, email: 'fake@example.com' } }).ok).toBe(false)
  })
  it('fails conditions with missing data and refuses implicit string-to-number conversions', () => {
    const context = { actor: worker, row: record }
    expect(evaluateAppV2Condition({ op: 'gt', left: { kind: 'row', fieldId: 'r_amount' }, right: { kind: 'literal', value: 1000 } }, context)).toEqual({ ok: true, value: true })
    expect(evaluateAppV2Condition({ op: 'gt', left: { kind: 'row', fieldId: 'r_amount' }, right: { kind: 'literal', value: '1000' } }, context).ok).toBe(false)
    expect(evaluateAppV2Condition({ op: 'or', conditions: [{ op: 'eq', left: { kind: 'literal', value: true }, right: { kind: 'literal', value: true } }, { op: 'empty', value: { kind: 'row', fieldId: 'missing' } }] }, context).ok).toBe(false)
    expect(evaluateAppV2Condition({ op: 'eq', left: { kind: 'literal', value: {} }, right: { kind: 'literal', value: {} } }, context).ok).toBe(false)
  })
})
