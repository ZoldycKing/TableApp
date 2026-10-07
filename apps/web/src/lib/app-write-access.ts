import { apps, db, views as viewsTable } from '@tableapp/db'
import { appSchema, type App } from '@tableapp/schema'
import { eq, inArray } from 'drizzle-orm'

/** Опубликованная версия приложения: черновик правами не распоряжается. */
export async function loadApp(slug: string): Promise<App | null> {
  const [record] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!record?.published) return null
  const parsed = appSchema.safeParse(record.published)
  return parsed.success ? parsed.data : null
}

/**
 * Приложение имеет право писать только в таблицы своих экранов.
 * Иначе подменой идентификатора таблицы в запросе можно было бы дотянуться
 * до любой таблицы пространства — в том числе той, которую никому не давали.
 */
export async function assertTableAllowed(app: App, tableId: string): Promise<string | null> {
  const direct = app.screens.some(
    (screen) => (screen.type === 'detail' || screen.type === 'form') && screen.tableId === tableId,
  )
  if (direct) return null

  const viewIds = app.screens
    .filter((screen) => screen.type === 'list' || screen.type === 'tiles')
    .map((screen) => (screen.type === 'list' || screen.type === 'tiles' ? screen.source.viewId : ''))
    .filter(Boolean)

  if (viewIds.length === 0) return 'Таблица недоступна этому приложению'

  const rows = await db
    .select({ tableId: viewsTable.tableId })
    .from(viewsTable)
    .where(inArray(viewsTable.id, viewIds))

  return rows.some((row) => row.tableId === tableId) ? null : 'Таблица недоступна этому приложению'
}
