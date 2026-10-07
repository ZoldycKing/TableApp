import { NextResponse } from 'next/server'
import { paymentsMode } from '@/lib/payments/provider'
import { fromProvider } from '@/lib/payments/sender'
import { settlePayment } from '@/lib/payments/settle'

/**
 * Уведомления ЮKassa.
 *
 * Подписи у уведомлений нет — провайдер предлагает проверять их двумя
 * способами, и мы делаем оба: смотрим, с какого адреса пришёл запрос,
 * и запрашиваем состояние платежа у самого провайдера. Второе главное:
 * даже если кто-то обойдёт первое, тариф включит не присланное тело,
 * а ответ провайдера на наш собственный вопрос.
 *
 * Ответ всегда 200, если запрос вообще наш: провайдер повторяет доставку
 * сутки на любой другой код, а повторять ему нечего — мы уже сходили
 * за правдой сами. Ошибки видны в журнале, а не в коде ответа.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  if (paymentsMode() === 'off') {
    return NextResponse.json({ ok: false, error: 'Приём оплаты не подключён' }, { status: 404 })
  }

  const from = clientIp(request)
  if (!fromProvider(from)) {
    console.error('[payments] уведомление с чужого адреса', { from })
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  let body: { event?: string; object?: { id?: string; payment_id?: string } }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Нечитаемое тело' }, { status: 400 })
  }

  /*
   * У события возврата в объекте лежит идентификатор возврата, а нужный нам
   * платёж — в `payment_id`. У события платежа — наоборот.
   */
  const providerId = body.object?.payment_id ?? body.object?.id
  if (!providerId) return NextResponse.json({ ok: false, error: 'Нет платежа' }, { status: 400 })

  const settled = await settlePayment(providerId)
  if (!settled.ok) {
    console.error('[payments] уведомление не применено', { providerId, reason: settled.reason })
    // Провайдеру отвечаем 200: повторять нечего, правду мы уже спросили.
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')?.trim() ?? ''
}
