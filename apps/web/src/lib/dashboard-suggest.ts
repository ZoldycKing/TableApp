import type { Block, Field } from '@tableapp/schema'
import { newBlock, newId, positionSequence, SPAN_BY_SIZE } from '@tableapp/schema'

/**
 * Что показать на сводке.
 *
 * Правила выводятся из самих колонок: есть статус — предлагаем счётчики и
 * доску, есть деньги и дата — предлагаем сумму за месяц со сравнением.
 * Это же список предложений, который увидит человек, когда добавляет плитку
 * руками: он выбирает из готового, а не заполняет форму со словами «агрегат»
 * и «период».
 *
 * Правила здесь **детерминированные**: одни и те же колонки всегда дают один
 * и тот же список. Ничего не угадывается и не запрашивается на стороне —
 * предложение, меняющееся от раза к разу, владелец перепроверять не станет.
 *
 * Модуль чистый и без обращений к базе, чтобы предложения можно было проверить
 * тестом: неверная плитка врёт молча и убедительно.
 */

export type Suggestion = {
  /**
   * Готовый блок — его и вставляют. Идентификатор и место здесь временные:
   * при вставке выдаются новые, иначе два одинаковых предложения столкнулись бы.
   */
  block: Block
  /** Почему предложено: показывается человеку рядом с названием. */
  why: string
}

type Context = {
  fields: readonly Field[]
  viewId: string
  /** Название таблицы: из него получаются человеческие заголовки. */
  tableName: string
  /** Экраны, на которые могут вести блоки. */
  listScreenId?: string | null
  detailScreenId?: string | null
  createScreenId?: string | null
  /** Как назвать кнопку создания: «Создать заказ» понятнее «Добавить запись». */
  createLabel?: string | null
  primaryFieldId?: string | null
}

const MONEY = new Set(['currency'])

/** Заготовка нужного вида с поправками: поля блока перечислены в реестре. */
function make<T extends Block['type']>(
  type: T,
  ctx: Context,
  patch: Partial<Extract<Block, { type: T }>>,
): Block {
  const base = newBlock(type, { id: newId('component'), position: 'a', viewId: ctx.viewId })
  return { ...base, ...patch } as Block
}

function firstStatus(fields: readonly Field[]): Field | undefined {
  return fields.find((field) => field.type === 'single_select' && field.options.choices.length > 1)
}

/** Деньги предпочтительнее любого другого числа: их и просят посчитать. */
function firstNumber(fields: readonly Field[]): Field | undefined {
  const money = fields.find((field) => field.type === 'number' && MONEY.has(field.options.format))
  return money ?? fields.find((field) => field.type === 'number')
}

function firstDate(fields: readonly Field[]): Field | undefined {
  return fields.find((field) => field.type === 'date' || field.type === 'datetime')
}

function firstCheckbox(fields: readonly Field[]): Field | undefined {
  return fields.find((field) => field.type === 'checkbox')
}

function firstImage(fields: readonly Field[]): Field | undefined {
  return fields.find((field) => field.type === 'image' || field.type === 'attachment')
}

/** Подпись строки списка: статус, если он есть, иначе первое текстовое поле. */
function subtitleFor(fields: readonly Field[], titleId: string | null): Field | undefined {
  const status = firstStatus(fields)
  if (status) return status
  return fields.find(
    (field) => field.id !== titleId && (field.type === 'text' || field.type === 'phone' || field.type === 'email'),
  )
}

/** Метрики, которые имеет смысл предложить по этим колонкам. */
export function suggestMetrics(ctx: Context): Suggestion[] {
  const out: Suggestion[] = []
  const status = firstStatus(ctx.fields)
  const number = firstNumber(ctx.fields)
  const date = firstDate(ctx.fields)
  const checkbox = firstCheckbox(ctx.fields)

  out.push({
    why: 'Сколько всего записей',
    block: make('metric', ctx, { title: 'Всего', kind: 'count', icon: 'list', tone: 'blue' }),
  })

  // Счётчики по первым двум статусам: именно их и спрашивают утром.
  for (const choice of status?.type === 'single_select' ? status.options.choices.slice(0, 2) : []) {
    out.push({
      why: `Записи со статусом «${choice.name}»`,
      block: make('metric', ctx, {
        title: choice.name,
        kind: 'count',
        where: { fieldId: status!.id, value: choice.id },
        /*
         * «Сейчас», а не «за всё время». Счётчик статуса отвечает на вопрос
         * «сколько их в работе прямо сейчас», и подпись про всё время
         * превращала бы текущее состояние в исторический итог.
         */
        description: 'сейчас',
        icon: 'clipboard',
        tone: choice.color,
      }),
    })
  }

  if (number) {
    out.push({
      why: date ? `Сумма по колонке «${number.name}» за месяц` : `Сумма по колонке «${number.name}»`,
      block: make('metric', ctx, {
        title: date ? `${number.name} за месяц` : number.name,
        // Подписываем, по какой дате считается срок: иначе сумма выглядит
        // как выручка, хотя это сумма заказов, а не поступлений.
        description: date ? `по колонке «${date.name.toLowerCase()}»` : '',
        kind: 'sum',
        fieldId: number.id,
        dateFieldId: date?.id ?? null,
        range: date ? 'month' : 'all',
        compare: Boolean(date),
        icon: 'chart',
        tone: 'green',
      }),
    })
  }

  if (checkbox) {
    out.push({
      why: `Сколько записей без отметки «${checkbox.name}»`,
      block: make('metric', ctx, {
        title: `Без отметки «${checkbox.name}»`,
        kind: 'count',
        where: { fieldId: checkbox.id, value: false },
        icon: 'bell',
        tone: 'amber',
      }),
    })
  }

  return out
}

/** Блоки, которые не считают число: список, доска, кнопки. */
export function suggestBlocks(ctx: Context): Suggestion[] {
  const out: Suggestion[] = []
  const status = firstStatus(ctx.fields)
  const title = ctx.fields.find((field) => field.id === ctx.primaryFieldId) ?? ctx.fields[0]
  const number = firstNumber(ctx.fields)

  out.push({
    why: 'Последние записи прямо на главной',
    block: make('list', ctx, {
      // Название списка переписывает шаблон кабинета: там это «Мои заказы».
      title: `Последние ${ctx.tableName.toLowerCase()}`,
      limit: 5,
      titleFieldId: title?.id ?? null,
      subtitleFieldId: subtitleFor(ctx.fields, title?.id ?? null)?.id ?? null,
      metaFieldId: number?.id ?? null,
      imageFieldId: firstImage(ctx.fields)?.id ?? null,
      onTapScreenId: ctx.detailScreenId ?? null,
      moreScreenId: ctx.listScreenId ?? null,
    }),
  })

  if (status) {
    out.push({
      why: `Сколько записей в каждом статусе колонки «${status.name}»`,
      block: make('pipeline', ctx, {
        // Название предметное: человек смотрит на заказы, а не на колонку.
        title: `${ctx.tableName} по статусам`,
        stackFieldId: status.id,
        onTapScreenId: ctx.listScreenId ?? null,
      }),
    })
  }

  if (ctx.createScreenId) {
    out.push({
      why: 'Кнопки для частых действий',
      block: make('actions', ctx, {
        title: 'Быстрые действия',
        span: SPAN_BY_SIZE.full,
        items: [
          {
            id: newId('component'),
            label: ctx.createLabel ?? 'Добавить запись',
            icon: 'plus',
            screenId: ctx.createScreenId,
            url: '',
          },
        ],
      }),
    })
  }

  return out
}

/**
 * Готовая сводка для нового приложения.
 *
 * Собирается сразу при создании: пустой домашний экран человек не наполнит,
 * а увидев четыре числа и список, поймёт, что тут можно менять.
 */
export function defaultDashboard(ctx: Context): Block[] {
  const chosen = [...suggestMetrics(ctx).slice(0, 4), ...suggestBlocks(ctx)]
  const positions = positionSequence(chosen.length)

  return chosen.map((item, index) => ({
    ...item.block,
    id: newId('component'),
    position: positions[index]!,
  })) as Block[]
}
