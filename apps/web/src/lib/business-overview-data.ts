import { businessProfileSchema, type BusinessProfile } from '@tableapp/schema'
import { and, desc, eq, sql } from 'drizzle-orm'
import { canAdminister, canEdit, type MemberRole } from './roles'

export type OverviewTable = {
  id: string
  name: string
  icon: string
  rowCount: number
  fieldCount: number
  updatedAt: string
}

export type OverviewApp = {
  id: string
  name: string
  slug: string
  published: boolean
  hasUnpublishedChanges: boolean
  updatedAt: string
}

export type BusinessOverviewData = {
  workspaceId: string
  workspaceName: string
  businessName: string
  profile: BusinessProfile | null
  role: MemberRole
  tables: OverviewTable[]
  apps: OverviewApp[]
}

export type OverviewAction = { title: string; description: string; label: string; href: string; icon: string }

/** The next step describes persisted state, never a fictitious onboarding percentage. */
export function overviewNextAction(data: BusinessOverviewData): OverviewAction {
  if (!canEdit(data.role)) return {
    title: data.tables.length ? 'Данные бизнеса доступны для просмотра' : 'Здесь появятся данные бизнеса',
    description: 'У вас доступ для просмотра. Данные, экраны и публикацию подготавливает владелец или редактор бизнеса.',
    label: data.tables.length ? 'Посмотреть таблицы' : 'Посмотреть приложения',
    href: data.tables.length ? '/tables' : '/apps', icon: 'table',
  }
  if (!data.tables.length) return {
    title: 'Начните с данных вашего бизнеса',
    description: 'Загрузите Excel или CSV, выберите готовый сценарий или создайте таблицу. Затем подготовьте из неё приложение.',
    label: 'Начать настройку', href: '/setup', icon: 'plus',
  }
  if (!data.profile) return {
    title: 'Укажите, какой бизнес увидят клиенты',
    description: 'Название бизнеса будет видно в каталоге, личном кабинете и переписке. Данные таблиц уже доступны для работы.',
    label: 'Заполнить данные бизнеса', href: '/setup?step=business', icon: 'gear',
  }
  if (!data.apps.length) return {
    title: 'Данные есть — подготовьте приложение',
    description: 'Выберите исходную таблицу, создайте приложение и проверьте его экраны и доступ для клиентов и сотрудников.',
    label: 'Подготовить приложение', href: `/tables/${encodeURIComponent(data.tables[0]!.id)}`, icon: 'apps',
  }
  const pending = data.apps.find(app => !app.published || app.hasUnpublishedChanges)
  if (pending) return {
    title: pending.published ? 'Есть неопубликованные изменения' : 'Приложение ещё не опубликовано',
    description: pending.published
      ? `В приложении «${pending.name}» сохранён новый черновик. Пользователи продолжают видеть опубликованную версию. Проверьте правки перед публикацией.`
      : `Проверьте экраны и доступ в приложении «${pending.name}». После публикации появится рабочая ссылка для пользователей.`,
    label: pending.published ? 'Проверить изменения' : 'Проверить и опубликовать',
    href: pending.published ? `/apps/${encodeURIComponent(pending.id)}` : `/setup?app=${encodeURIComponent(pending.id)}&step=review`, icon: 'apps',
  }
  return {
    title: 'Приложение опубликовано',
    description: 'Пользователи видят опубликованные экраны. Записи таблиц доступны в приложении согласно настроенным правам; изменения экранов требуют новой публикации.',
    label: 'Открыть приложение', href: `/a/${encodeURIComponent(data.apps[0]!.slug)}`, icon: 'check',
  }
}

export function overviewPermissions(role: MemberRole) {
  return { edit: canEdit(role), manageTeam: canAdminister(role) }
}

/**
 * Only the authenticated active business is queried. Overview aggregates stay
 * in Postgres: row JSON, app drafts, contacts and other businesses never load.
 * Imports are deferred so pure next-step rules can be tested without a database.
 */
export async function loadBusinessOverview(): Promise<BusinessOverviewData | null> {
  const { currentMember } = await import('./session')
  const member = await currentMember()
  if (!member) return null
  const { apps, db, fields, rows, tables, workspaces } = await import('@tableapp/db')
  const rowStats = db.select({
    tableId: rows.tableId,
    rowCount: sql<number>`(count(*) filter (where ${rows.deletedAt} is null))::int`.mapWith(Number).as('row_count'),
    lastChange: sql<string | null>`max(${rows.updatedAt})::text`.as('last_row_change'),
  }).from(rows)
    .innerJoin(tables, and(eq(tables.id, rows.tableId), eq(tables.workspaceId, member.workspaceId)))
    .groupBy(rows.tableId).as('overview_row_stats')
  const fieldStats = db.select({
    tableId: fields.tableId,
    fieldCount: sql<number>`count(*)::int`.mapWith(Number).as('field_count'),
    lastChange: sql<string | null>`max(${fields.updatedAt})::text`.as('last_field_change'),
  }).from(fields)
    .innerJoin(tables, and(eq(tables.id, fields.tableId), eq(tables.workspaceId, member.workspaceId)))
    .groupBy(fields.tableId).as('overview_field_stats')
  const [businesses, tableRows, appRows] = await Promise.all([
    db.select({ profile: workspaces.businessProfile }).from(workspaces)
      .where(eq(workspaces.id, member.workspaceId)).limit(1),
    db.select({
      id: tables.id, name: tables.name, icon: tables.icon, updatedAt: tables.updatedAt,
      rowCount: sql<number>`coalesce(${rowStats.rowCount}, 0)`.mapWith(Number),
      fieldCount: sql<number>`coalesce(${fieldStats.fieldCount}, 0)`.mapWith(Number),
      lastRowChange: rowStats.lastChange,
      lastFieldChange: fieldStats.lastChange,
    }).from(tables)
      .leftJoin(rowStats, eq(rowStats.tableId, tables.id))
      .leftJoin(fieldStats, eq(fieldStats.tableId, tables.id))
      .where(eq(tables.workspaceId, member.workspaceId)).orderBy(desc(tables.updatedAt), tables.id),
    db.select({
      id: apps.id, name: apps.name, slug: apps.slug, updatedAt: apps.updatedAt,
      published: sql<boolean>`${apps.published} is not null`,
      hasUnpublishedChanges: sql<boolean>`${apps.published} is not null and ${apps.draft} <> ${apps.published}`,
    }).from(apps).where(eq(apps.workspaceId, member.workspaceId)).orderBy(desc(apps.updatedAt), apps.id),
  ])
  const parsed = businessProfileSchema.safeParse(businesses[0]?.profile)
  const profile = parsed.success ? parsed.data : null
  return {
    workspaceId: member.workspaceId, workspaceName: member.workspaceName,
    businessName: profile?.name ?? member.workspaceName, profile, role: member.role,
    tables: tableRows.map(({ lastRowChange, lastFieldChange, ...table }) => ({
      ...table,
      updatedAt: new Date(Math.max(table.updatedAt.getTime(), ...[lastRowChange, lastFieldChange].filter((date): date is string => Boolean(date)).map(date => new Date(date).getTime()))).toISOString(),
    })).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt) || first.id.localeCompare(second.id)),
    apps: appRows.map(app => ({ ...app, updatedAt: app.updatedAt.toISOString() })),
  }
}
