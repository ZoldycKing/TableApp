import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import { builderV2ScreenNodes } from './builder-v2-data-types'
import { nodeContext, replaceNode, v2Id } from '@/components/builder/v2/model'
import { grantBuilderV2Operation } from './builder-v2-action-policy'
import { builderV2WorkingPath } from './builder-v2-working-scope'

export function builderV2DeleteAction(app: AppV2, node: AppV2Node) {
  if (node.type !== 'button') return null
  const flow = app.workflows.find(flow => flow.id === node.events.press), step = flow?.steps[0]
  return flow && flow.steps.length === 1 && flow.input.formId === null && step?.type === 'delete_row' && step.target.kind === 'current' && step.confirm && step.tableId === flow.input.rowTableId && app.screens.some(screen=>screen.contextTableId===step.tableId&&builderV2WorkingPath(app,screen.id,node.id)) ? { flow, step } : null
}
export function configureBuilderV2Delete(app: AppV2, nodeId: string, roleIds: readonly string[] | null): AppV2 {
  const node = app.nodes.find(node => node.id === nodeId), screen = app.screens.find(screen => builderV2ScreenNodes(app, screen.id).some(node => node.id === nodeId))
  if (node?.type !== 'button' || !screen) throw new Error('Выберите кнопку в карточке записи')
  const current = builderV2DeleteAction(app, node)
  if (node.events.press && !current) throw new Error('Сначала отключите другое действие кнопки')
  const shared = current && (app.nodes.some(candidate => candidate.id !== node.id && 'events' in candidate && Object.values(candidate.events).includes(current.flow.id))||app.screens.some(screen=>screen.events.enter===current.flow.id))
  if (!roleIds?.length) {
    const next = current && !shared ? { ...app, workflows: app.workflows.filter(flow => flow.id !== current.flow.id), policy: { ...app.policy, workflows: app.policy.workflows.filter(grant => grant.workflowId !== current.flow.id) } } : app
    return replaceNode(next, { ...node, events: { press: null } })
  }
  if (roleIds.some(id => !app.roles.some(role => role.id === id))) throw new Error('Выберите роль приложения')
  const context = nodeContext(app, screen.id, node.id)
  if (!screen.contextTableId || !builderV2WorkingPath(app, screen.id, node.id) || context.rowTableId !== screen.contextTableId || context.formId) throw new Error('Разместите кнопку в карточке записи, вне формы и списка')
  const id = current && !shared ? current.flow.id : v2Id(), audience = { kind: 'roles' as const, roleIds: [...new Set(roleIds)] }
  const flow: AppV2['workflows'][number] = { id, name: 'Удалить запись', input: { rowTableId: screen.contextTableId, screenTableId: screen.contextTableId, formId: null }, steps: [{ id: current?.step.id ?? v2Id(), type: 'delete_row', tableId: screen.contextTableId, target: { kind: 'current' }, confirm: true }] }
  return replaceNode({ ...app, workflows: [...app.workflows.filter(flow => flow.id !== id), flow], policy: { tables: grantBuilderV2Operation(app, screen.contextTableId, audience.roleIds, 'delete'), workflows: [...app.policy.workflows.filter(grant => grant.workflowId !== id), { workflowId: id, audience }] } }, { ...node, name: node.name === 'Кнопка' ? 'Удалить запись' : node.name, label: node.label === 'Кнопка' ? 'Удалить запись' : node.label, variant: 'danger', events: { press: id } })
}
