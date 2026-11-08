import Link from 'next/link'
import { AppChrome } from '@/components/app-chrome'
import { UsageReport } from '@/components/usage-report'
import { canAdminister } from '@/lib/roles'
import { listMemberships, requireWorkspaceMember as requireMember } from '@/lib/session'
import { workspaceUsageReport } from '@/lib/usage'
import { paymentsMode } from '@/lib/payments/provider'
import { paymentHistory, settleExpired, subscriptionFor } from '@/lib/payments/subscription'
import { SubscriptionPanel } from '@/components/subscription-panel'
import { PRIVATE_PAGE } from '@/lib/seo'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = { ...PRIVATE_PAGE, title: 'Тариф и лимиты' }

export const dynamic = 'force-dynamic'

/**
 * Страница расхода.
 *
 * Считается начисто при каждом открытии, а не берётся из снимка. Страницу
 * открывают редко и ровно затем, чтобы узнать точное число: показать здесь
 * пятиминутной давности значение — значит заставить человека гадать, почему
 * оно не сходится с тем, что он только что удалил.
 */
export default async function UsagePage() {
  const member = await requireMember()

  /*
   * Срок подписки проверяется при открытии страницы: отдельного расписания
   * у продукта пока нет, а показывать оплаченный тариф после окончания срока
   * нельзя. Потолки знают об этом и сами — см. `planFor` в `lib/limits.ts`.
   */
  await settleExpired(member.workspaceId)

  const [report, subscription, history] = await Promise.all([
    workspaceUsageReport(member.workspaceId),
    subscriptionFor(member.workspaceId),
    paymentHistory(member.workspaceId),
  ])

  const chrome = {
    member: { email: member.email, workspaceName: member.workspaceName, role: member.role },
    memberships: await listMemberships(member.userId),
    activeWorkspaceId: member.workspaceId,
  }

  return (
    <AppChrome {...chrome}>
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Тариф и лимиты</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Сколько занимает пространство «{member.workspaceName}».
            </p>
          </div>
          <Link
            href="/app"
            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]"
          >
            К обзору пространства
          </Link>
        </header>

        <UsageReport
          plan={report.plan}
          usage={{ ...report.usage, countedAt: report.usage.countedAt.toISOString() }}
          byTable={report.byTable}
          canRecount={canAdminister(member.role)}
        />

        <SubscriptionPanel
          subscription={{
            planId: subscription.plan.id,
            paidPlan: subscription.paidPlan,
            status: subscription.status,
            periodEnd: subscription.periodEnd?.toISOString() ?? null,
            mode: paymentsMode(),
            canPay: member.role === 'owner',
          }}
          history={history.map((payment) => ({
            ...payment,
            createdAt: payment.createdAt.toISOString(),
            paidAt: payment.paidAt?.toISOString() ?? null,
          }))}
        />
      </main>
    </AppChrome>
  )
}
