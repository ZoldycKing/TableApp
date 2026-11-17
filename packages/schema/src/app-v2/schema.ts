import { z } from 'zod'
import { appThemeSchema, bookingConfigSchema, SLUG_PATTERN } from '../app'
import { appV2TeamCalendarShape } from './team-calendar'
import { appV2BindingSchema, appV2ConditionSchema, appV2IdSchema as id, type AppV2Binding, type AppV2Condition } from './values'

export const appV2AudienceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('public') }),
  z.strictObject({ kind: z.literal('roles'), roleIds: z.array(id).min(1).max(100) }),
])
export type AppV2Audience = z.infer<typeof appV2AudienceSchema>
const owner = z.strictObject({ fieldId: id, property: z.enum(['id', 'email', 'company']) })
const scope = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('all') }), z.strictObject({ kind: z.literal('owned'), ...owner.shape })])
export type AppV2RowScope = z.infer<typeof scope>
const fieldIds = z.array(id).min(1).max(500)
const grant = z.strictObject({
  audience: appV2AudienceSchema,
  read: z.strictObject({ fieldIds, rows: scope }).optional(),
  create: z.strictObject({ fieldIds, owner: owner.optional() }).optional(),
  update: z.strictObject({ fieldIds, rows: scope }).optional(),
  delete: z.strictObject({ rows: scope }).optional(),
}).superRefine((value, context) => {
  if (!value.read && !value.create && !value.update && !value.delete) context.addIssue({ code: 'custom', message: 'Укажите разрешённую операцию' })
  if (value.audience.kind === 'public' && (value.create || value.update || value.delete)) context.addIssue({ code: 'custom', message: 'Изменение данных требует входа и рабочей роли' })
})

const target = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('current') }), z.strictObject({ kind: z.literal('result'), stepId: id })])
export type AppV2Target = z.infer<typeof target>
const values = z.record(id, appV2BindingSchema)
export const appV2InventoryOperationSchema = z.enum(['receipt', 'issue', 'write_off', 'transfer'])
export type AppV2InventoryOperation = z.infer<typeof appV2InventoryOperationSchema>
export type AppV2Step = { id: string } & (
  | { type: 'create_row'; tableId: string; values: Record<string, AppV2Binding> }
  | { type: 'place_shop_order'; tableId: string; values: Record<string, AppV2Binding> }
  | { type: 'record_inventory_movement'; operation: AppV2InventoryOperation; values: Record<string, AppV2Binding> }
  | { type: 'create_purchase_order'; tableId: string; values: Record<string, AppV2Binding> }
  | { type: 'update_purchase_order'; tableId: string; values: Record<string, AppV2Binding> }
  | { type: 'order_purchase_order' }
  | { type: 'receive_purchase_order' }
  | { type: 'cancel_purchase_order' }
  | { type: 'create_inventory_count'; tableId: string; values: Record<string, AppV2Binding> }
  | { type: 'update_inventory_count'; tableId: string; values: Record<string, AppV2Binding> }
  | { type: 'post_inventory_count' }
  | { type: 'cancel_inventory_count' }
  | { type: 'create_reorder_orders'; tableId: string; values: Record<string, AppV2Binding> }
  | { type: 'update_row'; tableId: string; target: AppV2Target; values: Record<string, AppV2Binding> }
  | { type: 'delete_row'; tableId: string; target: AppV2Target; confirm: boolean }
  | { type: 'require'; condition: AppV2Condition; message: string }
  | { type: 'branch'; condition: AppV2Condition; then: AppV2Step[]; else: AppV2Step[] }
  | { type: 'open_screen'; screenId: string; record: AppV2Target | null }
  | { type: 'notify'; message: AppV2Binding }
  | { type: 'open_url' | 'copy_value'; value: AppV2Binding }
  | { type: 'go_back' }
)
export const appV2StepSchema: z.ZodType<AppV2Step> = z.lazy(() => z.discriminatedUnion('type', [
  z.strictObject({ id, type: z.literal('create_row'), tableId: id, values }),
  z.strictObject({ id, type: z.literal('place_shop_order'), tableId: id, values }),
  z.strictObject({ id, type: z.literal('record_inventory_movement'), operation: appV2InventoryOperationSchema, values }),
  z.strictObject({ id, type: z.literal('create_purchase_order'), tableId: id, values }),
  z.strictObject({ id, type: z.literal('update_purchase_order'), tableId: id, values }),
  z.strictObject({ id, type: z.literal('order_purchase_order') }),
  z.strictObject({ id, type: z.literal('receive_purchase_order') }),
  z.strictObject({ id, type: z.literal('cancel_purchase_order') }),
  z.strictObject({ id, type: z.literal('create_inventory_count'), tableId: id, values }),
  z.strictObject({ id, type: z.literal('update_inventory_count'), tableId: id, values }),
  z.strictObject({ id, type: z.literal('post_inventory_count') }),
  z.strictObject({ id, type: z.literal('cancel_inventory_count') }),
  z.strictObject({ id, type: z.literal('create_reorder_orders'), tableId: id, values }),
  z.strictObject({ id, type: z.literal('update_row'), tableId: id, target, values }),
  z.strictObject({ id, type: z.literal('delete_row'), tableId: id, target, confirm: z.boolean() }),
  z.strictObject({ id, type: z.literal('require'), condition: appV2ConditionSchema, message: z.string().min(1).max(500) }),
  z.strictObject({ id, type: z.literal('branch'), condition: appV2ConditionSchema, then: z.array(appV2StepSchema).max(100), else: z.array(appV2StepSchema).max(100) }),
  z.strictObject({ id, type: z.literal('open_screen'), screenId: id, record: target.nullable() }),
  z.strictObject({ id, type: z.literal('notify'), message: appV2BindingSchema }),
  z.strictObject({ id, type: z.enum(['open_url', 'copy_value']), value: appV2BindingSchema }),
  z.strictObject({ id, type: z.literal('go_back') }),
]))
const flow = z.strictObject({ id, name: z.string().min(1).max(100), input: z.strictObject({ rowTableId: id.nullable(), formId: id.nullable(), screenTableId: id.nullable().optional() }), steps: z.array(appV2StepSchema).min(1).max(100) })

const base = { id, name: z.string().max(120), visibleTo: appV2AudienceSchema.nullable().default(null), visibleWhen: appV2ConditionSchema.nullable().default(null) }
export const appV2BusinessOperationSchema = z.enum([
  'inventory_items', 'inventory_receipt', 'inventory_issue', 'inventory_writeOff', 'inventory_returnIn', 'inventory_returnOut', 'inventory_stocktake',
  'production_run', 'production_movement', 'booking_create',
])
export type AppV2BusinessOperation = z.infer<typeof appV2BusinessOperationSchema>
/** Normalized tree: ordered child identifiers keep the shape finite even for invalid input. */
export const appV2NodeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('team_calendar'), ...appV2TeamCalendarShape }),
  z.strictObject({ ...base, type: z.literal('heading'), value: appV2BindingSchema, size: z.enum(['s', 'm', 'l']).default('m') }),
  z.strictObject({ ...base, type: z.literal('text'), value: appV2BindingSchema }),
  z.strictObject({ ...base, type: z.literal('image'), value: appV2BindingSchema, alt: z.string().max(200) }),
  z.strictObject({ ...base, type: z.literal('video'), value: appV2BindingSchema, caption: z.string().max(200) }),
  z.strictObject({ ...base, type: z.literal('gallery'), value: appV2BindingSchema, caption: z.string().max(200), columns: z.number().int().min(2).max(4) }),
  z.strictObject({ ...base, type: z.literal('files'), value: appV2BindingSchema, caption: z.string().max(200) }),
  z.strictObject({ ...base, type: z.literal('field'), value: appV2BindingSchema, label: z.string().max(120) }),
  z.strictObject({ ...base, type: z.literal('profile'), title: appV2BindingSchema, subtitle: appV2BindingSchema.nullable(), image: appV2BindingSchema.nullable(), contacts: z.array(z.strictObject({ label: z.string().max(80), kind: z.enum(['phone', 'email', 'text']), value: appV2BindingSchema })).max(8), childIds: z.array(id).max(100) }),
  z.strictObject({ ...base, type: z.literal('button'), label: z.string().min(1).max(100), variant: z.enum(['primary', 'secondary', 'danger']).default('primary'), events: z.strictObject({ press: id.nullable() }) }),
  z.strictObject({ ...base, type: z.literal('business'), target: z.strictObject({ appId: id, operation: appV2BusinessOperationSchema }).nullable() }),
  z.strictObject({ ...base, type: z.literal('divider') }),
  z.strictObject({ ...base, type: z.literal('group'), appearance: z.enum(['plain', 'card']).default('plain'), childIds: z.array(id).max(500) }),
  z.strictObject({ ...base, type: z.literal('columns'), columns: z.number().int().min(1).max(4), childIds: z.array(id).max(500) }),
  z.strictObject({ ...base, type: z.literal('collection'), sourceId: id, layout: z.enum(['list', 'cards', 'tiles', 'catalog', 'table', 'calendar', 'kanban', 'timeline', 'history']), listGroupFieldId: id.optional(), recordGroup: z.strictObject({ fieldId: id, amountFieldId: id.optional() }).optional(), dateFieldId:id.optional(),groupFieldId:id.optional(),statusFieldId:id.optional(),historyNoteFieldId:id.optional(),kanbanMoveRoleIds:z.array(id).min(1).max(100).optional(), titleFieldId: id, subtitleFieldId: id.nullable(), cardImageFieldId: id.optional(), cardDetailFieldId: id.optional(), itemIds: z.array(id).max(100), events: z.strictObject({ itemPress: id.nullable() }) }),
  z.strictObject({ ...base, type: z.literal('chart'), sourceId:id, chartType:z.enum(['bar','line','donut']), groupFieldId:id, operation:z.enum(['count','sum','avg']), fieldId:id.nullable(), dateGrouping:z.enum(['day','month']), limit:z.number().int().min(3).max(24) }),
  z.strictObject({ ...base, type: z.literal('metric'), sourceId: id, operation: z.enum(['count', 'sum', 'avg', 'min', 'max']), fieldId: id.nullable(), format: z.enum(['number', 'currency']).optional() }),
  z.strictObject({ ...base, type: z.literal('form'), tableId: id, mode: z.enum(['create', 'edit']), childIds: z.array(id).max(500), events: z.strictObject({ submit: id.nullable() }), submitLabel: z.string().min(1).max(100).optional() }),
  z.strictObject({ ...base, type: z.literal('input'), fieldId: id, label: z.string().max(120), required: z.boolean(), initialValue: appV2BindingSchema.nullable(), readOnly: z.boolean().optional() }),
])
export type AppV2Node = z.infer<typeof appV2NodeSchema>

export const appV2Schema = z.strictObject({
  formatVersion: z.literal(2),
  id, workspaceId: id, name: z.string().min(1).max(200), slug: z.string().regex(SLUG_PATTERN),
  purpose: z.enum(['personal', 'business']), theme: appThemeSchema,
  appearance: z.strictObject({
    navigation: z.enum(['bottom', 'sidebar', 'tabs']), icon: z.string().min(1).max(64),
    density: z.enum(['regular', 'compact']).optional(),
    corners: z.enum(['rounded', 'subtle']).optional(),
    presentation: z.enum(['workspace', 'centered']).optional(),
  }).optional(),
  roles: z.array(z.strictObject({ id, name: z.string().min(1).max(40) })).max(100),
  authentication: z.strictObject({ mode: z.enum(['invite_only', 'verified_email']), defaultRoleId: id.nullable(), members: z.array(z.strictObject({ email: z.email(), roleIds: z.array(id).min(1).max(100), company: z.string().max(200) })).max(10_000) }),
  homeScreenId: id.nullable(),
  screens: z.array(z.strictObject({ id, name: z.string().min(1).max(120), menuLabel: z.string().max(120).optional(), icon: z.string().min(1).max(64), navigation: z.boolean(), audience: appV2AudienceSchema, contextTableId: id.nullable(), recordTitleFieldId: id.optional(), catalog: z.strictObject({ titleFieldId: id, imageFieldId: id.optional(), priceFieldId: id.optional(), descriptionFieldId: id.optional() }).optional(), rootIds: z.array(id).max(500), events: z.strictObject({ enter: id.nullable() }) })).max(100),
  nodes: z.array(appV2NodeSchema).max(2000),
  sources: z.array(z.strictObject({ id, tableId: id, screenTableId: id.nullable().optional(), viewId: id.nullable(), filter: appV2ConditionSchema.nullable(), sorts: z.array(z.strictObject({ fieldId: id, direction: z.enum(['asc', 'desc']) })).max(20), searchFieldIds: z.array(id).max(50), pageSize: z.number().int().min(1).max(100) })).max(200),
  workflows: z.array(flow).max(100),
  /** Presentation never grants data access. Missing grants always deny. */
  policy: z.strictObject({ tables: z.array(z.strictObject({ tableId: id, grants: z.array(grant).max(100) })).max(200), workflows: z.array(z.strictObject({ workflowId: id, audience: appV2AudienceSchema })).max(200) }),
  /** Native booking starter shares the existing atomic booking rules and editable v2 nodes. */
  booking: bookingConfigSchema.extend({
    catalogScreenId: id, serviceScreenId: id, mastersScreenId: id, masterScreenId: id,
    visitScreenId: id, clientScreenId: id, createFormId: id, rescheduleFormId: id, statusFormId: id,
    servicePhotoFieldId: id, serviceDescriptionFieldId: id,
    masterPhotoFieldId: id.optional(), masterDescriptionFieldId: id.optional(),
    cancelButtonId: id,
    periodScreenId: id.optional(),
    ownerCreateFormId: id.optional(),
    customersScreenId: id.optional(), customerScreenId: id.optional(), customerCreateFormId: id.optional(), customerEditFormId: id.optional(),
  }).optional(),
  /** Explicit shop bindings. Absent for every app that is not the installed catalogue. */
  shop: z.strictObject({
    catalogTableId: id, catalogViewId: id, catalogScreenId: id, detailScreenId: id, basketScreenId: id, ordersScreenId: id, orderScreenId: id, checkoutFormId: id,
    activeFieldId: id, productTitleFieldId: id, priceFieldId: id, imageFieldId: id.optional(), descriptionFieldId: id.optional(),
    /** Warehouse stock qty shown on the storefront; absent on older installs. */
    stockFieldId: id.optional(),
    /** Show the remaining quantity when stock is strictly below this threshold. */
    lowStockThreshold: z.number().int().min(1).max(1000000).optional(),
    /** Category for catalog tabs; absent on older installs that discover by field name. */
    categoryFieldId: id.optional(),
    ordersTableId: id, itemsTableId: id, emailFieldId: id, statusFieldId: id, assignmentFieldId: id,
    initialStatus: z.string().min(1).max(80), cancelStatus: z.string().min(1).max(80),
    cancellableStatuses: z.array(z.string().min(1).max(80)).min(1).max(20), terminalStatuses: z.array(z.string().min(1).max(80)).max(20),
    submissionFieldId: id, createdFieldId: id, cartFieldId: id, positionsFieldId: id, orderTitleFieldId: id, addressFieldId: id,
    itemNameFieldId: id, itemQtyFieldId: id, itemPriceFieldId: id, itemEmailFieldId: id, itemAssignmentFieldId: id, productFieldId: id,
  }).optional(),
  /** Explicit CRM bindings for the internal deals starter. Absent outside that install. */
  crm: z.strictObject({
    dealsTableId: id, clientsTableId: id,
    /** Append-only contact log for new installs only; absent on older drafts without the table. */
    contactsTableId: id.optional(),
    boardScreenId: id, dealScreenId: id, clientsScreenId: id, clientScreenId: id, calendarScreenId: id,
    createDealScreenId: id.optional(), createClientScreenId: id.optional(),
    createDealFormId: id, createClientFormId: id, contactFormId: id,
    /** Compact stage/due/sum editor; absent on older drafts that only had the journal form. */
    dealEditFormId: id.optional(),
    /** Pencil editor on the client card; absent on older drafts. */
    clientEditFormId: id.optional(),
    titleFieldId: id, stageFieldId: id, dueFieldId: id, noteFieldId: id, sumFieldId: id,
    clientRelationFieldId: id, assignmentFieldId: id, clientNameFieldId: id,
    clientTitleFieldId: id, clientPhoneFieldId: id, clientEmailFieldId: id, clientNoteFieldId: id,
    contactSummaryFieldId: id.optional(), contactLoggedAtFieldId: id.optional(),
    contactDealFieldId: id.optional(), contactClientFieldId: id.optional(), contactNextDueFieldId: id.optional(),
    initialStage: z.string().min(1).max(80),
    terminalStages: z.array(z.string().min(1).max(80)).max(20).optional(),
  }).optional(),
  /** Projects and tasks starter. Absent outside that install. */
  projects: z.strictObject({
    projectsTableId: id, tasksTableId: id, peopleTableId: id, clientsTableId: id, commentsTableId: id, eventsTableId: id, stagesTableId: id,
    mineScreenId: id, boardScreenId: id, projectsScreenId: id, projectScreenId: id, taskScreenId: id, peopleScreenId: id, clientsScreenId: id,
    createTaskFormId: id, editTaskFormId: id, createProjectFormId: id, editProjectFormId: id, commentFormId: id,
    project: z.strictObject({
      title: id, client: id, owner: id, start: id, due: id, budget: id, status: id, progress: id,
    }),
    task: z.strictObject({
      title: id, project: id, assignee: id, assigneeEmail: id, due: id, priority: id, status: id,
      description: id, checklist: id, files: id, sort: id, parent: id, stage: id,
    }),
    stage: z.strictObject({ title: id, project: id, start: id, end: id, goal: id, status: id }),
    person: z.strictObject({ name: id, email: id, phone: id, photo: id, role: id, active: id }),
    client: z.strictObject({ name: id, phone: id, email: id, note: id }),
    comment: z.strictObject({ text: id, task: id, project: id, at: id, author: id, authorEmail: id, assigneeEmail: id, mentions: id }),
    event: z.strictObject({ text: id, project: id, task: id, at: id, kind: id, author: id, authorEmail: id, assigneeEmail: id }),
    statuses: z.strictObject({ todo: id, doing: id, review: id, done: id }),
    priorities: z.strictObject({ low: id, medium: id, high: id, urgent: id }),
    projectStatuses: z.strictObject({ draft: id, active: id, paused: id, done: id, cancelled: id }),
    eventKinds: z.strictObject({ created: id, status: id, comment: id }),
    stageStatuses: z.strictObject({ planned: id, current: id, done: id }),
    activeChoiceId: id,
  }).optional(),
  /** Field-service starter: dispatcher board, technician jobs, notes and completion. Absent outside that install. */
  dispatch: z.strictObject({
    jobsTableId: id, clientsTableId: id, mastersTableId: id, notesTableId: id,
    overviewScreenId: id, boardScreenId: id, jobScreenId: id, clientsScreenId: id, clientScreenId: id,
    technicianScreenId: id, mastersScreenId: id, calendarNodeId: id,
    createJobFormId: id, assignFormId: id, noteFormId: id, completeFormId: id,
    job: z.strictObject({
      what: id, client: id, clientName: id, phone: id, address: id, status: id, priority: id,
      master: id, masterEmail: id, technician: id, date: id, when: id, minutes: id,
      price: id, paid: id, photo: id, comment: id, report: id, signature: id,
      /** Stage 2. Absent on installs created before checklists, time and recurrence. */
      site: id.optional(), type: id.optional(), checklist: id.optional(),
      onSiteAt: id.optional(), doneAt: id.optional(), actualMinutes: id.optional(),
      seriesId: id.optional(), repeat: id.optional(), repeatUntil: id.optional(), repeatCount: id.optional(),
      works: id.optional(), materials: id.optional(),
      /** Acceptance / signature details. Absent on older installs. */
      signerName: id.optional(), signerPosition: id.optional(), signedAt: id.optional(),
      noClaims: id.optional(), claims: id.optional(),
      signatureRefused: id.optional(), refusalReason: id.optional(),
    }),
    client: z.strictObject({ name: id, phone: id, address: id, note: id, contact: id.optional() }),
    master: z.strictObject({ name: id, email: id, phone: id, photo: id, active: id }),
    note: z.strictObject({ text: id, job: id, at: id, author: id, authorEmail: id, masterEmail: id }),
    statuses: z.strictObject({ fresh: id, assigned: id, enRoute: id, onSite: id, done: id, cancelled: id }),
    priorities: z.strictObject({ low: id, normal: id, high: id, urgent: id }),
    activeChoiceId: id, inactiveChoiceId: id,
    /** Job-type checklist templates. Absent before stage 2. */
    typesTableId: id.optional(),
    progressFormId: id.optional(),
    billingFormId: id.optional(),
    repeatFormId: id.optional(),
  }).optional(),
  /** Internal warehouse starter (stock from movements). Absent outside that install. */
  inventory: z.strictObject({
    itemsTableId: id, movementsTableId: id, warehousesTableId: id,
    itemsScreenId: id, itemScreenId: id, movementsScreenId: id,
    createItemScreenId: id.optional(),
    receiptFormId: id, issueFormId: id, writeOffFormId: id, transferFormId: id, itemEditFormId: id,
    createItemFormId: id.optional(),
    itemNameFieldId: id, itemSkuFieldId: id, itemBarcodeFieldId: id.optional(), itemCategoryFieldId: id,
    itemUnitFieldId: id, itemMinFieldId: id, itemCostFieldId: id, itemWarehouseFieldId: id,
    itemPhotoFieldId: id.optional(),
    itemStockFieldId: id, itemLowFieldId: id, itemMovementsFieldId: id, itemOpeningFieldId: id,
    movementNameFieldId: id, movementTypeFieldId: id, movementItemFieldId: id, movementQtyFieldId: id,
    movementWarehouseFieldId: id, movementWarehouseToFieldId: id, movementDateFieldId: id,
    movementNoteFieldId: id, movementAuthorFieldId: id,
    movementBeforeFieldId: id.optional(), movementAfterFieldId: id.optional(),
    warehouseNameFieldId: id,
    typeReceipt: id, typeIssue: id, typeWriteOff: id, typeTransfer: id,
    typeInventory: id.optional(),
    /** Stage 2 purchases. Absent on warehouses installed before supplier orders. */
    suppliersTableId: id.optional(),
    purchaseOrdersTableId: id.optional(),
    purchaseLinesTableId: id.optional(),
    purchasesScreenId: id.optional(),
    purchaseScreenId: id.optional(),
    createPurchaseScreenId: id.optional(),
    suppliersScreenId: id.optional(),
    supplierScreenId: id.optional(),
    createSupplierScreenId: id.optional(),
    createPurchaseFormId: id.optional(),
    editPurchaseFormId: id.optional(),
    createSupplierFormId: id.optional(),
    editSupplierFormId: id.optional(),
    supplierNameFieldId: id.optional(),
    supplierContactFieldId: id.optional(),
    supplierPhoneFieldId: id.optional(),
    supplierCommentFieldId: id.optional(),
    purchaseNameFieldId: id.optional(),
    purchaseNumberFieldId: id.optional(),
    purchaseSupplierFieldId: id.optional(),
    purchaseWarehouseFieldId: id.optional(),
    purchaseDateFieldId: id.optional(),
    purchaseStatusFieldId: id.optional(),
    purchaseTotalFieldId: id.optional(),
    purchaseCommentFieldId: id.optional(),
    purchaseLinesFieldId: id.optional(),
    purchaseCountFieldId: id.optional(),
    purchasePayloadFieldId: id.optional(),
    purchaseCreatedAtFieldId: id.optional(),
    purchaseCreatedByFieldId: id.optional(),
    purchaseOrderedAtFieldId: id.optional(),
    purchaseOrderedByFieldId: id.optional(),
    purchaseReceivedAtFieldId: id.optional(),
    purchaseReceivedByFieldId: id.optional(),
    purchaseCancelledAtFieldId: id.optional(),
    purchaseCancelledByFieldId: id.optional(),
    lineNameFieldId: id.optional(),
    lineOrderFieldId: id.optional(),
    lineProductFieldId: id.optional(),
    lineQtyFieldId: id.optional(),
    linePriceFieldId: id.optional(),
    lineTotalFieldId: id.optional(),
    statusDraft: id.optional(),
    statusOrdered: id.optional(),
    statusReceived: id.optional(),
    statusCancelled: id.optional(),
    /** Stage 3a inventory counts and reorder suggestions. */
    inventoryCountsTableId: id.optional(),
    inventoryCountLinesTableId: id.optional(),
    countsScreenId: id.optional(),
    countScreenId: id.optional(),
    createCountScreenId: id.optional(),
    reorderScreenId: id.optional(),
    createCountFormId: id.optional(),
    editCountFormId: id.optional(),
    reorderFormId: id.optional(),
    countNameFieldId: id.optional(),
    countNumberFieldId: id.optional(),
    countWarehouseFieldId: id.optional(),
    countDateFieldId: id.optional(),
    countStatusFieldId: id.optional(),
    countAuthorFieldId: id.optional(),
    countLinesFieldId: id.optional(),
    countProductCountFieldId: id.optional(),
    countDiscrepancyCountFieldId: id.optional(),
    countShortageFieldId: id.optional(),
    countSurplusFieldId: id.optional(),
    countPayloadFieldId: id.optional(),
    countCreatedAtFieldId: id.optional(),
    countCreatedByFieldId: id.optional(),
    countPostedAtFieldId: id.optional(),
    countPostedByFieldId: id.optional(),
    countCancelledAtFieldId: id.optional(),
    countCancelledByFieldId: id.optional(),
    countLineNameFieldId: id.optional(),
    countLineCountFieldId: id.optional(),
    countLineProductFieldId: id.optional(),
    countLineSystemFieldId: id.optional(),
    countLineActualFieldId: id.optional(),
    countLineDiffFieldId: id.optional(),
    countLineAmountFieldId: id.optional(),
    countStatusDraft: id.optional(),
    countStatusPosted: id.optional(),
    countStatusCancelled: id.optional(),
    reorderPayloadFieldId: id.optional(),
  }).optional(),
})
export type AppV2 = z.infer<typeof appV2Schema>
export type AppV2Workflow = AppV2['workflows'][number]
export type AppV2Grant = AppV2['policy']['tables'][number]['grants'][number]
export function appV2ChildIds(node: AppV2Node): readonly string[] { return 'childIds' in node ? node.childIds : node.type === 'collection' ? node.itemIds : [] }
