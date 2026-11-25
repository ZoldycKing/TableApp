import type { App, AppRole, Block, Component, Field, RoleId, Screen, View } from '@tableapp/schema'
import { evalFilter, fieldsOfFilter, GUEST_ROLE, indexFields } from '@tableapp/schema'
import { rulesFor } from './row-access'
import { customerCheckoutIds, offersCustomerCheckout } from './customer-checkout'
import { acceptsModuleIntake, grantedRoles, hasRole } from './module-access'

/**
 * Кто есть кто в приложении и что ему можно.
 *
 * Модуль чистый: на входе определение приложения и почта вошедшего, на выходе
 * роль и разрешения. Права — то место, где ошибку не видно глазом, поэтому
 * решение принимается здесь и проверяется тестами, а не собирается по кусочкам
 * в обработчиках.
 *
 * Роль отвечает на вопрос «что можно делать», правило доступа к строкам —
 * на вопрос «с какими строками». Оба должны сойтись, чтобы действие состоялось.
 *
 * Роли задаёт владелец приложения, поэтому здесь нет ни одного сравнения
 * с «manager» или «client»: всё решается по идентификатору роли и по тому,
 * что владелец ей открыл.
 */

export type AppAction = 'create' | 'update' | 'delete'

/**
 * Кто пришёл.
 *
 * Прежде эту роль играла строка, и «не вошёл» приходилось изображать
 * выдуманной ролью «гость». Она вставала в один ряд с «Клиентом» и
 * «Сотрудником» и читалась как ещё один сотрудник, хотя роль отвечает
 * на вопрос «что человеку можно», а у не вошедшего нет ни имени, ни почты,
 * ни строк, которые были бы его.
 *
 * Теперь это две разные вещи: `authenticated` отвечает «вошёл ли», `roleId` —
 * «кто он среди вошедших». У анонимного посетителя роли нет вовсе, и написать
 * её ему нечем.
 */
export type Visitor = {
  authenticated: boolean
  /** Роль среди вошедших. У не вошедшего — `null`, и это не «роль гостя». */
  roleId: RoleId | null
  /** Private role IDs belong to separate modules; the primary role is only a display fallback. */
  roleIds?: RoleId[]
  email: string | null
  /** Организация из списка доступа: по ней работает «видит заказы своей фирмы». */
  company: string
  /**
   * Пришёл с витрины, а не по приглашению владельца.
   *
   * Лежит здесь, а не только в записи пользователя, потому что решение
   * «какие строки ему видно» принимается и на чтении, и на записи, а `Visitor` —
   * единственное, что доходит до обоих. Разошлись они однажды, и тихо:
   * при записи признак учитывался, при чтении — нет, и «правил не задано»
   * означало для такого человека «видно всю таблицу».
   */
  enrolled: boolean
}

/** Тот, кто открыл ссылку и не входил. */
export const ANONYMOUS: Visitor = {
  authenticated: false,
  roleId: null,
  email: null,
  company: '',
  enrolled: false,
}

/** Посетитель с известной ролью — для предпросмотра и внутренних вызовов. */
export function asRole(
  roleId: RoleId,
  email: string | null = null,
  company = '',
  enrolled = false,
): Visitor {
  return { authenticated: true, roleId, email, company, enrolled }
}

function sameEmail(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

/** Роль по умолчанию: её получают все, кто вошёл и отдельно не перечислен. */
export function defaultRole(app: Pick<App, 'roles'>): RoleId | null {
  return app.roles.find((role) => role.isDefault)?.id ?? null
}

const WORKING_ROLE_IDS = new Set(['owner', 'staff', 'manager'])

/**
 * Customer-facing visitor (invite-list client, custom patient default, etc.).
 * Working defaults (warehouse staff, etc.) are NOT customers — only roles that
 * are not owner/staff/manager, and either literally `client` or the app default
 * when a distinct non-default (working) role also exists.
 */
export function isCustomerRole(app: Pick<App, 'roles'>, roleId: RoleId | null): boolean {
  if (!roleId || WORKING_ROLE_IDS.has(roleId)) return false
  if (roleId === 'client') return true
  const def = defaultRole(app)
  return roleId === def && app.roles.some(role => !role.isDefault)
}

/** Название роли для показа. У не вошедшего роли нет — так и подписываем. */
export function roleName(app: Pick<App, 'roles'>, roleId: RoleId | null): string {
  if (roleId === null) return ANONYMOUS_NAME
  return app.roles.find((role) => role.id === roleId)?.name ?? 'Удалённая роль'
}

/** Как называется «не вошёл» в интерфейсе. Это подпись, а не идентификатор. */
export const ANONYMOUS_NAME = 'Без входа'

/**
 * Роли приложения плюс правила на строки, где «не вошедший» ещё встречается
 * как **аудитория** правила, а не как роль. Список доступа и настройки экрана
 * его не знают.
 */
export function rolesForRowRules(app: Pick<App, 'roles'>): AppRole[] {
  return [{ id: GUEST_ROLE, name: ANONYMOUS_NAME, isDefault: false }, ...app.roles]
}

/**
 * Отправлять ли этому адресу код для входа в приложение.
 *
 * Решается отдельно от `visitorFor`, потому что это другой вопрос. `visitorFor`
 * отвечает «что можно вошедшему», а здесь — «имеет ли смысл вообще посылать
 * ему письмо». Разойтись они могут ровно в одном месте, и оно важное:
 * человек, оформивший заказ на витрине, в списке доступа не значится никогда —
 * его роль лежит у него самого. Отказать ему здесь значит запереть его
 * снаружи собственного кабинета, как только истечёт сессия.
 *
 * `enrolledRoleId` — роль из записи пользователя приложения, то есть след
 * подтверждённого заказа. Её отсутствие означает, что человека мы не знаем.
 */
export function maySendAppCode(
  app: Pick<App, 'accessMode' | 'allowlist'> & Partial<Pick<App, 'modules' | 'moduleAccess' | 'roles'>>,
  email: string,
  enrolledRoleId: RoleId | null,
): boolean {
  // Открытое приложение пускает любого: адреса клиентов заранее не известны.
  if (app.accessMode !== 'allowlist') return true
  if (app.moduleAccess) return Boolean(app.roles && (grantedRoles({ ...app, roles: app.roles }, email).length > 0 || app.allowlist.some(entry => sameEmail(entry.email, email) && entry.roleId === defaultRole({ roles: app.roles! })))) || enrolledRoleId !== null
  if (app.allowlist.some((entry) => sameEmail(entry.email, email))) return true
  return enrolledRoleId !== null
}

/**
 * Роль посетителя.
 *
 * Не вошёл — гость. Вошёл и перечислен — роль из списка. Вошёл в открытое
 * приложение, но в списке его нет — роль по умолчанию: именно так работает
 * приём заявок и кабинет, когда заранее внести адрес человека невозможно.
 * В закрытом приложении неизвестный адрес остаётся гостем.
 *
 * Если роль из списка успели удалить, человек не становится всесильным
 * и не выпадает совсем: он получает роль по умолчанию, а если её нет — гостя.
 */
export function visitorFor(
  app: Pick<App, 'accessMode' | 'allowlist' | 'roles'> & Partial<Pick<App, 'modules' | 'moduleAccess'>>,
  email: string | null,
): Visitor {
  if (!email) return ANONYMOUS

  if (app.moduleAccess) {
    const roleIds = grantedRoles(app, email)
    if (roleIds.length) return { ...asRole(roleIds[0]!, email), roleIds }
    const client = defaultRole(app)
    const roleId = app.accessMode === 'public' || app.allowlist.some(entry => sameEmail(entry.email, email) && entry.roleId === client) ? client : null
    return roleId ? asRole(roleId, email, '', true) : ANONYMOUS
  }

  const company = companyOf(app, email)
  // Роль отсюда — из списка доступа или из режима «открытое приложение»,
  // то есть человека владелец так или иначе позвал. Пришедшего с витрины
  // этот разбор не находит вовсе: его роль лежит не здесь.
  const known = (roleId: RoleId | null): Visitor =>
    roleId === null ? ANONYMOUS : asRole(roleId, email, company)

  const entry = app.allowlist.find((item) => sameEmail(item.email, email))
  if (entry) {
    const exists = app.roles.some((role) => role.id === entry.roleId)
    const roleId = exists ? entry.roleId : defaultRole(app)
    return roleId === null ? ANONYMOUS : asRole(roleId, email, company,
      app.accessMode === 'public' && roleId === defaultRole(app))
  }

  const roleId = app.accessMode === 'public' ? defaultRole(app) : null
  // A shared login proves an email, never an invitation to this business.
  // Unknown customers must fail closed if their ownership rule disappears.
  return roleId === null ? ANONYMOUS : asRole(roleId, email, '', true)
}

/**
 * Организация вошедшего.
 *
 * Берётся из списка доступа: для клиента-юрлица владелец вписывает несколько
 * адресов с одной организацией, и правило «видит заказы своей фирмы» начинает
 * работать без отдельной таблицы пользователей.
 */
export function companyOf(app: Pick<App, 'allowlist'>, email: string | null): string {
  if (!email) return ''
  return app.allowlist.find((item) => sameEmail(item.email, email))?.company ?? ''
}

/**
 * Открыт ли экран этому посетителю.
 *
 * Два разных вопроса, а не один список. У вошедшего спрашиваем роль, у не
 * вошедшего — только «видно ли это без входа». Гость в списке ролей не значится
 * и значиться не может: роль — это что человеку можно, а у него нет ни имени,
 * ни почты, ни строк, которые были бы его.
 */
export function canOpenScreen(screen: Screen, visitor: Visitor): boolean {
  if (!visitor.authenticated || visitor.roleId === null) return screen.access.public
  return screen.access.roles.some(role => hasRole(visitor, role))
}

/**
 * Положен ли роли этот компонент или блок.
 *
 * `null` значит «как у экрана»: перечислять роли у каждого компонента —
 * верный способ забыть один и показать лишнее.
 */
export function canSeePart(
  part: { roles: readonly string[] | null },
  visitor: Visitor,
): boolean {
  /*
   * У не вошедшего роли нет, поэтому перечисление ролей ему ничего не открывает.
   * Ему достаётся только то, что помечено «как у экрана», — а экран он открыл
   * потому, что тот публичный. Что из этого он реально увидит, решает белый
   * список полей: компонент по закрытой колонке отсеивается ниже.
   */
  if (!visitor.authenticated || visitor.roleId === null) return part.roles === null
  return part.roles === null || part.roles.some(role => hasRole(visitor, role))
}

/**
 * Колонки, которые владелец разрешил показывать без входа.
 *
 * Белый список и только он. Никакого «ограничений нет — значит всё можно»:
 * для не вошедшего такого состояния не существует.
 */
export function publicFieldPolicy(screen: Screen): Set<string> {
  return screen.access.public ? new Set(screen.access.publicFields) : new Set()
}

/** Части экрана, положенные посетителю: с них и начинается всё остальное. */
function partsFor(screen: Screen, visitor: Visitor): { components: Component[]; blocks: Block[] } {
  if (screen.type === 'dashboard') {
    return { components: [], blocks: screen.blocks.filter((block) => canSeePart(block, visitor)) }
  }

  const components = screen.components.filter((item) => canSeePart(item, visitor))
  if (visitor.authenticated && visitor.roleId !== null) return { components, blocks: [] }

  /*
   * Форма — исключение, и это не послабление.
   *
   * Её поля не показывают существующие данные, а принимают новые: белый
   * список отвечает на вопрос «что можно прочитать», а не «что можно ввести».
   * Отфильтруй их — и публичная форма нарисуется пустой рамкой с кнопкой.
   * Права записать от этого не появляется: за неё отвечает `writableFields`,
   * и не вошедшему она ничего не даёт.
   */
  if (screen.type === 'form') return { components, blocks: [] }

  /*
   * На экранах, показывающих строки, у не вошедшего компонент остаётся,
   * только если все его колонки публичны. Иначе на витрине висела бы строчка
   * «Себестоимость» с пустотой вместо значения — она и сама по себе лишняя,
   * и рассказывает о таблице больше, чем владелец собирался.
   */
  const open = publicFieldPolicy(screen)
  return {
    components: components.filter((component) => {
      const needs = new Set<string>()
      addComponentFields(component, needs)
      return [...needs].every((fieldId) => open.has(fieldId))
    }),
    blocks: [],
  }
}

function addComponentFields(component: Component, into: Set<string>): void {
  fieldsOfFilter(component.visibleWhen, into)
  if ('fieldId' in component && typeof component.fieldId === 'string') into.add(component.fieldId)
  if (component.type === 'heading' || component.type === 'text') {
    if (component.source.kind === 'field') into.add(component.source.fieldId)
  }
  if (component.type === 'card') {
    for (const id of [component.titleFieldId, component.subtitleFieldId, component.imageFieldId]) {
      if (id) into.add(id)
    }
  }
  if (component.type === 'related_list') into.add(component.relationFieldId)
  if (component.type === 'button' && component.action.type === 'open_screen') {
    for (const binding of Object.values(component.action.initialValues ?? {})) {
      if (binding.kind === 'field') into.add(binding.fieldId)
    }
  }
}

/**
 * Что роли положено читать в этой таблице.
 *
 * Выводится из того, что ей показано: если поле не выводит ни один доступный
 * ей компонент, оно этой роли и не приходит. Так «какие поля можно читать»
 * и «какие роли видят компоненты» оказываются одной настройкой, а не двумя,
 * которые рассинхронизируются на второй неделе.
 *
 * Блоки сводки сюда **не входят** намеренно. Блок не вправе сам себе открыть
 * колонку: иначе «покажи клиенту сумму по себестоимости» молча отправляло бы
 * клиенту себестоимость каждой строки. Блоки считаются на сервере и работают
 * по тому же набору полей, что и всё остальное.
 */
export type FieldPolicy = {
  /**
   * Набор полей закрытый: всё, чего в нём нет, посетителю не положено.
   *
   * У не вошедшего — **всегда**. Состояния «ограничений нет» для него
   * не существует: он видит ровно то, что владелец назвал поимённо.
   *
   * У вошедшего — если приложение показывает строки этой таблицы построчно.
   * Таблицу, которую трогают только блоки сводки или которая нужна ради связи,
   * ограничивать нечего: закрытого набора не существует, подсчёты идут по всем
   * колонкам, а строки в браузер не уезжают вовсе (`showsRows`).
   */
  restricted: boolean
  fields: Set<string>
}

export function fieldPolicy(
  app: App,
  tableId: string,
  visitor: Visitor,
  views: Record<string, { tableId: string; config?: unknown }>,
): FieldPolicy {
  const anonymous = !visitor.authenticated || visitor.roleId === null
  const out = new Set<string>()
  // Не вошедшему набор закрыт всегда, даже если публичных экранов нет вовсе.
  let restricted = anonymous

  for (const screen of app.screens) {
    if (!canOpenScreen(screen, visitor)) continue
    if (screenTable(screen, views) !== tableId) continue
    if (screen.type === 'form' && screen.mode === 'create') continue

    if (anonymous) {
      // Никаких выводов из того, что стоит на экране: только названный список.
      for (const fieldId of publicFieldPolicy(screen)) out.add(fieldId)
      continue
    }

    restricted = true
    const { components } = partsFor(screen, visitor)

    if (screen.type === 'list' || screen.type === 'tiles') {
      for (const id of [
        screen.titleFieldId,
        screen.subtitleFieldId,
        screen.metaFieldId,
        screen.imageFieldId,
        screen.statusFieldId,
      ]) {
        if (id) out.add(id)
      }
      /*
       * Поля поиска — да, поля отбора — нет.
       *
       * Поиск идёт по уже полученным строкам прямо на устройстве, и без этих
       * значений искать не по чему. А отбор представления применяется
       * на сервере, и колонка, по которой он идёт, человеку больше
       * не отдаётся: раньше фильтр «себестоимость больше нуля» делал
       * себестоимость читаемой для всех, кому открыт такой список.
       */
      for (const id of screen.source.searchFieldIds) out.add(id)
    }
    for (const component of components) addComponentFields(component, out)
  }

  // Ownership is checked on the server before projection. A row rule alone
  // does not make its email/company field readable in the browser.

  return { restricted, fields: out }
}

export function readableFields(
  app: App,
  tableId: string,
  visitor: Visitor,
  views: Record<string, { tableId: string; config?: unknown }>,
): Set<string> {
  return fieldPolicy(app, tableId, visitor, views).fields
}

/**
 * Значения полей, положенных роли.
 *
 * Решает не размер набора, а `restricted`. Пустой набор у показанной таблицы
 * значит «показывать нечего», а не «показывать всё»: список, которому не
 * задали ни одной колонки, ничего и не выводит — и отправлять по нему строку
 * целиком нельзя. Раньше эти два случая были неразличимы, и витрина, открытая
 * всем по ссылке, отдавала наружу каждое поле каждой строки.
 */
export function onlyReadable(
  data: Record<string, unknown>,
  policy: FieldPolicy,
): Record<string, unknown> {
  // Таблицу не показывает ни один экран этой роли — отбирать нечего:
  // значения нужны здесь же, на сервере, чтобы посчитать сводку.
  if (!policy.restricted) return data

  const clean: Record<string, unknown> = {}
  for (const [fieldId, value] of Object.entries(data)) {
    if (policy.fields.has(fieldId)) clean[fieldId] = value
  }
  return clean
}

/**
 * Какие строки таблицы вообще попадают к этому человеку.
 *
 * Отвечает на вопрос «до какой строки он может дойти через экраны, которые
 * ему открыты», и отвечает одинаково для всех. Раньше ответов было два:
 * не вошедшему выборку задавало представление и применялась она на сервере,
 * а вошедшему отдавались все его строки, и отбор представления повторял
 * браузер. Второй путь означал, что строка, которую владелец убрал из списка
 * фильтром, всё равно уезжала на устройство — и лежала в исходном коде
 * страницы рядом с той, что показана.
 *
 * Три исхода, и разница между ними существенная:
 *
 * - `gated` — таблицу показывает список или плитка. Строка доходит до человека
 *   тогда и только тогда, когда проходит отбор хотя бы одного такого экрана.
 * - `ungated` — таблицу показывает только карточка или форма, представления
 *   у них нет, и сузить выборку нечем. Ограничивают такую таблицу правила
 *   на строки, а не этот разбор.
 * - `none` — ни один открытый ему экран эту таблицу не показывает. Не уходит
 *   ни одна строка.
 *
 * Не вошедший `ungated` не получает никогда: доказать, что конкретная строка
 * разрешена наружу, можно только названной владельцем выборкой. Публичная
 * карточка без публичного списка показывать нечего — так и задумано.
 */
export type RowReach =
  | { kind: 'gated'; allows: (data: Record<string, unknown>) => boolean }
  | { kind: 'ungated' }
  | { kind: 'none' }

export function rowReach(
  app: App,
  tableId: string,
  views: Record<string, View>,
  fields: readonly Field[],
  visitor: Visitor,
): RowReach {
  const anonymous = !visitor.authenticated || visitor.roleId === null
  const gates: { filter: unknown; extra: unknown }[] = []
  let other = false

  for (const screen of app.screens) {
    if (!canOpenScreen(screen, visitor)) continue
    if (screenTable(screen, views) !== tableId) continue

    if (screen.type === 'form' && screen.mode === 'create') continue

    if (screen.type === 'list' || screen.type === 'tiles') {
      const view = views[screen.source.viewId]
      if (!view || view.tableId !== tableId) continue
      gates.push({ filter: view.config.filter, extra: screen.source.extraFilter })
      continue
    }
    other = true
  }

  if (gates.length === 0) return anonymous || !other ? { kind: 'none' } : { kind: 'ungated' }

  const index = indexFields(fields)
  return {
    kind: 'gated',
    allows: (data) =>
      gates.some(
        (gate) =>
          evalFilter(gate.filter as never, data, index) && evalFilter(gate.extra as never, data, index),
      ),
  }
}

/**
 * Строки, которые можно показать не вошедшему.
 *
 * Частный случай `rowReach`, оставленный отдельно ради мест, где посетитель
 * заведомо посторонний: выдача файла по ссылке и предпросмотр в конструкторе.
 */
export function publicRowGuard(
  app: App,
  tableId: string,
  views: Record<string, View>,
  fields: readonly Field[],
): (data: Record<string, unknown>) => boolean {
  const reach = rowReach(app, tableId, views, fields, ANONYMOUS)
  return reach.kind === 'gated' ? reach.allows : () => false
}

/**
 * Показывает ли приложение строки этой таблицы построчно.
 *
 * Таблица, которую трогают только блоки сводки, в браузер не уезжает вовсе:
 * блоки считаются на сервере, и строки нужны только там. Так число «сумма
 * по себестоимости» перестаёт тащить за собой себестоимость каждой строки.
 */
export function showsRows(
  app: App,
  tableId: string,
  visitor: Visitor,
  views: Record<string, { tableId: string }>,
): boolean {
  return app.screens.some(
    (screen) => canOpenScreen(screen, visitor) && screenTable(screen, views) === tableId,
  )
}

/** Таблица экрана: у списка через представление, у сводки своей нет. */
function screenTable(screen: Screen, views: Record<string, { tableId: string }>): string | null {
  if (screen.type === 'list' || screen.type === 'tiles') return views[screen.source.viewId]?.tableId ?? null
  if (screen.type === 'dashboard') return null
  return screen.tableId
}

/**
 * Поля таблицы, которые роль вправе записать.
 *
 * Тоже выводится из экранов: поле, которого нет в доступной роли форме,
 * не принимается — даже если запрос пришёл мимо интерфейса. Без этого
 * ограничение «клиенту не показываем статус» было бы только про показ:
 * прислать статус в обход формы мог бы кто угодно.
 */
export function writableFields(
  app: App,
  tableId: string,
  visitor: Visitor,
  action: 'create' | 'update',
): Set<string> {
  const out = new Set<string>()
  const mode = action === 'create' ? 'create' : 'edit'

  /*
   * Не вошедший не пишет.
   *
   * Право писать выводится из форм, а форму можно открыть по ссылке — но
   * открыть её и получить право записи в базу это разные вещи. У анонимного
   * отправителя нет подтверждённой почты, и приписать созданную им строку
   * некому: «Почта клиента» в такой заявке — текст, набранный с клавиатуры.
   *
   * Заказ с витрины идёт не здесь, а через подтверждение почты: там человек
   * перестаёт быть посторонним до того, как появится строка, и к моменту
   * записи у него уже есть и почта, и роль, и кабинет.
   */
  if (!visitor.authenticated || visitor.roleId === null) return out

  for (const screen of app.screens) {
    if (screen.type !== 'form' || screen.tableId !== tableId) continue
    if (screen.mode !== mode || !canOpenScreen(screen, visitor)) continue

    for (const component of screen.components) {
      if (component.type !== 'form_field' || !canSeePart(component, visitor)) continue
      out.add(component.fieldId)
    }
  }

  return out
}

/**
 * Поля формы для показа: что человек увидит и заполнит.
 *
 * Отличается от `writableFields` намеренно. Анонимный посетитель форму видит
 * и заполняет, а записывать ему нечего — это два разных вопроса, и склеивать
 * их нельзя: иначе публичная форма либо не нарисуется, либо получит право
 * записи оттого, что нарисовалась.
 */
export function formFields(
  app: App,
  screen: Screen,
  visitor: Visitor,
): Set<string> {
  const out = new Set<string>()
  if (screen.type !== 'form' || !canOpenScreen(screen, visitor)) return out

  for (const component of screen.components) {
    if (component.type !== 'form_field' || !canSeePart(component, visitor)) continue
    out.add(component.fieldId)
  }
  return out
}

export function screensFor(app: App, visitor: Visitor): Screen[] {
  const checkout = !visitor.authenticated ? customerCheckoutIds(app) : new Set<string>()
  return app.screens.filter((screen) => canOpenScreen(screen, visitor) && !checkout.has(screen.id) && !(screen.type === 'form' && screen.mode === 'create' && !acceptsModuleIntake(app, screen.tableId)))
}

/**
 * Первый доступный экран. Нужен, когда стартовый экран роли не открыт:
 * гостю, зашедшему за формой заявки, нельзя показывать пустоту только потому,
 * что домашним назначен список сотрудника.
 */
export function homeScreenFor(app: App, visitor: Visitor): Screen | null {
  const allowed = screensFor(app, visitor)
  const home = allowed.find((screen) => screen.id === app.homeScreenId)
  if (home) return home
  return allowed.find((screen) => screen.tab !== null) ?? allowed[0] ?? null
}

/**
 * Разрешено ли действие над таблицей.
 *
 * Право выводится из экранов, а не хранится отдельно: если в приложении нет
 * ни одной формы создания, открытой этой роли, то и создавать ей нечем —
 * значит, запрос пришёл в обход интерфейса. Это же закрывает подстановку
 * чужого идентификатора таблицы: экраны приложения перечислены наперёд.
 */
export function permits(app: App, tableId: string, action: AppAction, visitor: Visitor): boolean {
  if (action === 'create' && !acceptsModuleIntake(app, tableId)) return false
  // Не вошедший не пишет ни при каких настройках экрана: заказ с витрины
  // проходит через подтверждение почты, а не через это право.
  if (!visitor.authenticated || visitor.roleId === null) return false
  // Storefront / client roles never write without ownership rules.
  // Working defaults (e.g. warehouse staff) keep allow-all when rules are absent.
  if ((visitor.enrolled || isCustomerRole(app, visitor.roleId)) &&
      !app.rowAccessRules.some(rule => rule.tableId === tableId && rule.appliesTo.includes(visitor.roleId!))) return false

  if (action === 'delete') {
    return app.screens.some(
      (screen) =>
        canOpenScreen(screen, visitor) &&
        screen.type === 'detail' &&
        screen.tableId === tableId &&
        screen.access.allowDelete,
    )
  }

  // Право писать — это право написать хоть одно поле: форма без полей,
  // открытая роли, не делает её редактором таблицы.
  return writableFields(app, tableId, visitor, action).size > 0
}

/**
 * Может ли роль присылать файлы. Право выводится из форм: если роли не открыта
 * ни одна форма, то и прикладывать файл ей некуда, а значит запрос пришёл мимо
 * интерфейса.
 */
export function canSubmitFiles(app: App, visitor: Visitor): boolean {
  // Файл — это запись: тот, кто не пишет, и прикладывать ничего не может.
  if (!visitor.authenticated || visitor.roleId === null) return false
  return app.screens.some((screen) => screen.type === 'form' && canOpenScreen(screen, visitor))
}

/** Может ли посетитель вообще что-то увидеть в приложении. */
export function canEnter(app: App, visitor: Visitor): boolean {
  return screensFor(app, visitor).length > 0
}

/**
 * Экраны для роли, очищенные от того, что в них уже не работает.
 *
 * После отбора по ролям часть кнопок ведёт на экраны, которых этой роли
 * не отдали, а часть — на действия, которых ей нельзя. Оставлять их нельзя:
 * кнопка, которая отвечает «недоступно», хуже отсутствующей кнопки. Чистим
 * на сервере, а не в интерфейсе, чтобы в браузер не уезжали чужие адреса
 * экранов и лишние подсказки об устройстве приложения.
 */
export function visibleScreensFor(app: App, visitor: Visitor): Screen[] {
  const kept = screensFor(app, visitor)
  const ids = new Set(kept.map((screen) => screen.id))
  const alive = (screenId: string | null) => (screenId && ids.has(screenId) ? screenId : null)

  const allowedAction = (screen: Screen, action: { type: string; tableId?: string }): boolean => {
    if (action.type === 'open_screen') return true
    const tableId =
      action.tableId ?? ('tableId' in screen ? (screen as { tableId?: string }).tableId : undefined)
    if (!tableId) return true
    if (action.type === 'create_row') return permits(app, tableId, 'create', visitor)
    if (action.type === 'update_row') return permits(app, tableId, 'update', visitor)
    if (action.type === 'delete_row') return permits(app, tableId, 'delete', visitor)
    return true
  }

  return kept.map((screen) => {
    // У сводки компонентов нет — её блоки ведут на экраны, которые уже
    // отобраны по роли, и мёртвых ссылок среди них не остаётся.
    if (screen.type === 'dashboard') {
      return {
        ...screen,
        blocks: screen.blocks.filter((block) => canSeePart(block, visitor)).map((block) => {
          if (block.type === 'list') {
            return {
              ...block,
              onTapScreenId: alive(block.onTapScreenId),
              moreScreenId: alive(block.moreScreenId),
            }
          }
          if (block.type === 'pipeline') return { ...block, onTapScreenId: alive(block.onTapScreenId) }
          if (block.type === 'actions') {
            return { ...block, items: block.items.filter((item) => ids.has(item.screenId)) }
          }
          return block
        }),
      }
    }

    const components = partsFor(screen, visitor).components
      .filter((component) => {
        if (component.type !== 'button') return true
        if (component.action.type === 'open_screen') {
          if (visitor.enrolled && 'tableId' in screen && rulesFor(app, screen.tableId, visitor).length === 0) {
            const open = publicFieldPolicy(screen)
            if (Object.values(component.action.initialValues ?? {}).some(binding => binding.kind === 'field' && !open.has(binding.fieldId))) return false
          }
          return ids.has(component.action.screenId) || !visitor.authenticated && offersCustomerCheckout(app, screen, component.action.screenId)
        }
        return allowedAction(screen, component.action)
      })
      .map((component) =>
        component.type === 'related_list'
          ? { ...component, onTapScreenId: alive(component.onTapScreenId) }
          : component,
      )

    const base = { ...screen, components }

    if (base.type === 'list' || base.type === 'tiles') {
      return { ...base, onTapScreenId: alive(base.onTapScreenId) }
    }
    if (base.type === 'form') {
      return { ...base, successScreenId: alive(base.successScreenId) }
    }
    return base
  })
}
