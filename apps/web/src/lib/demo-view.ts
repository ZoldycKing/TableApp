import type { App, RoleId } from '@tableapp/schema'

/**
 * Как «без входа» обозначается в адресе страницы.
 *
 * Это значение параметра, а не роль: ролей у не вошедшего нет. В адресе оно
 * нужно, чтобы ссылкой на «посмотреть глазами постороннего» можно было
 * поделиться, а внутри страница переводит его в анонимный контекст.
 */
export const ANONYMOUS_ID = 'anonymous'

/**
 * Что показывает витрина по адресу страницы.
 *
 * Два переключателя на `/demo` отвечают на разные вопросы, и различие между
 * ними здесь главное:
 *
 * - **роль** решает, что вообще загрузится. Она уходит на сервер, и по ней
 *   отбираются экраны, строки и поля — ровно так же, как в работе;
 * - **размер экрана** не решает ничего. Это ширина рамки на странице,
 *   и ни в одну проверку прав он не попадает.
 *
 * Поэтому решения собраны в одной чистой функции: если размер когда-нибудь
 * начнёт влиять на то, чьими глазами читаются строки, это увидит тест,
 * а не пользователь.
 */

export const DEVICES = ['desktop', 'mobile'] as const
export type Device = (typeof DEVICES)[number]

export type DemoParams = {
  role?: string
  /** Прежнее имя параметра: ссылки на него уже разошлись. */
  rol?: string
  device?: string
}

export type DemoView = {
  /** Роль приложения либо `ANONYMOUS_ID` — «человек не входил». */
  role: RoleId | typeof ANONYMOUS_ID
  device: Device
  /** Размер выбрал человек, а не подставили по умолчанию. */
  deviceChosen: boolean
  /**
   * Почта, глазами которой читаются строки. Нужна там, где у роли есть
   * правило «только свои»: без человека такое правило показало бы пустоту.
   */
  viewerEmail: string | null
}

function isDevice(value: string | undefined): value is Device {
  return value === 'desktop' || value === 'mobile'
}

/**
 * Разбор адреса витрины.
 *
 * Роль берётся **из самого приложения**: чужой идентификатор в ссылке не должен
 * открывать ничего, чего в приложении нет. Не нашли — роль по умолчанию, нет
 * и её — гость. Ни при каком значении в адресе человек не получает больше.
 */
export function resolveDemoView(
  app: Pick<App, 'roles' | 'rowAccessRules'>,
  params: DemoParams,
  clientEmail: string,
): DemoView {
  const asked = params.role ?? params.rol
  const known = app.roles.find((item) => item.id === asked)
  // `guest` — прежнее имя состояния «не входил»; ссылки на него уже разошлись.
  const anonymousAsked = asked === ANONYMOUS_ID || asked === 'guest'
  const role: RoleId | typeof ANONYMOUS_ID =
    known?.id ??
    (anonymousAsked ? ANONYMOUS_ID : undefined) ??
    app.roles.find((item) => item.isDefault)?.id ??
    ANONYMOUS_ID

  const deviceChosen = isDevice(params.device)
  const device: Device = deviceChosen ? (params.device as Device) : 'desktop'

  // Правило «только свои строки» смотрит на почту, поэтому кабинет
  // показываем глазами клиента из примеров.
  // Не вошедшему почту не подставляем: у него её нет, и правила на строки
  // к нему не применяются вовсе.
  const needsViewer =
    role !== ANONYMOUS_ID && app.rowAccessRules.some((rule) => rule.appliesTo.includes(role))

  return { role, device, deviceChosen, viewerEmail: needsViewer ? clientEmail : null }
}
