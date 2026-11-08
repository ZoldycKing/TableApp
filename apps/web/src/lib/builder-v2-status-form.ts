import { canInvokeAppV2Workflow, type AppV2, type AppV2Actor, type AppV2Node } from '@tableapp/schema/app-v2'
import { builderV2SaveFormAction } from './builder-v2-form-action'

/** Edit form that can set order status (optionally with shipment date / reply fields). */
export function builderV2StatusForm(app: AppV2, node: AppV2Node, actor: AppV2Actor, statusFieldId: string) {
  if (node.type !== 'form' || node.mode !== 'edit' || !node.childIds.length) return
  const inputs = node.childIds.map(id => app.nodes.find(item => item.id === id))
  if (inputs.some(item => item?.type !== 'input')) return
  const status = inputs.find(item => item?.type === 'input' && item.fieldId === statusFieldId && !item.readOnly)
  if (!status) return
  const action = builderV2SaveFormAction(app, node)
  if (action?.step.type === 'update_row' && action.flow.steps.length === 1 && canInvokeAppV2Workflow(app, actor, action.flow.id)) return action
}
