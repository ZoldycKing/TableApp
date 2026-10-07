import { normalizeFieldOptions, type Field } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { describeField } from './field-help'

const field = (id: string, name: string, type: string, options: Record<string, unknown> = {}): Field =>
  ({ id, name, type, options: normalizeFieldOptions(type as never, options) }) as unknown as Field

const SUM = field('fld_sum', 'Сумма', 'number')
const NDS = field('fld_nds', 'НДС', 'formula', { expression: 'Сумма * 0.2' })
const LINK = field('fld_link', 'Позиции', 'relation', { tableId: 'tbl_pos', allowMultiple: true })
const TOTAL = field('fld_total', 'Итого по позициям', 'rollup', {
  relationFieldId: 'fld_link',
  targetFieldId: 'fld_price',
  fn: 'sum',
})
const COUNT = field('fld_count', 'Позиций', 'count', { relationFieldId: 'fld_link' })
const FIELDS = [SUM, NDS, LINK, TOTAL, COUNT]

/** Соседняя таблица, на которую смотрят связь и Rollup. */
const TABLES = {
  tbl_pos: {
    name: 'Позиции',
    fields: [field('fld_price', 'Цена', 'number'), field('fld_title', 'Наименование', 'text')],
  },
}

describe('на что влияет поле', () => {
  it('число знает, что от него считается формула', () => {
    expect(describeField(SUM, FIELDS).affects).toEqual(['«НДС» — считается формулой'])
  })

  it('связь знает про Rollup и счётчик, которые через неё работают', () => {
    const affects = describeField(LINK, FIELDS, TABLES).affects
    expect(affects).toContain('«Итого по позициям» — берёт числа из привязанных строк')
    expect(affects).toContain('«Позиций» — считает, сколько строк привязано')
    expect(affects).toContain('строки таблицы «Позиции» — они привязываются здесь')
  })

  it('поле, от которого ничего не зависит, не выдумывает связей', () => {
    expect(describeField(field('fld_x', 'Комментарий', 'text'), FIELDS).affects).toEqual([])
  })
})

describe('от чего зависит поле', () => {
  it('формула перечисляет поля из выражения', () => {
    expect(describeField(NDS, FIELDS).dependsOn).toEqual(['Сумма'])
  })

  it('Rollup называет и связь, и складываемое поле', () => {
    const help = describeField(TOTAL, FIELDS)
    expect(help.dependsOn[0]).toContain('Позиции')
    expect(help.what).toContain('сумму')
  })

  it('счётчик зависит только от связи', () => {
    expect(describeField(COUNT, FIELDS).dependsOn).toHaveLength(1)
  })
})

describe('как заполнять', () => {
  it('у считаемого поля прямо сказано, что вводить туда нечего', () => {
    // Без технических слов: «вычисляемое поле» человеку ничего не говорит.
    expect(describeField(TOTAL, FIELDS).how).toContain('ничего не вводят')
    expect(describeField(NDS, FIELDS).how).toContain('ничего не вводят')
  })

  it('переключатель объясняет, что пусто — это «нет»', () => {
    expect(describeField(field('fld_c', 'Оплачено', 'checkbox'), FIELDS).what).toContain('нет')
  })

  it('варианты выбора перечисляются прямо в пояснении', () => {
    const select = field('fld_s', 'Статус', 'single_select', {
      choices: [
        { id: 'sel_1', name: 'Новая', color: 'blue' },
        { id: 'sel_2', name: 'Готово', color: 'green' },
      ],
    })
    expect(describeField(select, FIELDS).what).toContain('Новая, Готово')
  })

  it('почта объясняет свою роль в правах приложения', () => {
    expect(describeField(field('fld_e', 'Ответственный', 'email'), FIELDS).how).toContain('свои строки')
  })

  it('называет поле соседней таблицы по имени, если оно известно', () => {
    // Ровно на этот вопрос человек и смотрит: откуда взялось число.
    const help = describeField(TOTAL, FIELDS, TABLES)
    expect(help.what).toContain('«Цена» из таблицы «Позиции»')
    expect(help.dependsOn[1]).toContain('«Цена» из таблицы «Позиции»')
  })

  it('без сведений о соседней таблице не выдумывает имя поля', () => {
    expect(describeField(TOTAL, FIELDS).what).toContain('поле связанной таблицы')
  })

  it('итог предупреждает, что введённые руками числа в него не входят', () => {
    expect(describeField(TOTAL, FIELDS, TABLES).what).toContain('руками в этой таблице, сюда не попадают')
  })

  it('в пояснениях нет слов из чужого словаря', () => {
    const чужие = ['Rollup', 'Lookup', 'вычисляемое', 'relationFieldId', 'поле связанной таблицы']
    for (const поле of FIELDS) {
      const help = describeField(поле, FIELDS, TABLES)
      const текст = `${help.what} ${help.how}`
      for (const слово of чужие) expect(текст).not.toContain(слово)
    }
  })

  it('пропавшая связь в своей же таблице честно названа удалённой', () => {
    const broken = field('fld_b', 'Итого', 'rollup', {
      relationFieldId: 'fld_gone',
      targetFieldId: 'fld_price',
      fn: 'sum',
    })
    expect(describeField(broken, FIELDS).dependsOn[0]).toContain('удалённое поле')
  })
})
