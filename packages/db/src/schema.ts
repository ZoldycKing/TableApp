import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  pgSequence,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'


// --- Пользователи и воркспейсы ----------------------------------------------

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  avatarKey: text('avatar_key'),
  /*
   * Второй фактор владельца. Секрет нужен для проверки кодов, поэтому лежит
   * как есть; резервные коды — только хэшами, они равносильны паролю.
   */
  totpSecret: text('totp_secret'),
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
  recoveryCodes: jsonb('recovery_codes').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_key').on(t.email)])

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  businessProfile: jsonb('business_profile').$type<import('@tableapp/schema').BusinessProfile>(),
  plan: text('plan').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('workspaces_slug_key').on(t.slug)])

/** Роли уровня воркспейса: owner, editor, viewer. */
export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('editor'),
  invitedEmail: text('invited_email'),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.userId] }),
  index('workspace_members_user_idx').on(t.userId),
])

/** Одноразовые ссылки для входа. Хранится только хэш токена. */
export const authTokens = pgTable('auth_tokens', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull(),
  purpose: text('purpose').notNull().default('workspace_login'),
  appId: text('app_id'),
  /*
   * Код из письма хранится хэшем вместе со ссылкой: ссылка удобна на телефоне,
   * код — когда письмо открыли не на том устройстве, где начат вход.
   * challengeId связывает попытку с браузером, из которого её запросили,
   * поэтому пересланное письмо сам по себе вход не даёт.
   */
  codeHash: text('code_hash'),
  /** Код уже сверен, но вход не завершён: ждём второй фактор. */
  codeVerifiedAt: timestamp('code_verified_at', { withTimezone: true }),
  /** Что человек выбрал на входе: своё пространство или рабочее приложение. */
  intent: text('intent').notNull().default('owner'),
  challengeId: text('challenge_id'),
  attempts: integer('attempts').notNull().default(0),
  /**
   * Письмо с этим кодом действительно ушло провайдеру.
   *
   * Нужно, чтобы разделить два ограничения: сколько кодов человек получил
   * (считаются только доставленные) и сколько раз он просил письмо (это
   * считает отдельный счётчик частоты). Иначе лежащий почтовый сервис
   * съедал бы лимит кодов, и человек оставался бы без входа из-за нашей
   * неисправности.
   */
  delivered: boolean('delivered').notNull().default(false),
  requestIp: text('request_ip'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('auth_tokens_hash_key').on(t.tokenHash),
  index('auth_tokens_email_idx').on(t.email),
  index('auth_tokens_challenge_idx').on(t.challengeId),
  index('auth_tokens_created_idx').on(t.createdAt),
])

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /* Чем и откуда вошли — чтобы человек узнал своё устройство в списке. */
  userAgent: text('user_agent'),
  ip: text('ip'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sessions_user_idx').on(t.userId)])

/**
 * Журнал входов. Пишем и удачные, и неудачные попытки: подозрительное видно
 * только в сравнении, а человеку важно заметить чужой вход со стороны.
 */
export const authEvents = pgTable('auth_events', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  kind: text('kind').notNull(),
  circuit: text('circuit').notNull().default('member'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('auth_events_email_idx').on(t.email, t.createdAt)])

// --- База: таблицы, поля, строки, представления ------------------------------

export const tables = pgTable('tables', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('table'),
  position: text('position').notNull(),
  /** Поле-заголовок строки. Показывается первым в гриде и в карточках приложения. */
  primaryFieldId: text('primary_field_id'),
  /**
   * Шаблон, из которого выросла таблица. Нужен, чтобы предупредить: строки
   * здесь — примеры, а не данные фирмы, и чтобы уметь убрать их одним нажатием.
   */
  templateId: text('template_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('tables_workspace_idx').on(t.workspaceId, t.position)])

/**
 * Поля — это метаданные. Добавление поля не выполняет DDL и не блокирует таблицу:
 * данные лежат в rows.data под ключом = id поля.
 */
export const fields = pgTable('fields', {
  id: text('id').primaryKey(),
  tableId: text('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  options: jsonb('options').notNull().default({}),
  description: text('description'),
  position: text('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('fields_table_idx').on(t.tableId, t.position),
  uniqueIndex('fields_table_name_key').on(t.tableId, t.name),
])

export const rowSyncRevision = pgSequence('row_sync_revision_seq')
export const rows = pgTable('rows', {
  id: text('id').primaryKey(),
  tableId: text('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  /** Ключи — id полей, не имена: переименование поля не трогает данные. */
  data: jsonb('data').notNull().default({}),
  position: text('position').notNull(),
  /** Оптимистическая блокировка: клиент присылает версию, сервер её проверяет. */
  version: integer('version').notNull().default(0),
  /** Assigned while holding the workspace usage lock; ordered by commit. */
  syncRevision: bigint('sync_revision', { mode: 'number' }).notNull().default(sql`nextval('row_sync_revision_seq')`),
  /**
   * Строка-пример из шаблона. Отмечаем явно: «удалить примеры» обязано
   * удалять ровно то, что положил шаблон, и ничего из внесённого человеком.
   */
  sample: boolean('sample').notNull().default(false),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  /** Мягкое удаление: строку можно вернуть из корзины в течение срока хранения. */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('rows_table_position_idx').on(t.tableId, t.position),
  index('rows_table_updated_idx').on(t.tableId, t.updatedAt),
  index('rows_table_sync_idx').on(t.tableId, t.syncRevision),
])

export const views = pgTable('views', {
  id: text('id').primaryKey(),
  tableId: text('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  config: jsonb('config').notNull().default({}),
  position: text('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('views_table_idx').on(t.tableId, t.position)])

/**
 * Журнал изменений. Пишется с первого дня, хотя UI истории версий появится позже:
 * отмена действий, история и будущие автоматизации вырастают отсюда,
 * а задним числом этот лог не восстановить.
 */
export const rowChanges = pgTable('row_changes', {
  id: text('id').primaryKey(),
  tableId: text('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  rowId: text('row_id').notNull(),
  op: text('op').notNull(),
  /**
   * Адрес анонимного отправителя. Пишется только для заявок от гостя: по нему
   * считается частота обращений, иначе публичная форма — открытая труба.
   * У вошедших есть имя, и адрес для них не собираем.
   */
  actorIp: text('actor_ip'),
  before: jsonb('before'),
  after: jsonb('after'),
  actorId: text('actor_id'),
  actorKind: text('actor_kind').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('row_changes_row_idx').on(t.rowId, t.createdAt),
  index('row_changes_table_idx').on(t.tableId, t.createdAt),
])

// --- Приложения --------------------------------------------------------------

/**
 * Применённые правки из очереди устройств.
 *
 * Нужна для двух вещей. Первое — идемпотентность: связь может оборваться
 * после записи, но до ответа, и повтор не должен создавать дубль. Второе —
 * объяснимость: когда правка не применилась, человек должен увидеть почему,
 * в том числе с другого устройства.
 */
export const mutations = pgTable('mutations', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull(),
  actorId: text('actor_id'),
  actorKind: text('actor_kind').notNull().default('member'),
  tableId: text('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  rowId: text('row_id').notNull(),
  fieldId: text('field_id'),
  op: text('op').notNull(),
  /** Значение, которое человек видел, и то, которое он поставил. */
  base: jsonb('base'),
  next: jsonb('next'),
  status: text('status').notNull(),
  reason: text('reason'),
  /** Часы устройства — только для подписи, в решениях не участвуют. */
  clientAt: timestamp('client_at', { withTimezone: true }),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('mutations_row_idx').on(t.rowId, t.appliedAt),
  index('mutations_device_idx').on(t.deviceId, t.appliedAt),
])

export const apps = pgTable('apps', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  theme: jsonb('theme').notNull().default({}),
  accessMode: text('access_mode').notNull().default('allowlist'),
  allowlist: jsonb('allowlist').notNull().default([]),
  rowAccessRules: jsonb('row_access_rules').notNull().default([]),
  homeScreenId: text('home_screen_id'),
  /** Черновик редактируется, опубликованный снимок отдаётся рантайму. */
  draft: jsonb('draft').notNull().default({}),
  published: jsonb('published'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('apps_slug_key').on(t.slug),
  index('apps_workspace_idx').on(t.workspaceId),
])

/** Конечные пользователи приложений. Отдельный контур: мест не занимают, платы нет. */
export const appUsers = pgTable('app_users', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name'),
  /**
   * Роль, полученная не из списка доступа.
   *
   * Заполняется у того, кто пришёл с витрины и подтвердил почту: владелец
   * его не вписывал, а доступ у него быть должен — иначе он не увидит
   * собственный заказ. Список доступа всегда важнее: если владелец внёс
   * этот адрес, действует его запись, а не эта.
   */
  roleId: text('role_id'),
  /** Откуда взялся: `invite` — владелец внёс, `intake` — пришёл с витрины. */
  joinedVia: text('joined_via').notNull().default('invite'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('app_users_app_email_key').on(t.appId, t.email),
  index('app_users_email_idx').on(t.email),
])

/**
 * Сессия сотрудника заводится на почту, а не на приложение.
 * Право на конкретное приложение перечитывается из списка доступа при каждом
 * запросе: убрали адрес — доступ пропадает сразу, а не через месяц, когда
 * истечёт сессия. Заодно один человек с одной сессией открывает все свои
 * приложения, не вводя код в каждом.
 */
export const staffSessions = pgTable('staff_sessions', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  userAgent: text('user_agent'),
  ip: text('ip'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('staff_sessions_email_idx').on(t.email)])

export const attachments = pgTable('attachments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  uploadedBy: text('uploaded_by'),
  /** Pending/deleting objects remain tracked and charged until removed. */
  state: text('state').notNull().default('ready'),
  /**
   * Где файл используется. Заполняется при сохранении ячейки и нужно не для
   * учёта, а для прав: по ссылке из файла находится строка, и доступ к файлу
   * решается тем же правилом, что доступ к строке.
   */
  tableId: text('table_id'),
  rowId: text('row_id'),
  fieldId: text('field_id'),
  /** Файл, на который не сослалась ни одна ячейка, собирается уборщиком. */
  referenced: boolean('referenced').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('attachments_key_key').on(t.key),
  index('attachments_workspace_idx').on(t.workspaceId),
  index('attachments_row_idx').on(t.rowId),
])

/**
 * Расход пространства: сколько строк, таблиц, приложений и файлов.
 *
 * Снимок, а не живой счётчик. Считать `count(*)` по всем строкам при каждой
 * проверке тарифа — дорого; держать инкремент в каждом месте, где строка
 * появляется, — ненадёжно: таких мест шесть, и шесть шансов забыть означают,
 * что рано или поздно счётчик разойдётся с правдой и никому об этом
 * не скажет. Разошедшийся счётчик хуже пересчитанного.
 *
 * Поэтому здесь лежит результат полного пересчёта, а знает, как считать,
 * ровно одно место в коде. Пересчёт запускается при открытии страницы
 * расхода, после импорта, после разворачивания шаблона и вручную.
 *
 * Когда появятся ограничения, отсюда же берётся быстрый ответ: далеко
 * от потолка — верим снимку, близко — пересчитываем начисто.
 */
export const workspaceUsage = pgTable('workspace_usage', {
  workspaceId: text('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  /** Строки пользовательских таблиц. Служебные сущности сюда не входят. */
  rows: integer('rows').notNull().default(0),
  tables: integer('tables').notNull().default(0),
  /** Только опубликованные: черновик потолок не расходует. */
  publishedApps: integer('published_apps').notNull().default(0),
  /** Байты, а не мегабайты: округлять будем при показе, не при учёте. */
  fileBytes: bigint('file_bytes', { mode: 'number' }).notNull().default(0),
  /** Считается для статистики. На стоимость не влияет и влиять не должен. */
  appUsers: integer('app_users').notNull().default(0),
  /** Когда пересчитано. По нему видно, насколько снимку можно верить. */
  countedAt: timestamp('counted_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Заявки, ожидающие подтверждения почты.
 *
 * Отдельная таблица, а не строка в рабочей таблице: неподтверждённая заявка
 * не должна попадать ни в сводки, ни в списки, ни в журнал изменений. До тех
 * пор, пока человек не подтвердил свою почту, записи не существует.
 *
 * Прав здесь не хранится **намеренно**. Ни роли, ни списка полей: за время,
 * пока человек ищет письмо, владелец мог убрать поле или закрыть форму, и
 * доверять тому, что было позволено десять минут назад, нельзя. После входа
 * всё считается заново по текущему определению приложения.
 *
 * Подготовлено под подключение рассылки и пока никем не заполняется.
 */
export const pendingSubmissions = pgTable('pending_submissions', {
  /** Криптослучайный одноразовый ключ: он же ссылка в письме. */
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  /** Экран-форма, с которого пришли: по нему пересчитываются права. */
  screenId: text('screen_id').notNull(),
  tableId: text('table_id').notNull(),
  /** Что человек ввёл. Сырые значения, ещё не приведённые к типам колонок. */
  values: jsonb('values').notNull(),
  /** Почта, которую он указал для подтверждения. */
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Проставляется при использовании: ключ одноразовый. */
  usedAt: timestamp('used_at', { withTimezone: true }),
}, (t) => [
  index('pending_submissions_app_idx').on(t.appId),
  index('pending_submissions_expires_idx').on(t.expiresAt),
])

/**
 * Что уже импортировано.
 *
 * Строка на лист книги. Нужна ровно для одного: повтор не должен задваивать
 * данные. Импорт — это сотни строк одним нажатием, и здесь дороже всего
 * ошибиться дважды: связь оборвалась после записи, но до ответа, человек
 * нажал ещё раз — и в таблице два комплекта, которые потом разбирают руками.
 *
 * Ключ приходит от клиента (`runId` на запуск импорта, имя листа внутри него)
 * и вставляется в той же транзакции, что и сами строки. Второй заход упирается
 * в уникальный индекс, ничего не пишет и получает результат первого: какая
 * таблица и сколько строк. Так же гасится и двойное нажатие — второй запрос
 * ждёт первого на блокировке индекса.
 *
 * Не откатилось — не записано: неудачная транзакция уносит и эту строку,
 * поэтому повтор после ошибки разрешён и нужен.
 */
export const importRuns = pgTable('import_runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  /** Один запуск импорта: книга, выбранная человеком, и её листы. */
  runId: text('run_id').notNull(),
  /** Имя листа книги или имя файла CSV. */
  sheet: text('sheet').notNull(),
  /** Куда легло. Таблицу могли потом удалить — ссылку это не держит. */
  tableId: text('table_id').references(() => tables.id, { onDelete: 'set null' }),
  tableName: text('table_name').notNull(),
  /** `create` — таблица создана импортом, `append` — строки дописаны. */
  mode: text('mode').notNull(),
  added: integer('added').notNull(),
  actorId: text('actor_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('import_runs_key_idx').on(t.workspaceId, t.runId, t.sheet),
  index('import_runs_workspace_idx').on(t.workspaceId, t.createdAt),
])

// --- Подписка и платежи ------------------------------------------------------

/**
 * Оплаченный тариф пространства.
 *
 * Отдельно от `workspaces.plan` намеренно. В `plan` лежит тариф, который
 * действует **сейчас**, — по нему считаются потолки, и трогать его должен
 * один код. Здесь лежит то, за что заплачено: до какого числа и каким
 * платежом. Когда оплаченный срок кончается, пространство возвращается
 * на бесплатный тариф, но ничего не удаляется и не выключается: читать,
 * править и выгружать можно всегда, ограничение действует только на рост.
 *
 * Автопродления нет. Его не бывает без сохранённого способа оплаты, а это
 * отдельное согласие человека и отдельная работа с провайдером. Поле оставлено,
 * чтобы не переделывать таблицу, когда до него дойдёт дело.
 */
export const subscriptions = pgTable('subscriptions', {
  workspaceId: text('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  plan: text('plan').notNull(),
  /** `active` — срок идёт, `ended` — кончился, `refunded` — деньги вернули. */
  status: text('status').notNull().default('active'),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  autoRenew: boolean('auto_renew').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Платежи за подписку.
 *
 * Запись заводится до похода к провайдеру: её идентификатор и служит ключом
 * идемпотентности, и возвращается в метаданных платежа. Поэтому повторное
 * уведомление, уведомление не по порядку и повторное нажатие кнопки приводят
 * к одному и тому же состоянию.
 *
 * Сумма хранится в копейках целым числом: рубли с копейками дробным числом —
 * это способ однажды выставить счёт на 1989,9999999 рубля.
 */
export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  /** Тариф и срок, за которые платят. Цену берём из конфигурации, не от клиента. */
  plan: text('plan').notNull(),
  months: integer('months').notNull().default(1),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('RUB'),
  /** `pending` → `succeeded` | `canceled`; из `succeeded` — только в `refunded`. */
  status: text('status').notNull().default('pending'),
  /** Чем платили: `yookassa` или `test` — проверочный контур без денег. */
  provider: text('provider').notNull(),
  providerId: text('provider_id'),
  confirmationUrl: text('confirmation_url'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  /**
   * Время последнего состояния у провайдера. По нему отбрасываются уведомления,
   * пришедшие не по порядку: сеть не обещает очерёдность.
   */
  providerAt: timestamp('provider_at', { withTimezone: true }),
  actorId: text('actor_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('payments_provider_idx').on(t.providerId),
  index('payments_workspace_idx').on(t.workspaceId, t.createdAt),
])
