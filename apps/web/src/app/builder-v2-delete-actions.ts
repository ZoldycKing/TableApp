'use server'
import { appDefinitionInputError, appV2IdSchema } from '@tableapp/schema/app-v2'
import { authorizeApp } from '@/lib/authorize'
import { builderV2Enabled } from '@/lib/builder-v2'
import { inspectBuilderV2Delete, submitBuilderV2Delete } from '@/lib/builder-v2-delete'
import { RowWriteError } from '@/lib/row-mutations'
import { PlanLimitError } from '@/lib/limits'
import type { BuilderV2DeleteScope, BuilderV2DeleteRequest, BuilderV2DeleteInspection } from '@/lib/builder-v2-delete-types'
import type { BuilderV2SubmitResult } from '@/lib/builder-v2-submit-types'

function parse(value: unknown, submit: boolean): Record<string, unknown> | null {
  if (appDefinitionInputError(value) || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>, keys = ['screenId', 'nodeId', 'recordId', ...(submit ? ['revision', 'fingerprint', 'requestId', 'confirmed'] : [])]
  if (Object.keys(input).some(key => !keys.includes(key)) || ['screenId', 'nodeId', 'recordId'].some(key => !appV2IdSchema.safeParse(input[key]).success)) return null
  if (submit && (input.confirmed !== true || typeof input.requestId !== 'string' || !/^delete_[a-f0-9]{32}$/.test(input.requestId) || ['revision', 'fingerprint'].some(key => typeof input[key] !== 'string' || !/^[a-f0-9]{64}$/.test(input[key] as string)))) return null
  return input
}
export async function inspectBuilderV2DeleteAction(appId: string, input: unknown): Promise<BuilderV2DeleteInspection> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (!builderV2Enabled()) return { ok: false, error: 'Рабочие действия пока недоступны' }
  const request = parse(input, false)
  if (!request) return { ok: false, error: 'Откройте запись из списка' }
  try { return await inspectBuilderV2Delete(appId, auth.member, request as BuilderV2DeleteScope) }
  catch (error) { return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось загрузить запись. Попробуйте ещё раз.' } }
}
export async function submitBuilderV2DeleteAction(appId: string, input: unknown): Promise<BuilderV2SubmitResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (!builderV2Enabled()) return { ok: false, error: 'Рабочие действия пока недоступны' }
  const request = parse(input, true)
  if (!request) return { ok: false, error: 'Обновите запись и подтвердите удаление' }
  try { return await submitBuilderV2Delete(appId, auth.member, request as BuilderV2DeleteRequest) }
  catch (error) { return error instanceof RowWriteError || error instanceof PlanLimitError ? { ok: false, error: error.message } : { ok: false, uncertain: true, error: 'Не удалось подтвердить удаление. Повторите запрос.' } }
}
