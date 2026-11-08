'use server'

import { appConfigVersions, apps, db, fields as fieldsTable, tables, views as viewsTable } from '@tableapp/db'
import type { App, Field, View } from '@tableapp/schema'
import { appSchema, byPosition, newId, normalizeFieldOptions, normalizeView, SLUG_PATTERN } from '@tableapp/schema'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { mayIncrease, noteRemoved } from '@/lib/limits'
import { authorizeApp, authorizeTableStructure, authorizeWorkspace } from '@/lib/authorize'
import { slugify } from '@/lib/app-builder'
import { lockAppSlugs, uniqueSlug } from '@/lib/app-slug'
import { validateAppReferences } from '@/lib/app-references'
import { checkModuleModelTransition } from '@/lib/app-modules'
import { writeRows } from '@/lib/row-mutations'
import { moduleOwnershipError } from '@/lib/module-lifecycle'
import { configFingerprint, recordConfigVersion } from '@/lib/app-config-history'
import type { ActionResult } from './actions'
import { tablesApp, sectionSources } from '@/lib/app-sections'

export async function createPersonalAppAction(input: { tableIds: string[]; name: string; requestId: string }): Promise<{ ok: true; appId: string } | { ok: false; error: string }> {
  return createTablesAppAction({ ...input, purpose: 'personal' })
}

export async function createTablesAppAction(input: { tableIds: string[]; name: string; requestId: string; purpose: 'personal' | 'business' }): Promise<{ ok: true; appId: string } | { ok: false; error: string }> {
  const auth = await authorizeWorkspace()
  if (!auth.ok) return auth
  if (!input || !Array.isArray(input.tableIds) || !input.tableIds.length || input.tableIds.length > 20 || input.tableIds.some(id => typeof id !== 'string')
    || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 200 || typeof input.requestId !== 'string' || !/^app_[a-z0-9]{12,32}$/.test(input.requestId)
    || !['personal', 'business'].includes(input.purpose)) return { ok: false, error: 'Укажите назначение, название и выберите от 1 до 20 таблиц.' }
  const ids = [...new Set(input.tableIds)], workspaceId = auth.member.workspaceId
  const result = await writeRows(workspaceId, async context => {
    const [existing] = await context.tx.select().from(apps).where(eq(apps.id, input.requestId))
    if (existing) {
      const parsed = appSchema.safeParse(existing.draft)
      return existing.workspaceId === workspaceId && parsed.success && parsed.data.purpose === input.purpose && parsed.data.allowlist.some(entry => entry.email === auth.member.email.trim().toLowerCase())
        ? { ok: true as const, appId: existing.id } : { ok: false as const, error: 'Не удалось подготовить приложение. Начните подготовку заново.' }
    }
    const sourceTables = await context.tx.select().from(tables).where(and(eq(tables.workspaceId, workspaceId), inArray(tables.id, ids))).for('share')
    if (sourceTables.length !== ids.length) return { ok: false as const, error: 'Одна из выбранных таблиц недоступна. Обновите страницу.' }
    const fieldRows = await context.tx.select().from(fieldsTable).where(inArray(fieldsTable.tableId, ids)).for('share')
    const viewRows = await context.tx.select().from(viewsTable).where(inArray(viewsTable.tableId, ids)).orderBy(asc(viewsTable.position))
    const sources = sectionSources(ids.map(id => {
      const table = sourceTables.find(table => table.id === id)!
      return { id: table.id, name: table.name, primaryFieldId: table.primaryFieldId,
        fields: fieldRows.filter(field => field.tableId === id).map(field => ({ ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) }) as unknown as Field).sort(byPosition) }
    }), viewRows.map(normalizeView))
    if (sources.length !== ids.length) return { ok: false as const, error: 'Для одной из таблиц не настроен вид. Откройте таблицу и повторите подготовку.' }
    await lockAppSlugs(context.tx)
    const slug = await uniqueSlug(slugify(input.name.trim()), undefined, context.tx)
    const draft = tablesApp({ id: input.requestId, workspaceId, name: input.name.trim(), slug, email: auth.member.email, sources }, input.purpose)
    const referenceError = await validateAppReferences(draft, context.tx)
    if (referenceError) return { ok: false as const, error: referenceError }
    await context.tx.insert(apps).values({ id: draft.id, workspaceId, name: draft.name, slug: draft.slug, theme: draft.theme,
      accessMode: draft.accessMode, allowlist: draft.allowlist, rowAccessRules: draft.rowAccessRules, homeScreenId: draft.homeScreenId, draft })
    return { ok: true as const, appId: draft.id }
  })
  if (result.ok) revalidatePath('/apps')
  return result
}

export async function createAppAction(
  tableId: string,
  name?: string,
  purpose: 'business' | 'personal' = 'business',
): Promise<{ ok: true; appId: string } | { ok: false; error: string }> {
  const auth = await authorizeTableStructure(tableId)
  if (!auth.ok) return auth

  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!table) return { ok: false, error: 'Таблица не найдена' }

  return createTablesAppAction({ tableIds: [tableId], name: name?.trim() || table.name, requestId: newId('app'), purpose })
}

export async function updateAppDraftAction(appId: string, draft: unknown): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth

  const parsed = appSchema.safeParse(draft)
  if (!parsed.success) {
    return { ok: false, error: 'Определение приложения не прошло проверку' }
  }

  const [stored] = await db.select({ draft: apps.draft, published: apps.published, slug: apps.slug }).from(apps)
    .where(and(eq(apps.id, appId), eq(apps.workspaceId, auth.member.workspaceId))).limit(1)
  if (!stored) return { ok: false, error: 'Приложение не найдено' }
  const storedVersion = (stored.draft as { formatVersion?: unknown } | null)?.formatVersion
  if (storedVersion !== undefined && storedVersion !== 1) return { ok: false, error: 'Это приложение нужно открыть в новом конструкторе' }
  const modelError = checkModuleModelTransition(parsed.data, stored.draft, stored.published)
  if (modelError) return { ok: false, error: modelError }

  if (parsed.data.slug !== stored.slug) return { ok: false, error: 'Адрес меняется отдельно на странице «Приложения».' }
  const slug = stored.slug
  const safeDraft = { ...parsed.data, id: appId, workspaceId: auth.member.workspaceId, slug }
  const referenceError = await validateAppReferences(safeDraft)
  if (referenceError) return { ok: false, error: referenceError }

  const saved = await db
    .update(apps)
    .set({
      name: parsed.data.name,
      slug,
      theme: parsed.data.theme,
      accessMode: parsed.data.accessMode,
      allowlist: parsed.data.allowlist,
      rowAccessRules: parsed.data.rowAccessRules,
      homeScreenId: parsed.data.homeScreenId,
      draft: safeDraft,
      updatedAt: new Date(),
    })
    .where(and(eq(apps.id, appId), eq(apps.workspaceId, auth.member.workspaceId), sql`${apps.draft} = ${JSON.stringify(stored.draft)}::jsonb`))
    .returning({ id: apps.id })
  if (!saved.length) return { ok: false, error: 'Настройки приложения изменились. Обновите страницу перед сохранением.' }

  revalidatePath('/apps')
  return { ok: true }
}

/**
 * Публикация делает снимок черновика.
 * Пользователи приложения видят опубликованную версию, а правки в конструкторе
 * до следующей публикации на них не влияют.
 */
export async function publishAppAction(appId: string, expectedDraft?: unknown): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth

  const result = await writeRows(auth.member.workspaceId, async context => {
    const [app] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
    if (!app) return { ok: false, error: 'Приложение не найдено' }

    const parsed = appSchema.safeParse(app.draft)
    if (!parsed.success) return { ok: false, error: 'Черновик содержит ошибки и не может быть опубликован' }
    if (expectedDraft !== undefined) {
      const expected = appSchema.safeParse(expectedDraft)
      if (!expected.success || configFingerprint({ ...expected.data, slug: app.slug }) !== configFingerprint({ ...parsed.data, slug: app.slug })) {
        return { ok: false, error: 'Черновик изменился перед публикацией. Проверьте последние изменения и повторите публикацию.' }
      }
    }
    const modelError = checkModuleModelTransition(parsed.data, app.published)
    if (modelError) return { ok: false, error: modelError }
    if (parsed.data.screens.length === 0) return { ok: false, error: 'В приложении нет ни одного экрана' }
    const safeApp = { ...parsed.data, id: app.id, workspaceId: app.workspaceId, slug: app.slug }
    const referenceError = await validateAppReferences(safeApp, context.tx) ?? await moduleOwnershipError(safeApp, context.tx)
    if (referenceError) return { ok: false, error: referenceError }
    if ((safeApp.customer || safeApp.booking) && !(await (await import('@/lib/business-profile')).loadBusinessProfile(app.workspaceId))) return { ok: false, error: 'Укажите название бизнеса на странице «Приложения», чтобы клиент понимал, чей кабинет открывает.' }

    // Updating an existing publication does not consume another application slot.
    if (!app.published) {
      const allowed = await mayIncrease({ workspaceId: auth.member.workspaceId, resource: 'publishedApps', tx: context.tx })
      if (!allowed.ok) return allowed
    }
    if (app.published) await recordConfigVersion(context.tx, app, app.published, 'baseline', auth.member.userId)
    await recordConfigVersion(context.tx, app, safeApp, 'published', auth.member.userId)
    await context.tx.update(apps)
      .set({ published: safeApp as unknown as Record<string, unknown>, publishedAt: new Date() })
      .where(eq(apps.id, appId))
    return { ok: true as const, slug: app.slug }
  })
  if (result.ok) { revalidatePath('/apps'); revalidatePath(`/apps/${appId}`); revalidatePath(`/a/${result.slug}`) }
  return result
}

/** Before the first publication only. A published address stays reserved after unpublishing too. */
export async function changeAppSlugAction(appId: string, slug: string, expectedSlug: string): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (!SLUG_PATTERN.test(slug)) return { ok: false, error: 'Используйте 2–64 латинские буквы в нижнем регистре, цифры и дефисы. Первый и последний символ — буква или цифра.' }
  try {
    const result = await writeRows(auth.member.workspaceId, async context => {
      await lockAppSlugs(context.tx)
      const [record] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
      if (!record) return { ok: false as const, error: 'Приложение не найдено' }
      if (record.slug !== expectedSlug) return { ok: false as const, error: 'Адрес уже изменён. Обновите страницу и проверьте его.' }
      const [publication] = await context.tx.select({ id: appConfigVersions.id }).from(appConfigVersions)
        .where(and(eq(appConfigVersions.appId, appId), eq(appConfigVersions.kind, 'published'))).limit(1)
      if (record.published || publication) return { ok: false as const, error: 'Адрес закреплён после первой публикации, чтобы ссылки клиентов продолжали работать.' }
      const [taken] = await context.tx.select({ id: apps.id }).from(apps).where(and(eq(apps.slug, slug), ne(apps.id, appId))).limit(1)
      if (taken) return { ok: false as const, error: 'Этот адрес уже занят. Выберите другой.' }
      const parsed = appSchema.safeParse(record.draft)
      if (!parsed.success) return { ok: false as const, error: 'Черновик содержит ошибки' }
      await context.tx.update(apps).set({ slug, draft: { ...parsed.data, slug }, updatedAt: new Date() }).where(eq(apps.id, appId))
      return { ok: true as const }
    })
    if (result.ok) { revalidatePath('/apps'); revalidatePath(`/apps/${appId}`) }
    return result
  } catch (error) {
    // A concurrent creator can win the unique slug constraint after our availability check.
    if ((error as { code?: string; cause?: { code?: string } }).code === '23505' || (error as { cause?: { code?: string } }).cause?.code === '23505') return { ok: false, error: 'Этот адрес уже занят. Выберите другой.' }
    throw error
  }
}

export async function unpublishAppAction(appId: string): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth

  await writeRows(auth.member.workspaceId, async context => {
    const [app] = await context.tx.select().from(apps)
      .where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
    if (app?.published) await recordConfigVersion(context.tx, app, app.published, 'published', auth.member.userId)
    await context.tx.update(apps).set({ published: null, publishedAt: null }).where(eq(apps.id, appId))
    if (app?.published) await noteRemoved(context.workspaceId, 'publishedApps', 1, context.tx)
  })

  revalidatePath('/apps')
  return { ok: true }
}

export async function deleteAppAction(appId: string): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth

  await writeRows(auth.member.workspaceId, async context => {
    const [app] = await context.tx.select({ published: apps.published }).from(apps)
      .where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
    await context.tx.delete(apps).where(eq(apps.id, appId))
    if (app?.published) await noteRemoved(context.workspaceId, 'publishedApps', 1, context.tx)
  })
  revalidatePath('/apps')
  return { ok: true }
}

export async function listAppsAction(): Promise<App[]> {
  const auth = await authorizeWorkspace(false)
  if (!auth.ok) return []

  const rows = await db
    .select()
    .from(apps)
    .where(eq(apps.workspaceId, auth.member.workspaceId))
    .orderBy(asc(apps.createdAt))
  return rows
    .map((row) => appSchema.safeParse(row.draft))
    .filter((parsed): parsed is { success: true; data: App } => parsed.success)
    .map((parsed) => parsed.data)
}
