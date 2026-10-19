import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppChrome } from '@/components/app-chrome'
import { BusinessSettings } from '@/components/business-settings'
import { loadBusinessOverview, overviewPermissions } from '@/lib/business-overview-data'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

export const metadata = { title: 'Подготовка бизнеса и приложения', ...PRIVATE_PAGE }
export const dynamic = 'force-dynamic'

const LINK = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400'
const PRIMARY = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400'

/** A real launch checklist; existing forms and editors remain the source of truth. */
export default async function BusinessSetupPage() {
  const member = await requireMember()
  const [data, memberships] = await Promise.all([loadBusinessOverview(), listMemberships(member.userId)])
  if (!data) redirect('/login')
  const permissions = overviewPermissions(data.role)
  const firstTable = data.tables[0]
  const nextApp = data.apps.find(app => !app.published || app.hasUnpublishedChanges) ?? data.apps[0]
  const published = data.apps.filter(app => app.published)
  return <AppChrome member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }} memberships={memberships} activeWorkspaceId={member.workspaceId}>
    <main className="mx-auto w-full max-w-4xl px-5 py-7 sm:px-8 sm:py-10">
      <Link href="/app" className="rounded text-sm text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400">← Обзор бизнеса</Link>
      <header className="mb-7 mt-5"><p className="mb-1 break-words text-sm text-ink-muted">{data.businessName}</p><h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Подготовка приложения</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">Данные бизнеса → проверка таблиц → экраны и доступ → публикация. Можно возвращаться к любому шагу: сохранённые таблицы и настройки остаются в этом бизнесе.</p></header>
      {!permissions.edit ? <p role="status" className="mb-6 rounded-xl border border-sand-200 bg-sand-50 p-4 text-sm leading-relaxed text-ink-soft">У вас доступ только для просмотра. Добавить данные, настроить и опубликовать приложение может владелец или редактор бизнеса.</p> : null}
      <ol className="space-y-6">
        <li id="business" className="scroll-mt-8 rounded-2xl border border-sand-200 bg-white p-5 sm:p-6">
          <StepTitle number={1} title="Бизнес и источник данных" state={data.tables.length ? `Таблиц: ${data.tables.length}` : 'Данные ещё не добавлены'} />
          <p className="mb-5 mt-3 text-sm leading-relaxed text-ink-soft">Укажите название, которое увидят клиенты, и добавьте свои данные. Excel и готовый сценарий ведут к одним и тем же инструментам редактирования.</p>
          <BusinessSettings profile={data.profile} canEdit={permissions.edit} />
          {permissions.edit ? <div className="flex flex-wrap gap-3"><Link href="/import" className={PRIMARY}>Загрузить Excel или CSV</Link><Link href="/templates" className={LINK}>Выбрать готовый сценарий</Link><Link href="/tables" className={LINK}>Создать пустую таблицу</Link></div> : <Link href="/tables" className={LINK}>Посмотреть таблицы</Link>}
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">Импорт переносит значения. Формулы Excel, связи между таблицами и правила работы приложения нужно проверить и настроить отдельно.</p>
        </li>
        <li className="rounded-2xl border border-sand-200 bg-white p-5 sm:p-6">
          <StepTitle number={2} title="Проверьте таблицы" state={firstTable ? 'Доступны для проверки' : 'Сначала добавьте таблицу'} />
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">Откройте таблицы, проверьте названия и типы полей, добавьте свои записи. Товары, клиенты и заказы можно связать между собой. Наличие таблицы не означает, что данные уже проверены.</p>
          <div className="mt-4 flex flex-wrap gap-3">{firstTable ? <Link href={`/tables/${encodeURIComponent(firstTable.id)}`} className={LINK}>Открыть «{firstTable.name}»</Link> : null}<Link href="/tables" className={LINK}>Все таблицы</Link></div>
        </li>
        <li className="rounded-2xl border border-sand-200 bg-white p-5 sm:p-6">
          <StepTitle number={3} title="Экраны и доступ" state={nextApp ? 'Есть сохранённое приложение' : 'Приложение ещё не создано'} />
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{nextApp ? 'Откройте настройку приложения. Проверьте каталог, личный кабинет и рабочие экраны, затем задайте, что доступно гостю, клиенту и сотруднику.' : 'В выбранной таблице создайте приложение, затем настройте его экраны и права. Готовые сценарии могут уже содержать приложение — оно появится здесь.'}</p>
          {nextApp ? <Link href={`/apps/${encodeURIComponent(nextApp.id)}`} className={`${LINK} mt-4`}>{permissions.edit ? 'Настроить приложение' : 'Посмотреть настройки'}</Link> : firstTable && permissions.edit ? <Link href={`/tables/${encodeURIComponent(firstTable.id)}`} className={`${LINK} mt-4`}>Подготовить приложение из таблицы</Link> : null}
        </li>
        <li className="rounded-2xl border border-sand-200 bg-white p-5 sm:p-6">
          <StepTitle number={4} title="Проверьте и опубликуйте" state={published.length ? `Опубликовано: ${published.length}` : 'Пока не опубликовано'} />
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">Публикация доступна в редакторе приложения после проверки настроек. Пользователи видят опубликованную версию экранов; сохранённый черновик можно подготовить отдельно.</p>
          <div className="mt-4 flex flex-wrap gap-3">{nextApp ? <Link href={`/apps/${encodeURIComponent(nextApp.id)}`} className={LINK}>{permissions.edit ? 'Перейти к проверке и публикации' : 'Посмотреть настройки'}</Link> : null}{published[0] ? <Link href={`/a/${encodeURIComponent(published[0].slug)}`} className={LINK}>Открыть опубликованное приложение<span aria-hidden="true">↗</span></Link> : null}</div>
        </li>
      </ol>
    </main>
  </AppChrome>
}

function StepTitle({ number, title, state }: { number: number; title: string; state: string }) {
  return <div className="flex flex-wrap items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sand-100 text-sm font-semibold text-ink-soft" aria-hidden="true">{number}</span><h2 className="min-w-0 flex-1 text-lg font-semibold text-ink">{title}</h2><span className="text-xs text-ink-muted">{state}</span></div>
}
