'use server'

import {
  apps,
  appUsers,
  authTokens,
  db,
  sessions,
  staffSessions,
  users,
  workspaceMembers,
  workspaces,
} from '@tableapp/db'
import { appSchema, newId } from '@tableapp/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import {
  STAFF_SESSION_COOKIE,
  MAX_CODE_ATTEMPTS,
  MEMBER_SESSION_COOKIE,
  SESSION_TTL_MS,
  TOKEN_TTL_MS,
  createCode,
  createToken,
  expiresAt,
  hashCode,
  hashToken,
  isExpired,
  isValidEmail,
  normalizeCode,
  normalizeEmail,
} from '@/lib/auth'
import {
  type AuthToken,
  completeStaffLogin,
  endChallenge,
  findChallengeToken,
  forgetOldTokens,
  logAuth,
  originUrl,
  requestIp,
  startChallenge,
  throttled,
  userAgent,
  markDelivered,
  verifyCode,
} from '@/lib/auth-challenge'
import { PER_EMAIL, PER_IP, takeAttempt } from '@/lib/auth-rate'
import { maySendAppCode } from '@/lib/app-roles'
import { mailHintFor, sendMagicLink, type MailResult } from '@/lib/mailer'
import { hashRecoveryCode, verifyTotp } from '@/lib/totp'
import { questionAppFor } from '@/lib/app-session'

export type LoginIntent = 'owner' | 'staff'

/** Куда человек попадает после подтверждения почты. */
export type LoginOutcome =
  | { ok: true; go: 'totp' }
  | { ok: true; go: 'workspace' }
  | { ok: true; go: 'apps' }
  | { ok: true; go: 'nowhere' }
  | { ok: false; error: string }

export type LoginRequestResult =
  /**
   * `via` говорит, куда делся код. `sent` — письмо ушло провайдеру;
   * `console` — почта не настроена, код напечатан в консоль сервера
   * (так проходится разработка). Обещать «отправили», когда письмо
   * не ушло, нельзя: человек будет ждать его и обновлять ящик.
   */
  | { ok: true; delivered: boolean; hint: string | null; via: 'sent' | 'console' }
  | { ok: false; error: string; retry?: boolean }

/**
 * Один ответ на оба входа.
 *
 * Письмо не ушло — об этом говорится прямо, а созданный код удаляется.
 * Он никому не достался, и оставлять его значит держать в базе живой ключ
 * и расходовать лимит запросов человека на нашей же неисправности.
 *
 * Про существование аккаунта ответ не говорит ничего: отказ один и тот же
 * для знакомого и незнакомого адреса.
 */
async function replyToRequest(result: MailResult, tokenId: string): Promise<LoginRequestResult> {
  if (result.delivered) {
    await markDelivered(tokenId)
    return { ok: true, delivered: true, hint: null, via: 'sent' }
  }

  if (result.via === 'console') {
    // Код напечатан в консоли сервера — для разработки это и есть доставка.
    await markDelivered(tokenId)
    return { ok: true, delivered: false, hint: mailHintFor(result), via: 'console' }
  }

  /*
   * Письмо не ушло. Код оставляем жить: отправка могла завершиться позже
   * нашего предела ожидания, и тогда человек получит письмо — пусть код
   * в нём работает. В лимит выданных кодов он не попадёт, потому что
   * отметки о доставке у него нет.
   */
  const why = mailHintFor(result)
  return {
    ok: false,
    retry: true,
    error: why
      ? `Письмо не отправлено: ${why}. Попробуйте ещё раз.`
      : 'Письмо не отправлено — почтовый сервис не ответил. Попробуйте ещё раз через минуту.',
  }
}

/**
 * Частота попыток: отдельный рубеж перед лимитом выданных кодов.
 *
 * Занимается до всякой работы — иначе два одновременных запроса оба ушли бы
 * отправлять письмо. Ответ одинаков для знакомого и незнакомого адреса:
 * по нему нельзя узнать, есть ли такой аккаунт.
 */
async function tooOften(email: string, ip: string): Promise<string | null> {
  const byEmail = takeAttempt(`email:${email}`, PER_EMAIL)
  if (!byEmail.ok) return `Слишком часто. Повторите через ${byEmail.retryAfterSec} с.`

  const byIp = takeAttempt(`ip:${ip}`, PER_IP)
  if (!byIp.ok) return `Слишком много запросов с этого адреса. Повторите через ${byIp.retryAfterSec} с.`

  return null
}

/** Запрос ссылки для входа в приложение. */
export async function requestAppLoginAction(slug: string, rawEmail: string, purpose: 'default' | 'question' = 'default'): Promise<LoginRequestResult> {
  if (purpose !== 'default' && purpose !== 'question') return { ok: false, error: 'Неизвестный способ входа' }
  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) return { ok: false, error: 'Введите корректный адрес почты' }

  const [record] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!record?.published) return { ok: false, error: 'Приложение не опубликовано' }

  const parsed = appSchema.safeParse(record.published)
  if (!parsed.success) return { ok: false, error: 'Приложение собрано с ошибкой' }
  const app = parsed.data
  if (purpose === 'question' && !await questionAppFor(slug)) return { ok: false, error: 'Вопросы этому бизнесу сейчас недоступны' }

  const ip = await requestIp()
  const often = await tooOften(email, ip)
  if (often) return { ok: false, error: often, retry: true }
  if (await throttled(email, ip)) {
    return { ok: false, error: 'Слишком много запросов. Попробуйте через пятнадцать минут.' }
  }
  await forgetOldTokens()

  /*
   * В открытое приложение входит любой: адреса клиентов заранее не известны,
   * и ждать, пока владелец внесёт каждого, значит не пустить человека в его
   * собственный кабинет. Что он там увидит, решают роли и правило на строки,
   * а не сам факт входа.
   */
  if (app.accessMode === 'allowlist' && purpose !== 'question') {
    const [existing] = await db
      .select({ id: appUsers.id, roleId: appUsers.roleId })
      .from(appUsers)
      .where(and(eq(appUsers.appId, record.id), eq(appUsers.email, email)))
      .limit(1)

    if (!maySendAppCode(app, email, existing?.roleId ?? null)) {
      /*
       * Ответ такой же, как при успехе. Прежний «этого адреса нет в списке»
       * подтверждал, какие адреса в списке есть, — по нему можно было собрать
       * состав команды. Постороннего адреса не появляется и в базе приложения.
       */
      return { ok: true, delivered: true, hint: null, via: 'sent' }
    }

    if (!existing) {
      await db.insert(appUsers).values({ id: newId('appUser'), appId: record.id, email, name: null })
    }
  }

  const tokenId = newId('token')
  const { token, hash } = createToken()
  const code = createCode()
  const challengeId = await startChallenge()

  await db.insert(authTokens).values({
    id: tokenId,
    email,
    tokenHash: hash,
    codeHash: hashCode(tokenId, code),
    challengeId,
    requestIp: ip,
    purpose: 'app_login',
    ...(purpose === 'question' ? { intent: 'question' } : {}),
    appId: record.id,
    expiresAt: expiresAt(TOKEN_TTL_MS),
  })

  const link = `${await originUrl()}/a/${slug}/auth?token=${token}`
  const businessName = (await (await import('@/lib/business-profile')).loadBusinessProfile(app.workspaceId))?.name ?? app.name
  const result = await sendMagicLink({
    to: email,
    subject: `Вход в «${businessName}»`,
    link,
    code,
    appName: businessName,
  })
  await logAuth(email, 'code_sent', 'staff')

  return replyToRequest(result, tokenId)
}

/** Обмен токена на сессию. Токен одноразовый: повторный переход не сработает. */
export async function consumeAppToken(slug: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const [record] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!record) return { ok: false, error: 'Приложение не найдено' }

  const [found] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.purpose, 'app_login')))
    .limit(1)

  if (!found || found.appId !== record.id) return { ok: false, error: 'Ссылка недействительна' }
  if (found.consumedAt) return { ok: false, error: 'Ссылка уже использована' }
  if (isExpired(found.expiresAt)) return { ok: false, error: 'Срок действия ссылки истёк' }

  return completeStaffLogin(found)
}

/** Вход в приложение кодом из письма — в том же браузере, где его запросили. */
export async function consumeAppCodeAction(
  slug: string,
  rawCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const [record] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!record) return { ok: false, error: 'Приложение не найдено' }

  const found = await findChallengeToken('app_login')
  if (found && found.appId !== record.id) {
    return { ok: false, error: 'Код от другого приложения' }
  }

  const checked = await verifyCode(found, normalizeCode(rawCode))
  if (!checked.ok) return checked

  return completeStaffLogin(found!)
}

export async function signOutAppAction(): Promise<{ ok: true }> {
  const store = await cookies()
  const sessionId = store.get(STAFF_SESSION_COOKIE)?.value
  if (sessionId) {
    const [row] = await db
      .select({ email: staffSessions.email })
      .from(staffSessions)
      .where(eq(staffSessions.id, sessionId))
      .limit(1)
    await db.delete(staffSessions).where(eq(staffSessions.id, sessionId))
    if (row) await logAuth(row.email, 'signed_out', 'staff')
  }
  store.delete(STAFF_SESSION_COOKIE)
  return { ok: true }
}

// --- Вход участников команды -------------------------------------------------

export async function requestMemberLoginAction(
  rawEmail: string,
  intent: LoginIntent = 'owner',
): Promise<LoginRequestResult> {
  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) return { ok: false, error: 'Введите корректный адрес почты' }

  const ip = await requestIp()
  const often = await tooOften(email, ip)
  if (often) return { ok: false, error: often, retry: true }
  if (await throttled(email, ip)) {
    return { ok: false, error: 'Слишком много запросов. Попробуйте через пятнадцать минут.' }
  }
  await forgetOldTokens()

  const tokenId = newId('token')
  const { token, hash } = createToken()
  const code = createCode()
  const challengeId = await startChallenge()

  await db.insert(authTokens).values({
    id: tokenId,
    email,
    tokenHash: hash,
    codeHash: hashCode(tokenId, code),
    challengeId,
    requestIp: ip,
    purpose: 'workspace_login',
    intent,
    appId: null,
    expiresAt: expiresAt(TOKEN_TTL_MS),
  })

  const link = `${await originUrl()}/auth?token=${token}`
  const result = await sendMagicLink({ to: email, subject: 'Вход в TableApp', link, code })
  await logAuth(email, 'code_sent', 'member')

  return replyToRequest(result, tokenId)
}

/**
 * Обмен токена на сессию участника.
 * Первый вход неизвестного адреса заводит пользователя и его воркспейс:
 * в self-serve продукте регистрация — это и есть первый вход.
 */
export async function consumeMemberToken(token: string): Promise<LoginOutcome> {
  const [found] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.purpose, 'workspace_login')))
    .limit(1)

  if (!found) return { ok: false, error: 'Ссылка недействительна' }
  if (found.consumedAt) return { ok: false, error: 'Ссылка уже использована' }
  if (isExpired(found.expiresAt)) return { ok: false, error: 'Срок действия ссылки истёк' }

  return routeAfterVerification(found)
}

/**
 * Вход по коду с главной страницы. Выбор «сотрудник или владелец» — подсказка,
 * а не право: он решает только, что делать после того, как почта подтверждена.
 * Доступ по-прежнему держится на том, что владелец внёс адрес в список.
 */
export async function consumeMemberCodeAction(rawCode: string): Promise<LoginOutcome> {
  const found = await findChallengeToken('workspace_login')
  const checked = await verifyCode(found, normalizeCode(rawCode))
  if (!checked.ok) return checked

  return routeAfterVerification(found!)
}

/** Общее решение для кода и для ссылки: куда пускать подтверждённую почту. */
async function routeAfterVerification(token: AuthToken): Promise<LoginOutcome> {
  const intent = (token.intent === 'staff' ? 'staff' : 'owner') satisfies LoginIntent

  const [known] = await db.select().from(users).where(eq(users.email, token.email)).limit(1)

  /*
   * Второй фактор спрашивается после почты, но до выдачи сессии: попытка
   * остаётся неиспользованной и помечается сверенной, поэтому перехваченный
   * код из письма сам по себе вход не даёт.
   */
  if (known?.totpEnabledAt && known.totpSecret) {
    await db
      .update(authTokens)
      .set({ codeVerifiedAt: new Date() })
      .where(eq(authTokens.id, token.id))
    return { ok: true, go: 'totp' }
  }

  if (intent === 'staff') {
    const mine = await (await import('@/lib/customer-apps')).listAccessibleApps(token.email)
    if (mine.length > 0) {
      const done = await completeStaffLogin(token)
      return done.ok ? { ok: true, go: 'apps' } : { ok: false, error: done.error ?? 'Не удалось войти' }
    }

    // Почта подтверждена, значит человек узнаёт только про себя — можно сказать
    // прямо, что его ещё никуда не добавили, и не плодить пустых пространств.
    if (!known) {
      await db.update(authTokens).set({ consumedAt: new Date() }).where(eq(authTokens.id, token.id))
      await endChallenge()
      return { ok: true, go: 'nowhere' }
    }
  }

  const done = await completeMemberLogin(token)
  return done.ok ? { ok: true, go: 'workspace' } : { ok: false, error: done.error ?? 'Не удалось войти' }
}

/**
 * Приложения, куда сотрудника добавили. Смотрим и на список доступа, и на уже
 * заведённых пользователей приложения: человек мог входить до того, как список
 * поправили, и наоборот.
 */
export async function appsForStaff(email: string) {
  const current = await (await import('@/lib/app-session')).currentStaffEmail()
  if (!current || normalizeEmail(current) !== normalizeEmail(email)) return []
  return (await import('@/lib/customer-apps')).listAccessibleApps(current)
}

/**
 * Выдача сессии участника. Первый вход неизвестного адреса заводит пользователя
 * и его воркспейс: в self-serve продукте регистрация — это и есть первый вход.
 */
async function completeMemberLogin(found: AuthToken): Promise<{ ok: boolean; error?: string }> {
  const [existing] = await db.select().from(users).where(eq(users.email, found.email)).limit(1)
  const userId = existing?.id ?? newId('user')
  const sessionId = newId('session')
  const agent = await userAgent()
  const ip = await requestIp()

  await db.transaction(async (tx) => {
    await tx.update(authTokens).set({ consumedAt: new Date() }).where(eq(authTokens.id, found.id))

    if (!existing) {
      await tx.insert(users).values({ id: userId, email: found.email, name: null })
      const workspaceId = newId('workspace')
      await tx.insert(workspaces).values({
        id: workspaceId,
        name: `Воркспейс ${found.email.split('@')[0]}`,
        slug: `${found.email.split('@')[0]!.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${workspaceId.slice(4, 10)}`,
        ownerId: userId,
      })
      await tx.insert(workspaceMembers).values({
        workspaceId,
        userId,
        role: 'owner',
        acceptedAt: new Date(),
      })
    } else {
      // Приглашённый участник мог быть заведён заранее — принимаем приглашение.
      await tx
        .update(workspaceMembers)
        .set({ acceptedAt: new Date() })
        .where(and(eq(workspaceMembers.userId, userId), isNull(workspaceMembers.acceptedAt)))
    }

    await tx.insert(sessions).values({
      id: sessionId,
      userId,
      userAgent: agent,
      ip,
      lastSeenAt: new Date(),
      expiresAt: expiresAt(SESSION_TTL_MS),
    })
  })

  const store = await cookies()
  await logAuth(found.email, 'signed_in', 'member')

  store.set(MEMBER_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
  await endChallenge()

  return { ok: true }
}

export async function signOutMemberAction(): Promise<{ ok: true }> {
  const store = await cookies()
  const sessionId = store.get(MEMBER_SESSION_COOKIE)?.value
  if (sessionId) await db.delete(sessions).where(eq(sessions.id, sessionId))
  store.delete(MEMBER_SESSION_COOKIE)
  return { ok: true }
}

/**
 * Второй шаг входа: код из приложения-аутентификатора или резервный код.
 * Попытка берётся по куке браузера, поэтому пройти этот шаг можно только там,
 * где уже сверили код из письма.
 */
export async function consumeTotpAction(rawCode: string): Promise<LoginOutcome> {
  const token = await findChallengeToken('workspace_login')
  if (!token?.codeVerifiedAt) {
    return { ok: false, error: 'Попытка входа устарела. Начните заново.' }
  }
  if (token.consumedAt) return { ok: false, error: 'Этот вход уже завершён' }
  if (isExpired(token.expiresAt)) return { ok: false, error: 'Срок действия истёк. Начните заново.' }

  const [user] = await db.select().from(users).where(eq(users.email, token.email)).limit(1)
  if (!user?.totpSecret) return { ok: false, error: 'Второй фактор не настроен' }

  const input = rawCode.trim()
  const stored = user.recoveryCodes ?? []
  const asRecovery = hashRecoveryCode(input)

  if (verifyTotp(user.totpSecret, input)) {
    const done = await completeMemberLogin(token)
    return done.ok ? { ok: true, go: 'workspace' } : { ok: false, error: done.error ?? 'Не удалось войти' }
  }

  if (stored.includes(asRecovery)) {
    // Резервный код одноразовый: использованный сразу вычёркиваем из списка.
    await db
      .update(users)
      .set({ recoveryCodes: stored.filter((item) => item !== asRecovery) })
      .where(eq(users.id, user.id))
    await logAuth(token.email, 'recovery_used')

    const done = await completeMemberLogin(token)
    return done.ok ? { ok: true, go: 'workspace' } : { ok: false, error: done.error ?? 'Не удалось войти' }
  }

  await db
    .update(authTokens)
    .set({ attempts: token.attempts + 1 })
    .where(eq(authTokens.id, token.id))
  await logAuth(token.email, 'totp_failed')

  if (token.attempts + 1 >= MAX_CODE_ATTEMPTS) {
    return { ok: false, error: 'Слишком много попыток. Начните вход заново.' }
  }

  return { ok: false, error: 'Неверный код из приложения' }
}

/** «Выйти на всех устройствах» для сотрудника: закрывает все его сессии. */
export async function signOutStaffEverywhereAction(): Promise<{ ok: true; closed: number }> {
  const store = await cookies()
  const sessionId = store.get(STAFF_SESSION_COOKIE)?.value
  if (!sessionId) return { ok: true, closed: 0 }

  const [row] = await db
    .select({ email: staffSessions.email })
    .from(staffSessions)
    .where(eq(staffSessions.id, sessionId))
    .limit(1)

  if (!row) {
    store.delete(STAFF_SESSION_COOKIE)
    return { ok: true, closed: 0 }
  }

  const removed = await db
    .delete(staffSessions)
    .where(eq(staffSessions.email, row.email))
    .returning({ id: staffSessions.id })

  await logAuth(row.email, 'revoked', 'staff')
  store.delete(STAFF_SESSION_COOKIE)

  return { ok: true, closed: removed.length }
}
