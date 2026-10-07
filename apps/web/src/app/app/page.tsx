import { redirect } from 'next/navigation'
import { StartScreen } from '@/components/start-screen'
import { firstTableId } from '@/lib/queries'
import { AppChrome } from '@/components/app-chrome'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = PRIVATE_PAGE

// Страница читает базу на каждом запросе: список таблиц меняется в рантайме,
// и запекать редирект на этапе сборки нельзя.
export const dynamic = 'force-dynamic'

export default async function WorkspaceHomePage() {
  const member = await requireMember()
  const tableId = await firstTableId(member.workspaceId)
  if (tableId) redirect(`/t/${tableId}`)
  return (
    <AppChrome
      member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }}
      memberships={await listMemberships(member.userId)}
      activeWorkspaceId={member.workspaceId}
    >
      <StartScreen />
    </AppChrome>
  )
}
