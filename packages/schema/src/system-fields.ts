import type { Field } from './fields'

export type RowMetadata = {
  id: string
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  createdBy?: string | null
  updatedBy?: string | null
}
function iso(value: RowMetadata['createdAt']): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/** Authoritative metadata overrides any legacy or client supplied system value. */
export function systemRowData(row: RowMetadata & { data: Record<string, unknown> }, fields: readonly Field[]): Record<string, unknown> {
  const data = { ...row.data }
  for (const field of fields) {
    switch (field.type) {
      case 'row_id': data[field.id] = row.id; break
      case 'created_time': data[field.id] = iso(row.createdAt); break
      case 'updated_time': data[field.id] = iso(row.updatedAt); break
      case 'created_by': data[field.id] = row.createdBy ?? null; break
      case 'updated_by': data[field.id] = row.updatedBy ?? null; break
    }
  }
  return data
}
