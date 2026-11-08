import type { App, AppRole, Block, Component, RoleId, Screen } from '@tableapp/schema'
import { newBlock, newId, positionSequence } from '@tableapp/schema'
import type { BuiltField, BuiltTemplate } from './build'
import { PRODUCTION_CANCEL_WARNING } from '../production-copy'

/**
 * Приложение производственного учёта поверх собранных таблиц.
 *
 * Общий сборщик делает приложение из **одной** таблицы: список, карточка,
 * форма, сводка. Здесь таблиц пять, и смотрят в них два разных человека.
 * Начальнику производства нужен один экран — ввод выпуска; директору нужно
 * всё остальное, и в первую очередь сводка. Собрать это переключателями
 * в конструкторе можно, но это тридцать с лишним действий в пяти местах,
 * и до конца доходят единицы. Поэтому шаблон приносит приложение настроенным.
 *
 * Модуль чистый: ни базы, ни запроса. Значит, права ролей и состав экранов
 * проверяются тестом — а неверно розданное право не кричит, оно просто
 * однажды показывает начальнику смены себестоимость.
 */

/**
 * Роли названы по делу, а не по движку.
 *
 * Идентификаторы латиницей: они уезжают в правила доступа и в ссылки,
 * а названия человек меняет в первый же день, и правила ломаться от этого
 * не должны.
 */
export const DIRECTOR: RoleId = 'director'
export const FOREMAN: RoleId = 'foreman'

/**
 * Умолчание — начальник производства, а не директор.
 *
 * Роль по умолчанию достаётся всякому, кого впустили, но отдельно не назвали.
 * Ошибиться здесь можно только в одну сторону безопасно: лишний человек
 * увидит ввод выпуска и остатки, а не себестоимость и сводку по браку.
 */
function rolesOf(production: NonNullable<BuiltTemplate['production']>): AppRole[] {
  return [
    { id: DIRECTOR, name: production.copy.director, isDefault: false },
    { id: FOREMAN, name: production.copy.operator, isDefault: true },
  ]
}

const BOTH: RoleId[] = [DIRECTOR, FOREMAN]
const ONLY_DIRECTOR: RoleId[] = [DIRECTOR]

/**
 * Доступ к экрану. Закрыто снаружи всегда: производственный учёт — это
 * внутренние числа, и ни один его экран не открывается по ссылке.
 */
function access(roles: RoleId[], allowDelete = false) {
  return { public: false, publicFields: [] as string[], roles, allowDelete }
}

type Ctx = {
  app: App
  built: BuiltTemplate
  production: NonNullable<BuiltTemplate['production']>
}

function fieldsOf(ctx: Ctx, tableId: string): BuiltField[] {
  return ctx.built.fields.filter((field) => field.tableId === tableId)
}

function fieldByName(ctx: Ctx, tableId: string, name: string): BuiltField {
  const found = fieldsOf(ctx, tableId).find((field) => field.name === name)
  if (!found) throw new Error(`Производственный шаблон: нет колонки «${name}»`)
  return found
}

/** Колонки, которые человек заполняет руками: вычисляемые в форму не идут. */
const COMPUTED = new Set(['formula', 'rollup', 'lookup', 'count', 'created_by', 'created_time', 'updated_by', 'updated_time', 'autonumber'])

function formFields(ctx: Ctx, tableId: string, only?: string[]): Component[] {
  const fields = fieldsOf(ctx, tableId).filter(
    (field) => !COMPUTED.has(field.type) && (!only || only.includes(field.id)),
  )
  const positions = positionSequence(fields.length)
  return fields.map((field, index) => ({
    id: newId('component'),
    position: positions[index]!,
    visibleWhen: null,
    roles: null,
    type: 'form_field' as const,
    fieldId: field.id,
    label: field.name === 'Произведено' ? 'Годных изделий' : null,
    required: false,
    placeholder: null,
  }))
}

/**
 * Колонка-подстановка, повторяющая связь рядом с собой.
 *
 * Формула заголовка не умеет доставать название из связи и берёт его
 * подстановкой. На карточке же связь и так показана названием, и второе
 * такое же поле читается как ошибка: «Продукт: Пивной пакет 2 л. Название
 * изделия: Пивной пакет 2 л». В таблице такая колонка полезна — по ней ищут
 * и сортируют, — а на карточке она лишняя.
 */
function repeatsRelation(ctx: Ctx, field: BuiltField, shown: ReadonlySet<string>): boolean {
  if (field.type !== 'lookup') return false
  const options = field.options as { relationFieldId?: string; targetFieldId?: string }
  if (!options.relationFieldId || !shown.has(options.relationFieldId)) return false

  const relation = ctx.built.fields.find((item) => item.id === options.relationFieldId)
  const target = (relation?.options as { tableId?: string } | undefined)?.tableId
  const table = ctx.built.tables.find((item) => item.id === target)
  return Boolean(table && table.primaryFieldId === options.targetFieldId)
}

/** Компоненты карточки без полей, повторяющих соседнюю связь. */
export function withoutRepeats(ctx: Ctx, tableId: string, components: Component[]): Component[] {
  const shown = new Set(
    components.flatMap((component) => (component.type === 'field' ? [component.fieldId] : [])),
  )
  const hidden = new Set(
    fieldsOf(ctx, tableId)
      .filter((field) => repeatsRelation(ctx, field, shown))
      .map((field) => field.id),
  )
  return components.filter(
    (component) => component.type !== 'field' || !hidden.has(component.fieldId),
  )
}

/** Карточка: заголовок и все колонки строкой под ним. */
function cardComponents(ctx: Ctx, tableId: string, titleFieldId: string): Component[] {
  const fields = fieldsOf(ctx, tableId)
  const positions = positionSequence(fields.length + 1)
  const components: Component[] = [
    {
      id: newId('component'),
      position: positions[0]!,
      visibleWhen: null,
      roles: null,
      type: 'heading',
      source: { kind: 'field', fieldId: titleFieldId },
      size: 'l',
    },
  ]
  let cursor = 1
  for (const field of fields) {
    if (field.id === titleFieldId) continue
    components.push({
      id: newId('component'),
      position: positions[cursor++]!,
      visibleWhen: null,
      roles: null,
      type: 'field',
      fieldId: field.id,
      label: null,
      showWhenEmpty: false,
    })
  }
  return components
}

type Pair = { list: Screen; card: Screen }

/**
 * Список и карточка для одной таблицы.
 *
 * Тот же состав, что даёт общий сборщик, но для таблицы, которая ему
 * не досталась: приложение он собирает по одной, а справочников здесь четыре.
 */
function pairFor(
  ctx: Ctx,
  opts: {
    tableId: string
    viewId: string
    listName: string
    cardName: string
    tab: { icon: string; label: string } | null
    roles: RoleId[]
    titleFieldId: string
    subtitleFieldId?: string | null
    metaFieldId?: string | null
    statusFieldId?: string | null
    searchFieldIds?: string[]
  },
): Pair {
  const cardId = newId('screen')
  return {
    list: {
      id: newId('screen'),
      appId: ctx.app.id,
      name: opts.listName,
      position: 'a',
      tab: opts.tab,
      access: access(opts.roles),
      type: 'list',
      source: {
        viewId: opts.viewId,
        extraFilter: null,
        searchFieldIds: opts.searchFieldIds ?? [opts.titleFieldId],
      },
      titleFieldId: opts.titleFieldId,
      subtitleFieldId: opts.subtitleFieldId ?? null,
      imageFieldId: null,
      metaFieldId: opts.metaFieldId ?? null,
      statusFieldId: opts.statusFieldId ?? null,
      onTapScreenId: cardId,
      components: [],
    },
    card: {
      id: cardId,
      appId: ctx.app.id,
      name: opts.cardName,
      position: 'a',
      tab: null,
      access: access(opts.roles),
      type: 'detail',
      tableId: opts.tableId,
      components: withoutRepeats(ctx, opts.tableId, cardComponents(ctx, opts.tableId, opts.titleFieldId)),
    },
  }
}

/** Блок сводки нужного вида с поправками. */
function block<T extends Block['type']>(
  type: T,
  viewId: string,
  patch: Partial<Extract<Block, { type: T }>>,
): Block {
  const base = newBlock(type, { id: newId('component'), position: 'a', viewId })
  return { ...base, ...patch } as Block
}

/**
 * Сводка директора.
 *
 * Три числа, список материалов на исходе и лента последних выпусков —
 * ровно те вопросы, которые задают утром: сколько сделали, сколько испортили
 * и чего скоро не хватит. Ничего сверх этого: сводка, в которую надо
 * вчитываться, не сводка.
 */
function dashboardBlocks(ctx: Ctx): Block[] {
  const { production } = ctx
  const runTitle = fieldByName(ctx, production.tables.production, 'Выпуск').id
  const materialTitle = production.material.name

  const blocks: Block[] = [
    block('metric', production.views.production, {
      title: 'Произведено сегодня',
      description: 'Годных единиц по дате выпуска',
      kind: 'sum',
      fieldId: production.run.qty,
      dateFieldId: production.run.date,
      range: 'today',
      icon: 'box',
      tone: 'blue',
      format: 'plain',
      span: { desktop: 4, tablet: 6, mobile: 12 },
    }),
    block('metric', production.views.production, {
      title: 'Брак сегодня',
      description: 'Единиц, ушедших в брак',
      kind: 'sum',
      fieldId: production.run.defects,
      dateFieldId: production.run.date,
      range: 'today',
      icon: 'bell',
      tone: 'red',
      format: 'plain',
      span: { desktop: 4, tablet: 6, mobile: 12 },
    }),
    /*
     * Третья плитка считает по представлению «Ниже нормы», а не по фильтру
     * блока: отбор уже описан в таблице, и держать его в двух местах —
     * значит однажды поправить одно и забыть другое.
     */
    block('metric', production.views.low, {
      title: 'Ниже минимального остатка',
      description: 'Остаток меньше минимального',
      kind: 'count',
      range: 'all',
      icon: 'truck',
      tone: 'amber',
      format: 'plain',
      span: { desktop: 4, tablet: 12, mobile: 12 },
    }),
    block('list', production.views.low, {
      title: 'Пора закупать',
      description: 'Материалы, остаток которых ниже минимума',
      limit: 5,
      titleFieldId: materialTitle,
      subtitleFieldId: production.material.unit,
      metaFieldId: production.material.stock,
      span: { desktop: 6, tablet: 12, mobile: 12 },
    }),
    block('list', production.views.production, {
      title: 'Последние выпуски',
      limit: 5,
      titleFieldId: runTitle,
      subtitleFieldId: production.run.date,
      metaFieldId: production.run.qty,
      span: { desktop: 6, tablet: 12, mobile: 12 },
    }),
  ]

  const positions = positionSequence(blocks.length)
  return blocks.map((item, index) => ({ ...item, position: positions[index]! }))
}

/**
 * Приложение производственного учёта.
 *
 * На входе — приложение, собранное общим сборщиком по таблице выпуска,
 * и разложенный шаблон. На выходе — то же приложение с ролями, экранами
 * справочников и настройкой, по которой рантайм узнаёт форму выпуска.
 */
export function asProduction(app: App, built: BuiltTemplate): App {
  const production = built.production
  if (!production) return app

  const ctx: Ctx = { app, built, production }
  const { tables, views } = production

  const generatedDashboard = app.screens.find((screen) => screen.type === 'dashboard')
  const generatedList = app.screens.find((screen) => screen.type === 'list')
  const generatedCard = app.screens.find((screen) => screen.type === 'detail')
  const generatedCreate = app.screens.find((screen) => screen.type === 'form' && screen.mode === 'create')
  const generatedEdit = app.screens.find((screen) => screen.type === 'form' && screen.mode === 'edit')
  if (
    !generatedDashboard ||
    generatedDashboard.type !== 'dashboard' ||
    !generatedList ||
    generatedList.type !== 'list' ||
    !generatedCard ||
    generatedCard.type !== 'detail' ||
    !generatedCreate ||
    generatedCreate.type !== 'form' ||
    !generatedEdit ||
    generatedEdit.type !== 'form'
  ) {
    return app
  }

  const runTitleId = fieldByName(ctx, tables.production, 'Выпуск').id
  const movementTitleId = fieldByName(ctx, tables.movements, 'Движение').id
  const normTitleId = fieldByName(ctx, tables.norms, 'Норма').id
  const productTitleId = production.products.name

  /*
   * Форма выпуска — главный экран начальника производства.
   *
   * Колонки те же, что собрал общий сборщик, но порядок и подписи переписаны
   * под того, кто стоит у станка: сначала что и сколько, потом брак, смена
   * и комментарий. Сохраняет её не общее «создать строку», а действие выпуска:
   * строка выпуска плюс движения склада одной транзакцией.
   */
  const runForm: Screen = {
    ...generatedCreate,
    name: production.copy.formName,
    tab: { icon: 'plus', label: 'Выпуск' },
    access: access(BOTH),
    submitLabel: production.copy.submitLabel,
    successScreenId: null,
    successText: 'Выпуск сохранён, материалы списаны.',
    components: formFields(ctx, tables.production),
  }

  /*
   * Править выпуск после сохранения нельзя — кроме комментария.
   *
   * Списания посчитаны один раз и записаны числами. Измени кто-нибудь
   * количество задним числом, и журнал склада разошёлся бы с выпуском молча:
   * сверху 25 000, снизу списано на 20 000. Поэтому форма правки оставляет
   * одно поле, а ошибочный выпуск удаляют целиком — вместе с его движениями.
   */
  const commentForm: Screen = {
    ...generatedEdit,
    name: 'Комментарий к выпуску',
    access: access(BOTH),
    submitLabel: 'Сохранить комментарий',
    components: formFields(ctx, tables.production, [production.run.note]),
  }

  const runList: Screen = {
    ...generatedList,
    name: 'Выпуски',
    tab: { icon: 'list', label: 'Выпуски' },
    access: access(BOTH),
    titleFieldId: runTitleId,
    subtitleFieldId: production.run.date,
    metaFieldId: production.run.qty,
    statusFieldId: production.run.shift,
    onTapScreenId: generatedCard.id,
    source: {
      ...generatedList.source,
      viewId: views.production,
      searchFieldIds: [runTitleId],
    },
  }

  /*
   * Отмена выпуска — отдельный экран, и только директору.
   *
   * Право удалять в TableApp живёт на экране целиком: разрешить его
   * на общей карточке значило бы разрешить и начальнику производства,
   * потому что карточка у них одна. Поэтому отмена вынесена на свой экран,
   * закрытый ролью, — а сервер проверяет ровно это, не кнопку.
   *
   * Отменять приходится по-настоящему: исправить количество в сохранённом
   * выпуске нельзя, списания уже записаны числами. Вместе с выпуском уходят
   * и они, и остаток возвращается к прежнему.
   */
  const cancelScreen: Screen = {
    id: newId('screen'),
    appId: app.id,
    name: 'Отмена выпуска',
    position: 'a',
    tab: null,
    access: access(ONLY_DIRECTOR, true),
    type: 'detail',
    tableId: tables.production,
    components: [
      {
        id: newId('component'),
        position: 'a',
        visibleWhen: null,
        roles: null,
        type: 'heading',
        source: { kind: 'field', fieldId: runTitleId },
        size: 'm',
      },
      {
        id: newId('component'),
        position: 'b',
        visibleWhen: null,
        roles: null,
        type: 'text',
        source: {
          kind: 'literal',
          value: PRODUCTION_CANCEL_WARNING,
        },
        style: 'body',
      },
      {
        id: newId('component'),
        position: 'c',
        visibleWhen: null,
        roles: null,
        type: 'button',
        label: 'Отменить выпуск',
        style: 'danger',
        action: { id: newId('action'), type: 'delete_row', confirm: true },
      },
    ],
  }

  const runCard: Screen = {
    ...generatedCard,
    name: 'Карточка выпуска',
    access: access(BOTH),
    components: [
      ...withoutRepeats(ctx, tables.production, generatedCard.components),
      {
        id: newId('component'),
        position: 'zz',
        visibleWhen: null,
        roles: ONLY_DIRECTOR,
        type: 'button',
        label: 'Отменить выпуск',
        style: 'ghost',
        action: { id: newId('action'), type: 'open_screen', screenId: cancelScreen.id },
      },
    ],
  }

  const materials = pairFor(ctx, {
    tableId: tables.materials,
    viewId: views.materials,
    listName: 'Материалы',
    cardName: 'Карточка материала',
    tab: { icon: 'box', label: 'Материалы' },
    roles: BOTH,
    titleFieldId: production.material.name,
    subtitleFieldId: production.material.unit,
    metaFieldId: production.material.stock,
  })

  const movements = pairFor(ctx, {
    tableId: tables.movements,
    viewId: views.movements,
    listName: 'Журнал склада',
    cardName: 'Карточка движения',
    tab: { icon: 'truck', label: 'Журнал' },
    roles: BOTH,
    titleFieldId: movementTitleId,
    subtitleFieldId: production.movement.date,
    metaFieldId: production.movement.qty,
    statusFieldId: production.movement.kind,
  })

  /*
   * Ручное движение — тоже отдельным действием, а не обычной формой.
   *
   * Остаток материала считается свёрткой по связи «Материал → Движения»,
   * а обратную сторону связи движок не ведёт. Обычная форма создала бы
   * строку журнала, которую свёртка не увидит: приход записан, остаток
   * прежний. Поэтому у формы своё действие, и оно связь заполняет.
   */
  const movementForm: Screen = {
    id: newId('screen'),
    appId: app.id,
    name: 'Движение склада',
    position: 'a',
    tab: null,
    access: access(ONLY_DIRECTOR),
    type: 'form',
    tableId: tables.movements,
    mode: 'create',
    submitLabel: 'Записать движение',
    successScreenId: movements.list.id,
    successText: '',
    components: [
      /*
       * Про знак сказано прямо на форме. Остаток — это сумма движений,
       * и списание обязано уменьшать её само: иначе пришлось бы разбирать
       * тип движения в каждом расчёте, а завести новый тип стало бы
       * невозможно без правки кода.
       */
      {
        id: newId('component'),
        position: 'A',
        visibleWhen: null,
        roles: null,
        type: 'text',
        source: {
          kind: 'literal',
          value:
            'Приход записывается со знаком плюс, списание — со знаком минус. ' +
            'Остаток материала считается как начальный плюс все его движения.',
        },
        style: 'body',
      },
      ...formFields(ctx, tables.movements, [
      production.movement.date,
      production.movement.material,
      production.movement.kind,
      production.movement.qty,
      production.movement.reason,
    ]),
    ],
  }

  const norms = pairFor(ctx, {
    tableId: tables.norms,
    viewId: views.norms,
    listName: 'Нормы расхода',
    cardName: 'Карточка нормы',
    tab: null,
    roles: ONLY_DIRECTOR,
    titleFieldId: normTitleId,
    subtitleFieldId: production.norm.material,
    metaFieldId: production.norm.perUnit,
  })

  const normForm: Screen = {
    id: newId('screen'),
    appId: app.id,
    name: 'Новая норма',
    position: 'a',
    tab: null,
    access: access(ONLY_DIRECTOR),
    type: 'form',
    tableId: tables.norms,
    mode: 'create',
    submitLabel: 'Добавить норму',
    successScreenId: norms.list.id,
    successText: '',
    components: formFields(ctx, tables.norms),
  }

  const products = pairFor(ctx, {
    tableId: production.products.table,
    viewId: (() => {
      const view = built.views.find(
        (candidate) => candidate.tableId === production.products.table && candidate.name === 'Вся продукция',
      )
      return view?.id ?? built.views.find((candidate) => candidate.tableId === production.products.table)!.id
    })(),
    listName: 'Продукция',
    cardName: 'Карточка изделия',
    tab: null,
    /*
     * Справочник изделий открыт обоим, хотя вкладки ему не досталось.
     *
     * Иначе начальнику производства не из чего выбирать в форме выпуска:
     * подписи связанных строк выдаются только по таблицам, до которых человек
     * может дойти, — и это верно, название строки такие же данные, как сама
     * строка. Без доступа список изделий в форме оказался бы пустым.
     */
    roles: BOTH,
    titleFieldId: productTitleId,
  })

  /*
   * Кнопки на сводке заменяют вкладки справочникам.
   *
   * Вкладок на телефоне помещается пять, и отдавать две из них нормам
   * и продукции значило бы выдавить журнал склада — а в него заглядывают
   * каждый день, в отличие от справочника изделий.
   */
  const actions = block('actions', '', {
    title: 'Справочники',
    span: { desktop: 12, tablet: 12, mobile: 12 },
    items: [
      { id: newId('component'), label: 'Движение склада', icon: 'truck', screenId: movementForm.id, url: '' },
      { id: newId('component'), label: 'Нормы расхода', icon: 'clipboard', screenId: norms.list.id, url: '' },
      { id: newId('component'), label: 'Продукция', icon: 'box', screenId: products.list.id, url: '' },
    ],
  })

  const dashboard: Screen = {
    ...generatedDashboard,
    name: 'Сводка',
    tab: { icon: 'home', label: 'Сводка' },
    access: access(ONLY_DIRECTOR),
    blocks: (() => {
      const all = [...dashboardBlocks(ctx), actions]
      const positions = positionSequence(all.length)
      return all.map((item, index) => ({ ...item, position: positions[index]! }))
    })(),
  }

  /*
   * Порядок экранов — это и порядок вкладок, и то, куда попадает человек,
   * которому домашний экран не открыт. Директор приходит на сводку,
   * начальник производства — на ввод выпуска: первый доступный ему экран
   * с вкладкой.
   */
  const screens: Screen[] = [
    dashboard,
    runForm,
    runList,
    runCard,
    commentForm,
    cancelScreen,
    materials.list,
    materials.card,
    movements.list,
    movements.card,
    movementForm,
    norms.list,
    norms.card,
    normForm,
    products.list,
    products.card,
  ]
  const positions = positionSequence(screens.length)

  return {
    ...app,
    roles: rolesOf(production),
    // Учёт внутренний: снаружи не видно ничего, вход только по списку.
    accessMode: 'allowlist',
    homeScreenId: dashboard.id,
    screens: screens.map((screen, index) => ({ ...screen, position: positions[index]! })),
    production: {
      stock: null,
      tables: production.tables,
      run: production.run,
      norm: production.norm,
      movement: production.movement,
      material: {
        name: production.material.name,
        unit: production.material.unit,
        opening: production.material.opening,
        movements: production.material.movements,
        stock: production.material.stock,
        min: production.material.min,
      },
      movementKindId: production.movementKindId,
      formScreenId: runForm.id,
      movementScreenId: movementForm.id,
    },
  }
}
