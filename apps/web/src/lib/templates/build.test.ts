import { computeDerivedRow, compileTableFormulas, relatedIndexFrom, type RelatedIndex } from '@tableapp/formula'
import type { Field } from '@tableapp/schema'
import { calendarDay, evalFilter, indexFields, type FilterGroup } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { buildTemplate } from './build'
import { findTemplate, TEMPLATES } from './catalog'

const workspaceId = 'wsp_test'

function build(id: string) {
  return buildTemplate({ template: findTemplate(id)!, workspaceId, now: new Date('2026-03-10T09:00:00Z') })
}

describe('шаблоны разворачиваются в рабочие таблицы', () => {
  it('uses the Moscow date for relative examples near the UTC day boundary', () => {
    const built = buildTemplate({ template: findTemplate('portal')!, workspaceId, now: new Date('2026-03-14T22:30:00Z') })
    const date = built.fields.find((field) => field.tableId === built.appTableId && field.type === 'date' && field.name === 'Обратились')
    // The first order is three days before March 15 in Moscow.
    const first = built.rows.find((row) => row.tableId === built.appTableId)!
    const dates = built.fields.filter((field) => field.tableId === built.appTableId && field.type === 'date')
    expect(dates.length).toBeGreaterThan(0)
    const created = date ?? dates[0]!
    expect(calendarDay(first.data[created.id])).toBe('2026-03-12')
  })
  it('каждый шаблон собирается и не ссылается на чужие идентификаторы', () => {
    for (const template of TEMPLATES) {
      const built = build(template.id)
      const tableIds = new Set(built.tables.map((table) => table.id))
      const fieldIds = new Set(built.fields.map((field) => field.id))

      expect(built.tables).toHaveLength(template.tables.length)
      for (const field of built.fields) expect(tableIds.has(field.tableId)).toBe(true)
      for (const view of built.views) expect(tableIds.has(view.tableId)).toBe(true)
      for (const row of built.rows) {
        expect(tableIds.has(row.tableId)).toBe(true)
        for (const key of Object.keys(row.data)) expect(fieldIds.has(key)).toBe(true)
      }
      // Все строки шаблона помечены примерами: иначе «удалить примеры» их не найдёт.
      expect(built.rows.every((row) => row.sample)).toBe(true)
    }
  })

  it('заголовок таблицы — поле, объявленное главным', () => {
    const built = build('zayavki')
    for (const table of built.tables) {
      const primary = built.fields.find((field) => field.id === table.primaryFieldId)
      expect(primary?.tableId).toBe(table.id)
    }
  })

  it('позиции строк и колонок возрастают', () => {
    const built = build('sklad')
    for (const table of built.tables) {
      const rowPositions = built.rows.filter(row => row.tableId === table.id).map(row => row.position)
      expect([...rowPositions].sort()).toEqual(rowPositions)
      const fieldPositions = built.fields.filter(field => field.tableId === table.id).map(field => field.position)
      expect([...fieldPositions].sort()).toEqual(fieldPositions)
    }
  })

  it('новые таблицы встают после уже существующих', () => {
    const built = buildTemplate({ template: findTemplate('katalog')!, workspaceId, afterPosition: 'V' })
    expect(built.tables.every((table) => table.position > 'V')).toBe(true)
  })
})

describe('заявки: связь и подстановка из справочника', () => {
  it('телефон заявки берётся из карточки клиента', () => {
    const built = build('zayavki')
    const clients = built.tables.find((table) => table.name === 'Клиенты')!
    const zayavki = built.tables.find((table) => table.name === 'Заявки')!

    const fields = built.fields
      .filter((field) => field.tableId === zayavki.id)
      .map((field) => field as unknown as Field)
    const clientFields = built.fields.filter((field) => field.tableId === clients.id)
    const clientPhone = clientFields.find((field) => field.name === 'Телефон')!

    const clientRows = built.rows.filter((row) => row.tableId === clients.id)
    const related: RelatedIndex = new Map([
      [clients.id, new Map(clientRows.map((row) => [row.id, row.data]))],
    ])

    const first = built.rows.find((row) => row.tableId === zayavki.id)!
    const computed = computeDerivedRow(first.data, fields, related, compileTableFormulas(fields))

    const lookup = fields.find((field) => field.name === 'Телефон')!
    const relation = fields.find((field) => field.name === 'Клиент')!
    const linked = clientRows.find((row) => row.id === (first.data[relation.id] as string[])[0])!

    expect(computed[lookup.id]).toEqual([linked.data[clientPhone.id]])
    expect(String(linked.data[clientPhone.id])).toMatch(/^\+7/)
  })

  it('статус записан идентификатором варианта, а не текстом', () => {
    const built = build('zayavki')
    const status = built.fields.find((field) => field.name === 'Статус')!
    const choices = (status.options as { choices: { id: string; name: string }[] }).choices
    const values = built.rows
      .map((row) => row.data[status.id])
      .filter((value): value is string => typeof value === 'string')

    expect(values.length).toBeGreaterThan(0)
    for (const value of values) expect(choices.some((choice) => choice.id === value)).toBe(true)
  })

  it('доска группируется по статусу, календарь смотрит на дату выезда', () => {
    const built = build('zayavki')
    const board = built.views.find((view) => view.type === 'kanban')!
    const calendar = built.views.find((view) => view.type === 'calendar')!
    const status = built.fields.find((field) => field.name === 'Статус')!
    const date = built.fields.find((field) => field.name === 'Дата выезда')!

    expect((board.config as { stackFieldId: string }).stackFieldId).toBe(status.id)
    expect((calendar.config as { dateFieldId: string }).dateFieldId).toBe(date.id)
  })

  it('даты примеров считаются от сегодняшнего дня', () => {
    const built = build('zayavki')
    const date = built.fields.find((field) => field.name === 'Дата выезда')!
    const days = built.rows
      .map((row) => row.data[date.id])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => Math.round((new Date(value).getTime() - Date.parse('2026-03-10T09:00:00Z')) / 86_400_000))

    // Часть заявок в прошлом, часть впереди: иначе календарь выглядит пустым.
    expect(Math.min(...days)).toBeLessThan(0)
    expect(Math.max(...days)).toBeGreaterThan(0)
  })
})

describe('склад: вычисляемые колонки и отбор', () => {
  function skladDerived() {
    const built = build('sklad')
    const byTable = new Map(built.tables.map(table => [
      table.id,
      built.fields.filter(field => field.tableId === table.id).map(field => field as unknown as Field),
    ]))
    const stored = new Map(built.tables.map(table => [
      table.id,
      new Map(built.rows.filter(row => row.tableId === table.id).map(row => [row.id, row.data])),
    ]))
    const related = relatedIndexFrom(stored, byTable)
    const fields = byTable.get(built.appTableId)!
    const formulas = compileTableFormulas(fields)
    return { built, fields, formulas, related }
  }

  it('«Пора докупать» считается по остатку и порогу', () => {
    const { built, fields, formulas, related } = skladDerived()
    const low = built.fields.find((field) => field.name === 'Пора докупать')!
    const qty = built.fields.find((field) => field.name === 'Остаток')!
    const min = built.fields.find((field) => field.name === 'Минимальный остаток')!
    const items = built.rows.filter(row => row.tableId === built.appTableId)
    for (const row of items) {
      const computed = computeDerivedRow(row.data, fields, related, formulas)
      expect(computed[low.id]).toBe((computed[qty.id] as number) < (row.data[min.id] as number))
    }
  })

  it('представление «Заканчивается» показывает только то, что кончается', () => {
    const { built, fields, formulas, related } = skladDerived()
    const view = built.views.find((item) => item.name === 'Заканчивается')!
    const filter = (view.config as { filter: FilterGroup }).filter
    const low = built.fields.find((field) => field.name === 'Пора докупать')!
    const items = built.rows.filter(row => row.tableId === built.appTableId)

    const passed = items
      .map((row) => computeDerivedRow(row.data, fields, related, formulas))
      .filter((row) => evalFilter(filter, row, indexFields(fields)))

    expect(passed.length).toBeGreaterThan(0)
    expect(passed.every((row) => row[low.id] === true)).toBe(true)
    expect(passed.length).toBeLessThan(items.length)
  })

  it('стоимость остатка — остаток на цену', () => {
    const { built, fields, formulas, related } = skladDerived()
    const total = built.fields.find((field) => field.name === 'Стоимость остатка')!
    const qty = built.fields.find((field) => field.name === 'Остаток')!
    const price = built.fields.find((field) => field.name === 'Цена')!
    const sample = built.rows.find(row => row.tableId === built.appTableId)!

    const row = computeDerivedRow(sample.data, fields, related, formulas)
    expect(row[total.id]).toBe((row[qty.id] as number) * (sample.data[price.id] as number))
  })
})

describe('каталог', () => {
  it('витрина берёт обложкой фотографию', () => {
    const built = build('katalog')
    const gallery = built.views.find((view) => view.type === 'gallery')!
    const photo = built.fields.find((field) => field.name === 'Фото')!
    expect((gallery.config as { coverFieldId: string }).coverFieldId).toBe(photo.id)
  })

  it('у каждой колонки есть пояснение для подсказки', () => {
    for (const template of TEMPLATES) {
      const built = build(template.id)
      for (const field of built.fields) expect(field.description).toBeTruthy()
    }
  })
})

describe('два человека получают разные таблицы', () => {
  it('повторная установка выпускает новые идентификаторы', () => {
    const first = build('katalog')
    const second = build('katalog')
    expect(first.tables[0]!.id).not.toBe(second.tables[0]!.id)
    expect(first.fields[0]!.id).not.toBe(second.fields[0]!.id)
  })
})

describe('клиентский портал приходит настроенным', () => {
  it('в собранном шаблоне указано, где почта клиента и что заполняет он сам', () => {
    const built = build('portal')
    // Поля с одинаковыми названиями есть в обеих таблицах, поэтому ищем
    // в той, вокруг которой собран кабинет.
    const byName = (name: string) =>
      built.fields.find((field) => field.tableId === built.appTableId && field.name === name)!

    expect(built.portal?.tableId).toBe(built.appTableId)
    expect(built.portal?.emailFieldId).toBe(byName('Почта клиента').id)
    expect(built.portal?.clientTitle).toBe('Мои заказы')

    // Служебные поля в форму клиента не попадают: иначе он сам себе
    // поставит «Выдан» и поправит сумму.
    expect(built.portal?.clientFieldIds).toEqual([
      byName('Заказ').id,
      byName('Почта клиента').id,
      byName('Пожелания клиента').id,
    ])
    for (const name of ['Статус', 'Сумма', 'Оплачен', 'Заметки для своих']) {
      expect(built.portal?.clientFieldIds, name).not.toContain(byName(name).id)
    }
  })

  it('у остальных шаблонов портала нет', () => {
    for (const template of TEMPLATES) {
      if (template.id === 'portal') continue
      expect(build(template.id).portal, template.id).toBeNull()
    }
  })
})

describe('учёт заказов: итог собирается из позиций', () => {
  it('«Итого» суммирует стоимости выбранных позиций', () => {
    const built = build('zakazy')
    const orders = built.tables.find((table) => table.name === 'Заказы')!
    const items = built.tables.find((table) => table.name === 'Позиции заказов')!

    const orderFields = built.fields
      .filter((field) => field.tableId === orders.id)
      .map((field) => field as unknown as Field)
    const itemFields = built.fields
      .filter((field) => field.tableId === items.id)
      .map((field) => field as unknown as Field)

    // Стоимость позиции — формула, поэтому связанные строки считаем как на чтении.
    const itemFormulas = compileTableFormulas(itemFields)
    const itemRows = built.rows
      .filter((row) => row.tableId === items.id)
      .map((row) => [row.id, computeDerivedRow(row.data, itemFields, new Map(), itemFormulas)] as const)
    const related: RelatedIndex = new Map([[items.id, new Map(itemRows)]])

    const total = orderFields.find((field) => field.name === 'Итого')!
    const positions = orderFields.find((field) => field.name === 'Позиции')!
    const cost = itemFields.find((field) => field.name === 'Стоимость')!

    const first = built.rows.find((row) => row.tableId === orders.id)!
    const computed = computeDerivedRow(first.data, orderFields, related, compileTableFormulas(orderFields))

    const expected = (first.data[positions.id] as string[])
      .map((id) => new Map(itemRows).get(id)!)
      .reduce((sum, row) => sum + Number(row[cost.id] ?? 0), 0)

    expect(computed[total.id]).toBe(expected)
    expect(expected).toBeGreaterThan(0)
  })
})
