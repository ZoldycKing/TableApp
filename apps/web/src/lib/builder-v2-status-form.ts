import { canInvokeAppV2Workflow, type AppV2, type AppV2Actor, type AppV2Node } from '@tableapp/schema/app-v2'
import { builderV2SaveFormAction } from './builder-v2-form-action'

export function builderV2StatusForm(app: AppV2, node: AppV2Node, actor: AppV2Actor, statusFieldId: string) {
  if (node.type !== 'form' || node.mode !== 'edit' || node.childIds.length !== 1) return
  const input = app.nodes.find(item => item.id === node.childIds[0])
  if (input?.type !== 'input' || input.fieldId !== statusFieldId || input.readOnly) return
  const action = builderV2SaveFormAction(app, node)
  if (action?.step.type === 'update_row' && action.flow.steps.length === 1 && canInvokeAppV2Workflow(app, actor, action.flow.id)) return action
}
