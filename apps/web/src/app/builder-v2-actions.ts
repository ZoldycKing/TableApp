'use server'
import { appConfigVersions, apps, db } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { authorizeApp, authorizeWorkspace } from '@/lib/authorize'
import { builderV2Enabled, builderV2Revision, loadBuilderV2Catalog, loadBuilderV2Draft, newBuilderV2App, type BuilderV2Table } from '@/lib/builder-v2'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { lockAppSlugs, uniqueSlug } from '@/lib/app-slug'
import { writeRows } from '@/lib/row-mutations'
import { prepareImportedBuilderApp } from '@/lib/builder-v2-import'
import { learningAfterDraftSave, loadBuilderLearning } from '@/lib/builder-learning'
import type { BuilderLearningProgress } from '@/lib/builder-learning-types'
import { validateBuilderV2Logo } from '@/lib/builder-v2-logo'

export async function prepareImportedBuilderAppAction(runId: string, primaryTableId?: string): Promise<{ ok: true; appId: string } | { ok: false; error: string }> {
  const auth = await authorizeWorkspace()
  if (!auth.ok) return auth
  if (!builderV2Enabled()) return { ok: false, error: 'Создание в новом конструкторе пока недоступно' }
  const result = await prepareImportedBuilderApp(runId, primaryTableId, auth.member)
  if (result.ok) revalidatePath('/apps')
  return result
}

export async function createBuilderV2AppAction(input: { requestId: string; name: string }): Promise<{ ok: true; appId: string } | { ok: false; error: string }> {
  const auth = await authorizeWorkspace()
  if (!auth.ok) return auth
  if (!builderV2Enabled()) return { ok: false, error: 'Создание в новом конструкторе пока недоступно' }
  if (!input || typeof input.requestId !== 'string' || !/^app_[a-z0-9]{12,32}$/.test(input.requestId) || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 200) return { ok: false, error: 'Введите название приложения' }
  const result = await writeRows(auth.member.workspaceId, async ({ tx }) => {
    await lockAppSlugs(tx)
    const [existing] = await tx.select().from(apps).where(eq(apps.id, input.requestId))
    if (existing) {
      const read = readAppDefinition(existing.draft)
      return existing.workspaceId === auth.member.workspaceId && read.ok && read.formatVersion === 2 ? { ok: true as const, appId: existing.id } : { ok: false as const, error: 'Не удалось создать приложение. Начните заново.' }
    }
    const slug = await uniqueSlug(input.requestId.replace('_', '-'), undefined, tx)
    const app = newBuilderV2App({ id: input.requestId, workspaceId: auth.member.workspaceId, name: input.name.trim(), slug, email: auth.member.email })
    const { catalog } = await loadBuilderV2Catalog(auth.member.workspaceId, tx)
    const valid = validateAppV2Definition(app, catalog)
    if (!valid.ok) return { ok: false as const, error: valid.issues[0]!.message }
    await tx.insert(apps).values({ id: app.id, workspaceId: app.workspaceId, name: app.name, slug, theme: app.theme, accessMode: 'allowlist', draft: app, published: null })
    return { ok: true as const, appId: app.id }
  })
  if (result.ok) revalidatePath('/apps')
  return result
}

export async function saveBuilderV2DraftAction(appId: string, input: unknown, expectedRevision: string): Promise<{ ok: true; revision: string; learning?: BuilderLearningProgress } | { ok: false; error: string; conflict?: boolean }> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (!builderV2Enabled()) return { ok: false, error: 'Редактор временно доступен только для просмотра' }
  if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) return { ok: false, error: 'Обновите страницу перед сохранением' }
  const read = readAppDefinition(input)
  if (!read.ok || read.formatVersion !== 2) return { ok: false, error: 'Проверьте обязательные названия и настройки элементов' }
  const result = await db.transaction(async tx => {
    const [record] = await tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, auth.member.workspaceId))).for('update')
    if (!record) return { ok: false as const, error: 'Приложение не найдено' }
    const stored = readAppDefinition(record.draft)
    if (!stored.ok || stored.formatVersion !== 2) return { ok: false as const, error: 'Это приложение использует прежний редактор' }
    const app = read.app
    if (app.id !== record.id || app.workspaceId !== record.workspaceId || app.slug !== record.slug) return { ok: false as const, error: 'Адрес и принадлежность приложения нельзя изменить этим действием' }
    const current = builderV2Revision(record.draft), next = builderV2Revision(app)
    if (current === next) { const learning = await loadBuilderLearning(stored.app, auth.member, tx); return { ok: true as const, revision: current, ...(learning ? { learning } : {}) } }
    if (current !== expectedRevision) return { ok: false as const, conflict: true, error: 'Приложение изменено в другой вкладке. Ваши правки остаются здесь.' }
    const { catalog } = await loadBuilderV2Catalog(auth.member.workspaceId, tx)
    const valid = validateAppV2Definition(app, catalog)
    if (!valid.ok) return { ok: false as const, error: valid.issues[0]!.message }
    if (app.theme.logoKey !== stored.app.theme.logoKey) {
      const error = await validateBuilderV2Logo(tx, app)
      if (error) return { ok: false as const, error }
    }
    const [last] = await tx.select().from(appConfigVersions).where(and(eq(appConfigVersions.appId, appId), eq(appConfigVersions.workspaceId, record.workspaceId))).orderBy(desc(appConfigVersions.number)).limit(1)
    if (!last || Date.now() - last.createdAt.getTime() >= 300_000) await tx.insert(appConfigVersions).values({ id: newId('appConfigVersion'), appId, workspaceId: record.workspaceId, number: (last?.number ?? 0) + 1, kind: last ? 'before-change' : 'baseline', definition: record.draft, fingerprint: current, authorId: auth.member.userId })
    await tx.update(apps).set({ draft: app, name: app.name, theme: app.theme, homeScreenId: app.homeScreenId, updatedAt: new Date() }).where(and(eq(apps.id, appId), eq(apps.workspaceId, record.workspaceId)))
    const learning = await learningAfterDraftSave(tx, stored.app, app, auth.member)
    return { ok: true as const, revision: next, ...(learning ? { learning } : {}) }
  })
  if (result.ok) revalidatePath('/apps')
  return result
}

export async function reloadBuilderV2DraftAction(appId: string, knownRevision?: string): Promise<
  | { ok: true; revision: string; publishedRevision: string | null; unchanged: true }
  | { ok: true; revision: string; publishedRevision: string | null; app: AppV2; tables: BuilderV2Table[]; unchanged?: false }
  | { ok: false; error: string }
> {
  const auth = await authorizeApp(appId, false)
  if (!auth.ok) return auth
  const draft = await loadBuilderV2Draft(appId, auth.member.workspaceId)
  if (!draft) return { ok: false, error: 'Черновик недоступен' }
  const publishedRevision = draft.record.published ? builderV2Revision(draft.record.published) : null
  if (draft.revision === knownRevision) return { ok: true, revision: draft.revision, publishedRevision, unchanged: true }
  const { tables } = await loadBuilderV2Catalog(auth.member.workspaceId)
  return { ok: true, app: draft.app, tables, revision: draft.revision, publishedRevision }
}
