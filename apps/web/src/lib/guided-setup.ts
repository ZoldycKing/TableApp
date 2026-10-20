import { customerWorkflows, type App, type ModuleKind } from '@tableapp/schema'
import { appModules } from './app-modules'

export const SETUP_STEPS = [
  { id: 'business', name: 'Название', title: 'Как называется ваша компания?', description: 'Это название увидят пользователи приложения.' },
  { id: 'data', name: 'Ваши данные', title: 'Добавьте свои данные', description: 'Откройте таблицу и замените учебные примеры своими данными.' },
  { id: 'work', name: 'Команда', title: 'Кто будет работать в приложении?', description: 'Проверьте рабочие настройки и доступ сотрудников.' },
  { id: 'review', name: 'Проверка', title: 'Посмотрите, что получилось', description: 'Проверьте экраны пользователей, затем опубликуйте приложение.' },
] as const
export type SetupStep = typeof SETUP_STEPS[number]['id']
export type SetupTableTask = { id: string; stage: 'data' | 'work' | 'activity'; description: string }
type Scenario = {
  icon: string; dataName: string; dataTitle: string; dataDescription: string
  workName: string; workTitle: string; workDescription: string; firstTask: string
}
const SCENARIOS: Partial<Record<ModuleKind, Scenario>> = {
  booking: { icon: 'salon', dataName: 'Услуги', dataTitle: 'Какие услуги вы оказываете?', dataDescription: 'Добавьте услуги, цены и длительность. Из них клиент будет выбирать при записи.', workName: 'Мастера и график', workTitle: 'Кто и когда принимает клиентов?', workDescription: 'Добавьте мастера, выберите его услуги и рабочие часы.', firstTask: 'Откройте услугу и проверьте выбор мастера и свободного времени.' },
  sales: { icon: 'zakazy', dataName: 'Товары', dataTitle: 'Что вы продаёте?', dataDescription: 'Добавьте товары, цены и фотографии. Они появятся в каталоге приложения.', workName: 'Обработка заказов', workTitle: 'Кто будет обрабатывать заказы?', workDescription: 'Сотрудник видит назначенные ему заказы, администратор — все заказы и назначения.', firstTask: 'Выберите товар и проверьте корзину и оформление заказа.' },
  repair: { icon: 'service', dataName: 'Услуги', dataTitle: 'Что вы ремонтируете?', dataDescription: 'Добавьте услуги и их описание. Клиент сможет выбрать услугу и сообщить о неисправности.', workName: 'Приём и ремонт', workTitle: 'Кто принимает и ремонтирует?', workDescription: 'Администратор назначает мастера и предлагает стоимость. Мастер ведёт ремонт после согласия клиента.', firstTask: 'Откройте услугу и проверьте форму приёма устройства.' },
  field_service: { icon: 'zayavki', dataName: 'Услуги', dataTitle: 'С какими задачами к вам обращаются?', dataDescription: 'Добавьте услуги для выезда. При оформлении клиент укажет адрес и задачу.', workName: 'Назначение мастеров', workTitle: 'Кто принимает заявки и выезжает?', workDescription: 'Диспетчер назначает мастера. Мастер видит свои заявки и отмечает результат работы.', firstTask: 'Выберите услугу и проверьте заявку с адресом выезда.' },
  delivery: { icon: 'dostavka', dataName: 'Услуги доставки', dataTitle: 'Какие доставки вы выполняете?', dataDescription: 'Добавьте варианты доставки и описание условий для клиента.', workName: 'Диспетчер и курьеры', workTitle: 'Кто организует и выполняет доставку?', workDescription: 'Диспетчер согласует стоимость и время, назначает курьера. Курьер видит свои доставки и отмечает вручение.', firstTask: 'Откройте услугу доставки и проверьте адрес и пожелания ко времени.' },
  property: { icon: 'nedvizhimost', dataName: 'Объекты', dataTitle: 'Какие объекты вы предлагаете?', dataDescription: 'Добавьте фотографии, описание и цену. Внутренние контакты собственников остаются у команды.', workName: 'Агенты и просмотры', workTitle: 'Кто будет проводить просмотры?', workDescription: 'Администратор согласует время и назначает агента. Агент видит назначенные ему просмотры.', firstTask: 'Откройте объект и проверьте запрос на просмотр.' },
  crm: { icon: 'crm', dataName: 'Клиенты', dataTitle: 'С кем вы работаете?', dataDescription: 'Добавьте клиентов и контакты. Затем к ним можно будет привязывать сделки.', workName: 'Менеджеры и сделки', workTitle: 'Кто будет вести сделки?', workDescription: 'Менеджер работает со своими сделками. Руководитель видит все сделки и назначает ответственных.', firstTask: 'Проверьте карточку сделки: клиента, сумму, ответственного и дату следующего разговора.' },
  inventory: { icon: 'sklad', dataName: 'Товары и остатки', dataTitle: 'Что хранится на складе?', dataDescription: 'Добавьте товары и начальные остатки. Текущий остаток будет учитывать дальнейшие операции.', workName: 'Работа склада', workTitle: 'Как начать складской учёт?', workDescription: 'Укажите остатки на начало работы. Дальше принимайте и выдавайте товары через действия приложения.', firstTask: 'Проверьте карточку товара и действия приёмки и выдачи.' },
  production: { icon: 'proizvodstvo', dataName: 'Материалы и продукция', dataTitle: 'Что вы производите и из чего?', dataDescription: 'Добавьте продукцию и материалы. Для материалов укажите единицы измерения и начальные остатки.', workName: 'Нормы и команда', workTitle: 'Сколько материалов нужно на изделие?', workDescription: 'Укажите расход каждого материала на единицу продукции. При сохранении выпуска материалы спишутся по этим нормам.', firstTask: 'Проверьте форму выпуска: продукцию, количество и расход материалов.' },
}
export function setupStep(value: string | undefined): SetupStep {
  return SETUP_STEPS.find(step => step.id === value)?.id ?? 'business'
}
export function setupHref(appId: string | undefined, step: SetupStep, panel?: 'access') {
  const query = new URLSearchParams({ step })
  if (appId) query.set('app', appId)
  if (panel) query.set('panel', panel)
  return `/setup?${query}`
}
export function setupTableHref(tableId: string, appId: string | undefined, step: SetupStep, readOnly = false) {
  const query = new URLSearchParams({ mode: 'grid', setup: setupHref(appId, step) })
  if (readOnly) query.set('readonly', '1')
  return `/t/${encodeURIComponent(tableId)}?${query}`
}
export function setupHelpHref(article: string, appId: string | undefined, step: SetupStep) {
  const query = new URLSearchParams({ article, step })
  if (appId) query.set('app', appId)
  return `/help?${query}`
}

/** Resource bindings survive renamed tables and combined apps. This plan grants no permissions. */
export function guidedSetupPlan(app: App | null, relations: readonly { fieldId: string; targetId: string }[] = []) {
  const modules = app ? appModules(app).filter(module => module.kind !== 'support') : []
  const scenario = modules.length === 1 ? SCENARIOS[modules[0]!.kind] : undefined
  const tasks = new Map<string, SetupTableTask>()
  const add = (id: string, stage: SetupTableTask['stage'], description: string) => {
    const previous = tasks.get(id)
    const rank = { data: 0, work: 1, activity: 2 }
    if (!previous || rank[stage] < rank[previous.stage]) tasks.set(id, { id, stage, description })
  }
  if (app?.booking) {
    const t = app.booking.tables
    add(t.services, 'data', 'Название, цена, длительность и доступность для записи.')
    add(t.masters, 'work', 'Имена, почты и услуги мастеров. Здесь можно изменить существующего мастера.')
    add(t.schedule, 'work', 'Рабочие часы, перерывы и изменения графика на отдельные даты.')
    add(t.visits, 'activity', 'Здесь будут посещения клиентов и их статусы. Для старта заполнять не нужно.')
  }
  if (app?.production) {
    const t = app.production.tables
    add(t.materials, 'data', 'Материалы, единицы измерения и остатки на начало работы.')
    const products = relations.find(relation => relation.fieldId === app.production!.norm.product)?.targetId
    if (products) add(products, 'data', 'Названия готовой продукции. Для каждого изделия на следующем шаге задаются нормы расхода.')
    add(t.norms, 'work', 'Продукция, материал и его расход на одну единицу продукции.')
    add(t.production, 'activity', 'Выпуски сохраняются через форму приложения вместе со списаниями материалов.')
    add(t.movements, 'activity', 'Журнал прихода и расхода. Для изменения остатков используйте действия приложения.')
  }
  if (app?.inventory) {
    add(app.inventory.tables.items, 'data', 'Товары, артикулы и начальные остатки. Текущий остаток рассчитывается из операций.')
    add(app.inventory.tables.movements, 'activity', 'Приёмка, выдача, списания и возвраты. Проводите операции через приложение.')
  }
  for (const flow of app ? customerWorkflows(app) : []) {
    const kind = modules.find(module => module.source.type === 'customer' && module.source.tableId === flow.tableId)?.kind
    if (flow.catalog && kind !== 'crm') add(flow.catalog.tableId, 'data', kind === 'sales' ? 'Товары, фотографии, цены и доступность для заказа.' : kind === 'property' ? 'Фотографии, описание, цена и доступность объектов.' : 'Услуги, описание и условия обращения.')
    if (flow.crm) add(flow.crm.clientsTableId, 'data', 'Клиенты и контакты. Выбирайте клиента в сделке, чтобы не вводить контакты повторно.')
    add(flow.tableId, 'activity', kind === 'crm' ? 'Здесь ведут сделки, этапы и следующие контакты. Можно начать с пустой таблицы.' : 'Здесь появятся обращения клиентов. Для запуска заполнять их заранее не нужно.')
    if (flow.cart) add(flow.cart.itemsTableId, 'activity', 'Состав заказа создаётся при оформлении. Позиции связаны с конкретным заказом.')
  }
  const steps = SETUP_STEPS.map(step => ({ ...step, name: String(step.name), title: String(step.title), description: String(step.description) }))
  if (scenario) {
    Object.assign(steps[1]!, { name: scenario.dataName, title: scenario.dataTitle, description: scenario.dataDescription })
    Object.assign(steps[2]!, { name: scenario.workName, title: scenario.workTitle, description: scenario.workDescription })
  }
  return { steps, tasks: [...tasks.values()], icon: scenario?.icon, public: app?.screens.some(screen => screen.access.public) ?? false,
    firstTask: scenario?.firstTask ?? 'Проверьте основные действия и данные от имени каждой рабочей роли.', workHelp: app?.booking ? 'schedule' : 'access' }
}
export function tablePurpose(app: App | null, tableId: string) {
  return guidedSetupPlan(app).tasks.find(task => task.id === tableId)?.description ?? 'Данные приложения. Можно заполнить сейчас или вернуться к ним позже.'
}
