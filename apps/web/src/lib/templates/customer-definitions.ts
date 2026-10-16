import { inDays, type TemplateCustomer, type TemplateDef, type TemplateField, type TemplateTable } from './types'

const email: TemplateField = { key: 'customerEmail', name: 'Почта клиента', type: 'email', help: 'При онлайн-оформлении сервер берёт подтверждённую почту. Только её владелец видит запись в кабинете.' }
const assignment: TemplateField = { key: 'assignedEmail', name: 'Почта исполнителя', type: 'email', help: 'Пригласите сотрудника с этой почтой в приложение. Он увидит только назначенные ему записи.' }
const contact: TemplateField[] = [
  { key: 'requestName', name: 'Имя клиента', type: 'text', help: 'Как к вам обращаться. Видно ответственному за ваше обращение.' },
  { key: 'requestPhone', name: 'Телефон клиента', type: 'phone', help: 'Номер для согласования условий. Другим клиентам не показывается.' },
]
const summary: TemplateField = { key: 'clientSummary', name: 'Ответ клиенту', type: 'long_text', help: 'Этот ответ виден клиенту. Внутренние заметки храните отдельно.' }

function serviceCatalog(title: string): TemplateTable {
  return { key: 'customerServices', name: title, icon: 'tag', primary: 'name', fields: [
    { key: 'name', name: 'Услуга', type: 'text' }, { key: 'description', name: 'Описание', type: 'long_text' },
    { key: 'active', name: 'Опубликована', type: 'checkbox', help: 'Снимите отметку, чтобы закрыть новые заявки на эту услугу.' },
  ], views: [{ name: 'Опубликованные', type: 'grid', filter: { field: 'active', op: 'is', value: true } }], rows: [
    { key: 'standard', values: { name: title === 'Услуги доставки' ? 'Доставка по городу' : title === 'Услуги сервиса' ? 'Диагностика и ремонт' : 'Консультация и заявка', description: 'Опишите задачу. Ответственный свяжется с вами и согласует условия. Онлайн-оплаты нет.', active: true } },
  ] }
}

/** The ready client scenario extends the working tables; it never exposes their private fields. */
export function withCustomerScenario(original: TemplateDef): TemplateDef {
  if (['salon', 'sklad', 'proizvodstvo'].includes(original.id)) return original
  const template = structuredClone(original)
  let main = template.tables.find(table => table.key === template.appTable)!
  const common = { email: 'customerEmail', assignment: 'assignedEmail', workerName: 'Исполнитель', managerName: 'Администратор',
    requiredFields: ['requestName', 'requestPhone'], workerFields: ['status', 'clientSummary'], approval: undefined }
  let scenario: TemplateCustomer
  const catalog = (title: string) => {
    const table = serviceCatalog(title)
    template.tables.push(table)
    main.fields.push({ key: 'selectedService', name: 'Выбранная услуга', type: 'relation', relationTable: table.key, allowMultiple: false })
    return { table: table.key, view: 'Опубликованные', fields: ['name', 'description'], active: 'active', selection: 'selectedService', title: 'Услуги' }
  }
  switch (template.id) {
    case 'zakazy':
    case 'katalog': {
      if (template.id === 'zakazy') {
        const goods = structuredClone(template.tables.find(table => table.key === 'items')!)
        goods.key = 'goods'; goods.name = 'Каталог товаров'; goods.primary = 'name'
        goods.fields = goods.fields.filter(field => ['name', 'price'].includes(field.key))
        goods.fields.push({ key: 'descr', name: 'Описание', type: 'long_text' }, { key: 'available', name: 'Доступен для заказа', type: 'checkbox' })
        goods.views = [{ name: 'Доступные', type: 'grid', filter: { field: 'available', op: 'is', value: true } }]
        goods.rows = goods.rows.map(row => ({ ...row, values: { name: row.values.name!, price: row.values.price!, descr: 'Уточним срок и способ получения после оформления заказа.', available: true } }))
        template.tables.push(goods)
      } else {
        template.tables.push({ key: 'items', name: 'Позиции заказов', icon: 'list', primary: 'name', fields: [
          { key: 'name', name: 'Позиция', type: 'text' }, { key: 'qty', name: 'Количество', type: 'number' }, { key: 'price', name: 'Цена', type: 'number', options: { format: 'currency', currency: 'RUB', precision: 2 } },
          { key: 'cost', name: 'Стоимость', type: 'formula', expression: '{Количество} * {Цена}' },
        ], views: [{ name: 'Все позиции', type: 'grid' }], rows: [] })
        template.tables.push({ key: 'orders', name: 'Заказы', icon: 'box', primary: 'title', fields: [
          { key: 'title', name: 'Заказ', type: 'text' }, { key: 'positions', name: 'Позиции', type: 'relation', relationTable: 'items', allowMultiple: true },
          { key: 'total', name: 'Итого', type: 'rollup', through: 'positions', target: 'cost', fn: 'sum' },
          { key: 'status', name: 'Статус', type: 'single_select', choices: [{ name: 'Новый', color: 'blue' }, { name: 'Собирается', color: 'amber' }, { name: 'Отгружен', color: 'violet' }, { name: 'Доставлен', color: 'green' }, { name: 'Возвращён', color: 'orange' }, { name: 'Отменён', color: 'gray' }] },
          { key: 'address', name: 'Адрес получения', type: 'text' }, { key: 'note', name: 'Комментарий', type: 'long_text' },
        ], views: [{ name: 'Все заказы', type: 'grid' }], rows: [] })
        template.appTable = 'orders'; template.appName = 'Заказы и каталог'; main = template.tables.find(table => table.key === 'orders')!
      }
      const items = template.tables.find(table => table.key === 'items')!
      items.fields.push({ key: 'product', name: 'Товар каталога', type: 'relation', relationTable: 'goods', allowMultiple: false, help: 'Постоянная ссылка на товар. При оформлении заполняется сервером; название и цена заказа сохраняются отдельно.' })
      items.fields.push(structuredClone(email))
      items.fields.push(structuredClone(assignment))
      main.fields.push({ key: 'cart', name: 'Состав нового заказа', type: 'long_text', help: 'Заполняется корзиной. Цена берётся сервером из каталога, позиции создаются отдельно для каждого заказа.' })
      scenario = { ...common, table: 'orders', title: 'Мои заказы', submitLabel: 'Оформить заказ', intro: 'Проверьте состав и контакты. Мы свяжемся с вами для подтверждения и согласуем получение. Онлайн-оплаты нет.',
        formFields: ['requestName', 'requestPhone', 'address', 'note', 'cart'], customerFields: ['status', 'positions', 'total', 'date', 'address', 'note', 'clientSummary'], workerFields: ['status', 'date', 'clientSummary'],
        status: 'status', initial: 'Новый', terminal: ['Доставлен', 'Возвращён', 'Отменён'], cancel: 'Отменён', cancellable: ['Новый', 'Собирается'],
        catalog: { table: 'goods', view: template.id === 'zakazy' ? 'Доступные' : 'В наличии', fields: template.id === 'zakazy' ? ['name', 'descr', 'price'] : ['name', 'photo', 'descr', 'price', 'unit', 'category', 'lead'], active: 'available', selection: null, title: 'Каталог' },
        cart: { field: 'cart', price: 'price', items: 'items', name: 'name', qty: 'qty', itemPrice: 'price', itemEmail: 'customerEmail', positions: 'positions' } }
      break
    }
    case 'dostavka':
      scenario = { ...common, table: 'deliveries', title: 'Мои доставки', submitLabel: 'Заказать доставку', intro: 'Укажите адрес, содержимое и желаемое время. Диспетчер согласует стоимость и интервал; после этого доставка появится у назначенного курьера.',
        formFields: ['selectedService', 'requestName', 'requestPhone', 'address', 'what', 'window', 'note'], customerFields: ['what', 'status', 'date', 'window', 'price', 'address', 'note', 'clientSummary'], workerFields: ['status', 'photo', 'clientSummary'], workerReadFields: ['pay', 'photo'], workerName: 'Курьер', managerName: 'Диспетчер',
        status: 'status', initial: 'Принята', terminal: ['Доставлена', 'Возврат', 'Отменена'], cancel: 'Отменена', cancellable: ['Принята'], catalog: catalog('Услуги доставки') }
      break
    case 'service':
      main.fields.push({ key: 'approvedPrice', name: 'Согласованная стоимость', type: 'number', options: { format: 'currency', currency: 'RUB', precision: 2 }, help: 'Фиксируется сервером при согласии клиента. Изменение сметы требует нового согласования.' })
      scenario = { ...common, table: 'repairs', title: 'Мои ремонты', submitLabel: 'Отправить заявку на ремонт', intro: 'Укажите устройство и неисправность. После приёмки и диагностики мастер предложит стоимость; вы сможете согласовать её в кабинете.',
        formFields: ['selectedService', 'requestName', 'requestPhone', 'device', 'problem'], requiredFields: ['requestName', 'requestPhone', 'device', 'problem'], customerFields: ['ticket', 'status', 'problem', 'ready', 'price', 'approvedPrice', 'note', 'clientSummary'], workerFields: ['status', 'price', 'ready', 'note', 'clientSummary'], workerName: 'Мастер',
        status: 'status', initial: 'Принято', terminal: ['Выполнено', 'Отменён', 'Отказ от ремонта'], cancel: 'Отменён', cancellable: ['Принято'], catalog: catalog('Услуги сервиса'),
        approval: { price: 'price', agreed: 'approvedPrice', waiting: 'Ждём согласования', approved: 'В ремонте', declined: 'Отказ от ремонта', consentRequired: ['В ремонте', 'Готово', 'Выполнено'] } }
      break
    case 'nedvizhimost': {
      const objects = main
      objects.fields.push({ key: 'published', name: 'Опубликован', type: 'checkbox' })
      objects.views.push({ name: 'Опубликованные', type: 'grid', filter: { field: 'published', op: 'is', value: true } })
      objects.rows = objects.rows.map(row => ({ ...row, values: { ...row.values, published: ['Свободен', 'Показы'].includes(String(row.values.status)) } }))
      template.tables.push({ key: 'viewings', name: 'Заявки на просмотр', icon: 'calendar', primary: 'title', fields: [
        { key: 'title', name: 'Просмотр', type: 'text' }, { key: 'object', name: 'Объект', type: 'relation', relationTable: 'objects', allowMultiple: false },
        { key: 'preferred', name: 'Пожелания ко времени', type: 'text', help: 'Это пожелание, а не подтверждённая бронь. Агент согласует точное время.' },
        { key: 'scheduled', name: 'Подтверждённое время', type: 'datetime', options: { timeZone: 'Europe/Moscow' } },
        { key: 'status', name: 'Статус', type: 'single_select', choices: [{ name: 'Новая', color: 'blue' }, { name: 'Согласовываем', color: 'amber' }, { name: 'Просмотр назначен', color: 'violet' }, { name: 'Просмотр проведён', color: 'green' }, { name: 'Отменён', color: 'gray' }] },
      ], views: [{ name: 'Все просмотры', type: 'grid' }], rows: [] })
      template.appTable = 'viewings'; template.appName = 'Объекты и просмотры'; main = template.tables.find(table => table.key === 'viewings')!
      scenario = { ...common, table: 'viewings', title: 'Мои просмотры', submitLabel: 'Запросить просмотр', intro: 'Укажите контакты и удобное время. Агент свяжется с вами; точное время появится в кабинете после согласования.',
        formFields: ['object', 'requestName', 'requestPhone', 'preferred'], customerFields: ['object', 'status', 'preferred', 'scheduled', 'clientSummary'], workerFields: ['status', 'scheduled', 'clientSummary'], workerName: 'Агент',
        status: 'status', initial: 'Новая', terminal: ['Просмотр проведён', 'Отменён'], cancel: 'Отменён', cancellable: ['Новая', 'Согласовываем', 'Просмотр назначен'],
        catalog: { table: 'objects', view: 'Опубликованные', fields: ['address', 'descr', 'photo', 'kind', 'rooms', 'area', 'price'], active: 'published', selection: 'object', title: 'Объекты' } }
      break
    }
    case 'zayavki':
      scenario = { ...common, table: template.appTable, title: 'Мои заявки', submitLabel: 'Отправить заявку', intro: 'Опишите работы и адрес. Диспетчер назначит мастера и согласует дату; результат появится в вашем кабинете.',
        formFields: ['selectedService', 'requestName', 'requestPhone', 'what', 'requestAddress', 'comment'], customerFields: ['status', 'date', 'price', 'requestAddress', 'clientSummary'], workerFields: ['status', 'photo', 'comment', 'clientSummary'], workerName: 'Мастер', managerName: 'Диспетчер',
        status: 'status', initial: 'Новая', terminal: ['Готово', 'Отменена'], cancel: 'Отменена', cancellable: ['Новая'], assignment: 'masterEmail', catalog: catalog('Услуги и выезды') }
      main.fields.push({ key: 'requestAddress', name: 'Адрес клиента', type: 'text' })
      break
    case 'crm':
      scenario = { ...common, table: 'deals', title: 'Мои обращения', submitLabel: 'Оставить обращение', intro: 'Опишите, что вас интересует. Менеджер свяжется с вами и сообщит результат в кабинете. Внутренние переговоры и сведения о других клиентах сюда не попадают.',
        formFields: ['selectedService', 'requestName', 'requestPhone', 'what'], customerFields: ['stage', 'due', 'clientSummary'], workerFields: ['stage', 'due', 'sum', 'note', 'clientSummary'], workerName: 'Менеджер', managerName: 'Руководитель',
        status: 'stage', initial: 'Новая', terminal: ['Оплачено', 'Отказ', 'Отменено'], cancel: 'Отменено', cancellable: ['Новая'], catalog: catalog('Обращения в отдел продаж') }
      break
    case 'portal':
      scenario = { ...common, table: 'orders', title: 'Мои заказы', submitLabel: 'Отправить заявку', intro: 'Опишите задачу. Мы свяжемся с вами для согласования условий; заявка и её статус появятся в кабинете.',
        formFields: ['selectedService', 'requestName', 'requestPhone', 'title', 'wish'], customerFields: ['status', 'sum', 'ready', 'paid', 'docs', 'wish', 'clientSummary'], workerFields: ['status', 'sum', 'ready', 'clientSummary'],
        status: 'status', initial: 'Принят', terminal: ['Выдан', 'Отменён'], cancel: 'Отменён', cancellable: ['Принят'], email: 'email',
        catalog: { table: 'services', view: 'Опубликованные', fields: ['name', 'summary', 'price', 'term'], active: 'published', selection: 'selectedService', title: 'Услуги' } }
      main.fields.push({ key: 'selectedService', name: 'Выбранная услуга', type: 'relation', relationTable: 'services', allowMultiple: false })
      break
    default: return original
  }
  if (!main.fields.some(field => field.key === scenario.email)) main.fields.push({ ...email, key: scenario.email })
  if (scenario.assignment && !main.fields.some(field => field.key === scenario.assignment)) {
    // The dispatch template already has an email field with this semantic name.
    const existing = main.fields.find(field => field.type === 'email' && field.name === 'Почта мастера')
    if (existing && template.id === 'zayavki') scenario.assignment = existing.key
    else main.fields.push({ ...assignment, key: scenario.assignment })
  }
  if (template.id === 'dostavka') {
    const recipient = (key: string) => key === 'requestName' ? 'receiver' : key === 'requestPhone' ? 'phone' : key
    scenario.formFields = scenario.formFields.map(recipient)
    scenario.requiredFields = scenario.requiredFields.map(recipient)
  }
  main.fields.push(...(template.id === 'dostavka' ? [] : structuredClone(contact)), structuredClone(summary))
  main.fields.push({ key: 'requestDate', name: 'Создано', type: 'datetime', options: { timeZone: 'Europe/Moscow' }, help: 'Дата оформления. При онлайн-заявке фиксируется сервером и видна в истории клиента.' },
    { key: 'submissionId', name: 'Ключ оформления', type: 'text', help: 'Служебный ключ, защищающий оформление от повторной отправки. Клиенту не показывается.' })
  scenario.formFields.push('submissionId'); scenario.customerFields.push('requestDate')
  const status = main.fields.find(field => field.key === scenario.status)!
  if ('choices' in status && status.choices) for (const name of [...scenario.terminal, ...(scenario.approval ? [scenario.approval.waiting] : [])]) {
    if (!status.choices.some(choice => choice.name === name)) status.choices.push({ name, color: name.includes('От') ? 'gray' : 'amber' })
  }
  // Demonstrate one fictional customer's active and historical records; others stay isolated.
  main.rows = main.rows.map((row, index) => ({ ...row, values: { ...row.values,
    [scenario.email]: index < 2 ? 'irina@example.com' : `other${index}@example.invalid`, requestName: index < 2 ? 'Ирина' : 'Другой клиент', requestPhone: '+7 900 000-00-00',
    requestDate: inDays(-index * 3),
    ...(index === 1 ? { [scenario.status]: scenario.terminal[0]! } : {}),
    ...(scenario.assignment ? { [scenario.assignment]: 'worker@example.invalid' } : {}),
  } }))
  if (!main.rows.length) main.rows = [
    { key: 'request-active', values: { title: 'Заявка Ирины', [scenario.email]: 'irina@example.com', requestName: 'Ирина', requestPhone: '+7 900 000-00-00', [scenario.status]: scenario.initial, ...(template.id === 'nedvizhimost' ? { object: { rowKey: 'n2' }, preferred: 'Завтра после 18:00' } : {}), clientSummary: 'Заявка получена. Ответственный свяжется с вами.', ...(scenario.assignment ? { [scenario.assignment]: 'worker@example.invalid' } : {}) } },
    { key: 'request-history', values: { title: 'Предыдущая заявка', [scenario.email]: 'irina@example.com', requestName: 'Ирина', requestPhone: '+7 900 000-00-00', [scenario.status]: scenario.terminal[0]!, ...(template.id === 'nedvizhimost' ? { object: { rowKey: 'n4' }, scheduled: inDays(-3) } : {}), clientSummary: 'Завершено.', ...(scenario.assignment ? { [scenario.assignment]: 'worker@example.invalid' } : {}) } },
  ]
  main.rows = main.rows.map((row, index) => ({ ...row, values: { ...row.values, requestDate: row.values.requestDate ?? inDays(-index * 3) } }))
  if (scenario.cart) {
    const items = template.tables.find(table => table.key === scenario.cart!.items)!
    const previous = new Map(items.rows.map(row => [row.key, row]))
    const samples: TemplateTable['rows'] = []
    main.rows = main.rows.map((order, index) => {
      const positions = order.values[scenario.cart!.positions]
      const keys = typeof positions === 'object' && positions && 'rowKeys' in positions ? positions.rowKeys : []
      const rowKeys = keys.map((key, itemIndex) => {
        const source = previous.get(key)!
        const itemKey = `${order.key}-${itemIndex}`
        samples.push({ key: itemKey, values: { ...source.values, [scenario.cart!.itemEmail]: order.values[scenario.email]!, assignedEmail: order.values[scenario.assignment!] ?? '' } })
        return itemKey
      })
      if (!rowKeys.length && template.id === 'katalog') {
        const goods = template.tables.find(table => table.key === 'goods')!.rows[index]!
        const itemKey = `${order.key}-0`
        samples.push({ key: itemKey, values: { name: goods.values.name!, qty: 1, price: goods.values.price!, customerEmail: order.values[scenario.email]!, assignedEmail: order.values[scenario.assignment!] ?? '' } })
        rowKeys.push(itemKey)
      }
      return { ...order, values: { ...order.values, [scenario.cart!.positions]: { rowKeys } } }
    })
    items.rows = samples
  }
  if (scenario.approval) {
    const approval = scenario.approval
    main.rows = main.rows.map((row, index) => ({ ...row, values: { ...row.values,
      ...(index === 0 ? { [scenario.status]: approval.waiting } : {}),
      ...(index !== 0 && approval.consentRequired?.includes(String(row.values[scenario.status])) ? { [approval.agreed]: row.values[approval.price] ?? 0 } : {}),
    } }))
  }
  template.customer = scenario
  if (template.id === 'portal') {
    const tickets = template.tables.find(table => table.key === 'tickets')!
    tickets.fields.push(structuredClone(assignment),
      { key: 'order', name: 'Заказ', type: 'relation', relationTable: 'orders', allowMultiple: false, help: 'Обращение относится к вашему заказу. Клиент может выбрать только собственный заказ.' },
      { key: 'requestDate', name: 'Создано', type: 'datetime', options: { timeZone: 'Europe/Moscow' }, help: 'Время отправки обращения фиксируется сервером.' },
      { key: 'submissionId', name: 'Ключ оформления', type: 'text', help: 'Служебный ключ защищает от повторной отправки.' })
    tickets.fields.find(field => field.key === 'status')!.choices!.push({ name: 'Отменено', color: 'gray' })
    const helps: Record<string, string> = { subject: 'Тема вопроса по заказу.', email: 'Подтверждённая почта владельца обращения.', text: 'Что нужно уточнить. Видно ответственному сотруднику.', answer: 'Ответ сотрудника, который клиент видит в кабинете.' }
    for (const field of tickets.fields) if (helps[field.key]) field.help = helps[field.key]
    tickets.rows = tickets.rows.map((row, index) => ({ ...row, values: { ...row.values, email: index < 2 ? 'irina@example.com' : 'other@example.invalid',
      order: { rowKey: main.rows[index < 2 ? index : 2]!.key }, assignedEmail: 'worker@example.invalid', requestDate: inDays(-index * 3) } }))
    template.customerSections = [{ ...common, table: 'tickets', title: 'Мои обращения', submitLabel: 'Отправить обращение', intro: 'Выберите свой заказ, укажите тему и вопрос. Ответ и статус обращения появятся здесь, в кабинете.',
      formFields: ['order', 'subject', 'text', 'submissionId'], requiredFields: ['order', 'subject', 'text'], customerFields: ['order', 'status', 'text', 'answer', 'requestDate'], workerFields: ['status', 'answer'],
      email: 'email', status: 'status', initial: 'Принято', terminal: ['Решено', 'Отменено'], cancel: 'Отменено', cancellable: ['Принято'], catalog: null,
      parent: { table: 'orders', relation: 'order', email: 'email' } }]
    template.gives.push('Обращение из своего заказа: вопрос, ответ сотрудника и история в кабинете')
  }
  if (template.id === 'dostavka') scenario.requiredFields.push('address', 'what')
  if (template.id === 'zayavki') scenario.requiredFields.push('what', 'requestAddress')
  if (template.id === 'crm') scenario.requiredFields.push('what')
  if (template.id === 'portal') scenario.requiredFields.push('title')
  if (scenario.catalog?.selection) scenario.requiredFields.push(scenario.catalog.selection)
  const help: Record<string, string> = {
    name: 'Название, которое клиент видит в каталоге и составе заказа.', description: 'Что входит и как выполняется услуга. Видно до входа.', active: 'Опубликуйте услугу, чтобы принимать новые обращения.',
    descr: 'Описание товара и условия получения. Видно в карточке каталога.', available: 'Снимите отметку, чтобы закрыть новые заказы на эту позицию.',
    title: 'Название обращения в рабочем списке и кабинете клиента.', positions: 'Состав заказа. Корзина создаёт отдельные позиции с сохранённой ценой для каждого заказа.',
    total: 'Сумма сохранённых стоимостей позиций. Изменение каталога не меняет оформленный заказ.', qty: 'Количество заказанных единиц. Указывается в корзине.', price: 'Цена одной единицы, сохранённая при оформлении заказа.',
    cost: 'Количество, умноженное на сохранённую цену за единицу.', address: 'Адрес получения. Если выбран самовывоз, укажите это словами.', note: 'Пожелания клиента к оформлению и получению.',
    status: 'Текущий этап обращения. Завершённые и отменённые обращения видны клиенту в истории.', published: 'Публикуйте только объекты, для которых сейчас принимаете запросы на просмотр.',
    object: 'Выбранный клиентом объект. Контакты собственника не показываются клиенту.', scheduled: 'Точное время после согласования с клиентом. Просмотр занимает час; пересечения у одного агента запрещены сервером.',
    requestAddress: 'Адрес, который клиент указал при онлайн-заявке. Используйте для выезда, если клиент ещё не связан со справочником.',
  }
  for (const table of template.tables) for (const field of table.fields) if (!field.help) field.help = help[field.key] ?? 'Данные обращения; заполните при согласовании с клиентом.'
  template.gives.push('Клиент оформляет из карточки и видит только свои записи, статусы и историю в личном кабинете')
  if (template.id === 'service') {
    template.limits = template.limits?.map(limit => limit.startsWith('Сообщений о готовности') ? 'Автоматических сообщений о готовности нет: клиент проверяет статус в кабинете' : limit)
    template.gives.push('Согласование стоимости ремонта в кабинете: новая смета требует нового согласия')
    main.fields.find(field => field.key === 'master')!.help = 'Имя мастера для внутреннего учёта. Рабочий доступ определяется полем «Почта исполнителя».'
  }
  if (template.id === 'katalog') template.gives = ['Открытый каталог с ценами и описанием товаров', 'Корзина из карточек товаров: количество и сумма перед оформлением', 'Заказы с отдельным составом и сохранённой ценой, статусы и история клиента', 'Сотрудник видит назначенные заказы; администратор управляет всеми']
  if (template.id === 'nedvizhimost') template.gives = ['Открытые карточки опубликованных объектов: фото, площадь и цена', 'Запрос просмотра из карточки; агент согласует и назначает время', 'Кабинет клиента: собственные просмотры, отмена и история', 'Внутренние контакты собственников видит только команда']
  if (template.id === 'portal') {
    main.fields.find(field => field.key === 'email')!.help = 'Подтверждённая почта владельца заказа. Клиент видит только свои заказы; сотрудник — назначенные ему.'
    main.fields.find(field => field.key === 'sum')!.help = 'Согласованная стоимость заказа. Видна клиенту в карточке.'
  }
  return template
}
