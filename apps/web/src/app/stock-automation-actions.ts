'use server'

import { revalidatePath } from 'next/cache'
import { authorizeApp } from '@/lib/authorize'
import { isPlanLimitError } from '@/lib/limits'
import { RowWriteError } from '@/lib/row-mutations'
import { queueStockCheck, saveStockAutomation, setStockAutomationActive } from '@/lib/stock-automation'

type Result = { ok: true } | { ok: false; error: string }
type Scope = { workspaceId: string; appId: string }

async function change(appId: string, execute: (scope: Scope) => Promise<unknown>): Promise<Result> {
  if (typeof appId !== 'string' || !appId || appId.length > 128) return { ok: false, error: 'Приложение не найдено.' }
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (auth.member.role !== 'owner') return { ok: false, error: 'Автоматизацию настраивает владелец пространства.' }
  try {
    await execute({ workspaceId: auth.member.workspaceId, appId })
    revalidatePath(`/apps/${encodeURIComponent(appId)}/automations`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof RowWriteError || isPlanLimitError(error) ? error.message : 'Не удалось сохранить действие. Попробуйте ещё раз.' }
  }
}

export async function saveStockScheduleAction(appId: string, form: FormData): Promise<Result> {
  if (!(form instanceof FormData)) return { ok: false, error: 'Заполните настройки проверки.' }
  const minimumFieldId = form.get('minimum'), localTime = form.get('time'), timeZone = form.get('zone')
  if (typeof minimumFieldId !== 'string' || minimumFieldId.length > 128 || typeof localTime !== 'string' || typeof timeZone !== 'string') {
    return { ok: false, error: 'Выберите поле, время и часовой пояс.' }
  }
  return change(appId, scope => saveStockAutomation(scope, { minimumFieldId, localTime, timeZone }))
}

export async function setStockScheduleActiveAction(appId: string, active: boolean): Promise<Result> {
  if (typeof active !== 'boolean') return { ok: false, error: 'Проверьте настройки расписания.' }
  return change(appId, scope => setStockAutomationActive(scope, active))
}

export async function queueStockCheckAction(appId: string, runId?: string): Promise<Result> {
  if (runId !== undefined && (typeof runId !== 'string' || !runId || runId.length > 128)) return { ok: false, error: 'Запуск не найден.' }
  return change(appId, scope => queueStockCheck(scope, runId))
}
