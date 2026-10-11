'use server'

import { appConfigVersions, apps, db } from '@tableapp/db'
import { and, desc, eq, lt } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { authorizeApp } from '@/lib/authorize'
import { configChanges, configStateFingerprint, checkpointBeforeChange, recordConfigVersion, restoredConfig } from '@/lib/app-config-history'
import { validateAppReferences } from '@/lib/app-references'
import { moduleOwnershipError } from '@/lib/module-lifecycle'
import { writeRows, type RowTransaction } from '@/lib/row-mutations'

export async function listAppVersionsAction(appId: string, before?: number) {
  const auth = await authorizeApp(appId, false)
  if (!auth.ok) return auth
  if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) return { ok: false as const, error: 'Некорректная страница истории.' }
  const records = await db.select({ id: appConfigVersions.id, number: appConfigVersions.number, kind: appConfigVersions.kind, createdAt: appConfigVersions.createdAt }).from(appConfigVersions)
    .where(and(eq(appConfigVersions.appId, appId), eq(appConfigVersions.workspaceId, auth.member.workspaceId), before === undefined ? undefined : lt(appConfigVersions.number, before))).orderBy(desc(appConfigVersions.number)).limit(21)
  return { ok: true as const, versions: records.slice(0, 20).map(record => ({ ...record, createdAt: record.createdAt.toISOString() })), hasMore: records.length > 20 }
}

async function prepareRestore(context: RowTransaction, appId: string, versionId: string) {
  const [record] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
  const [version] = await context.tx.select().from(appConfigVersions).where(and(eq(appConfigVersions.id, versionId), eq(appConfigVersions.appId, appId), eq(appConfigVersions.workspaceId, context.workspaceId))).limit(1)
  if (!record || !version) return { ok: false as const, error: 'Версия не найдена в этом приложении.' }
  const restored = restoredConfig(record, version.definition)
  if (!restored.ok) return restored
  const error = await validateAppReferences(restored.app, context.tx) ?? await moduleOwnershipError(restored.app, context.tx)
  if (error) return { ok: false as const, error: `Эту версию нельзя восстановить: ${error}` }
  return { ok: true as const, record, version, app: restored.app }
}

export async function previewAppRestoreAction(appId: string, versionId: string) {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  return writeRows(auth.member.workspaceId, async context => {
    const prepared = await prepareRestore(context, appId, versionId)
    if (!prepared.ok) return prepared
    const changes = configChanges(prepared.record.draft, prepared.app)
    return { ok: true as const, expectedHash: configStateFingerprint(prepared.record), version: prepared.version.number,
      name: prepared.app.name, screenCount: prepared.app.screens.length,
      changes,
      screens: prepared.app.screens.map(screen => screen.name),
      intake: (prepared.app.modules ?? []).filter(module => module.intakeEnabled === false).map(module => module.kind),
      unchanged: changes.length === 0 }
  })
}

export async function restoreAppVersionAction(appId: string, versionId: string, expectedHash: string) {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  const result = await writeRows(auth.member.workspaceId, async context => {
    const prepared = await prepareRestore(context, appId, versionId)
    if (!prepared.ok) return prepared
    if (configStateFingerprint(prepared.record) !== expectedHash) return { ok: false as const, error: 'Настройки или публикация изменились после проверки. Повторите просмотр версии.' }
    await checkpointBeforeChange(context.tx, prepared.record, auth.member.userId)
    const restored = prepared.app
    await context.tx.update(apps).set({ draft: restored, name: restored.name, theme: restored.theme, accessMode: restored.accessMode,
      allowlist: restored.allowlist, rowAccessRules: restored.rowAccessRules, homeScreenId: restored.homeScreenId, updatedAt: new Date() }).where(eq(apps.id, appId))
    await recordConfigVersion(context.tx, prepared.record, restored, 'restored', auth.member.userId)
    return { ok: true as const }
  })
  if (result.ok) { revalidatePath(`/apps/${appId}`); revalidatePath('/apps') }
  return result
}
