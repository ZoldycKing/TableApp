import type { App } from '@tableapp/schema'
import { appUsers, db, staffSessions } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { ANONYMOUS, asRole, companyOf, defaultRole, visitorFor, type Visitor } from './app-roles'
import { STAFF_SESSION_COOKIE, normalizeEmail } from './auth'
import { ensureBusinessCustomer } from './business-customer'
import type { ModuleAccessApp } from './module-access'

export type AppViewer = {
  id: string
  email: string
  name: string | null
  company: string
  /** Пришёл с витрины, а не по приглашению: см. `canAccessRow`. */
  enrolled: boolean
  /** Profile is scoped to this business; app user IDs and old ownership remain stable. */
  businessCustomerId?: string
}

/** Кто пришёл и что ему можно: одно решение на чтение и на запись. */
export type AppAccess = {
  /** Контекст посетителя: вошёл ли, и если да — кто он среди вошедших. */
  visitor: Visitor
  /** Запись пользователя приложения; у не вошедшего её нет. */
  viewer: AppViewer | null
}

/** Почта сотрудника по куке. Сама по себе не даёт доступа ни к чему. */
export async function currentStaffEmail(): Promise<string | null> {
  const store = await cookies()
  const sessionId = store.get(STAFF_SESSION_COOKIE)?.value
  if (!sessionId) return null

  const [session] = await db
    .select({ email: staffSessions.email })
    .from(staffSessions)
    .where(and(eq(staffSessions.id, sessionId), gt(staffSessions.expiresAt, new Date())))
    .limit(1)

  return session?.email ?? null
}

/**
 * Доступ посетителя к приложению.
 *
 * Сессия говорит только о том, чья это почта. Роль считается по определению
 * приложения при каждом запросе, поэтому изменение списка доступа действует
 * сразу, а не по истечении сессии: убрали адрес — человек на следующем же
 * действии становится гостем.
 */
export async function currentAppAccess(
  app: ModuleAccessApp,
): Promise<AppAccess> {
  return appAccessFor(app, await currentStaffEmail())
}

/**
 * То же решение, но для уже известной почты.
 *
 * Нужно там, где сессия только что выдана в этом же запросе и полагаться
 * на чтение свежей куки нельзя: подтверждение заявки с витрины сначала
 * заводит кабинет, а потом сразу пишет строку от его имени.
 */
export async function appAccessFor(
  app: ModuleAccessApp,
  email: string | null,
): Promise<AppAccess> {
  if (!email) return { visitor: ANONYMOUS, viewer: null }

  const declared = visitorFor(app, email)
  if (declared.authenticated) {
    const viewer = await ensureAppUser(app.id, normalizeEmail(email))
    // Организацию берём из списка доступа: по ней работает правило
    // «видит строки своей фирмы».
    const profile = declared.enrolled || declared.roleId === 'client' ? await ensureBusinessCustomer(app.id, email, viewer.name) : null
    return { visitor: declared, viewer: { ...viewer, name: profile?.name ?? viewer.name, ...(profile ? { businessCustomerId: profile.id } : {}), company: companyOf(app, email), enrolled: declared.enrolled } }
  }

  return enrolledAccess(app, normalizeEmail(email))
}

/**
 * Доступ того, кого владелец не вписывал.
 *
 * Человек с витрины: он оформил заказ, подтвердил почту — и с этого момента
 * у него есть кабинет, где видно его собственный заказ. Роль хранится
 * у пользователя приложения, а не в списке доступа, потому что список — это
 * слова владельца, и дописывать в них самим было бы подлогом.
 *
 * Запись здесь не заводится: кто не оформлял заказ, тот и не появляется.
 * Поэтому чужая сессия от другого приложения ничего тут не открывает.
 */
async function enrolledAccess(
  app: Pick<App, 'id' | 'roles' | 'moduleAccess'>,
  email: string,
): Promise<AppAccess> {
  const [record] = await db
    .select()
    .from(appUsers)
    .where(and(eq(appUsers.appId, app.id), eq(appUsers.email, email)))
    .limit(1)

  if (!record?.roleId) return { visitor: ANONYMOUS, viewer: null }
  if (app.moduleAccess && record.roleId !== defaultRole(app)) return { visitor: ANONYMOUS, viewer: null }

  /*
   * Роль могли удалить после того, как человек её получил. Отдавать ему
   * несуществующую роль нельзя — правила по ней не сойдутся ни с чем;
   * отдаём роль по умолчанию, то есть самую слабую.
   */
  const roleId = app.roles.some((role) => role.id === record.roleId)
    ? record.roleId
    : defaultRole(app)
  if (!roleId) return { visitor: ANONYMOUS, viewer: null }
  const profile = await ensureBusinessCustomer(app.id, email, record.name)

  return {
    visitor: asRole(roleId, email, '', true),
    // Организации у пришедшего с витрины нет: её вписывает владелец
    // для клиента-юрлица, а этого человека он ещё не видел.
    viewer: { id: record.id, email: record.email, name: profile?.name ?? record.name, ...(profile ? { businessCustomerId: profile.id } : {}), company: '', enrolled: true },
  }
}

/**
 * Запись человека, пришедшего с витрины, в пользователи приложения.
 *
 * Вызывается один раз — при подтверждении почты. Роль не переписывается,
 * если она уже есть: владелец мог её поменять, и подтверждение второго
 * заказа не должно откатывать его решение обратно к роли по умолчанию.
 */
export async function enrolFromIntake(
  app: Pick<App, 'id' | 'roles'>,
  email: string,
): Promise<void> {
  const roleId = defaultRole(app)
  if (!roleId) return

  const normalized = normalizeEmail(email)
  await ensureAppUser(app.id, normalized)
  await db
    .update(appUsers)
    .set({ roleId, joinedVia: 'intake' })
    .where(and(eq(appUsers.appId, app.id), eq(appUsers.email, normalized), isNull(appUsers.roleId)))
}

/**
 * Запись пользователя приложения заводится при первом входе.
 *
 * В открытом приложении адреса клиентов заранее не известны — их некому
 * внести в список, и ждать этого значит не пустить человека в его же кабинет.
 */
async function ensureAppUser(appId: string, email: string): Promise<Omit<AppViewer, 'company' | 'enrolled'>> {
  const [existing] = await db
    .select({ id: appUsers.id, email: appUsers.email, name: appUsers.name })
    .from(appUsers)
    .where(and(eq(appUsers.appId, appId), eq(appUsers.email, email)))
    .limit(1)
  if (existing) return existing

  const created = { id: newId('appUser'), appId, email, name: null }
  await db.insert(appUsers).values(created).onConflictDoNothing()

  const [record] = await db
    .select({ id: appUsers.id, email: appUsers.email, name: appUsers.name })
    .from(appUsers)
    .where(and(eq(appUsers.appId, appId), eq(appUsers.email, email)))
    .limit(1)

  return record ?? { id: created.id, email, name: null }
}
