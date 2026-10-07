'use server'

import { authTokens, db, pendingSubmissions } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, eq, isNull, lt } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { defaultRole } from '@/lib/app-roles'
import { appAccessFor, enrolFromIntake } from '@/lib/app-session'
import { ownRowsDeclared } from '@/lib/row-access'
import { loadApp } from '@/lib/app-write-access'
import {
  completeStaffLogin,
  findChallengeToken,
  forgetOldTokens,
  logAuth,
  requestIp,
  startChallenge,
  throttled,
  verifyCode,
} from '@/lib/auth-challenge'
import {
  TOKEN_TTL_MS,
  createCode,
  createToken,
  expiresAt,
  hashCode,
  isValidEmail,
  normalizeCode,
  normalizeEmail,
} from '@/lib/auth'
import { mailHintFor, sendMagicLink } from '@/lib/mailer'
import {
  checkPending,
  draftFromAnonymous,
  newPendingToken,
  pendingExpiry,
  revalidatePending,
  type PendingRejection,
} from '@/lib/pending-submission'
import { explainToCustomer } from '@tableapp/schema'
import { isPlanLimitError, mayIncrease } from '@/lib/limits'
import { insertRow, loadTableFields } from '@/lib/row-write'

/**
 * Заявка с витрины, подтверждённая почтой.
 *
 * Путь человека, который ещё нигде не заводился: он видит витрину, заполняет
 * форму, получает код на почту, вводит его — и в этот момент у него сразу
 * появляется кабинет, а заявка ложится в таблицу уже от его имени.
 *
 * Отдельного входа здесь нет. Код, срок, счёт попыток, привязка к браузеру
 * и выдача сессии — всё то же самое, чем входит приглашённый клиент
 * (`lib/auth-challenge.ts`). Разница ровно одна: к подтверждению приложена
 * отложенная заявка, и после выдачи кабинета она дописывается строкой.
 *
 * Почему значения ждут в отдельной таблице, а не пишутся сразу с пометкой
 * «не подтверждено»: непринятой заявки не должно быть видно нигде — ни
 * в таблице у владельца, ни в счётчиках, ни в выгрузке. Пока почта
 * не подтверждена, записи не существует.
 */

/** Ключ отложенной заявки живёт в куке: он и есть право её завершить. */
const INTAKE_COOKIE = 'tableapp_intake'

export type IntakeRequestResult =
  | { ok: true; delivered: boolean; hint: string | null; email: string }
  | { ok: false; error: string }

export type IntakeConfirmResult = { ok: true } | { ok: false; error: string }

/** Почему заявку не приняли — словами, которые что-то значат для человека. */
const WHY: Record<PendingRejection, string> = {
  not_found: 'Заявка не найдена. Заполните форму заново.',
  expired: 'Срок подтверждения истёк. Заполните форму заново.',
  already_used: 'Эта заявка уже принята.',
  screen_gone: 'Форма изменилась, пока вы подтверждали почту. Заполните её заново.',
  not_allowed: 'Форма сейчас не принимает заявки.',
  nothing_to_write: 'Заполните хотя бы одно поле.',
  too_large: 'Заявка слишком большая.',
}

/**
 * Шаг первый: заявка принята на хранение, код отправлен.
 *
 * Строки пока не появляется — только отложенная запись и письмо.
 */
export async function requestIntakeAction(
  slug: string,
  screenId: string,
  rawEmail: string,
  values: Record<string, unknown>,
): Promise<IntakeRequestResult> {
  const email = normalizeEmail(rawEmail)
  if (!isValidEmail(email)) return { ok: false, error: 'Введите корректный адрес почты' }

  const app = await loadApp(slug)
  if (!app) return { ok: false, error: 'Приложение не опубликовано' }

  const screen = app.screens.find((item) => item.id === screenId)
  if (!screen || screen.type !== 'form' || screen.mode !== 'create') {
    return { ok: false, error: 'Форма не найдена' }
  }
  const draft = draftFromAnonymous(app, screen, values)
  if (!draft.ok) return { ok: false, error: WHY[draft.reason] }

  /*
   * Условие проверяем здесь, до письма: иначе человек заполнит форму, получит
   * код, введёт его — и только тогда узнает, что заказ не приняли.
   */
  if (!ownRowsDeclared(app, screen.tableId, defaultRole(app))) {
    return { ok: false, error: WHY.not_allowed }
  }

  const ip = await requestIp()
  if (await throttled(email, ip)) {
    return { ok: false, error: 'Слишком много запросов. Попробуйте через пятнадцать минут.' }
  }
  await forgetOldTokens()
  await forgetOldPending()

  const pendingId = newPendingToken()
  const tokenId = newId('token')
  // Ссылки в письме не будет, но колонка хеша обязательна: кладём неиспользуемый.
  const { hash } = createToken()
  const code = createCode()
  const challengeId = await startChallenge()

  await db.transaction(async (tx) => {
    await tx.insert(pendingSubmissions).values({
      id: pendingId,
      appId: app.id,
      screenId: screen.id,
      tableId: screen.tableId,
      values: draft.values,
      email,
      expiresAt: pendingExpiry(),
    })
    await tx.insert(authTokens).values({
      id: tokenId,
      email,
      tokenHash: hash,
      codeHash: hashCode(tokenId, code),
      challengeId,
      requestIp: ip,
      purpose: 'intake',
      appId: app.id,
      expiresAt: expiresAt(TOKEN_TTL_MS),
    })
  })

  const store = await cookies()
  store.set(INTAKE_COOKIE, pendingId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(TOKEN_TTL_MS / 1000),
  })

  /*
   * Ссылки в письме нет намеренно. Заявка лежит в куке того браузера, где её
   * заполнили: перейдя по ссылке с телефона, человек попал бы в пустой
   * кабинет без своей заявки и решил бы, что она потерялась.
   */
  const sent = await sendMagicLink({
    to: email,
    // Тему пишет само письмо: она зависит от вида, а не от места вызова.
    subject: '',
    link: '',
    code,
    appName: app.name,
    kind: 'verify_intake',
  })
  await logAuth(email, 'code_sent', 'staff')

  return { ok: true, delivered: sent.delivered, hint: mailHintFor(sent), email }
}

/**
 * Шаг второй: код верен — заводим кабинет и дописываем заявку.
 *
 * Порядок именно такой. Сначала человек становится известным, и только потом
 * его заявка пересчитывается по его собственным правам — не по тем, что были
 * у постороннего в момент заполнения формы.
 */
export async function confirmIntakeAction(slug: string, rawCode: string): Promise<IntakeConfirmResult> {
  const app = await loadApp(slug)
  if (!app) return { ok: false, error: 'Приложение не опубликовано' }

  const found = await findChallengeToken('intake')
  if (found && found.appId !== app.id) return { ok: false, error: 'Код от другого приложения' }

  const checked = await verifyCode(found, normalizeCode(rawCode))
  if (!checked.ok) return checked

  const store = await cookies()
  const pendingId = store.get(INTAKE_COOKIE)?.value
  if (!pendingId) return { ok: false, error: WHY.not_found }

  const [record] = await db
    .select()
    .from(pendingSubmissions)
    .where(and(eq(pendingSubmissions.id, pendingId), eq(pendingSubmissions.appId, app.id)))
    .limit(1)

  const pending = checkPending(
    record
      ? {
          id: record.id,
          appId: record.appId,
          screenId: record.screenId,
          tableId: record.tableId,
          values: record.values as Record<string, unknown>,
          email: record.email,
          expiresAt: record.expiresAt,
          usedAt: record.usedAt,
        }
      : null,
  )
  if (!pending.ok) return { ok: false, error: WHY[pending.reason] }

  /*
   * Подтверждён должен быть именно тот адрес, что указан в заявке. Ключ
   * заявки и так не угадать, но связывать чужое подтверждение с чужой заявкой
   * не должно быть возможно и при утечке ключа.
   */
  if (pending.record.email !== found!.email) return { ok: false, error: WHY.not_found }

  const login = await completeStaffLogin(found!)
  if (!login.ok) return { ok: false, error: login.error ?? 'Не удалось войти' }
  await logAuth(found!.email, 'signed_in', 'staff')

  /*
   * Между заполнением формы и кодом прошли минуты: правило могли убрать.
   * Проверяем заново — заявка ещё цела, и человек хотя бы вошёл.
   */
  if (!ownRowsDeclared(app, pending.record.tableId, defaultRole(app))) {
    return { ok: false, error: WHY.not_allowed }
  }

  /*
   * Кабинет человека с витрины. Владелец его не вписывал — и не должен был:
   * повесив общедоступную форму заказа, он тем самым согласился принимать
   * незнакомых. Роль — та же, что у всех вошедших по умолчанию, то есть
   * самая слабая: что именно он увидит, решают её права и правило на строки.
   */
  await enrolFromIntake(app, found!.email)

  const { visitor, viewer } = await appAccessFor(app, found!.email)
  const fields = await loadTableFields(pending.record.tableId)
  const fresh = revalidatePending(app, pending.record, fields, visitor)
  // Заявка ещё не потрачена: если права не сошлись, человек хотя бы вошёл,
  // а владелец, поправив форму, не заставит его набирать всё заново.
  if (!fresh.ok) return { ok: false, error: WHY[fresh.reason] }

  /*
   * Место проверяем до того, как заявка погашена. Иначе отказ по месту
   * сжёг бы её: человек ввёл код, заявка отмечена использованной, а строки
   * нет — и набирать всё заново.
   */
  const allowed = await mayIncrease({
    workspaceId: app.workspaceId,
    resource: 'rows',
    origin: 'runtime',
  })
  if (!allowed.ok) return { ok: false, error: explainToCustomer() }

  /*
   * Только теперь заявка забирается — условием `used_at is null`, чтобы два
   * одновременных подтверждения не дали двух строк. Проигравший не получит
   * ничего, а не вторую копию.
   */
  const claimed = await db
    .update(pendingSubmissions)
    .set({ usedAt: new Date() })
    .where(and(eq(pendingSubmissions.id, pendingId), isNull(pendingSubmissions.usedAt)))
    .returning({ id: pendingSubmissions.id })
  if (claimed.length === 0) return { ok: false, error: WHY.already_used }
  store.delete(INTAKE_COOKIE)

  // Владельца проставляет сервер по правилам таблицы: заявка с витрины
  // попадает в кабинет к тому, кто её оставил, а не к первому попавшемуся.
  try {
    await insertRow(app, pending.record.tableId, fresh.values, { viewer, visitor, ip: null }, fields)
  } catch (error) {
    if (isPlanLimitError(error)) {
      /*
       * Место кончилось между проверкой и записью — гонка редкая, но заявку
       * возвращаем: она стоила человеку письма и кода, и сжигать её из-за
       * промежутка в доли секунды нельзя.
       */
      await db
        .update(pendingSubmissions)
        .set({ usedAt: null })
        .where(eq(pendingSubmissions.id, pendingId))
      return { ok: false, error: explainToCustomer() }
    }
    throw error
  }

  revalidatePath(`/a/${slug}`)
  return { ok: true }
}

/** Незавершённые заявки не копим: подтвердить просроченную уже нельзя. */
async function forgetOldPending(): Promise<void> {
  await db.delete(pendingSubmissions).where(lt(pendingSubmissions.expiresAt, new Date()))
}
