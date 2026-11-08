'use server'
import { appDefinitionInputError, appV2IdSchema } from '@tableapp/schema/app-v2'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { authorizeApp } from '@/lib/authorize'
import { loadBuilderV2Catalog, loadBuilderV2Draft } from '@/lib/builder-v2'
import { inspectBuilderV2Form } from '@/lib/builder-v2-form'
import type { BuilderV2FormRequest, BuilderV2FormOptionsResult, BuilderV2FormResult } from '@/lib/builder-v2-form-types'
import { RowWriteError } from '@/lib/row-mutations'
import { builderV2Enabled } from '@/lib/builder-v2'
import { inspectWorkingBuilderV2Form, submitBuilderV2Form } from '@/lib/builder-v2-submit'
import type { BuilderV2SubmitRequest, BuilderV2SubmitResult } from '@/lib/builder-v2-submit-types'
import { PlanLimitError } from '@/lib/limits'

function parseRequest(value: unknown): BuilderV2FormRequest | null {
  if (appDefinitionInputError(value) || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>, keys = ['mode', 'formId', 'screenId', 'recordId', ...(input.mode === 'check' ? ['values', 'fingerprint'] : input.mode === 'options' ? ['fieldId', 'search', 'after'] : [])]
  if (!['initial', 'check', 'options'].includes(String(input.mode)) || Object.keys(input).some(key => !keys.includes(key)) || !appV2IdSchema.safeParse(input.formId).success || !appV2IdSchema.safeParse(input.screenId).success || input.recordId !== undefined && !appV2IdSchema.safeParse(input.recordId).success) return null
  if (input.mode === 'options' && (!appV2IdSchema.safeParse(input.fieldId).success || typeof input.search !== 'string' || input.search.length > 200 || input.after !== undefined && !appV2IdSchema.safeParse(input.after).success)) return null
  if (input.mode === 'check' && (typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint) || !input.values || typeof input.values !== 'object' || Array.isArray(input.values) || Object.keys(input.values).length > 500 || Object.keys(input.values).some(key => !appV2IdSchema.safeParse(key).success))) return null
  return input as BuilderV2FormRequest
}
export async function inspectBuilderV2FormAction(appId: string, definition: unknown, input: unknown): Promise<BuilderV2FormResult | BuilderV2FormOptionsResult> {
  const auth = await authorizeApp(appId, false)
  if (!auth.ok) return auth
  if (appDefinitionInputError(input)) return { ok: false, error: 'Проверьте значения формы' }
  const request = parseRequest(input), read = readAppDefinition(definition)
  if (!request || !read.ok || read.formatVersion !== 2) return { ok: false, error: 'Проверьте настройки формы' }
  const stored = await loadBuilderV2Draft(appId, auth.member.workspaceId)
  if (!stored || read.app.id !== stored.app.id || read.app.workspaceId !== auth.member.workspaceId || read.app.slug !== stored.app.slug) return { ok: false, error: 'Приложение недоступно этому пространству' }
  const { catalog } = await loadBuilderV2Catalog(auth.member.workspaceId), valid = validateAppV2Definition(read.app, catalog)
  if (!valid.ok) return { ok: false, error: valid.issues[0]!.message }
  try { return await inspectBuilderV2Form(valid.app, auth.member, request) }
  catch (error) { return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось проверить форму. Повторите попытку.' } }
}

export async function inspectWorkingBuilderV2FormAction(appId: string, input: unknown) {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (!builderV2Enabled()) return { ok: false as const, error: 'Рабочая форма пока недоступна' }
  const request = parseRequest(input)
  if (!request) return { ok: false as const, error: 'Проверьте настройки формы' }
  try { return await inspectWorkingBuilderV2Form(appId, auth.member, request) }
  catch (error) { return { ok: false as const, error: error instanceof RowWriteError ? error.message : 'Не удалось загрузить рабочую форму. Попробуйте ещё раз.' } }
}

export async function submitBuilderV2FormAction(appId: string, input: unknown): Promise<BuilderV2SubmitResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (!builderV2Enabled()) return { ok: false, error: 'Сохранение формы пока недоступно' }
  if (appDefinitionInputError(input) || !input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Проверьте значения формы' }
  const value = input as Record<string, unknown>, { requestId, revision, confirmation, ...rest } = value
  if (typeof requestId !== 'string' || !/^submit_[a-f0-9]{32}$/.test(requestId) || typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) return { ok: false, error: 'Обновите форму перед сохранением' }
  if(confirmation!==undefined&&(typeof confirmation!=='string'||!/^[a-f0-9]{64}$/.test(confirmation)))return {ok:false,error:'Подтвердите удаление записей'}
  const request = parseRequest({ ...rest, mode: 'check' })
  if (!request || request.mode !== 'check') return { ok: false, error: 'Проверьте значения формы' }
  try { return await submitBuilderV2Form(appId, auth.member, { ...request, requestId, revision,...(typeof confirmation==='string'?{confirmation}:{}) } satisfies BuilderV2SubmitRequest) }
  catch (error) { return error instanceof RowWriteError || error instanceof PlanLimitError ? { ok: false, error: error.message } : { ok: false, uncertain: true, error: 'Не удалось подтвердить сохранение. Повторите отправку.' } }
}
