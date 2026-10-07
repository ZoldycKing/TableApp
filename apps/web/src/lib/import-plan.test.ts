import type { ImportPreview, SheetInfo } from '@tableapp/import'
import type { Field } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import {
  blocked,
  blockerAdvice,
  blockerText,
  byFieldId,
  defaultSelection,
  guessMapping,
  importLabel,
  isImportable,
  noteText,
  MAX_FILE_BYTES,
  planIssues,
  tooBig,
  uniqueName,
  type SheetPlan,
} from './import-plan'

/**
 * Правила импорта книги.
 *
 * Это те проверки, из-за отсутствия которых импорт молча терял данные:
 * лист сверх потолка, два листа в одну таблицу, книга, не помещающаяся
 * в тариф. Кликами такое не проверить — поэтому правила живут отдельно
 * от разметки и проверяются здесь.
 */

const sheet = (patch: Partial<SheetInfo> & { name: string }): SheetInfo => ({
  hidden: false,
  rows: 10,
  columns: 4,
  header: [],
  blockers: [],
  notes: [],
  ...patch,
})

const context = (patch: Partial<Parameters<typeof planIssues>[1]> = {}) => ({
  rowsLeft: 1000,
  tablesLeft: 5,
  existingTables: [] as string[],
  ...patch,
})

describe('выбор листов по умолчанию', () => {
  it('берётся первый пригодный видимый лист, и только он', () => {
    const sheets = [
      sheet({ name: 'Пусто', rows: 0, blockers: [{ kind: 'empty' }] }),
      sheet({ name: 'Продажи' }),
      sheet({ name: 'Клиенты' }),
    ]
    expect(defaultSelection(sheets)).toEqual(['Продажи'])
  })

  it('скрытый лист сам не выбирается никогда', () => {
    /*
     * Его спрятали намеренно. Решить за автора книги, что лист снова нужен,
     * значит импортировать не то, что человек имел в виду.
     */
    const sheets = [sheet({ name: 'Архив', hidden: true }), sheet({ name: 'Служебное', hidden: true })]
    expect(defaultSelection(sheets)).toEqual([])
  })

  it('когда пригодных листов нет, не выбирается ничего', () => {
    const sheets = [sheet({ name: 'Итоги', blockers: [{ kind: 'formulas', count: 2, cells: ['B2', 'B3'] }] })]
    expect(defaultSelection(sheets)).toEqual([])
    expect(isImportable(sheets[0]!)).toBe(false)
  })
})

describe('причина отказа называет числа', () => {
  it('строки: сколько нашли и сколько можно', () => {
    expect(blockerText({ kind: 'rows', found: 24_500, limit: 20_000 })).toContain(`24 500`)
    expect(blockerText({ kind: 'rows', found: 24_500, limit: 20_000 })).toContain(`20 000`)
  })

  it('формулы: сколько ячеек и какие именно', () => {
    const text = blockerText({ kind: 'formulas', count: 7, cells: ['B2', 'B3', 'B4', 'B5', 'B6'] })
    expect(text).toContain('7')
    expect(text).toContain('B2')
    // Показали пять из семи — об остальных надо сказать, а не умолчать.
    expect(text).toContain('и другие')
  })

  it('у каждой поправимой причины есть совет, что сделать', () => {
    expect(blockerAdvice({ kind: 'rows', found: 30_000, limit: 20_000 })).toBeTruthy()
    expect(blockerAdvice({ kind: 'columns', found: 300, limit: 200 })).toBeTruthy()
    expect(blockerAdvice({ kind: 'formulas', count: 1, cells: ['B2'] })).toContain('пересчит')
  })

  it('ошибка вычисления описана как то, что приедет, а не пропадёт', () => {
    expect(noteText({ kind: 'errors', count: 1, cells: ['B2'] })).toContain('#DIV/0!')
  })
})

describe('названия таблиц', () => {
  it('в пределах запуска не повторяются', () => {
    expect(uniqueName('Продажи', [])).toBe('Продажи')
    expect(uniqueName('Продажи', ['Продажи'])).toBe('Продажи (2)')
    expect(uniqueName('Продажи', ['Продажи', 'Продажи (2)'])).toBe('Продажи (3)')
  })

  it('пустое имя не превращается в таблицу без названия молча', () => {
    expect(uniqueName('   ', [])).toBe('Без названия')
  })
})

describe('что мешает запустить импорт', () => {
  const plan = (patch: Partial<SheetPlan> & { sheet: string }): SheetPlan => ({
    rows: 10,
    destination: { kind: 'new', name: patch.sheet },
    ...patch,
  })

  it('два листа в одну таблицу — это остановка, а не предупреждение', () => {
    const issues = planIssues(
      [
        plan({ sheet: 'Продажи', destination: { kind: 'existing', tableId: 'tbl_1', tableName: 'Заявки', mapped: 3 } }),
        plan({ sheet: 'Клиенты', destination: { kind: 'existing', tableId: 'tbl_1', tableName: 'Заявки', mapped: 2 } }),
      ],
      context(),
    )

    expect(blocked(issues)).toBe(true)
    expect(issues[0]!.text).toContain('«Продажи»')
    expect(issues[0]!.text).toContain('«Клиенты»')
  })

  it('два листа с одинаковым названием новой таблицы останавливают импорт', () => {
    const issues = planIssues(
      [
        plan({ sheet: 'Март', destination: { kind: 'new', name: 'Продажи' } }),
        plan({ sheet: 'Апрель', destination: { kind: 'new', name: 'продажи' } }),
      ],
      context(),
    )
    expect(blocked(issues)).toBe(true)
  })

  it('совпадение с уже существующей таблицей — предупреждение: имена не уникальны', () => {
    const issues = planIssues(
      [plan({ sheet: 'Продажи', destination: { kind: 'new', name: 'Продажи' } })],
      context({ existingTables: ['Продажи'] }),
    )
    expect(blocked(issues)).toBe(false)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.level).toBe('warn')
  })

  it('лист без единой сопоставленной колонки не пойдёт', () => {
    const issues = planIssues(
      [plan({ sheet: 'Клиенты', destination: { kind: 'existing', tableId: 'tbl_2', tableName: 'Клиенты', mapped: 0 } })],
      context(),
    )
    expect(blocked(issues)).toBe(true)
  })

  it('потолок тарифа считается по всем выбранным листам сразу', () => {
    /*
     * Иначе первые два листа проехали бы, а третий упёрся — то есть ровно
     * наполовину загруженная книга, от которой мы и уходим.
     */
    const issues = planIssues(
      [plan({ sheet: 'А', rows: 600 }), plan({ sheet: 'Б', rows: 600 })],
      context({ rowsLeft: 1000 }),
    )
    expect(blocked(issues)).toBe(true)
    expect(issues[0]!.text).toContain(`1 200`)
  })

  it('новых таблиц больше, чем осталось в тарифе', () => {
    const issues = planIssues(
      [plan({ sheet: 'А' }), plan({ sheet: 'Б' }), plan({ sheet: 'В' })],
      context({ tablesLeft: 2 }),
    )
    expect(blocked(issues)).toBe(true)
  })

  it('обычный план ничем не блокируется', () => {
    const issues = planIssues(
      [
        plan({ sheet: 'Продажи', rows: 120 }),
        plan({ sheet: 'Клиенты', destination: { kind: 'existing', tableId: 'tbl_3', tableName: 'Клиенты', mapped: 3 } }),
      ],
      context(),
    )
    expect(issues).toEqual([])
  })
})

describe('подпись кнопки', () => {
  it('называет действие и число листов', () => {
    expect(importLabel(0)).toBe('Выберите лист')
    expect(importLabel(1)).toBe('Импортировать лист')
    expect(importLabel(3)).toBe('Импортировать 3 листа')
    expect(importLabel(5)).toBe('Импортировать 5 листов')
  })
})

describe('сопоставление колонок', () => {
  const field = (id: string, name: string): Field =>
    ({ id, name, type: 'text', tableId: 'tbl_1', position: 'a', description: null, options: {} }) as unknown as Field

  const preview = (names: string[]): ImportPreview => ({
    fields: names.map((name, index) => field(`fld_file_${index}`, name)),
    rows: [],
    warnings: [],
    skippedRows: 0,
  })

  it('угадывается по названию, без учёта регистра и «ё»', () => {
    const guess = guessMapping(preview(['Клиент', 'Сумма', 'Учёт']), [
      field('fld_t1', 'клиент'),
      field('fld_t2', 'Учет'),
    ])
    expect(guess).toEqual({ 0: 'fld_t1', 2: 'fld_t2' })
  })

  it('одна колонка таблицы принимает только одну колонку файла', () => {
    // Иначе вторая молча затёрла бы первую, и человек увидел бы это в данных.
    const guess = guessMapping(preview(['Клиент', 'Клиент']), [field('fld_t1', 'Клиент')])
    expect(guess).toEqual({ 0: 'fld_t1' })
  })

  it('ключом служит номер колонки, а не идентификатор поля', () => {
    /*
     * Поля предпросмотра пересоздаются при каждой правке заголовка или типа
     * и получают новые идентификаторы. Сопоставление, привязанное к ним,
     * рассыпалось молча: на экране галочки, а в таблице пустые ячейки.
     */
    const first = preview(['Клиент', 'Код'])
    const mapping = guessMapping(first, [field('fld_t1', 'Код')])

    // Тот же лист, разобранный заново: идентификаторы другие.
    const second: ImportPreview = {
      ...first,
      fields: first.fields.map((item, index) => field(`fld_other_${index}`, item.name)),
    }

    expect(byFieldId(mapping, second)).toEqual({ fld_other_1: 'fld_t1' })
  })

  it('колонка, которой больше нет, просто не переносится', () => {
    const shorter = preview(['Клиент'])
    expect(byFieldId({ 0: 'fld_t1', 5: 'fld_t2' }, shorter)).toEqual({ fld_file_0: 'fld_t1' })
  })
})

describe('предел размера файла', () => {
  it('файл в пределах — без возражений', () => {
    expect(tooBig(MAX_FILE_BYTES)).toBeNull()
    expect(tooBig(1)).toBeNull()
  })

  it('файл сверх предела отклоняется с его размером и пределом', () => {
    /*
     * Проверка живёт и в браузере, и на сервере. В браузере она важнее:
     * запрос с книгой на двадцать мегабайт обрывается на транспорте,
     * и без неё человек видел пустой экран вместо объяснения.
     */
    const message = tooBig(16 * 1024 * 1024)
    expect(message).toContain('16')
    expect(message).toContain('15 МБ')
  })
})
