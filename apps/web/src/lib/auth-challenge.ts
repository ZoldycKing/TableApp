import { appUsers, authEvents, authTokens, db, staffSessions } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { cookies, headers } from 'next/headers'
import {
  CHALLENGE_COOKIE,
  MAX_CODE_ATTEMPTS,
  MAX_REQUESTS_PER_EMAIL,
  MAX_REQUESTS_PER_IP,
  SESSION_TTL_MS,
  STAFF_SESSION_COOKIE,
  THROTTLE_WINDOW_MS,
  TOKEN_TTL_MS,
  expiresAt,
  hashCode,
  hashesMatch,
  isExpired,
} from './auth'

/**
 * Подтверждение почты кодом: общая часть.
 *
 * Здесь лежит то, чем пользуются оба сценария, где человек доказывает, что
 * почта его: вход в приложение и подтверждение заявки от постороннего.
 * Вынесено в отдельный модуль не ради порядка, а чтобы у приёма заявок
 * не завёлся собственный вход со своими сроками, своим счётом попыток
 * и своей — неизбежно более слабой — проверкой кода.
 *
 * Модуль намеренно не серверное действие: серверное действие обязано
 * экспортировать только асинхронные функции, и общие куски пришлось бы
 * раскрывать наружу по одному.
 */

export type AuthToken = typeof authTokens.$inferSelect

export async function originUrl(): Promise<string> {
  const host = (await headers()).get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return process.env.APP_URL?.replace(/\/$/, '') ?? `${protocol}://${host}`
}

/** Адрес запросившего: за прокси реальный IP приезжает заголовком. */
export async function requestIp(): Promise<string> {
  const store = await headers()
  const forwarded = store.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || store.get('x-real-ip') || 'local'
}

/** Чем вошли: строку показываем человеку, поэтому не режем её в базе. */
export async function userAgent(): Promise<string | null> {
  return (await headers()).get('user-agent')
}

/**
 * Сколько кодов человек уже получил.
 *
 * Считаются только **доставленные** письма: отдельной таблицы не заводим,
 * письма с кодом и так пишутся в `auth_tokens`. Лимит на адрес закрывает
 * бомбардировку чужой почты, лимит на IP — перебор адресов.
 *
 * Неудачная отправка сюда не попадает намеренно. Лежащий почтовый сервис
 * не должен съедать лимит кодов: человек не виноват в нашей неисправности.
 * Частоту самих попыток ограничивает отдельный счётчик — `lib/auth-rate.ts`.
 */
export async function throttled(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - THROTTLE_WINDOW_MS)

  const [byEmail] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(authTokens)
    .where(and(eq(authTokens.email, email), eq(authTokens.delivered, true), gt(authTokens.createdAt, since)))

  if ((byEmail?.count ?? 0) >= MAX_REQUESTS_PER_EMAIL) return true

  const [byIp] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(authTokens)
    .where(and(eq(authTokens.requestIp, ip), eq(authTokens.delivered, true), gt(authTokens.createdAt, since)))

  return (byIp?.count ?? 0) >= MAX_REQUESTS_PER_IP
}

/** Письмо ушло: с этой минуты код считается выданным. */
export async function markDelivered(tokenId: string): Promise<void> {
  await db.update(authTokens).set({ delivered: true }).where(eq(authTokens.id, tokenId))
}

/** Просроченные попытки не нужны ни для чего, кроме счётчиков частоты. */
export async function forgetOldTokens(): Promise<void> {
  await db.delete(authTokens).where(lt(authTokens.expiresAt, new Date(Date.now() - THROTTLE_WINDOW_MS)))
}

/**
 * Привязка попытки к браузеру. Код принимаем только там, где вход начали:
 * письмо, пересланное коллеге или перехваченное, само по себе не пускает.
 */
export async function startChallenge(): Promise<string> {
  const challengeId = newId('challenge')
  const store = await cookies()
  store.set(CHALLENGE_COOKIE, challengeId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  })
  return challengeId
}

/** Попытка ищется по куке браузера, а не по самому коду: код короткий. */
export async function findChallengeToken(purpose: string): Promise<AuthToken | undefined> {
  const store = await cookies()
  const challengeId = store.get(CHALLENGE_COOKIE)?.value
  if (!challengeId) return undefined

  const [found] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.challengeId, challengeId), eq(authTokens.purpose, purpose)))
    .limit(1)

  return found
}

export async function endChallenge(): Promise<void> {
  const store = await cookies()
  store.delete(CHALLENGE_COOKIE)
}

/**
 * Запись в журнал входов. Пишем и удачу, и промах: чужая попытка заметна
 * только рядом со своими, а владелец должен увидеть её сам.
 */
export async function logAuth(
  email: string,
  kind:
    | 'code_sent'
    | 'code_failed'
    | 'signed_in'
    | 'signed_out'
    | 'revoked'
    | 'totp_on'
    | 'totp_off'
    | 'totp_failed'
    | 'recovery_used',
  circuit: 'member' | 'staff' = 'member',
): Promise<void> {
  await db.insert(authEvents).values({
    id: newId('event'),
    email,
    kind,
    circuit,
    ip: await requestIp(),
    userAgent: await userAgent(),
  })
}

/**
 * Проверка кода из письма. Ошибки считаем в самой попытке: подбор шестизначного
 * кода останавливается числом попыток, а не его длиной.
 */
export async function verifyCode(
  found: AuthToken | undefined,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!found?.codeHash) return { ok: false, error: 'Код не найден. Запросите новый.' }
  if (found.consumedAt) return { ok: false, error: 'Код уже использован' }
  if (isExpired(found.expiresAt)) return { ok: false, error: 'Срок действия кода истёк' }
  if (found.attempts >= MAX_CODE_ATTEMPTS) {
    return { ok: false, error: 'Слишком много попыток. Запросите новый код.' }
  }

  if (!hashesMatch(found.codeHash, hashCode(found.id, code))) {
    await db
      .update(authTokens)
      .set({ attempts: found.attempts + 1 })
      .where(eq(authTokens.id, found.id))

    await logAuth(found.email, 'code_failed', found.purpose === 'workspace_login' ? 'member' : 'staff')

    const left = MAX_CODE_ATTEMPTS - found.attempts - 1
    return {
      ok: false,
      error: left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Слишком много попыток. Запросите новый код.',
    }
  }

  return { ok: true }
}

/**
 * Выдача сессии сотрудника. Сессия заводится на почту и сама по себе доступа
 * не даёт: право на каждое приложение считается по списку при запросе.
 *
 * Этим же путём получает кабинет и человек, пришедший с витрины: подтвердив
 * почту, он перестаёт быть посторонним, и дальше с ним работают ровно те же
 * правила, что и с приглашённым клиентом. Второго вида учётной записи
 * для «заказавших с витрины» не заводится.
 */
export async function completeStaffLogin(found: AuthToken): Promise<{ ok: boolean; error?: string }> {
  const sessionId = newId('session')
  const agent = await userAgent()
  const ip = await requestIp()

  await db.transaction(async (tx) => {
    await tx.update(authTokens).set({ consumedAt: new Date() }).where(eq(authTokens.id, found.id))
    await tx.insert(staffSessions).values({
      id: sessionId,
      email: found.email,
      userAgent: agent,
      ip,
      lastSeenAt: new Date(),
      expiresAt: expiresAt(SESSION_TTL_MS),
    })
    await tx.update(appUsers).set({ lastSeenAt: new Date() }).where(eq(appUsers.email, found.email))
  })

  const store = await cookies()
  store.set(STAFF_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
  await endChallenge()

  return { ok: true }
}
