import type { App, Component, Field, Screen, View } from '@tableapp/schema'
import { appSchema, isComputed, newId, positionSequence } from '@tableapp/schema'
import { defaultDashboard } from './dashboard-suggest'

/**
 * Сборка приложения по таблице.
 *
 * Главный трюк Glide — «покажи таблицу, получи приложение»: пустой конструктор
 * отпугивает, а готовые экраны хочется дорабатывать. Поэтому приложение
 * создаётся сразу рабочим, а настройка идёт уже поверх.
 */

const IMAGE_TYPES = new Set(['image', 'attachment'])
const SUBTITLE_TYPES = new Set(['text', 'number', 'date', 'datetime', 'email', 'phone', 'rollup', 'formula'])

function pickImageField(fields: readonly Field[]): Field | undefined {
  return fields.find((field) => IMAGE_TYPES.has(field.type))
}

function pickSubtitleField(fields: readonly Field[], titleId: string | null): Field | undefined {
  return fields.find((field) => field.id !== titleId && SUBTITLE_TYPES.has(field.type))
}

/**
 * Колонка статуса для плашки и вкладок над списком.
 *
 * Отдельно от подписи: статус отвечает на «на каком этапе», подпись — на
 * «что это и чьё». Одно поле на оба вопроса означало, что в строке либо
 * не видно этапа, либо не видно заказчика.
 */
function pickStatusField(fields: readonly Field[]): Field | undefined {
  return fields.find((field) => field.type === 'single_select' && field.options.choices.length > 1)
}

/**
 * Значение справа в списке — то, ради чего в него и смотрят: цена, остаток,
 * сумма. Берём первое числовое поле, кроме уже занятых заголовком и подписью.
 */
function pickMetaField(fields: readonly Field[], busy: (string | null)[]): Field | undefined {
  return fields.find(
    (field) => !busy.includes(field.id) && (field.type === 'number' || field.type === 'rollup'),
  )
}

export function slugify(name: string): string {
  const translit: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya',
  }
  const base = [...name.toLowerCase()]
    .map((char) => translit[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  // Ссылка должна оставаться валидной даже для названия из одних эмодзи.
  return base.length >= 2 ? base : `app-${newId('app').slice(4, 10)}`
}

export function generateApp(input: {
  appId: string
  workspaceId: string
  name: string
  slug: string
  table: { id: string; name: string; primaryFieldId: string | null }
  fields: readonly Field[]
  view: View
}): App {
  const { appId, table, fields, view } = input

  const titleField = fields.find((field) => field.id === table.primaryFieldId) ?? fields[0]
  const imageField = pickImageField(fields)
  const subtitleField = pickSubtitleField(fields, titleField?.id ?? null)
  const statusField = pickStatusField(fields)
  const metaField = pickMetaField(fields, [titleField?.id ?? null, subtitleField?.id ?? null])
  // Связь в форме заполняется выбором строк — это одно из главных действий
  // в приложении, исключать её из формы нельзя.
  const editable = fields.filter((field) => !isComputed(field.type))

  const homeId = newId('screen')
  const listId = newId('screen')
  const detailId = newId('screen')
  const createId = newId('screen')
  const editId = newId('screen')
  const [homePos, listPos, detailPos, createPos, editPos] = positionSequence(5) as [
    string,
    string,
    string,
    string,
    string,
  ]

  const detailComponents: Component[] = []
  const detailPositions = positionSequence(fields.length + 4)
  let cursor = 0
  const nextPos = () => detailPositions[cursor++]!

  if (imageField) {
    detailComponents.push({
      id: newId('component'), position: nextPos(), visibleWhen: null, roles: null,
      type: 'image', fieldId: imageField.id, aspect: 'wide',
    })
  }
  if (titleField) {
    detailComponents.push({
      id: newId('component'), position: nextPos(), visibleWhen: null, roles: null,
      type: 'heading', source: { kind: 'field', fieldId: titleField.id }, size: 'l',
    })
  }
  for (const field of fields) {
    if (field.id === titleField?.id || field.id === imageField?.id) continue
    detailComponents.push({
      id: newId('component'), position: nextPos(), visibleWhen: null, roles: null,
      type: 'field', fieldId: field.id, label: null, showWhenEmpty: false,
    })
  }
  detailComponents.push({
    id: newId('component'), position: nextPos(), visibleWhen: null, roles: null,
    type: 'button', label: 'Изменить', style: 'secondary',
    action: { id: newId('action'), type: 'open_screen', screenId: editId },
  })

  const formComponents = (): Component[] => {
    const positions = positionSequence(editable.length)
    return editable.map((field, index) => ({
      id: newId('component'), position: positions[index]!, visibleWhen: null, roles: null,
      type: 'form_field', fieldId: field.id, label: null, required: false, placeholder: null,
    }))
  }

  const screens: Screen[] = [
    /*
     * Домашний экран — сводка, а не список.
     *
     * Человек открывает приложение утром не затем, чтобы прочитать таблицу,
     * а чтобы узнать, сколько сегодня работы и что горит. Блоки собираются
     * по колонкам самой таблицы: есть статус — будет доска, есть деньги
     * и дата — будет сумма за месяц. Дальше владелец меняет это в конструкторе.
     */
    {
      id: homeId, appId, name: 'Сводка', position: homePos,
      tab: { icon: 'home', label: 'Главная' },
      access: { public: false, publicFields: [], roles: ['client', 'staff', 'manager'], allowDelete: false },
      type: 'dashboard',
      blocks: defaultDashboard({
        fields,
        viewId: view.id,
        tableName: table.name,
        listScreenId: listId,
        detailScreenId: detailId,
        createScreenId: createId,
        primaryFieldId: table.primaryFieldId,
      }),
    },
    {
      id: listId, appId, name: table.name, position: listPos,
      tab: { icon: 'list', label: table.name.slice(0, 30) },
      // Умолчание закрытое: гостю экраны открывает владелец осознанно.
      access: { public: false, publicFields: [], roles: ['client', 'staff', 'manager'], allowDelete: false },
      type: 'list',
      /*
       * Искать есть смысл по тому, что человек помнит: названию и подписи.
       * По служебным колонкам он искать не станет, а лишние поля в поиске —
       * это лишние поля, уезжающие в браузер.
       */
      source: {
        viewId: view.id,
        extraFilter: null,
        searchFieldIds: [titleField?.id, subtitleField?.id].filter((id): id is string => Boolean(id)),
      },
      titleFieldId: titleField?.id ?? null,
      subtitleFieldId: subtitleField?.id ?? null,
      imageFieldId: imageField?.id ?? null,
      metaFieldId: metaField?.id ?? null,
      statusFieldId: statusField?.id ?? null,
      onTapScreenId: detailId,
      components: [],
    },
    {
      id: detailId, appId, name: 'Карточка', position: detailPos, tab: null,
      access: { public: false, publicFields: [], roles: ['client', 'staff', 'manager'], allowDelete: false },
      type: 'detail', tableId: table.id, components: detailComponents,
    },
    {
      id: createId, appId, name: 'Новая запись', position: createPos,
      tab: { icon: 'plus', label: 'Добавить' },
      access: { public: false, publicFields: [], roles: ['client', 'staff', 'manager'], allowDelete: false },
      type: 'form', tableId: table.id, mode: 'create',
      submitLabel: 'Создать', successScreenId: listId, successText: '', components: formComponents(),
    },
    {
      id: editId, appId, name: 'Редактирование', position: editPos, tab: null,
      access: { public: false, publicFields: [], roles: ['client', 'staff', 'manager'], allowDelete: false },
      type: 'form', tableId: table.id, mode: 'edit',
      submitLabel: 'Сохранить', successScreenId: detailId, successText: '', components: formComponents(),
    },
  ]

  return appSchema.parse({
    id: appId,
    workspaceId: input.workspaceId,
    name: input.name,
    slug: input.slug,
    theme: { accent: 'blue', scheme: 'auto', logoKey: null, iconKey: null },
    // Умолчание закрытое: доступ выдаёт владелец, добавляя адреса.
    accessMode: 'allowlist',
    allowlist: [],
    rowAccessRules: [],
    screens,
    homeScreenId: homeId,
    publishedAt: null,
  })
}
