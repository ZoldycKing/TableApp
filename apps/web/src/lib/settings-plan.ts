import { FIELD_OPTIONS, normalizeFieldOptions, normalizeView, type FieldType } from '@tableapp/schema'
import { isDeepStrictEqual } from 'node:util'

type Plan = { ok: true; value: Record<string, unknown>; changed: boolean } | { ok: false }
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
export function fieldSettingsPlan(type: string, options: unknown): Plan {
  if (!Object.hasOwn(FIELD_OPTIONS, type)) return { ok: false }
  const original = object(options)
  if (!original) return { ok: false }
  const normalized = normalizeFieldOptions(type as FieldType, original)
  if (!FIELD_OPTIONS[type as FieldType].safeParse(normalized).success) return { ok: false }
  const value = { ...original, ...normalized }
  return { ok: true, value, changed: !isDeepStrictEqual(value, original) }
}
export function viewSettingsPlan(view: Parameters<typeof normalizeView>[0]): Plan {
  const original = object(view.config)
  if (!original) return { ok: false }
  try {
    const value = { ...original, ...normalizeView(view).config }
    return { ok: true, value, changed: !isDeepStrictEqual(value, original) }
  } catch { return { ok: false } }
}
