import {
  computeInvoiceTotals,
  paymentsTotal,
  serializeInvoiceLines,
  serializePayments,
  type InvoiceLine,
  type PaymentEntry,
} from '../../invoices-logic'
import { inDays, type TemplateDef } from '../types'

function docPayload(lines: readonly InvoiceLine[], payments: readonly PaymentEntry[] = []) {
  const totals = computeInvoiceTotals(lines)
  return {
    lines: serializeInvoiceLines(lines),
    subtotal: totals.subtotal,
    discountTotal: totals.discount,
    vatTotal: totals.vat,
    total: totals.total,
    paid: paymentsTotal(payments),
    payments: serializePayments(payments),
  }
}

const line = (name: string, qty: number, unit: string, price: number, discount = 0, vatRate = 20, vatIncluded = true): InvoiceLine => ({
  name, qty, unit, price, discount, vatRate, vatIncluded,
})

const smetaSite: InvoiceLine[] = [
  line('Разработка структуры сайта', 1, 'услуга', 28000),
  line('Макет главной страницы', 1, 'услуга', 45000),
  line('Вёрстка и сборка', 1, 'услуга', 62000, 5),
]
const smetaSign: InvoiceLine[] = [
  line('Обмер и эскиз вывески', 1, 'услуга', 18000),
  line('Изготовление объёмных букв', 1, 'комплект', 96000, 0, 20, true),
]
const invoiceSite: InvoiceLine[] = [...smetaSite]
const payDay = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
const invoicePartial: PaymentEntry[] = [
  { date: payDay(-12), amount: 50000, comment: 'Предоплата по счёту' },
  { date: payDay(-3), amount: 30000, comment: 'Второй платёж' },
]
const invoicePaid: PaymentEntry[] = [
  { date: payDay(-20), amount: 48000, comment: 'Оплата по счёту' },
]
const actSite: InvoiceLine[] = invoiceSite

export const scheta: TemplateDef = {
  id: 'scheta',
  name: 'Счета и сметы',
  tagline: 'Сметы, счета и акты с НДС, оплатами и PDF для клиентов',
  audience: 'Студия, мастерская или ИП, которые выставляют сметы и счета и принимают оплату поэтапно',
  emoji: '🧾',
  internalOnly: true,
  kin: ['crm', 'proekty', 'zayavki'],
  limits: [
    'Отправка счёта на почту клиенту пока вручную — скачайте PDF и перешлите сами',
    'Онлайн-оплата и фискализация не подключены',
    'Нумерация документов ведётся в приложении, без связи с 1С',
  ],
  gives: [
    'Сметы, счета и акты с позициями из каталога или вручную',
    'НДС и скидки по строкам, итоги и остаток к оплате',
    'Статусы отправки, частичной и полной оплаты, просрочки',
    'Преобразование смета → счёт → акт и PDF на русском',
    'Реквизиты компании, печать и подпись в настройках',
  ],
  appTable: 'documents',
  appName: 'Счета и сметы',
  tables: [
    {
      key: 'clients',
      name: 'Клиенты',
      icon: 'building',
      primary: 'name',
      fields: [
        { key: 'name', name: 'Клиент', type: 'text', help: 'Название организации или ФИО для документов.' },
        { key: 'phone', name: 'Телефон', type: 'phone', help: 'Телефон для связи по оплате.' },
        { key: 'email', name: 'Почта', type: 'email', help: 'Куда отправлять счёт и акт.' },
        { key: 'inn', name: 'ИНН', type: 'text', help: 'ИНН покупателя для счёта и акта.' },
        { key: 'address', name: 'Адрес', type: 'long_text', help: 'Юридический или почтовый адрес.' },
        { key: 'note', name: 'Заметки', type: 'long_text', help: 'Как выставляете счета и сроки оплаты.' },
      ],
      views: [{ name: 'Все клиенты', type: 'grid' }],
      rows: [
        { key: 'veter', values: { name: 'ООО «Северный ветер»', phone: '+7 495 445-09-10', email: 'office@veter.example', inn: '7708123456', address: '125047, Москва, Ленинградский пр-т, 15', note: 'Оплата по счёту в течение 5 дней. Контакт — Марина Лебедева.' } },
        { key: 'kafe', values: { name: 'Кафе «Огонёк»', phone: '+7 916 700-18-25', email: 'ogon@kafe.example', inn: '7715123789', address: '119002, Москва, Арбат, 12', note: 'ИП собственника, счёт на вывеску.' } },
        { key: 'sad', values: { name: 'ЖК «Садовые кварталы»', phone: '+7 916 555-18-40', email: 'uk@sad.example', inn: '7728011122', address: '127221, Москва, Северный пр-д, 3', note: 'Управляющая компания, оплата по этапам.' } },
        { key: 'apteka', values: { name: 'Аптека «Здоровье»', phone: '+7 495 777-14-02', email: 'hello@zdorovie.example', inn: '7705987654', address: '115035, Москва, Пятницкая, 8', note: 'Счёт на витрину, НДС 20%.' } },
        { key: 'sokolov', values: { name: 'ИП Соколов А.В.', phone: '+7 903 222-11-44', email: 'sokolov@example.invalid', inn: '772345678901', address: '108840, Москва, пос. Внуковское', note: 'Мелкие заказы, часто без НДС.' } },
      ],
    },
    {
      key: 'products',
      name: 'Товары и услуги',
      icon: 'tag',
      primary: 'name',
      fields: [
        { key: 'name', name: 'Название', type: 'text', help: 'Как позиция называется в счёте.' },
        { key: 'unit', name: 'Единица', type: 'text', help: 'шт, услуга, час, м².' },
        { key: 'price', name: 'Цена', type: 'number', options: { format: 'currency', precision: 2, currency: 'RUB' }, help: 'Цена за единицу.' },
        {
          key: 'vatRate', name: 'НДС', type: 'single_select',
          choices: [{ name: '0', color: 'gray' }, { name: '10', color: 'blue' }, { name: '20', color: 'green' }],
          defaultChoice: '20',
          help: 'Ставка НДС в процентах.',
        },
        {
          key: 'vatIncluded', name: 'Учёт НДС', type: 'single_select',
          choices: [{ name: 'с НДС', color: 'green' }, { name: 'без НДС', color: 'gray' }],
          defaultChoice: 'с НДС',
          help: 'Входит ли НДС в указанную цену.',
        },
        { key: 'description', name: 'Описание', type: 'long_text', help: 'Подробности для PDF и внутренней заметки.' },
      ],
      views: [{ name: 'Каталог', type: 'grid' }],
      rows: [
        { key: 'design', values: { name: 'Дизайн-макет экрана', unit: 'услуга', price: 45000, vatRate: '20', vatIncluded: 'с НДС', description: 'Структура, визуал и согласование одного экрана.' } },
        { key: 'layout', values: { name: 'Вёрстка страницы', unit: 'услуга', price: 22000, vatRate: '20', vatIncluded: 'с НДС', description: 'Адаптивная вёрстка по готовому макету.' } },
        { key: 'sign', values: { name: 'Изготовление вывески', unit: 'комплект', price: 96000, vatRate: '20', vatIncluded: 'с НДС', description: 'Объёмные буквы с подсветкой.' } },
        { key: 'consult', values: { name: 'Консультация', unit: 'час', price: 3500, vatRate: '0', vatIncluded: 'без НДС', description: 'Онлайн или на объекте.' } },
        { key: 'hosting', values: { name: 'Хостинг на год', unit: 'услуга', price: 8400, vatRate: '20', vatIncluded: 'с НДС', description: 'Размещение и резервные копии.' } },
        { key: 'print', values: { name: 'Печать витрины', unit: 'м²', price: 2800, vatRate: '20', vatIncluded: 'с НДС', description: 'Материалы и монтаж не включены.' } },
      ],
    },
    {
      key: 'documents',
      name: 'Документы',
      icon: 'clipboard',
      primary: 'number',
      fields: [
        { key: 'number', name: 'Номер', type: 'text', help: 'Номер сметы, счёта или акта.' },
        {
          key: 'kind', name: 'Вид', type: 'single_select',
          choices: [{ name: 'Смета', color: 'blue' }, { name: 'Счёт', color: 'green' }, { name: 'Акт', color: 'indigo' }],
          defaultChoice: 'Смета',
          help: 'Тип документа.',
        },
        { key: 'client', name: 'Клиент', type: 'relation', relationTable: 'clients', allowMultiple: false, help: 'Кому выставлен документ.' },
        { key: 'date', name: 'Дата', type: 'date', help: 'Дата документа.' },
        { key: 'due', name: 'Оплатить до', type: 'date', help: 'Срок оплаты для счёта.' },
        {
          key: 'status', name: 'Статус', type: 'single_select',
          choices: [
            { name: 'Черновик', color: 'gray' },
            { name: 'Отправлен', color: 'blue' },
            { name: 'Частично оплачен', color: 'amber' },
            { name: 'Оплачен', color: 'green' },
            { name: 'Просрочен', color: 'red' },
          ],
          defaultChoice: 'Черновик',
          help: 'Статус отправки и оплаты.',
        },
        { key: 'lines', name: 'Позиции', type: 'long_text', help: 'JSON строк счёта.' },
        { key: 'note', name: 'Комментарий', type: 'long_text', help: 'Условия оплаты или примечание для PDF.' },
        { key: 'source', name: 'Источник', type: 'relation', relationTable: 'documents', allowMultiple: false, help: 'Документ, из которого создан этот.' },
        { key: 'subtotal', name: 'Подытог', type: 'number', options: { format: 'currency', precision: 2, currency: 'RUB' }, help: 'Сумма строк со скидкой.' },
        { key: 'discountTotal', name: 'Скидка', type: 'number', options: { format: 'currency', precision: 2, currency: 'RUB' }, help: 'Сумма скидок по строкам.' },
        { key: 'vatTotal', name: 'НДС', type: 'number', options: { format: 'currency', precision: 2, currency: 'RUB' }, help: 'Сумма НДС.' },
        { key: 'total', name: 'Итого', type: 'number', options: { format: 'currency', precision: 2, currency: 'RUB' }, help: 'К оплате.' },
        { key: 'paid', name: 'Оплачено', type: 'number', options: { format: 'currency', precision: 2, currency: 'RUB' }, help: 'Сумма поступивших оплат.' },
        { key: 'payments', name: 'Платежи', type: 'long_text', help: 'JSON записей об оплате.' },
      ],
      views: [
        { name: 'Все документы', type: 'grid', hiddenFields: ['lines', 'payments'] },
      ],
      rows: (() => {
        const p1 = docPayload(smetaSite)
        const p2 = docPayload(smetaSign)
        const p3 = docPayload(invoiceSite, invoicePartial)
        const p4 = docPayload([line('Витрина «Витамины ноября»', 1, 'услуга', 98000)], invoicePaid)
        const p5 = docPayload([line('Консультация по проекту', 3, 'час', 3500, 0, 0, false)])
        const p6 = docPayload(actSite, invoicePartial)
        const p7 = docPayload([line('Хостинг на год', 1, 'услуга', 8400)])
        return [
          { key: 'est1', values: { number: 'СМ-2026-001', kind: 'Смета', client: { rowKey: 'veter' }, date: inDays(-14), due: inDays(16), status: 'Отправлен', note: 'Согласовать макет до вёрстки.', ...p1 } },
          { key: 'est2', values: { number: 'СМ-2026-002', kind: 'Смета', client: { rowKey: 'kafe' }, date: inDays(-5), due: inDays(25), status: 'Черновик', note: 'Ждём согласования УК.', ...p2 } },
          { key: 'inv1', values: { number: 'СЧ-2026-003', kind: 'Счёт', client: { rowKey: 'veter' }, date: inDays(-10), due: inDays(5), status: 'Частично оплачен', note: 'Оплата в два этапа.', source: { rowKey: 'est1' }, ...p3 } },
          { key: 'inv2', values: { number: 'СЧ-2026-004', kind: 'Счёт', client: { rowKey: 'apteka' }, date: inDays(-22), due: inDays(-8), status: 'Просрочен', note: 'Напомнить бухгалтерии.', ...p4, paid: 0, payments: '[]' } },
          { key: 'inv3', values: { number: 'СЧ-2026-005', kind: 'Счёт', client: { rowKey: 'apteka' }, date: inDays(-25), due: inDays(-20), status: 'Оплачен', note: 'Витрина сдана.', ...p4 } },
          { key: 'inv4', values: { number: 'СЧ-2026-006', kind: 'Счёт', client: { rowKey: 'sokolov' }, date: inDays(-2), due: inDays(12), status: 'Отправлен', note: 'Без НДС.', ...p5 } },
          { key: 'act1', values: { number: 'АКТ-2026-001', kind: 'Акт', client: { rowKey: 'veter' }, date: inDays(-1), due: null, status: 'Отправлен', note: 'Работы по сайту приняты.', source: { rowKey: 'inv1' }, ...p6 } },
          { key: 'est3', values: { number: 'СМ-2026-007', kind: 'Смета', client: { rowKey: 'sad' }, date: inDays(0), due: inDays(30), status: 'Черновик', ...p7 } },
        ]
      })(),
    },
    {
      key: 'settings',
      name: 'Настройки',
      icon: 'settings',
      primary: 'companyName',
      fields: [
        { key: 'companyName', name: 'Компания', type: 'text', help: 'Название в шапке PDF.' },
        { key: 'inn', name: 'ИНН', type: 'text', help: 'ИНН продавца.' },
        { key: 'kpp', name: 'КПП', type: 'text', help: 'КПП при необходимости.' },
        { key: 'address', name: 'Адрес', type: 'long_text', help: 'Юридический адрес.' },
        { key: 'bank', name: 'Банк', type: 'text', help: 'Название банка.' },
        { key: 'bik', name: 'БИК', type: 'text', help: 'БИК.' },
        { key: 'account', name: 'Расчётный счёт', type: 'text', help: 'Р/с для оплаты.' },
        { key: 'corrAccount', name: 'Корр. счёт', type: 'text', help: 'Корреспондентский счёт.' },
        { key: 'phone', name: 'Телефон', type: 'phone', help: 'Контактный телефон.' },
        { key: 'email', name: 'Почта', type: 'email', help: 'Почта для связи.' },
        { key: 'logo', name: 'Логотип', type: 'image', help: 'Логотип в PDF.' },
        { key: 'signature', name: 'Подпись', type: 'image', help: 'Подпись руководителя.' },
        { key: 'stamp', name: 'Печать', type: 'image', help: 'Печать организации.' },
        { key: 'numberingEstimate', name: 'Нумерация смет', type: 'text', help: 'Шаблон: СМ-{YYYY}-{NNN}.' },
        { key: 'numberingInvoice', name: 'Нумерация счетов', type: 'text', help: 'Шаблон: СЧ-{YYYY}-{NNN}.' },
        { key: 'numberingAct', name: 'Нумерация актов', type: 'text', help: 'Шаблон: АКТ-{YYYY}-{NNN}.' },
      ],
      views: [{ name: 'Реквизиты', type: 'grid' }],
      rows: [{
        key: 'main',
        values: {
          companyName: 'ООО «Скатта Студия»',
          inn: '7701234567',
          kpp: '770101001',
          address: '127015, Москва, ул. Бутырская, 77',
          bank: 'АО «Банк Пример»',
          bik: '044525225',
          account: '40702810900000001234',
          corrAccount: '30101810400000000225',
          phone: '+7 495 123-45-67',
          email: 'buh@scatta.example',
          numberingEstimate: 'СМ-{YYYY}-{NNN}',
          numberingInvoice: 'СЧ-{YYYY}-{NNN}',
          numberingAct: 'АКТ-{YYYY}-{NNN}',
        },
      }],
    },
  ],
}