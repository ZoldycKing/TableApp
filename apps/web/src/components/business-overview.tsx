import Link from 'next/link'
import type { BusinessOverviewData } from '@/lib/business-overview-data'
import { overviewNextAction, overviewPermissions } from '@/lib/business-overview-data'
import { ROLE_LABELS } from '@/lib/roles'
import { ShellIcon } from './shell/icons'
import { FirstEntry } from './first-entry'

const PRIMARY = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2'
const SECONDARY = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-sand-200 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400'
const TEXT_LINK = 'rounded text-sm font-medium text-ink-soft underline decoration-sand-300 underline-offset-4 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400'

function updatedDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value))
}

export function BusinessOverview({ data }: { data: BusinessOverviewData }) {
  const next = overviewNextAction(data)
  const permissions = overviewPermissions(data.role)
  if (permissions.edit && data.tables.length === 0 && data.apps.length === 0) return <FirstEntry />
  const published = data.apps.filter(app => app.published).length
  const pending = data.apps.filter(app => !app.published || app.hasUnpublishedChanges).length
  const totals = [
    { label: 'Таблицы', value: data.tables.length, href: '/tables', icon: 'table' },
    { label: 'Записи в таблицах', value: data.tables.reduce((sum, table) => sum + table.rowCount, 0), href: '/tables', icon: 'menu' },
    { label: 'Приложения', value: data.apps.length, href: '/apps', icon: 'apps' },
  ]
  return <main className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-1 break-words text-sm text-ink-muted">{data.workspaceName}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Обзор пространства</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">Таблицы, приложения и следующие действия в одном месте.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg bg-sand-100 px-3 py-2 text-xs font-medium text-ink-soft">{ROLE_LABELS[data.role]}</span>
        {permissions.edit ? <Link href="/setup" className={SECONDARY}><ShellIcon name="gear" className="size-4" />Подготовить приложение</Link> : null}
      </div>
    </header>

    <section aria-labelledby="business-next-action" className="mt-7 flex flex-col gap-5 rounded-2xl border border-sand-200 bg-sand-50 p-5 sm:p-6 lg:flex-row lg:items-center lg:gap-7">
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sand-200 bg-white text-sage-700"><ShellIcon name={next.icon} className="size-5" /></span>
        <div className="min-w-0">
          <h2 id="business-next-action" className="text-lg font-semibold leading-snug text-ink">{next.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">{next.description}</p>
        </div>
      </div>
      <Link href={next.href} className={`${PRIMARY} shrink-0 self-start`}>{next.label}<span aria-hidden="true">→</span></Link>
    </section>

    <dl className="mt-6 grid grid-cols-1 gap-3 min-[500px]:grid-cols-3">
      {totals.map(total => <div key={total.label} className="rounded-2xl border border-sand-200 bg-white px-5 py-4">
        <dt><Link href={total.href} className="inline-flex items-center gap-2 rounded text-sm text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400"><ShellIcon name={total.icon} className="size-4" />{total.label}</Link></dt>
        <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink">{total.value.toLocaleString('ru-RU')}</dd>
      </div>)}
    </dl>

    <div className="mt-9 grid items-start gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section aria-labelledby="overview-tables" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="overview-tables" className="text-lg font-semibold text-ink">Недавние таблицы</h2><Link href="/tables" className={TEXT_LINK}>Все таблицы</Link></div>
        {data.tables.length ? <ul className="space-y-3">{data.tables.slice(0, 4).map(table => <li key={table.id}>
          <Link href={`/tables/${encodeURIComponent(table.id)}`} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-sand-200 bg-white p-4 transition-colors hover:border-sage-300 hover:bg-sand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-ink-soft"><ShellIcon name="table" className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-ink">{table.name}</span><span className="mt-1 block text-xs leading-relaxed text-ink-muted">Записей: {table.rowCount.toLocaleString('ru-RU')} · Полей: {table.fieldCount}<span className="mt-0.5 block">Изменена {updatedDate(table.updatedAt)}</span></span></span>
            <span aria-hidden="true" className="shrink-0 text-ink-muted group-hover:text-ink">→</span>
          </Link>
        </li>)}</ul> : <div className="rounded-2xl border border-dashed border-sand-300 bg-sand-50 px-5 py-7"><p className="text-sm font-medium text-ink">Таблиц пока нет</p><p className="mt-2 text-sm leading-relaxed text-ink-soft">{permissions.edit ? 'Данные можно загрузить из файла или добавить вручную. Каждая таблица остаётся доступна для редактирования.' : 'Таблицы появятся здесь, когда владелец или редактор добавит данные.'}</p>{permissions.edit ? <Link href="/import" className={`${SECONDARY} mt-4`}>Загрузить Excel или CSV</Link> : null}</div>}
        {permissions.edit ? <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3"><Link href="/import" className={TEXT_LINK}>Загрузить таблицу</Link><Link href="/templates" className={TEXT_LINK}>Выбрать готовый сценарий</Link></div> : null}
      </section>

      <section aria-labelledby="overview-apps" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="overview-apps" className="text-lg font-semibold text-ink">Приложения пространства</h2><Link href="/apps" className={TEXT_LINK}>Все приложения</Link></div>
        {data.apps.length ? <>
          <p className="mb-3 text-xs leading-relaxed text-ink-muted">Опубликовано: {published}{pending ? ` · Требуют проверки: ${pending}` : ''}</p>
          <ul className="space-y-3">{data.apps.slice(0, 3).map(app => <li key={app.id} className="rounded-2xl border border-sand-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-semibold text-ink">{app.name}</h3><span className={`rounded-md px-2 py-1 text-xs ${!app.published || app.hasUnpublishedChanges ? 'bg-sand-100 text-ink-soft' : 'bg-sage-50 text-sage-700'}`}>{!app.published ? 'Черновик' : app.hasUnpublishedChanges ? 'Есть изменения' : 'Опубликовано'}</span></div>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">{!app.published ? 'Доступно в кабинете. Рабочая ссылка появится после публикации.' : app.hasUnpublishedChanges ? 'Пользователи видят предыдущую опубликованную версию.' : 'Рабочая ссылка доступна пользователям с настроенными правами.'}</p>
            <div className="mt-4 flex flex-wrap gap-2"><Link href={`/apps/${encodeURIComponent(app.id)}`} className={SECONDARY}>{permissions.edit ? 'Настроить' : 'Посмотреть настройки'}</Link>{app.published ? <Link href={`/a/${encodeURIComponent(app.slug)}`} className={SECONDARY}>Открыть приложение<span aria-hidden="true">↗</span></Link> : null}</div>
          </li>)}</ul>
        </> : <div className="rounded-2xl border border-dashed border-sand-300 bg-sand-50 px-5 py-7"><p className="text-sm font-medium text-ink">Приложений пока нет</p><p className="mt-2 text-sm leading-relaxed text-ink-soft">{permissions.edit ? 'Таблицы хранят данные. Приложение даёт клиентам и сотрудникам свои экраны и действия поверх этих данных.' : 'Когда приложение будет подготовлено, здесь появятся его настройки и рабочая ссылка.'}</p>{permissions.edit ? <Link href={data.tables.length ? `/tables/${encodeURIComponent(data.tables[0]!.id)}` : '/setup'} className={`${SECONDARY} mt-4`}>{data.tables.length ? 'Выбрать таблицу для приложения' : 'Начать настройку'}</Link> : null}</div>}
      </section>
    </div>

    <section aria-label="Другие разделы пространства" className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-sand-200 pt-5">
      <Link href="/messages" className={`${TEXT_LINK} inline-flex items-center gap-2`}><ShellIcon name="chat" className="size-4" />Сообщения клиентов</Link>
      {permissions.manageTeam ? <Link href="/team" className={`${TEXT_LINK} inline-flex items-center gap-2`}><ShellIcon name="users" className="size-4" />Команда и доступ</Link> : null}
      <Link href="/usage" className={TEXT_LINK}>Тариф и использование</Link>
    </section>
  </main>
}
