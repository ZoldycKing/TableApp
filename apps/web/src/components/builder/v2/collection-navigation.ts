import { evaluateAppV2Condition, matchesAppV2Audience, type AppV2, type AppV2Actor, type AppV2Node } from '@tableapp/schema/app-v2'

/** Preview supports only this complete, side-effect-free workflow. Never extract a step from a larger action. */
export function collectionCardScreen(app: AppV2, node: AppV2Node): string | undefined {
  if (node.type !== 'collection' || !node.events.itemPress) return
  const source = app.sources.find(source => source.id === node.sourceId), flow = app.workflows.find(flow => flow.id === node.events.itemPress)
  const step = flow?.steps[0]
  if (!source || !flow || flow.input.rowTableId !== source.tableId || flow.input.formId !== null || flow.steps.length !== 1 || step?.type !== 'open_screen' || step.record?.kind !== 'current') return
  if (app.screens.find(screen => screen.id === step.screenId)?.contextTableId === source.tableId) return step.screenId
}

/** A record has a parent only when a single visible section can open it directly. */
export function builderV2RecordParent(app: AppV2, screenId: string, allowed: (screenId: string, node: Extract<AppV2Node, { type: 'collection' }>) => boolean = () => true) {
  if (!app.screens.find(screen => screen.id === screenId)?.contextTableId) return
  const nodes = new Map(app.nodes.map(node => [node.id, node]))
  const parents = app.screens.flatMap(screen => {
    if (screen.contextTableId || !screen.navigation) return []
    const collections = screen.rootIds.flatMap(id => {
      const node = nodes.get(id)
      return node?.type === 'collection' && collectionCardScreen(app, node) === screenId && allowed(screen.id, node) ? [node] : []
    })
    return collections.length ? [{ screen, collections }] : []
  })
  if (parents.length !== 1) return
  const { screen, collections } = parents[0]!
  const node = collections.length === 1 ? collections[0] : undefined
  const queue = node?.layout === 'list' && node.recordGroup && !node.itemIds.length && !app.sources.find(source => source.id === node.sourceId)?.screenTableId ? node : undefined
  return { screenId: screen.id, queue }
}

export function builderV2PreviewRecordParent(app: AppV2, screenId: string, actor: AppV2Actor) {
  return builderV2RecordParent(app, screenId, (_, node) => {
    if (node.visibleTo && !matchesAppV2Audience(node.visibleTo, actor)) return false
    const condition = node.visibleWhen && evaluateAppV2Condition(node.visibleWhen, { actor })
    return !condition || (condition.ok && condition.value)
  })
}

/** Purchases tab stays highlighted on supplier/order/reorder nested screens. */
export function builderV2InventoryPurchaseSection(app: AppV2, screenId: string) {
  const inventory = app.inventory
  if (!inventory?.purchasesScreenId) return
  const nested = [
    inventory.purchaseScreenId,
    inventory.createPurchaseScreenId,
    inventory.suppliersScreenId,
    inventory.supplierScreenId,
    inventory.createSupplierScreenId,
    inventory.reorderScreenId,
  ]
  return nested.includes(screenId) ? inventory.purchasesScreenId : undefined
}
