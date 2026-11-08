import { premiumTasks } from '../premium-scenes.mjs';
/* «Сразу к своей задаче»: complete, task-led marketing pages. */
const taskChoices = [
  { id: 'zakazy', title: 'Принимать заказы', text: 'Товары, покупатели и статусы заказов.', icon: 'orders', kind: 'orders' },
  { id: 'salon', title: 'Записывать клиентов', text: 'Услуги, мастера и свободное время.', icon: 'calendar', kind: 'booking' },
  { id: 'sklad', title: 'Следить за складом', text: 'Остатки, приход и выдача товаров.', icon: 'box', kind: 'stock' },
];

const demoKinds = { zakazy: 'orders', salon: 'booking', sklad: 'stock', proizvodstvo: 'production', crm: 'crm', service: 'service', dostavka: 'delivery', nedvizhimost: 'property', zayavki: 'requests' };
const solutionKinds = { 'client-portal': 'client', 'order-management': 'requests', production: 'production', 'employee-app': 'requests', warehouse: 'stock', catalog: 'orders' };
const solutionIcons = { 'client-portal': 'users', 'order-management': 'orders', production: 'factory', 'employee-app': 'edit', warehouse: 'box', catalog: 'table' };

const setupByTemplate = {
  zakazy: ['Замените товары, фотографии и цены.', 'Укажите способы получения и контакты бизнеса.', 'Добавьте сотрудников и проверьте оформление заказа.'],
  salon: ['Добавьте услуги, цены и мастеров.', 'Задайте рабочие часы, перерывы и исключения.', 'Проверьте запись и перенос от имени клиента.'],
  service: ['Добавьте услуги и контакты мастерской.', 'Укажите сотрудников и доступ к ремонтам.', 'Проверьте приёмку и согласование стоимости.'],
  zayavki: ['Добавьте услуги и клиентов.', 'Замените почту мастеров на настоящую и выдайте доступ.', 'Проверьте заявку и её назначение сотруднику.'],
  nedvizhimost: ['Замените объекты, фотографии и цены.', 'Добавьте сотрудников и контакты собственников.', 'Проверьте публикацию и запрос просмотра.'],
  dostavka: ['Добавьте доставки с адресами и телефонами.', 'Выдайте курьерам доступ к приложению.', 'Проверьте смену статуса с телефона.'],
  crm: ['Добавьте клиентов и текущие сделки.', 'Настройте этапы под свой процесс продаж.', 'Укажите даты следующих разговоров.'],
  sklad: ['Добавьте товары, артикулы и фотографии.', 'Задайте пороги закупки и начальные остатки.', 'Выдайте доступ и проверьте приёмку с телефона.'],
  proizvodstvo: ['Добавьте материалы и изделия.', 'Заполните нормы расхода и начальные остатки.', 'Проверьте выпуск и расход материалов.'],
};

function editorial(ctx, family, key) {
  const collection = ctx.content?.[family];
  if (Array.isArray(collection)) return collection.find(item => item.id === key || item.slug === key) || {};
  return collection?.[key] || {};
}

function textLink(ctx, href, title, cls = '') {
  return `<a class="tasks-link ${cls}" href="${ctx.h(href)}">${ctx.esc(title)}${ctx.ui.icon('arrow')}</a>`;
}

function startLink(ctx, label = 'Начать бесплатно', id) {
  return `<a class="tasks-button" href="${ctx.start(id)}">${ctx.esc(label)}${ctx.ui.icon('arrow')}</a>`;
}

function breadcrumb(ctx, items) {
  return `<nav class="tasks-breadcrumb" aria-label="Путь по сайту"><ol><li><a href="${ctx.h('/')}">Главная</a></li>${items.map((item, i) => `<li>${item.href ? `<a href="${ctx.h(item.href)}">${ctx.esc(item.label)}</a>` : `<span aria-current="page">${ctx.esc(item.label)}</span>`}</li>`).join('')}</ol></nav>`;
}

function pageIntro(ctx, { eyebrow, title, text, action, crumbs = [], cls = '' }) {
  return `<section class="tasks-intro tasks-shell ${cls}">${breadcrumb(ctx, crumbs)}<div class="tasks-intro-copy"><p class="tasks-kicker">${ctx.esc(eyebrow)}</p><h1>${title}</h1>${text ? `<p class="tasks-lead">${ctx.esc(text)}</p>` : ''}${action ? `<div class="tasks-actions">${action}</div>` : ''}</div></section>`;
}

function sectionHeading(title, text = '', kicker = '') {
  return `<div class="tasks-section-heading">${kicker ? `<p class="tasks-kicker">${kicker}</p>` : ''}<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}</div>`;
}

function list(ctx, items, cls = '') {
  return `<ul class="tasks-list ${cls}">${items.map(item => `<li>${ctx.ui.icon('check')}<span>${ctx.esc(item)}</span></li>`).join('')}</ul>`;
}

function compactResult(kind) {
  if (kind === 'orders') return `<div class="tasks-mini tasks-mini-order"><div class="tasks-mini-top"><strong>Заказ № 1048</strong><span class="tasks-status">Новый</span></div><div class="tasks-customer"><span class="tasks-avatar" aria-hidden="true">АС</span><div><strong>Анна Смирнова</strong><span>Самовывоз</span></div></div><div class="tasks-mini-item"><span>Ежедневник А5</span><span>2 × 1 200 ₽</span></div><div class="tasks-mini-total"><span>Итого</span><strong>2 400 ₽</strong></div></div>`;
  if (kind === 'booking') return `<div class="tasks-mini tasks-mini-booking"><div class="tasks-mini-top"><strong>23 октября</strong><span>Пятница</span></div><div class="tasks-week" aria-hidden="true"><span>Пн<b>19</b></span><span>Вт<b>20</b></span><span>Ср<b>21</b></span><span>Чт<b>22</b></span><span class="tasks-current">Пт<b>23</b></span></div><div class="tasks-slot"><b>14:30</b><div><strong>Анна Смирнова</strong><span>Стрижка · мастер Мария</span></div></div><div class="tasks-slot tasks-slot-free"><b>15:00</b><span>Свободное время</span></div></div>`;
  return `<div class="tasks-mini tasks-mini-stock"><div class="tasks-mini-top"><strong>Остатки товаров</strong><span>На складе</span></div><div class="tasks-stock-row"><i class="tasks-swatch" aria-hidden="true"></i><span>Ежедневник А5</span><strong>24 <small>шт.</small></strong></div><div class="tasks-stock-row"><i class="tasks-swatch tasks-swatch-pen" aria-hidden="true"></i><span>Ручка</span><strong>68 <small>шт.</small></strong></div><div class="tasks-stock-row"><i class="tasks-swatch tasks-swatch-folder" aria-hidden="true"></i><span>Папка А4</span><strong>12 <small>шт.</small></strong></div><div class="tasks-stock-movement"><span>↗ Приход</span><strong>+20 шт.</strong></div></div>`;
}

function purposeCards(ctx) {
  return `<div class="tasks-purpose-grid">${taskChoices.map(choice => `<article class="tasks-purpose tasks-purpose-${choice.kind}"><a class="tasks-purpose-link" href="${ctx.h(`/templates/${choice.id}`)}"><div><h2>${choice.title}</h2><p>${choice.text}</p></div>${ctx.ui.icon('arrow')}</a><div class="tasks-purpose-result">${compactResult(choice.kind)}</div></article>`).join('')}</div>`;
}

function limits(ctx, items, title = 'Что важно учесть') {
  return `<aside class="tasks-limits"><div>${ctx.ui.icon('shield')}<h2>${title}</h2></div><ul>${items.map(item => `<li>${ctx.esc(item)}</li>`).join('')}</ul></aside>`;
}

function renderHome(ctx) {
  return premiumTasks(ctx);
}

function renderFeatures(ctx) {
  const features = [
    { title: 'Держать данные в порядке', text: 'Таблицы, связи и формулы собирают рабочие данные в одном пространстве. Представления помогают смотреть на них по задаче.', points: ['Таблица, карточки, доска и календарь — под разные способы работы.', 'Связанные данные и расчёты помогают вести заказы, клиентов и остатки.'], kind: 'orders', link: '/solutions/order-management', label: 'Разобрать учёт заявок', icon: 'table' },
    { title: 'Работать с телефона', text: 'Сотрудник открывает ссылку, находит запись и меняет статус, фотографию или комментарий.', points: ['Список, карточка и форма собираются по вашей таблице.', 'Роли задают доступ к экранам, а правила записей — к нужным строкам.'], kind: 'requests', link: '/solutions/employee-app', label: 'Посмотреть рабочее приложение', icon: 'edit' },
    { title: 'Принимать обращения клиентов', text: 'В клиентских шаблонах есть каталог или услуги, оформление и кабинет с личной историей.', points: ['Каталог доступен по ссылке; для оформления клиент подтверждает почту.', 'После входа клиент видит только собственные обращения этого бизнеса.'], kind: 'client', link: '/solutions/client-portal', label: 'Открыть кабинет клиента', icon: 'users' },
  ];
  return `<div class="tasks-page tasks-features">${pageIntro(ctx, { eyebrow: 'Возможности', title: 'Чтобы работа <br> <em>двигалась дальше.</em>', text: 'Таблица для общего учёта. Приложение для действий. Свои экраны для команды и клиентов.', action: `<a class="tasks-button" href="${ctx.h('/templates')}">Выбрать рабочий сценарий${ctx.ui.icon('arrow')}</a>`, crumbs: [{ label: 'Возможности' }] })}
    <div class="tasks-feature-index tasks-shell" aria-label="Три части TableApp">${features.map((feature, index) => `<a href="#tasks-feature-${index}">${ctx.ui.icon(feature.icon)}<span>${feature.title}</span>${ctx.ui.icon('arrow')}</a>`).join('')}</div>
    ${features.map((feature, index) => `<section class="tasks-section tasks-shell tasks-feature-row" id="tasks-feature-${index}" data-reveal><div class="tasks-prose"><h2>${feature.title}</h2><p>${feature.text}</p>${list(ctx, feature.points)}${textLink(ctx, feature.link, feature.label)}</div><div class="tasks-demo-surface">${ctx.ui.demo(ctx, feature.kind)}</div></section>`).join('')}
    <section class="tasks-section tasks-shell tasks-adapt" data-reveal>${sectionHeading('Подстройте под свою работу', 'Начать можно с шаблона, с чистой таблицы или с импорта Excel и CSV.')}<div class="tasks-three-columns"><div>${ctx.ui.icon('edit')}<h3>Свои данные и поля</h3><p>Замените содержимое шаблона, добавьте нужные поля и настройте представления.</p></div><div>${ctx.ui.icon('shield')}<h3>Проверенный доступ</h3><p>Задайте роли и правила записей. Перед публикацией проверьте, что доступно сотруднику.</p></div><div>${ctx.ui.icon('upload')}<h3>Файлы и перенос данных</h3><p>Используйте фотографии в карточках. Импортируйте или выгружайте таблицы файлом.</p></div></div></section>
    <section class="tasks-section tasks-shell">${limits(ctx, ['Онлайн-оплата и автоматические уведомления пока не подключены.', 'Приложение работает в браузере и требует интернета.', 'Связь заказов со складом и доставкой зависит от настроенного сценария. Отправку в доставку запускает менеджер.'])}</section>
    <div class="tasks-final">${ctx.ui.cta(ctx, 'Проверьте на своей задаче', 'Выберите шаблон, который ближе всего к работе вашей команды.')}</div>
  </div>`;
}

function renderHow(ctx) {
  const steps = [
    { title: 'Выберите ближайший шаблон', text: 'Начните с процесса, который уже знаком: заказы, запись, выезды или склад. Внутри — связанные данные и рабочие экраны.', link: '/templates', label: 'Посмотреть шаблоны', detail: 'Таблица из Excel или CSV — дополнительный путь, если данные уже есть.' },
    { title: 'Подставьте свои данные', text: 'Замените товары, услуги, клиентов и сотрудников. Проверьте цены, расписание или остатки — то, на чём держится ваша задача.', detail: 'Поля и представления можно изменить, если процесс отличается от шаблона.' },
    { title: 'Проверьте доступ и опубликуйте', text: 'Добавьте сотрудников по почте, назначьте роли и проверьте доступные экраны и записи. Затем опубликуйте приложение и отправьте ссылку.', link: '/solutions/employee-app', label: 'Как работает доступ', detail: 'Роль ограничивает экраны. Для своих записей нужно отдельное правило по сотруднику.' },
  ];
  return `<div class="tasks-page tasks-how">${pageIntro(ctx, { eyebrow: 'Как это работает', title: 'Возьмите готовую основу. <br> <em>Сделайте её своей.</em>', text: 'Не нужно начинать с пустого экрана. Выберите рабочий сценарий и проверьте его на собственных данных.', action: `<a class="tasks-button" href="${ctx.h('/templates')}">Выбрать шаблон${ctx.ui.icon('arrow')}</a>`, crumbs: [{ label: 'Как это работает' }] })}
    <section class="tasks-section tasks-shell tasks-steps-section" data-reveal><ol class="tasks-large-steps">${steps.map((step, index) => `<li><span class="tasks-step-number" aria-hidden="true">0${index + 1}</span><div><h2>${step.title}</h2><p>${step.text}</p>${step.link ? textLink(ctx, step.link, step.label) : ''}</div><aside>${step.detail}</aside></li>`).join('')}</ol></section>
    <section class="tasks-section tasks-role-section" data-reveal><div class="tasks-shell tasks-split"><div class="tasks-prose"><p class="tasks-kicker">После публикации</p><h2>Сотрудник работает. <br> <em>Учёт обновляется.</em></h2><p>Меняет статус с телефона, прикладывает фотографию, вводит количество. Правки сохраняются в общем рабочем пространстве.</p>${list(ctx, ['Вход — по коду на почту.', 'Приложение открывается по ссылке в браузере.', 'Клиентские шаблоны включают кабинет со своими обращениями.'])}${textLink(ctx, '/demo', 'Попробовать рабочий экран')}</div><div class="tasks-demo-surface">${ctx.ui.demo(ctx, 'requests')}</div></div></section>
    <section class="tasks-section tasks-shell tasks-import" data-reveal><div>${ctx.ui.icon('upload')}<p class="tasks-kicker">Если учёт уже есть</p><h2>Можно начать <br> со своей таблицы</h2></div><div><p>Импортируйте Excel или CSV в рабочее пространство. Проверьте типы полей и связи, затем соберите приложение и настройте доступ.</p><p>Таблица с данными — основа. Права сотрудников и действия в приложении вы задаёте отдельно.</p>${textLink(ctx, '/features', 'Посмотреть возможности настройки')}</div></section>
    <div class="tasks-final">${ctx.ui.cta(ctx, 'Возьмите одну задачу для начала', 'Сначала проверьте конкретный процесс. Остальное можно добавить по мере необходимости.')}</div>
  </div>`;
}

function solutionTiles(ctx, items) {
  return `<div class="tasks-solution-list">${items.map((solution, index) => `<a href="${ctx.h(`/solutions/${solution.slug}`)}" class="tasks-solution-tile"><span class="tasks-solution-icon">${ctx.ui.icon(solutionIcons[solution.slug] || 'table')}</span><div><h2>${ctx.esc(solution.name)}</h2><p>${ctx.esc(editorial(ctx, 'solutions', solution.slug).description || solution.short)}</p></div>${ctx.ui.icon('arrow')}</a>`).join('')}</div>`;
}

function renderSolutions(ctx) {
  return `<div class="tasks-page tasks-solutions">${pageIntro(ctx, { eyebrow: 'Решения', title: 'Что вы хотите <br> <em>наладить первым?</em>', text: 'Выберите задачу. Покажем, как устроена работа, что получает команда и с какого шаблона начать.', crumbs: [{ label: 'Решения' }] })}
    <section class="tasks-shell tasks-solutions-catalog" aria-label="Решения для бизнеса">${solutionTiles(ctx, ctx.data.solutions)}</section>
    <section class="tasks-section tasks-role-section" data-reveal><div class="tasks-shell tasks-split"><div class="tasks-prose"><p class="tasks-kicker">С чего бы вы ни начали</p><h2>Данные общие. <br> <em>Задачи у каждого свои.</em></h2><p>Владелец настраивает рабочее пространство. Сотрудники получают доступ к нужной работе. Клиент видит свои обращения в кабинете.</p>${textLink(ctx, '/features', 'Что можно настроить')}</div><div class="tasks-role-map"><div><span>Владелец</span><strong>Таблицы, сводки и доступ</strong></div><div><span>Сотрудник</span><strong>Записи и действия по своей роли</strong></div><div><span>Клиент</span><strong>Свои заказы, записи и история</strong></div></div></div></section>
    <section class="tasks-section tasks-shell tasks-small-help" data-reveal><div><h2>Задача немного другая?</h2><p>Шаблон можно изменить: добавить свои поля, настроить представления и доступ.</p></div>${textLink(ctx, '/templates', 'Выбрать ближайший шаблон')}</section>
    <div class="tasks-final">${ctx.ui.cta(ctx, 'Начните с готового процесса', 'Выберите ближайший шаблон и адаптируйте его к своей работе.')}</div>
  </div>`;
}

function renderSolution(ctx) {
  const item = ctx.page.item;
  const edit = editorial(ctx, 'solutions', item.slug);
  const template = ctx.data.templates.find(t => t.id === item.templateId);
  const choices = template ? [template] : ctx.data.templates.filter(t => item.slug === 'client-portal' ? ['zakazy', 'salon', 'service'].includes(t.id) : ['zayavki', 'sklad', 'proizvodstvo'].includes(t.id));
  const rawWorkflow = Array.isArray(edit.steps) ? edit.steps : item.workflow || [];
  const actions = rawWorkflow.length === 4 ? [rawWorkflow[0], rawWorkflow[1], { actor: rawWorkflow[3].actor, text: `${rawWorkflow[2].text.charAt(0).toUpperCase()}${rawWorkflow[2].text.slice(1)}. ${rawWorkflow[3].text.charAt(0).toUpperCase()}${rawWorkflow[3].text.slice(1)}.` }] : rawWorkflow;
  const exactLimits = edit.limits || (item.limits || []).map(value => item.slug === 'catalog' && value === 'Автоматического резервирования складских остатков нет' ? 'Без подключённого склада заказ не резервирует товар. Со складом резерв создаётся при подтверждении администратором.' : value);
  return `<div class="tasks-page tasks-solution">${pageIntro(ctx, { eyebrow: 'Решение под задачу', title: ctx.esc(edit.title || item.h1 || item.name), text: edit.description || item.description, action: `<a class="tasks-button" href="#tasks-solution-template">${template ? 'Посмотреть подходящий шаблон' : 'Выбрать подходящий шаблон'}${ctx.ui.icon('arrow')}</a>`, crumbs: [{ label: 'Решения', href: '/solutions' }, { label: item.name }] })}
    <section class="tasks-shell tasks-solution-result"><div class="tasks-result-caption"><p class="tasks-kicker">Рабочий результат</p><h2>${ctx.esc(item.short)}</h2><p>${ctx.esc(item.who)}</p>${edit.benefits?.length ? list(ctx, edit.benefits) : ''}</div><div class="tasks-demo-surface">${ctx.ui.demo(ctx, solutionKinds[item.slug] || 'orders')}</div></section>
    <section class="tasks-section tasks-shell" data-reveal>${sectionHeading('Как проходит работа', '', 'Три действия')}<ol class="tasks-action-steps">${actions.map((step, index) => `<li><span class="tasks-small-number">0${index + 1}</span><h3>${ctx.esc(step.title || step.actor || 'Рабочий шаг')}</h3><p>${ctx.esc(step.text || step.description || '')}</p></li>`).join('')}</ol></section>
    <section class="tasks-section tasks-shell" id="tasks-solution-template" data-reveal>${sectionHeading(template ? 'Готовая основа для этой задачи' : 'Выберите свой рабочий сценарий', template ? 'В шаблоне уже связаны данные, экраны и действия.' : 'Это часть готового приложения. Отдельный шаблон для неё выбирать не нужно.', 'С чего начать')}${ctx.ui.templateCards(ctx, choices)}</section>
    <section class="tasks-section tasks-shell">${limits(ctx, exactLimits)}</section>
    <section class="tasks-section tasks-shell tasks-related" data-reveal>${sectionHeading('Смежные задачи')}${solutionTiles(ctx, ctx.data.solutions.filter(s => (item.related || []).includes(s.slug)))}</section>
    <div class="tasks-final">${ctx.ui.cta(ctx, `Настройте ${item.name.toLocaleLowerCase('ru-RU')} под себя`, 'Выберите готовую основу и проверьте её на своих данных.')}</div>
  </div>`;
}

function renderTemplates(ctx) {
  return `<div class="tasks-page tasks-templates">${pageIntro(ctx, { eyebrow: 'Готовые шаблоны', title: 'Не с пустого листа. <br> <em>Со знакомой задачи.</em>', text: 'Девять рабочих основ для торговли, услуг и внутреннего учёта. Внутри — данные, экраны и действия, которые можно настроить под себя.', crumbs: [{ label: 'Шаблоны' }] })}
    <section class="tasks-shell tasks-browser" aria-label="Каталог шаблонов">${ctx.ui.templateBrowser(ctx)}</section>
    <section class="tasks-section tasks-shell tasks-template-principle" data-reveal><div>${sectionHeading('Что вы получаете <br> вместе с шаблоном', 'Основа уже собрана. Перед публикацией замените данные и проверьте работу от имени нужной роли.')}</div><div class="tasks-principle-list"><div><span>01</span><div><h3>Связанный рабочий процесс</h3><p>Данные и действия для конкретной задачи: от заявки до результата.</p></div></div><div><span>02</span><div><h3>Экраны для работы</h3><p>Рабочее пространство владельца и приложение. В клиентских сценариях — личный кабинет.</p></div></div><div><span>03</span><div><h3>Возможность менять</h3><p>Добавляйте поля, меняйте представления и настраивайте доступ под команду.</p></div></div></div></section>
    <div class="tasks-final">${ctx.ui.cta(ctx, 'Выберите задачу на сегодня', 'Начать можно с одного процесса и бесплатного тарифа.')}</div>
  </div>`;
}

function renderTemplate(ctx) {
  const item = ctx.page.item;
  const edit = editorial(ctx, 'templates', item.id);
  const ownSetup = Array.isArray(edit.prepare) ? edit.prepare : setupByTemplate[item.id];
  const solutionForTemplate = { zakazy: 'catalog', sklad: 'warehouse', proizvodstvo: 'production', zayavki: 'order-management' }[item.id];
  const templateLimits = item.limits?.length ? item.limits : editorial(ctx, 'solutions', solutionForTemplate).limits || ctx.content.limits;
  const related = ctx.data.templates.filter(t => (item.kin || []).includes(t.id));
  return `<div class="tasks-page tasks-template">${pageIntro(ctx, { eyebrow: item.internalOnly ? 'Шаблон для внутренней работы' : 'Готовый шаблон', title: ctx.esc(item.name), text: edit.description || item.tagline, action: `${startLink(ctx, 'Начать с этого шаблона', item.id)}<a class="tasks-demo-link" href="#tasks-template-preview">Посмотреть рабочий экран${ctx.ui.icon('arrow')}</a>`, crumbs: [{ label: 'Шаблоны', href: '/templates' }, { label: item.name }] })}
    <section class="tasks-shell tasks-template-fit"><p class="tasks-kicker">Кому подходит</p><p>${ctx.esc(item.audience)}</p><span class="tasks-template-scope">${ctx.ui.icon(item.internalOnly ? 'shield' : 'users')}${item.internalOnly ? 'Работа команды' : 'Рабочее пространство и приложение'}</span></section>
    <section class="tasks-section tasks-shell tasks-template-preview" id="tasks-template-preview" data-reveal>${sectionHeading('Так выглядит работа', 'Один из экранов готового сценария. Замените данные на свои перед публикацией.')}<div class="tasks-demo-surface tasks-wide-demo">${ctx.ui.demo(ctx, demoKinds[item.id] || 'orders')}</div></section>
    <section class="tasks-section tasks-shell tasks-ready" data-reveal><div>${sectionHeading('Что уже готово', 'Не нужно собирать базовый процесс заново.')}</div><div>${list(ctx, edit.benefits || item.gives || [])}</div></section>
    <section class="tasks-section tasks-role-section" data-reveal><div class="tasks-shell tasks-setup"><div>${sectionHeading('Что настроить <br> под своё дело', 'Три шага перед запуском.')}</div><ol>${(ownSetup || setupByTemplate.zayavki).map((step, index) => `<li><span class="tasks-small-number">0${index + 1}</span><p>${ctx.esc(typeof step === 'string' ? step : step.text || step.title)}</p></li>`).join('')}</ol></div></section>
    <section class="tasks-section tasks-shell">${limits(ctx, templateLimits)}</section>
    ${item.id === 'zakazy' ? `<section class="tasks-section tasks-shell tasks-connection" data-reveal><div><h2>Нужны склад и доставка?</h2><p>Их можно подключить к приложению. Резерв товара создаётся при подтверждении заказа; отправку в доставку запускает менеджер.</p></div>${textLink(ctx, '/solutions/warehouse', 'Как устроен склад')}</section>` : ''}
    <section class="tasks-section tasks-shell tasks-template-start" data-reveal><div><p class="tasks-kicker">Следующий шаг</p><h2>Начните с «${ctx.esc(item.name)}»</h2><p>После входа выбранный шаблон останется с вами. Проверьте его на своих данных и добавьте команду.</p></div>${startLink(ctx, 'Начать с этого шаблона', item.id)}</section>
    ${related.length ? `<section class="tasks-section tasks-shell" data-reveal>${sectionHeading('Может подойти и это')}${ctx.ui.templateCards(ctx, related)}</section>` : ''}
  </div>`;
}

function renderPricing(ctx) {
  return `<div class="tasks-page tasks-pricing">${pageIntro(ctx, { eyebrow: 'Тарифы', title: 'Начните бесплатно. <br> <em>Растите по задаче.</em>', text: 'Проверьте приложение на небольшом процессе. Дальше ориентируйтесь на объём данных и число опубликованных приложений.', crumbs: [{ label: 'Тарифы' }] })}
    <section class="tasks-shell tasks-price-catalog" aria-label="Сравнение тарифов"><p class="tasks-billing-note">Бесплатный тариф доступен сейчас. Платные цены ориентировочные; приём оплаты пока не подключён.</p>${ctx.ui.pricing(ctx, 'cards')}</section>
    <section class="tasks-section tasks-shell tasks-pricing-help" data-reveal>${sectionHeading('Как выбрать объём', 'Сначала определите задачу. Затем оцените, сколько данных и приложений понадобится.')}<div class="tasks-three-columns"><div><span class="tasks-small-number">01</span><h3>Один рабочий процесс</h3><p>Начните с бесплатного тарифа: одно приложение и до 2 000 строк.</p></div><div><span class="tasks-small-number">02</span><h3>Команда и разные задачи</h3><p>Проверьте число таблиц и опубликованных приложений в выбранном объёме.</p></div><div><span class="tasks-small-number">03</span><h3>Фотографии и документы</h3><p>Сопоставьте размер файлов с лимитом хранения. Он указан в каждом тарифе.</p></div></div></section>
    <div class="tasks-final">${ctx.ui.cta(ctx, 'Сначала проверьте идею в работе', 'Выберите шаблон и начните на бесплатном тарифе.')}</div>
  </div>`;
}

function renderDemo(ctx) {
  return `<div class="tasks-page tasks-demo-page">${pageIntro(ctx, { eyebrow: 'Демо', title: 'Посмотрите на задачу <br> <em>изнутри.</em>', text: 'Откройте запись, изучите данные и попробуйте доступные действия. Так проще понять, подходит ли такой способ работы вашей команде.', crumbs: [{ label: 'Демо' }] })}
    <section class="tasks-shell tasks-demo-playground" aria-label="Интерактивное демо TableApp">${ctx.ui.demo(ctx, 'orders', true)}</section>
    <section class="tasks-section tasks-shell tasks-demo-guide" data-reveal>${sectionHeading('На что посмотреть', 'От общей картины — к одной записи и конкретному действию.')}<ol class="tasks-action-steps"><li><span class="tasks-small-number">01</span><h3>Найдите нужную запись</h3><p>Посмотрите, какие данные видны в списке и как показан статус.</p></li><li><span class="tasks-small-number">02</span><h3>Откройте подробности</h3><p>Карточка собирает данные о конкретном заказе или обращении.</p></li><li><span class="tasks-small-number">03</span><h3>Проверьте действие</h3><p>Попробуйте доступное изменение и посмотрите на результат в интерфейсе.</p></li></ol></section>
    <section class="tasks-section tasks-shell tasks-demo-next" data-reveal><div><h2>Теперь — ближе <br> <em>к вашему делу.</em></h2><p>Запись в салон, выезды мастеров или склад отличаются от заказов. Выберите шаблон с нужным процессом.</p></div><div>${taskChoices.map(choice => `<a href="${ctx.h(`/templates/${choice.id}`)}">${ctx.ui.icon(choice.icon)}<span>${choice.title}</span>${ctx.ui.icon('arrow')}</a>`).join('')}</div></section>
    <div class="tasks-final">${ctx.ui.cta(ctx, 'Проверьте на собственных данных', 'В шаблоне можно заменить данные, настроить доступ и пройти свой рабочий сценарий.')}</div>
  </div>`;
}

function renderLegal(ctx) {
  const docs = [
    { path: '/legal/privacy', label: 'Политика конфиденциальности' },
    { path: '/legal/terms', label: 'Пользовательское соглашение' },
    { path: '/legal/offer', label: 'Публичная оферта' },
  ];
  return `<div class="tasks-page tasks-legal-page tasks-shell">${breadcrumb(ctx, [{ label: 'Документы' }, { label: ctx.page.title }])}<div class="tasks-legal-layout"><aside class="tasks-doc-nav"><p class="tasks-kicker">Документы</p><nav aria-label="Правовые документы">${docs.map(doc => `<a href="${ctx.h(doc.path)}"${ctx.page.path.replace(/\/$/, '') === doc.path ? ' aria-current="page"' : ''}>${doc.label}</a>`).join('')}</nav><p>Условия использования сервиса и обработки данных.</p></aside><article class="tasks-legal-copy">${ctx.ui.legal(ctx)}</article></div></div>`;
}

export function renderHeader(ctx) {
  const nav = [['/solutions', 'Решения'], ['/templates', 'Шаблоны'], ['/features', 'Возможности'], ['/pricing', 'Тарифы']];
  const active = path => ctx.page.path === path || ctx.page.path.startsWith(`${path}/`);
  return `<header class="tasks-header"><div class="tasks-shell tasks-header-inner">${ctx.ui.brand(ctx)}<button class="menu-toggle tasks-menu-toggle" data-menu-toggle aria-expanded="false" aria-controls="site-menu" aria-label="Открыть меню">${ctx.ui.icon('menu')}<span>Меню</span></button><nav id="site-menu" class="site-menu tasks-site-menu" aria-label="Разделы сайта">${nav.map(([href, label]) => `<a href="${ctx.h(href)}"${active(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a class="tasks-nav-demo" href="${ctx.h('/demo')}"${active('/demo') ? ' aria-current="page"' : ''}>Демо</a><a class="tasks-login" href="${ctx.start()}">Войти${ctx.ui.icon('arrow')}</a></nav></div></header>`;
}

export function renderFooter(ctx) {
  return `<footer class="tasks-footer"><div class="tasks-shell"><div class="tasks-footer-main"><div class="tasks-footer-brand">${ctx.ui.brand(ctx)}<p>Рабочие приложения <br> для понятных задач.</p><a class="tasks-footer-demo" href="${ctx.h('/demo')}">Посмотреть демо${ctx.ui.icon('arrow')}</a></div><nav aria-label="Продукт"><h2>TableApp</h2><a href="${ctx.h('/features')}">Возможности</a><a href="${ctx.h('/how-it-works')}">Как это работает</a><a href="${ctx.h('/templates')}">Шаблоны</a><a href="${ctx.h('/pricing')}">Тарифы</a></nav><nav aria-label="Решения"><h2>Решения</h2>${ctx.data.solutions.map(solution => `<a href="${ctx.h(`/solutions/${solution.slug}`)}">${ctx.esc(solution.name)}</a>`).join('')}</nav><nav aria-label="Документы"><h2>Документы</h2><a href="${ctx.h('/legal/privacy')}">Конфиденциальность</a><a href="${ctx.h('/legal/terms')}">Условия использования</a><a href="${ctx.h('/legal/offer')}">Публичная оферта</a><a class="tasks-footer-login" href="${ctx.start()}">Войти в TableApp${ctx.ui.icon('arrow')}</a></nav></div><div class="tasks-footer-bottom"><p>© ${new Date().getFullYear()} TableApp</p><p>Сначала одна задача. Дальше — по мере необходимости.</p><a href="${ctx.h('/solutions')}">Выбрать решение${ctx.ui.icon('arrow')}</a></div></div></footer>`;
}

export function renderPage(ctx) {
  const renderers = { home: renderHome, features: renderFeatures, how: renderHow, solutions: renderSolutions, solution: renderSolution, templates: renderTemplates, template: renderTemplate, pricing: renderPricing, demo: renderDemo, legal: renderLegal };
  if (!renderers[ctx.page.type]) throw new Error(`Unknown tasks page type: ${ctx.page.type}`);
  return renderers[ctx.page.type](ctx);
}
