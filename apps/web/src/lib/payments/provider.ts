/**
 * Провайдер платежей.
 *
 * Между подпиской и провайдером стоит прослойка, и это не украшение: пока
 * договор не подписан, ключей нет, а проверять логику подписки надо уже
 * сейчас. Поэтому реализаций три, и переключает их окружение:
 *
 * | `PAYMENTS_MODE` | что делает |
 * | --- | --- |
 * | не задан | отказывает: «приём оплаты не подключён» — это рабочее состояние |
 * | `test`   | проверочный контур без денег: платёж «подтверждается» вручную |
 * | `yookassa` | настоящий API ЮKassa, нужны `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY` |
 *
 * Проверочный контур нужен, чтобы пройти весь путь — создание платежа,
 * уведомление, продление срока, возврат — не трогая настоящих денег.
 * Он **не** доказывает, что настоящая интеграция работает: это разные вещи,
 * и в отчёте они не склеиваются.
 */

export type PaymentIntent = {
  /** Наш идентификатор платежа. Он же ключ идемпотентности у провайдера. */
  id: string
  /** Копейки: целым числом, чтобы не складывать рубли дробями. */
  amount: number
  currency: string
  description: string
  returnUrl: string
}

export type ProviderPayment = {
  providerId: string
  /**
   * `refunded` — вернули всё. Частичный возврат сюда не попадает: он
   * приезжает как `succeeded` с непустым `refunded`, и подписку не трогает —
   * см. `decide`.
   */
  status: 'pending' | 'succeeded' | 'canceled' | 'refunded'
  /** Сколько вернули копейками. Ноль — не возвращали. */
  refunded?: number
  /** Куда отправить человека платить. У подтверждённого платежа его нет. */
  confirmationUrl: string | null
  /** Сумма, как её видит провайдер: сверяем с тем, что просили. */
  amount: number
  currency: string
  at: Date
}

export type Provider = {
  name: 'yookassa' | 'test'
  create(intent: PaymentIntent): Promise<ProviderPayment>
  /** Правда о платеже. Уведомлению верить нельзя — оно лишь повод спросить. */
  fetch(providerId: string): Promise<ProviderPayment | null>
}

export class PaymentsOffline extends Error {
  constructor() {
    super('Приём оплаты не подключён')
  }
}

export function paymentsMode(): 'off' | 'test' | 'yookassa' {
  const mode = process.env.PAYMENTS_MODE?.trim().toLowerCase()
  if (mode === 'test') return 'test'
  if (mode === 'yookassa') {
    return process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY ? 'yookassa' : 'off'
  }
  return 'off'
}

/** Текущий провайдер или `null`, когда приём оплаты не подключён. */
export function provider(): Provider | null {
  const mode = paymentsMode()
  if (mode === 'yookassa') return yookassa()
  if (mode === 'test') return testProvider()
  return null
}

// --- ЮKassa -----------------------------------------------------------------

const API = 'https://api.yookassa.ru/v3'

/**
 * Боевой провайдер.
 *
 * Авторизация — basic с идентификатором магазина и секретным ключом,
 * идемпотентность — заголовком `Idempotence-Key`: повтор того же запроса
 * с тем же ключом не создаёт второй платёж. Статусы у ЮKassa свои
 * (`pending`, `waiting_for_capture`, `succeeded`, `canceled`) — приводим
 * их к своим, чтобы остальной код не знал про чужой словарь.
 */
function yookassa(): Provider {
  const auth = Buffer.from(
    `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`,
  ).toString('base64')

  const headers = (idempotence?: string): Record<string, string> => ({
    authorization: `Basic ${auth}`,
    'content-type': 'application/json',
    ...(idempotence ? { 'Idempotence-Key': idempotence } : {}),
  })

  return {
    name: 'yookassa',

    async create(intent) {
      const response = await fetch(`${API}/payments`, {
        method: 'POST',
        headers: headers(intent.id),
        body: JSON.stringify({
          amount: { value: rubles(intent.amount), currency: intent.currency },
          capture: true,
          confirmation: { type: 'redirect', return_url: intent.returnUrl },
          description: intent.description,
          // По метаданным уведомление находит нашу запись, даже если
          // идентификатор провайдера почему-то не сохранился.
          metadata: { paymentId: intent.id },
        }),
      })

      if (!response.ok) {
        throw new Error(`ЮKassa отказала при создании платежа: ${response.status}`)
      }
      return toPayment(await response.json())
    },

    async fetch(providerId) {
      const response = await fetch(`${API}/payments/${providerId}`, { headers: headers() })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`ЮKassa не ответила о платеже: ${response.status}`)
      return toPayment(await response.json())
    },
  }
}

function rubles(kopecks: number): string {
  return (kopecks / 100).toFixed(2)
}

function toPayment(raw: unknown): ProviderPayment {
  const payment = raw as {
    id: string
    status: string
    paid?: boolean
    refunded_amount?: { value?: string }
    amount?: { value?: string; currency?: string }
    confirmation?: { confirmation_url?: string }
    created_at?: string
    captured_at?: string
  }

  const amount = Math.round(Number(payment.amount?.value ?? '0') * 100)
  const refunded = Math.round(Number(payment.refunded_amount?.value ?? '0') * 100)

  /*
   * Возврат считается полным, только если вернули всю сумму. Частичный
   * возврат — отдельная история: он не отменяет оплаченный срок, и решать,
   * что с ним делать, должен человек, а не наша догадка.
   */
  const status: ProviderPayment['status'] =
    refunded > 0 && refunded >= amount
      ? 'refunded'
      : payment.status === 'succeeded'
        ? 'succeeded'
        : payment.status === 'canceled'
          ? 'canceled'
          : 'pending'

  return {
    providerId: payment.id,
    status,
    refunded,
    confirmationUrl: payment.confirmation?.confirmation_url ?? null,
    amount,
    currency: payment.amount?.currency ?? 'RUB',
    at: new Date(payment.captured_at ?? payment.created_at ?? Date.now()),
  }
}

// --- Проверочный контур ------------------------------------------------------

/**
 * Провайдер без денег.
 *
 * Платежи живут в памяти процесса и подтверждаются вручную — страницей
 * `/pay/<id>`, которая работает только в этом режиме. Этого хватает, чтобы
 * проверить всё наше: ключ идемпотентности, уведомление, продление срока,
 * повтор уведомления, возврат.
 */
type Fake = ProviderPayment & { id: string }

const fakes: Map<string, Fake> = ((globalThis as Record<string, unknown>).__tableappFakePayments ??=
  new Map<string, Fake>()) as Map<string, Fake>

function testProvider(): Provider {
  return {
    name: 'test',

    async create(intent) {
      const existing = fakes.get(intent.id)
      // Тот же ключ — тот же платёж: именно это обещает идемпотентность.
      if (existing) return existing

      const made: Fake = {
        id: intent.id,
        providerId: `test_${intent.id}`,
        status: 'pending',
        confirmationUrl: `/pay/${intent.id}`,
        amount: intent.amount,
        currency: intent.currency,
        at: new Date(),
      }
      fakes.set(intent.id, made)
      return made
    },

    async fetch(providerId) {
      for (const payment of fakes.values()) {
        if (payment.providerId === providerId) return payment
      }
      return null
    },
  }
}

/** Проверочный контур: «человек оплатил». Вызывается только страницей `/pay`. */
export function markTestPayment(
  id: string,
  status: ProviderPayment['status'],
  refunded?: number,
): ProviderPayment | null {
  const payment = fakes.get(id)
  if (!payment) return null
  payment.status = status
  payment.refunded = refunded ?? (status === 'refunded' ? payment.amount : 0)
  payment.at = new Date()
  payment.confirmationUrl = status === 'pending' ? payment.confirmationUrl : null
  return payment
}
