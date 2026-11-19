import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Grant, AppV2Node } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'

export const isInvoicesTemplate = (id: string) => id === 'scheta'

const writable = new Set(['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment'])
const owner: AppV2Audience = { kind: 'roles', roleIds: ['owner'] }

export function buildInvoicesV2App(built: BuiltTemplate, meta: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const table = (name: string) => {
    const found = built.tables.find(item => item.name === name)
    if (!found) throw new Error(`В шаблоне счетов нет таблицы «${name}»`)
    return found
  }
  const column = (tableName: string, fieldName: string) => {
    const found = built.fields.find(item => item.tableId === table(tableName).id && item.name === fieldName)
    if (!found) throw new Error(`В шаблоне счетов нет поля «${tableName} · ${fieldName}»`)
    return found
  }
  const choice = (tableName: string, fieldName: string, name: string) => {
    const match = (column(tableName, fieldName).options as { choices?: { id: string; name: string }[] }).choices?.find(item => item.name === name)
    if (!match) throw new Error(`В поле «${fieldName}» нет варианта «${name}»`)
    return match.id
  }
  const documents = table('Документы'), clients = table('Клиенты'), products = table('Товары и услуги'), settings = table('Настройки')
  const document = {
    number: column('Документы', 'Номер').id,
    kind: column('Документы', 'Вид').id,
    client: column('Документы', 'Клиент').id,
    date: column('Документы', 'Дата').id,
    due: column('Документы', 'Оплатить до').id,
    status: column('Документы', 'Статус').id,
    lines: column('Документы', 'Позиции').id,
    note: column('Документы', 'Комментарий').id,
    source: column('Документы', 'Источник').id,
    subtotal: column('Документы', 'Подытог').id,
    discountTotal: column('Документы', 'Скидка').id,
    vatTotal: column('Документы', 'НДС').id,
    total: column('Документы', 'Итого').id,
    paid: column('Документы', 'Оплачено').id,
    payments: column('Документы', 'Платежи').id,
  }
  const client = {
    name: column('Клиенты', 'Клиент').id,
    phone: column('Клиенты', 'Телефон').id,
    email: column('Клиенты', 'Почта').id,
    inn: column('Клиенты', 'ИНН').id,
    address: column('Клиенты', 'Адрес').id,
    note: column('Клиенты', 'Заметки').id,
  }
  const product = {
    name: column('Товары и услуги', 'Название').id,
    unit: column('Товары и услуги', 'Единица').id,
    price: column('Товары и услуги', 'Цена').id,
    vatRate: column('Товары и услуги', 'НДС').id,
    vatIncluded: column('Товары и услуги', 'Учёт НДС').id,
    description: column('Товары и услуги', 'Описание').id,
  }
  const settingsFields = {
    companyName: column('Настройки', 'Компания').id,
    inn: column('Настройки', 'ИНН').id,
    kpp: column('Настройки', 'КПП').id,
    address: column('Настройки', 'Адрес').id,
    bank: column('Настройки', 'Банк').id,
    bik: column('Настройки', 'БИК').id,
    account: column('Настройки', 'Расчётный счёт').id,
    corrAccount: column('Настройки', 'Корр. счёт').id,
    phone: column('Настройки', 'Телефон').id,
    email: column('Настройки', 'Почта').id,
    logo: column('Настройки', 'Логотип').id,
    signature: column('Настройки', 'Подпись').id,
    stamp: column('Настройки', 'Печать').id,
    numberingEstimate: column('Настройки', 'Нумерация смет').id,
    numberingInvoice: column('Настройки', 'Нумерация счетов').id,
    numberingAct: column('Настройки', 'Нумерация актов').id,
  }
  const kinds = {
    estimate: choice('Документы', 'Вид', 'Смета'),
    invoice: choice('Документы', 'Вид', 'Счёт'),
    act: choice('Документы', 'Вид', 'Акт'),
  }
  const statuses = {
    draft: choice('Документы', 'Статус', 'Черновик'),
    sent: choice('Документы', 'Статус', 'Отправлен'),
    partial: choice('Документы', 'Статус', 'Частично оплачен'),
    paid: choice('Документы', 'Статус', 'Оплачен'),
    overdue: choice('Документы', 'Статус', 'Просрочен'),
  }
  const ids = {
    homeScreenId: newId('screen'),
    documentScreenId: newId('screen'),
    clientsScreenId: newId('screen'),
    productsScreenId: newId('screen'),
    settingsScreenId: newId('screen'),
    createDocumentFormId: newId('component'),
    editDocumentFormId: newId('component'),
    paymentFormId: newId('component'),
    createClientFormId: newId('component'),
    createProductFormId: newId('component'),
  }
  const nodes: AppV2Node[] = []
  const sources: AppV2['sources'] = []
  const workflows: AppV2['workflows'] = []
  const rules: AppV2['policy']['workflows'] = []
  const input = (fieldId: string, label: string, required = false) => {
    const id = newId('component')
    nodes.push({ id, name: label, type: 'input', fieldId, label, required, readOnly: false, initialValue: null, visibleTo: null, visibleWhen: null })
    return id
  }
  const flow = (name: string, formId: string | null, rowTableId: string | null, screenTableId: string | null, steps: AppV2['workflows'][number]['steps'], allowed: AppV2Audience) => {
    const id = newId('action')
    workflows.push({ id, name, input: { rowTableId, formId, screenTableId }, steps })
    rules.push({ workflowId: id, audience: allowed })
    return id
  }
  const bind = (formId: string, fieldId: string) => ({ kind: 'form' as const, formId, fieldId })
  const formOf = (id: string, name: string, tableId: string, mode: 'create' | 'edit', childIds: string[], submitLabel: string, rowTableId: string | null, screenTableId: string | null) => {
    nodes.push({
      id, name, type: 'form', tableId, mode, childIds, submitLabel, visibleTo: owner, visibleWhen: null,
      events: { submit: flow(name, id, rowTableId, screenTableId, [
        mode === 'create'
          ? { id: newId('action'), type: 'create_row', tableId, values: Object.fromEntries(childIds.map(childId => {
            const node = nodes.find(item => item.id === childId)
            const fieldId = node && node.type === 'input' ? node.fieldId : childIds[0]!
            return [fieldId, bind(id, fieldId)]
          })) }
          : { id: newId('action'), type: 'update_row', tableId, target: { kind: 'current' }, values: Object.fromEntries(childIds.map(childId => {
            const node = nodes.find(item => item.id === childId)
            const fieldId = node && node.type === 'input' ? node.fieldId : childIds[0]!
            return [fieldId, bind(id, fieldId)]
          })) },
      ], owner) },
    })
  }
  formOf(ids.createDocumentFormId, 'Новый документ', documents.id, 'create', [
    input(document.number, 'Номер', true), input(document.kind, 'Вид', true), input(document.client, 'Клиент', true),
    input(document.date, 'Дата', true), input(document.due, 'Оплатить до'), input(document.status, 'Статус'),
    input(document.lines, 'Позиции'), input(document.note, 'Комментарий'),
  ], 'Создать', null, null)
  formOf(ids.editDocumentFormId, 'Документ', documents.id, 'edit', [
    input(document.number, 'Номер', true), input(document.kind, 'Вид'), input(document.client, 'Клиент'),
    input(document.date, 'Дата'), input(document.due, 'Оплатить до'), input(document.status, 'Статус'),
    input(document.lines, 'Позиции'), input(document.note, 'Комментарий'),
    input(document.subtotal, 'Подытог'), input(document.discountTotal, 'Скидка'), input(document.vatTotal, 'НДС'),
    input(document.total, 'Итого'), input(document.paid, 'Оплачено'), input(document.payments, 'Платежи'),
  ], 'Сохранить', documents.id, documents.id)
  formOf(ids.paymentFormId, 'Оплата', documents.id, 'edit', [
    input(document.paid, 'Оплачено'), input(document.payments, 'Платежи'), input(document.status, 'Статус'),
  ], 'Записать оплату', documents.id, documents.id)
  formOf(ids.createClientFormId, 'Новый клиент', clients.id, 'create', [
    input(client.name, 'Клиент', true), input(client.phone, 'Телефон'), input(client.email, 'Почта'),
    input(client.inn, 'ИНН'), input(client.address, 'Адрес'), input(client.note, 'Заметки'),
  ], 'Создать клиента', null, null)
  formOf(ids.createProductFormId, 'Новая позиция', products.id, 'create', [
    input(product.name, 'Название', true), input(product.unit, 'Единица'), input(product.price, 'Цена'),
    input(product.vatRate, 'НДС'), input(product.vatIncluded, 'Учёт НДС'), input(product.description, 'Описание'),
  ], 'Добавить в каталог', null, null)
  const facts = (names: { id: string; name: string }[]) => names.map(item => {
    const id = newId('component')
    nodes.push({ id, name: item.name, type: 'field', label: item.name, value: { kind: 'row', fieldId: item.id }, visibleTo: null, visibleWhen: null })
    return id
  })
  const collection = (name: string, tableId: string, titleFieldId: string, detailId: string | null, sortFieldId: string | null, extra: Partial<Extract<AppV2Node, { type: 'collection' }>> = {}, screenTableId: string | null = null) => {
    const id = newId('component'), sourceId = newId('component')
    const open = detailId ? flow(`Открыть: ${name}`, null, tableId, screenTableId, [{ id: newId('action'), type: 'open_screen', screenId: detailId, record: { kind: 'current' } }], owner) : null
    sources.push({ id: sourceId, tableId, screenTableId, viewId: null, filter: null, sorts: sortFieldId ? [{ fieldId: sortFieldId, direction: 'desc' }] : [], searchFieldIds: [titleFieldId], pageSize: 100 })
    nodes.push({
      id, name, type: 'collection', sourceId, layout: 'list', titleFieldId, subtitleFieldId: null, itemIds: [],
      visibleTo: null, visibleWhen: null, events: { itemPress: open }, ...extra,
    })
    return id
  }
  const docFacts = facts([
    { id: document.number, name: 'Номер' }, { id: document.kind, name: 'Вид' }, { id: document.client, name: 'Клиент' },
    { id: document.date, name: 'Дата' }, { id: document.due, name: 'Оплатить до' }, { id: document.status, name: 'Статус' },
    { id: document.lines, name: 'Позиции' }, { id: document.note, name: 'Комментарий' }, { id: document.source, name: 'Источник' },
    { id: document.subtotal, name: 'Подытог' }, { id: document.discountTotal, name: 'Скидка' }, { id: document.vatTotal, name: 'НДС' },
    { id: document.total, name: 'Итого' }, { id: document.paid, name: 'Оплачено' }, { id: document.payments, name: 'Платежи' },
  ])
  const docsList = collection('Документы', documents.id, document.number, ids.documentScreenId, document.date, {
    subtitleFieldId: document.client, statusFieldId: document.status, dateFieldId: document.date, cardDetailFieldId: document.total,
  })
  const clientsList = collection('Клиенты', clients.id, client.name, null, client.name, { subtitleFieldId: client.phone, cardDetailFieldId: client.email })
  const productsList = collection('Каталог', products.id, product.name, null, product.name, { subtitleFieldId: product.unit, cardDetailFieldId: product.price })
  const screen = (id: string, name: string, menuLabel: string | undefined, icon: string, contextTableId: string | null, rootIds: string[], navigation: boolean) =>
    ({ id, name, ...(menuLabel ? { menuLabel } : {}), icon, audience: owner, contextTableId, rootIds, navigation, events: { enter: null } })
  const columnsOf = (tableId: string) => built.fields.filter(item => item.tableId === tableId).map(item => item.id)
  const editable = (tableId: string) => built.fields.filter(item => item.tableId === tableId && writable.has(item.type)).map(item => item.id)
  const grant = (audience: AppV2Audience, value: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...value })
  const all = { kind: 'all' as const }
  return {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    appearance: { navigation: 'tabs', icon: 'clipboard', density: 'regular', corners: 'rounded' },
    theme: { accent: 'green', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Руководитель' }],
    authentication: { mode: 'invite_only', defaultRoleId: null, members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: ids.homeScreenId,
    invoices: {
      documentsTableId: documents.id, clientsTableId: clients.id, productsTableId: products.id, settingsTableId: settings.id,
      ...ids, document, client, product, settings: settingsFields, kinds, statuses,
    },
    screens: [
      screen(ids.homeScreenId, 'Документы', 'Документы', 'clipboard', null, [docsList, ids.createDocumentFormId], true),
      screen(ids.clientsScreenId, 'Клиенты', 'Клиенты', 'users', null, [clientsList, ids.createClientFormId], true),
      screen(ids.productsScreenId, 'Каталог', 'Каталог', 'tag', null, [productsList, ids.createProductFormId], true),
      screen(ids.settingsScreenId, 'Настройки', 'Настройки', 'settings', null, [], true),
      screen(ids.documentScreenId, 'Документ', undefined, 'clipboard', documents.id, [...docFacts, ids.editDocumentFormId, ids.paymentFormId], false),
    ],
    nodes, sources, workflows,
    policy: {
      workflows: rules,
      tables: [
        { tableId: documents.id, grants: [grant(owner, { read: { fieldIds: columnsOf(documents.id), rows: all }, create: { fieldIds: editable(documents.id) }, update: { fieldIds: editable(documents.id), rows: all }, delete: { rows: all } })] },
        { tableId: clients.id, grants: [grant(owner, { read: { fieldIds: columnsOf(clients.id), rows: all }, create: { fieldIds: editable(clients.id) }, update: { fieldIds: editable(clients.id), rows: all }, delete: { rows: all } })] },
        { tableId: products.id, grants: [grant(owner, { read: { fieldIds: columnsOf(products.id), rows: all }, create: { fieldIds: editable(products.id) }, update: { fieldIds: editable(products.id), rows: all }, delete: { rows: all } })] },
        { tableId: settings.id, grants: [grant(owner, { read: { fieldIds: columnsOf(settings.id), rows: all }, update: { fieldIds: editable(settings.id), rows: all } })] },
      ],
    },
  }
}