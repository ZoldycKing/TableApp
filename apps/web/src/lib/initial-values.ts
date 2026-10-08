import type { Field } from '@tableapp/schema'

/** Fill only an empty price, never overwrite an agreed amount (including zero). */
export async function withInitialValues(fields: readonly Field[], data: Record<string, unknown>,
  read: (tableId: string, rowId: string, fieldId: string) => Promise<unknown>): Promise<Record<string, unknown>> {
  const result = { ...data }
  for (const field of fields) {
    if (field.type !== 'number' || !field.options.initialFrom) continue
    if (result[field.id] !== undefined && result[field.id] !== null && result[field.id] !== '') continue
    const { relationFieldId, targetFieldId } = field.options.initialFrom
    const relation = fields.find(candidate => candidate.id === relationFieldId)
    const ids = result[relationFieldId]
    if (relation?.type !== 'relation' || relation.options.allowMultiple || !Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== 'string') continue
    const value = await read(relation.options.tableId, ids[0], targetFieldId)
    if (typeof value === 'number' && Number.isFinite(value)) result[field.id] = value
  }
  return result
}
