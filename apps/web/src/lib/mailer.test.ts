import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compose } from './mail/letters'

/**
 * Почтовый слой.
 *
 * Проверяем то, что нельзя увидеть глазами и легко сломать правкой: код входа
 * не попадает в журнал при настроенной почте, причина отказа различается
 * по коду провайдера, а повторная попытка не рассылает второй код.
 *
 * Провайдер подменён: настоящий SMTP в тестах означал бы сеть, таймауты
 * и зелёные тесты при выключенном интернете.
 */

const sendMail = vi.fn()

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}))

const env = { ...process.env }

beforeEach(async () => {
  vi.resetModules()
  sendMail.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const { resetTransport } = await import('./mail/transport')
  resetTransport()
})

afterEach(() => {
  process.env = { ...env }
  vi.restoreAllMocks()
})

function configure(): void {
  process.env.SMTP_URL = 'smtps://u%40example.ru:secret@smtp.example.ru:465'
  process.env.MAIL_FROM = 'u@example.ru'
  process.env.MAIL_FROM_NAME = 'Scatta'
}

function fault(code: string): Error & { code: string } {
  return Object.assign(new Error(`сбой ${code}`), { code })
}

const LETTER = {
  to: 'kto@example.ru',
  subject: 'Вход в Scatta',
  link: 'https://app.example.ru/auth?token=SEKRETNYY-TOKEN',
  code: '328823',
}

describe('код входа и журналы', () => {
  it('без настроенной почты код печатается в консоль — иначе войти нечем', async () => {
    delete process.env.SMTP_URL
    delete process.env.MAIL_FROM

    const printed: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      printed.push(args.join(' '))
    })

    const { sendMagicLink } = await import('./mailer')
    const result = await sendMagicLink(LETTER)

    expect(result.delivered).toBe(false)
    expect(sendMail).not.toHaveBeenCalled()
    // Сценарий входа должен проходиться целиком без почтового сервиса.
    expect(printed.join('\n')).toContain('328823')
    expect(printed.join('\n')).toContain('SEKRETNYY-TOKEN')
  })

  it('при настроенной почте код не печатается в консоль', async () => {
    configure()
    sendMail.mockResolvedValue({ messageId: '<1@example.ru>' })

    const printed: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      printed.push(args.join(' '))
    })

    const { sendMagicLink } = await import('./mailer')
    expect(await sendMagicLink(LETTER)).toEqual({ delivered: true })

    expect(printed.join('\n')).not.toContain('328823')
  })

  it('в журнал отказа идут адресат и причина, но не код и не ссылка', async () => {
    configure()
    sendMail.mockRejectedValue(fault('EAUTH'))

    const errors: unknown[][] = []
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args)
    })

    const { sendMagicLink } = await import('./mailer')
    const result = await sendMagicLink(LETTER)

    expect(result.delivered).toBe(false)

    const logged = JSON.stringify(errors)
    // По ссылке входят так же, как по коду: журналы живут дольше обоих.
    expect(logged).not.toContain('328823')
    expect(logged).not.toContain('SEKRETNYY-TOKEN')
    // Но чинить без адресата и причины нечего.
    expect(logged).toContain('kto@example.ru')
    expect(logged).toContain('auth')
  })
})

describe('повторные попытки', () => {
  it('обрыв связи повторяем', async () => {
    configure()
    sendMail.mockRejectedValueOnce(fault('ETIMEDOUT')).mockResolvedValue({ messageId: '<2@example.ru>' })

    const { sendMagicLink } = await import('./mailer')
    expect(await sendMagicLink(LETTER)).toEqual({ delivered: true })
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  it('отказ по паролю не повторяем — пароль не станет верным', async () => {
    configure()
    sendMail.mockRejectedValue(fault('EAUTH'))

    const { sendMagicLink } = await import('./mailer')
    await sendMagicLink(LETTER)
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  it('отказ по адресу не повторяем', async () => {
    configure()
    sendMail.mockRejectedValue(fault('EENVELOPE'))

    const { sendMagicLink } = await import('./mailer')
    await sendMagicLink(LETTER)
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  it('человеку объясняем причину словами, а не кодом провайдера', async () => {
    configure()
    sendMail.mockRejectedValue(fault('EAUTH'))

    const { sendMagicLink } = await import('./mailer')
    const result = await sendMagicLink(LETTER)

    expect(result.delivered).toBe(false)
    if (result.delivered) return
    expect(result.reason).not.toContain('EAUTH')
    expect(result.reason).toMatch(/пароль/i)
  })
})

describe('отправитель', () => {
  it('собирается из MAIL_FROM и имени', async () => {
    configure()
    sendMail.mockResolvedValue({ messageId: '<3@example.ru>' })

    const { sendMagicLink } = await import('./mailer')
    await sendMagicLink(LETTER)

    expect(sendMail.mock.calls[0]![0].from).toBe('Scatta <u@example.ru>')
  })

  it('без имени — один адрес', async () => {
    configure()
    delete process.env.MAIL_FROM_NAME
    sendMail.mockResolvedValue({ messageId: '<4@example.ru>' })

    const { sendMagicLink } = await import('./mailer')
    await sendMagicLink(LETTER)

    expect(sendMail.mock.calls[0]![0].from).toBe('u@example.ru')
  })
})

describe('письма', () => {
  it('код виден и в тексте, и в разметке', () => {
    const letter = compose({ kind: 'sign_in', link: 'https://x.ru/a', code: '123456' })
    expect(letter.text).toContain('123456')
    expect(letter.html).toContain('123456')
    expect(letter.subject).toBe('Вход в Scatta')
  })

  it('вход в приложение назван приложением, а не платформой', () => {
    // Человек входит в «Кабинет клиента», а про Scatta может не знать.
    const letter = compose({
      kind: 'app_sign_in',
      link: 'https://x.ru/a',
      code: '1',
      appName: 'Кабинет клиента',
    })
    expect(letter.subject).toContain('Кабинет клиента')
  })

  it('у приглашения кода нет и быть не должно', () => {
    // Приглашённый не начинал вход у себя в браузере: привязывать код не к чему.
    const letter = compose({ kind: 'invite', link: 'https://x.ru/a', invitedBy: 'Николай' })
    expect(letter.text).not.toMatch(/Код: \d/)
    expect(letter.text).toContain('Николай')
  })

  it('у письма всегда есть простой текст со ссылкой', () => {
    // Часть клиентов не показывает разметку, и спам-фильтры смотрят на текст.
    for (const kind of ['sign_in', 'app_sign_in', 'invite', 'verify_intake'] as const) {
      const letter = compose({ kind, link: 'https://x.ru/a', code: '000000' })
      expect(letter.text.length, kind).toBeGreaterThan(40)
      expect(letter.text, kind).toContain('https://x.ru/a')
      expect(letter.html, kind).toContain('<!doctype html>')
    }
  })

  it('без ссылки письмо её и не обещает', () => {
    /*
     * У подтверждения заказа ссылки нет: заявка лежит в том браузере, где её
     * заполнили. Пустое «Или откройте ссылку:» и кнопка в никуда — это письмо,
     * которое выглядит сломанным, а человек решит, что сломан заказ.
     */
    const letter = compose({ kind: 'verify_intake', link: '', code: '424242' })

    expect(letter.text).not.toContain('откройте ссылку')
    expect(letter.html).not.toContain('<a href=""')
    expect(letter.html).not.toContain('>Войти<')
    // Но сказать, что делать с кодом, всё равно надо.
    expect(letter.text).toContain('424242')
    expect(letter.html).toContain('той же странице')
  })

  it('в письме про заказ не спрашивают, запрашивали ли вы вход', () => {
    // Человек оставлял заявку, а не входил: чужая формулировка сбивает.
    const letter = compose({ kind: 'verify_intake', link: '', code: '1' })
    expect(letter.text).toContain('не оставляли заявку')
    expect(letter.text).not.toContain('не запрашивали вход')
  })
})

describe('ожидание провайдера ограничено', () => {
  it('молчащий сервис не держит форму входа дольше общего предела', async () => {
    /*
     * Так и было: три попытки по десять секунд держали человека у кнопки
     * «Отправляем…» почти сорок секунд, и он решал, что сломан сервис.
     */
    configure()
    sendMail.mockImplementation(() => new Promise(() => {}))

    const { DELIVERY_DEADLINE_MS } = await import('./mail/transport')
    const { sendMagicLink } = await import('./mailer')

    vi.useFakeTimers()
    const promise = sendMagicLink(LETTER)
    await vi.advanceTimersByTimeAsync(DELIVERY_DEADLINE_MS + 1_000)
    const result = await promise
    vi.useRealTimers()

    expect(result.delivered).toBe(false)
    if (result.delivered) return
    expect(result.via).toBe('failed')
    expect(DELIVERY_DEADLINE_MS).toBeLessThanOrEqual(12_000)
  })

  it('отправка без почты и отправка с ошибкой — разные ответы', async () => {
    // На первом вход всё равно проходится (код в консоли), на втором — нет.
    delete process.env.SMTP_URL
    delete process.env.MAIL_FROM
    const { sendMagicLink } = await import('./mailer')
    const console_ = await sendMagicLink(LETTER)
    expect(console_.delivered).toBe(false)
    if (!console_.delivered) expect(console_.via).toBe('console')

    configure()
    sendMail.mockRejectedValue(fault('EAUTH'))
    const { sendMagicLink: again } = await import('./mailer')
    const failed = await again(LETTER)
    expect(failed.delivered).toBe(false)
    if (!failed.delivered) expect(failed.via).toBe('failed')
  })
})
