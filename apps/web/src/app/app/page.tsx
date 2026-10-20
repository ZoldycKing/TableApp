import { redirect } from 'next/navigation'
import { AppChrome } from '@/components/app-chrome'
import { BusinessOverview } from '@/components/business-overview'
import { loadBusinessOverview } from '@/lib/business-overview-data'
import { currentAccount, currentMember, listMemberships } from '@/lib/session'
import { EmptyAccount } from '@/components/empty-account'
import { PRIVATE_PAGE } from '@/lib/seo'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = { title: 'Личный кабинет', ...PRIVATE_PAGE }

// The selected business, live table counts and publication state are request-bound.
export const dynamic = 'force-dynamic'

export default async function WorkspaceHomePage() {
  const member = await currentMember()
  if (!member) {
    const account = await currentAccount()
    if (!account) redirect('/login')
    return <EmptyAccount email={account.email} />
  }
  const [overview, memberships] = await Promise.all([
    loadBusinessOverview(),
    listMemberships(member.userId),
  ])
  if (!overview) redirect('/login')
  return (
    <AppChrome
      member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }}
      memberships={memberships}
      activeWorkspaceId={member.workspaceId}
    >
      <BusinessOverview data={overview} />
    </AppChrome>
  )
}
