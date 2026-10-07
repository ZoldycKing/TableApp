import { z } from 'zod'
import { COLORS } from './colors'
import { filterGroupSchema, sortSchema } from './filters'

/**
 * Определение приложения — декларативный JSON-документ.
 * Рантайм его интерпретирует, конструктор редактирует. Кода в определении нет.
 */

// --- Действия ----------------------------------------------------------------

export const ACTION_TYPES = [
  'open_screen',
  'create_row',
  'update_row',
  'delete_row',
  'open_url',
  'call_phone',
  'send_email',
  'go_back',
] as const
export type ActionType = (typeof ACTION_TYPES)[number]

/** Источник значения: константа, поле текущей строки или свойство вошедшего пользователя. */
export const bindingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: z.unknown() }),
  z.object({ kind: z.literal('field'), fieldId: z.string() }),
  z.object({ kind: z.literal('user'), property: z.enum(['email', 'name', 'id']) }),
])
export type Binding = z.infer<typeof bindingSchema>

const actionBase = { id: z.string() }

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ ...actionBase, type: z.literal('open_screen'), screenId: z.string() }),
  z.object({
    ...actionBase,
    type: z.literal('create_row'),
    tableId: z.string(),
    values: z.record(z.string(), bindingSchema).default({}),
  }),
  z.object({
    ...actionBase,
    type: z.literal('update_row'),
    values: z.record(z.string(), bindingSchema).default({}),
  }),
  z.object({ ...actionBase, type: z.literal('delete_row'), confirm: z.boolean().default(true) }),
  z.object({ ...actionBase, type: z.literal('open_url'), source: bindingSchema }),
  z.object({ ...actionBase, type: z.literal('call_phone'), source: bindingSchema }),
  z.object({ ...actionBase, type: z.literal('send_email'), source: bindingSchema }),
  z.object({ ...actionBase, type: z.literal('go_back') }),
])
export type Action = z.infer<typeof actionSchema>

// --- Компоненты --------------------------------------------------------------

export const COMPONENT_TYPES = [
  'heading',
  'text',
  'image',
  'field',
  'button',
  'divider',
  'related_list',
  'gallery',
  'form_field',
  'card',
] as const
export type ComponentType = (typeof COMPONENT_TYPES)[number]

const componentBase = {
  id: z.string(),
  position: z.string(),
  /** Компонент скрывается, если условие не выполняется для текущей строки. */
  visibleWhen: filterGroupSchema.nullable().default(null),
  /**
   * Роли, которым компонент положен. `null` — как у экрана: это умолчание,
   * иначе каждому компоненту пришлось бы перечислять роли заново.
   *
   * Отсюда же берётся право читать и писать поле: если поле не показано роли
   * ни одним компонентом, оно ей и не приходит, и от неё не принимается.
   */
  roles: z.array(z.string()).nullable().default(null),
}

export const componentSchema = z.discriminatedUnion('type', [
  z.object({
    ...componentBase,
    type: z.literal('heading'),
    source: bindingSchema,
    size: z.enum(['s', 'm', 'l']).default('m'),
  }),
  z.object({
    ...componentBase,
    type: z.literal('text'),
    source: bindingSchema,
    style: z.enum(['body', 'caption', 'quote']).default('body'),
  }),
  z.object({
    ...componentBase,
    type: z.literal('image'),
    fieldId: z.string(),
    aspect: z.enum(['square', 'wide', 'tall', 'auto']).default('wide'),
  }),
  z.object({
    ...componentBase,
    type: z.literal('field'),
    fieldId: z.string(),
    label: z.string().nullable().default(null),
    showWhenEmpty: z.boolean().default(false),
  }),
  z.object({
    ...componentBase,
    type: z.literal('button'),
    label: z.string().min(1).max(100),
    action: actionSchema,
    style: z.enum(['primary', 'secondary', 'danger', 'ghost']).default('primary'),
  }),
  z.object({ ...componentBase, type: z.literal('divider') }),
  z.object({
    ...componentBase,
    type: z.literal('related_list'),
    relationFieldId: z.string(),
    titleFieldId: z.string().nullable().default(null),
    subtitleFieldId: z.string().nullable().default(null),
    imageFieldId: z.string().nullable().default(null),
    onTapScreenId: z.string().nullable().default(null),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  z.object({
    ...componentBase,
    type: z.literal('gallery'),
    fieldId: z.string(),
    columns: z.number().int().min(1).max(4).default(2),
  }),
  z.object({
    ...componentBase,
    type: z.literal('form_field'),
    fieldId: z.string(),
    label: z.string().nullable().default(null),
    required: z.boolean().default(false),
    placeholder: z.string().nullable().default(null),
  }),
  z.object({
    ...componentBase,
    type: z.literal('card'),
    titleFieldId: z.string().nullable().default(null),
    subtitleFieldId: z.string().nullable().default(null),
    imageFieldId: z.string().nullable().default(null),
  }),
])
export type Component = z.infer<typeof componentSchema>
export type ComponentOf<T extends ComponentType> = Extract<Component, { type: T }>

// --- Экраны ------------------------------------------------------------------

export const SCREEN_TYPES = ['dashboard', 'list', 'tiles', 'detail', 'form'] as const
export type ScreenType = (typeof SCREEN_TYPES)[number]

/** Экран читает данные из представления базы и может сузить его своим фильтром. */
export const screenSourceSchema = z.object({
  viewId: z.string(),
  extraFilter: filterGroupSchema.nullable().default(null),
  searchFieldIds: z.array(z.string()).default([]),
})

/**
 * Роли пользователей приложения.
 *
 * Роль отвечает на вопрос «что можно»; на вопрос «чьи это строки» отвечает
 * правило доступа, и смешивать их нельзя.
 *
 * Не вошедшего среди ролей нет. Витрину и форму приёма заявок открывает
 * не роль «гость», а признак `public` у самого экрана со списком полей,
 * которые он показывает: список того, что видно постороннему, должен лежать
 * рядом с экраном, а не собираться из ролей в другом конце определения.
 */
/**
 * Ссылка на роль — её идентификатор.
 *
 * Не перечисление: набор ролей задаёт владелец приложения. «Врач», «Пациент»,
 * «Курьер», «Диспетчер» — это его слова, а не наши, и правила должны работать
 * по идентификатору, а не по сравнению с «manager».
 */
export type RoleId = string

/**
 * Гость — не роль из списка, а отсутствие входа.
 *
 * Поэтому он встроенный и в `app.roles` не лежит: будь он обычной записью,
 * его можно было бы удалить — и публичная форма приёма заявок молча
 * перестала бы работать.
 */
export const GUEST_ROLE: RoleId = 'guest'
export const GUEST_ROLE_NAME = 'Гость'

export const appRoleSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(40),
  /**
   * Роль для всех, кто вошёл, но отдельно не перечислен. Без неё пришлось бы
   * вписывать руками каждого пациента и ученика.
   */
  isDefault: z.boolean().default(false),
})
export type AppRole = z.infer<typeof appRoleSchema>

/**
 * Роли нового приложения.
 *
 * Идентификаторы читаемые и намеренно совпадают с прежним перечислением:
 * приложения, созданные до появления настраиваемых ролей, продолжают
 * работать без переписывания своих определений.
 */
export const DEFAULT_APP_ROLES: AppRole[] = [
  { id: 'client', name: 'Клиент', isDefault: true },
  { id: 'staff', name: 'Сотрудник', isDefault: false },
  { id: 'manager', name: 'Ведущий', isDefault: false },
]

/** Роли, которые получают доступ, если владелец ничего не настраивал. */
const DEFAULT_SCREEN_ROLES: RoleId[] = ['client', 'staff', 'manager']

/**
 * Прежде гость был галочкой в списке ролей и стоял в одном ряду с «Клиентом»
 * и «Сотрудником». Это вводило в заблуждение: гость — не роль, а отсутствие
 * входа. Роль отвечает на вопрос «что человеку можно», а у не вошедшего
 * вопрос ровно один — пускать ли его на этот экран.
 *
 * Определения, сохранённые до разделения, читаются дальше: `guest` в списке
 * ролей превращается в `public`.
 */
function withPublic(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const access = value as { roles?: unknown; public?: unknown }
  if (!Array.isArray(access.roles)) return value

  const hadGuest = access.roles.includes(GUEST_ROLE)
  if (!hadGuest && access.public !== undefined) return value

  return {
    ...access,
    public: access.public ?? hadGuest,
    roles: access.roles.filter((role) => role !== GUEST_ROLE),
  }
}

/**
 * Идентификатор, который раньше носил гость. Оставлен **только** ради чтения
 * определений, сохранённых до разделения: в правилах доступа его больше нет
 * и сравнивать с ним ничего нельзя.
 */
export const LEGACY_GUEST_ROLE = GUEST_ROLE

/**
 * Доступ к экрану. Умолчание закрытое: новый экран не должен оказаться
 * открытым всему интернету оттого, что про него забыли.
 */
export const screenAccessSchema = z
  .preprocess(
    withPublic,
    z.object({
      /**
       * Видно без входа. Так собирается витрина: список товаров или услуг,
       * открытый всем по ссылке.
       *
       * Это не право, а видимость. Прав у не вошедшего нет и быть не может:
       * он никто, и приписать созданную им строку некому.
       */
      public: z.boolean().default(false),
      /**
       * Колонки, которые видно без входа. Белый список, и только он.
       *
       * Пусто — значит наружу не уходит ни одно значение, даже если экран
       * открыт по ссылке. Обратное умолчание («публичный экран показывает всё,
       * что на нём есть») стоило бы одной забытой галочки на карточке товара,
       * чтобы выложить в интернет себестоимость и поставщика.
       */
      publicFields: z.array(z.string()).default([]),
      roles: z.array(z.string()).default(DEFAULT_SCREEN_ROLES),
      /**
       * Удаление вынесено отдельно: открыть карточку и стереть запись —
       * разные по последствиям действия, и разрешать их вместе нельзя.
       */
      allowDelete: z.boolean().default(false),
    }),
  )
  .prefault({})
export type ScreenAccess = z.infer<typeof screenAccessSchema>

/**
 * Сводка.
 *
 * Экран, собранный из блоков, а не из одного списка. Это то, чего не хватало
 * больше всего: домашний экран у владельца — это четыре числа, доска и лента
 * последних записей, а не таблица. Блоки намеренно немногословны: каждый
 * отвечает на один вопрос, который человек задаёт себе утром.
 */

/** Что считаем в плитке. */
export const METRIC_KINDS = ['count', 'count_filled', 'sum', 'avg', 'min', 'max'] as const
export type MetricKind = (typeof METRIC_KINDS)[number]

/** За какой срок. Считается по выбранному полю даты. */
export const METRIC_RANGES = ['all', 'today', 'week', 'month', 'quarter', 'year'] as const
export type MetricRange = (typeof METRIC_RANGES)[number]

/**
 * Прежние три ширины. Оставлены ради старых определений: новые блоки
 * занимают заданное число колонок отдельно на каждом размере экрана.
 */
export const BLOCK_SIZES = ['small', 'half', 'full'] as const
export type BlockSize = (typeof BLOCK_SIZES)[number]

/** Сколько колонок в сетке сводки. */
export const GRID_COLUMNS = 12

/**
 * Ширина блока в колонках — отдельно для трёх размеров места.
 *
 * Не пиксели и не три раскладки: определение сводки одно и работает везде.
 * «Десктоп» здесь — это широкое место, а не большой монитор: приложение
 * меряет свой контейнер, а не окно, и в предпросмотре шириной 384 точки
 * ведёт себя как на телефоне.
 */
export const blockSpanSchema = z.object({
  desktop: z.number().int().min(1).max(GRID_COLUMNS).default(6),
  tablet: z.number().int().min(1).max(GRID_COLUMNS).default(6),
  mobile: z.number().int().min(1).max(GRID_COLUMNS).default(12),
})
export type BlockSpan = z.infer<typeof blockSpanSchema>

/** Размер места, под который считается ширина. */
export const DEVICES = ['desktop', 'tablet', 'mobile'] as const
export type Device = (typeof DEVICES)[number]

/** Во что разворачиваются прежние три ширины. */
export const SPAN_BY_SIZE: Record<BlockSize, BlockSpan> = {
  small: { desktop: 3, tablet: 6, mobile: 6 },
  half: { desktop: 6, tablet: 6, mobile: 12 },
  full: { desktop: 12, tablet: 12, mobile: 12 },
}

const blockBase = {
  id: z.string(),
  position: z.string(),
  span: blockSpanSchema.prefault({}),
  /** Роли, которым блок положен. `null` — как у экрана. */
  roles: z.array(z.string()).nullable().default(null),
  /** Заголовок блока словами человека: «Выручка за месяц», а не «СУММА». */
  title: z.string().max(80).default(''),
  /** Строка под заголовком: «без учёта отменённых». */
  description: z.string().max(200).default(''),
}

/**
 * Общее у блоков, которые читают данные.
 *
 * Отбор — тот же движок фильтров, что в таблицах: своего языка у сводки нет.
 * Это **не** граница доступа: правила на строки и права на поля применяются
 * раньше, и фильтр блока может только сузить то, что человеку и так положено.
 */
const sourceBase = {
  source: z.object({ viewId: z.string() }),
  filter: filterGroupSchema.nullable().default(null),
  sorts: z.array(sortSchema).default([]),
}

/**
 * Определения, сохранённые до появления сетки, читаются дальше:
 * прежняя `size` разворачивается в ширины.
 */
function withSpan(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  const block = value as Record<string, unknown>
  if (block.span || typeof block.size !== 'string') return value
  const { size, ...rest } = block
  return { ...rest, span: SPAN_BY_SIZE[size as BlockSize] ?? SPAN_BY_SIZE.half }
}

export const blockSchema = z.preprocess(withSpan, z.discriminatedUnion('type', [
  z.object({
    ...blockBase,
    ...sourceBase,
    type: z.literal('metric'),
    kind: z.enum(METRIC_KINDS).default('count'),
    /** Поле, по которому считаем. Для количества не нужно. */
    fieldId: z.string().nullable().default(null),
    /** Поле даты, по которому отбираем срок. Без него срок не применяется. */
    dateFieldId: z.string().nullable().default(null),
    /**
     * Простой отбор «поле равно значению»: «Новых заявок», «Не оплачено».
     * Полноценный фильтр тут не нужен — сложную выборку человек оформляет
     * представлением, а плитка считает по нему.
     */
    where: z
      .object({ fieldId: z.string(), value: z.unknown().default(null) })
      .nullable()
      .default(null),
    range: z.enum(METRIC_RANGES).default('all'),
    /** Сравнивать с предыдущим таким же сроком. */
    compare: z.boolean().default(false),
    icon: z.string().default('chart'),
    tone: z.enum(COLORS).default('blue'),
    /**
     * Как показать число. `auto` — по настройкам колонки, из которой оно
     * посчитано: рубли остаются рублями без отдельной настройки.
     */
    format: z.enum(['auto', 'plain', 'currency', 'percent']).default('auto'),
  }),
  z.object({
    ...blockBase,
    ...sourceBase,
    type: z.literal('list'),
    limit: z.number().int().min(1).max(20).default(5),
    titleFieldId: z.string().nullable().default(null),
    subtitleFieldId: z.string().nullable().default(null),
    metaFieldId: z.string().nullable().default(null),
    imageFieldId: z.string().nullable().default(null),
    onTapScreenId: z.string().nullable().default(null),
    /** Экран, куда ведёт «Все» в углу блока. */
    moreScreenId: z.string().nullable().default(null),
  }),
  z.object({
    ...blockBase,
    ...sourceBase,
    type: z.literal('pipeline'),
    /** Поле выбора, по которому считаем колонки. */
    stackFieldId: z.string().nullable().default(null),
    /** Чем подписать карточки в колонке. Пусто — только число. */
    cardTitleFieldId: z.string().nullable().default(null),
    /** Сколько карточек показывать в колонке. Ноль — ни одной. */
    cardLimit: z.number().int().min(0).max(10).default(0),
    onTapScreenId: z.string().nullable().default(null),
  }),
  z.object({
    ...blockBase,
    type: z.literal('actions'),
    items: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().min(1).max(40),
          icon: z.string().default('plus'),
          /** Экран приложения. Пусто, если кнопка ведёт по адресу. */
          screenId: z.string().default(''),
          /** Внешний адрес: открывается в новой вкладке. */
          url: z.string().max(400).default(''),
        }),
      )
      .default([]),
  }),
  z.object({
    ...blockBase,
    type: z.literal('note'),
    text: z.string().max(600).default(''),
    style: z.enum(['plain', 'info', 'warning']).default('plain'),
  }),
]))
export type Block = z.infer<typeof blockSchema>
export type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>

const screenBase = {
  id: z.string(),
  appId: z.string(),
  name: z.string().min(1).max(200),
  position: z.string(),
  /** Экран показан во вкладке нижней навигации. */
  tab: z
    .object({ icon: z.string().default('list'), label: z.string().min(1).max(30) })
    .nullable()
    .default(null),
  access: screenAccessSchema,
}

const collectionScreen = {
  titleFieldId: z.string().nullable().default(null),
  subtitleFieldId: z.string().nullable().default(null),
  imageFieldId: z.string().nullable().default(null),
  /**
   * Значение справа: цена, остаток, срок. В карточке товара это второе,
   * на что смотрят после названия, и прятать его в общую подпись — значит
   * заставлять читать строку целиком.
   */
  metaFieldId: z.string().nullable().default(null),
  /**
   * Колонка статуса — плашкой и отдельно от подписи.
   *
   * Раньше статус приходилось ставить подписью, и тогда в строке не
   * оставалось места ни для даты, ни для заказчика: одно поле отвечало
   * и за «что это», и за «на каком этапе». В рабочем списке нужны оба.
   *
   * По ней же собираются вкладки над списком: варианты колонки выбора
   * и есть те состояния, по которым список разбирают глазами.
   */
  statusFieldId: z.string().nullable().default(null),
  onTapScreenId: z.string().nullable().default(null),
}

export const screenSchema = z.discriminatedUnion('type', [
  z.object({
    ...screenBase,
    type: z.literal('dashboard'),
    blocks: z.array(blockSchema).default([]),
  }),
  z.object({
    ...screenBase,
    type: z.literal('list'),
    source: screenSourceSchema,
    ...collectionScreen,
    components: z.array(componentSchema).default([]),
  }),
  z.object({
    ...screenBase,
    type: z.literal('tiles'),
    source: screenSourceSchema,
    ...collectionScreen,
    columns: z.number().int().min(1).max(3).default(2),
    components: z.array(componentSchema).default([]),
  }),
  z.object({
    ...screenBase,
    type: z.literal('detail'),
    tableId: z.string(),
    components: z.array(componentSchema).default([]),
  }),
  z.object({
    ...screenBase,
    type: z.literal('form'),
    tableId: z.string(),
    mode: z.enum(['create', 'edit']).default('create'),
    submitLabel: z.string().default('Сохранить'),
    successScreenId: z.string().nullable().default(null),
    /**
     * Что сказать человеку после отправки, когда переходить некуда.
     *
     * У гостя, оставившего заявку, открытых экранов больше нет: показать ему
     * ту же пустую форму — значит не ответить ему ничего, и он отправит ещё раз.
     */
    successText: z.string().max(200).default(''),
    components: z.array(componentSchema).default([]),
  }),
])
export type Screen = z.infer<typeof screenSchema>
export type ScreenOf<T extends ScreenType> = Extract<Screen, { type: T }>

// --- Приложение --------------------------------------------------------------

/*
 * Режимов два. Прежний email_code пускал в приложение любого, кто знает адрес
 * и имеет почту, — это не режим доступа, а его отсутствие. Сохранённые
 * приложения с ним читаются как allowlist, чтобы не пустить лишних.
 */
export const ACCESS_MODES = ['public', 'allowlist'] as const
export type AccessMode = (typeof ACCESS_MODES)[number]

export const appThemeSchema = z.object({
  accent: z.enum(COLORS).default('blue'),
  scheme: z.enum(['light', 'dark', 'auto']).default('auto'),
  logoKey: z.string().nullable().default(null),
  iconKey: z.string().nullable().default(null),
})
export type AppTheme = z.infer<typeof appThemeSchema>

/**
 * Правило видимости строк для конечных пользователей.
 * Применяется на сервере при отдаче данных, никогда в клиенте.
 */
/**
 * С чем сравнивается поле строки.
 *
 * Почты мало: в работе с юрлицами клиент — это фирма, а заходят от неё
 * три человека, и каждый должен видеть заказы фирмы, а не только свои.
 */
export const ROW_MATCHES = ['email', 'company'] as const
export type RowMatch = (typeof ROW_MATCHES)[number]

export const rowAccessRuleSchema = z.preprocess(
  (value) => {
    // Прежняя форма правила знала только почту.
    if (value && typeof value === 'object' && 'emailFieldId' in value && !('fieldId' in value)) {
      const { emailFieldId, ...rest } = value as { emailFieldId?: unknown }
      return { ...rest, fieldId: emailFieldId, match: 'email' }
    }
    return value
  },
  z.object({
    tableId: z.string(),
    /** Поле строки, которое сравнивается со свойством вошедшего. */
    fieldId: z.string(),
    match: z.enum(ROW_MATCHES).default('email'),
    /**
     * Роли, к которым правило применяется. «Видит только свои строки» — про
     * людей снаружи: клиента и случайного посетителя. Ваши сотрудники должны
     * видеть все обращения, иначе разбирать их некому.
     */
    appliesTo: z.array(z.string()).default(['guest', 'client']),
  }),
)
export type RowAccessRule = z.infer<typeof rowAccessRuleSchema>

/**
 * Запись списка доступа. Раньше это была просто почта — такие записи читаются
 * как сотрудник: именно ими пользовались, пока ролей не было.
 */
export const allowlistEntrySchema = z.preprocess(
  (value) => {
    // Раньше запись была просто адресом, потом — адресом и ролью-перечислением.
    // Оба вида читаются как сотрудник с тем же идентификатором роли.
    if (typeof value === 'string') return { email: value, roleId: 'staff' }
    if (value && typeof value === 'object' && 'role' in value && !('roleId' in value)) {
      const { role, ...rest } = value as { role?: unknown }
      return { ...rest, roleId: typeof role === 'string' ? role : 'staff' }
    }
    return value
  },
  z.object({
    email: z.string(),
    roleId: z.string().default('staff'),
    /**
     * Организация человека. Нужна правилу «видит строки своей фирмы»:
     * у клиента-юрлица заходят несколько человек, и заказы у них общие.
     */
    company: z.string().default(''),
  }),
)
export type AllowlistEntry = z.infer<typeof allowlistEntrySchema>

/**
 * Производственный учёт: что где лежит.
 *
 * Единственное место, где приложение знает про конкретное дело, а не про
 * таблицы вообще. Нужно оно затем, что одна операция «сохранить выпуск»
 * пишет сразу в три таблицы: выпуск, движения склада и связь материала
 * с его движениями. Такой операции в общем движке нет — он умеет создать
 * одну строку.
 *
 * Держится настройка **рядом с приложением**, а не в коде: таблицы и колонки
 * у каждого свои, их выпускает установка шаблона. Без неё действию пришлось бы
 * угадывать колонки по названиям, а названия человек меняет в первый же день.
 *
 * Появится общий способ описывать производные записи — эта настройка станет
 * его частным случаем и уедет отсюда. Пока она одна и названа своим именем,
 * а не притворяется общим механизмом.
 */
export const productionConfigSchema = z.object({
  tables: z.object({
    production: z.string(),
    movements: z.string(),
    norms: z.string(),
    materials: z.string(),
  }),
  /** Колонки таблицы выпуска. */
  run: z.object({
    date: z.string(),
    product: z.string(),
    qty: z.string(),
    defects: z.string(),
    shift: z.string(),
    note: z.string(),
  }),
  /** Колонки таблицы норм. */
  norm: z.object({
    product: z.string(),
    material: z.string(),
    perUnit: z.string(),
    active: z.string(),
  }),
  /** Колонки журнала склада. */
  movement: z.object({
    date: z.string(),
    material: z.string(),
    kind: z.string(),
    qty: z.string(),
    run: z.string(),
    reason: z.string(),
  }),
  /** Колонки материалов. */
  material: z.object({
    name: z.string(),
    unit: z.string(),
    opening: z.string(),
    movements: z.string(),
  }),
  /** Вариант «Производство» в колонке типа движения. */
  movementKindId: z.string(),
  /**
   * Экран ввода выпуска.
   *
   * По нему рантайм узнаёт, что эту форму сохраняет не общее «создать
   * строку», а действие выпуска: строка выпуска плюс движения склада одной
   * транзакцией. Без такой отметки форма выглядела бы обычной, и выпуск
   * сохранялся бы без списаний — тихо и с виду успешно.
   */
  formScreenId: z.string().nullable().default(null),
  /**
   * Экран ручного движения склада: приход, списание, корректировка.
   *
   * Тоже отдельным действием: обычная форма создала бы строку журнала,
   * не добавив её в связь материала, а значит остаток не изменился бы.
   */
  movementScreenId: z.string().nullable().default(null),
})

export type ProductionConfig = z.infer<typeof productionConfigSchema>

export const appSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string().min(1).max(200),
  slug: z.string().min(2).max(64),
  theme: appThemeSchema,
  accessMode: z.preprocess(
    (value) => (value === 'email_code' ? 'allowlist' : value),
    z.enum(ACCESS_MODES).default('allowlist'),
  ),
  /**
   * Роли этого приложения. Лежат здесь, а не отдельной таблицей: роль
   * принадлежит приложению, вместе с ним версионируется на черновик
   * и опубликованное и вместе с ним приезжает из шаблона.
   */
  roles: z.array(appRoleSchema).default([...DEFAULT_APP_ROLES]),
  allowlist: z.array(allowlistEntrySchema).default([]),
  rowAccessRules: z.array(rowAccessRuleSchema).default([]),
  screens: z.array(screenSchema).default([]),
  homeScreenId: z.string().nullable().default(null),
  publishedAt: z.string().nullable().default(null),
  /**
   * Производственный учёт, если приложение выросло из этого шаблона.
   *
   * `null` у всех остальных: общий движок про производство ничего не знает
   * и знать не должен.
   */
  production: productionConfigSchema.nullable().default(null),
})
export type App = z.infer<typeof appSchema>

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug)
}
