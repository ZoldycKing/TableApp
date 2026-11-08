import type { AppV2 } from '@tableapp/schema/app-v2'
import { builderV2FormInputs, type BuilderV2Form } from './builder-v2-form-types'
import { nodeContext, replaceNode, v2Id } from '@/components/builder/v2/model'
import { builderV2ScreenNodes } from './builder-v2-data-types'
import { grantBuilderV2Operation } from './builder-v2-action-policy'
import { builderV2WorkingPath } from './builder-v2-working-scope'
import { builderV2ExecutableWorkflow, builderV2WorkflowSteps, type BuilderV2Workflow } from './builder-v2-workflow-types'

/** Recognize the main form save, then execute its entire supported workflow. */
export function builderV2FormSaveWorkflow(app: AppV2, form: BuilderV2Form) {
  const flow = app.workflows.find(flow => flow.id === form.events.submit), inputs = builderV2FormInputs(app, form)
  if (!inputs.length || !flow || flow.input.formId !== form.id || !builderV2ExecutableWorkflow(flow)) return null
  const candidates = flow.steps.filter(step => (step.type === 'create_row' || step.type === 'update_row') && step.type === (form.mode === 'edit' ? 'update_row' : 'create_row') && step.tableId === form.tableId && Object.keys(step.values).length && Object.entries(step.values).every(([id, value]) => value.kind === 'form' && value.formId === form.id && value.fieldId === id))
  const writes = builderV2FormWriteInputs(app, form), step = candidates.find(step => 'values' in step && Object.keys(step.values).length === writes.length && writes.every(input => Object.hasOwn(step.values, input.fieldId))) ?? candidates[0]
  if (!step || step.type !== 'create_row' && step.type !== 'update_row') return null
  if (step.type === 'update_row' && (step.target.kind !== 'current' || flow.input.rowTableId !== form.tableId)) return null
  return { flow, step }
}
export function builderV2FormWriteInputs(app: AppV2, form: BuilderV2Form) { return builderV2FormInputs(app, form).filter(input => form.mode === 'create' || !input.readOnly) }
export function builderV2SaveFormAction(app: AppV2, form: BuilderV2Form) {
  const action = builderV2FormSaveWorkflow(app, form), inputs = builderV2FormWriteInputs(app, form)
  return action && Object.keys(action.step.values).length === inputs.length && inputs.every(input => Object.hasOwn(action.step.values, input.fieldId)) ? action : null
}
export const builderV2FormCreateWorkflow = (app: AppV2, form: BuilderV2Form) => form.mode === 'create' ? builderV2FormSaveWorkflow(app, form) : null
export const builderV2CreateFormAction = (app: AppV2, form: BuilderV2Form) => form.mode === 'create' ? builderV2SaveFormAction(app, form) : null
export const configureBuilderV2FormCreate = (app: AppV2, formId: string, roleIds: readonly string[] | null) => configureBuilderV2FormSave(app, formId, roleIds)
export function configureBuilderV2FormSave(app: AppV2, formId: string, roleIds: readonly string[] | null): AppV2 {
  const form = app.nodes.find(node => node.id === formId), screen = app.screens.find(screen => builderV2ScreenNodes(app, screen.id).some(node => node.id === formId))
  if (form?.type !== 'form' || !screen) throw new Error('Выберите форму')
  const current = builderV2FormSaveWorkflow(app, form)
  if (form.events.submit && !current) throw new Error('У формы настроено другое действие. Его изменение будет доступно в редакторе действий.')
  if (!roleIds?.length) {
    const shared = current && app.nodes.some(node => node.id !== form.id && 'events' in node && Object.values(node.events).includes(current.flow.id))
    const next = current && !shared ? { ...app, workflows: app.workflows.filter(flow => flow.id !== current.flow.id), policy: { ...app.policy, workflows: app.policy.workflows.filter(grant => grant.workflowId !== current.flow.id) } } : app
    return replaceNode(next, { ...form, events: { submit: null } })
  }
  if (roleIds.some(id => !app.roles.some(role => role.id === id))) throw new Error('Выберите роль приложения')
  const context = nodeContext(app, screen.id, form.id)
  if (!builderV2WorkingPath(app, screen.id, form.id) || context.rowTableId !== (screen.contextTableId ?? null)) throw new Error('Рабочую форму нужно разместить на экране или в карточке записи, вне списка')
  if (form.mode === 'edit' && screen.contextTableId !== form.tableId) throw new Error('Разместите форму в карточке этой таблицы')
  const inputs = builderV2FormWriteInputs(app, form), fieldIds = [...new Set(inputs.map(input => input.fieldId))]
  if (!fieldIds.length) throw new Error('Добавьте поля формы')
  const shared = current && app.nodes.some(node => node.id !== form.id && 'events' in node && Object.values(node.events).includes(current.flow.id))
  const id = current && !shared ? current.flow.id : v2Id()
  const values = Object.fromEntries(fieldIds.map(fieldId => [fieldId, { kind: 'form' as const, formId, fieldId }]))
  const step = form.mode === 'edit' ? { id: current?.step.id ?? v2Id(), type: 'update_row' as const, tableId: form.tableId, target: { kind: 'current' as const }, values } : { id: current?.step.id ?? v2Id(), type: 'create_row' as const, tableId: form.tableId, values }
  const flow: AppV2['workflows'][number] = { id, name: current?.flow.name ?? (form.mode === 'edit' ? 'Сохранить изменения' : 'Сохранить форму'), input: { formId: form.id, rowTableId: context.rowTableId, screenTableId: screen.contextTableId }, steps: current ? current.flow.steps.map(item => item.id === current.step.id ? step : item) : [step] }
  const audience = { kind: 'roles' as const, roleIds: [...new Set(roleIds)] }
  const tables = grantBuilderV2WorkflowWrites(app, flow, audience.roleIds)
  return replaceNode({ ...app, workflows: [...app.workflows.filter(flow => flow.id !== id), flow], policy: { tables, workflows: [...app.policy.workflows.filter(grant => grant.workflowId !== id), { workflowId: id, audience }] } }, { ...form, events: { submit: id } })
}

export function grantBuilderV2WorkflowWrites(app: AppV2, flow: BuilderV2Workflow, roles: readonly string[]) {
  let tables = app.policy.tables
  for (const step of builderV2WorkflowSteps(flow.steps)) if (step.type === 'create_row' || step.type === 'update_row') tables = grantBuilderV2Operation({ ...app, policy: { ...app.policy, tables } }, step.tableId, roles, step.type === 'create_row' ? 'create' : 'update', Object.keys(step.values))
  for(const step of builderV2WorkflowSteps(flow.steps))if(step.type==='delete_row')tables=grantBuilderV2Operation({...app,policy:{...app.policy,tables}},step.tableId,roles,'delete')
  return tables
}
export function configureBuilderV2FormWorkflow(app: AppV2, formId: string, flow: BuilderV2Workflow): AppV2 {
  const form = app.nodes.find(node => node.id === formId)
  if (form?.type !== 'form' || flow.id !== form.events.submit || !builderV2ExecutableWorkflow(flow)) throw new Error('Выберите действие этой формы')
  const roles = [...new Set(app.policy.workflows.filter(grant => grant.workflowId === flow.id).flatMap(grant => grant.audience.kind === 'roles' ? grant.audience.roleIds : []))]
  if (!roles.length) throw new Error('Выберите роли, которым доступно действие')
  const shared = app.nodes.some(node => node.id !== form.id && 'events' in node && Object.values(node.events).includes(flow.id)), next = { ...flow, id: shared ? v2Id() : flow.id }
  const candidate = replaceNode({ ...app, workflows: [...app.workflows.filter(item => item.id !== next.id), next], policy: { tables: grantBuilderV2WorkflowWrites(app, next, roles), workflows: [...app.policy.workflows.filter(grant => grant.workflowId !== next.id), { workflowId: next.id, audience: { kind: 'roles' as const, roleIds: roles } }] } }, { ...form, events: { submit: next.id } })
  if (!builderV2SaveFormAction(candidate, { ...form, events: { submit: next.id } })) throw new Error('Оставьте основное сохранение всех полей формы отдельным шагом')
  return candidate
}
