const templateKinds = { zakazy: 'orders', salon: 'booking', service: 'service', zayavki: 'requests', nedvizhimost: 'property', dostavka: 'delivery', crm: 'crm', sklad: 'stock', proizvodstvo: 'production' };
const solutionKinds = { 'client-portal': 'client', 'order-management': 'requests', production: 'production', 'employee-app': 'requests', warehouse: 'stock', catalog: 'orders' };
const solutionIcons = { 'client-portal': 'users', 'order-management': 'orders', production: 'factory', 'employee-app': 'table', warehouse: 'box', catalog: 'orders' };
const navItems = [['/solutions', 'Решения'], ['/templates', 'Шаблоны'], ['/features', 'Возможности'], ['/pricing', 'Тарифы']];

const esc = (ctx, value) => ctx.esc(String(value ?? ''));
const icon = (ctx, name) => ctx.ui.icon(name);
const link = (ctx, path, text, className = 'text-link') => `<a class="${className}" href="${esc(ctx, ctx.h(path))}">${esc(ctx, text)} ${icon(ctx, 'arrow')}</a>`;
const primary = (ctx, text = 'Начать бесплатно', id) => `<a class="button button--primary" href="${esc(ctx, ctx.start(id))}">${esc(ctx, text)} ${icon(ctx, 'arrow')}</a>`;
const eyebrow = (text) => `<p class="eyebrow">${text}</p>`;
const checkList = (ctx, items, className = '') => `<ul class="p-checks ${className}">${items.map(item => `<li>${icon(ctx, 'check')}<span>${esc(ctx, item)}</span></li>`).join('')}</ul>`;
const tCopy = (ctx, id) => ctx.content?.templates?.[id] ?? {};
const sCopy = (ctx, slug) => ctx.content?.solutions?.[slug] ?? {};
const templateBy = (ctx, id) => ctx.data.templates.find(item => item.id === id);
const solutionBy = (ctx, slug) => ctx.data.solutions.find(item => item.slug === slug);

function preview(ctx, kind = 'orders', interactive = false, caption = '') {
  return `<figure class="p-preview"><div class="p-preview-label"><span aria-hidden="true"></span><span>${esc(ctx, caption || 'Рабочий экран в TableApp')}</span></div>${ctx.ui.demo(ctx, kind, interactive)}</figure>`;
}

function pageIntro(ctx, overline, title, description, extra = '') {
  return `<header class="p-page-intro container">${eyebrow(overline)}<h1>${title}</h1><p class="lead">${esc(ctx, description)}</p>${extra}</header>`;
}

function finalCta(ctx, title = 'Посмотрите на свою работу по-новому.', text = 'Выберите готовый шаблон, замените данные и проверьте приложение на бесплатном тарифе.') {
  return `<section class="p-final container" data-reveal>${ctx.ui.cta(ctx, title, text)}</section>`;
}


function limits(ctx, items, title = 'Что учесть перед запуском') {
  return `<section class="p-limits container" data-reveal><div>${eyebrow('По делу')}<h2>${esc(ctx, title)}</h2></div><ul>${items.map(item => `<li>${esc(ctx, item)}</li>`).join('')}</ul></section>`;
}

function startPaths(ctx, compact = false) {
  return `<div class="p-start-paths ${compact ? 'p-start-paths--compact' : ''}"><article><span class="p-path-icon">${icon(ctx, 'table')}</span><div><h3>С готового шаблона</h3><p>Выберите близкую задачу. Внутри уже есть связанные данные, рабочие экраны и подходящие роли.</p>${link(ctx, '/templates', 'Выбрать шаблон')}</div></article><article><span class="p-path-icon">${icon(ctx, 'upload')}</span><div><h3>Со своей таблицы</h3><p>Загрузите Excel или CSV, проверьте данные и соберите приложение. Экраны и правила доступа настраиваете вы.</p><a class="text-link" href="${esc(ctx, ctx.start())}">Начать со своего файла ${icon(ctx, 'arrow')}</a></div></article></div>`;
}

function templateFeature(ctx, item, label = 'Подходящий шаблон') {
  const copy = tCopy(ctx, item.id);
  return `<article class="p-template-feature"><div>${eyebrow(label)}<h2>${esc(ctx, item.name)}</h2><p>${esc(ctx, copy.description ?? item.tagline)}</p>${link(ctx, `/templates/${item.id}`, `Открыть шаблон «${item.name}»`)}</div><div class="p-template-feature-actions">${primary(ctx, 'Начать с шаблона', item.id)}<p>После входа выбранный шаблон будет сохранён для начала работы.</p></div></article>`;
}

export function renderHeader(ctx) {
  const current = ctx.page.path.replace(/\/$/, '') || '/';
  return `<header class="p-header"><div class="p-header-inner container">${ctx.ui.brand(ctx)}<button class="menu-toggle p-menu-toggle" data-menu-toggle aria-expanded="false" aria-controls="site-menu" aria-label="Открыть меню">${icon(ctx, 'menu')}</button><nav id="site-menu" class="site-menu p-nav" aria-label="Разделы сайта"><div class="p-nav-primary">${navItems.map(([path, name]) => `<a href="${esc(ctx, ctx.h(path))}"${current === path || current.startsWith(`${path}/`) ? ' aria-current="page"' : ''}>${name}</a>`).join('')}</div><div class="p-nav-account">${link(ctx, '/demo', 'Демо', 'p-demo-link')}<a class="p-login" href="${esc(ctx, ctx.start())}">Войти ${icon(ctx, 'arrow')}</a></div></nav></div></header>`;
}

function roleStory(ctx) {
  const roles = [
    { name: 'Владелец', title: 'Вся картина', text: 'Таблицы, статусы, связи и доступ команды. Можно проверить данные и настроить приложение.', kind: 'orders', caption: 'Владелец · вся работа перед глазами' },
    { name: 'Сотрудник', title: 'Рабочие действия', text: 'Доступные записи, карточки и формы на телефоне. Какие строки и поля видны — определяют правила доступа.', kind: 'requests', caption: 'Сотрудник · назначенная задача и результат' },
    { name: 'Клиент', title: 'Своё обращение', text: 'Свои заказы, записи или ремонты после входа по коду на почту. Набор действий зависит от шаблона.', kind: 'client', caption: 'Клиент · свой заказ и текущий статус' }
  ];
  return `<section class="p-roles section scroll-story" data-reveal><div class="container"><div class="p-section-top"><div>${eyebrow('Одна работа. Разные экраны.')}<h2>Каждому — то, <br> что нужно для дела.</h2></div><p>Владелец ведёт данные в рабочем пространстве. Сотрудник работает со своими задачами. Клиент открывает свои обращения.</p></div><div class="p-role-story"><div class="story-stage">${roles.map((role, index) => `<div class="story-visual" data-story-scene="${index}">${preview(ctx, role.kind, false, role.caption)}</div>`).join('')}</div><div class="p-role-grid">${roles.map((role, index) => `<article class="story-beat" data-beat="${index}"><span class="p-role-index">0${index + 1} / ${role.name}</span><h3>${role.title}</h3><p>${role.text}</p></article>`).join('')}</div></div><div class="p-process-line"><span>Клиент оформляет</span>${icon(ctx, 'arrow')}<span>Сотрудник ведёт работу</span>${icon(ctx, 'arrow')}<span>Статус виден в кабинете</span></div>${link(ctx, '/how-it-works', 'Как собрать такое приложение')}</div></section>`;
}

export function renderFooter(ctx) {
  return `<footer class="p-footer"><div class="container"><div class="p-footer-top"><div class="p-footer-brand">${ctx.ui.brand(ctx)}<p>Данные в таблице. <br> Работа — в приложении.</p><span class="p-footer-note">Можно начать бесплатно</span></div><nav class="p-footer-links" aria-label="Навигация внизу страницы"><div><h2>Продукт</h2>${link(ctx, '/features', 'Возможности', 'p-footer-link')}${link(ctx, '/how-it-works', 'Как это работает', 'p-footer-link')}${link(ctx, '/pricing', 'Тарифы', 'p-footer-link')}${link(ctx, '/demo', 'Посмотреть демо', 'p-footer-link')}</div><div><h2>Начать с задачи</h2>${link(ctx, '/solutions', 'Все решения', 'p-footer-link')}${link(ctx, '/solutions/order-management', 'Заявки и выезды', 'p-footer-link')}${link(ctx, '/solutions/warehouse', 'Склад и остатки', 'p-footer-link')}${link(ctx, '/solutions/production', 'Производство', 'p-footer-link')}${link(ctx, '/templates', 'Все шаблоны', 'p-footer-link')}</div></nav></div><div class="p-footer-bottom"><span>© ${new Date().getFullYear()} TableApp</span><nav aria-label="Правовая информация">${link(ctx, '/legal/privacy', 'Конфиденциальность', 'p-footer-link')}${link(ctx, '/legal/terms', 'Условия использования', 'p-footer-link')}${link(ctx, '/legal/offer', 'Оферта', 'p-footer-link')}</nav></div></div></footer>`;
}

function home(ctx) {
  const cases = [
    { slug: 'order-management', label: 'Сервис и выезды', title: 'Мастер знает, куда ехать.', text: 'Диспетчер назначает выезд. Мастер открывает адрес, добавляет фото и меняет статус с телефона.', icon: 'orders', result: 'Новая → В работе → Готово' },
    { slug: 'warehouse', label: 'Торговля и склад', title: 'Остаток виден у стеллажа.', text: 'Кладовщик записывает приёмку и выдачу на месте. Владелец видит остатки и журнал движений.', icon: 'box', result: 'Приёмка → Движение → Остаток' },
    { slug: 'production', label: 'Производство', title: 'Выпуск связан с материалами.', text: 'Начальник смены вводит выпуск. Расход считается по нормам, директор открывает сводку за день.', icon: 'factory', result: 'Нормы → Выпуск → Сводка' }
  ];
  return `<div class="product-site p-home"><section class="p-hero container"><div class="p-hero-copy">${eyebrow('Таблица становится приложением')}<h1>Заказы, клиенты и склад. <br> <em>В одном месте.</em></h1><p class="lead">Начните с готового шаблона или своей таблицы. Сотрудники и клиенты получат удобные экраны для работы.</p><div class="p-actions">${link(ctx, '/templates', 'Выбрать шаблон', 'button button--primary')}${link(ctx, '/demo', 'Посмотреть демо', 'p-secondary-action')}</div><p class="p-under-action">Бесплатный тариф доступен сейчас</p></div><div class="p-hero-product">${preview(ctx, 'orders', true, 'Ваш рабочий экран · попробуйте открыть заказ')}</div></section>
  ${roleStory(ctx)}
  <section class="p-business section container" data-reveal><div class="p-section-top"><div>${eyebrow('Приложение под ваше дело')}<h2>Посмотрите на знакомую задачу.</h2></div>${link(ctx, '/solutions', 'Все решения')}</div><div class="p-case-list">${cases.map((item, index) => `<article><div class="p-case-symbol">${icon(ctx, item.icon)}<span>0${index + 1}</span></div><div><span class="p-case-label">${esc(ctx, item.label)}</span><h3>${esc(ctx, item.title)}</h3><p>${esc(ctx, item.text)}</p></div><div class="p-case-outcome"><p>${esc(ctx, item.result)}</p>${link(ctx, `/solutions/${item.slug}`, `Решение: ${item.label.toLowerCase()}`)}</div></article>`).join('')}</div></section>
  <section class="p-start section container" data-reveal><div class="p-section-top"><div>${eyebrow('Два пути к первому приложению')}<h2>Начать можно <br> с того, что уже есть.</h2></div><p>Шаблон помогает увидеть весь процесс. Свой файл подходит, если данные уже собраны и вы знаете, как хотите с ними работать.</p></div>${startPaths(ctx)}</section>
  <section class="p-free container" data-reveal><div>${eyebrow('Бесплатный тариф')}<h2>Сначала проверьте <br> на своей работе.</h2><p>Создайте рабочее пространство, выберите шаблон и посмотрите, подходит ли приложение вашей команде.</p>${link(ctx, '/pricing', 'Посмотреть все тарифы')}</div><div class="p-free-facts"><p class="p-zero">0 <span>₽ / месяц</span></p><dl><div><dt>Опубликованное приложение</dt><dd>1</dd></div><div><dt>Таблиц в рабочем пространстве</dt><dd>10</dd></div><div><dt>Строк</dt><dd>2 000</dd></div><div><dt>Место для файлов</dt><dd>250 МБ</dd></div></dl></div></section>
  ${finalCta(ctx, 'Посмотрите, как это будет у вас.', 'Начните с ближайшего шаблона. Затем замените данные, проверьте роли и откройте приложение на телефоне.')}</div>`;
}

function features(ctx) {
  const items = ctx.content?.features?.length ? ctx.content.features : [
    { title: 'Данные в одном рабочем пространстве', text: 'Связанные таблицы помогают вести клиентов, заказы и товары без повторного ввода.', kind: 'orders', link: '/templates' },
    { title: 'Удобные экраны с телефона', text: 'Список, карточка и формы собираются по таблице. Вы выбираете, что показывать и что разрешить изменять.', kind: 'requests', link: '/solutions/employee-app' },
    { title: 'Свои обращения клиента', text: 'Кабинет входит в клиентские шаблоны. После подтверждения почты клиент видит только свои записи.', kind: 'client', link: '/solutions/client-portal' },
    { title: 'Excel и CSV, когда нужен файл', text: 'Можно начать со своей таблицы и выгрузить данные для работы в других инструментах.', kind: 'stock', link: '/how-it-works' }
  ];
  return `<div class="product-site p-features">${pageIntro(ctx, 'Возможности', 'В таблице — данные. <br> <em>В приложении — работа.</em>', 'Храните всё в одном рабочем пространстве и дайте людям понятные экраны под их задачи.')}<section class="p-feature-showcase container" data-reveal>${preview(ctx, 'requests', false, 'Заявка в работе · данные и действия рядом')}<div class="p-feature-caption"><span>${icon(ctx, 'table')} Рабочее пространство владельца</span><p>Таблицы помогают настроить процесс. Приложение помогает выполнять его каждый день.</p></div></section><section class="p-capabilities section container" data-reveal><div class="p-section-top"><h2>От данных <br> к понятному действию.</h2><p>Возможности собираются вокруг рабочего процесса — от первой записи до результата.</p></div><div class="p-capability-grid">${items.map((item, index) => `<article><span class="p-capability-number">0${index + 1}</span><h3>${esc(ctx, item.title)}</h3><p>${esc(ctx, item.text)}</p>${item.link ? link(ctx, item.link, index === 0 ? 'Посмотреть, как это устроено' : `Подробнее: ${item.title.toLowerCase()}`) : ''}</article>`).join('')}</div></section><section class="p-permissions section" data-reveal><div class="container p-permission-grid"><div>${eyebrow('Доступ по роли')}<h2>Одна база. <br> Свой круг работы.</h2><p class="lead">Роль определяет экраны и действия. Правила по почте или организации ограничивают записи; права полей скрывают служебные данные.</p>${link(ctx, '/solutions/employee-app', 'О приложении для сотрудников')}</div><div class="p-access-sheet"><div class="p-access-heading">Кто с чем работает ${icon(ctx, 'shield')}</div><dl><div><dt>Владелец</dt><dd>Настройка данных, экранов и доступа</dd></div><div><dt>Сотрудник</dt><dd>Записи и поля по выданным правам</dd></div><div><dt>Клиент</dt><dd>Собственные обращения в кабинете</dd></div></dl><p>Создание роли само по себе не разделяет записи. Настройте правила и проверьте приложение от имени нужной роли.</p></div></div></section>${limits(ctx, ['Приложение работает в браузере и требует подключения к интернету.', 'Уведомления о смене статуса и онлайн-оплата пока не подключены.', 'Готовые возможности различаются по шаблонам. На странице каждого шаблона указано, что входит и что нужно настроить.'])}${finalCta(ctx, 'Лучше один раз открыть.', 'Посмотрите рабочий экран в демо или начните со знакомой задачи в каталоге шаблонов.')}</div>`;
}

function how(ctx) {
  const steps = [
    { title: 'Возьмите готовую основу', text: 'Выберите близкий шаблон и посмотрите, как связаны данные и рабочие экраны. Замените учебные записи своими. Если данные уже в файле, начните с импорта Excel или CSV.', caption: 'Данные · клиенты, заказы, товары', kind: 'orders', action: link(ctx, '/templates', 'Найти свою задачу') },
    { title: 'Настройте работу людей', text: 'Проверьте карточки и формы. Назовите роли, выдайте доступ сотрудникам и задайте правила для записей и полей. Откройте предпросмотр роли и проверьте, что человек увидит.', caption: 'Работа · список, карточка и форма', kind: 'requests', action: link(ctx, '/solutions/employee-app', 'Как устроен доступ команды') },
    { title: 'Опубликуйте и передайте ссылку', text: 'Приложение откроется в браузере на компьютере и телефоне. Сотрудник входит по коду на почту. В клиентских шаблонах каталог открыт, а обращения доступны клиенту после входа.', caption: 'Результат · свои обращения клиента', kind: 'client', action: link(ctx, '/solutions/client-portal', 'Посмотреть кабинет клиента') }
  ];
  return `<div class="product-site p-how">${pageIntro(ctx, 'Как это работает', 'Соберите процесс. <br> <em>Откройте приложение.</em>', 'Таблица остаётся местом для данных. Приложение даёт команде и клиентам удобный способ с ними работать.')}<div class="p-how-chapters container">${steps.map((step, index) => `<section class="p-how-chapter" data-reveal><div class="p-chapter-number">0${index + 1}</div><div class="p-chapter-copy"><h2>${step.title}</h2><p>${step.text}</p>${step.action}</div><div class="p-chapter-visual">${preview(ctx, step.kind, false, step.caption)}</div></section>`).join('')}</div><section class="p-launch section container" data-reveal><div>${eyebrow('Перед публикацией')}<h2>Проверьте работу <br> с обеих сторон.</h2><p>Пройдите путь сотрудника и клиента. Это помогает увидеть лишние поля и недостающие действия до того, как вы отправите ссылку.</p></div>${checkList(ctx, ['Учебные записи заменены, цены и контакты проверены.', 'Сотрудникам выданы роли, правила записей настроены по почте или организации.', 'В предпросмотре роли проверены доступные экраны и поля.', 'Личные обращения клиента видны только после входа.'])}</section>${finalCta(ctx, 'Начните с первого рабочего экрана.', 'Выберите шаблон под вашу задачу и проверьте процесс на бесплатном тарифе.')}</div>`;
}

function solutions(ctx) {
  return `<div class="product-site p-solutions">${pageIntro(ctx, 'Решения для бизнеса', 'Узнайте свою работу. <br> <em>Увидьте её в приложении.</em>', 'Не нужно выбирать набор функций по списку. Начните с процесса, который вы хотите привести в порядок.')}<section class="p-solution-directory container" aria-label="Все решения" data-reveal>${ctx.data.solutions.map((item, index) => { const copy = sCopy(ctx, item.slug); return `<article><div class="p-solution-directory-top"><span class="p-solution-icon">${icon(ctx, solutionIcons[item.slug] ?? 'table')}</span><span class="p-route-count">0${index + 1}</span></div><h2><a href="${esc(ctx, ctx.h(`/solutions/${item.slug}`))}">${esc(ctx, copy.title ?? item.name)} ${icon(ctx, 'arrow')}</a></h2><p>${esc(ctx, copy.description ?? item.description)}</p><ul>${(copy.benefits ?? item.blocks.map(block => block.title)).slice(0, 3).map(text => `<li>${esc(ctx, text)}</li>`).join('')}</ul><span class="p-directory-bottom">${esc(ctx, item.who)}</span></article>`; }).join('')}</section><section class="p-solution-bridge section container" data-reveal><div>${eyebrow('Общая основа')}<h2>Разные процессы. <br> Один понятный принцип.</h2></div><div><p class="lead">Данные связаны в таблицах. Роли определяют доступ. Сотрудники работают в приложении, а вы видите результат в рабочем пространстве.</p>${link(ctx, '/features', 'Посмотреть возможности TableApp')}</div></section>${finalCta(ctx, 'Нашли знакомый процесс?', 'Откройте подходящее решение, посмотрите экран и начните с готового шаблона.')}</div>`;
}

function solution(ctx) {
  const item = ctx.page.item;
  const copy = sCopy(ctx, item.slug);
  const kind = copy.kind ?? solutionKinds[item.slug] ?? 'orders';
  const templateIds = copy.templateIds?.length ? copy.templateIds : item.templateId ? [item.templateId] : item.slug === 'client-portal' ? ['zakazy', 'salon', 'service'] : ['zayavki', 'sklad', 'proizvodstvo'];
  const template = templateBy(ctx, templateIds[0]);
  const steps = copy.steps?.length ? copy.steps : item.workflow.slice(0, 3).map(step => ({ title: step.actor, text: step.text }));
  const importantLimits = copy.limits?.length ? copy.limits : item.limits;
  return `<div class="product-site p-solution"><section class="p-solution-hero container"><div>${link(ctx, '/solutions', 'Все решения', 'p-back-link')}${eyebrow('Приложение под задачу')}<h1>${esc(ctx, copy.title ?? item.h1)}</h1><p class="lead">${esc(ctx, copy.description ?? item.description)}</p><div class="p-actions">${primary(ctx, templateIds.length === 1 ? 'Начать с шаблона' : 'Начать бесплатно', templateIds.length === 1 ? templateIds[0] : undefined)}</div><p class="p-fit">${esc(ctx, item.who)}</p></div><div>${preview(ctx, kind, false, item.example?.title ?? item.name)}</div></section><section class="p-result-section section container" data-reveal><div>${eyebrow('Что меняется в работе')}<h2>От записи <br> до понятного результата.</h2><p>${esc(ctx, item.lead)}</p></div><div class="p-result-grid">${item.blocks.map((block, index) => `<article><span>0${index + 1}</span><h3>${esc(ctx, block.title)}</h3><p>${esc(ctx, block.text)}</p></article>`).join('')}</div></section><section class="p-solution-steps section" data-reveal><div class="container"><div class="p-section-top"><div>${eyebrow('Процесс в приложении')}<h2>Кто делает следующий шаг.</h2></div><p>Каждое действие остаётся рядом с записью, к которой относится.</p></div><ol>${steps.map((step, index) => `<li><span>0${index + 1}</span><h3>${esc(ctx, step.title)}</h3><p>${esc(ctx, step.text)}</p></li>`).join('')}</ol></div></section><section class="p-recommended section container" data-reveal>${templateIds.length === 1 && template ? templateFeature(ctx, template) : `<div class="p-section-top"><div>${eyebrow('С чего начать')}<h2>Выберите близкий шаблон.</h2></div><p>${item.slug === 'client-portal' ? 'Кабинет клиента уже входит в клиентские сценарии. Выберите, что клиент будет оформлять.' : 'Рабочее приложение создаётся по таблице. Готовый шаблон помогает начать с уже собранного процесса.'}</p></div>${ctx.ui.templateCards(ctx, templateIds.map(id => templateBy(ctx, id)).filter(Boolean))}`}</section>${limits(ctx, importantLimits)}${item.related?.length ? `<section class="p-related container" data-reveal><h2>Рядом с этой задачей</h2><div>${item.related.map(slug => solutionBy(ctx, slug)).filter(Boolean).map(related => link(ctx, `/solutions/${related.slug}`, related.name)).join('')}</div></section>` : ''}${finalCta(ctx, 'Посмотрите на процесс изнутри.', 'Откройте шаблон, замените данные и проверьте работу людей на бесплатном тарифе.')}</div>`;
}

function templates(ctx) {
  return `<div class="product-site p-templates">${pageIntro(ctx, 'Готовые шаблоны', 'Начните <br> <em>с работающей основы.</em>', 'В шаблоне уже связаны данные, экраны и действия под конкретную задачу. Выберите близкий процесс и посмотрите, что входит.')}<section class="p-template-catalog container" aria-label="Каталог шаблонов" data-reveal>${ctx.ui.templateBrowser(ctx)}</section><section class="p-template-explainer section" data-reveal><div class="container p-template-explainer-grid"><div>${eyebrow('Не просто пустая таблица')}<h2>Внутри — <br> логика вашей задачи.</h2></div><ol><li><span>01</span><div><h3>Связанные данные</h3><p>Клиенты, заказы, товары или другие записи уже собраны в подходящую структуру.</p></div></li><li><span>02</span><div><h3>Рабочие экраны</h3><p>Есть списки, карточки и действия, которые нужны выбранному процессу.</p></div></li><li><span>03</span><div><h3>Основа для доступа</h3><p>Проверьте роли, добавьте сотрудников и замените учебные данные перед публикацией.</p></div></li></ol></div></section><section class="p-own-data section container" data-reveal><div><span class="p-path-icon">${icon(ctx, 'upload')}</span><h2>Таблица уже готова?</h2><p>Начните с Excel или CSV. После импорта проверьте данные, настройте экраны и определите доступ команды.</p></div><a class="button button--secondary" href="${esc(ctx, ctx.start())}">Начать со своего файла ${icon(ctx, 'arrow')}</a></section>${finalCta(ctx, 'Выберите основу. Добавьте своё.', 'Начните бесплатно и проверьте ближайший шаблон на реальных задачах вашей команды.')}</div>`;
}

function template(ctx) {
  const item = ctx.page.item;
  const copy = tCopy(ctx, item.id);
  const kind = copy.kind ?? templateKinds[item.id] ?? 'orders';
  const benefits = copy.benefits?.length ? copy.benefits : item.gives;
  const prepare = copy.prepare?.length ? copy.prepare : ['Замените учебные данные своими и проверьте контакты.', 'Добавьте сотрудников, выдайте роли и проверьте доступ к записям.', 'Укажите название бизнеса и проверьте приложение до публикации.'];
  let itemLimits = item.limits?.length ? item.limits : [];
  if (!itemLimits.length && item.id === 'sklad') itemLimits = solutionBy(ctx, 'warehouse')?.limits ?? [];
  if (!itemLimits.length && item.id === 'proizvodstvo') itemLimits = solutionBy(ctx, 'production')?.limits ?? [];
  if (!itemLimits.length) itemLimits = ['Назначение мастера и изменение статуса выполняет человек.', 'Уведомления о смене статуса и онлайн-оплата пока не подключены.'];
  const related = (item.kin ?? []).map(id => templateBy(ctx, id)).filter(Boolean).slice(0, 3);
  const relatedSolution = ctx.data.solutions.find(solution => solution.templateId === item.id);
  return `<div class="product-site p-template"><header class="p-template-intro container">${link(ctx, '/templates', 'Все шаблоны', 'p-back-link')}<div class="p-template-title-row"><div>${eyebrow('Готовый шаблон')}<h1>${esc(ctx, item.name)}</h1><p class="lead">${esc(ctx, copy.description ?? item.tagline)}</p></div><div class="p-template-start">${primary(ctx, 'Начать с шаблона', item.id)}<p>Бесплатный тариф · выбранный шаблон сохранится после входа</p></div></div></header><section class="p-template-stage container"><div>${preview(ctx, kind, false, `Внутри шаблона «${item.name}»`)}</div><aside class="p-template-summary"><h2>Для кого</h2><p>${esc(ctx, item.audience)}</p><div class="p-template-summary-rule"></div><h2>С чего начать</h2><p>Замените учебные записи, добавьте людей и проверьте приложение от нужной роли.</p>${relatedSolution ? link(ctx, `/solutions/${relatedSolution.slug}`, 'Как устроен этот процесс') : link(ctx, '/how-it-works', 'Как запустить приложение')}</aside></section><section class="p-template-contents section container" data-reveal><div>${eyebrow('Уже в шаблоне')}<h2>Готово для <br> ежедневной работы.</h2></div>${checkList(ctx, benefits)}</section><section class="p-template-prepare section" data-reveal><div class="container"><div class="p-section-top"><div>${eyebrow('Добавьте своё')}<h2>Передайте основу <br> своей команде.</h2></div><p>Шаблон задаёт процесс. Данные, люди и правила вашего бизнеса добавляете вы.</p></div><ol>${prepare.map((text, index) => `<li><span>0${index + 1}</span><p>${esc(ctx, text)}</p></li>`).join('')}</ol></div></section>${limits(ctx, itemLimits, 'Границы этого шаблона')}${related.length ? `<section class="p-template-related section container" data-reveal><div class="p-section-top"><div>${eyebrow('Другие задачи рядом')}<h2>Посмотрите также.</h2></div>${link(ctx, '/templates', 'Весь каталог')}</div>${ctx.ui.templateCards(ctx, related)}</section>` : ''}<section class="p-template-end container" data-reveal><div><h2>Проверьте шаблон <br> на своей задаче.</h2><p>Сначала посмотрите на рабочие экраны. Затем замените данные и пригласите людей.</p></div>${primary(ctx, 'Начать с шаблона', item.id)}</section></div>`;
}

function pricing(ctx) {
  return `<div class="product-site p-pricing">${pageIntro(ctx, 'Тарифы', 'Начните бесплатно. <br> <em>Растите по задаче.</em>', 'Выбирайте объём данных и количество опубликованных приложений под свои процессы. Бесплатный тариф доступен сейчас.')}<section class="p-pricing-table container" data-reveal><div class="p-pricing-notice">${icon(ctx, 'table')}<p>Платные цены ориентировочные. Оплата пока не подключена.</p></div>${ctx.ui.pricing(ctx, 'rows')}</section><section class="p-price-guide section container" data-reveal><div>${eyebrow('Как выбрать')}<h2>Считайте процессы, <br> данные и файлы.</h2><p>Для первого приложения начните с бесплатного тарифа. Его достаточно, чтобы проверить готовый шаблон и способ работы команды.</p></div><div class="p-price-guide-list"><article><span>01</span><div><h3>Приложения</h3><p>Сколько отдельных приложений нужно опубликовать для сотрудников и клиентов.</p></div></article><article><span>02</span><div><h3>Таблицы и строки</h3><p>Какой объём клиентов, заказов, товаров и других записей вы собираетесь вести.</p></div></article><article><span>03</span><div><h3>Место для файлов</h3><p>Будут ли в карточках фотографии, документы и другие вложения.</p></div></article></div></section>${finalCta(ctx, 'Сначала — ваше первое приложение.', 'Откройте рабочее пространство на бесплатном тарифе и выберите подходящий шаблон.')}</div>`;
}

function demo(ctx) {
  return `<div class="product-site p-demo-page"><header class="p-demo-intro container"><div>${eyebrow('Посмотрите в работе')}<h1>Откройте заказ. <br> <em>Продолжите работу.</em></h1></div><div><p class="lead">Выберите запись, посмотрите состав заказа и попробуйте доступное действие. На экране сразу видно, что изменилось.</p>${link(ctx, '/templates/zakazy', 'Что входит в шаблон продаж')}</div></header><section class="p-demo-workspace container" aria-label="Интерактивное демо TableApp">${preview(ctx, 'orders', true, 'Заказы · интерактивный рабочий экран')}</section><section class="p-demo-reading container" data-reveal><article><span>01</span><h2>Выберите запись</h2><p>Откройте заказ из списка. Детали остаются рядом с остальной работой.</p></article><article><span>02</span><h2>Проверьте детали</h2><p>В карточке собраны клиент, позиции, сумма и текущее состояние заказа.</p></article><article><span>03</span><h2>Выполните действие</h2><p>Попробуйте доступное действие и посмотрите на новый статус записи.</p></article></section><section class="p-demo-to-real section container" data-reveal><div>${eyebrow('А дальше — ваши данные')}<h2>Такой же принцип. <br> Ваша задача.</h2><p>В шаблонах есть процессы для сервиса, склада, записи клиентов, продаж и производства. Выберите близкий и начните бесплатно.</p></div><div>${ctx.ui.templateCards(ctx, ['zakazy', 'zayavki', 'sklad'].map(id => templateBy(ctx, id)).filter(Boolean))}</div></section>${finalCta(ctx, 'Теперь попробуйте на своей работе.', 'Выберите готовый шаблон или начните с таблицы. Бесплатный тариф доступен сейчас.')}</div>`;
}

function legal(ctx) {
  const path = ctx.page.path.replace(/\/$/, '');
  return `<div class="product-site p-legal container"><aside><p class="eyebrow">Правовая информация</p><nav aria-label="Документы">${[['privacy', 'Конфиденциальность'], ['terms', 'Условия использования'], ['offer', 'Оферта']].map(([slug, name]) => `<a href="${esc(ctx, ctx.h(`/legal/${slug}`))}"${path === `/legal/${slug}` ? ' aria-current="page"' : ''}>${esc(ctx, name)} ${icon(ctx, 'arrow')}</a>`).join('')}</nav>${link(ctx, '/', 'На главную', 'p-back-link')}</aside><div class="p-legal-document">${ctx.ui.legal(ctx)}</div></div>`;
}

export function renderPage(ctx) {
  switch (ctx.page.type) {
    case 'home': return home(ctx);
    case 'features': return features(ctx);
    case 'how': return how(ctx);
    case 'solutions': return solutions(ctx);
    case 'solution': return solution(ctx);
    case 'templates': return templates(ctx);
    case 'template': return template(ctx);
    case 'pricing': return pricing(ctx);
    case 'demo': return demo(ctx);
    case 'legal': return legal(ctx);
    default: throw new Error(`Unknown product page type: ${ctx.page.type}`);
  }
}
