import type { App, Field, View } from '@tableapp/schema'
import { newId } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { generateApp } from '../app-builder'
import { buildTemplate } from './build'
import { findTemplate } from './catalog'
import { asProduction, DIRECTOR, FOREMAN } from './production-app'

/**
 * Приложение производственного учёта.
 *
 * Проверяется то, что молчит, когда сделано неверно: роли, права на экраны
 * и ссылки между ними. Неверно розданное право не падает с ошибкой — оно
 * однажды показывает начальнику смены себестоимость, и узнают об этом
 * не от продукта.
 */

function app(): { app: App; built: ReturnType<typeof buildTemplate> } {
  const built = buildTemplate({
    template: findTemplate('proizvodstvo')!,
    workspaceId: 'wsp_test',
    now: new Date('2026-03-10T09:00:00Z'),
  })
  const table = built.tables.find((item) => item.id === built.appTableId)!
  const generated = generateApp({
    appId: newId('app'),
    workspaceId: 'wsp_test',
    name: built.appName,
    slug: 'proizvodstvo',
    table: { id: table.id, name: table.name, primaryFieldId: table.primaryFieldId },
    fields: built.fields.filter((field) => field.tableId === table.id) as unknown as Field[],
    view: built.views.find((view) => view.id === built.appViewId)! as unknown as View,
  })
  return { app: asProduction(generated, built), built }
}

const screenNames = (value: App) => value.screens.map((screen) => screen.name)
const named = (value: App, name: string) => value.screens.find((screen) => screen.name === name)!
/** Экран с компонентами: у сводки их нет, и обращение к ним — ошибка теста. */
function withComponents(value: App, name: string) {
  const screen = named(value, name)
  if (screen.type === 'dashboard') throw new Error(`${name}: экран собран сводкой`)
  return screen
}
/** Экраны, доступные роли: ровно то, что человек может открыть. */
const visibleTo = (value: App, role: string) =>
  value.screens.filter((screen) => screen.access.roles.includes(role)).map((screen) => screen.name)

describe('роли', () => {
  it('две: директор и начальник производства', () => {
    const { app: built } = app()
    expect(built.roles.map((role) => role.name)).toEqual(['Директор', 'Начальник производства'])
  })

  it('роль по умолчанию — начальник производства, а не директор', () => {
    /*
     * Умолчание достаётся всякому, кого впустили, но отдельно не назвали.
     * Ошибиться здесь безопасно можно только в одну сторону: лишний человек
     * увидит ввод выпуска, а не сводку по браку и себестоимость.
     */
    const { app: built } = app()
    expect(built.roles.find((role) => role.isDefault)?.id).toBe(FOREMAN)
  })

  it('вход только по списку, наружу не открыт ни один экран', () => {
    const { app: built } = app()
    expect(built.accessMode).toBe('allowlist')
    expect(built.screens.every((screen) => screen.access.public === false)).toBe(true)
    expect(built.screens.every((screen) => screen.access.publicFields.length === 0)).toBe(true)
  })
})

describe('что кому видно', () => {
  it('начальнику производства не видны сводка, нормы и ручные движения', () => {
    /*
     * Нормы — это себестоимость в пересчёте на изделие, а сводка — брак
     * по сменам. Ни то ни другое не нужно для ввода выпуска.
     */
    const { app: built } = app()
    const forForeman = visibleTo(built, FOREMAN)
    expect(forForeman).not.toContain('Сводка')
    expect(forForeman).not.toContain('Нормы расхода')
    expect(forForeman).not.toContain('Движение склада')
  })

  it('справочник изделий ему открыт, но только на чтение', () => {
    /*
     * Открыт, потому что иначе в форме выпуска не из чего выбирать: подписи
     * связанных строк выдаются только по доступным таблицам. Добавлять
     * и править изделия он при этом не может — формы у него нет.
     */
    const { app: built } = app()
    expect(visibleTo(built, FOREMAN)).toContain('Продукция')
    const forms = built.screens.filter(
      (screen) => screen.type === 'form' && screen.access.roles.includes(FOREMAN),
    )
    expect(forms.map((screen) => screen.name).sort()).toEqual([
      'Комментарий к выпуску',
      'Новый выпуск',
    ])
  })

  it('начальнику производства видны выпуск, журнал и остатки', () => {
    const { app: built } = app()
    const forForeman = visibleTo(built, FOREMAN)
    expect(forForeman).toContain('Новый выпуск')
    expect(forForeman).toContain('Выпуски')
    expect(forForeman).toContain('Материалы')
    expect(forForeman).toContain('Журнал склада')
  })

  it('директору видно всё', () => {
    const { app: built } = app()
    expect(visibleTo(built, DIRECTOR).sort()).toEqual(screenNames(built).sort())
  })

  it('удалять выпуск может только директор', () => {
    /*
     * Право удалять живёт на экране целиком. Разреши его на общей карточке —
     * и удалять сможет начальник производства, потому что карточка у них одна.
     * Поэтому отмена вынесена на свой экран, закрытый ролью: проверяется
     * на сервере именно он, а не наличие кнопки.
     */
    const { app: built } = app()
    const deletable = built.screens.filter((screen) => screen.access.allowDelete)
    expect(deletable.map((screen) => screen.name)).toEqual(['Отмена выпуска'])
    expect(deletable[0]!.access.roles).toEqual([DIRECTOR])
  })

  it('на карточке нет колонки, повторяющей связь', () => {
    /*
     * Название изделия берётся подстановкой ради заголовка строки — формула
     * связь не разворачивает. На карточке связь и так показана названием,
     * и второе такое же поле читается как ошибка ввода.
     */
    const { app: built, built: template } = app()
    const card = withComponents(built, 'Карточка выпуска')
    const shown = card.components.flatMap((component) =>
      component.type === 'field' ? [component.fieldId] : [],
    )
    const lookup = template.fields.find(
      (field) => field.tableId === built.production!.tables.production && field.type === 'lookup',
    )!
    expect(shown).toContain(built.production!.run.product)
    expect(shown).not.toContain(lookup.id)
  })

  it('кнопка отмены на карточке видна только директору', () => {
    const { app: built } = app()
    const card = withComponents(built, 'Карточка выпуска')
    const button = card.components.find(
      (component) => component.type === 'button' && component.label === 'Отменить выпуск',
    )!
    expect(button.roles).toEqual([DIRECTOR])
  })
})

describe('куда попадает человек', () => {
  it('домашний экран — сводка директора', () => {
    const { app: built } = app()
    expect(built.screens.find((screen) => screen.id === built.homeScreenId)?.name).toBe('Сводка')
  })

  it('начальник производства попадает на ввод выпуска', () => {
    /*
     * Домашний экран ему не открыт, и приложение показывает первый доступный
     * раздел с вкладкой. Порядок экранов — это и есть его стартовая страница.
     */
    const { app: built } = app()
    const first = built.screens.find(
      (screen) => screen.tab && screen.access.roles.includes(FOREMAN),
    )
    expect(first?.name).toBe('Новый выпуск')
  })

  it('на телефоне помещаются все вкладки директора', () => {
    // Нижняя навигация показывает пять: шестая вкладка была бы недоступна.
    const { app: built } = app()
    const tabs = built.screens.filter((screen) => screen.tab && screen.access.roles.includes(DIRECTOR))
    expect(tabs.length).toBeLessThanOrEqual(5)
  })
})

describe('форма выпуска', () => {
  it('отмечена в настройке приложения', () => {
    /*
     * Без отметки рантайм сохранил бы её обычным «создать строку»: выпуск
     * записался бы, материалы — нет. С виду успешно.
     */
    const { app: built } = app()
    const form = built.screens.find((screen) => screen.id === built.production?.formScreenId)
    expect(form?.name).toBe('Новый выпуск')
    expect(form?.type).toBe('form')
    expect(form && form.type === 'form' ? form.tableId : null).toBe(built.production?.tables.production)
  })

  it('спрашивает всё, что нужно расчёту', () => {
    const { app: built } = app()
    const form = withComponents(built, 'Новый выпуск')
    const asked = form.components.flatMap((component) =>
      component.type === 'form_field' ? [component.fieldId] : [],
    )
    const run = built.production!.run
    expect(asked).toContain(run.product)
    expect(asked).toContain(run.qty)
    expect(asked).toContain(run.defects)
    expect(asked).toContain(run.date)
  })

  it('после сохранения правится только комментарий', () => {
    /*
     * Списания посчитаны один раз и записаны числами. Позволь переписать
     * количество задним числом — и журнал разошёлся бы с выпуском молча.
     */
    const { app: built } = app()
    const form = withComponents(built, 'Комментарий к выпуску')
    const asked = form.components.flatMap((component) =>
      component.type === 'form_field' ? [component.fieldId] : [],
    )
    expect(asked).toEqual([built.production!.run.note])
  })

  it('ручное движение склада тоже идёт своим действием', () => {
    // Обычная форма не заполнила бы связь материала, и остаток не сдвинулся бы.
    const { app: built } = app()
    const form = built.screens.find((screen) => screen.id === built.production?.movementScreenId)
    expect(form?.name).toBe('Движение склада')
    expect(form?.access.roles).toEqual([DIRECTOR])
  })
})

describe('связи видно тем, кто их выбирает', () => {
  /*
   * Подпись связанной строки — такие же данные, как сама строка, и рантайм
   * выдаёт её только по таблицам, до которых человек может дойти. Значит,
   * роль, которой показали поле связи, обязана иметь доступ и к таблице-цели:
   * иначе список в форме окажется пустым, и выпуск ввести будет нечем.
   */
  const targetsOf = (built: ReturnType<typeof buildTemplate>, tableId: string) =>
    built.fields
      .filter((field) => field.tableId === tableId && field.type === 'relation')
      .map((field) => (field.options as { tableId: string }).tableId)

  it.each([DIRECTOR, FOREMAN])('роль %s достаёт до всех связанных таблиц', (role) => {
    const { app: built, built: template } = app()
    const viewTable = (viewId: string) =>
      template.views.find((view) => view.id === viewId)?.tableId ?? null

    const open = built.screens.filter((screen) => screen.access.roles.includes(role))
    const reachable = new Set(
      open.flatMap((screen) => {
        if (screen.type === 'list' || screen.type === 'tiles') {
          const table = viewTable(screen.source.viewId)
          return table ? [table] : []
        }
        if (screen.type === 'detail' || screen.type === 'form') return [screen.tableId]
        return []
      }),
    )

    for (const tableId of reachable) {
      for (const target of targetsOf(template, tableId)) {
        const name = template.tables.find((table) => table.id === target)?.name
        expect(reachable.has(target), `${role}: не видно таблицу «${name}»`).toBe(true)
      }
    }
  })
})

describe('сводка', () => {
  it('три числа, список закупок и последние выпуски', () => {
    const { app: built } = app()
    const dashboard = named(built, 'Сводка')
    if (dashboard.type !== 'dashboard') throw new Error('Сводка не собралась')
    expect(dashboard.blocks.filter((block) => block.type === 'metric').map((block) => block.title)).toEqual([
      'Произведено сегодня',
      'Брак сегодня',
      'Материалов ниже нормы',
    ])
    expect(dashboard.blocks.filter((block) => block.type === 'list').map((block) => block.title)).toEqual([
      'Пора закупать',
      'Последние выпуски',
    ])
  })

  it('считает по существующим представлениям и колонкам', () => {
    const { app: built, built: template } = app()
    const viewIds = new Set(template.views.map((view) => view.id))
    const fieldIds = new Set(template.fields.map((field) => field.id))
    const dashboard = named(built, 'Сводка')
    if (dashboard.type !== 'dashboard') throw new Error('Сводка не собралась')

    for (const block of dashboard.blocks) {
      if (block.type === 'actions' || block.type === 'note') continue
      expect(viewIds.has(block.source.viewId), block.title).toBe(true)
      if (block.type === 'metric' && block.fieldId) expect(fieldIds.has(block.fieldId)).toBe(true)
      if (block.type === 'list' && block.titleFieldId) expect(fieldIds.has(block.titleFieldId)).toBe(true)
    }
  })

  it('справочники достижимы кнопками, раз им не досталось вкладки', () => {
    const { app: built } = app()
    const dashboard = named(built, 'Сводка')
    if (dashboard.type !== 'dashboard') throw new Error('Сводка не собралась')
    const actions = dashboard.blocks.find((block) => block.type === 'actions')
    if (!actions || actions.type !== 'actions') throw new Error('Нет блока действий')

    const ids = new Set(built.screens.map((screen) => screen.id))
    for (const item of actions.items) expect(ids.has(item.screenId), item.label).toBe(true)
    expect(actions.items.map((item) => item.label)).toEqual([
      'Движение склада',
      'Нормы расхода',
      'Продукция',
    ])
  })
})

describe('связность', () => {
  it('ни одна ссылка не ведёт в никуда', () => {
    /*
     * Экран, которого нет, в рантайме означает пустую страницу без объяснений.
     * Проверяются все переходы разом: из списка в карточку, после отправки
     * формы и кнопками сводки.
     */
    const { app: built } = app()
    const ids = new Set(built.screens.map((screen) => screen.id))

    for (const screen of built.screens) {
      if ((screen.type === 'list' || screen.type === 'tiles') && screen.onTapScreenId) {
        expect(ids.has(screen.onTapScreenId), screen.name).toBe(true)
      }
      if (screen.type === 'form' && screen.successScreenId) {
        expect(ids.has(screen.successScreenId), screen.name).toBe(true)
      }
      for (const component of 'components' in screen ? screen.components : []) {
        if (component.type === 'button' && component.action.type === 'open_screen') {
          expect(ids.has(component.action.screenId), screen.name).toBe(true)
        }
      }
    }
  })

  it('карта производства указывает на настоящие таблицы и колонки', () => {
    const { app: built, built: template } = app()
    const config = built.production!
    const tableIds = new Set(template.tables.map((table) => table.id))
    const fieldIds = new Set(template.fields.map((field) => field.id))

    for (const id of Object.values(config.tables)) expect(tableIds.has(id)).toBe(true)
    for (const group of [config.run, config.norm, config.movement, config.material]) {
      for (const id of Object.values(group)) expect(fieldIds.has(id)).toBe(true)
    }
  })

  it('вариант «Производство» взят из колонки типа движения', () => {
    // Иначе списания попали бы в журнал с пустым типом и выпали из отбора.
    const { app: built, built: template } = app()
    const kind = template.fields.find((field) => field.id === built.production!.movement.kind)!
    const choices = (kind.options as { choices: { id: string; name: string }[] }).choices
    expect(choices.find((choice) => choice.id === built.production!.movementKindId)?.name).toBe(
      'Производство',
    )
  })

  it('у каждого экрана своё место в списке', () => {
    // Одинаковые позиции дают неустойчивый порядок вкладок между заходами.
    const { app: built } = app()
    const positions = built.screens.map((screen) => screen.position)
    expect(new Set(positions).size).toBe(positions.length)
    expect([...positions].sort()).toEqual(positions)
  })
})
