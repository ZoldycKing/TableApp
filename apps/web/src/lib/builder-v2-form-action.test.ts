import { expect, it } from 'vitest'
import { appV2Fixture, v2Catalog } from '../../../../packages/schema/src/app-v2/fixture.test-utils'
import { validateAppV2Definition } from '@tableapp/schema/app-definition'
import { configureBuilderV2FormCreate, builderV2CreateFormAction, configureBuilderV2FormWorkflow } from './builder-v2-form-action'
import type { BuilderV2Form } from './builder-v2-form-types'

function fresh() {
  const app = appV2Fixture()
  app.workflows = app.workflows.filter(flow => flow.id !== 'create')
  app.policy.workflows = app.policy.workflows.filter(grant => grant.workflowId !== 'create')
  const form = app.nodes.find(node => node.id === 'create_form') as BuilderV2Form
  form.events.submit = null
  return { app, form }
}
it('adds a complete create workflow without widening unrelated permissions, and disabling preserves independent table grants', () => {
  const { app } = fresh(), before = structuredClone(app)
  const next = configureBuilderV2FormCreate(app, 'create_form', ['owner'])
  expect(validateAppV2Definition(next, v2Catalog).ok).toBe(true)
  const form = next.nodes.find(node => node.id === 'create_form') as BuilderV2Form
  expect(builderV2CreateFormAction(next, form)?.step).toMatchObject({ type: 'create_row', tableId: 'requests' })
  expect(app).toEqual(before)
  expect(next.policy.tables).toEqual(app.policy.tables)
  expect(next.workflows.filter(flow => flow.id !== form.events.submit)).toEqual(app.workflows)
  const disabled = configureBuilderV2FormCreate(next, form.id, null)
  expect(disabled.policy.tables).toEqual(next.policy.tables)
  expect(disabled.nodes.find(node => node.id === form.id)).toMatchObject({ events: { submit: null } })
  expect(disabled.workflows.some(flow => flow.id === form.events.submit)).toBe(false)
})
it('grants only mapped create fields after explicit configuration and requires reconnecting added fields', () => {
  const { app } = fresh(); app.policy.tables = []
  const next = configureBuilderV2FormCreate(app, 'create_form', ['worker'])
  const grant = next.policy.tables[0]!.grants[0]!
  expect(grant).toEqual({ audience: { kind: 'roles', roleIds: ['worker'] }, create: { fieldIds: ['r_title', 'r_amount'] } })
  const form = next.nodes.find(node => node.id === 'create_form') as BuilderV2Form
  form.childIds.push('status_input'); next.nodes.push({ id: 'status_input', type: 'input', name: 'Статус', label: 'Статус', fieldId: 'r_status', required: false, initialValue: null, visibleTo: null, visibleWhen: null })
  expect(builderV2CreateFormAction(next, form)).toBeNull()
  const refreshed = configureBuilderV2FormCreate(next, form.id, ['worker'])
  expect(builderV2CreateFormAction(refreshed, refreshed.nodes.find(node => node.id === form.id) as BuilderV2Form)).toBeTruthy()
  expect(validateAppV2Definition(refreshed, v2Catalog).ok).toBe(true)
})
it('does not extract a write from a workflow with unsupported effects or allow an unknown role', () => {
  const app = appV2Fixture(); app.workflows.find(flow => flow.id === 'create')!.steps.push({ id: 'external', type: 'delete_row', tableId:'requests',target:{kind:'current'},confirm:false })
  expect(() => configureBuilderV2FormCreate(app, 'create_form', ['owner'])).toThrow('другое действие')
  expect(() => configureBuilderV2FormCreate(fresh().app, 'create_form', ['made_up'])).toThrow('роль')
})
it('preserves complete sequences when reconnecting fields or changing roles and only grants writes explicitly configured', () => {
  const app = appV2Fixture(), flow = app.workflows.find(flow => flow.id === 'create')!
  const next = configureBuilderV2FormWorkflow(app, 'create_form', { ...flow, steps: [...flow.steps, { id: 'audit', type: 'create_row', tableId: 'history', values: { h_title: { kind: 'result', stepId: 'new_request', fieldId: 'r_title' } } }] })
  expect(next.workflows.find(item => item.id === flow.id)!.steps).toHaveLength(4)
  const refreshed = configureBuilderV2FormCreate(next, 'create_form', ['worker'])
  expect(refreshed.workflows.find(item => item.id === flow.id)!.steps).toEqual(next.workflows.find(item => item.id === flow.id)!.steps)
  expect(refreshed.policy.tables.find(rule => rule.tableId === 'history')!.grants.filter(grant => grant.audience.kind === 'roles' && grant.audience.roleIds.includes('worker')).some(grant => Boolean(grant.update || grant.delete))).toBe(false)
  expect(validateAppV2Definition(refreshed, v2Catalog).ok).toBe(true)
  expect(app.workflows.find(item => item.id === flow.id)!.steps).toHaveLength(3)
})
