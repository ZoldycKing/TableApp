import { apps, attachments, db, fields as fieldsTable, rows as rowsTable, views as viewsTable } from '@tableapp/db'
import type { App, Field, View } from '@tableapp/schema'
import { appSchema } from '@tableapp/schema'
import { eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { fieldPolicy, publicRowGuard, type Visitor } from '@/lib/app-roles'
import { currentAppAccess } from '@/lib/app-session'
import { canAccessRow, rulesFor } from '@/lib/row-access'
import { currentMember } from '@/lib/session'
import { getFile } from '@/lib/storage'

/** Таблицы, с которыми работает приложение: напрямую и через представления. */
async function appTables(app: App): Promise<Set<string>> {
  const ids = new Set<string>()
  const viewIds: string[] = []

  for (const screen of app.screens) {
    if (screen.type === 'list' || screen.type === 'tiles') {
      viewIds.push(screen.source.viewId)
    } else if (screen.type === 'dashboard') {
      for (const block of screen.blocks) if ('source' in block) viewIds.push(block.source.viewId)
    } else {
      ids.add(screen.tableId)
    }
  }

  if (viewIds.length > 0) {
    const found = await db
      .select({ tableId: viewsTable.tableId })
      .from(viewsTable)
      .where(inArray(viewsTable.id, viewIds))
    for (const view of found) ids.add(view.tableId)
  }
  return ids
}

/** Представления приложения: нужны и для таблиц, и для публичной выборки. */
async function appViews(app: App): Promise<Record<string, View>> {
  const ids = new Set<string>()
  for (const screen of app.screens) {
    if (screen.type === 'list' || screen.type === 'tiles') ids.add(screen.source.viewId)
    if (screen.type === 'dashboard') {
      for (const block of screen.blocks) if ('source' in block) ids.add(block.source.viewId)
    }
  }
  if (ids.size === 0) return {}

  const found = await db.select().from(viewsTable).where(inArray(viewsTable.id, [...ids]))
  return Object.fromEntries(found.map((view) => [view.id, view as unknown as View]))
}

/**
 * Может ли этот посетитель получить этот файл.
 *
 * Три условия, и все обязательны: колонка с вложением ему читается, строка
 * ему доступна, и файл действительно лежит в этой колонке этой строки.
 *
 * Раньше здесь была дыра: у таблицы без правил на строки файл отдавался
 * любому, кому открыт хоть один экран приложения. Для не вошедшего это
 * означало, что публичная витрина открывала доступ ко **всем** вложениям
 * приложения — достаточно было знать ключ. Знание ключа правом не является.
 */
async function mayRead(
  app: App,
  visitor: Visitor,
  viewer: { email: string; company: string } | null,
  record: { tableId: string; rowId: string; fieldId: string | null; key: string },
): Promise<boolean> {
  const views = await appViews(app)

  // 1. Колонка. Файл из колонки, которой человек не видит, ему не положен.
  const policy = fieldPolicy(app, record.tableId, visitor, views)
  if (policy.restricted && (!record.fieldId || !policy.fields.has(record.fieldId))) return false

  const [row] = await db.select().from(rowsTable).where(eq(rowsTable.id, record.rowId)).limit(1)
  if (!row || row.tableId !== record.tableId || row.deletedAt) return false
  const data = row.data as Record<string, unknown>

  // 2. Файл действительно лежит в этой ячейке, а не просто помечен строкой.
  if (record.fieldId) {
    const cell = data[record.fieldId]
    const files = Array.isArray(cell) ? (cell as { key?: string }[]) : []
    if (!files.some((file) => file.key === record.key)) return false
  }

  // 3. Строка. У не вошедшего своих строк не бывает: его выборку задаёт
  // представление публичного списка, как и при обычном чтении.
  if (!visitor.authenticated || visitor.roleId === null) {
    const table = await db
      .select({ id: fieldsTable.id, tableId: fieldsTable.tableId, name: fieldsTable.name, type: fieldsTable.type, options: fieldsTable.options, position: fieldsTable.position })
      .from(fieldsTable)
      .where(eq(fieldsTable.tableId, record.tableId))
    const guard = publicRowGuard(app, record.tableId, views, table as unknown as Field[])
    return guard(data)
  }

  const rules = rulesFor(app, record.tableId, visitor)
  return canAccessRow(rules, viewer, data)
}

/**
 * Выдача файла.
 *
 * Участник команды получает файлы своего воркспейса. Пользователь приложения —
 * только те, что лежат в доступной ему колонке доступной ему строки.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params
  const key = segments.join('/')

  const [record] = await db.select().from(attachments).where(eq(attachments.key, key)).limit(1)
  if (!record) return new NextResponse('Not found', { status: 404 })

  const member = await currentMember()
  let allowed = member?.workspaceId === record.workspaceId

  if (!allowed) {
    const published = await db.select().from(apps).where(eq(apps.workspaceId, record.workspaceId))

    for (const candidate of published) {
      if (!candidate.published) continue
      const parsed = appSchema.safeParse(candidate.published)
      if (!parsed.success) continue
      const app = parsed.data

      // Файл без привязки к ячейке ещё не сохранён — отдавать нечего.
      if (!record.tableId || !record.rowId) continue
      if (!(await appTables(app)).has(record.tableId)) continue

      const { visitor, viewer } = await currentAppAccess(app)
      if (
        await mayRead(app, visitor, viewer, {
          tableId: record.tableId,
          rowId: record.rowId,
          fieldId: record.fieldId,
          key,
        })
      ) {
        allowed = true
        break
      }
    }
  }

  if (!allowed) return new NextResponse('Forbidden', { status: 403 })

  const file = await getFile(key)
  if (!file) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(file.body, {
    headers: {
      'Content-Type': file.mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(record.name)}`,
      // Ключ файла неизменяем, поэтому содержимое можно кэшировать надолго;
      // приватность обеспечивает проверка выше, а не запрет кэширования.
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
