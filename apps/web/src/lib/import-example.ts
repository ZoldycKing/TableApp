import { buildFromCsv } from '@tableapp/import'
import { FIELD_LABELS } from './field-labels'

export const EXAMPLE_CSV = `Клиент;Адрес;Что сделать;Статус;Мастер;Сумма
ООО "Вектор";Ленина 14, оф. 3;Плановое ТО;В работе;Сергей;18500
Кафе "Пион";Мира 8;Не морозит;Новая;;9500
ИП Соколов;Гагарина 41;Замена фильтров;Готово;Андрей;12000`

/** The public page shows the real inference result, not a handwritten promise. */
export function exampleImportColumns() {
  return buildFromCsv(EXAMPLE_CSV).fields.map(field => [field.name, field.name, FIELD_LABELS[field.type]])
}
