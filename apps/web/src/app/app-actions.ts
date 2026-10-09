'use server'

import { apps, db, fields as fieldsTable, tables, views as viewsTable } from '@tableapp/db'
import type { App, Field, View } from '@tableapp/schema'
import { appSchema, byPosition, newId, normalizeFieldOptions, normalizeView } from '@tableapp/schema'
import { and, asc, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { mayIncrease, noteRemoved } from '@/lib/limits'
import { authorizeApp, authorizeTable, authorizeWorkspace } from '@/lib/authorize'
import { generateApp, slugify } from '@/lib/app-builder'
import { uniqueSlug } from '@/lib/app-slug'
import { validateAppReferences } from '@/lib/app-references'
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

  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name), appId)
  const safeDraft = { ...parsed.data, id: appId, workspaceId: auth.member.workspaceId, slug }
  const referenceError = await validateAppReferences(safeDraft)
  if (referenceError) return { ok: false, error: referenceError }

  await db
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
    .where(eq(apps.id, appId))

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

  const [app] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1)
  if (!app) return { ok: false, error: 'Приложение не найдено' }

  const parsed = appSchema.safeParse(app.draft)
  if (!parsed.success) return { ok: false, error: 'Черновик содержит ошибки и не может быть опубликован' }
  if (parsed.data.screens.length === 0) return { ok: false, error: 'В приложении нет ни одного экрана' }
  const safeApp = { ...parsed.data, id: app.id, workspaceId: app.workspaceId }
  const referenceError = await validateAppReferences(safeApp)
  if (referenceError) return { ok: false, error: referenceError }
  if ((safeApp.customer || safeApp.booking) && !(await (await import('@/lib/business-profile')).loadBusinessProfile(app.workspaceId))) return { ok: false, error: 'Укажите название бизнеса на странице «Приложения», чтобы клиент понимал, чей кабинет открывает.' }

  /*
   * Потолок считаем только для того, что ещё не опубликовано. Повторная
   * публикация уже живого приложения — это правка, а не новое приложение:
   * запретить её значит запереть человека с ошибкой в опубликованной версии,
   * которую он не может исправить.
   */
  if (!app.published) {
    const allowed = await mayIncrease({
      workspaceId: auth.member.workspaceId,
      resource: 'publishedApps',
    })
    if (!allowed.ok) return allowed
  }

  await db
    .update(apps)
    .set({ published: safeApp as unknown as Record<string, unknown>, publishedAt: new Date() })
    .where(eq(apps.id, appId))

  revalidatePath('/apps')
  revalidatePath(`/a/${app.slug}`)
  return { ok: true }
}

export async function unpublishAppAction(appId: string): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth

  const [app] = await db.select({ published: apps.published }).from(apps).where(eq(apps.id, appId)).limit(1)

  await db.update(apps).set({ published: null, publishedAt: null }).where(eq(apps.id, appId))
  // Снятое с публикации место больше не занимает — иначе владелец снял бы
  // приложение и всё равно не смог опубликовать другое.
  if (app?.published) await noteRemoved(auth.member.workspaceId, 'publishedApps')

  revalidatePath('/apps')
  return { ok: true }
}

export async function deleteAppAction(appId: string): Promise<ActionResult> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth

  const [app] = await db.select({ published: apps.published }).from(apps).where(eq(apps.id, appId)).limit(1)

  await db.delete(apps).where(eq(apps.id, appId))
  if (app?.published) await noteRemoved(auth.member.workspaceId, 'publishedApps')
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
