import { appSchema, newId, positionSequence, type App, type Component, type CustomerWorkflow, type Field, type Screen, type View } from '@tableapp/schema'
import { generateApp } from '../app-builder'
import type { BuiltTemplate } from './build'

/** All customer templates share the same ownership and first/repeat submission rules. */
export function asCustomerApp(app: App, built: BuiltTemplate): App {
  const primary = customerAppSection(app, built)
  const sections = (built.customerSections ?? []).map(definition => {
    const fields = built.customer!.fieldIds[definition.table]!
    const tableId = built.fields.find(field => field.id === fields[definition.status])!.tableId
    return customerAppSection(app, { ...built, appTableId: tableId, appViewId: built.views.find(view => view.tableId === tableId)!.id,
      customer: { ...built.customer!, definition, tableId }, customerSections: [] })
  })
  if (!sections.length) return primary
  const allScreens = [...primary.screens, ...sections.flatMap(section => section.screens.filter(screen => screen.type !== 'dashboard'))]
  for (const section of sections) {
    const config = section.customer!
    const parentDetail = allScreens.find(screen => screen.id === primary.customer!.detailScreenId)
    if (parentDetail?.type === 'detail') parentDetail.components.push({ id: newId('component'), position: 'z', type: 'button', label: 'Задать вопрос по заказу', style: 'secondary', roles: ['client'], visibleWhen: null,
      action: { id: newId('action'), type: 'open_screen', screenId: config.formScreenId } })
  }
  return appSchema.parse({ ...primary, customerSections: sections.map(section => section.customer!), rowAccessRules: [...primary.rowAccessRules, ...sections.flatMap(section => section.rowAccessRules)],
    screens: allScreens.map((screen, index) => ({ ...screen, position: positionSequence(allScreens.length)[index]! })) })
}

function customerAppSection(app: App, built: BuiltTemplate): App {
  const { definition: d, fieldIds, viewIds, tableId } = built.customer!
  const main = built.tables.find(table => table.id === tableId)!
  const f = fieldIds[d.table]!
  const fields = built.fields.filter(field => field.tableId === tableId) as Field[]
  const fieldKeys = (keys: string[]) => keys.map(key => f[key]).filter((id): id is string => Boolean(id))
  const choice = (name: string) => {
    const status = fields.find(field => field.id === f[d.status])!
    if (status.type !== 'single_select') throw new Error('Не найдено поле статуса клиентского сценария')
    const id = status.options.choices.find(option => option.name === name)?.id
    if (!id) throw new Error(`Не найден статус «${name}»`)
    return id
  }
  const access = (roles: string[], publicFields: string[] = [], publicScreen = false) => ({ roles, public: publicScreen, publicFields, allowDelete: false })
  const formFields = fieldKeys(d.formFields)
  const shown = fieldKeys(d.customerFields)
  const id = () => newId('screen')
  const listId = id(), detailId = id(), formId = id(), staffListId = id(), staffDetailId = id(), workerEditId = id(), adminEditId = id(), adminCreateId = id()
  const componentFields = (ids: string[]): Component[] => ids.map((fieldId, i) => {
    const field = built.fields.find(field => field.id === fieldId)!
    const base = { id: newId('component'), position: positionSequence(ids.length)[i]!, roles: null, visibleWhen: null }
    return field.type === 'long_text' ? { ...base, type: 'text', source: { kind: 'field', fieldId }, style: 'body' } : field.type === 'image' ? { ...base, type: 'gallery', fieldId, columns: 2 } : { ...base, type: 'field', fieldId, label: null, showWhenEmpty: false }
  })
  const editComponents = (ids: string[]): Component[] => ids.map((fieldId, i) => ({ id: newId('component'), position: positionSequence(ids.length)[i]!, type: 'form_field', fieldId, label: null, required: d.requiredFields.some(key => f[key] === fieldId), placeholder: null, roles: null, visibleWhen: null }))
  const button = (label: string, screenId: string, roles: string[] | null = null): Component => ({ id: newId('component'), position: 'z', type: 'button', label, style: 'primary', roles, visibleWhen: null, action: { id: newId('action'), type: 'open_screen', screenId } })
  const collection = (screenId: string, name: string, roles: string[], tap: string): Screen => ({ id: screenId, appId: app.id, position: 'a', name, tab: { icon: 'list', label: name }, access: access(roles),
    type: 'list', source: { viewId: built.appViewId, extraFilter: null, searchFieldIds: [main.primaryFieldId!] }, titleFieldId: main.primaryFieldId, subtitleFieldId: roles.includes('client') ? f.requestDate ?? null : f.requestName ?? null,
    imageFieldId: null, metaFieldId: shown.find(fieldId => !(roles.includes('staff') && d.table === 'zayavki' && fieldId === f.price) && fields.find(field => field.id === fieldId)?.type === 'number') ?? null, statusFieldId: f[d.status]!, onTapScreenId: tap, components: [] })
  const form = (screenId: string, name: string, mode: 'create' | 'edit', ids: string[], roles: string[], publicScreen = false): Screen => ({ id: screenId, appId: app.id, position: 'a', name, type: 'form', tab: mode === 'create' && roles.includes('manager') ? { icon: 'plus', label: 'Добавить' } : null,
    tableId, mode, components: editComponents(ids), submitLabel: mode === 'create' ? d.submitLabel : 'Сохранить', successText: 'Принято. Статус можно посмотреть в личном кабинете.', successScreenId: mode === 'create' && roles.includes('client') ? listId : staffListId, access: access(roles, [], publicScreen) })
  const config: CustomerWorkflow = { tableId, listScreenId: listId, detailScreenId: detailId, formScreenId: formId, emailFieldId: f[d.email]!, statusFieldId: f[d.status]!, initialStatus: choice(d.initial), terminalStatuses: d.terminal.map(choice), cancelStatus: choice(d.cancel), cancellableStatuses: d.cancellable.map(choice), assignmentFieldId: d.assignment ? f[d.assignment]! : null,
    createdFieldId: f.requestDate!, submissionFieldId: f.submissionId!,
    ...(f.requestName && f.requestPhone ? { profile: { nameFieldId: f.requestName, phoneFieldId: f.requestPhone } } : {}),
    ...(d.table === 'deliveries' ? { profile: { nameFieldId: f.receiver!, phoneFieldId: f.phone! } } : {}),
    parent: d.parent ? { tableId: built.fields.find(field => field.id === fieldIds[d.parent!.table]![d.parent!.email])!.tableId, relationFieldId: f[d.parent.relation]!, emailFieldId: fieldIds[d.parent.table]![d.parent.email]! } : null,
    catalog: null, cart: null, approval: d.approval ? { priceFieldId: f[d.approval.price]!, approvedPriceFieldId: f[d.approval.agreed]!, waitingStatus: choice(d.approval.waiting), approvedStatus: choice(d.approval.approved), declinedStatus: choice(d.approval.declined), consentRequiredStatuses: d.approval.consentRequired?.map(choice) } : null }
  if (f.scheduled) config.appointment = { fieldId: f.scheduled, minutes: 60, confirmedStatus: choice('Просмотр назначен') }
  if (d.table === 'deals' && fieldIds.clients) {
    const client = fieldIds.clients
    config.crm = { clientsTableId: built.fields.find(field => field.id === client.email)!.tableId, relationFieldId: f.client!, emailFieldId: client.email!, nameFieldId: client.name!, phoneFieldId: client.phone! }
  }
  if (d.cart && f.address) config.logistics = { kind: 'sales', addressFieldId: f.address, shippedStatus: choice('Отгружен'), deliveredStatus: choice('Доставлен') }
  if (d.table === 'deliveries') config.logistics = { kind: 'delivery', addressFieldId: f.address!, contentsFieldId: f.what!, shippedStatus: choice('В пути'), deliveredStatus: choice('Доставлена'), returnedStatus: choice('Возврат'), missedStatus: choice('Не застали') }
  const customerDetail: Screen = { id: detailId, appId: app.id, position: 'a', name: 'Подробности', tab: null, type: 'detail', tableId, access: access(['client']), components: componentFields(shown) }
  const related = fields.find(field => field.id === f.positions)
  if (d.cart && related?.type === 'relation') {
    const itemFields = fieldIds[d.cart.items]!
    customerDetail.components = customerDetail.components.filter(component => component.type !== 'field' || component.fieldId !== related.id)
    customerDetail.components.push({ id: newId('component'), position: 'y', type: 'related_list', relationFieldId: related.id, titleFieldId: itemFields[d.cart.name]!, subtitleFieldId: itemFields[d.cart.qty]!, imageFieldId: null, onTapScreenId: null, limit: 100, roles: null, visibleWhen: null })
  }
  const request = form(formId, d.submitLabel, 'create', formFields, ['client'])
  if (request.type === 'form') {
    request.components = request.components.map(component => component.type !== 'form_field' ? component : { ...component,
      label: component.fieldId === config.profile?.nameFieldId ? d.table === 'deliveries' ? 'Имя получателя' : 'Ваше имя' : component.fieldId === config.profile?.phoneFieldId ? d.table === 'deliveries' ? 'Телефон получателя' : 'Ваш телефон' : component.fieldId === f.title ? 'Что нужно сделать' : null })
    request.components.unshift({ id: newId('component'), position: '0', type: 'text', source: { kind: 'literal', value: `${d.intro.replace('Онлайн-оплаты нет.', '').trim()} Оплаты онлайн нет. После оформления сотрудник бизнеса свяжется с вами и согласует оплату.` }, style: 'body', roles: null, visibleWhen: null })
  }
  const managerFields = fields.filter(field => !['formula', 'lookup', 'rollup', 'count'].includes(field.type) && field.id !== f.cart && field.id !== f.submissionId && field.id !== config.approval?.approvedPriceFieldId).map(field => field.id)
  const workerShown = Array.from(new Set([...shown, config.profile?.nameFieldId!, config.profile?.phoneFieldId!, f.requestAddress!].filter(Boolean))).filter(id => !(d.table === 'zayavki' && id === f.price))
  const screens: Screen[] = [collection(listId, d.title, ['client'], detailId), request, customerDetail,
    collection(staffListId, d.parent ? 'Назначенные обращения' : 'Назначенные мне', ['staff'], staffDetailId),
    { id: staffDetailId, appId: app.id, position: 'a', name: 'Рабочая карточка', type: 'detail', tableId, tab: null, access: access(['staff', 'manager']), components: [...componentFields(workerShown).map(component => ({ ...component, roles: ['staff'] })), ...componentFields(fields.map(field => field.id).filter(id => id !== f.cart && id !== f.submissionId)).map(component => ({ ...component, roles: ['manager'] })), button('Изменить', workerEditId, ['staff']), button('Изменить', adminEditId, ['manager'])] },
    collection(id(), d.parent ? 'Обращения клиентов' : 'Все обращения', ['manager'], staffDetailId),
    form(workerEditId, 'Работа с обращением', 'edit', fieldKeys(d.workerFields), ['staff']),
    form(adminEditId, 'Управление обращением', 'edit', managerFields, ['manager']),
    form(adminCreateId, 'Добавить обращение', 'create', managerFields, ['manager']),
  ]
  const dashboard = app.screens.find(screen => screen.type === 'dashboard')
  if (dashboard?.type === 'dashboard') screens.push({ ...dashboard, name: 'Сводка', access: access(['manager']), blocks: dashboard.blocks.filter(block => block.type !== 'actions').map(block => block.type === 'list' ? { ...block, onTapScreenId: staffDetailId, moreScreenId: staffListId } : block.type === 'pipeline' ? { ...block, onTapScreenId: null } : block) })
  const rowAccessRules: App['rowAccessRules'] = [{ tableId, fieldId: config.emailFieldId, match: 'email', appliesTo: ['client'] },
    ...(config.assignmentFieldId ? [{ tableId, fieldId: config.assignmentFieldId, match: 'email' as const, appliesTo: ['staff'] }] : [])]
  if (d.catalog) {
    const c = d.catalog, table = built.tables[Object.keys(fieldIds).indexOf(c.table)]!
    const cf = fieldIds[c.table]!, viewId = viewIds[c.table]![c.view]!
    const publicFields = c.fields.map(key => cf[key]!).filter(Boolean)
    const catalogListId = id(), catalogCardId = id()
    config.catalog = { tableId: table.id, viewId, detailScreenId: catalogCardId, titleFieldId: table.primaryFieldId!, activeFieldId: cf[c.active]!, selectionFieldId: c.selection ? f[c.selection]! : null }
    screens.push({ id: catalogListId, appId: app.id, position: 'a', type: 'tiles', columns: 2, name: c.title, tab: { icon: 'grid', label: c.title }, access: access(['client', 'staff', 'manager'], publicFields, true), source: { viewId, extraFilter: null, searchFieldIds: [table.primaryFieldId!] }, titleFieldId: table.primaryFieldId, subtitleFieldId: cf.descr ?? cf.description ?? cf.summary ?? null, imageFieldId: cf.photo ?? null, metaFieldId: cf.price ?? null, statusFieldId: null, onTapScreenId: catalogCardId, components: [] },
      { id: catalogCardId, appId: app.id, position: 'a', type: 'detail', name: 'Описание', tableId: table.id, tab: null, access: access(['client', 'staff', 'manager'], publicFields, true), components: [...componentFields(publicFields.filter(id => id !== table.primaryFieldId)), ...(d.cart ? [] : [button(d.table === 'orders' ? 'Оставить заявку' : d.submitLabel, formId)])] })
    if (d.cart) {
      const cart = d.cart, items = fieldIds[cart.items]!, itemsTable = built.tables[Object.keys(fieldIds).indexOf(cart.items)]!
      config.cart = { fieldId: f[cart.field]!, priceFieldId: cf[cart.price]!, itemsTableId: itemsTable.id, nameFieldId: items[cart.name]!, quantityFieldId: items[cart.qty]!, itemPriceFieldId: items[cart.itemPrice]!, itemEmailFieldId: items[cart.itemEmail]!, itemAssignmentFieldId: items.assignedEmail!, positionsFieldId: f[cart.positions]!, ...(items.product ? { productFieldId: items.product } : {}) }
      if (items.product) config.stock = { confirmedStatus: choice('Собирается'), returnedStatus: choice('Возвращён') }
      rowAccessRules.push({ tableId: itemsTable.id, fieldId: config.cart.itemEmailFieldId, match: 'email', appliesTo: ['client'] }, { tableId: itemsTable.id, fieldId: config.cart.itemAssignmentFieldId, match: 'email', appliesTo: ['staff'] })
      const itemApp = generateApp({ appId: app.id, workspaceId: app.workspaceId, name: itemsTable.name, slug: app.slug, table: itemsTable, fields: built.fields.filter(field => field.tableId === itemsTable.id) as Field[], view: built.views.find(view => view.tableId === itemsTable.id)! as unknown as View })
      const itemDetail = itemApp.screens.find(s => s.type === 'detail')!
      const relatedComponent = customerDetail.components.find(component => component.type === 'related_list')
      if (relatedComponent?.type === 'related_list') relatedComponent.onTapScreenId = itemDetail.id
      const staffDetail = screens.find(screen => screen.id === staffDetailId)
      if (staffDetail?.type === 'detail' && relatedComponent?.type === 'related_list') {
        staffDetail.components = staffDetail.components.filter(component => component.type !== 'field' || component.fieldId !== config.cart!.positionsFieldId)
        staffDetail.components.splice(staffDetail.components.findIndex(component => component.type === 'button'), 0,
          { ...relatedComponent, id: newId('component'), roles: ['staff', 'manager'] })
      }
      if (itemDetail.type === 'detail') screens.push({ ...itemDetail, access: access(['client', 'staff', 'manager']), components: [...componentFields([items[cart.name]!, items[cart.qty]!, items[cart.itemPrice]!]), ...(items.product ? componentFields([items.product]).map(component => ({ ...component, roles: ['manager'] })) : [])] })
    }
  }
  return appSchema.parse({ ...app, accessMode: 'public', roles: [{ id: 'client', name: 'Клиент', isDefault: true }, { id: 'staff', name: d.workerName, isDefault: false }, { id: 'manager', name: d.managerName, isDefault: false }], rowAccessRules, homeScreenId: listId, customer: config, screens: screens.map((screen, i) => ({ ...screen, position: positionSequence(screens.length)[i]!, ...('components' in screen ? { components: screen.components.map((component, n) => ({ ...component, position: positionSequence(screen.components.length)[n]! })) } : {}) })) })
}
