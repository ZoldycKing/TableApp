import type { App, Field, Screen, View } from '@tableapp/schema'
import { appSchema } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import {
  ANONYMOUS,
  asRole,
  canOpenScreen,
  fieldPolicy,
  onlyReadable,
  publicRowGuard,
  screensFor,
} from './app-roles'

/**
 * Что достаётся человеку, который открыл ссылку и не входил.
 *
 * Самое дорогое место в системе: витрина — единственная поверхность, где
 * строки уходят к постороннему, и исправить ошибку после выкладки нельзя.
 * Поэтому проверяем не интерфейс, а то, что кладётся в ответ сервера.
 */

const field = (id: string, name: string, type = 'text'): Field =>
  ({ id, tableId: 'tbl_goods', name, type, position: id, options: {} }) as unknown as Field

const fields: Field[] = [
  field('fld_name', 'Название'),
  field('fld_price', 'Цена', 'number'),
  field('fld_cost', 'Себестоимость', 'number'),
  field('fld_margin', 'Маржа', 'number'),
  field('fld_note', 'Внутренняя заметка', 'long_text'),
  field('fld_published', 'Опубликован', 'checkbox'),
]

/** Представление витрины: наружу идут только опубликованные товары. */
const shopView = {
  id: 'viw_shop',
  tableId: 'tbl_goods',
  name: 'Опубликованные',
  position: 'a',
  type: 'grid',
  config: {
    filter: {
      id: 'flt_1',
      conjunction: 'and',
      conditions: [{ id: 'cnd_1', fieldId: 'fld_published', op: 'is', value: true }],
    },
    sorts: [],
    groupBy: [],
    hiddenFieldIds: [],
    fieldOrder: [],
    rowHeight: 'short',
  },
} as unknown as View

const views: Record<string, View> = { viw_shop: shopView }

function shop(publicFields: string[], extra: Record<string, unknown> = {}): App {
  return appSchema.parse({
    id: 'app_1',
    workspaceId: 'wsp_1',
    name: 'Каталог',
    slug: 'katalog',
    theme: {},
    screens: [
      {
        id: 'scr_vitrina',
        appId: 'app_1',
        name: 'Товары',
        position: 'a',
        tab: null,
        type: 'list',
        source: { viewId: 'viw_shop' },
        titleFieldId: 'fld_name',
        metaFieldId: 'fld_price',
        access: { public: true, publicFields, roles: [] },
        components: [],
      },
      {
        id: 'scr_kabinet',
        appId: 'app_1',
        name: 'Закупки',
        position: 'b',
        tab: null,
        type: 'detail',
        tableId: 'tbl_goods',
        access: { public: false, publicFields: [], roles: ['manager'] },
        components: [
          { id: 'cmp_cost', position: 'a', visibleWhen: null, roles: null, type: 'field', fieldId: 'fld_cost', label: null, showWhenEmpty: false },
        ],
      },
      ...(extra.screens as Screen[] | undefined ?? []),
    ],
    ...extra,
  })
}

const row = {
  fld_name: 'Фильтр FA-120',
  fld_price: 890,
  fld_cost: 410,
  fld_margin: 480,
  fld_note: 'Брать у второго поставщика',
  fld_published: true,
}

describe('какие экраны достаются не вошедшему', () => {
  it('только помеченные «видно без входа»', () => {
    const app = shop(['fld_name'])
    expect(screensFor(app, ANONYMOUS).map((screen) => screen.id)).toEqual(['scr_vitrina'])
  })

  it('закрытый экран закрыт, даже если знать его адрес', () => {
    const app = shop(['fld_name'])
    const kabinet = app.screens.find((screen) => screen.id === 'scr_kabinet')!
    expect(canOpenScreen(kabinet, ANONYMOUS)).toBe(false)
    expect(canOpenScreen(kabinet, asRole('manager'))).toBe(true)
  })

  it('вошедшему публичный экран тоже открыт только если его роли дали', () => {
    // Витрина в примере открыта всем без входа и никому из вошедших:
    // «публично» и «моей роли» — два независимых ответа.
    const app = shop(['fld_name'])
    const vitrina = app.screens[0]!
    expect(canOpenScreen(vitrina, ANONYMOUS)).toBe(true)
    expect(canOpenScreen(vitrina, asRole('manager'))).toBe(false)

    // Открыли её ещё и ведущему — теперь её видят оба, и это два разных «да».
    const opened = { ...vitrina, access: { ...vitrina.access, roles: ['manager'] } } as Screen
    expect(canOpenScreen(opened, ANONYMOUS)).toBe(true)
    expect(canOpenScreen(opened, asRole('manager'))).toBe(true)
  })
})

describe('какие поля попадают в ответ сервера', () => {
  it('ровно те, что названы публичными, — и ни одного больше', () => {
    const app = shop(['fld_name', 'fld_price'])
    const policy = fieldPolicy(app, 'tbl_goods', ANONYMOUS, views)
    const sent = onlyReadable(row, policy)

    expect(sent).toEqual({ fld_name: 'Фильтр FA-120', fld_price: 890 })

    // Проверяем сам ответ, а не интерфейс: закрытых значений в нём нет.
    const payload = JSON.stringify(sent)
    for (const secret of ['fld_cost', 'fld_margin', 'fld_note', '410', '480', 'поставщика']) {
      expect(payload, secret).not.toContain(secret)
    }
  })

  it('поле на экране, не названное публичным, наружу не идёт', () => {
    // «Цена» стоит справа в списке, но в белый список её не внесли.
    const app = shop(['fld_name'])
    const sent = onlyReadable(row, fieldPolicy(app, 'tbl_goods', ANONYMOUS, views))
    expect(sent).toEqual({ fld_name: 'Фильтр FA-120' })
  })

  it('поле, открытое роли на закрытом экране, не становится публичным', () => {
    // Себестоимость показана ведущему на его карточке — и только ему.
    const app = shop(['fld_name'])
    expect(fieldPolicy(app, 'tbl_goods', asRole('manager'), views).fields.has('fld_cost')).toBe(true)
    expect(fieldPolicy(app, 'tbl_goods', ANONYMOUS, views).fields.has('fld_cost')).toBe(false)
  })

  it('пустой белый список отдаёт пустую строку, а не всю', () => {
    const app = shop([])
    const policy = fieldPolicy(app, 'tbl_goods', ANONYMOUS, views)
    expect(policy.restricted).toBe(true)
    expect(onlyReadable(row, policy)).toEqual({})
  })

  it('удалённое поле в белом списке ничего не ломает и ничего не открывает', () => {
    const app = shop(['fld_name', 'fld_udalili'])
    const sent = onlyReadable(row, fieldPolicy(app, 'tbl_goods', ANONYMOUS, views))
    expect(sent).toEqual({ fld_name: 'Фильтр FA-120' })
  })
})

describe('вычисляемое поле не протаскивает исходные значения', () => {
  /*
   * Формула считается на сервере до отсечения полей, поэтому наружу можно
   * отдать её результат, не отдавая того, из чего он получен. Проверяем
   * именно это: «цена со скидкой» уходит, себестоимость и маржа — нет.
   */
  const withFormula: Field[] = [
    ...fields,
    { id: 'fld_display', tableId: 'tbl_goods', name: 'Цена со скидкой', type: 'formula', position: 'z', options: { expression: '', resultType: 'number' } } as unknown as Field,
  ]

  it('результат публичен, зависимости — нет', () => {
    const app = shop(['fld_name', 'fld_display'])
    const computed = { ...row, fld_display: 801 }
    const sent = onlyReadable(computed, fieldPolicy(app, 'tbl_goods', ANONYMOUS, views))

    expect(sent).toEqual({ fld_name: 'Фильтр FA-120', fld_display: 801 })
    expect(JSON.stringify(sent)).not.toContain('410')
    expect(withFormula.length).toBe(fields.length + 1)
  })
})

describe('какие строки достаются не вошедшему', () => {
  it('только прошедшие отбор публичного представления', () => {
    const app = shop(['fld_name'])
    const guard = publicRowGuard(app, 'tbl_goods', views, fields)

    expect(guard(row)).toBe(true)
    expect(guard({ ...row, fld_published: false })).toBe(false)
  })

  it('без публичного списка не проходит ни одна строка', () => {
    /*
     * Публичная карточка сама по себе не доказывает, что конкретная запись
     * разрешена наружу. Доказать это может только отбор, заданный владельцем,
     * — а его нет.
     */
    const onlyDetail = appSchema.parse({
      id: 'app_2',
      workspaceId: 'wsp_1',
      name: 'Каталог',
      slug: 'katalog-2',
      theme: {},
      screens: [
        {
          id: 'scr_card',
          appId: 'app_2',
          name: 'Товар',
          position: 'a',
          tab: null,
          type: 'detail',
          tableId: 'tbl_goods',
          access: { public: true, publicFields: ['fld_name'], roles: [] },
          components: [],
        },
      ],
    })

    const guard = publicRowGuard(onlyDetail, 'tbl_goods', views, fields)
    expect(guard(row)).toBe(false)
  })

  it('отбор экрана сужает выборку представления, а не расширяет', () => {
    const narrowed = shop(['fld_name'])
    const screen = narrowed.screens[0]!
    const tightened = {
      ...narrowed,
      screens: [
        {
          ...screen,
          source: {
            ...(screen as Extract<Screen, { type: 'list' }>).source,
            extraFilter: {
              id: 'flt_2',
              conjunction: 'and',
              conditions: [{ id: 'cnd_2', fieldId: 'fld_price', op: 'gt', value: 1000 }],
            },
          },
        } as Screen,
      ],
    }

    const guard = publicRowGuard(tightened, 'tbl_goods', views, fields)
    // Опубликован, но дешевле порога — за отбор экрана не проходит.
    expect(guard(row)).toBe(false)
    expect(guard({ ...row, fld_price: 1500 })).toBe(true)
  })
})

describe('витрина: строки из представления, колонки по списку', () => {
  /*
   * Сквозная проверка того, что собирает шаблон: список открыт по ссылке,
   * строки берутся из «Опубликованных», а себестоимость лежит в той же
   * таблице и наружу не уходит. Три решения, и все три независимы.
   */
  const app = shop(['fld_name', 'fld_price'])
  const policy = fieldPolicy(app, 'tbl_goods', ANONYMOUS, views)
  const guard = publicRowGuard(app, 'tbl_goods', views, fields)

  const published = { ...row, fld_name: 'Диагностика', fld_price: 900, fld_cost: 350 }
  const draft = { ...published, fld_published: false }

  it('наружу уходит только опубликованное и только названные колонки', () => {
    expect(guard(published)).toBe(true)
    expect(onlyReadable(published, policy)).toEqual({ fld_name: 'Диагностика', fld_price: 900 })
  })

  it('снятая отметка убирает услугу с витрины, не удаляя её', () => {
    expect(guard(draft)).toBe(false)
  })

  it('колонка отбора наружу не идёт — и потому отбор нельзя повторять в браузере', () => {
    /*
     * «Опубликована» не в белом списке, значит в браузере её нет. Повторный
     * отбор представления на устройстве не нашёл бы значения и выбросил бы
     * все строки: поэтому у не вошедшего отбор применяется только на сервере.
     */
    const sent = onlyReadable(published, policy)
    expect('fld_published' in sent).toBe(false)
  })
})

describe('наружу не уходит и устройство таблицы', () => {
  /*
   * Название колонки — тоже сведения о деле. По списку полей было видно,
   * что у товара есть «Себестоимость» и «Маржа», а у поля выбора — весь
   * перечень вариантов, хотя значений не приходило ни одного.
   */
  const app = shop(['fld_name', 'fld_price'])

  it('описания закрытых колонок не входят в набор для показа', () => {
    const policy = fieldPolicy(app, 'tbl_goods', ANONYMOUS, views)
    const sent = fields.filter((field) => policy.fields.has(field.id))

    expect(sent.map((field) => field.name)).toEqual(['Название', 'Цена'])
    expect(JSON.stringify(sent)).not.toContain('Себестоимость')
    expect(JSON.stringify(sent)).not.toContain('Внутренняя заметка')
  })

  it('у вошедшего набор шире, и это разные ответы на один вопрос', () => {
    const forManager = fieldPolicy(app, 'tbl_goods', asRole('manager'), views)
    expect(forManager.fields.has('fld_cost')).toBe(true)

    const forAnyone = fieldPolicy(app, 'tbl_goods', ANONYMOUS, views)
    expect(forAnyone.fields.has('fld_cost')).toBe(false)
  })
})
