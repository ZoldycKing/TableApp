import { createHash } from 'node:crypto'

/** JSONB key order must not create false conflicts. Array order remains significant. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
export const builderV2Revision = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')
