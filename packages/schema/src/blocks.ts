import type { Block, BlockSpan, MetricKind } from './app'
import { SPAN_BY_SIZE } from './app'
import type { Field } from './fields'
import { fieldsOfFilter } from './filters'

/**
 * Реестр блоков сводки.
 *
 * Один список вместо десяти `switch` по всему коду: здесь и название для
 * человека, и ширина по умолчанию, и заготовка настроек, и проверка на
 * поломку. Новый вид блока добавляется сюда и в отрисовку — а не в конструктор,
 * рантайм, предложения и валидатор по отдельности.
 */

export type BlockCategory = 'numbers' | 'data' | 'actions'

export const BLOCK_CATEGORY_NAMES: Record<BlockCategory, string> = {
  numbers: 'Числа',
  data: 'Данные',
  actions: 'Действия и текст',
}

export type BlockKindInfo = {
  type: Block['type']
  /** Как блок называется для владельца. */
  label: string
  /** Одна строка о том, зачем он: её видно в списке «добавить блок». */
  hint: string
  icon: string
  category: BlockCategory
  /** Блок читает данные: у него есть представление, отбор и сортировка. */
  reads: boolean
  defaultSpan: BlockSpan
}

export const BLOCK_KINDS: readonly BlockKindInfo[] = [
  {
    type: 'metric',
    label: 'Число',
    hint: 'Одна цифра: сколько заявок, сколько денег, средний чек.',
    icon: 'chart',
    category: 'numbers',
    reads: true,
    defaultSpan: SPAN_BY_SIZE.small,
  },
  {
    type: 'pipeline',
    label: 'Доска',
    hint: 'Сколько записей в каждом статусе — колонками.',
    icon: 'clipboard',
    category: 'numbers',
    reads: true,
    defaultSpan: SPAN_BY_SIZE.half,
  },
  {
    type: 'list',
    label: 'Список',
    hint: 'Несколько последних записей прямо на главной.',
    icon: 'list',
    category: 'data',
    reads: true,
    defaultSpan: SPAN_BY_SIZE.half,
  },
  {
    type: 'actions',
    label: 'Кнопки',
    hint: 'Частые действия: «Новая заявка», «Позвонить».',
    icon: 'plus',
    category: 'actions',
    reads: false,
    defaultSpan: SPAN_BY_SIZE.full,
  },
  {
    type: 'note',
    label: 'Заметка',
    hint: 'Текст от вас: правила, телефон, предупреждение.',
    icon: 'bell',
    category: 'actions',
    reads: false,
    defaultSpan: SPAN_BY_SIZE.full,
  },
]

const BY_TYPE = new Map(BLOCK_KINDS.map((kind) => [kind.type, kind]))

export function blockKind(type: Block['type']): BlockKindInfo {
  const found = BY_TYPE.get(type)
  if (!found) throw new Error(`Неизвестный блок: ${type}`)
  return found
}

/** Читает ли блок данные — без сужения типа там, где оно не нужно. */
export function blockReads(block: Block): block is Extract<Block, { source: unknown }> {
  return 'source' in block
}

/** Какие подсчёты требуют колонку. Количество записей обходится без неё. */
export const KIND_NEEDS_FIELD: Record<MetricKind, boolean> = {
  count: false,
  count_filled: true,
  sum: true,
  avg: true,
  min: true,
  max: true,
}

export const METRIC_KIND_NAMES: Record<MetricKind, string> = {
  count: 'количество записей',
  count_filled: 'сколько записей заполнено по колонке',
  sum: 'сумму по колонке',
  avg: 'среднее по колонке',
  min: 'минимум по колонке',
  max: 'максимум по колонке',
}

/**
 * Заготовка блока.
 *
 * Новый блок сразу рабочий, а не пустая форма: человек нажал «Список» и увидел
 * список, а не семь незаполненных полей со словом «источник».
 */
export function newBlock(
  type: Block['type'],
  seed: { id: string; position: string; viewId?: string | null; screenId?: string | null },
): Block {
  const base = {
    id: seed.id,
    position: seed.position,
    span: blockKind(type).defaultSpan,
    roles: null,
    title: '',
    description: '',
  }
  const source = { source: { viewId: seed.viewId ?? '' }, filter: null, sorts: [] }

  if (type === 'metric') {
    return {
      ...base,
      ...source,
      type: 'metric',
      kind: 'count',
      fieldId: null,
      dateFieldId: null,
      where: null,
      range: 'all',
      compare: false,
      icon: 'chart',
      tone: 'blue',
      format: 'auto',
    }
  }
  if (type === 'list') {
    return {
      ...base,
      ...source,
      type: 'list',
      limit: 5,
      titleFieldId: null,
      subtitleFieldId: null,
      metaFieldId: null,
      imageFieldId: null,
      onTapScreenId: seed.screenId ?? null,
      moreScreenId: null,
    }
  }
  if (type === 'pipeline') {
    return {
      ...base,
      ...source,
      type: 'pipeline',
      stackFieldId: null,
      cardTitleFieldId: null,
      cardLimit: 0,
      onTapScreenId: seed.screenId ?? null,
    }
  }
  if (type === 'actions') {
    return { ...base, type: 'actions', items: [] }
  }
  return { ...base, type: 'note', text: '', style: 'plain' }
}

// --- Проверка настроек -------------------------------------------------------

export type BlockProblem = {
  /** `error` — блок не покажется; `warning` — покажется не так, как задумано. */
  level: 'error' | 'warning'
  text: string
}

export type BlockContext = {
  /** Представления приложения по идентификатору. */
  views: Readonly<Record<string, { id: string; name: string; tableId: string }>>
  /** Поля по таблице. */
  fields: Readonly<Record<string, readonly Field[]>>
  screenIds: ReadonlySet<string>
  roleIds: ReadonlySet<string>
  /**
   * Поля, которые роль вправе прочитать, по таблице. Пусто или не задано —
   * проверять нечего. Нужно, чтобы владелец узнал о недоступной колонке
   * в конструкторе, а не по прочерку в сводке у клиента.
   */
  readable?: Readonly<Record<string, ReadonlySet<string>>>
  /** Роль, для которой проверяем. Нужна только ради текста предупреждения. */
  roleName?: string
}

/**
 * Что в блоке сломано.
 *
 * Удалённую колонку или представление конструктор не ловит: определение
 * приложения живёт отдельно от таблиц, и ссылка остаётся висеть. Без этой
 * проверки блок либо падает, либо — хуже — тихо показывает ноль.
 */
export function validateBlock(block: Block, ctx: BlockContext): BlockProblem[] {
  const out: BlockProblem[] = []
  const error = (text: string) => out.push({ level: 'error', text })
  const warn = (text: string) => out.push({ level: 'warning', text })

  for (const roleId of block.roles ?? []) {
    if (!ctx.roleIds.has(roleId)) warn('Блок открыт роли, которой больше нет — её галочку можно снять.')
  }

  if (!blockReads(block)) {
    if (block.type === 'actions') {
      if (block.items.length === 0) warn('В блоке нет ни одной кнопки.')
      for (const item of block.items) {
        if (!item.screenId && !item.url) error(`Кнопке «${item.label}» не задано, куда вести.`)
        else if (item.screenId && !ctx.screenIds.has(item.screenId)) {
          error(`Кнопка «${item.label}» ведёт на удалённый экран.`)
        }
      }
    }
    if (block.type === 'note' && block.text.trim() === '') warn('Заметка пустая.')
    return out
  }

  const view = ctx.views[block.source.viewId]
  if (!view) {
    error('Представление удалено — блоку неоткуда брать данные.')
    return out
  }

  const fields = ctx.fields[view.tableId] ?? []
  const byId = new Map(fields.map((field) => [field.id, field]))
  const readable = ctx.readable?.[view.tableId]
  const whose = ctx.roleName ? `Роль «${ctx.roleName}»` : 'Роль'

  /** Колонка должна существовать и быть открыта роли, иначе блок посчитает пустоту. */
  const checkField = (fieldId: string, what: string): Field | undefined => {
    const field = byId.get(fieldId)
    if (!field) {
      error(`${what}: колонка удалена.`)
      return undefined
    }
    if (readable && readable.size > 0 && !readable.has(fieldId)) {
      error(`${whose} не видит колонку «${field.name}», поэтому ${what.toLowerCase()} не посчитается.`)
    }
    return field
  }

  for (const fieldId of fieldsOfFilter(block.filter)) {
    if (!byId.has(fieldId)) warn('В отборе блока есть условие по удалённой колонке — оно не сработает.')
  }
  for (const sort of block.sorts) {
    if (!byId.has(sort.fieldId)) warn('Сортировка блока ссылается на удалённую колонку.')
  }

  if (block.type === 'metric') {
    if (KIND_NEEDS_FIELD[block.kind]) {
      if (!block.fieldId) error('Не выбрана колонка, по которой считать.')
      else checkField(block.fieldId, 'Колонка расчёта')
    }
    if (block.range !== 'all') {
      if (!block.dateFieldId) warn('Не выбрана колонка даты — срок не применится, число будет за всё время.')
      else checkField(block.dateFieldId, 'Колонка даты')
    }
    if (block.where) checkField(block.where.fieldId, 'Колонка отбора')
  }

  if (block.type === 'list') {
    if (!block.titleFieldId) warn('Не выбрана колонка заголовка — строки будут без подписи.')
    else checkField(block.titleFieldId, 'Колонка заголовка')
    for (const [id, what] of [
      [block.subtitleFieldId, 'Колонка подписи'],
      [block.metaFieldId, 'Колонка значения справа'],
      [block.imageFieldId, 'Колонка картинки'],
    ] as const) {
      if (id) checkField(id, what)
    }
    for (const [id, what] of [
      [block.onTapScreenId, 'По нажатию'],
      [block.moreScreenId, '«Все»'],
    ] as const) {
      if (id && !ctx.screenIds.has(id)) warn(`${what}: экран удалён, переход не сработает.`)
    }
  }

  if (block.type === 'pipeline') {
    if (!block.stackFieldId) error('Не выбрана колонка выбора, по которой строить колонки.')
    else {
      const field = checkField(block.stackFieldId, 'Колонка доски')
      if (field && field.type !== 'single_select' && field.type !== 'multi_select') {
        error(`Колонка «${field.name}» не из выбора — колонок у доски не получится.`)
      }
    }
    if (block.cardTitleFieldId) checkField(block.cardTitleFieldId, 'Колонка заголовка карточки')
    if (block.onTapScreenId && !ctx.screenIds.has(block.onTapScreenId)) {
      warn('По нажатию: экран удалён, переход не сработает.')
    }
  }

  return out
}

/** Блок, который не покажется: настройки надо поправить. */
export function blockIsBroken(problems: readonly BlockProblem[]): boolean {
  return problems.some((problem) => problem.level === 'error')
}
