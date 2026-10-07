import type { TemplateDef } from '../types'

export const katalog: TemplateDef = {
  id: 'katalog',
  name: 'Каталог для менеджера',
  tagline: 'Витрина товаров и услуг с ценами — показать клиенту с телефона',
  audience: 'Продажи на выезде, торговые представители, приём заказов',
  emoji: '🧾',
  kin: ['zakazy', 'sklad', 'nedvizhimost'],
  gives: [
    'Каталог с фотографиями, ценами и описанием',
    'Витрина плитками — открывается на телефоне у клиента на глазах',
    'Отдельный список того, что есть в наличии',
    'Ссылка на приложение: отправили менеджеру, он открыл и работает',
  ],
  appTable: 'goods',
  appName: 'Каталог',
  tables: [
    {
      key: 'goods',
      name: 'Позиции каталога',
      icon: 'tag',
      primary: 'name',
      fields: [
        {
          key: 'name',
          name: 'Наименование',
          type: 'text',
          help: 'Название так, как его произносит клиент. Это подпись под картинкой на витрине.',
        },
        {
          key: 'photo',
          name: 'Фото',
          type: 'image',
          help: 'Картинка позиции. Именно её видит клиент, когда менеджер показывает каталог с телефона.',
        },
        {
          key: 'descr',
          name: 'Описание',
          type: 'long_text',
          help: 'Два-три предложения: что входит, чем отличается. Открывается, когда нажали на карточку.',
        },
        {
          key: 'price',
          name: 'Цена',
          type: 'number',
          options: { format: 'currency', precision: 2, currency: 'RUB' },
          help: 'Цена для клиента. Показывается на карточке справа — на витрине её видно сразу, без открывания.',
        },
        {
          key: 'unit',
          name: 'Единица',
          type: 'single_select',
          choices: [
            { name: 'шт.', color: 'gray' },
            { name: 'услуга', color: 'blue' },
            { name: 'час', color: 'violet' },
            { name: 'м²', color: 'teal' },
          ],
          help: 'За что берётся цена: за штуку, за час, за метр. Убирает половину вопросов клиента.',
        },
        {
          key: 'category',
          name: 'Категория',
          type: 'single_select',
          choices: [
            { name: 'Оборудование', color: 'blue' },
            { name: 'Монтаж', color: 'orange' },
            { name: 'Обслуживание', color: 'green' },
            { name: 'Доставка', color: 'amber' },
          ],
          help: 'Раздел каталога. По нему удобно отобрать только то, о чём сейчас разговор.',
        },
        {
          key: 'available',
          name: 'Есть в наличии',
          type: 'checkbox',
          help: 'Отметка — позиция доступна сейчас. Снимите её, и позиция уйдёт из списка «В наличии», но останется в каталоге.',
        },
        {
          key: 'lead',
          name: 'Срок поставки',
          type: 'text',
          help: 'Через сколько привезём: «со склада», «5–7 дней». Пишите словами — так честнее, чем числом.',
        },
      ],
      views: [
        { name: 'Весь каталог', type: 'grid' },
        { name: 'Витрина', type: 'gallery', coverBy: 'photo' },
        { name: 'В наличии', type: 'grid', filter: { field: 'available', op: 'is', value: true } },
      ],
      rows: [
        { key: 'k1', values: { name: 'Кондиционер настенный, 09', descr: 'Сплит-система на помещение до 25 м². Гарантия 3 года.', price: 38900, unit: 'шт.', category: 'Оборудование', available: true, lead: 'со склада' } },
        { key: 'k2', values: { name: 'Монтаж сплит-системы', descr: 'Стандартный монтаж: трасса до 3 м, кронштейны, пусконаладка.', price: 9500, unit: 'услуга', category: 'Монтаж', available: true, lead: 'в течение 3 дней' } },
        { key: 'k3', values: { name: 'Годовое обслуживание', descr: 'Два выезда в год: чистка, дозаправка, проверка электрики.', price: 12000, unit: 'услуга', category: 'Обслуживание', available: true, lead: 'по графику' } },
        { key: 'k4', values: { name: 'Работа мастера, час', descr: 'Диагностика и мелкий ремонт вне регламента.', price: 2200, unit: 'час', category: 'Обслуживание', available: true, lead: 'по записи' } },
        { key: 'k5', values: { name: 'Доставка по городу', descr: 'До подъезда, подъём на этаж оплачивается отдельно.', price: 900, unit: 'услуга', category: 'Доставка', available: true, lead: 'день в день' } },
        { key: 'k6', values: { name: 'Увлажнитель промышленный', descr: 'Для помещений до 200 м². Под заказ у поставщика.', price: 74500, unit: 'шт.', category: 'Оборудование', available: false, lead: '3–4 недели' } },
      ],
    },
  ],
}
