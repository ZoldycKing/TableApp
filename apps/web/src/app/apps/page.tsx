import { appConfigVersions, apps, db, fields as fieldsTable, tables as tablesTable } from '@tableapp/db'
import type { Field } from '@tableapp/schema'
import { appSchema, byPosition, normalizeFieldOptions } from '@tableapp/schema'
import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import Link from 'next/link'
import { AppsManager, type AppRow } from '@/components/apps-manager'
import { AppChrome } from '@/components/app-chrome'
import type { TableSummary } from '@/lib/queries'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { BusinessSettings } from '@/components/business-settings'
import { loadBusinessProfile } from '@/lib/business-profile'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = PRIVATE_PAGE

export const dynamic = 'force-dynamic'

export default async function AppsPage() {
  const member = await requireMember()
  const rows = await db
    .select({ ...getTableColumns(apps), hasUnpublishedChanges: sql<boolean>`${apps.draft} is distinct from ${apps.published}` })
    .from(apps)
    .where(eq(apps.workspaceId, member.workspaceId))
    .orderBy(asc(apps.createdAt))
  const tableRows = await db
    .select()
    .from(tablesTable)
    .where(eq(tablesTable.workspaceId, member.workspaceId))
    .orderBy(asc(tablesTable.position))
  const fieldRows = tableRows.length
    ? await db.select().from(fieldsTable).where(inArray(fieldsTable.tableId, tableRows.map((table) => table.id)))
    : []

  const fieldsByTable = new Map<string, Field[]>()
  for (const row of fieldRows) {
    const field = { ...row, options: normalizeFieldOptions(row.type as Field['type'], row.options) } as unknown as Field
    const list = fieldsByTable.get(row.tableId)
    if (list) list.push(field)
    else fieldsByTable.set(row.tableId, [field])
  }

  const tables: TableSummary[] = tableRows.map((table) => ({
    id: table.id,
    name: table.name,
    primaryFieldId: table.primaryFieldId,
    fields: (fieldsByTable.get(table.id) ?? []).sort(byPosition),
  }))
  const host = (await headers()).get('host') ?? 'localhost:3000'
  const origin = `http${host.startsWith('localhost') || host.startsWith('127.0.0.1') ? '' : 's'}://${host}`
  const publishedHistory = rows.length ? await db.select({ appId: appConfigVersions.appId }).from(appConfigVersions)
    .where(and(inArray(appConfigVersions.appId, rows.map(row => row.id)), eq(appConfigVersions.kind, 'published'))) : []
  const lockedAddresses = new Set(publishedHistory.map(row => row.appId))

  const list: AppRow[] = rows
    .map((row) => ({ parsed: appSchema.safeParse(row.draft), row }))
    .filter((item) => item.parsed.success)
    .map(({ parsed, row }) => ({
      app: { ...(parsed as { success: true; data: AppRow['app'] }).data, slug: row.slug },
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      published: Boolean(row.published),
      addressLocked: Boolean(row.published) || lockedAddresses.has(row.id),
      hasUnpublishedChanges: Boolean(row.published) && row.hasUnpublishedChanges,
      origin,
    }))

  const chrome = {
    member: { email: member.email, workspaceName: member.workspaceName, role: member.role },
    memberships: await listMemberships(member.userId),
    activeWorkspaceId: member.workspaceId,
  }

  return (
    <AppChrome {...chrome}>
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Приложения</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Рабочие и клиентские экраны на основе таблиц вашего бизнеса.
          </p>
        </div>
        <Link
          href="/tables"
          className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
        >
          К таблицам
        </Link>
      </header>

      <details className="mb-6">
        <summary className="cursor-pointer text-sm font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage-400">Название и контакты бизнеса</summary>
        <div className="mt-4"><BusinessSettings profile={await loadBusinessProfile(member.workspaceId)} canEdit={member.role !== 'viewer'} /></div>
      </details>
      <AppsManager apps={list} tables={tables} canEdit={member.role !== 'viewer'} />
    </main>
    </AppChrome>
  )
}
