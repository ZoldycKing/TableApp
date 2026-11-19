/**
 * Тексты писем.
 *
 * Письмо с кодом входа человек читает три секунды и в половине случаев —
 * с телефона в почтовом клиенте, который вырежет половину оформления.
 * Поэтому код крупно, ссылка рядом, и ничего между ними.
 *
 * Разметка простая нарочно: таблицы и inline-стили, потому что почтовые
 * клиенты до сих пор не умеют нормальный CSS. Картинок нет — они не грузятся
 * по умолчанию, и письмо без них должно оставаться целым.
 */

export type LetterKind = 'sign_in' | 'app_sign_in' | 'invite' | 'verify_intake'

const INK = '#15151A'
const MUTED = '#5B5A60'
const SAND = '#F6F5F2'
const BORDER = '#DAD7D1'
const ACCENT = '#3F6B5C'
const ON_ACCENT = '#FFFFFF'

function shell(body: string, footer: string): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px 12px;background:${SAND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${INK}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;margin:0 auto">
<tr><td style="padding:0 0 20px"><span style="font-size:17px;font-weight:700;letter-spacing:-0.2px">Scatta</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;padding:28px 24px">${body}</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:${MUTED}">${footer}</td></tr>
</table></body></html>`
}

function codeBlock(code: string): string {
  return `<div style="margin:20px 0;padding:14px;background:${SAND};border-radius:12px;text-align:center;font-size:30px;font-weight:700;letter-spacing:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${code}</div>`
}

function linkButton(link: string, label: string): string {
  return `<a href="${link}" style="display:inline-block;padding:12px 22px;background:${ACCENT};color:${ON_ACCENT};border-radius:10px;text-decoration:none;font-size:14px;font-weight:600">${label}</a>`
}

export type LetterInput = {
  kind: LetterKind
  /**
   * Куда ведёт ссылка из письма.
   *
   * Пустая строка — законное значение: у подтверждения заявки ссылки нет,
   * потому что заявка лежит в том браузере, где её заполнили.
   */
  link: string
  /** Шестизначный код: у приглашения его нет. */
  code?: string
  /** Название приложения — когда входят не в Scatta, а в кабинет фирмы. */
  appName?: string
  /** Кто пригласил: без этого приглашение читается как спам. */
  invitedBy?: string
}

export function compose(input: LetterInput): { subject: string; text: string; html: string } {
  const where = input.appName ? `«${input.appName}»` : 'Scatta'

  if (input.kind === 'invite') {
    const who = input.invitedBy ? `${input.invitedBy} приглашает` : 'Вас приглашают'
    return {
      subject: `Приглашение в ${where}`,
      text: `${who} вас в ${where}.\n\nОткройте ссылку, чтобы принять приглашение:\n${input.link}\n\nЕсли вы не ждали приглашения, просто удалите письмо.`,
      html: shell(
        `<p style="margin:0 0 8px;font-size:18px;font-weight:700">Приглашение в ${where}</p>
         <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED}">${who} вас присоединиться к работе.</p>
         ${linkButton(input.link, 'Принять приглашение')}`,
        'Если вы не ждали приглашения, просто удалите это письмо.',
      ),
    }
  }

  const intake = input.kind === 'verify_intake'
  const subject = intake ? 'Подтверждение заявки' : `Вход в ${where}`
  const lead = intake
    ? 'Код для подтверждения заявки. После него мы её примем и покажем вам в кабинете.'
    : 'Код для входа. Он действует пятнадцать минут.'

  /*
   * Ссылка есть не у всякого письма.
   *
   * У подтверждения заявки её нет намеренно: заявка лежит в том браузере,
   * где её заполнили, и переход по ссылке с телефона привёл бы человека
   * в пустой кабинет без своего заказа. Печатать при этом «Или откройте
   * ссылку:» и рисовать кнопку в никуда — хуже, чем не печатать ничего.
   */
  const hasLink = input.link.trim() !== ''

  // «Не запрашивали вход» в письме про заказ говорит не о том, что человек делал.
  const footer = intake
    ? 'Если вы не оставляли заявку, просто удалите это письмо — ничего не произойдёт.'
    : 'Если вы не запрашивали вход, просто удалите это письмо — ничего не произойдёт.'

  const lines = [input.code ? `Код: ${input.code}` : '', lead].filter(Boolean)
  if (hasLink) lines.push('', `Или откройте ссылку: ${input.link}`)
  lines.push('', footer)

  return {
    subject,
    text: lines.join('\n'),
    html: shell(
      `<p style="margin:0 0 8px;font-size:18px;font-weight:700">${subject}</p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED}">${lead}</p>
       ${input.code ? codeBlock(input.code) : ''}
       ${
         hasLink
           ? `<p style="margin:0 0 14px;font-size:13px;color:${MUTED}">Открыли письмо на том же устройстве? Нажмите:</p>
       ${linkButton(input.link, 'Войти')}`
           : `<p style="margin:0;font-size:13px;color:${MUTED}">Введите код на той же странице, где оставили заявку.</p>`
       }`,
      footer,
    ),
  }
}
