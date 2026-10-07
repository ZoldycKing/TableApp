import { isComputed, type Field } from '@tableapp/schema'

/**
 * Пояснение к полю: что это, как заполнять и на что влияет.
 *
 * Пишем так, как объясняли бы владельцу небольшой фирмы, который таблицы
 * ведёт в Excel, а слов «Rollup» и «вычисляемое поле» не знает и знать
 * не обязан. Поэтому: никаких заимствований, примеры из его дела и всегда
 * ответ на вопрос «а мне-то что с этим делать».
 *
 * Собирается из настроек самого поля и из того, кто на него ссылается.
 * Связи между полями — самое непонятное место таблицы: человек правит
 * «Сумму» и не догадывается, что от неё считается «НДС», а очистив «Позиции»,
 * обнуляет «Итого». Поэтому зависимости считаются по факту, а не описываются
 * словами в документации, которую никто не откроет.
 */

export type FieldHelp = {
  what: string
  how: string
  /** Поля, которые считаются по этому. */
  affects: string[]
  /** Поля, от которых зависит это. */
  dependsOn: string[]
}

const ROLLUP_NAMES: Record<string, string> = {
  sum: 'сумму',
  avg: 'среднее',
  min: 'минимум',
  max: 'максимум',
  count: 'количество',
  and: 'логическое И',
  or: 'логическое ИЛИ',
}

function nameOf(fields: readonly Field[], id: string | undefined): string {
  if (!id) return 'неизвестное поле'
  return fields.find((field) => field.id === id)?.name ?? 'удалённое поле'
}

/** Таблица и поля, на которые смотрит вычисляемое поле. */
export type RelatedTables = Record<string, { name: string; fields: readonly Field[] }>

/**
 * Поле, на которое смотрят Lookup и Rollup, лежит в соседней таблице.
 * Разворачиваем его через связь: relationFieldId → таблица → нужное поле.
 * Без этого подсказка отвечала «поле связанной таблицы» ровно там, где
 * человек и спрашивает «а откуда взялось это число».
 */
function targetName(
  field: Field & { options: { relationFieldId?: string; targetFieldId?: string } },
  fields: readonly Field[],
  tables?: RelatedTables,
): { field: string; table: string | null } {
  const relation = fields.find((item) => item.id === field.options.relationFieldId)
  const tableId = relation && relation.type === 'relation' ? relation.options.tableId : undefined
  const related = tableId ? tables?.[tableId] : undefined
  const target = related?.fields.find((item) => item.id === field.options.targetFieldId)

  return {
    field: target?.name ?? 'поле связанной таблицы',
    table: related?.name ?? null,
  }
}

/** «Цена» в таблице «Позиции» — если знаем и то, и другое. */
function describeTarget(target: { field: string; table: string | null }): string {
  return target.table ? `«${target.field}» из таблицы «${target.table}»` : `«${target.field}»`
}

/** Кто ссылается на это поле: формулы по имени, вычисляемые — по ссылке. */
function findDependents(field: Field, fields: readonly Field[], tableName?: string): string[] {
  const dependents: string[] = []

  for (const other of fields) {
    if (other.id === field.id) continue

    if (other.type === 'formula' && other.options.expression.includes(field.name)) {
      dependents.push(`«${other.name}» — считается формулой`)
      continue
    }

    if (other.type === 'lookup' || other.type === 'rollup') {
      if (other.options.relationFieldId === field.id) {
        dependents.push(`«${other.name}» — берёт числа из привязанных строк`)
      }
      continue
    }

    if (other.type === 'count' && other.options.relationFieldId === field.id) {
      dependents.push(`«${other.name}» — считает, сколько строк привязано`)
    }
  }

  // Поле из соседней таблицы, на которое смотрит Lookup или Rollup, в этом
  // списке не окажется: оно лежит в другой таблице, и отсюда его не видно.
  if (tableName && field.type === 'relation') {
    dependents.push(`строки таблицы «${tableName}» — они привязываются здесь`)
  }

  return dependents
}

export function describeField(
  field: Field,
  fields: readonly Field[],
  tables?: RelatedTables,
): FieldHelp {
  const relatedTableName = field.type === 'relation' ? tables?.[field.options.tableId]?.name : undefined
  const affects = findDependents(field, fields, relatedTableName)
  const dependsOn: string[] = []

  switch (field.type) {
    case 'text':
    case 'long_text':
      return {
        what: field.type === 'long_text'
          ? 'Длинный текст: описание работ, адрес, примечание.'
          : 'Любой текст: название фирмы, фамилия, номер договора.',
        how: field.type === 'long_text'
          ? 'Пишите как удобно, можно в несколько строк. В таблице видно только начало, целиком — здесь.'
          : 'Пишите как удобно, проверок нет.',
        affects,
        dependsOn,
      }

    case 'number':
      return {
        what: `Число: сумма, количество, вес${field.options.format === 'currency' ? `. Показывается как деньги (${field.options.currency})` : ''}. По такому полю таблицу можно отсортировать и отобрать, скажем, всё дороже ста тысяч.`,
        how: 'Пишите цифры. Точка и запятая — одно и то же. Пробелы между тысячами подставятся сами, вводить их не нужно.',
        affects,
        dependsOn,
      }

    case 'checkbox':
      return {
        what: 'Галочка: да или нет. Например «оплачено», «отгружено», «подписан акт».',
        how: 'Нажмите «Да» или «Нет». Пустая клетка в таблице означает «нет» — третьего состояния здесь не бывает.',
        affects,
        dependsOn,
      }

    case 'date':
    case 'datetime':
      return {
        what: field.type === 'datetime'
          ? 'Дата и время: когда выезжать, во сколько встреча.'
          : 'Дата: срок, день отгрузки, дата договора.',
        how: 'Выберите в календаре или введите с клавиатуры. Время московское — что поставили, то и увидят сотрудники. Из файла Excel даты подхватываются и в виде 14.03.2026, и в виде 2026-03-14.',
        affects,
        dependsOn,
      }

    case 'single_select':
    case 'multi_select': {
      const names = field.options.choices.map((choice) => choice.name)
      const list = names.length > 0 ? names.join(', ') : 'варианты пока не заданы'
      return {
        what: field.type === 'single_select'
          ? `Выбор одного значения из готового списка: ${list}. Удобно для статусов: так никто не напишет «в работе», «В работе» и «в рабте» тремя разными способами.`
          : `Здесь можно отметить сразу несколько: ${list}.`,
        how: 'Нажмите нужное. Нажмёте ещё раз — снимется. Чтобы добавить свой вариант в список, нажмите шестерёнку в шапке этой колонки в таблице.',
        affects,
        dependsOn,
      }
    }

    case 'relation':
      return {
        what: `Привязка к строкам ${relatedTableName ? `таблицы «${relatedTableName}»` : 'другой таблицы'}. Так заявка связывается с тем, что в неё входит: товарами, услугами, людьми. ${field.options.allowMultiple ? 'Привязать можно несколько строк.' : 'Привязывается одна строка.'}`,
        how: `Отметьте нужные строки в списке ниже, если их много — ищите по названию. Крестик убирает привязку. Саму строку ${relatedTableName ? `в таблице «${relatedTableName}»` : 'в той таблице'} это не удаляет.`,
        affects,
        dependsOn,
      }

    case 'lookup':
      return {
        what: `Подтягивает сюда ${describeTarget(targetName(field, fields, tables))} — из тех строк, что привязаны в поле «${nameOf(fields, field.options.relationFieldId)}». Своего значения у этого поля нет, оно просто показывает чужое.`,
        how: 'Здесь ничего не вводят: поле заполняется само. Хотите другое значение — поменяйте привязку выше или исправьте саму строку в связанной таблице.',
        affects,
        dependsOn: [
          `«${nameOf(fields, field.options.relationFieldId)}» — отсюда берутся привязанные строки`,
          `${describeTarget(targetName(field, fields, tables))} — само значение`,
        ],
      }

    case 'rollup':
      return {
        what: `Считает итог по привязанным строкам: ${ROLLUP_NAMES[field.options.fn] ?? field.options.fn} по полю ${describeTarget(targetName(field, fields, tables))}. Берутся только те строки, что отмечены в поле «${nameOf(fields, field.options.relationFieldId)}». Числа, которые вы вводите руками в этой таблице, сюда не попадают — это разные вещи.`,
        how: 'Здесь ничего не вводят: считается само. Число поменяется, когда добавите или уберёте привязку либо когда изменится значение в связанной строке.',
        affects,
        dependsOn: [
          `«${nameOf(fields, field.options.relationFieldId)}» — отсюда берутся привязанные строки`,
          `${describeTarget(targetName(field, fields, tables))} — то, что складывается`,
        ],
      }

    case 'count':
      return {
        what: `Просто счётчик: сколько строк привязано в поле «${nameOf(fields, field.options.relationFieldId)}». Например, сколько позиций в заявке.`,
        how: 'Здесь ничего не вводят: считается само, когда добавляете или убираете привязки.',
        affects,
        dependsOn: [`${nameOf(fields, field.options.relationFieldId)} — связь, строки которой считаются`],
      }

    case 'formula':
      return {
        what: `Считается по формуле из других полей этой же строки, как в Excel: ${field.options.expression || 'формула пока не задана'}`,
        how: 'Здесь ничего не вводят: число появляется само. Чтобы оно изменилось, поправьте поля, которые участвуют в формуле. Саму формулу можно изменить шестерёнкой в шапке этой колонки.',
        affects,
        dependsOn: fields
          .filter((other) => other.id !== field.id && field.options.expression.includes(other.name))
          .map((other) => other.name),
      }

    case 'attachment':
    case 'image':
      return {
        what: field.type === 'image'
          ? 'Фотографии к этой строке: снимок с объекта, фото товара.'
          : 'Файлы к этой строке: акт, накладная, договор.',
        how: `Перетащите файл сюда или выберите на компьютере, не больше ${field.options.maxCount} штук. Кто не видит эту строку, тот не откроет и файл — отдельно настраивать ничего не нужно.`,
        affects,
        dependsOn,
      }

    case 'email':
      return {
        what: 'Адрес электронной почты.',
        how: 'Важно: по такому полю приложение узнаёт сотрудника. Если в настройках приложения включено «каждый видит только свои строки», человек увидит ровно те строки, где в этом поле стоит его почта. Поэтому пишите сюда рабочий адрес того, кто отвечает за строку.',
        affects,
        dependsOn,
      }

    case 'phone':
      return {
        what: 'Номер телефона.',
        how: 'Пишите как привыкли: +7, 8, со скобками или без. Система номер не проверяет — как ввели, так и сохранится.',
        affects,
        dependsOn,
      }

    case 'url':
      return {
        what: 'Ссылка на сайт или документ.',
        how: 'Вставляйте адрес целиком, вместе с https:// в начале — иначе ссылка не откроется.',
        affects,
        dependsOn,
      }

    case 'member':
      return {
        what: 'Сотрудник вашего рабочего пространства.',
        how: 'Пока выбирается в самой таблице, а не здесь. Выбор прямо в карточке сделаем позже.',
        affects,
        dependsOn,
      }

    case 'created_time':
    case 'updated_time':
      return {
        what: field.type === 'created_time'
          ? 'Когда эту строку завели.'
          : 'Когда строку последний раз меняли.',
        how: 'Проставляется само, исправить нельзя — на то и нужно, чтобы дату нельзя было подправить задним числом.',
        affects,
        dependsOn,
      }

    default:
      return {
        what: isComputed(field.type) ? 'Вычисляемое поле.' : 'Поле таблицы.',
        how: isComputed(field.type)
          ? 'Заполняется системой, вручную не правится.'
          : 'Заполняется вручную.',
        affects,
        dependsOn,
      }
  }
}
