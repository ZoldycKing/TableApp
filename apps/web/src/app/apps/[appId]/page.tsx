import { apps, db, tables as dbTables, workspaceClientApps } from '@tableapp/db'
import { appSchema } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppEditor } from '@/components/builder/app-editor'
import { AppChrome } from '@/components/app-chrome'
import { loadWorkspaceRuntime } from '@/lib/app-runtime'
import type { TableSummary } from '@/lib/queries'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { loadBusinessProfile } from '@/lib/business-profile'
import { ModuleManager } from '@/components/module-manager'
import { AppVersionHistory } from '@/components/app-version-history'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = PRIVATE_PAGE

export const dynamic = 'force-dynamic'

export default async function AppEditorPage({ params }: { params: Promise<{ appId: string }> }) {
  const member = await requireMember()
  const { appId } = await params

  const [record] = await db.select().from(apps).where(eq(apps.id, appId)).limit(1)
  // Чужое приложение не должно открываться даже по прямой ссылке.
  if (!record || record.workspaceId !== member.workspaceId) notFound()

  const parsed = appSchema.safeParse(record.draft)
  if (!parsed.success) notFound()

  const runtime = await loadWorkspaceRuntime(member.workspaceId)
  const list = parsed.data.screens.find(screen => screen.type === 'list')
  const itemTableId = list?.type === 'list' ? runtime.views.find(view => view.id === list.source.viewId)?.tableId : null
  const [itemTable] = itemTableId ? await db.select({ templateId: dbTables.templateId }).from(dbTables).where(eq(dbTables.id, itemTableId)).limit(1) : []
  const inventoryUpgradeTableId = !parsed.data.inventory && itemTable?.templateId === 'sklad' &&
    runtime.tables[itemTableId!]?.fields.some(field => field.name === 'Остаток' && field.type === 'number') ? itemTableId : null
  const tables: TableSummary[] = Object.values(runtime.tables).map((table) => ({
    id: table.id,
    name: table.name,
    primaryFieldId: table.primaryFieldId,
    fields: table.fields,
  }))

  const chrome = {
    member: { email: member.email, workspaceName: member.workspaceName, role: member.role },
    memberships: await listMemberships(member.userId),
    activeWorkspaceId: member.workspaceId,
  }
  const [primary] = await db.select().from(workspaceClientApps).where(eq(workspaceClientApps.workspaceId, member.workspaceId))
  const sourceApps = await db.select().from(apps).where(eq(apps.workspaceId, member.workspaceId))
  const sources = sourceApps.filter(source => source.id !== appId && !source.published).flatMap(source => {
    const definition = appSchema.safeParse(source.draft)
    return definition.success && definition.data.modules?.length === 1 ? [{ id: source.id, name: source.name, kind: definition.data.modules[0]!.kind }] : []
  })

  return (
    <AppChrome {...chrome} wide>
    <main className="mx-auto w-full max-w-[1500px] px-6 py-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{parsed.data.name}</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {record.publishedAt
              ? `опубликовано ${record.publishedAt.toLocaleString('ru-RU')} · /a/${parsed.data.slug}`
              : 'ещё не опубликовано'}
          </p>
        </div>
        <div className="flex gap-2">
          {record.publishedAt ? (
            <a
              href={`/a/${parsed.data.slug}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
            >
              Открыть приложение
            </a>
          ) : null}
          <Link
            href="/apps"
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
          >
            Все приложения
          </Link>
        </div>
      </header>

      {/*
        Приложение собирается по таблице автоматически, и первый вопрос
        у человека — «что это вообще и откуда взялось». Объясняем прямо здесь,
        один раз: пока приложение не опубликовано, подсказка висит.
      */}
      {record.publishedAt ? null : (
        <p className="mb-4 rounded-xl border border-sand-200 bg-sand-100/60 px-4 py-3 text-sm leading-relaxed text-ink-soft">
          {parsed.data.customer || parsed.data.booking ? <>Клиентский кабинет и рабочие экраны уже настроены. Укажите <Link href="/apps" className="underline underline-offset-2">название бизнеса</Link>, замените примеры своими товарами или услугами и пригласите сотрудников в разделе «Доступ». Назначайте работу по почте приглашённого сотрудника. Затем опубликуйте приложение и отправьте клиентам ссылку. Общий вход используется повторно, а обращения и права остаются у этого бизнеса.</> : <>Экраны собраны по вашей таблице: список записей, карточка одной записи
          и форма для новой. Слева — экраны, посередине — настройки выбранного,
          справа — как он выглядит на телефоне. Когда всё устроит, нажмите
          «Опубликовать» — появится ссылка, которую можно дать сотрудникам.</>}
        </p>
      )}

      <ModuleManager key={`modules:${record.updatedAt.toISOString()}`} app={parsed.data} primary={primary?.appId === appId} sources={sources} owner={member.role === 'owner'} />
      <AppVersionHistory key={`history-${appId}`} appId={appId} canRestore={member.role !== 'viewer'} revision={`${record.updatedAt.toISOString()}:${record.publishedAt?.toISOString() ?? ''}`} />
      <AppEditor
        key={record.updatedAt.toISOString()}
        business={await loadBusinessProfile(member.workspaceId)}
        portalUpgradeTableId={itemTable?.templateId === 'portal' ? itemTableId : null}
        dispatchUpgradeTableId={itemTable?.templateId === 'zayavki' ? itemTableId : null}
        inventoryUpgradeTableId={inventoryUpgradeTableId}
        initialApp={parsed.data}
        tables={tables}
        views={runtime.views}
        runtimeTables={runtime.tables}
        relatedTitles={runtime.relatedTitles}
        publishedAt={record.publishedAt ? record.publishedAt.toISOString() : null}
      />
    </main>
    </AppChrome>
  )
}
