import { db, users, workspaceMembers } from '@tableapp/db'
import { asc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { AppChrome } from '@/components/app-chrome'
import { TeamManager, type TeamRow } from '@/components/team-manager'
import { canAdminister, type MemberRole } from '@/lib/roles'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

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

  const chrome = {
    member: { email: member.email, workspaceName: member.workspaceName, role: member.role },
    memberships: await listMemberships(member.userId),
    activeWorkspaceId: member.workspaceId,
  }

  return (
    <AppChrome {...chrome}>
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Команда</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Участники воркспейса «{member.workspaceName}».
          </p>
        </div>
        <Link
          href="/app"
          className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
        >
          К таблицам
        </Link>
      </header>

      <TeamManager rows={team} canManage={canAdminister(member.role)} />
    </main>
    </AppChrome>
  )
}
