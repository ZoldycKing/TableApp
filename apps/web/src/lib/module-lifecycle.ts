import { apps } from '@tableapp/db'
import { appSchema } from '@tableapp/schema'
import { and, eq } from 'drizzle-orm'
import type { RowTransaction } from './row-mutations'
import { acceptsModuleIntake } from './module-access'
import { legacyAppModules, moduleContract } from './app-modules'
import type { App } from '@tableapp/schema'
import type { Transaction } from './db-transaction'

/** A request may wait for the workspace lock after access was checked. Reject a stale published policy. */
export async function currentModularAppError(context: RowTransaction, app: App): Promise<string | null> {
  if (!app.modules && !app.moduleAccess) return null
  const [record] = await context.tx.select({ published: apps.published }).from(apps)
    .where(and(eq(apps.id, app.id), eq(apps.workspaceId, context.workspaceId)))
  const parsed = appSchema.safeParse(record?.published)
  const current = parsed.success ? appSchema.parse({ ...parsed.data, id: app.id, workspaceId: context.workspaceId }) : null
  return !current || JSON.stringify(current) !== JSON.stringify(appSchema.parse(app))
    ? 'Настройки или права приложения изменились. Обновите страницу и повторите действие.' : null
}

/** Read published state under the same workspace lock as row writes and module changes. */
export async function moduleIntakeError(context: RowTransaction, tableId: string): Promise<string | null> {
  if (!context.moduleStateCache) {
    const stored = await context.tx.select({ published: apps.published }).from(apps).where(eq(apps.workspaceId, context.workspaceId))
    context.moduleStateCache = stored.flatMap(record => {
      const parsed = appSchema.safeParse(record.published)
      return parsed.success ? [parsed.data] : []
    })
  }
  return context.moduleStateCache.some(app => !acceptsModuleIntake(app, tableId)) ? 'Новые оформления в этом разделе временно приостановлены. Существующие обращения сохранены.' : null
}

/** Only one published modular application may own a workflow's writes. Legacy readers remain untouched. */
export async function moduleOwnershipError(app: App, tx: Transaction): Promise<string | null> {
  const own = new Set((app.modules ?? legacyAppModules(app)).flatMap(module => moduleContract(app, module)?.writeTables ?? []))
  const stored = await tx.select({ id: apps.id, published: apps.published }).from(apps).where(eq(apps.workspaceId, app.workspaceId))
  for (const other of stored) {
    if (other.id === app.id) continue
    const parsed = appSchema.safeParse(other.published)
    if (!parsed.success || !app.moduleAccess && !parsed.data.moduleAccess) continue
    if ((parsed.data.modules ?? legacyAppModules(parsed.data)).some(module => moduleContract(parsed.data, module)?.writeTables.some(id => own.has(id)))) return 'Этими записями уже управляет опубликованное приложение бизнеса. Перенос действующего сценария требуется выполнить отдельно.'
  }
  return null
}
