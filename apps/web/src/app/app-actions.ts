'use server'

import { apps, db, fields as fieldsTable, tables, views as viewsTable } from '@tableapp/db'
import type { App, Field, View } from '@tableapp/schema'
import { appSchema, byPosition, newId, normalizeFieldOptions, normalizeView } from '@tableapp/schema'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { mayIncrease, noteRemoved } from '@/lib/limits'
import { authorizeApp, authorizeTable, authorizeWorkspace } from '@/lib/authorize'
import { generateApp, slugify } from '@/lib/app-builder'
import { uniqueSlug } from '@/lib/app-slug'
import { validateAppReferences } from '@/lib/app-references'
import { checkModuleModelTransition } from '@/lib/app-modules'
import { writeRows } from '@/lib/row-mutations'
import { moduleOwnershipError } from '@/lib/module-lifecycle'
import { recordConfigVersion } from '@/lib/app-config-history'
import type { ActionResult } from './actions'

export async function createAppAction(
  tableId: string,
  name?: string,
): Promise<{ ok: true; appId: string } | { ok: false; error: string }> {
  const auth = await authorizeTable(tableId)
  if (!auth.ok) return auth

  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!table) return { ok: false, error: 'Таблица не найдена' }

  const [fieldRows, viewRows] = await Promise.all([
    db.select().from(fieldsTable).where(eq(fieldsTable.tableId, tableId)),
    db.select().from(viewsTable).where(eq(viewsTable.tableId, tableId)).orderBy(asc(viewsTable.position)),
  ])

  const view = viewRows.find((candidate) => candidate.type === 'grid') ?? viewRows[0]
  if (!view) return { ok: false, error: 'У таблицы нет ни одного представления' }

  const fields = fieldRows
    .map((field) => ({ ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) }) as unknown as Field)
    .sort(byPosition)

  const appName = name?.trim() || table.name
  const appId = newId('app')
  const draft = generateApp({
    appId,
    workspaceId: table.workspaceId,
    name: appName,
    slug: await uniqueSlug(slugify(appName)),
    table: { id: table.id, name: table.name, primaryFieldId: table.primaryFieldId },
    fields,
    view: normalizeView(view),
  })

  await db.insert(apps).values({
    id: appId,
    workspaceId: table.workspaceId,
    name: draft.name,
    slug: draft.slug,
    theme: draft.theme,
    accessMode: draft.accessMode,
    allowlist: draft.allowlist,
    rowAccessRules: draft.rowAccessRules,
    homeScreenId: draft.homeScreenId,
    draft,
  })

  revalidatePath('/apps')
  return { ok: true, appId }
}

export async function updateAppDraftAction(appId: string, draft: unknown): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth

  const parsed = appSchema.safeParse(draft)
  if (!parsed.success) {
    return { ok: false, error: 'Определение приложения не прошло проверку' }
  }

  const [stored] = await db.select({ draft: apps.draft, published: apps.published }).from(apps)
    .where(and(eq(apps.id, appId), eq(apps.workspaceId, auth.member.workspaceId))).limit(1)
  if (!stored) return { ok: false, error: 'Приложение не найдено' }
  const modelError = checkModuleModelTransition(parsed.data, stored.draft, stored.published)
  if (modelError) return { ok: false, error: modelError }

  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name), appId)
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
export async function publishAppAction(appId: string): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth

  const result = await writeRows(auth.member.workspaceId, async context => {
    const [app] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
    if (!app) return { ok: false, error: 'Приложение не найдено' }

    const parsed = appSchema.safeParse(app.draft)
    if (!parsed.success) return { ok: false, error: 'Черновик содержит ошибки и не может быть опубликован' }
    const modelError = checkModuleModelTransition(parsed.data, app.published)
    if (modelError) return { ok: false, error: modelError }
    if (parsed.data.screens.length === 0) return { ok: false, error: 'В приложении нет ни одного экрана' }
    const safeApp = { ...parsed.data, id: app.id, workspaceId: app.workspaceId }
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

export async function unpublishAppAction(appId: string): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth

  await writeRows(auth.member.workspaceId, async context => {
    const [app] = await context.tx.select({ published: apps.published }).from(apps)
      .where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
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
