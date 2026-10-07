import { compose, type LetterKind } from './mail/letters'
import { deliver, mailConfigured } from './mail/transport'

/**
 * Отправка писем.
 *
 * Два режима, и разница между ними важна.
 *
 * Почта настроена — письмо уходит провайдеру, а код в журнал **не пишется**:
 * журналы читают и хранят дольше, чем живёт код, и оставлять его там значит
 * раздавать ключи от чужих кабинетов.
 *
 * Почта не настроена — код и ссылка печатаются в консоль сервера, и весь
 * сценарий входа проходится целиком. Это честнее заглушки, которая делает
 * вид, что письмо ушло. В production такое состояние — ошибка настройки,
 * и оно попадает в журнал как ошибка.
 */

export type MagicLinkMail = {
  to: string
  subject: string
  link: string
  /**
   * Код из того же письма: его вводят, когда письмо открыли не на том
   * устройстве. У приглашения кода нет — приглашённый не начинал вход
   * у себя в браузере, и привязывать его код не к чему.
   */
  code?: string
  appName?: string
  invitedBy?: string
  kind?: LetterKind
}

/**
 * Чем кончилась отправка.
 *
 * `via` различает два очень разных «не доставлено». `console` — почта
 * не настроена, код напечатан в консоль сервера, и вход проходится целиком:
 * так работает разработка. `failed` — почта настроена, но письмо не ушло,
 * и человеку нельзя говорить «отправили». Раньше оба случая выглядели
 * одинаково, и в рабочем виде человек ждал письма, которого не было.
 */
export type MailResult =
  | { delivered: true }
  | { delivered: false; via: 'console' | 'failed'; reason: string; link: string }

/**
 * Показывать ли причину тому, кто ждёт письмо.
 *
 * «Почта не настроена» и «сервис не принял пароль» — это состояние нашего
 * сервера, а не ответ человеку. В разработке подсказка экономит полчаса,
 * в рабочем виде она рассказывает постороннему, что у нас сломано,
 * и всё равно не помогает ему получить письмо.
 */
export function mailHintFor(result: MailResult): string | null {
  if (result.delivered) return null
  if (process.env.NODE_ENV === 'production') return null
  return result.reason
}

/** Причина словами человека, а не кодом провайдера. */
const WHY: Record<string, string> = {
  not_configured: 'почта не настроена',
  auth: 'почтовый сервис не принял логин или пароль приложения',
  connection: 'не удалось связаться с почтовым сервисом',
  rejected: 'почтовый сервис отклонил адрес отправителя или получателя',
  unknown: 'почтовый сервис вернул ошибку',
}

export async function sendMagicLink(mail: MagicLinkMail): Promise<MailResult> {
  const kind: LetterKind = mail.kind ?? (mail.appName ? 'app_sign_in' : 'sign_in')
  const letter = compose({
    kind,
    link: mail.link,
    code: mail.code,
    appName: mail.appName,
    invitedBy: mail.invitedBy,
  })

  if (!mailConfigured()) {
    printToConsole({ ...mail, subject: mail.subject || letter.subject })
    return {
      delivered: false,
      via: 'console',
      reason: 'SMTP_URL и MAIL_FROM не заданы — код и ссылка выведены в консоль сервера',
      link: mail.link,
    }
  }

  const outcome = await deliver({
    to: mail.to,
    subject: mail.subject || letter.subject,
    text: letter.text,
    html: letter.html,
  })

  if (outcome.ok) return { delivered: true }

  /*
   * В журнал — причина и адресат, но никогда не код и не ссылка: по ссылке
   * входят так же, как по коду.
   */
  console.error('[mail] не отправлено', {
    to: mail.to,
    kind,
    failure: outcome.failure.kind,
    detail: 'detail' in outcome.failure ? outcome.failure.detail : undefined,
  })

  return {
    delivered: false,
    via: 'failed',
    reason: WHY[outcome.failure.kind] ?? WHY.unknown!,
    link: mail.link,
  }
}

/**
 * Разработка без почтового сервиса: код в консоль.
 *
 * Отдельной функцией, чтобы было видно единственное место, где код вообще
 * попадает в вывод, и чтобы оно не могло сработать при настроенной почте.
 */
function printToConsole(mail: MagicLinkMail): void {
  console.log(
    [
      '',
      '─────────── ВХОД: КОД И ССЫЛКА ───────────',
      `кому:  ${mail.to}`,
      mail.appName ? `в:     ${mail.appName}` : '',
      `тема:  ${mail.subject}`,
      mail.code ? `код:   ${mail.code}` : '',
      `ссылка: ${mail.link}`,
      '────────────────────────────────────────',
      '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}
