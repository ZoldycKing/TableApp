import type { Field } from '@tableapp/schema'
import { dateInstant, fieldTimeZone, instantToWallClock } from '@tableapp/schema'

/** Fill only an empty price, never overwrite an agreed amount (including zero). */
export async function withInitialValues(fields: readonly Field[], data: Record<string, unknown>,
  read: (tableId: string, rowId: string, fieldId: string) => Promise<unknown>,
  options: { creating?: boolean; now?: Date } = {}): Promise<Record<string, unknown>> {
  const result = { ...data }
  for (const field of fields) {
    if (options.creating && (result[field.id] === undefined || result[field.id] === null || result[field.id] === '')) {
      if (field.type === 'single_select' && field.options.choices.some(choice => choice.id === field.options.defaultChoiceId)) {
        result[field.id] = field.options.defaultChoiceId
      }
      if (field.type === 'date' && field.options.defaultToday) {
        const zone = fieldTimeZone(field), day = instantToWallClock(options.now ?? new Date(), zone)?.date
        const instant = day ? dateInstant(day, zone) : null
        if (instant !== null) result[field.id] = new Date(instant).toISOString()
      }
    }
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
