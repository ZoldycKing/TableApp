import { z } from 'zod'

export const customerWorkflowSchema = z.object({
  tableId: z.string(),
  listScreenId: z.string(), detailScreenId: z.string(), formScreenId: z.string(),
  emailFieldId: z.string(), statusFieldId: z.string(),
  createdFieldId: z.string().optional(), submissionFieldId: z.string().optional(),
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
