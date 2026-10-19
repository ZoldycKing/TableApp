import { apps, db, users, workspaceMembers } from '@tableapp/db'
import { asc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { AppChrome } from '@/components/app-chrome'
import { TeamManager, type TeamRow } from '@/components/team-manager'
import { canAdminister, type MemberRole } from '@/lib/roles'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { loadBusinessProfile } from '@/lib/business-profile'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = PRIVATE_PAGE

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const member = await requireMember()

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: workspaceMembers.role,
      acceptedAt: workspaceMembers.acceptedAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, member.workspaceId))
    .orderBy(asc(workspaceMembers.createdAt))

  const team: TeamRow[] = rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role as MemberRole,
    accepted: row.acceptedAt !== null,
    isSelf: row.userId === member.userId,
  }))

  const [applications, profile] = await Promise.all([
    db.select({ id: apps.id, name: apps.name }).from(apps).where(eq(apps.workspaceId, member.workspaceId)).orderBy(asc(apps.createdAt)),
    loadBusinessProfile(member.workspaceId),
  ])

  const chrome = {
    member: { email: member.email, workspaceName: member.workspaceName, role: member.role },
    memberships: await listMemberships(member.userId),
    activeWorkspaceId: member.workspaceId,
  }

  return (
    <AppChrome {...chrome}>
    <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Команда и доступ</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Участники и разрешения бизнеса «{profile?.name ?? member.workspaceName}».
          </p>
        </div>
        <Link
          href="/app"
          className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
        >
          К обзору бизнеса
        </Link>
      </header>

      <TeamManager rows={team} canManage={canAdminister(member.role)} />
      <section className="mt-8 border-t border-sand-200 pt-6" aria-labelledby="team-app-access">
        <h2 id="team-app-access" className="text-lg font-semibold text-ink">Работа в приложениях</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">Сотруднику можно открыть только рабочие экраны приложения. Доступ к кабинету и всем таблицам бизнеса для этого не требуется. Роли, экраны и доступные данные настраиваются в каждом приложении отдельно.</p>
        {applications.length ? <ul className="mt-4 divide-y divide-sand-200 rounded-xl border border-sand-200 bg-white">{applications.map(app => <li key={app.id}><Link href={`/apps/${encodeURIComponent(app.id)}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm outline-none hover:bg-sand-50 focus-visible:ring-2 focus-visible:ring-sage-400"><span className="min-w-0 break-words font-medium text-ink">{app.name}</span><span className="text-ink-muted">{member.role === 'viewer' ? 'Посмотреть настройки' : 'Настроить экраны и доступ'} <span aria-hidden="true">→</span></span></Link></li>)}</ul> : <p className="mt-4 text-sm text-ink-muted">После подготовки приложения здесь появится переход к настройкам его доступа.</p>}
      </section>
    </main>
    </AppChrome>
  )
}
