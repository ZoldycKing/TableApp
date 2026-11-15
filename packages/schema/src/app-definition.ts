import { appSchema, type App } from './app'
import { appV2Schema, type AppV2 } from './app-v2/schema'
import { upgradeBookingTeamCalendar } from './app-v2/team-calendar-migrate'
import { appDefinitionInputError } from './app-v2/values'
import { validateAppV2, type AppV2Catalog, type AppV2Issue } from './app-v2/validate'

export type AppDefinitionRead =
  | { ok: true; formatVersion: 1; app: App }
  | { ok: true; formatVersion: 2; app: AppV2 }
  | { ok: false; code: 'invalid_definition' | 'unsupported_version'; error: string }

/** Format is distinct from publication revision. Never silently downgrade an unknown/new format. */
export function readAppDefinition(value: unknown): AppDefinitionRead {
  try { return readCheckedAppDefinition(value) } catch { return { ok: false, code: 'invalid_definition', error: 'Описание приложения повреждено' } }
}
function readCheckedAppDefinition(value: unknown): AppDefinitionRead {
  const inputError = appDefinitionInputError(value)
  if (inputError) return { ok: false, code: 'invalid_definition', error: inputError }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, code: 'invalid_definition', error: 'Описание приложения повреждено' }
  const version = Object.hasOwn(value, 'formatVersion') ? (value as { formatVersion: unknown }).formatVersion : 1
  if (version === 2) {
    const result = appV2Schema.safeParse(value)
    return result.success
      ? { ok: true, formatVersion: 2, app: upgradeBookingTeamCalendar(result.data) }
      : { ok: false, code: 'invalid_definition', error: 'Описание нового приложения содержит некорректные настройки' }
  }
  if (version !== 1) return { ok: false, code: 'unsupported_version', error: 'Эта версия формата приложения пока не поддерживается' }
  const result = appSchema.safeParse(value)
  return result.success ? { ok: true, formatVersion: 1, app: result.data } : { ok: false, code: 'invalid_definition', error: 'Описание приложения повреждено' }
}

export type AppV2Validation = { ok: true; app: AppV2 } | { ok: false; issues: AppV2Issue[] }
/** Authoritative catalog is mandatory before using v2 as an executable/publishable definition. */
export function validateAppV2Definition(value: unknown, catalog: AppV2Catalog, options: { mode?: 'draft' | 'publish' } = {}): AppV2Validation {
  const read = readAppDefinition(value)
  if (!read.ok) return { ok: false, issues: [{ code: read.code, path: '', message: read.error }] }
  if (read.formatVersion !== 2) return { ok: false, issues: [{ code: 'legacy_format', path: 'formatVersion', message: 'Это приложение использует прежний формат' }] }
  const issues = validateAppV2(read.app, catalog, options)
  return issues.length ? { ok: false, issues } : { ok: true, app: read.app }
}
