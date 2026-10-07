'use server'

import { authEvents, db, sessions, staffSessions, users } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, desc, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { currentMember, currentSessionId } from '@/lib/session'
import {
  createRecoveryCodes,
  createTotpSecret,
  hashRecoveryCode,
  totpUri,
  verifyTotp,
} from '@/lib/totp'

/**
 * Действия безопасности владельца: устройства, журнал входов и второй фактор.
 * Все проверяют сессию сами — страница не единственный вход в эти операции.
 */
async function requireMember() {
  const member = await currentMember()
  if (!member) throw new Error('Нужен вход')
  return member
}

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

/** Включение: проверяем код, сохраняем секрет и разово выдаём резервные коды. */
export async function enableTotpAction(
  secret: string,
  code: string,
): Promise<{ ok: true; recovery: string[] } | { ok: false; error: string }> {
  const member = await requireMember()
  if (!verifyTotp(secret, code)) {
    return { ok: false, error: 'Код не подошёл. Проверьте время на телефоне и попробуйте ещё раз.' }
  }

  const recovery = createRecoveryCodes()
  await db
    .update(users)
    .set({
      totpSecret: secret,
      totpEnabledAt: new Date(),
      recoveryCodes: recovery.map(hashRecoveryCode),
    })
    .where(eq(users.id, member.userId))

  await db.insert(authEvents).values({ id: newId('event'), email: member.email, kind: 'totp_on' })
  revalidatePath('/security')

  return { ok: true, recovery }
}

/** Выключение требует действующего кода: иначе чужая сессия снимет защиту. */
export async function disableTotpAction(code: string): Promise<{ ok: boolean; error?: string }> {
  const member = await requireMember()
  const [user] = await db.select().from(users).where(eq(users.id, member.userId)).limit(1)
  if (!user?.totpSecret) return { ok: false, error: 'Второй фактор не включён' }
  if (!verifyTotp(user.totpSecret, code)) return { ok: false, error: 'Неверный код' }

  await db
    .update(users)
    .set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: null })
    .where(eq(users.id, member.userId))

  await db.insert(authEvents).values({ id: newId('event'), email: member.email, kind: 'totp_off' })
  revalidatePath('/security')

  return { ok: true }
}
