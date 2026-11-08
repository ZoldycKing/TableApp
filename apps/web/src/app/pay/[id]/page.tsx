import { db, payments } from '@tableapp/db'
import { PLANS, type PlanId } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { ConfirmTestPayment } from '@/components/confirm-test-payment'
import { paymentsMode } from '@/lib/payments/provider'
import { requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

/**
 * Страница проверочного контура оплаты.
 *
 * Стоит вместо платёжной страницы провайдера и существует только при
 * `PAYMENTS_MODE=test`. В рабочем виде её нет: сюда человека отправляет
 * настоящий провайдер, а не мы.
 *
 * Нужна, чтобы пройти весь путь — создание платежа, подтверждение,
 * продление срока, возврат — не трогая настоящих денег и не дожидаясь
 * договора с банком.
 */

export const metadata = { ...PRIVATE_PAGE, title: 'Оплата заказа' }
export const dynamic = 'force-dynamic'

const money = new Intl.NumberFormat('ru-RU')

export default async function TestPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  if (paymentsMode() !== 'test') notFound()

  const member = await requireMember()
  const { id } = await params

  const [payment] = await db.select().from(payments).where(eq(payments.id, id)).limit(1)
  // Чужой платёж не показываем даже проверочный: пространство у каждого своё.
  if (!payment || payment.workspaceId !== member.workspaceId) notFound()

  const plan = PLANS[payment.plan as PlanId]

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
        Проверочный контур. Денег не списывается, настоящая оплата здесь
        не проверяется — только наша половина: подтверждение, продление срока
        и возврат.
      </p>

      <h1 className="mt-6 text-xl font-semibold tracking-tight">
        Оплата тарифа «{plan?.name ?? payment.plan}»
      </h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        {money.format(payment.amount / 100)} ₽ за {payment.months} мес. Платёж{' '}
        {payment.status === 'pending' ? 'ожидает подтверждения' : `в состоянии «${payment.status}»`}.
      </p>

      <ConfirmTestPayment id={payment.id} done={payment.status !== 'pending'} />
    </main>
  )
}
