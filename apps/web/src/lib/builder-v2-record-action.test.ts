import { expect, it } from 'vitest'
import { validateAppV2Definition } from '@tableapp/schema/app-definition'
import { appV2Fixture, v2Catalog } from '../../../../packages/schema/src/app-v2/fixture.test-utils'
import { grantBuilderV2Operation } from './builder-v2-action-policy'
import { builderV2SaveFormAction, configureBuilderV2FormSave } from './builder-v2-form-action'
import { configureBuilderV2Delete, builderV2DeleteAction } from './builder-v2-delete-action'
import type { BuilderV2Form } from './builder-v2-form-types'

it('configures an edit form without writing read-only ownership and preserves owned scopes', () => {
  let app = appV2Fixture()
  app = configureBuilderV2FormSave({ ...app, workflows: app.workflows.filter(flow => flow.id !== 'create'), nodes: app.nodes.map(node => node.id === 'create_form' && node.type === 'form' ? { ...node, events: { submit: null }, mode: 'edit' } : node), policy: { ...app.policy, workflows: app.policy.workflows.filter(grant => grant.workflowId !== 'create') }, screens: app.screens.map(screen => screen.id === 'new' ? { ...screen, contextTableId: 'requests', navigation: false } : screen) }, 'create_form', ['worker'])
  const form = app.nodes.find(node => node.id === 'create_form') as BuilderV2Form
  expect(builderV2SaveFormAction(app, form)?.step).toMatchObject({ type: 'update_row', target: { kind: 'current' } })
  expect(validateAppV2Definition(app, v2Catalog).ok).toBe(true)
  expect(app.policy.tables.find(rule => rule.tableId === 'requests')!.grants.filter(grant => grant.audience.kind === 'roles' && grant.audience.roleIds.includes('worker')).every(grant => !grant.update || grant.update.rows.kind === 'owned')).toBe(true)
})
it('inherits read ownership when enabling a new update or delete, without granting unrelated fields', () => {
  const app = appV2Fixture(); app.policy.tables = [{ tableId: 'requests', grants: [{ audience: { kind: 'roles', roleIds: ['worker'] }, read: { fieldIds: ['r_title', 'r_owner'], rows: { kind: 'owned', fieldId: 'r_owner', property: 'email' } } }] }]
  const updated = grantBuilderV2Operation(app, 'requests', ['worker'], 'update', ['r_title'])
  expect(updated[0]!.grants[1]).toEqual({ audience: { kind: 'roles', roleIds: ['worker'] }, update: { fieldIds: ['r_title'], rows: { kind: 'owned', fieldId: 'r_owner', property: 'email' } } })
  expect(grantBuilderV2Operation(app, 'requests', ['worker'], 'delete')[0]!.grants[1]!.delete?.rows.kind).toBe('owned')
  expect(() => grantBuilderV2Operation(app, 'requests', ['worker'], 'update', ['r_owner'])).toThrow('Поле владельца')
})
it('configures only confirmed single delete on a detail screen and removes only its exclusive workflow', () => {
  let app = appV2Fixture()
  const button = app.nodes.find(node => node.id === 'complete_button')!
  if (button.type !== 'button') throw new Error('Fixture button')
  app.nodes = app.nodes.map(node => node.id === button.id ? { ...button, events: { press: null } } : node)
  app = configureBuilderV2Delete(app, button.id, ['worker'])
  const action = builderV2DeleteAction(app, app.nodes.find(node => node.id === button.id)!)!
  expect(action.step).toMatchObject({ type: 'delete_row', confirm: true, target: { kind: 'current' } })
  expect(validateAppV2Definition(app, v2Catalog).ok).toBe(true)
  const disabled = configureBuilderV2Delete(app, button.id, null)
  expect(disabled.policy.tables).toEqual(app.policy.tables)
  expect(disabled.workflows.some(flow => flow.id === action.flow.id)).toBe(false)
  expect(disabled.workflows.some(flow => flow.id === 'complete')).toBe(true)
  action.flow.steps.push({ id: 'notice', type: 'notify', message: { kind: 'literal', value: 'Удалено' } })
  expect(builderV2DeleteAction(app, app.nodes.find(node => node.id === button.id)!)).toBeNull()
})
