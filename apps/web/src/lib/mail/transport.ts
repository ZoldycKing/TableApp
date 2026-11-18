import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Куда уходят письма.
 *
 * Между приложением и провайдером стоит одна маленькая прослойка, и это
 * не архитектурное украшение. Почтовый сервис меняют: сегодня личный ящик
 * для проверки, завтра свой домен и транзакционный провайдер. Переезд должен
 * стоить одной строки в окружении, а не правок по всему коду.
 *
 * Провайдер задаётся адресом подключения:
 *
 * ```
 * SMTP_URL=smtps://user%40yandex.ru:пароль-приложения@smtp.yandex.ru:465
 * MAIL_FROM=user@yandex.ru
 * MAIL_FROM_NAME=Scatta
 * ```
 *
 * `@` в логине внутри адреса пишется как `%40`, иначе разбор адреса
 * обрывается на нём. Отправитель почти у всех провайдеров обязан совпадать
 * с ящиком, под которым идёт авторизация: чужой адрес письмо не пропустит.
 */

export type Letter = {
  to: string
  subject: string
  /** Простой текст: его читают почтовые клиенты без картинок и спам-фильтры. */
  text: string
  html: string
}

/**
 * Почему письмо не ушло.
 *
 * Разбираем на причины намеренно: «не настроено» и «провайдер отказал» —
 * разные события. Первое нормально в разработке, второе надо видеть
 * в журнале и чинить.
 */
export type MailFailure =
  | { kind: 'not_configured' }
  | { kind: 'auth'; detail: string }
  | { kind: 'connection'; detail: string }
  | { kind: 'rejected'; detail: string }
  | { kind: 'unknown'; detail: string }

export type MailOutcome = { ok: true; id: string } | { ok: false; failure: MailFailure }

/**
 * Сколько ждём провайдера.
 *
 * Человек стоит у формы входа и смотрит на кнопку, поэтому счёт идёт
 * на секунды, а не на «сколько потребуется». Раньше было три попытки
 * по десять секунд на каждый этап — недоступный почтовый сервис держал
 * форму входа сорок секунд, и за это время человек успевал решить,
 * что сломан сам сервис.
 *
 * Три предела вместо одного: соединение, приветствие сервера и сама
 * передача письма отказывают по разным причинам и ждать их поровну незачем.
 */
const CONNECT_TIMEOUT_MS = 4_000
const GREETING_TIMEOUT_MS = 4_000
const SOCKET_TIMEOUT_MS = 8_000

/**
 * Сколько раз пробуем ещё.
 *
 * Только на обрыве связи: отказ по паролю или по адресу повторять
 * бессмысленно, а второе письмо с новым кодом сбило бы человека.
 */
const RETRIES = 1

/**
 * Общий предел на всю отправку со всеми попытками.
 *
 * Он главный: сумма внутренних таймаутов зависит от того, на каком этапе
 * провайдер замолчал, а человеку важно, что ожидание кончится. Дальше
 * этого срока ответ будет один — «не удалось отправить, попробуйте ещё раз».
 */
export const DELIVERY_DEADLINE_MS = 10_000

let cached: Transporter | null = null

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_URL && process.env.MAIL_FROM)
}

function transport(): Transporter {
  if (cached) return cached
  const url = new URL(process.env.SMTP_URL!)
  cached = nodemailer.createTransport({
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'smtps:' ? 465 : 587)),
    // `smtps:` — шифрование с первого байта, порт 465. `smtp:` — обычное
    // подключение с переходом на TLS, порт 587. Яндекс принимает оба.
    secure: url.protocol === 'smtps:',
    auth: url.username
      ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) }
      : undefined,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  })
  return cached
}

/** Ошибку провайдера приводим к нашим причинам: по коду, а не по тексту. */
export function classify(error: unknown): MailFailure {
  const fault = error as { code?: string; responseCode?: number; message?: string }
  const detail = fault?.message ?? String(error)
  const code = fault?.code ?? ''

  if (code === 'EAUTH' || fault?.responseCode === 535) return { kind: 'auth', detail }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(code)) {
    return { kind: 'connection', detail }
  }
  if (code === 'EENVELOPE' || fault?.responseCode === 550) return { kind: 'rejected', detail }
  return { kind: 'unknown', detail }
}

/**
 * Ожидание с пределом.
 *
 * Нужен именно он, а не только таймауты внутри библиотеки: зависнуть можно
 * и между этапами, а человеку у формы входа важно, что ожидание кончится
 * за известный срок. Отменить саму отправку мы не можем — письмо, если
 * оно всё-таки уйдёт, просто придёт позже, а код в нём тот же.
 */
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`почтовый сервис не ответил за ${ms} мс`), { code: 'ETIMEDOUT' })),
      ms,
    )
  })

  try {
    return await Promise.race([work, deadline])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function deliver(letter: Letter): Promise<MailOutcome> {
  if (!mailConfigured()) return { ok: false, failure: { kind: 'not_configured' } }

  const from = process.env.MAIL_FROM_NAME
    ? `${process.env.MAIL_FROM_NAME} <${process.env.MAIL_FROM}>`
    : process.env.MAIL_FROM!

  const started = Date.now()
  let last: MailFailure = { kind: 'unknown', detail: 'попыток не было' }

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const left = DELIVERY_DEADLINE_MS - (Date.now() - started)
    if (left <= 0) break

    try {
      const sent = await withDeadline(transport().sendMail({ from, ...letter }), left)
      return { ok: true, id: sent.messageId }
    } catch (error) {
      last = classify(error)
      // Пароль не примут и со второго раза, адрес не станет верным.
      if (last.kind !== 'connection') break
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }

  return { ok: false, failure: last }
}

/** Сбрасывается в тестах: окружение там меняют между проверками. */
export function resetTransport(): void {
  cached = null
}
