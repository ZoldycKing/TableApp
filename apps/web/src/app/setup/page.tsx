import Link from 'next/link'
import { apps, db } from '@tableapp/db'
import { appSchema } from '@tableapp/schema'
import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { AppChrome } from '@/components/app-chrome'
import { BusinessSettings } from '@/components/business-settings'
import { FirstEntry } from '@/components/first-entry'
import { OwnerBookingSetup } from '@/components/owner-booking-setup'
import { AppEditor } from '@/components/builder/app-editor'
import { ownerPrimary, ownerSecondary } from '@/components/owner-ui'
import { loadBusinessOverview, overviewPermissions } from '@/lib/business-overview-data'
import { loadTableDirectory } from '@/lib/table-directory-data'
import { loadWorkspaceRuntime } from '@/lib/app-runtime'
import { SETUP_STEPS, setupHref, setupStep, tablePurpose } from '@/lib/guided-setup'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

export const metadata = { title: 'Подготовка приложения', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'

export default async function BusinessSetupPage({ searchParams }: { searchParams: Promise<{ app?: string; step?: string }> }) {
  const member = await requireMember()
  const [data, memberships, query] = await Promise.all([loadBusinessOverview(), listMemberships(member.userId), searchParams])
  if (!data) redirect('/login')
  const chrome = { member: { email: member.email, workspaceName: member.workspaceName, role: member.role }, memberships, activeWorkspaceId: member.workspaceId }
  const canEdit = overviewPermissions(data.role).edit
  if (!data.tables.length && !data.apps.length && canEdit) return <AppChrome {...chrome}><FirstEntry /></AppChrome>
  // Explicit foreign/deleted app IDs must never fall back to a different business application.
  const selected = query.app ? data.apps.find(app => app.id === query.app) : data.apps.find(app => !app.published) ?? data.apps[0]
  if (query.app && !selected) notFound()
  const [record] = selected ? await db.select().from(apps).where(and(eq(apps.id, selected.id), eq(apps.workspaceId, member.workspaceId))).limit(1) : []
  const parsed = record ? appSchema.safeParse({ ...(record.draft as object), slug: record.slug }) : null
  if (record && !parsed?.success) notFound()
  const app = parsed?.success ? parsed.data : null
  const directory = await loadTableDirectory(member.workspaceId)
  const relevant = app ? directory.filter(table => table.apps.some(link => link.id === app.id && link.inDraft)) : directory
  const stepId = setupStep(query.step ?? (data.profile ? 'data' : 'business'))
  const index = SETUP_STEPS.findIndex(step => step.id === stepId)
  const step = SETUP_STEPS[index]!
  const runtime = app && (stepId === 'review' || stepId === 'work' && Boolean(app.booking)) ? await loadWorkspaceRuntime(member.workspaceId) : null
  const catalog = app?.booking?.tables.services ?? relevant[0]?.id
  const workTables = app?.booking ? relevant.filter(table => [app.booking!.tables.masters, app.booking!.tables.schedule].includes(table.id)) : []
  return <AppChrome {...chrome} wide>
    <main className={`mx-auto w-full px-5 py-8 sm:px-8 sm:py-10 ${stepId === 'review' ? 'max-w-[1500px]' : 'max-w-5xl'}`}>
      <Link href="/app" className="rounded text-sm text-ink-soft underline decoration-sand-300 underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400">← Обзор бизнеса</Link>
      <header className="mt-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Подготовка приложения</h1><p className="mt-2 text-sm text-ink-soft">{data.businessName}{app ? ` · ${app.name}` : ''}</p></div>{app ? <Link href={`/apps/${app.id}`} className="rounded text-sm text-ink-soft underline underline-offset-4">Открыть настройку напрямую</Link> : null}</header>
      <nav aria-label="Шаги подготовки" className="my-8 border-b border-sand-200"><ol className="grid grid-cols-2 gap-2 pb-4 sm:grid-cols-4">{SETUP_STEPS.map((item, at) => <li key={item.id}><Link href={setupHref(app?.id, item.id)} aria-current={stepId === item.id ? 'step' : undefined} className={`flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-sage-400 ${stepId === item.id ? 'bg-sage-100 font-medium text-sage-700' : 'text-ink-soft hover:bg-sand-100'}`}><span aria-hidden className="tabular-nums">{at + 1}.</span>{item.name}</Link></li>)}</ol></nav>
      {!canEdit ? <p role="status" className="mb-6 text-sm text-ink-soft">У вас доступ только для просмотра. Изменять данные и публиковать приложение может владелец или редактор.</p> : null}
      <section aria-labelledby="setup-task" data-guide="setup-task">
        <h2 id="setup-task" className="text-xl font-semibold">{step.title}</h2><p className="mb-7 mt-3 max-w-2xl text-sm leading-6 text-ink-soft">{step.description}</p>
        {stepId === 'business' ? <div className="max-w-xl"><BusinessSettings key={data.workspaceId} profile={data.profile} canEdit={canEdit} nextHref={setupHref(app?.id, 'data')} /></div> : null}
        {stepId === 'data' ? <>
          <p className="mb-5 max-w-2xl text-sm leading-6 text-ink-soft">Учебные записи отмечены в редакторе. Можно заменить их своими или удалить неизменённые примеры. Удаление примеров не затрагивает ваши новые и отредактированные записи.</p>
          <ul className="divide-y divide-sand-200 rounded-2xl border border-sand-200 bg-white px-5">{relevant.map(table => <li key={table.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div className="min-w-0 flex-1"><h3 className="font-medium">{table.name}</h3><p className="mt-1 max-w-xl text-sm leading-6 text-ink-soft">{tablePurpose(app, table.id)}</p><p className="mt-1 text-xs text-ink-muted">Записей: {table.rowCount} · Полей: {table.fieldCount}</p></div><Link href={`/t/${table.id}?mode=records&setup=${encodeURIComponent(setupHref(app?.id, 'data'))}`} className={ownerSecondary}>{canEdit ? 'Открыть записи' : 'Посмотреть'}</Link></li>)}</ul>
          <div className="mt-5 flex flex-wrap gap-4">{canEdit && catalog ? <Link href={`/import?table=${catalog}`} className="text-sm underline underline-offset-4">Загрузить свои данные из файла</Link> : null}<Link href="/tables" className="text-sm underline underline-offset-4">Все таблицы</Link></div>
          <p className="mt-5 max-w-2xl text-xs leading-6 text-ink-muted">Импорт переносит значения. Формулы Excel, связи и бизнес-правила не переносятся автоматически — их нужно проверить отдельно.</p>
        </> : null}
        {stepId === 'work' ? <div className="max-w-3xl space-y-6">
          {canEdit && app?.booking && runtime ? <OwnerBookingSetup key={`${member.userId}:${app.id}`} userId={member.userId} app={app} tables={runtime.tables} /> : null}
          {workTables.length ? <section><h3 className="font-medium">Мастера и рабочее время</h3><p className="mt-2 text-sm leading-6 text-ink-soft">Замените учебных мастеров настоящими, укажите их почты, услуги и часы приёма. Расписание определяет свободное время для записи.</p><div className="mt-4 flex flex-wrap gap-3">{workTables.map(table => <Link key={table.id} href={`/t/${table.id}?mode=records&setup=${encodeURIComponent(setupHref(app?.id, 'work'))}`} className={ownerSecondary}>{table.name} →</Link>)}</div></section> : null}
          <section><h3 className="font-medium">Рабочие роли</h3><p className="mt-2 text-sm leading-6 text-ink-soft">{app ? `В приложении: ${app.roles.map(role => role.name).join(', ')}. На следующем шаге можно посмотреть экраны от имени каждой роли и добавить адреса сотрудников.` : 'Создайте приложение из исходной таблицы, затем задайте роли и доступ.'}</p><p className="mt-2 text-sm leading-6 text-ink-soft">Доступ к таблицам в кабинете задаётся отдельно в разделе «Команда». Права рабочего приложения настраиваются внутри приложения.</p><Link href="/team" className="mt-3 inline-block text-sm underline underline-offset-4">Команда и доступ к таблицам →</Link></section>
          {app && !app.booking ? <section><h3 className="font-medium">Правила вашего сценария</h3><p className="mt-2 text-sm leading-6 text-ink-soft">Проверьте товары или услуги, статусы и назначения в таблицах. Складские операции и выпуск продукции выполняйте через предусмотренные действия учёта.</p></section> : null}
        </div> : null}
        {stepId === 'review' ? app && runtime ? <AppEditor key={app.id} canEdit={canEdit} initialApp={app} business={data.profile} tables={Object.values(runtime.tables).map(table => ({ id: table.id, name: table.name, primaryFieldId: table.primaryFieldId, fields: table.fields }))} views={runtime.views} runtimeTables={runtime.tables} relatedTitles={runtime.relatedTitles} publishedAt={record?.publishedAt?.toISOString() ?? null} /> : <div className="max-w-xl"><p className="text-sm leading-6 text-ink-soft">Данные уже сохранены. Выберите исходную таблицу и нажмите «Подготовить приложение» — после этого появится предпросмотр и публикация.</p>{relevant[0] ? <Link href={`/tables/${relevant[0].id}`} className={`${ownerPrimary} mt-5`}>Выбрать исходную таблицу →</Link> : <Link href="/templates" className={`${ownerPrimary} mt-5`}>Выбрать сценарий →</Link>}</div> : null}
      </section>
      {stepId !== 'review' ? <footer className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-sand-200 pt-6"><Link href={index ? setupHref(app?.id, SETUP_STEPS[index - 1]!.id) : '/app'} className={ownerSecondary}>← Назад</Link>{stepId !== 'business' ? <Link href={setupHref(app?.id, SETUP_STEPS[index + 1]!.id)} className={ownerPrimary}>{stepId === 'work' ? 'Проверить приложение' : 'Продолжить'} →</Link> : null}</footer> : null}
      <p className="mt-6 text-xs leading-6 text-ink-muted">Шаги можно открывать в любом порядке. Сохранённые таблицы и настройки останутся в этом бизнесе.</p>
    </main>
  </AppChrome>
}
