import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Grant } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'

const writable = new Set(['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment'])
const roles = { kind: 'roles' as const }
const team: AppV2Audience = { ...roles, roleIds: ['owner', 'staff'] }

/** Internal CRM starter installs as editable builder v2, same kit as the shop. */
export function isCrmTemplate(templateId: string) {
  return templateId === 'crm'
}

/** Builds deals board, client cards with related history, and contact logging on App V2. */
export function buildCrmV2App(built: BuiltTemplate, meta: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const customer = built.customer
  if (!customer || customer.definition.table !== 'deals' || !customer.definition.status) throw new Error('Шаблон CRM не содержит сделки')
  const ids = customer.fieldIds
  const field = (table: string, key: string) => {
    const id = ids[table]?.[key]
    if (!id) throw new Error(`В CRM нет поля ${table}.${key}`)
    return id
  }
  const choice = (table: string, key: string, name: string) => {
    const column = built.fields.find(item => item.id === field(table, key))
    const match = (column?.options as { choices?: { id: string; name: string }[] } | undefined)?.choices?.find(item => item.name === name)
    if (!match) throw new Error(`В CRM нет этапа «${name}»`)
    return match.id
  }
  const dealsTableId = customer.tableId
  const clientsTableId = built.fields.find(item => item.id === field('clients', 'name'))!.tableId
  const columns = (tableId: string) => built.fields.filter(item => item.tableId === tableId)
  const editable = (tableId: string) => columns(tableId).filter(item => writable.has(item.type)).map(item => item.id)
  const stage = field('deals', 'stage')
  const due = field('deals', 'due')
  const note = field('deals', 'note')
  const title = field('deals', 'what')
  const clientRelation = field('deals', 'client')
  const assignment = field('deals', customer.definition.assignment ?? 'assignedEmail')
  const sum = field('deals', 'sum')
  const clientName = field('deals', 'clientName')
  const initialStage = choice('deals', 'stage', customer.definition.initial)
  const owned = (fieldId: string) => ({ kind: 'owned' as const, fieldId, property: 'email' as const })
  const grant = (audience: AppV2Audience, permission: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...permission })
  const node = (id: string, name: string, fieldId: string) => ({ id, name, type: 'field' as const, label: name, visibleTo: null, visibleWhen: null, value: { kind: 'row' as const, fieldId } })
  const input = (fieldId: string, name: string, required: boolean, initialValue: null | { kind: 'literal'; value: string } = null) => ({
    id: newId('component'), name, type: 'input' as const, fieldId, label: name, required, visibleTo: null, visibleWhen: null, initialValue,
  })

  const boardScreenId = newId('screen'), dealScreenId = newId('screen'), clientsScreenId = newId('screen'), clientScreenId = newId('screen'), calendarScreenId = newId('screen')
  const boardNode = newId('component'), calendarNode = newId('component'), clientsNode = newId('component'), relatedDealsNode = newId('component')
  const createDealFormId = newId('component'), createClientFormId = newId('component'), contactFormId = newId('component')
  const boardSource = newId('component'), calendarSource = newId('component'), clientsSource = newId('component'), relatedSource = newId('component')
  const openDeal = newId('action'), openClient = newId('action'), openRelatedDeal = newId('action')
  const createDeal = newId('action'), createClient = newId('action'), saveContact = newId('action')
  const createDealStep = newId('action'), createClientStep = newId('action')

  const createDealInputs = [
    input(title, 'О чём сделка', true),
    input(clientRelation, 'Клиент', true),
    input(stage, 'Этап', true, { kind: 'literal', value: initialStage }),
    input(sum, 'Сумма', false),
    input(due, 'Вернуться к разговору', false),
    input(note, 'Что обсудили', false),
  ]
  const createClientInputs = [
    input(field('clients', 'name'), 'Клиент', true),
    input(field('clients', 'contact'), 'Контактное лицо', false),
    input(field('clients', 'phone'), 'Телефон', false),
    input(field('clients', 'email'), 'Почта', false),
    input(field('clients', 'city'), 'Город', false),
    input(field('clients', 'note'), 'Заметки', false),
  ]
  const contactInputs = [
    input(stage, 'Этап', true),
    input(due, 'Вернуться к разговору', true),
    input(note, 'Что обсудили', true),
    input(sum, 'Сумма', false),
  ]
  const dealFieldIds = [title, clientRelation, clientName, stage, sum, due, note, assignment]
  const clientFieldIds = ['name', 'contact', 'phone', 'email', 'city', 'note'].map(key => field('clients', key))
  const relatedHeading = newId('component'), contactHeading = newId('component'), createDealHeading = newId('component'), createClientHeading = newId('component')

  const crm: NonNullable<AppV2['crm']> = {
    dealsTableId, clientsTableId,
    boardScreenId, dealScreenId, clientsScreenId, clientScreenId, calendarScreenId,
    createDealFormId, createClientFormId, contactFormId,
    titleFieldId: title, stageFieldId: stage, dueFieldId: due, noteFieldId: note, sumFieldId: sum,
    clientRelationFieldId: clientRelation, assignmentFieldId: assignment, clientNameFieldId: clientName,
    clientTitleFieldId: field('clients', 'name'), clientPhoneFieldId: field('clients', 'phone'),
    clientEmailFieldId: field('clients', 'email'), clientNoteFieldId: field('clients', 'note'),
    initialStage,
  }

  const dealCreateFields = createDealInputs.map(item => item.fieldId)
  const clientCreateFields = createClientInputs.map(item => item.fieldId)
  const contactUpdateFields = contactInputs.map(item => item.fieldId)
  const staffDealRead = columns(dealsTableId).map(item => item.id)
  const staffDealUpdate = [stage, due, note, sum, title, clientRelation]
  const ownerDealUpdate = editable(dealsTableId).filter(id => id !== field('deals', 'phone') && id !== clientName)

  const app: AppV2 = {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    appearance: { navigation: 'bottom', icon: 'deal', density: 'regular', corners: 'rounded' },
    theme: { accent: 'green', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Владелец' }, { id: 'staff', name: 'Сотрудник' }],
    authentication: { mode: 'invite_only', defaultRoleId: null, members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: boardScreenId,
    screens: [
      { id: boardScreenId, name: 'Сделки', menuLabel: 'Воронка', icon: 'deal', navigation: true, audience: team, contextTableId: null, rootIds: [createDealHeading, createDealFormId, boardNode], events: { enter: null } },
      { id: calendarScreenId, name: 'Календарь', icon: 'calendar', navigation: true, audience: team, contextTableId: null, rootIds: [calendarNode], events: { enter: null } },
      { id: clientsScreenId, name: 'Клиенты', icon: 'users', navigation: true, audience: team, contextTableId: null, rootIds: [createClientHeading, createClientFormId, clientsNode], events: { enter: null } },
      { id: dealScreenId, name: 'Сделка', icon: 'deal', navigation: false, audience: team, contextTableId: dealsTableId, recordTitleFieldId: title, rootIds: [...dealFieldIds.map(id => `deal_${id}`), contactHeading, contactFormId], events: { enter: null } },
      { id: clientScreenId, name: 'Клиент', icon: 'users', navigation: false, audience: team, contextTableId: clientsTableId, recordTitleFieldId: crm.clientTitleFieldId, rootIds: [...clientFieldIds.map(id => `client_${id}`), relatedHeading, relatedDealsNode], events: { enter: null } },
    ],
    nodes: [
      { id: createDealHeading, name: 'Новая сделка', type: 'heading', size: 'm', visibleTo: null, visibleWhen: null, value: { kind: 'literal', value: 'Новая сделка' } },
      { id: createDealFormId, name: 'Создать сделку', type: 'form', visibleTo: team, visibleWhen: null, tableId: dealsTableId, mode: 'create', childIds: createDealInputs.map(item => item.id), events: { submit: createDeal }, submitLabel: 'Создать сделку' },
      ...createDealInputs,
      { id: boardNode, name: 'Воронка сделок', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: boardSource, layout: 'kanban', groupFieldId: stage, kanbanMoveRoleIds: ['owner', 'staff'], titleFieldId: title, subtitleFieldId: clientName, cardDetailFieldId: due, itemIds: [], events: { itemPress: openDeal } },
      { id: calendarNode, name: 'Когда вернуться', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: calendarSource, layout: 'calendar', dateFieldId: due, titleFieldId: title, subtitleFieldId: clientName, itemIds: [], events: { itemPress: openDeal } },
      { id: createClientHeading, name: 'Новый клиент', type: 'heading', size: 'm', visibleTo: null, visibleWhen: null, value: { kind: 'literal', value: 'Новый клиент' } },
      { id: createClientFormId, name: 'Создать клиента', type: 'form', visibleTo: team, visibleWhen: null, tableId: clientsTableId, mode: 'create', childIds: createClientInputs.map(item => item.id), events: { submit: createClient }, submitLabel: 'Сохранить клиента' },
      ...createClientInputs,
      { id: clientsNode, name: 'Клиенты', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: clientsSource, layout: 'list', titleFieldId: crm.clientTitleFieldId, subtitleFieldId: crm.clientPhoneFieldId, itemIds: [], events: { itemPress: openClient } },
      ...dealFieldIds.map(fieldId => node(`deal_${fieldId}`, columns(dealsTableId).find(item => item.id === fieldId)!.name, fieldId)),
      { id: contactHeading, name: 'Контакт и следующее действие', type: 'heading', size: 's', visibleTo: null, visibleWhen: null, value: { kind: 'literal', value: 'Записать контакт' } },
      { id: contactFormId, name: 'Записать контакт', type: 'form', visibleTo: team, visibleWhen: null, tableId: dealsTableId, mode: 'edit', childIds: contactInputs.map(item => item.id), events: { submit: saveContact }, submitLabel: 'Сохранить контакт' },
      ...contactInputs,
      ...clientFieldIds.map(fieldId => node(`client_${fieldId}`, columns(clientsTableId).find(item => item.id === fieldId)!.name, fieldId)),
      { id: relatedHeading, name: 'История сделок и контактов', type: 'heading', size: 's', visibleTo: null, visibleWhen: null, value: { kind: 'literal', value: 'Сделки и контакты клиента' } },
      { id: relatedDealsNode, name: 'Сделки клиента', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: relatedSource, layout: 'list', titleFieldId: title, subtitleFieldId: stage, cardDetailFieldId: due, itemIds: [], events: { itemPress: openRelatedDeal } },
    ],
    sources: [
      { id: boardSource, tableId: dealsTableId, viewId: null, filter: null, sorts: [{ fieldId: due, direction: 'asc' }], searchFieldIds: [title, clientName], pageSize: 50 },
      { id: calendarSource, tableId: dealsTableId, viewId: null, filter: null, sorts: [{ fieldId: due, direction: 'asc' }], searchFieldIds: [title], pageSize: 50 },
      { id: clientsSource, tableId: clientsTableId, viewId: null, filter: null, sorts: [], searchFieldIds: [crm.clientTitleFieldId, crm.clientPhoneFieldId, crm.clientEmailFieldId], pageSize: 30 },
      { id: relatedSource, tableId: dealsTableId, screenTableId: clientsTableId, viewId: null, filter: { op: 'includes', left: { kind: 'row', fieldId: clientRelation }, right: { kind: 'screen_row_id' } }, sorts: [{ fieldId: due, direction: 'desc' }], searchFieldIds: [title], pageSize: 30 },
    ],
    workflows: [
      { id: openDeal, name: 'Открыть сделку', input: { rowTableId: dealsTableId, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: dealScreenId, record: { kind: 'current' } }] },
      { id: openRelatedDeal, name: 'Открыть сделку клиента', input: { rowTableId: dealsTableId, formId: null, screenTableId: clientsTableId }, steps: [{ id: newId('action'), type: 'open_screen', screenId: dealScreenId, record: { kind: 'current' } }] },
      { id: openClient, name: 'Открыть клиента', input: { rowTableId: clientsTableId, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: clientScreenId, record: { kind: 'current' } }] },
      { id: createDeal, name: 'Создать сделку', input: { rowTableId: null, formId: createDealFormId, screenTableId: null }, steps: [
        { id: createDealStep, type: 'create_row', tableId: dealsTableId, values: Object.fromEntries(dealCreateFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: createDealFormId, fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Сделка создана и назначена вам.' } },
        { id: newId('action'), type: 'open_screen', screenId: dealScreenId, record: { kind: 'result', stepId: createDealStep } },
      ] },
      { id: createClient, name: 'Создать клиента', input: { rowTableId: null, formId: createClientFormId, screenTableId: null }, steps: [
        { id: createClientStep, type: 'create_row', tableId: clientsTableId, values: Object.fromEntries(clientCreateFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: createClientFormId, fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Клиент сохранён.' } },
        { id: newId('action'), type: 'open_screen', screenId: clientScreenId, record: { kind: 'result', stepId: createClientStep } },
      ] },
      { id: saveContact, name: 'Записать контакт', input: { rowTableId: dealsTableId, formId: contactFormId, screenTableId: dealsTableId }, steps: [
        { id: newId('action'), type: 'update_row', tableId: dealsTableId, target: { kind: 'current' }, values: Object.fromEntries(contactUpdateFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: contactFormId, fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Контакт и следующее действие сохранены.' } },
      ] },
    ],
    policy: {
      tables: [
        { tableId: dealsTableId, grants: [
          grant({ ...roles, roleIds: ['owner'] }, {
            read: { fieldIds: columns(dealsTableId).map(item => item.id), rows: { kind: 'all' } },
            create: { fieldIds: dealCreateFields, owner: { fieldId: assignment, property: 'email' } },
            update: { fieldIds: ownerDealUpdate, rows: { kind: 'all' } },
          }),
          grant({ ...roles, roleIds: ['staff'] }, {
            read: { fieldIds: staffDealRead, rows: owned(assignment) },
            create: { fieldIds: dealCreateFields, owner: { fieldId: assignment, property: 'email' } },
            update: { fieldIds: staffDealUpdate, rows: owned(assignment) },
          }),
        ] },
        { tableId: clientsTableId, grants: [
          grant(team, {
            read: { fieldIds: columns(clientsTableId).map(item => item.id), rows: { kind: 'all' } },
            create: { fieldIds: clientCreateFields },
            update: { fieldIds: editable(clientsTableId), rows: { kind: 'all' } },
          }),
        ] },
      ],
      workflows: [
        { workflowId: openDeal, audience: team },
        { workflowId: openRelatedDeal, audience: team },
        { workflowId: openClient, audience: team },
        { workflowId: createDeal, audience: team },
        { workflowId: createClient, audience: team },
        { workflowId: saveContact, audience: team },
      ],
    },
    crm,
  }
  return app
}
