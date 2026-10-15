import { z } from 'zod'

export const customerWorkflowSchema = z.object({
  tableId: z.string(),
  listScreenId: z.string(), detailScreenId: z.string(), formScreenId: z.string(),
  emailFieldId: z.string(), statusFieldId: z.string(),
  createdFieldId: z.string().optional(), submissionFieldId: z.string().optional(),
  profile: z.object({ nameFieldId: z.string(), phoneFieldId: z.string() }).optional(),
  crm: z.object({ clientsTableId: z.string(), relationFieldId: z.string(), emailFieldId: z.string(), nameFieldId: z.string(), phoneFieldId: z.string(), listScreenId: z.string().optional(), detailScreenId: z.string().optional() }).optional(),
  /** Explicit installed IDs; integration never guesses columns or statuses by their labels. */
  logistics: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('sales'), addressFieldId: z.string(), shippedStatus: z.string(), deliveredStatus: z.string() }),
    z.object({ kind: z.literal('delivery'), addressFieldId: z.string(), contentsFieldId: z.string(), shippedStatus: z.string(), deliveredStatus: z.string(), returnedStatus: z.string(), missedStatus: z.string() }),
  ]).optional(),
  stock: z.object({ confirmedStatus: z.string(), returnedStatus: z.string().optional() }).optional(),
  initialStatus: z.string(), terminalStatuses: z.array(z.string()),
  cancelStatus: z.string(), cancellableStatuses: z.array(z.string()),
  assignmentFieldId: z.string().nullable(),
  catalog: z.object({
    tableId: z.string(), viewId: z.string(), detailScreenId: z.string(),
    titleFieldId: z.string(), activeFieldId: z.string(),
    selectionFieldId: z.string().nullable(),
  }).nullable(),
  cart: z.object({
    fieldId: z.string(), priceFieldId: z.string(),
    itemsTableId: z.string(), nameFieldId: z.string(), quantityFieldId: z.string(),
    itemPriceFieldId: z.string(), itemEmailFieldId: z.string(), itemAssignmentFieldId: z.string(), positionsFieldId: z.string(),
    productFieldId: z.string().optional(),
  }).nullable(),
  approval: z.object({
    priceFieldId: z.string(), approvedPriceFieldId: z.string(),
    waitingStatus: z.string(), approvedStatus: z.string(), declinedStatus: z.string(),
    consentRequiredStatuses: z.array(z.string()).optional(),
  }).nullable(),
  parent: z.object({ tableId: z.string(), relationFieldId: z.string(), emailFieldId: z.string() }).nullable().optional(),
  appointment: z.object({ fieldId: z.string(), minutes: z.number().int().min(1).max(1440), confirmedStatus: z.string() }).nullable().optional(),
})
export type CustomerWorkflow = z.infer<typeof customerWorkflowSchema>

export function customerWorkflows(app: { customer?: CustomerWorkflow | null; customerSections?: CustomerWorkflow[] }): CustomerWorkflow[] {
  return [...(app.customer ? [app.customer] : []), ...(app.customerSections ?? [])]
}

/** The sales workflow can be a secondary section of a composite application. */
export function customerCartWorkflow(app: Parameters<typeof customerWorkflows>[0]): CustomerWorkflow | undefined {
  return customerWorkflows(app).find(workflow => workflow.cart !== null)
}
