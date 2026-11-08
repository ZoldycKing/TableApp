'use server'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { authorizeApp } from '@/lib/authorize'
import { loadBuilderV2Catalog, loadBuilderV2Draft } from '@/lib/builder-v2'
import { readBuilderV2Record } from '@/lib/builder-v2-record'
import { readBuilderV2NodeData } from '@/lib/builder-v2-data'
import type { BuilderV2DataResult, BuilderV2RecordResult } from '@/lib/builder-v2-data-types'
import type { BuilderV2DataRequest } from '@/lib/builder-v2-data-types'
import {validBuilderCollectionQuery} from '@/lib/builder-v2-collection-query'
import { RowWriteError } from '@/lib/row-mutations'
import { learningAfterRecordRead } from '@/lib/builder-learning'

function request(value: unknown): BuilderV2DataRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => !['nodeId', 'search', 'cursor', 'screenId', 'recordId','calendarMonth','calendarDay','boardColumn'].includes(key)) || typeof input.nodeId !== 'string' || !input.nodeId || input.nodeId.length > 128 || input.search !== undefined && (typeof input.search !== 'string' || input.search.length > 200) || input.cursor !== undefined && (typeof input.cursor !== 'string' || input.cursor.length > 2000)) return null
  for (const key of ['screenId', 'recordId']) if (input[key] !== undefined && (typeof input[key] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(input[key] as string))) return null
  if(!validBuilderCollectionQuery(input))return null
  return input as BuilderV2DataRequest
}

/** This endpoint previews data as the verified workspace author, never as a role supplied by the browser. */
export async function readBuilderV2DataAction(appId: string, definition: unknown, input: unknown): Promise<BuilderV2DataResult> {
  const auth = await authorizeApp(appId, false)
  if (!auth.ok) return auth
  const query = request(input), read = readAppDefinition(definition)
  if (!query || !read.ok || read.formatVersion !== 2) return { ok: false, error: 'Проверьте настройки источника данных' }
  const stored = await loadBuilderV2Draft(appId, auth.member.workspaceId)
  if (!stored || read.app.id !== stored.app.id || read.app.workspaceId !== auth.member.workspaceId || read.app.slug !== stored.app.slug) return { ok: false, error: 'Приложение недоступно этому пространству' }
  const { catalog } = await loadBuilderV2Catalog(auth.member.workspaceId)
  const valid = validateAppV2Definition(read.app, catalog)
  if (!valid.ok) return { ok: false, error: valid.issues[0]!.message }
  try { return { ok: true, page: await readBuilderV2NodeData(valid.app, auth.member, query) } }
  catch (error) { return error instanceof RowWriteError ? { ok: false, error: error.code === 'conflict' ? 'Данные изменились. Обновите список и начните с первой страницы.' : error.message, stale: error.code === 'conflict' } : { ok: false, error: 'Не удалось загрузить данные. Проверьте таблицу и повторите загрузку.' } }
}

/** Exact selected row; no caller-supplied table or values can become a screen context. */
export async function readBuilderV2RecordAction(appId: string, definition: unknown, input: unknown): Promise<BuilderV2RecordResult> {
  const auth = await authorizeApp(appId, false)
  if (!auth.ok) return auth
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['screenId', 'recordId','calendarMonth','calendarDay','boardColumn'].includes(key))) return { ok: false, error: 'Выберите запись для карточки' }
  const value = input as Record<string, unknown>
  if (typeof value.screenId !== 'string' || typeof value.recordId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value.screenId) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value.recordId)) return { ok: false, error: 'Выберите запись для карточки' }
  const read = readAppDefinition(definition), stored = await loadBuilderV2Draft(appId, auth.member.workspaceId)
  if (!read.ok || read.formatVersion !== 2 || !stored || read.app.id !== stored.app.id || read.app.workspaceId !== auth.member.workspaceId || read.app.slug !== stored.app.slug) return { ok: false, error: 'Приложение недоступно этому пространству' }
  const { catalog } = await loadBuilderV2Catalog(auth.member.workspaceId), valid = validateAppV2Definition(read.app, catalog)
  if (!valid.ok) return { ok: false, error: valid.issues[0]!.message }
  try {
    const loaded = await readBuilderV2Record(valid.app, auth.member, value.screenId, value.recordId)
    try {
      const learning = await learningAfterRecordRead(appId, auth.member, { screenId: value.screenId, tableId: loaded.record.tableId })
      return { ok: true, ...loaded, ...(learning ? { learning } : {}) }
    } catch { return { ok: true, ...loaded, learningError: 'Карточка открыта, но прогресс обучения не сохранился. Откройте её ещё раз.' } }
  }
  catch (error) { return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось загрузить карточку. Проверьте соединение и повторите загрузку.' } }
}
