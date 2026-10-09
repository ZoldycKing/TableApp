import type { Color, FieldType, RollupFn, ViewType } from '@tableapp/schema'

/**
 * Описание шаблона.
 *
 * Шаблон — это не файл и не «демо-аккаунт», а набор таблиц, который
 * разворачивается в рабочее пространство человека и с первой секунды
 * принадлежит ему: поля переименовываются, колонки добавляются, примеры
 * удаляются. Поэтому здесь нет идентификаторов — они выпускаются при
 * установке, чтобы два человека, взявшие один шаблон, не делили ничего.
 *
 * Поля и таблицы адресуются короткими ключами, понятными при чтении:
 * `{ table: 'zayavki', field: 'status' }`. Ключи живут только внутри
 * описания и в базу не попадают.
 */

/** Дата в примере задаётся смещением от сегодня: данные не устаревают. */
export type RelativeDay = { days: number; hour?: number; minute?: number }

export type TemplateValue =
  | string
  | number
  | boolean
  | null
  | RelativeDay
  /** Ссылка на строку другой таблицы шаблона по её ключу. */
  | { rowKey: string }
  | { rowKeys: string[] }

export function inDays(days: number, hour = 10, minute = 0): RelativeDay {
  return { days, hour, minute }
}

export function isRelativeDay(value: unknown): value is RelativeDay {
  return typeof value === 'object' && value !== null && 'days' in value
}

export type TemplateChoice = { name: string; color: Color }

export type TemplateField = {
  key: string
  name: string
  type: FieldType
  /** Пояснение для подсказки (i): зачем поле и что с ним делать. */
  help?: string
  /** Варианты для полей выбора — задаются именами, идентификаторы выпускаются при установке. */
  choices?: TemplateChoice[]
  /** Настройки числа, даты и прочего — как в FIELD_OPTIONS соответствующего типа. */
  options?: Record<string, unknown>
  /** Связь: ключ таблицы шаблона. */
  relationTable?: string
  allowMultiple?: boolean
  /** Lookup и Rollup: через какое поле-связь и какое поле на той стороне. */
  through?: string
  target?: string
  fn?: RollupFn
  /** Формула: имена полей в фигурных скобках, как их видит человек. */
  expression?: string
  /** Начальное значение числа из связанной строки; после сохранения не пересчитывается. */
  initialFrom?: { through: string; target: string }
}

export type TemplateView = {
  name: string
  type: ViewType
  /** Поле группировки для доски. */
  stackBy?: string
  /** Обложка для галереи. */
  coverBy?: string
  /** Поле даты для календаря. */
  dateBy?: string
  /** Простой фильтр представления: «показывать только то, что важно». */
  filter?: { field: string; op: 'is' | 'is_not' | 'lt' | 'lte' | 'gt' | 'gte'; value: TemplateValue }
}

export type TemplateTable = {
  key: string
  name: string
  icon?: string
  /** Ключ поля-заголовка. */
  primary: string
  fields: TemplateField[]
  views: TemplateView[]
  /** Примеры строк: ключ строки → значения по ключам полей. */
  rows: Array<{ key: string; values: Record<string, TemplateValue> }>
}

/**
 * Готовая настройка доступа поверх шаблона.
 *
 * Кабинет клиента — не отдельный тип приложения, а сочетание трёх вещей:
 * форма открыта гостю, список только вошедшим, строки сравниваются с почтой.
 * Собирать это руками в четырёх местах человек не станет, поэтому шаблон
 * приносит готовым.
 */
/**
 * Витрина — единственное, что человек видит **до** входа.
 *
 * Прайс, каталог, список услуг: страница, которую можно дать ссылкой кому
 * угодно. От кабинета она отличается не оформлением, а тем, что у неё нет
 * владельца строк: показывать нечего личного, и потому вход не нужен.
 *
 * Поля перечислены поимённо. Это и есть граница: всё, чего нет в списке,
 * наружу не уходит — ни в разметку, ни в ответ сервера. Себестоимость лежит
 * в той же таблице и не покидает её.
 */
export type TemplateShowcase = {
  /** Таблица витрины. */
  table: string
  /** Представление, которое задаёт, какие строки показывать без входа. */
  view: string
  /** Колонки, видимые без входа. Остальные останутся у вас. */
  publicFields: string[]
  /** Колонки только для ваших людей: на карточке их видит команда, но не гость. */
  staffFields: string[]
  /** Как называется раздел и карточка. */
  listName: string
  cardName: string
  tabLabel: string
  /** Что написать над списком тому, кто зашёл по ссылке. */
  intro: string
}

export type TemplatePortal = {
  /** Таблица, строки которой принадлежат клиенту. */
  table: string
  /** Витрина: то, что открыто всем по ссылке. */
  showcase: TemplateShowcase
  /** Поле с почтой клиента: по нему решается, чья это строка. */
  emailField: string
  /**
   * Поля, которые заполняет сам клиент. Остальные — служебные: статус, ответ,
   * ответственный. В форму, открытую гостю, они попадать не должны, иначе
   * клиент сам себе поставит «Решено».
   */
  clientFields: string[]
  /**
   * Колонки только для ваших людей: клиент их не видит и на карточке.
   *
   * Отдельно от `clientFields`: те отвечают за форму приёма заявок, эти —
   * за просмотр. Заметка «клиент передумал, предоплату вернули» написана
   * для своих, и показывать её клиенту нельзя, даже если карточка одна
   * на всех.
   */
  staffOnlyFields: string[]
  /**
   * Как называется кабинет глазами клиента: «Мои заказы», а не «Сводка».
   * Человек в кабинете смотрит на свои записи, и заголовок должен говорить
   * именно это.
   */
  clientTitle: string
  /**
   * Форма глазами того, кто ещё ничего о вас не знает.
   *
   * Экран приёма заявок собирается из ваших колонок, а названы они изнутри
   * дела: «Почта клиента», «Пожелания клиента». Человек снаружи читает это
   * и спрашивает — чьего клиента? Поэтому у формы, открытой гостю, свои
   * подписи; сами колонки в таблице при этом не меняются.
   */
  guest: {
    /** Заголовок экрана: «Оставить заявку», а не «Новая запись». */
    screenName: string
    /** Строка над полями: что это и что будет дальше. */
    intro: string
    submitLabel: string
    /** Что сказать после отправки: других экранов у гостя нет. */
    successText: string
    /** Ключ поля → как его назвать тому, кто заполняет. */
    labels: Record<string, string>
  }
}

/**
 * Производственный учёт: какая таблица за что отвечает.
 *
 * Ключи шаблона, а не идентификаторы: те выпускаются при установке. Сборщик
 * переводит это в настройку приложения, по которой действие «сохранить
 * выпуск» находит нужные колонки. Без такой карты действию пришлось бы
 * угадывать колонки по названиям — а названия человек меняет в первый же день.
 */
export type TemplateProduction = {
  tables: { production: string; movements: string; norms: string; materials: string }
  run: { date: string; product: string; qty: string; defects: string; shift: string; note: string }
  norm: { product: string; material: string; perUnit: string; active: string }
  movement: { date: string; material: string; kind: string; qty: string; run: string; reason: string }
  material: { name: string; unit: string; opening: string; movements: string; stock: string; low: string; min: string }
  /** Название варианта «Производство» в колонке типа движения. */
  movementKind: string
  /** Как назвать роли и экраны — словами того дела, а не словами продукта. */
  copy: {
    director: string
    operator: string
    formName: string
    submitLabel: string
  }
}

export type TemplateDef = {
  id: string
  name: string
  /** Одна строка о том, для чего это. */
  tagline: string
  /** Кому подходит — словами того, кто себя узнает. */
  audience: string
  /** Что человек получает сразу после установки. */
  gives: string[]
  /** Эмодзи на карточке: рисовать иконки под каждый шаблон пока нечем. */
  emoji: string
  /**
   * Соседние шаблоны — по делу, а не по порядку в каталоге.
   *
   * Живёт рядом с самим шаблоном: кто ему близок, знает тот, кто его писал.
   * Пусто — подберём по отрасли решения, а если и её нет, покажем меньше.
   */
  kin?: string[]
  /**
   * Чего этот шаблон не делает.
   *
   * Нужно там, где у шаблона нет страницы решения с разделом о границах:
   * календарь в «Салоне» не означает онлайн-запись, а список в «Доставке» —
   * маршруты и карту. Об этом лучше прочитать до установки.
   */
  limits?: string[]
  tables: TemplateTable[]
  /** Таблица, по которой собирается приложение. */
  appTable: string
  appName: string
  portal?: TemplatePortal
  production?: TemplateProduction
  inventory?: {
    tables: { items: string; movements: string }
    item: { name: string; opening: string; movements: string; stock: string; image: string; sku: string }
    movement: { name: string; item: string; qty: string; date: string; note: string; author: string }
    operations?: { fields: { kind: string; before: string; after: string }; kinds: Record<import('@tableapp/schema').InventoryOperation, string> }
  }
}
