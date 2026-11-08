import { productionConfigSchema, type Field } from '@tableapp/schema'

export type RecordSummary = { fieldIds: string[]; unitFieldId?: string }

/** Use stable field IDs from the installed production app, including renamed columns. */
export function materialRecordSummary(tableId: string, fields: readonly Field[], definitions: unknown[]): RecordSummary | undefined {
  const ids = new Set(fields.map(field => field.id))
  for (const definition of definitions) {
    const parsed = productionConfigSchema.safeParse(definition)
    if (!parsed.success || parsed.data.tables.materials !== tableId) continue
    const material = parsed.data.material
    const stock = material.stock ?? fields.find(field => field.name === 'Текущий остаток')?.id
    const min = material.min ?? fields.find(field => field.name === 'Минимальный остаток')?.id
    const unit = material.unit
    const fieldIds = [stock, min].filter((id): id is string => Boolean(id && ids.has(id)))
    if (fieldIds.length) return { fieldIds, ...(ids.has(unit) ? { unitFieldId: unit } : {}) }
  }
  // Tables can outlive their application. Recognize the unchanged template headings then.
  const stock = fields.find(field => field.name === 'Текущий остаток')
  const min = fields.find(field => field.name === 'Минимальный остаток')
  const unit = fields.find(field => field.name === 'Единица измерения')
  return stock && min ? { fieldIds: [stock.id, min.id], ...(unit ? { unitFieldId: unit.id } : {}) } : undefined
}
