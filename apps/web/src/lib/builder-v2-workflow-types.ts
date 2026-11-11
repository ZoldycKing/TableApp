import type { AppV2, AppV2Step } from '@tableapp/schema/app-v2'
export type BuilderV2Workflow = AppV2['workflows'][number]
export type BuilderV2WorkflowEffect = { type: 'notify'; message: string } | { type: 'open_screen'; screenId: string; recordId?: string } | {type:'go_back';screenId:string} | {type:'open_url';url:string} | {type:'copy_value';value:string}
export type BuilderV2WorkflowTrace = { stepId: string; label: string; status: 'done' | 'skipped' | 'rolled_back' | 'failed'; detail?: string }[]
export type BuilderV2WorkflowConfirmation = {
  fingerprint: string
  kind?: 'delete' | 'cancel_purchase'
  title?: string
  message?: string
  records: { tableName: string; recordLabel: string }[]
}
export const BUILDER_V2_WORKFLOW_STEPS = new Set<AppV2Step['type']>(['require', 'branch', 'create_row', 'place_shop_order', 'record_inventory_movement', 'create_purchase_order', 'update_purchase_order', 'order_purchase_order', 'receive_purchase_order', 'cancel_purchase_order', 'update_row', 'delete_row', 'notify', 'open_screen', 'go_back', 'open_url', 'copy_value'])
export function builderV2WorkflowSteps(steps: readonly AppV2Step[]): AppV2Step[] { return steps.flatMap(step => [step, ...(step.type === 'branch' ? [...builderV2WorkflowSteps(step.then), ...builderV2WorkflowSteps(step.else)] : [])]) }
export function builderV2ExecutableWorkflow(flow: BuilderV2Workflow) { return builderV2WorkflowSteps(flow.steps).every(step => BUILDER_V2_WORKFLOW_STEPS.has(step.type)&&(step.type!=='delete_row'||step.confirm===true)) }
export function builderV2StepLabel(step: AppV2Step, tables: readonly { id: string; name: string }[], screens: readonly { id: string; name: string }[]) {
  if (step.type === 'record_inventory_movement') return 'Записать движение склада'
  if (step.type === 'create_purchase_order') return 'Создать заказ поставщику'
  if (step.type === 'update_purchase_order') return 'Изменить заказ поставщику'
  if (step.type === 'order_purchase_order') return 'Отметить заказ заказанным'
  if (step.type === 'receive_purchase_order') return 'Принять заказ поставщика'
  if (step.type === 'cancel_purchase_order') return 'Отменить полученный заказ'
  if (step.type === 'create_row' || step.type === 'place_shop_order') return `Добавить запись: ${tables.find(table => table.id === step.tableId)?.name ?? 'Таблица'}`
  if (step.type === 'update_row') return `Изменить запись: ${tables.find(table => table.id === step.tableId)?.name ?? 'Таблица'}`
  if (step.type === 'open_screen') return `Открыть экран: ${screens.find(screen => screen.id === step.screenId)?.name ?? 'Экран'}`
  return ({ require: 'Проверить условие', branch: 'Выбрать по условию', notify: 'Показать сообщение', delete_row: 'Удалить запись', go_back: 'Назад', open_url: 'Открыть ссылку', copy_value: 'Скопировать значение' } as const)[step.type]
}
export type BuilderV2WorkflowRun = { id: string; createdAt: string; status: 'succeeded' | 'failed'; workflowName: string; error: string | null; trace: BuilderV2WorkflowTrace; actor?: {name:string|null;email:string} }
export type BuilderV2WorkflowHistorySource = 'author' | 'published'
