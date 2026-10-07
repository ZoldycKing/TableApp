import { authEvents, db, sessions, staffSessions, users } from '@tableapp/db'
import { desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { AppChrome } from '@/components/app-chrome'
import { SecurityPanel } from '@/components/security-panel'
import { currentMember, currentSessionId } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

export const dynamic = 'force-dynamic'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = { title: 'Безопасность', ...PRIVATE_PAGE }

export default async function SecurityPage() {
  const member = await currentMember()
  if (!member) redirect('/login')

  const current = await currentSessionId()

  const [user] = await db.select().from(users).where(eq(users.id, member.userId)).limit(1)

  const devices = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, member.userId))
    .orderBy(desc(sessions.createdAt))

  const staff = await db
    .select()
    .from(staffSessions)
    .where(eq(staffSessions.email, member.email))
    .orderBy(desc(staffSessions.createdAt))

  const log = await db
    .select()
    .from(authEvents)
    .where(eq(authEvents.email, member.email))
    .orderBy(desc(authEvents.createdAt))
    .limit(30)

  return (
    <AppChrome member={member}>
      <SecurityPanel
        currentSessionId={current}
        totpEnabled={Boolean(user?.totpEnabledAt)}
        recoveryLeft={user?.recoveryCodes?.length ?? 0}
        devices={devices.map((row) => ({
          id: row.id,
          userAgent: row.userAgent,
          ip: row.ip,
          createdAt: row.createdAt.toISOString(),
          kind: 'member' as const,
        }))}
        staffDevices={staff.map((row) => ({
          id: row.id,
          userAgent: row.userAgent,
          ip: row.ip,
          createdAt: row.createdAt.toISOString(),
          kind: 'staff' as const,
        }))}
        log={log.map((row) => ({
          id: row.id,
          kind: row.kind,
          circuit: row.circuit,
          ip: row.ip,
          createdAt: row.createdAt.toISOString(),
        }))}
      />
    </AppChrome>
  )
}
