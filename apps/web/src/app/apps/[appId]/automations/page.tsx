import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { APP_TIME_ZONE } from '@tableapp/schema'
import { AppChrome } from '@/components/app-chrome'
import { StockAutomationPanel } from '@/components/stock-automation-panel'
import { listMemberships, requireWorkspaceMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'
import { loadStockAutomation } from '@/lib/stock-automation'

export const metadata = { ...PRIVATE_PAGE, title: 'Автоматизация склада' }
export const dynamic = 'force-dynamic'

export default async function StockAutomationPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params
  const member = await requireWorkspaceMember()
  if (member.role !== 'owner') redirect('/apps')
  const [state, memberships] = await Promise.all([
    loadStockAutomation({ workspaceId: member.workspaceId, appId }), listMemberships(member.userId),
  ])
  if (!state) notFound()
  const { automation, columns, inventory, taskTable } = state
  const timeZone = automation?.timeZone ?? APP_TIME_ZONE
  const formatTime = (date: Date) => new Intl.DateTimeFormat('ru-RU', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(date)
  return <AppChrome member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }} memberships={memberships} activeWorkspaceId={member.workspaceId}>
    <main className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/apps" className="text-sm text-ink-soft underline underline-offset-4">← К приложениям</Link>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">Автоматизация склада</h1>
      <p className="mb-6 mt-1 text-sm text-ink-soft">{state.name}</p>
      <StockAutomationPanel appId={appId} columns={columns} itemTableId={inventory?.tables.items ?? null} taskTable={taskTable}
        settings={automation ? { minimumFieldId: automation.minimumFieldId, timeZone, localTime: automation.localTime, nextRunAt: automation.nextRunAt ? formatTime(automation.nextRunAt) : null } : undefined}
        runs={state.runs.map(run => ({ id: run.id, trigger: run.trigger, status: run.status, time: formatTime(run.scheduledFor),
          checked: run.checked, createdTasks: run.createdTasks, attempts: run.attempts, error: run.error }))} />
    </main>
  </AppChrome>
}
