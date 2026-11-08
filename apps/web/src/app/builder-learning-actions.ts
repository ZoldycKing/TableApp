'use server'
import { authorizeApp } from '@/lib/authorize'
import { builderV2Enabled, loadBuilderV2Draft } from '@/lib/builder-v2'
import { changeBuilderLearning, loadBuilderLearning, confirmBuilderLearningAccess } from '@/lib/builder-learning'
import type { BuilderLearningIntent, BuilderLearningResult } from '@/lib/builder-learning-types'

export async function builderLearningAction(appId: string, intent: BuilderLearningIntent): Promise<BuilderLearningResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (!builderV2Enabled()) return { ok: false, error: 'Обучение пока недоступно' }
  if (!['start', 'pause', 'resume', 'skip_list', 'skip_record', 'skip_save', 'skip_access', 'skip_publish', 'retry_list', 'retry_record','retry_save','retry_access','retry_publish'].includes(intent)) return { ok: false, error: 'Выберите действие обучения' }
  return changeBuilderLearning(appId, auth.member, intent)
}

export async function confirmBuilderLearningAccessAction(appId:string,revision:string):Promise<BuilderLearningResult>{
  const auth=await authorizeApp(appId);if(!auth.ok)return auth
  if(!builderV2Enabled()||typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision))return {ok:false,error:'Сохраните настройки перед проверкой доступа'}
  return confirmBuilderLearningAccess(appId,auth.member,revision)
}

export async function readBuilderLearningAction(appId: string): Promise<BuilderLearningResult> {
  const auth = await authorizeApp(appId, false)
  if (!auth.ok) return auth
  const draft = await loadBuilderV2Draft(appId, auth.member.workspaceId)
  return draft ? { ok: true, progress: await loadBuilderLearning(draft.app, auth.member) } : { ok: false, error: 'Приложение недоступно' }
}
