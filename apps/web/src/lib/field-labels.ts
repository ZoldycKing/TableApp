import type { FieldType } from '@tableapp/schema'

/*
 * Названия типов человеческим языком. «Rollup» и «Lookup» — слова из чужого
 * словаря: владелец небольшого бизнеса читает их как шум и перестаёт доверять
 * всему экрану. Название должно говорить, что поле делает.
 */
export const FIELD_LABELS: Record<FieldType, string> = {
  text: 'Текст',
  long_text: 'Длинный текст',
  number: 'Число',
  date: 'Дата',
  datetime: 'Дата и время',
  checkbox: 'Да или нет',
  single_select: 'Выбор одного',
  multi_select: 'Выбор нескольких',
  attachment: 'Файлы',
  image: 'Фото',
  email: 'Почта',
  phone: 'Телефон',
  url: 'Ссылка',
  member: 'Сотрудник',
  relation: 'Связь с таблицей',
  formula: 'Формула',
  lookup: 'Значение из связанной',
  rollup: 'Итог по связанным',
  count: 'Сколько связано',
  created_time: 'Когда создано',
  updated_time: 'Когда изменено',
  created_by: 'Кем создано',
  updated_by: 'Кем изменено',
  row_id: 'Номер строки',
}

/** Типы, которые можно выбрать руками при импорте: вычисляемые тут неуместны. */
export const IMPORTABLE_TYPES: FieldType[] = [
  'text',
  'long_text',
  'number',
  'date',
  'datetime',
  'checkbox',
  'single_select',
  'email',
  'phone',
  'url',
]

export const OP_LABELS: Record<string, string> = {
  is: 'равно',
  is_not: 'не равно',
  contains: 'содержит',
  does_not_contain: 'не содержит',
  is_empty: 'пусто',
  is_not_empty: 'не пусто',
  gt: 'больше',
  gte: 'больше или равно',
  lt: 'меньше',
  lte: 'меньше или равно',
  is_any_of: 'любое из',
  is_none_of: 'ни одно из',
  has_any_of: 'содержит любое из',
  has_all_of: 'содержит все',
  has_none_of: 'не содержит ни одного',
  is_exactly: 'в точности',
  is_before: 'раньше',
  is_after: 'позже',
  is_on_or_before: 'не позже',
  is_on_or_after: 'не раньше',
  is_within: 'в диапазоне',
}

export const VIEW_TYPE_LABELS: Record<string, string> = {
  grid: 'Таблица',
  kanban: 'Канбан',
  calendar: 'Календарь',
  gallery: 'Галерея',
}
