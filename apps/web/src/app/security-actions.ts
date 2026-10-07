'use server'

import { authEvents, db, sessions, staffSessions, users } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, count, eq, gte, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { currentMember, currentSessionId } from '@/lib/session'
import {
  createRecoveryCodes,
  createTotpSecret,
  hashRecoveryCode,
  isTotpSetupSecret,
  totpUri,
  verifyTotp,
} from '@/lib/totp'
import { MAX_CODE_ATTEMPTS, THROTTLE_WINDOW_MS } from '@/lib/auth'

/**
 * Действия безопасности владельца: устройства, журнал входов и второй фактор.
 * Все проверяют сессию сами — страница не единственный вход в эти операции.
 */
async function requireMember() {
  const member = await currentMember()
  if (!member) throw new Error('Нужен вход')
  return member
}

type TotpResult = { ok: true; recovery: string[] } | { ok: false; error: string }
type TotpRunner = Pick<typeof db, 'select' | 'insert'>

// Called while holding the user row lock, so parallel guesses share one budget.
async function totpSettingsBlocked(tx: TotpRunner, email: string): Promise<boolean> {
  const [failed] = await tx.select({ total: count() }).from(authEvents).where(and(
    eq(authEvents.email, email), eq(authEvents.kind, 'totp_settings_failed'),
    gte(authEvents.createdAt, new Date(Date.now() - THROTTLE_WINDOW_MS)),
  ))
  return (failed?.total ?? 0) >= MAX_CODE_ATTEMPTS
}

const TOTP_BLOCKED = 'Слишком много неверных кодов. Попробуйте через 15 минут.'

/** Завершить все сессии, кроме текущей: «выйти на всех других устройствах». */
export async function revokeOtherSessionsAction(): Promise<{ ok: true; closed: number }> {
  const member = await requireMember()
  const current = await currentSessionId()

  const removed = await db
    .delete(sessions)
    .where(
      current
        ? and(eq(sessions.userId, member.userId), ne(sessions.id, current))
        : eq(sessions.userId, member.userId),
    )
    .returning({ id: sessions.id })

  // Сотрудничьи сессии на ту же почту закрываем заодно: это тот же человек.
  await db.delete(staffSessions).where(eq(staffSessions.email, member.email))

  await db.insert(authEvents).values({
    id: newId('event'),
    email: member.email,
    kind: 'revoked',
    circuit: 'member',
  })

  revalidatePath('/security')
  return { ok: true, closed: removed.length }
}

export type TotpSetup = { secret: string; uri: string; qr: string }

/**
 * Начало настройки второго фактора. Секрет пока никуда не сохраняется:
 * включаем его только после того, как человек докажет, что приложение
 * настроено и коды сходятся.
 */
export async function startTotpSetupAction(): Promise<TotpSetup> {
  const member = await requireMember()
  const secret = createTotpSecret()
  const uri = totpUri(secret, member.email)
  const { toDataURL } = await import('qrcode')
  const qr = await toDataURL(uri, { margin: 1, width: 220 })

  return { secret, uri, qr }
}

/** Existing factors must be disabled with their current code before setting up a new one. */
export async function enableTotpAction(
  secret: string,
  code: string,
): Promise<TotpResult> {
  const member = await requireMember()
  const result = await db.transaction(async (tx): Promise<TotpResult> => {
    const [user] = await tx.select().from(users).where(eq(users.id, member.userId)).limit(1).for('update')
    if (!user) return { ok: false, error: 'Пользователь не найден' }
    if (user.totpSecret || user.totpEnabledAt) {
      return { ok: false, error: 'Второй фактор уже включён. Сначала отключите его действующим кодом, затем настройте заново.' }
    }
    if (await totpSettingsBlocked(tx, member.email)) return { ok: false, error: TOTP_BLOCKED }
    const validSecret = isTotpSetupSecret(secret)
    if (!validSecret || !verifyTotp(secret, code)) {
      await tx.insert(authEvents).values({ id: newId('event'), email: member.email, kind: 'totp_settings_failed', circuit: 'member' })
      return { ok: false, error: validSecret
        ? 'Код не подошёл. Проверьте время на телефоне и попробуйте ещё раз.'
        : 'Ключ настройки недействителен. Обновите страницу и начните настройку заново.' }
    }
    const recovery = createRecoveryCodes()
    await tx.update(users).set({
      totpSecret: secret, totpEnabledAt: new Date(), recoveryCodes: recovery.map(hashRecoveryCode),
    }).where(eq(users.id, member.userId))
    await tx.insert(authEvents).values({ id: newId('event'), email: member.email, kind: 'totp_on', circuit: 'member' })
    return { ok: true, recovery }
  })
  if (result.ok) revalidatePath('/security')
  return result
}

/** Выключение требует действующего кода: иначе чужая сессия снимет защиту. */
export async function disableTotpAction(code: string): Promise<{ ok: boolean; error?: string }> {
  const member = await requireMember()
  const result = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, member.userId)).limit(1).for('update')
    if (!user?.totpSecret) return { ok: false, error: 'Второй фактор не включён' }
    if (await totpSettingsBlocked(tx, member.email)) return { ok: false, error: TOTP_BLOCKED }
    if (!verifyTotp(user.totpSecret, code)) {
      await tx.insert(authEvents).values({ id: newId('event'), email: member.email, kind: 'totp_settings_failed', circuit: 'member' })
      return { ok: false, error: 'Неверный код' }
    }
    await tx.update(users).set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: null }).where(eq(users.id, member.userId))
    await tx.insert(authEvents).values({ id: newId('event'), email: member.email, kind: 'totp_off', circuit: 'member' })
    return { ok: true }
  })
  if (result.ok) revalidatePath('/security')
  return result
}
