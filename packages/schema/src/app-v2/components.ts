import { z } from 'zod'
import { appV2Schema, type AppV2Node } from './schema'

/** One vocabulary for the editor and future app planners. This describes capabilities, not permissions. */
export const appV2ComponentCatalog = {
  team_calendar: ['Календарь команды', 'Записи и рабочие часы сотрудников в одном календаре', 'calendar'],
  profile: ['Профиль', 'Фото, имя, контакты и действия клиента или сотрудника', 'user'],
  business: ['Бизнес-операция', 'Склад, производство или запись по времени', 'action'],
  gallery: ['Галерея', 'Фотографии из записи или по ссылкам', 'image'],
  files: ['Файлы', 'Документы и вложения записи', 'file'],
  heading: ['Заголовок', 'Название раздела', 'text'], text: ['Текст', 'Описание или пояснение', 'text'],
  group: ['Группа', 'Элементы в одном блоке', 'apps'], columns: ['Колонки', 'Элементы рядом', 'apps'],
  collection: ['Список', 'Записи из таблицы', 'table'], metric: ['Показатель', 'Количество или сумма', 'gauge'],
  chart: ['Диаграмма', 'Сравнение категорий и изменения по датам', 'chart'], video: ['Видео', 'Видео по прямой ссылке', 'video'],
  button: ['Кнопка', 'Переход или действие', 'action'], image: ['Изображение', 'Картинка по ссылке', 'apps'],
  divider: ['Разделитель', 'Линия между блоками', 'text'], form: ['Форма', 'Поля для создания или изменения записи', 'plus'],
  input: ['Поле ввода', 'Поле внутри формы', 'text'], field: ['Поле записи', 'Значение выбранной записи', 'template'],
} as const satisfies Record<AppV2Node['type'], readonly [string, string, string]>

export const appV2ComponentPresets = {
  history: { name: 'История', description: 'Связанные визиты, заказы и события с датой, статусом и суммой', type: 'collection', layout: 'history', requires: ['date_field'], icon: 'history' },
} as const

/** Generated from executable contracts; no separately maintained, potentially fictional AI schema. */
export function appV2AuthoringContract() {
  return {
    version: 1, formatVersion: 2,
    components: appV2ComponentCatalog, presets: appV2ComponentPresets,
    schema: z.toJSONSchema(appV2Schema),
    rules: [
      'Use only existing workspace tables and fields supplied by the server.',
      'Resolve unclear relations, ownership and intended actions by asking the user.',
      'Generate a draft and validate it with validateAppV2 and the real workspace catalog.',
      'Visibility does not grant read or write access; permissions are checked independently.',
      'Never execute actions, alter source data or publish merely by generating a definition.',
    ],
  }
}
