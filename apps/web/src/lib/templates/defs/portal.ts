import { inDays, type TemplateDef } from '../types'

/**
 * Единственный шаблон, который приносит готовую настройку доступа: форму
 * открывает гостю, кабинет — только вошедшему, строки сравнивает с его почтой.
 * Собрать это руками — четыре переключателя в трёх местах, и человек скорее
 * бросит, чем доберётся до конца.
 *
 * Кабинет построен вокруг заказов, а не обращений: клиент приходит посмотреть,
 * что с его заказом, и только потом — что-то спросить. Обращения оставлены
 * отдельной таблицей, это поддержка, а не суть кабинета.
 */
export const portal: TemplateDef = {
  id: 'portal',
  name: 'Клиентский портал',
  tagline: 'Клиент видит свои заказы, статус и документы — и не звонит спросить',
  audience: 'Все, кому клиенты пишут «а что с моим заказом?»',
  emoji: '🔐',
  kin: ['zayavki', 'crm'],
  gives: [
    'Витрина услуг с ценами — открыта всем по ссылке, без входа',
    'Кабинет клиента: его заказы, статусы, суммы и документы',
    'Вход по коду на почту — без регистрации и паролей',
    'Доступ настроен сразу: ничего включать не нужно',
  ],
  appTable: 'orders',
  appName: 'Кабинет клиента',
  portal: {
    table: 'orders',
    /*
     * Витрина показывает опубликованные услуги и только четыре колонки.
     * Себестоимость лежит в той же таблице — и остаётся внутри: по ней
     * видно, что «открыть экран» и «открыть данные» это разные решения.
     */
    showcase: {
      table: 'services',
      view: 'Опубликованные',
      publicFields: ['name', 'summary', 'price', 'term'],
      staffFields: ['cost'],
      listName: 'Услуги и цены',
      cardName: 'Услуга',
      tabLabel: 'Услуги',
      intro: 'Цены действуют для частных лиц. Чтобы заказать, оставьте заявку — ответим на указанную почту.',
    },
    emailField: 'email',
    clientFields: ['title', 'email', 'wish'],
    staffOnlyFields: ['note'],
    clientTitle: 'Мои заказы',
    guest: {
      screenName: 'Оставить заявку',
      intro: 'Заполните три поля — мы примем заявку и ответим на указанную почту. Регистрироваться не нужно.',
      submitLabel: 'Отправить заявку',
      successText: 'Заявка принята. Ответим на указанную почту — обычно в тот же день.',
      labels: {
        title: 'Что нужно сделать',
        email: 'Ваша почта',
        wish: 'Пожелания и подробности',
      },
    },
  },
  tables: [
    {
      key: 'services',
      name: 'Услуги',
      icon: 'tag',
      primary: 'name',
      fields: [
        {
          key: 'name',
          name: 'Услуга',
          type: 'text',
          help: 'Как услуга называется для клиента. Это первое, что он читает на витрине.',
        },
        {
          key: 'summary',
          name: 'Что входит',
          type: 'long_text',
          help: 'Одно-два предложения. Чем понятнее, тем меньше уточняющих звонков.',
        },
        {
          key: 'price',
          name: 'Цена',
          type: 'number',
          options: { format: 'currency', currency: 'RUB', precision: 0 },
          help: 'Цена для клиента. Видна на витрине без входа.',
        },
        {
          key: 'term',
          name: 'Срок',
          type: 'text',
          help: 'Сколько занимает: «1–2 дня», «до недели». Словами, а не числом.',
        },
        {
          key: 'cost',
          name: 'Себестоимость',
          type: 'number',
          options: { format: 'currency', currency: 'RUB', precision: 0 },
          help: 'Только для вас. На витрину не попадает: её нет в списке публичных колонок.',
        },
        {
          key: 'published',
          name: 'Опубликована',
          type: 'checkbox',
          help: 'Снимите отметку — услуга исчезнет с витрины, но останется у вас.',
        },
      ],
      views: [
        { name: 'Все услуги', type: 'grid' },
        { name: 'Опубликованные', type: 'grid', filter: { field: 'published', op: 'is', value: true } },
      ],
      rows: [
        { key: 's1', values: { name: 'Диагностика техники', summary: 'Осмотр, поиск причины и смета на ремонт. Если ремонтируете у нас — бесплатно.', price: 900, term: '1 день', cost: 350, published: true } },
        { key: 's2', values: { name: 'Чистка и замена термопасты', summary: 'Разбор, чистка системы охлаждения, замена пасты и профилактика.', price: 2400, term: '1–2 дня', cost: 700, published: true } },
        { key: 's3', values: { name: 'Восстановление данных с диска', summary: 'Снимаем образ и достаём файлы. Оплата только при успешном результате.', price: 6500, term: 'до недели', cost: 2100, published: true } },
        { key: 's4', values: { name: 'Обслуживание кондиционера', summary: 'Чистка фильтров и дренажа, проверка давления, дозаправка при необходимости.', price: 3200, term: '1 день', cost: 1200, published: true } },
        { key: 's5', values: { name: 'Выезд мастера за город', summary: 'Дорога до 50 км от города. Считается сверх стоимости работ.', price: 1500, term: 'по договорённости', cost: 800, published: true } },
        { key: 's6', values: { name: 'Пайка материнской платы', summary: 'Готовим к запуску: пока не берём, не хватает оборудования.', price: 4500, term: 'уточняется', cost: 1800, published: false } },
      ],
    },
    {
      key: 'orders',
      name: 'Заказы',
      icon: 'box',
      primary: 'title',
      fields: [
        {
          key: 'title',
          name: 'Заказ',
          type: 'text',
          help: 'Что заказали, одной строкой: «Ремонт ноутбука Lenovo», «Комплект фильтров». Это заголовок карточки — его клиент видит первым в своём кабинете.',
        },
        {
          key: 'email',
          name: 'Почта клиента',
          type: 'email',
          help: 'Главное поле кабинета. По нему клиент входит и видит свои заказы — и только их. Ваши сотрудники видят все заказы, правило на них не действует.',
        },
        {
          key: 'status',
          name: 'Статус',
          type: 'single_select',
          choices: [
            { name: 'Принят', color: 'blue' },
            { name: 'В работе', color: 'amber' },
            { name: 'Готов к выдаче', color: 'teal' },
            { name: 'Выдан', color: 'green' },
            { name: 'Отменён', color: 'gray' },
          ],
          help: 'Клиент видит статус у себя в кабинете. Это и есть ответ на вопрос «что с моим заказом», который перестанут задавать по телефону.',
        },
        {
          key: 'sum',
          name: 'Сумма',
          type: 'number',
          options: { format: 'currency', precision: 2, currency: 'RUB' },
          help: 'Сколько с клиента за этот заказ. Из этой колонки складывается сумма на главной: и у вас по всем заказам, и у клиента по своим.',
        },
        {
          key: 'paid',
          name: 'Оплачен',
          type: 'checkbox',
          help: 'Отметка, когда деньги пришли. Отберите «Оплачен — нет», чтобы увидеть должников; клиент в кабинете видит, что у него не оплачено.',
        },
        {
          key: 'created',
          name: 'Дата заказа',
          type: 'date',
          help: 'День, когда заказ приняли. По этой дате считается выручка за месяц и видно, что лежит дольше всех.',
        },
        {
          key: 'ready',
          name: 'Готов к',
          type: 'date',
          help: 'Дата, которую назвали клиенту. Он её видит — и не звонит уточнять.',
        },
        {
          key: 'wish',
          name: 'Пожелания клиента',
          type: 'long_text',
          help: 'То, что клиент написал сам при заказе. Заполняет он, а не вы.',
        },
        {
          key: 'docs',
          name: 'Документы',
          type: 'attachment',
          help: 'Счёт, чек, гарантийный талон. Клиент скачивает их сам из кабинета — не придётся пересылать по почте.',
        },
        {
          key: 'note',
          name: 'Заметки для своих',
          type: 'long_text',
          help: 'Служебное. Уберите это поле с карточки в конструкторе, если не хотите, чтобы клиент его видел.',
        },
      ],
      views: [
        { name: 'Все заказы', type: 'grid' },
        { name: 'Доска по статусам', type: 'kanban', stackBy: 'status' },
        { name: 'Не оплачены', type: 'grid', filter: { field: 'paid', op: 'is', value: false } },
      ],
      rows: [
        { key: 'o1', values: { title: 'Ремонт ноутбука Lenovo', email: 'petrov@example.ru', status: 'В работе', sum: 8400, paid: false, created: inDays(-3), ready: inDays(2), wish: 'Если можно, сохраните данные с диска.' } },
        { key: 'o2', values: { title: 'Комплект фильтров, 4 шт.', email: 'petrov@example.ru', status: 'Готов к выдаче', sum: 3560, paid: true, created: inDays(-8), ready: inDays(0), note: 'Забрать до конца недели, иначе на склад.' } },
        { key: 'o3', values: { title: 'Замена термостата', email: 'sidorova@example.ru', status: 'Выдан', sum: 6200, paid: true, created: inDays(-21), ready: inDays(-14) } },
        { key: 'o4', values: { title: 'Годовое обслуживание', email: 'ogonek@list.ru', status: 'Принят', sum: 12000, paid: false, created: inDays(-1), ready: inDays(9), wish: 'Выезд после 19:00, кухня работает.' } },
        { key: 'o5', values: { title: 'Чистка двух кондиционеров', email: 'sidorova@example.ru', status: 'В работе', sum: 7400, paid: false, created: inDays(-2), ready: inDays(1) } },
        { key: 'o6', values: { title: 'Увлажнитель промышленный', email: 'ogonek@list.ru', status: 'Отменён', sum: 74500, paid: false, created: inDays(-30), note: 'Клиент передумал, предоплату вернули.' } },
      ],
    },
    {
      key: 'tickets',
      name: 'Обращения',
      icon: 'inbox',
      primary: 'subject',
      fields: [
        { key: 'subject', name: 'Тема', type: 'text', help: 'Коротко, о чём вопрос. Это первое, что видит и клиент, и ваш сотрудник.' },
        { key: 'email', name: 'Почта клиента', type: 'email', help: 'Тот же адрес, что и в заказах: по нему клиент видит свои обращения.' },
        { key: 'text', name: 'Что случилось', type: 'long_text', help: 'Клиент описывает сам. Чем подробнее, тем меньше уточняющих звонков.' },
        {
          key: 'status',
          name: 'Статус',
          type: 'single_select',
          choices: [
            { name: 'Принято', color: 'blue' },
            { name: 'В работе', color: 'amber' },
            { name: 'Решено', color: 'green' },
          ],
          help: 'На каком этапе разбор. Клиент видит статус, но менять его не может.',
        },
        { key: 'answer', name: 'Ответ', type: 'long_text', help: 'Что вы сделали или что нужно от клиента. Показывается ему в кабинете.' },
        { key: 'created', name: 'Когда обратились', type: 'date', help: 'День обращения. По нему видно, что висит дольше остальных.' },
      ],
      views: [
        { name: 'Все обращения', type: 'grid' },
        { name: 'Нерешённые', type: 'grid', filter: { field: 'status', op: 'is_not', value: 'Решено' } },
      ],
      rows: [
        { key: 't1', values: { subject: 'Не приходит счёт на почту', email: 'petrov@example.ru', text: 'Оплатили в четверг, документов нет до сих пор.', status: 'В работе', answer: 'Проверяем у бухгалтерии, вернёмся сегодня.', created: inDays(-1) } },
        { key: 't2', values: { subject: 'Перенести выдачу', email: 'sidorova@example.ru', text: 'Записаны на четверг, не сможем. Можно во вторник?', status: 'Решено', answer: 'Перенесли на вторник, после 10:00.', created: inDays(-4) } },
        { key: 't3', values: { subject: 'Вопрос по гарантии', email: 'ogonek@list.ru', text: 'Сколько действует гарантия на термостат?', status: 'Решено', answer: 'Шесть месяцев с даты выдачи, чек в кабинете.', created: inDays(-12) } },
      ],
    },
  ],
}
