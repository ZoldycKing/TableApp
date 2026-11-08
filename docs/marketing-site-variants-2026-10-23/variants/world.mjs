import { premiumWorld } from '../premium-scenes.mjs';
const templateMeta = {
  zakazy: { kind: 'orders', icon: 'orders', scene: 'От выбора товара до своего заказа', add: ['Замените товары, фотографии и цены на свои.', 'Укажите данные бизнеса и договоритесь, как будете согласовывать получение и оплату.', 'Проверьте рабочие экраны команды и заказ от лица клиента.'] },
  salon: { kind: 'booking', icon: 'calendar', scene: 'От свободного времени до посещения', add: ['Добавьте услуги, цены и мастеров.', 'Задайте рабочие часы, перерывы и исключения на нужные даты.', 'Проверьте запись и доступ каждого мастера.'] },
  service: { kind: 'service', icon: 'edit', scene: 'От приёмки до готового ремонта', add: ['Замените учебные записи на технику и ремонты мастерской.', 'Назначьте сотрудников и проверьте, какие записи доступны мастерам.', 'Пройдите оформление и согласование сметы от лица клиента.'] },
  zayavki: { kind: 'requests', icon: 'users', scene: 'От обращения до выполненной работы', add: ['Добавьте клиентов и рабочие заявки.', 'Укажите почту мастеров и назначьте им работу.', 'Проверьте календарь выездов и доступ к своим заявкам.'] },
  nedvizhimost: { kind: 'property', icon: 'box', scene: 'От карточки объекта до просмотра', add: ['Добавьте фотографии, характеристики и цены объектов.', 'Проверьте, какие объекты опубликованы, а какие доступны только команде.', 'Пройдите запрос просмотра и его согласование.'] },
  dostavka: { kind: 'delivery', icon: 'truck', scene: 'От принятой доставки до вручения', add: ['Добавьте адреса, контакты и доставки.', 'Назначьте курьеров и проверьте их доступ с телефона.', 'Согласуйте, кто меняет статусы и добавляет фото при вручении.'] },
  crm: { kind: 'crm', icon: 'users', scene: 'От первого разговора до сделки', add: ['Добавьте клиентов и открытые сделки.', 'Укажите суммы, этапы и даты следующего разговора.', 'Проверьте доступ команды к справочнику и сделкам.'] },
  sklad: { kind: 'stock', icon: 'box', scene: 'От приёмки до точного остатка', add: ['Добавьте товары, фотографии, артикулы и текущие цены.', 'Укажите остатки и пороги закупки.', 'Проверьте приёмку и выдачу под ролью кладовщика.'] },
  proizvodstvo: { kind: 'production', icon: 'factory', scene: 'От выпуска до расхода материалов', add: ['Добавьте продукцию, материалы и начальные остатки.', 'Задайте нормы расхода по каждому материалу.', 'Проверьте выпуск, движения склада и сводку руководителя.'] },
};

const solutionKinds = { 'client-portal': 'client', 'order-management': 'requests', production: 'production', 'employee-app': 'requests', warehouse: 'stock', catalog: 'orders' };
const solutionIcons = { 'client-portal': 'users', 'order-management': 'orders', production: 'factory', 'employee-app': 'edit', warehouse: 'box', catalog: 'table' };

const features = [
  { icon: 'table', title: 'Одна основа для всей работы', text: 'Клиенты, заявки и товары хранятся в таблицах. Связи между ними помогают не переписывать одни и те же данные в нескольких местах.', note: 'Таблицы и связанные записи' },
  { icon: 'orders', title: 'Каждой задаче — свой вид', text: 'В рабочем пространстве используйте таблицу, доску по статусам, календарь или сводку. Выберите вид, в котором проще ответить на рабочий вопрос.', note: 'Списки, доски, календарь и сводки' },
  { icon: 'edit', title: 'Работа рядом с делом', text: 'Сотрудник открывает приложение в браузере телефона: находит запись, меняет статус, добавляет фотографию или комментарий. Правки сохраняются в общей таблице.', note: 'Рабочее приложение для команды' },
  { icon: 'shield', title: 'Доступ по обязанностям', text: 'Владелец задаёт роли, доступные экраны и правила по строкам и полям. Для своих записей настройте правило по почте или организации и проверьте его перед публикацией.', note: 'Права проверяются на сервере' },
  { icon: 'users', title: 'Клиент видит своё', text: 'В клиентских шаблонах человек подтверждает почту кодом и открывает свои заказы, записи или обращения. Внутренние данные команды остаются закрытыми.', note: 'Кабинет в клиентских шаблонах' },
  { icon: 'upload', title: 'Можно взять свои данные', text: 'Начните с шаблона или создайте таблицу с нуля. Если данные уже есть, Excel или CSV поможет перенести их. Импорт — дополнительный путь, а не условие начала работы.', note: 'Excel и CSV' },
];

function action(ctx, label, href, secondary = false) {
  return `<a class="w-button${secondary ? ' w-button-quiet' : ''}" href="${ctx.esc(href)}">${ctx.esc(label)}${ctx.ui.icon(secondary ? 'play' : 'arrow')}</a>`;
}

function list(ctx, items, className = '') {
  return `<ul class="w-checks ${className}">${items.map(text => `<li>${ctx.ui.icon('check')}<span>${ctx.esc(text)}</span></li>`).join('')}</ul>`;
}

function crumb(ctx, label, path) {
  return `<nav class="w-breadcrumb" aria-label="Путь по сайту"><a href="${ctx.h('/')}">Главная</a><span aria-hidden="true">/</span>${path ? `<a href="${ctx.h(path)}">${ctx.esc(label)}</a><span aria-hidden="true">/</span><span>${ctx.esc(ctx.page.item?.name || ctx.page.title)}</span>` : `<span>${ctx.esc(label)}</span>`}</nav>`;
}

function heading(ctx, eyebrow, title, text, extra = '') {
  return `<header class="w-page-heading w-shell"><p class="w-eyebrow">${ctx.esc(eyebrow)}</p><h1>${ctx.esc(title)}</h1>${text ? `<p class="w-lead">${ctx.esc(text)}</p>` : ''}${extra}</header>`;
}

function sectionTitle(ctx, eyebrow, title, text = '') {
  return `<div class="w-section-title"><p class="w-eyebrow">${ctx.esc(eyebrow)}</p><h2>${ctx.esc(title)}</h2>${text ? `<p>${ctx.esc(text)}</p>` : ''}</div>`;
}

function limits(ctx, items, title = 'Что учесть в работе') {
  if (!items?.length) return '';
  return `<aside class="w-limits"><div class="w-limits-title">${ctx.ui.icon('edit')}<h2>${ctx.esc(title)}</h2></div><ul>${items.map(text => `<li>${ctx.esc(text)}</li>`).join('')}</ul></aside>`;
}

function solutionLinks(ctx, items = ctx.data.solutions) {
  return `<div class="w-solution-links">${items.map(item => `<a class="w-solution-link" href="${ctx.h(`/solutions/${item.slug}`)}"><span class="w-link-icon">${ctx.ui.icon(solutionIcons[item.slug] || 'table')}</span><span><h3>${ctx.esc(item.name)}</h3><p>${ctx.esc(item.short || item.description)}</p></span><span class="w-link-arrow">${ctx.ui.icon('arrow')}</span></a>`).join('')}</div>`;
}

function templateLimits(ctx, item) {
  const related = ctx.data.solutions.find(solution => solution.templateId === item.id);
  return item.limits?.length ? item.limits.slice(0, 3) : related?.limits?.length ? related.limits.slice(0, 3) : [];
}

export function renderHeader(ctx) {
  const links = [['Решения', '/solutions'], ['Шаблоны', '/templates'], ['Возможности', '/features'], ['Тарифы', '/pricing']];
  return `<header class="w-header"><div class="w-header-inner w-shell">${ctx.ui.brand(ctx)}<button class="menu-toggle w-menu-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="site-menu" aria-label="Открыть меню">${ctx.ui.icon('menu')}</button><nav id="site-menu" class="site-menu w-site-menu" aria-label="Разделы сайта">${links.map(([label, path]) => `<a href="${ctx.h(path)}"${ctx.page.path === path || ctx.page.path.startsWith(`${path}/`) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a class="w-nav-demo" href="${ctx.h('/demo')}">Демо</a><a class="w-mobile-login" href="${ctx.start()}">Войти</a></nav><div class="w-header-actions"><a class="w-login" href="${ctx.start()}">Войти</a><a class="w-start" href="${ctx.start()}">Начать бесплатно</a></div></div></header>`;
}

export function renderFooter(ctx) {
  return `<footer class="w-footer"><div class="w-shell"><div class="w-footer-top"><div class="w-footer-statement">Одна основа. <br> <em>Общее дело.</em></div><div class="w-footer-intro">${ctx.ui.brand(ctx)}<p>Таблицы, рабочие приложения и клиентский кабинет для вашего дела.</p></div></div><div class="w-footer-grid"><div><h2>Познакомиться</h2><a href="${ctx.h('/features')}">Возможности</a><a href="${ctx.h('/how-it-works')}">Как это работает</a><a href="${ctx.h('/demo')}">Посмотреть демо</a><a href="${ctx.h('/pricing')}">Тарифы</a></div><div><h2>Найти основу</h2><a href="${ctx.h('/templates')}">Все шаблоны</a><a href="${ctx.h('/templates/zakazy')}">Продажа товаров</a><a href="${ctx.h('/templates/salon')}">Салон красоты</a><a href="${ctx.h('/templates/service')}">Сервисный центр</a></div><div class="w-footer-solutions"><h2>Решить задачу</h2>${ctx.data.solutions.map(item => `<a href="${ctx.h(`/solutions/${item.slug}`)}">${ctx.esc(item.name)}</a>`).join('')}</div><div><h2>Начать работу</h2><a href="${ctx.start()}">Создать рабочее пространство</a><p>Бесплатный тариф доступен сейчас. Выберите шаблон и проверьте его на своей задаче.</p></div></div><div class="w-footer-bottom"><span>© ${new Date().getFullYear()} TableApp</span><div><a href="${ctx.h('/legal/privacy')}">Конфиденциальность</a><a href="${ctx.h('/legal/terms')}">Условия использования</a><a href="${ctx.h('/legal/offer')}">Оферта</a></div></div></div></footer>`;
}

function home(ctx) {
  return premiumWorld(ctx);
}

function featuresPage(ctx) {
  return `<div class="w-shell">${crumb(ctx, 'Возможности')}</div>${heading(ctx, 'Возможности', 'Из таблицы — в рабочий день.', 'Храните данные в одном месте. Дайте каждому участнику понятный экран и нужные действия.', `<div class="w-actions">${action(ctx, 'Выбрать шаблон', ctx.h('/templates'))}${action(ctx, 'Открыть демо', ctx.h('/demo'), true)}</div>`)}<section class="w-section w-shell w-feature-editorial" data-reveal>${features.map((item, i) => `<article class="w-feature-row"><div class="w-feature-number">0${i + 1}<span>${ctx.ui.icon(item.icon)}</span></div><div><p class="w-eyebrow">${item.note}</p><h2>${item.title}</h2><p>${item.text}</p></div></article>`).join('')}</section><section class="w-section w-product-section" data-reveal><div class="w-shell">${sectionTitle(ctx, 'Один процесс, разные экраны', 'Работа выглядит понятно.', 'В рабочем пространстве — общий обзор. В приложении сотрудника — записи и формы, доступные его роли.')}${ctx.ui.demo(ctx, 'service')}<div class="w-under-demo"><a class="w-text-link" href="${ctx.h('/solutions/employee-app')}">Как работает приложение сотрудника ${ctx.ui.icon('arrow')}</a><a class="w-text-link" href="${ctx.h('/solutions/client-portal')}">Что видит клиент ${ctx.ui.icon('arrow')}</a></div></div></section><div class="w-shell w-section">${limits(ctx, ['Создание роли само по себе не разделяет записи: правила по строкам и полям задаёт владелец.', 'Для работы нужна связь с интернетом. Офлайн-режима и автоматических напоминаний пока нет.'])}</div><section class="w-final" data-reveal>${ctx.ui.cta(ctx, 'Посмотрите на своей задаче.', 'Шаблон даст рабочую основу. Данные, роли и доступ вы настроите под своё дело.')}</section>`;
}

function howPage(ctx) {
  const chapters = [
    { title: 'Возьмите близкую основу', text: 'Продажа товаров, запись, ремонт, склад или производство: в шаблоне уже связаны нужные записи и собраны рабочие экраны.', check: 'Откройте описание шаблона и проверьте его возможности и ограничения.', link: ['Посмотреть шаблоны', '/templates'] },
    { title: 'Сделайте её своей', text: 'Замените учебные записи, назовите поля привычными словами и добавьте данные бизнеса. Если работаете в Excel, перенесите нужное файлом Excel или CSV.', check: 'Проверьте одну запись целиком: данные, связанные записи и результат действия.', link: ['Изучить возможности', '/features'] },
    { title: 'Пройдите путь каждого участника', text: 'Добавьте адреса сотрудников и выдайте роли. Настройте права экранов, полей и правила для своих записей. В клиентском шаблоне проверьте оформление и кабинет.', check: 'Проверьте доступ с почтой нужного участника, затем опубликуйте приложение и отправьте ссылку.', link: ['О рабочем приложении', '/solutions/employee-app'] },
  ];
  return `<div class="w-shell">${crumb(ctx, 'Как это работает')}</div>${heading(ctx, 'Как это работает', 'Соберите основу. Пройдите весь путь.', 'Начните с шаблона, настройте свою работу и проверьте, что увидит каждый участник.', `<div class="w-actions">${action(ctx, 'Выбрать шаблон', ctx.h('/templates'))}</div>`)}<section class="w-section w-shell w-chapters">${chapters.map((chapter, i) => `<article class="w-chapter" data-reveal><span class="w-chapter-number">0${i + 1}</span><div><h2>${chapter.title}</h2><p>${chapter.text}</p><div class="w-chapter-check">${ctx.ui.icon('check')}<p>${chapter.check}</p></div><a class="w-text-link" href="${ctx.h(chapter.link[1])}">${chapter.link[0]} ${ctx.ui.icon('arrow')}</a></div></article>`).join('')}</section><section class="w-section w-product-section" data-reveal><div class="w-shell">${sectionTitle(ctx, 'Проверьте до публикации', 'Начните с одного заказа.', 'Создайте запись, назначьте сотрудника, измените статус. Так проще увидеть, что нужно поправить до начала общей работы.')}${ctx.ui.demo(ctx, 'orders')}</div></section><section class="w-final" data-reveal>${ctx.ui.cta(ctx, 'Начните с близкого примера.', 'Выберите шаблон, который уже похож на вашу работу.')}</section>`;
}

function solutionsPage(ctx) {
  return `<div class="w-shell">${crumb(ctx, 'Решения')}</div>${heading(ctx, 'Решения для вашего дела', 'Узнайте свою рабочую задачу.', 'Кто принимает обращение, кто выполняет работу и как вы узнаёте результат? Посмотрите, как этот путь собирается в TableApp.')}<section class="w-section w-shell w-solution-index" data-reveal>${solutionLinks(ctx)}</section><section class="w-section w-solution-choice" data-reveal><div class="w-shell w-two-columns"><div><p class="w-eyebrow">От задачи к основе</p><h2>Решение объясняет путь. <br> <em>Шаблон помогает начать.</em></h2></div><div><p>В решении — роли участников и порядок работы. В шаблоне — связанные данные, рабочие экраны и учебные записи. Выберите основу, затем замените данные и проверьте доступ.</p><a class="w-text-link" href="${ctx.h('/templates')}">Перейти ко всем шаблонам ${ctx.ui.icon('arrow')}</a></div></div></section><section class="w-final" data-reveal>${ctx.ui.cta(ctx, 'Ваше дело устроено по-своему?', 'Возьмите ближайший шаблон и настройте данные, роли и экраны под свою работу.')}</section>`;
}

function solutionPage(ctx) {
  const item = ctx.page.item;
  const copy = ctx.content.solutions[item.slug];
  const template = ctx.data.templates.find(value => value.id === item.templateId);
  const selected = ctx.data.templates.filter(value => copy.templateIds.includes(value.id));
  return `<div class="w-shell">${crumb(ctx, 'Решения', '/solutions')}</div><section class="w-solution-hero w-shell"><div><p class="w-eyebrow">Решение для вашего дела</p><h1>${ctx.esc(item.h1)}</h1><p class="w-lead">${ctx.esc(copy.description)}</p><div class="w-actions">${action(ctx, template ? 'Открыть шаблон' : 'Выбрать шаблон', ctx.h(template ? `/templates/${template.id}` : '/templates'))}${action(ctx, 'Открыть демо', ctx.h('/demo'), true)}</div></div><aside class="w-solution-question"><span>${ctx.ui.icon(solutionIcons[item.slug])}</span><p class="w-eyebrow">Кому подойдёт</p><p class="w-fit-text">${ctx.esc(item.who)}</p></aside></section><section class="w-section w-shell" data-reveal>${sectionTitle(ctx, 'Всё для следующего шага', copy.title)}<div class="w-solution-blocks w-short-benefits">${copy.benefits.slice(0, 4).map((text, i) => `<article><span>0${i + 1}</span><h3>${ctx.esc(text)}</h3></article>`).join('')}</div></section><section class="w-section w-product-section" data-reveal><div class="w-shell">${sectionTitle(ctx, 'На рабочем экране', 'Так выглядит рабочий результат.')}${ctx.ui.demo(ctx, copy.kind || solutionKinds[item.slug] || 'orders')}</div></section><section class="w-section w-shell" data-reveal>${sectionTitle(ctx, 'Порядок работы', 'Кто делает следующий шаг')}${ctx.ui.workflow(ctx, copy.steps)}</section><section class="w-section w-template-start" data-reveal><div class="w-shell">${sectionTitle(ctx, 'Подходящая основа', template ? `Начните с шаблона «${template.name}»` : 'Выберите близкий шаблон')}${ctx.ui.templateCards(ctx, selected)}</div></section><div class="w-shell w-section">${limits(ctx, copy.limits)}</div><section class="w-final" data-reveal>${ctx.ui.cta(ctx, 'Пройдите этот путь со своими данными.', 'Начните бесплатно и проверьте один полный рабочий сценарий.')}</section>`;
}

function templatesPage(ctx) {
  return `<div class="w-shell">${crumb(ctx, 'Шаблоны')}</div>${heading(ctx, 'Готовая основа для работы', 'Найдите близкое вашему делу.', 'В каждом шаблоне уже есть связанные данные и рабочие экраны. Выберите задачу, замените учебные записи и проверьте приложение.')}<section class="w-shell w-template-index" data-reveal>${ctx.ui.templateBrowser(ctx)}</section><section class="w-section w-template-note" data-reveal><div class="w-shell w-two-columns"><div><p class="w-eyebrow">Не чистый лист</p><h2>Понятная основа. <br> <em>Ваши правила работы.</em></h2></div><div><p>Шаблон помогает увидеть весь процесс: от первой записи до результата. Дальше вы меняете данные, названия, экраны и роли. Импорт Excel или CSV пригодится, если данные уже ведутся в файле.</p><a class="w-text-link" href="${ctx.h('/how-it-works')}">Как начать с шаблона ${ctx.ui.icon('arrow')}</a></div></div></section><section class="w-final" data-reveal>${ctx.ui.cta(ctx, 'Сначала посмотрите изнутри.', 'В демо можно открыть запись, найти заказ и попробовать рабочие действия.')}</section>`;
}

function templatePage(ctx) {
  const item = ctx.page.item;
  const meta = templateMeta[item.id];
  const copy = ctx.content.templates[item.id];
  const related = ctx.data.templates.filter(value => item.kin?.includes(value.id));
  return `<div class="w-shell">${crumb(ctx, 'Шаблоны', '/templates')}</div><section class="w-template-hero w-shell"><div class="w-template-emblem" aria-hidden="true">${ctx.ui.icon(meta.icon)}<span>TableApp</span></div><div class="w-template-hero-copy"><p class="w-eyebrow">${item.internalOnly ? 'Шаблон для внутренней работы команды' : 'Готовый шаблон'}</p><h1>${ctx.esc(item.name)}</h1><p class="w-lead">${ctx.esc(item.tagline)}</p><p class="w-template-audience">${ctx.esc(item.audience)}</p><div class="w-actions">${action(ctx, 'Начать с этого шаблона', ctx.start(item.id))}${action(ctx, 'Посмотреть демо', ctx.h('/demo'), true)}</div></div></section><section class="w-section w-template-ready" data-reveal><div class="w-shell w-two-columns"><div><p class="w-eyebrow">Что уже собрано</p><h2>${ctx.esc(meta.scene)}</h2></div>${list(ctx, copy.benefits.slice(0, 4))}</div></section><section class="w-section w-shell" data-reveal>${sectionTitle(ctx, 'Перед началом работы', 'Добавьте своё.')}<ol class="w-setup-list">${copy.prepare.map((text, i) => `<li><span>0${i + 1}</span><p>${ctx.esc(text)}</p></li>`).join('')}</ol></section><section class="w-section w-product-section" data-reveal><div class="w-shell">${sectionTitle(ctx, 'Рабочий экран', 'Посмотрите, с чем будет работать команда.')}${ctx.ui.demo(ctx, meta.kind)}</div></section><div class="w-shell w-section">${limits(ctx, templateLimits(ctx, item), 'Проверьте, подходит ли шаблон')}</div>${related.length ? `<section class="w-section w-shell" data-reveal>${sectionTitle(ctx, 'Близкие задачи', 'Рядом с этим процессом')}${ctx.ui.templateCards(ctx, related)}</section>` : ''}<section class="w-template-last w-shell" data-reveal><p class="w-eyebrow">Шаблон «${ctx.esc(item.name)}»</p><h2>Возьмите основу. <br> <em>Добавьте своё дело.</em></h2>${action(ctx, 'Начать с этого шаблона', ctx.start(item.id))}</section>`;
}

function pricingPage(ctx) {
  return `<div class="w-shell">${crumb(ctx, 'Тарифы')}</div>${heading(ctx, 'Тарифы', 'Начните с дела. Бесплатно.', 'Бесплатный тариф доступен сейчас. Проверьте приложение на своей задаче, затем оцените объём данных и число приложений.')}<section class="w-shell w-pricing-intro"><div><span class="w-plan-now">Доступно сейчас</span><h2>Бесплатный</h2><p>Одно опубликованное приложение, 2 000 строк, 10 таблиц и 250 МБ файлов.</p></div><div><span class="w-price-zero">0 <small>₽</small></span>${action(ctx, 'Начать бесплатно', ctx.start())}</div></section><section class="w-section w-shell" data-reveal>${sectionTitle(ctx, 'Объём под вашу работу', 'Сравните возможности тарифов.', 'Цены платных тарифов ориентировочные. Оплата пока не подключена.')}${ctx.ui.pricing(ctx)}</section><section class="w-section w-pricing-guidance" data-reveal><div class="w-shell w-two-columns"><div><p class="w-eyebrow">Как выбрать</p><h2>Смотрите на процесс. <br> <em>Потом на объём.</em></h2></div><div>${list(ctx, ['Сколько отдельных приложений нужно команде и клиентам.', 'Сколько записей хранится в рабочих таблицах.', 'Сколько фотографий и документов вы добавляете.'])}<p>Начать можно с бесплатного тарифа. Полные лимиты каждого тарифа указаны выше.</p></div></div></section><section class="w-final" data-reveal>${ctx.ui.cta(ctx, 'Проверьте идею на практике.', 'Бесплатный тариф поможет пройти первый рабочий процесс со своими данными.')}</section>`;
}

function demoPage(ctx) {
  return `<div class="w-shell">${crumb(ctx, 'Демо')}</div>${heading(ctx, 'Посмотрите изнутри', 'Пройдите путь одного заказа.', 'Найдите заказ, откройте детали и попробуйте изменить его статус. Так устроен общий рабочий экран команды.')}<section class="w-shell w-demo-page" aria-label="Интерактивный рабочий экран"><ol class="w-demo-guide"><li><span>1</span>Найдите запись</li><li><span>2</span>Откройте детали</li><li><span>3</span>Измените статус</li></ol>${ctx.ui.demo(ctx, 'orders', true)}</section><section class="w-section w-shell w-demo-next" data-reveal><div><p class="w-eyebrow">Следующий шаг</p><h2>Теперь — ваш рабочий процесс.</h2><p>Шаблон даст готовую основу. Замените данные и проверьте, что увидят сотрудники и клиенты.</p></div><div class="w-actions">${action(ctx, 'Выбрать шаблон', ctx.h('/templates'))}<a class="w-text-link" href="${ctx.h('/how-it-works')}">Как начать ${ctx.ui.icon('arrow')}</a></div></section><section class="w-section w-demo-roles" data-reveal><div class="w-shell">${sectionTitle(ctx, 'Один процесс — разные участники', 'У каждого свой рабочий экран.')}<div class="w-role-notes"><div><span>Владелец</span><p>Видит рабочие таблицы, настраивает роли и проверяет весь процесс.</p></div><div><span>Сотрудник</span><p>Получает доступ к нужным экранам и записям по правилам владельца.</p></div><div><span>Клиент</span><p>После входа по коду видит свои заказы или обращения в клиентском шаблоне.</p></div></div></div></section>`;
}

export function renderPage(ctx) {
  switch (ctx.page.type) {
    case 'home': return home(ctx);
    case 'features': return featuresPage(ctx);
    case 'how': return howPage(ctx);
    case 'solutions': return solutionsPage(ctx);
    case 'solution': return solutionPage(ctx);
    case 'templates': return templatesPage(ctx);
    case 'template': return templatePage(ctx);
    case 'pricing': return pricingPage(ctx);
    case 'demo': return demoPage(ctx);
    case 'legal': return `<div class="w-legal w-shell">${ctx.ui.legal(ctx)}</div>`;
    default: throw new Error(`Unknown world page type: ${ctx.page.type}`);
  }
}
