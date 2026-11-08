import Link from 'next/link'
import { OwnerHelpButton } from '@/components/owner-help'
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
import { SetupTableList } from '@/components/setup-table-list'
import { TemplateIcon } from '@/components/template-icon'
import { PublicationStatus } from '@/components/publication-status'
import { PrepareApp } from '@/components/prepare-app'
import { TemplatePreparation } from '@/components/template-preparation'
import { templatePreparation } from '@/lib/template-preparation'
import { loadBusinessOverview, overviewPermissions } from '@/lib/business-overview-data'
import { loadTableDirectory } from '@/lib/table-directory-data'
import { loadWorkspaceRuntime } from '@/lib/app-runtime'
import { guidedSetupPlan, setupHelpHref, setupHref, setupStep, setupTableHref, tablePurpose } from '@/lib/guided-setup'
import { listMemberships, requireWorkspaceMember as requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

export const metadata = { title: 'Подготовка приложения', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'

export default async function BusinessSetupPage({ searchParams }: { searchParams: Promise<{ app?: string; step?: string; panel?: string }> }) {
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
  if (app?.purpose === 'personal') redirect(`/apps/${encodeURIComponent(app.id)}`)
  const directory = await loadTableDirectory(member.workspaceId)
  if (!app && canEdit) return <AppChrome {...chrome}><main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10"><Link href="/app" className="text-sm text-ink-soft underline underline-offset-4">← Обзор пространства</Link><h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Приложение из ваших таблиц</h1><p className="mb-6 mt-3 max-w-xl text-sm leading-6 text-ink-soft">Данные уже загружены. Теперь подготовьте приложение для работы с ними.</p><PrepareApp tables={directory.map(table => ({ id: table.id, name: table.name }))} /></main></AppChrome>
  const relevant = app ? directory.filter(table => table.apps.some(link => link.id === app.id && link.inDraft)) : directory
  const stepId = setupStep(query.step ?? (data.profile ? 'data' : 'business'))
  const plan = guidedSetupPlan(app, relevant.flatMap(table => table.relations))
  const index = plan.steps.findIndex(step => step.id === stepId)
  const step = plan.steps[index]!
  const runtime = app && (stepId === 'review' || stepId === 'work' && Boolean(app.booking)) ? await loadWorkspaceRuntime(member.workspaceId, { metadataOnly: stepId === 'review', app }) : null
  const taskTables = relevant.map(table => ({ ...table, description: plan.tasks.find(task => task.id === table.id)?.description ?? tablePurpose(app, table.id), stage: plan.tasks.find(task => task.id === table.id)?.stage }))
  const dataTables = taskTables.filter(table => table.stage === 'data' || !plan.tasks.length)
  const workTables = taskTables.filter(table => table.stage === 'work')
  const laterTables = taskTables.filter(table => table.stage === 'activity' || !table.stage && plan.tasks.length)
  const sampleData = app && stepId === 'data' ? await templatePreparation(member.workspaceId, app.id) : null
  const help = setupHelpHref(stepId === 'data' ? 'tables' : stepId === 'work' ? plan.workHelp : stepId === 'review' ? 'publish' : 'company', app?.id, stepId)
  return <AppChrome {...chrome} wide>
    <main className={`@container mx-auto w-full min-w-0 px-5 py-6 sm:px-8 sm:py-8 ${stepId === 'review' ? 'max-w-[1500px]' : 'max-w-4xl'}`}>
      <Link href="/app" className="rounded text-sm text-ink-soft underline decoration-sand-300 underline-offset-4 focus-visible:ring-2 focus-visible:ring-sage-400">← Обзор пространства</Link>
      <header className="mt-4 flex min-w-0 items-center gap-4">{plan.icon ? <TemplateIcon id={plan.icon} className="size-12" /> : null}<div className="min-w-0"><h1 className="text-2xl font-semibold tracking-tight text-ink">Настройка приложения</h1><div className="mt-2 flex flex-wrap items-center gap-2"><p className="break-words text-sm text-ink-soft">{app?.name ?? data.businessName}</p>{selected ? <PublicationStatus published={selected.published} hasChanges={selected.hasUnpublishedChanges} /> : null}</div></div></header>
      <nav aria-label="Шаги подготовки" className="my-5 border-b border-sand-200"><ol className="grid grid-cols-2 gap-2 pb-4 @min-[600px]:grid-cols-4">{plan.steps.map((item, at) => <li key={item.id}><Link href={setupHref(app?.id, item.id)} aria-current={stepId === item.id ? 'step' : undefined} className={`flex min-h-11 h-full items-center gap-2 rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-sage-400 ${stepId === item.id ? 'bg-sage-100 font-medium text-sage-700' : 'text-ink-soft hover:bg-sand-100'}`}><span aria-hidden className="tabular-nums">{at + 1}.</span>{item.name}</Link></li>)}</ol></nav>
      {!canEdit ? <p role="status" className="mb-6 text-sm text-ink-soft">У вас доступ только для просмотра. Изменять данные и публиковать приложение может владелец или редактор.</p> : null}
      <section aria-labelledby="setup-task" data-guide="setup-task">
        <h2 id="setup-task" className={stepId === 'review' ? 'sr-only' : 'text-xl font-semibold'}>{step.title}</h2>{stepId !== 'review' ? <p className="mb-6 mt-3 max-w-2xl text-sm leading-6 text-ink-soft">{step.description}</p> : null}
        {stepId === 'business' ? <div className="max-w-xl"><BusinessSettings key={data.workspaceId} profile={data.profile} canEdit={canEdit} nextHref={canEdit ? setupHref(app?.id, 'data') : undefined} setup /></div> : null}
        {stepId === 'data' ? <>
          {sampleData && app ? <TemplatePreparation key={app.id} appId={app.id} sampleCount={sampleData.samples} canEdit={canEdit} /> : null}
          {dataTables.length ? <SetupTableList tables={dataTables} appId={app?.id} step="data" canEdit={canEdit} /> : <p className="text-sm leading-6 text-ink-soft">Здесь ничего заполнять не нужно. Переходите к следующему шагу.</p>}

          {canEdit && dataTables.length ? <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3">{dataTables.map(table => <Link key={table.id} href={`/import?table=${encodeURIComponent(table.id)}${app ? `&app=${encodeURIComponent(app.id)}` : ''}`} className="text-sm text-sage-700 underline underline-offset-4">Импорт в «{table.name}»</Link>)}</div> : null}
          {laterTables.length ? <Link href="/tables" className="mt-5 inline-flex min-h-11 items-center text-sm text-ink-soft underline underline-offset-4">Все таблицы</Link> : null}
        </> : null}
        {stepId === 'work' ? <div className="max-w-3xl space-y-6">
          {canEdit && app?.booking && runtime ? <OwnerBookingSetup key={`${member.userId}:${app.id}`} userId={member.userId} app={app} tables={runtime.tables} /> : null}
          {app?.booking && canEdit ? <div className="flex flex-wrap gap-x-5 gap-y-3">{workTables.map(table => <Link key={table.id} href={setupTableHref(table.id, app.id, 'work')} className="inline-flex min-h-11 items-center text-sm text-sage-700 underline underline-offset-4">{table.name === 'Мастера' ? 'Все мастера' : table.name}</Link>)}</div> : workTables.length ? <SetupTableList tables={workTables} appId={app?.id} step="work" canEdit={canEdit} /> : null}
          {app && !app.booking ? <section className="rounded-2xl border border-sand-200 bg-white p-5 sm:p-6"><h3 className="font-medium">{app.inventory ? 'Владелец и кладовщик' : 'Доступ сотрудников'}</h3><p className="mb-4 mt-2 max-w-xl text-sm leading-6 text-ink-soft">{app.inventory ? 'Владелец видит весь склад и стоимость запасов. Кладовщик принимает и выдаёт товары, а закупочные цены ему не видны.' : 'Укажите почту сотрудника и выберите его рабочую роль. Если работаете один, можно сразу перейти к проверке.'}</p><Link href={setupHref(app.id, 'review', 'access')} className={ownerSecondary}>{canEdit ? 'Добавить сотрудника' : 'Посмотреть доступ'}</Link>{!app.inventory ? <Link href="/team" className="mt-4 block w-fit text-sm text-ink-soft underline underline-offset-4">Команда и доступ к таблицам</Link> : null}</section> : !app ? <Link href="/tables" className={ownerSecondary}>Выбрать таблицу для приложения</Link> : null}
        </div> : null}
        {stepId === 'review' ? app && runtime ? <><AppEditor remotePreview key={`${app.id}:${query.panel === 'access'}`} initialSection={query.panel === 'access' ? 'access' : 'content'} previewInstruction={plan.firstTask} helpLinks={{ content: setupHelpHref('publish', app.id, 'review'), appearance: setupHelpHref('appearance', app.id, 'review'), access: setupHelpHref('access', app.id, 'review') }} canEdit={canEdit} initialApp={app} business={data.profile} tables={Object.values(runtime.tables).map(table => ({ id: table.id, name: table.name, primaryFieldId: table.primaryFieldId, fields: table.fields }))} views={runtime.views} runtimeTables={runtime.tables} relatedTitles={runtime.relatedTitles} publishedAt={record?.publishedAt?.toISOString() ?? null} /></> : <div className="max-w-xl"><p className="text-sm leading-6 text-ink-soft">Данные сохранены. Выберите таблицы для приложения, затем настройте его разделы.</p>{relevant[0] ? <Link href={`/tables/${relevant[0].id}`} className={`${ownerPrimary} mt-5`}>Выбрать таблицу →</Link> : <Link href="/templates" className={`${ownerPrimary} mt-5`}>Выбрать шаблон →</Link>}</div> : null}
      </section>
      {stepId !== 'review' ? <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-sand-200 pt-5"><Link href={index ? setupHref(app?.id, plan.steps[index - 1]!.id) : '/app'} className={ownerSecondary}>Назад</Link>{stepId !== 'business' || !canEdit ? <Link href={setupHref(app?.id, plan.steps[index + 1]!.id)} className={ownerPrimary}>{stepId === 'work' ? 'Проверить приложение' : 'Продолжить'} →</Link> : null}</footer> : null}
      {stepId !== 'review' || !app || !runtime ? <OwnerHelpButton href={help} /> : null}
    </main>
  </AppChrome>
}
