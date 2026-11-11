import { newId, type CustomerWorkflow } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Binding, AppV2Grant } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'

const writable = new Set(['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment'])
const roles = { kind: 'roles' as const }
const team: AppV2Audience = { ...roles, roleIds: ['owner', 'staff'] }
const shoppers: AppV2Audience = { ...roles, roleIds: ['owner', 'staff', 'client'] }
const buyers: AppV2Audience = { ...roles, roleIds: ['client', 'owner'] }

/** Sales starter installs as an editable builder v2 app (CRM has its own installer). */
export function isShopTemplate(templateId: string) {
  return templateId === 'zakazy'
}

export function shopCustomerWorkflow(app: AppV2): CustomerWorkflow | null {
  const shop = app.shop
  if (!shop) return null
  return {
    tableId: shop.ordersTableId, listScreenId: shop.ordersScreenId, detailScreenId: shop.orderScreenId, formScreenId: shop.checkoutFormId,
    emailFieldId: shop.emailFieldId, statusFieldId: shop.statusFieldId, createdFieldId: shop.createdFieldId, submissionFieldId: shop.submissionFieldId,
    initialStatus: shop.initialStatus, terminalStatuses: shop.terminalStatuses, cancelStatus: shop.cancelStatus, cancellableStatuses: shop.cancellableStatuses,
    assignmentFieldId: shop.assignmentFieldId,
    catalog: { tableId: shop.catalogTableId, viewId: shop.catalogViewId, detailScreenId: shop.detailScreenId, titleFieldId: shop.productTitleFieldId, activeFieldId: shop.activeFieldId, selectionFieldId: null },
    cart: {
      fieldId: shop.cartFieldId, priceFieldId: shop.priceFieldId, itemsTableId: shop.itemsTableId, nameFieldId: shop.itemNameFieldId,
      quantityFieldId: shop.itemQtyFieldId, itemPriceFieldId: shop.itemPriceFieldId, itemEmailFieldId: shop.itemEmailFieldId,
      itemAssignmentFieldId: shop.itemAssignmentFieldId, positionsFieldId: shop.positionsFieldId, productFieldId: shop.productFieldId,
    },
    approval: null,
    logistics: undefined,
  }
}

/** Installs the catalogue, basket and order screens on tables this workspace already owns. */
export function buildShopV2App(built: BuiltTemplate, meta: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const customer = built.customer
  if (!customer?.definition.cart || !customer.definition.catalog) throw new Error('Шаблон магазина не содержит каталог и корзину')
  const ids = customer.fieldIds, views = customer.viewIds
  const goods = customer.definition.catalog.table, orders = customer.definition.table, items = customer.definition.cart.items
  const field = (table: string, key: string) => {
    const id = ids[table]?.[key]
    if (!id) throw new Error(`В магазине нет поля ${table}.${key}`)
    return id
  }
  const choice = (table: string, key: string, name: string) => {
    const column = built.fields.find(item => item.id === field(table, key))
    const match = (column?.options as { choices?: { id: string; name: string }[] } | undefined)?.choices?.find(item => item.name === name)
    if (!match) throw new Error(`В магазине нет статуса «${name}»`)
    return match.id
  }
  const catalogViewId = views[goods]?.['Доступные'] ?? views[goods]?.['В наличии']
  if (!catalogViewId) throw new Error('У каталога нет представления доступных товаров')

  const catalogTableId = built.fields.find(item => item.id === field(goods, 'name'))!.tableId
  const ordersTableId = customer.tableId
  const itemsTableId = built.fields.find(item => item.id === field(items, 'name'))!.tableId
  const columns = (tableId: string) => built.fields.filter(item => item.tableId === tableId)
  const editable = (tableId: string) => columns(tableId).filter(item => writable.has(item.type)).map(item => item.id)
  const status = field(orders, 'status')
  const email = field(orders, customer.definition.email)
  const initialStatus = choice(orders, 'status', customer.definition.initial)
  const cancelStatus = choice(orders, 'status', customer.definition.cancel)
  const cancellableStatuses = customer.definition.cancellable.map(name => choice(orders, 'status', name))
  const terminalStatuses = customer.definition.terminal.map(name => choice(orders, 'status', name))
  const catalogScreenId = newId('screen'), detailScreenId = newId('screen'), basketScreenId = newId('screen'), ordersScreenId = newId('screen'), orderScreenId = newId('screen')
  const catalogNode = newId('component'), checkoutFormId = newId('component'), ordersNode = newId('component'), statusFormId = newId('component'), cancelButton = newId('component')
  const catalogSource = newId('component'), ordersSource = newId('component')
  const openProduct = newId('action'), openOrder = newId('action'), placeOrder = newId('action'), saveStatus = newId('action'), cancelOrder = newId('action')
  const placeStep = newId('action')
  const formValue = (fieldId: string): AppV2Binding => ({ kind: 'form', formId: checkoutFormId, fieldId })
  const checkoutFields = ['requestName', 'requestPhone', 'address', 'note', 'cart', 'submissionId'].map(key => field(orders, key))
  const detailFields = ['unit', 'category', 'lead', 'available'].flatMap(key => ids[goods]?.[key] ? [field(goods, key)] : [])
  const orderFields = ['requestName', 'requestPhone', 'status', 'total', 'date', 'address', 'note', 'positions', 'clientSummary'].map(key => field(orders, key))
  const publicGoods = ['name', 'photo', 'descr', 'price', 'unit', 'category', 'lead', 'available'].map(key => field(goods, key))
  const clientOrderRead = ['title', 'status', 'positions', 'total', 'count', 'date', 'address', 'note', 'clientSummary', 'requestDate', 'requestName', 'requestPhone'].map(key => field(orders, key))
  const itemRead = ['name', 'qty', 'price', 'cost', 'product'].map(key => field(items, key))
  const hiddenOrder = new Set([field(orders, 'cart'), field(orders, 'submissionId')])
  const staffOrderRead = columns(ordersTableId).map(item => item.id).filter(id => !hiddenOrder.has(id))
  const staffOrderUpdate = ['status', 'date', 'address', 'note', 'clientSummary', 'assignedEmail', 'paid'].map(key => field(orders, key))
  const owned = (fieldId: string) => ({ kind: 'owned' as const, fieldId, property: 'email' as const })
  const grant = (audience: AppV2Audience, permission: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...permission })
  const node = (id: string, name: string, fieldId: string) => ({ id, name, type: 'field' as const, label: name, visibleTo: null, visibleWhen: null, value: { kind: 'row' as const, fieldId } })
  const input = (fieldId: string, name: string, required: boolean) => ({ id: newId('component'), name, type: 'input' as const, fieldId, label: name, required, visibleTo: null, visibleWhen: null, initialValue: null })
  const checkoutInputs = [
    input(field(orders, 'requestName'), 'Имя', true), input(field(orders, 'requestPhone'), 'Телефон', true),
    input(field(orders, 'address'), 'Адрес получения', true), input(field(orders, 'note'), 'Комментарий', false),
    input(field(orders, 'cart'), 'Состав нового заказа', false), input(field(orders, 'submissionId'), 'Ключ оформления', false),
  ]
  const statusInputs = ['status', 'date', 'clientSummary'].map(key => input(field(orders, key), columns(ordersTableId).find(item => item.id === field(orders, key))!.name, key === 'status'))
  const intro = newId('component')
  const shop: NonNullable<AppV2['shop']> = {
    catalogTableId, catalogViewId, catalogScreenId, detailScreenId, basketScreenId, ordersScreenId, orderScreenId, checkoutFormId,
    activeFieldId: field(goods, 'available'), productTitleFieldId: field(goods, 'name'), priceFieldId: field(goods, 'price'),
    imageFieldId: ids[goods]?.photo ? field(goods, 'photo') : undefined, descriptionFieldId: ids[goods]?.descr ? field(goods, 'descr') : undefined,
    ordersTableId, itemsTableId, emailFieldId: email, statusFieldId: status, assignmentFieldId: field(orders, 'assignedEmail'),
    initialStatus, cancelStatus, cancellableStatuses, terminalStatuses,
    submissionFieldId: field(orders, 'submissionId'), createdFieldId: field(orders, 'requestDate'), cartFieldId: field(orders, 'cart'),
    positionsFieldId: field(orders, 'positions'), orderTitleFieldId: field(orders, 'title'), addressFieldId: field(orders, 'address'),
    itemNameFieldId: field(items, 'name'), itemQtyFieldId: field(items, 'qty'), itemPriceFieldId: field(items, 'price'),
    itemEmailFieldId: field(items, 'customerEmail'), itemAssignmentFieldId: field(items, 'assignedEmail'), productFieldId: field(items, 'product'),
  }
  const app: AppV2 = {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    appearance: { navigation: 'tabs', icon: 'box', density: 'regular', corners: 'rounded' },
    theme: { accent: 'green', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Владелец' }, { id: 'staff', name: 'Сотрудник' }, { id: 'client', name: 'Клиент' }],
    authentication: { mode: 'verified_email', defaultRoleId: 'client', members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: catalogScreenId,
    screens: [
      { id: catalogScreenId, name: 'Каталог', icon: 'box', navigation: true, audience: { kind: 'public' }, contextTableId: null, rootIds: [catalogNode], events: { enter: null } },
      { id: detailScreenId, name: 'Товар', icon: 'tag', navigation: false, audience: { kind: 'public' }, contextTableId: catalogTableId, recordTitleFieldId: shop.productTitleFieldId, catalog: { titleFieldId: shop.productTitleFieldId, ...(shop.imageFieldId ? { imageFieldId: shop.imageFieldId } : {}), priceFieldId: shop.priceFieldId, ...(shop.descriptionFieldId ? { descriptionFieldId: shop.descriptionFieldId } : {}) }, rootIds: detailFields.map(fieldId => `detail_${fieldId}`), events: { enter: null } },
      { id: basketScreenId, name: 'Корзина', icon: 'clipboard', navigation: true, audience: { kind: 'public' }, contextTableId: null, rootIds: [intro, checkoutFormId], events: { enter: null } },
      { id: ordersScreenId, name: 'Заказы', menuLabel: 'Заказы', icon: 'receipt', navigation: true, audience: shoppers, contextTableId: null, rootIds: [ordersNode], events: { enter: null } },
      { id: orderScreenId, name: 'Заказ', icon: 'receipt', navigation: false, audience: shoppers, contextTableId: ordersTableId, recordTitleFieldId: shop.orderTitleFieldId, rootIds: [...orderFields.map(fieldId => `order_${fieldId}`), cancelButton, statusFormId], events: { enter: null } },
    ],
    nodes: [
      { id: catalogNode, name: 'Каталог товаров', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: catalogSource, layout: 'catalog', titleFieldId: shop.productTitleFieldId, subtitleFieldId: null, ...(shop.imageFieldId ? { cardImageFieldId: shop.imageFieldId } : {}), cardDetailFieldId: shop.priceFieldId, itemIds: [], events: { itemPress: openProduct } },
      ...detailFields.map(fieldId => node(`detail_${fieldId}`, columns(catalogTableId).find(item => item.id === fieldId)!.name, fieldId)),
      { id: intro, name: 'Пояснение', type: 'text', visibleTo: null, visibleWhen: null, value: { kind: 'literal', value: 'Проверьте состав и контакты. После оформления с вами свяжутся, чтобы подтвердить заказ и согласовать получение. Оплаты онлайн нет.' } },
      { id: checkoutFormId, name: 'Оформление заказа', type: 'form', visibleTo: buyers, visibleWhen: null, tableId: ordersTableId, mode: 'create', childIds: checkoutInputs.map(item => item.id), events: { submit: placeOrder }, submitLabel: 'Оформить заказ' },
      ...checkoutInputs,
      { id: ordersNode, name: 'Заказы', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: ordersSource, layout: 'list', titleFieldId: shop.orderTitleFieldId, subtitleFieldId: status, dateFieldId: shop.createdFieldId, cardDetailFieldId: field(orders, 'total'), itemIds: [], events: { itemPress: openOrder } },
      ...orderFields.map(fieldId => node(`order_${fieldId}`, columns(ordersTableId).find(item => item.id === fieldId)!.name, fieldId)),
      { id: cancelButton, name: 'Отменить заказ', type: 'button', label: 'Отменить заказ', variant: 'danger', visibleTo: { ...roles, roleIds: ['client'] }, visibleWhen: null, events: { press: cancelOrder } },
      { id: statusFormId, name: 'Статус заказа', type: 'form', visibleTo: team, visibleWhen: null, tableId: ordersTableId, mode: 'edit', childIds: statusInputs.map(item => item.id), events: { submit: saveStatus }, submitLabel: 'Сохранить изменения' },
      ...statusInputs,
    ],
    sources: [
      { id: catalogSource, tableId: catalogTableId, viewId: shop.catalogViewId, filter: null, sorts: [], searchFieldIds: [shop.productTitleFieldId], pageSize: 24 },
      { id: ordersSource, tableId: ordersTableId, viewId: null, filter: null, sorts: [{ fieldId: shop.createdFieldId, direction: 'desc' }], searchFieldIds: [shop.orderTitleFieldId, field(orders, 'requestName')], pageSize: 20 },
    ],
    workflows: [
      { id: openProduct, name: 'Открыть товар', input: { rowTableId: catalogTableId, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: detailScreenId, record: { kind: 'current' } }] },
      { id: openOrder, name: 'Открыть заказ', input: { rowTableId: ordersTableId, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: orderScreenId, record: { kind: 'current' } }] },
      { id: placeOrder, name: 'Оформить заказ', input: { rowTableId: null, formId: checkoutFormId, screenTableId: null }, steps: [
        { id: placeStep, type: 'place_shop_order', tableId: ordersTableId, values: Object.fromEntries(checkoutFields.map(fieldId => [fieldId, formValue(fieldId)])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Заказ оформлен. Мы свяжемся с вами, чтобы подтвердить получение. Оплаты онлайн нет.' } },
        { id: newId('action'), type: 'open_screen', screenId: orderScreenId, record: { kind: 'result', stepId: placeStep } },
      ] },
      { id: saveStatus, name: 'Сохранить статус', input: { rowTableId: ordersTableId, formId: statusFormId, screenTableId: ordersTableId }, steps: [{ id: newId('action'), type: 'update_row', tableId: ordersTableId, target: { kind: 'current' }, values: Object.fromEntries(statusInputs.map(item => [item.fieldId, { kind: 'form' as const, formId: statusFormId, fieldId: item.fieldId }])) }] },
      { id: cancelOrder, name: 'Отменить заказ', input: { rowTableId: ordersTableId, formId: null, screenTableId: ordersTableId }, steps: [
        { id: newId('action'), type: 'require', message: 'Этот заказ уже нельзя отменить.', condition: { op: 'or', conditions: cancellableStatuses.map(value => ({ op: 'eq' as const, left: { kind: 'row' as const, fieldId: status }, right: { kind: 'literal' as const, value } })) } },
        { id: newId('action'), type: 'update_row', tableId: ordersTableId, target: { kind: 'current' }, values: { [status]: { kind: 'literal', value: cancelStatus } } },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Заказ отменён. История заказа сохранена.' } },
      ] },
    ],
    policy: {
      tables: [
        { tableId: catalogTableId, grants: [
          grant({ kind: 'public' }, { read: { fieldIds: publicGoods, rows: { kind: 'all' } } }),
          grant(team, { read: { fieldIds: columns(catalogTableId).map(item => item.id), rows: { kind: 'all' } }, create: { fieldIds: editable(catalogTableId) }, update: { fieldIds: editable(catalogTableId), rows: { kind: 'all' } } }),
        ] },
        { tableId: ordersTableId, grants: [
          grant({ ...roles, roleIds: ['client'] }, { read: { fieldIds: clientOrderRead, rows: owned(email) }, create: { fieldIds: checkoutFields, owner: { fieldId: email, property: 'email' } }, update: { fieldIds: [status], rows: owned(email) } }),
          grant({ ...roles, roleIds: ['owner'] }, { read: { fieldIds: columns(ordersTableId).map(item => item.id), rows: { kind: 'all' } }, create: { fieldIds: editable(ordersTableId).filter(id => id !== email), owner: { fieldId: email, property: 'email' } }, update: { fieldIds: editable(ordersTableId).filter(id => id !== email), rows: { kind: 'all' } } }),
          grant({ ...roles, roleIds: ['staff'] }, { read: { fieldIds: staffOrderRead, rows: { kind: 'all' } }, update: { fieldIds: staffOrderUpdate, rows: { kind: 'all' } } }),
        ] },
        { tableId: itemsTableId, grants: [
          grant({ ...roles, roleIds: ['client'] }, { read: { fieldIds: itemRead, rows: owned(shop.itemEmailFieldId) } }),
          grant(team, { read: { fieldIds: columns(itemsTableId).map(item => item.id), rows: { kind: 'all' } }, create: { fieldIds: editable(itemsTableId) }, update: { fieldIds: editable(itemsTableId), rows: { kind: 'all' } } }),
        ] },
      ],
      workflows: [
        { workflowId: openProduct, audience: { kind: 'public' } },
        { workflowId: openOrder, audience: shoppers },
        { workflowId: placeOrder, audience: buyers },
        { workflowId: saveStatus, audience: team },
        { workflowId: cancelOrder, audience: { ...roles, roleIds: ['client'] } },
      ],
    },
    shop,
  }
  return app
}
