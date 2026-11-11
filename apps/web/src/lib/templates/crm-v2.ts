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

/** Builds deals board, unified client/deal cards, and append-only contact history on App V2. */
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
  const contactsTableId = built.fields.find(item => item.id === field('contacts', 'summary'))!.tableId
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
  const contactSummary = field('contacts', 'summary')
  const contactDeal = field('contacts', 'deal')
  const contactClient = field('contacts', 'client')
  const contactLoggedAt = field('contacts', 'loggedAt')
  const contactNextDue = field('contacts', 'nextDue')
  const initialStage = choice('deals', 'stage', customer.definition.initial)
  const terminalStages = customer.definition.terminal.map(name => choice('deals', 'stage', name))
  const owned = (fieldId: string) => ({ kind: 'owned' as const, fieldId, property: 'email' as const })
  const grant = (audience: AppV2Audience, permission: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...permission })
  const node = (id: string, name: string, fieldId: string) => ({ id, name, type: 'field' as const, label: name, visibleTo: null, visibleWhen: null, value: { kind: 'row' as const, fieldId } })
  const input = (fieldId: string, name: string, required: boolean, initialValue: null | { kind: 'literal'; value: string } = null) => ({
    id: newId('component'), name, type: 'input' as const, fieldId, label: name, required, visibleTo: null, visibleWhen: null, initialValue,
  })

  const boardScreenId = newId('screen'), dealScreenId = newId('screen'), clientsScreenId = newId('screen'), clientScreenId = newId('screen'), calendarScreenId = newId('screen')
  const createDealScreenId = newId('screen'), createClientScreenId = newId('screen')
  const boardNode = newId('component'), calendarNode = newId('component'), clientsNode = newId('component'), relatedDealsNode = newId('component')
  const dealContactsNode = newId('component'), clientContactsNode = newId('component')
  const createDealFormId = newId('component'), createClientFormId = newId('component'), contactFormId = newId('component'), dealEditFormId = newId('component'), clientEditFormId = newId('component')
  const boardSource = newId('component'), calendarSource = newId('component'), clientsSource = newId('component'), relatedSource = newId('component')
  const dealContactsSource = newId('component'), clientContactsSource = newId('component')
  const openDeal = newId('action'), openClient = newId('action'), openRelatedDeal = newId('action')
  const openCreateDeal = newId('action'), openCreateClient = newId('action')
  const createDeal = newId('action'), createClient = newId('action'), saveContact = newId('action'), saveDealEdit = newId('action'), saveClientEdit = newId('action')
  const createDealStep = newId('action'), createClientStep = newId('action'), logContactStep = newId('action')
  const newDealButton = newId('component'), newClientButton = newId('component')

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
  // Journal: communication event + next due. Stage/sum live in the pencil edit form (no duplication).
  const contactInputs = [
    input(note, 'Новая запись', true, { kind: 'literal', value: '' }),
    input(due, 'Вернуться к разговору', true),
  ]
  const dealEditInputs = [
    input(stage, 'Этап', true),
    input(due, 'Вернуться к разговору', false),
    input(sum, 'Сумма', false),
  ]
  const clientEditInputs = [
    input(field('clients', 'name'), 'Клиент', true),
    input(field('clients', 'contact'), 'Контактное лицо', false),
    input(field('clients', 'phone'), 'Телефон', false),
    input(field('clients', 'email'), 'Почта', false),
    input(field('clients', 'city'), 'Город', false),
    input(field('clients', 'note'), 'Заметки', false),
  ]
  // Stage/sum/due feed Identity; client + assignee stay as facts.
  const dealIdentityFieldIds = [stage, sum, due]
  const dealFieldIds = [clientRelation, assignment]
  const clientFieldIds = ['contact', 'phone', 'email', 'city', 'note'].map(key => field('clients', key))

  const crm: NonNullable<AppV2['crm']> = {
    dealsTableId, clientsTableId, contactsTableId,
    boardScreenId, dealScreenId, clientsScreenId, clientScreenId, calendarScreenId,
    createDealScreenId, createClientScreenId,
    createDealFormId, createClientFormId, contactFormId, dealEditFormId, clientEditFormId,
    titleFieldId: title, stageFieldId: stage, dueFieldId: due, noteFieldId: note, sumFieldId: sum,
    clientRelationFieldId: clientRelation, assignmentFieldId: assignment, clientNameFieldId: clientName,
    clientTitleFieldId: field('clients', 'name'), clientPhoneFieldId: field('clients', 'phone'),
    clientEmailFieldId: field('clients', 'email'), clientNoteFieldId: field('clients', 'note'),
    contactSummaryFieldId: contactSummary, contactLoggedAtFieldId: contactLoggedAt,
    contactDealFieldId: contactDeal, contactClientFieldId: contactClient, contactNextDueFieldId: contactNextDue,
    initialStage, terminalStages,
  }

  const dealCreateFields = createDealInputs.map(item => item.fieldId)
  const clientCreateFields = createClientInputs.map(item => item.fieldId)
  const contactUpdateFields = [due, note]
  const dealEditFields = [stage, due, sum]
  const clientEditFields = clientEditInputs.map(item => item.fieldId)
  const contactCreateFields = [contactSummary, contactDeal, contactClient, contactLoggedAt, contactNextDue]
  const staffDealRead = columns(dealsTableId).map(item => item.id)
  const staffDealUpdate = [stage, due, note, sum, title, clientRelation]
  const ownerDealUpdate = editable(dealsTableId).filter(id => id !== field('deals', 'phone') && id !== clientName)

  const app: AppV2 = {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    appearance: { navigation: 'tabs', icon: 'deal', density: 'regular', corners: 'rounded' },
    theme: { accent: 'green', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Владелец' }, { id: 'staff', name: 'Сотрудник' }],
    authentication: { mode: 'invite_only', defaultRoleId: null, members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: boardScreenId,
    screens: [
      { id: boardScreenId, name: 'Сделки', menuLabel: 'Воронка', icon: 'deal', navigation: true, audience: team, contextTableId: null, rootIds: [newDealButton, boardNode], events: { enter: null } },
      { id: calendarScreenId, name: 'Календарь', icon: 'calendar', navigation: true, audience: team, contextTableId: null, rootIds: [calendarNode], events: { enter: null } },
      { id: clientsScreenId, name: 'Клиенты', icon: 'users', navigation: true, audience: team, contextTableId: null, rootIds: [newClientButton, clientsNode], events: { enter: null } },
      { id: createDealScreenId, name: 'Новая сделка', icon: 'deal', navigation: false, audience: team, contextTableId: null, rootIds: [createDealFormId], events: { enter: null } },
      { id: createClientScreenId, name: 'Новый клиент', icon: 'users', navigation: false, audience: team, contextTableId: null, rootIds: [createClientFormId], events: { enter: null } },
      { id: dealScreenId, name: 'Сделка', icon: 'deal', navigation: false, audience: team, contextTableId: dealsTableId, recordTitleFieldId: title, rootIds: [...dealIdentityFieldIds.map(id => `deal_${id}`), ...dealFieldIds.map(id => `deal_${id}`), dealContactsNode, contactFormId, dealEditFormId], events: { enter: null } },
      { id: clientScreenId, name: 'Клиент', icon: 'users', navigation: false, audience: team, contextTableId: clientsTableId, recordTitleFieldId: crm.clientTitleFieldId, rootIds: [...clientFieldIds.map(id => `client_${id}`), relatedDealsNode, clientContactsNode, clientEditFormId], events: { enter: null } },
    ],
    nodes: [
      { id: newDealButton, name: 'Новая сделка', type: 'button', label: 'Новая сделка', variant: 'primary', visibleTo: team, visibleWhen: null, events: { press: openCreateDeal } },
      { id: boardNode, name: 'Воронка сделок', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: boardSource, layout: 'kanban', groupFieldId: stage, kanbanMoveRoleIds: ['owner', 'staff'], titleFieldId: title, subtitleFieldId: clientName, cardDetailFieldId: due, itemIds: [], events: { itemPress: openDeal } },
      { id: calendarNode, name: 'Когда вернуться', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: calendarSource, layout: 'calendar', dateFieldId: due, titleFieldId: title, subtitleFieldId: clientName, itemIds: [], events: { itemPress: openDeal } },
      { id: newClientButton, name: 'Новый клиент', type: 'button', label: 'Новый клиент', variant: 'primary', visibleTo: team, visibleWhen: null, events: { press: openCreateClient } },
      { id: createDealFormId, name: 'Создать сделку', type: 'form', visibleTo: team, visibleWhen: null, tableId: dealsTableId, mode: 'create', childIds: createDealInputs.map(item => item.id), events: { submit: createDeal }, submitLabel: 'Создать сделку' },
      ...createDealInputs,
      { id: createClientFormId, name: 'Создать клиента', type: 'form', visibleTo: team, visibleWhen: null, tableId: clientsTableId, mode: 'create', childIds: createClientInputs.map(item => item.id), events: { submit: createClient }, submitLabel: 'Сохранить клиента' },
      ...createClientInputs,
      { id: clientsNode, name: 'Клиенты', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: clientsSource, layout: 'list', titleFieldId: crm.clientTitleFieldId, subtitleFieldId: crm.clientPhoneFieldId, itemIds: [], events: { itemPress: openClient } },
      ...[...dealIdentityFieldIds, ...dealFieldIds].map(fieldId => node(`deal_${fieldId}`, columns(dealsTableId).find(item => item.id === fieldId)!.name, fieldId)),
      { id: dealContactsNode, name: 'История общения', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: dealContactsSource, layout: 'timeline', dateFieldId: contactLoggedAt, titleFieldId: contactSummary, subtitleFieldId: null, cardDetailFieldId: contactNextDue, itemIds: [], events: { itemPress: null } },
      { id: contactFormId, name: 'Добавить запись', type: 'form', visibleTo: team, visibleWhen: null, tableId: dealsTableId, mode: 'edit', childIds: contactInputs.map(item => item.id), events: { submit: saveContact }, submitLabel: 'Сохранить запись' },
      ...contactInputs,
      { id: dealEditFormId, name: 'Изменить сделку', type: 'form', visibleTo: team, visibleWhen: null, tableId: dealsTableId, mode: 'edit', childIds: dealEditInputs.map(item => item.id), events: { submit: saveDealEdit }, submitLabel: 'Сохранить' },
      { id: clientEditFormId, name: 'Изменить клиента', type: 'form', visibleTo: team, visibleWhen: null, tableId: clientsTableId, mode: 'edit', childIds: clientEditInputs.map(item => item.id), events: { submit: saveClientEdit }, submitLabel: 'Сохранить' },
      ...clientEditInputs,
      ...dealEditInputs,
      ...clientFieldIds.map(fieldId => node(`client_${fieldId}`, columns(clientsTableId).find(item => item.id === fieldId)!.name, fieldId)),
      { id: relatedDealsNode, name: 'Сделки', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: relatedSource, layout: 'list', titleFieldId: title, subtitleFieldId: stage, cardDetailFieldId: due, itemIds: [], events: { itemPress: openRelatedDeal } },
      { id: clientContactsNode, name: 'История общения', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: clientContactsSource, layout: 'timeline', dateFieldId: contactLoggedAt, titleFieldId: contactSummary, subtitleFieldId: null, cardDetailFieldId: contactNextDue, itemIds: [], events: { itemPress: null } },
    ],
    sources: [
      { id: boardSource, tableId: dealsTableId, viewId: null, filter: null, sorts: [{ fieldId: due, direction: 'asc' }], searchFieldIds: [title, clientName], pageSize: 50 },
      { id: calendarSource, tableId: dealsTableId, viewId: null, filter: null, sorts: [{ fieldId: due, direction: 'asc' }], searchFieldIds: [title], pageSize: 50 },
      { id: clientsSource, tableId: clientsTableId, viewId: null, filter: null, sorts: [], searchFieldIds: [crm.clientTitleFieldId, crm.clientPhoneFieldId, crm.clientEmailFieldId], pageSize: 30 },
      { id: relatedSource, tableId: dealsTableId, screenTableId: clientsTableId, viewId: null, filter: { op: 'includes', left: { kind: 'row', fieldId: clientRelation }, right: { kind: 'screen_row_id' } }, sorts: [{ fieldId: due, direction: 'desc' }], searchFieldIds: [], pageSize: 30 },
      { id: dealContactsSource, tableId: contactsTableId, screenTableId: dealsTableId, viewId: null, filter: { op: 'includes', left: { kind: 'row', fieldId: contactDeal }, right: { kind: 'screen_row_id' } }, sorts: [{ fieldId: contactLoggedAt, direction: 'desc' }], searchFieldIds: [], pageSize: 30 },
      { id: clientContactsSource, tableId: contactsTableId, screenTableId: clientsTableId, viewId: null, filter: { op: 'includes', left: { kind: 'row', fieldId: contactClient }, right: { kind: 'screen_row_id' } }, sorts: [{ fieldId: contactLoggedAt, direction: 'desc' }], searchFieldIds: [], pageSize: 30 },
    ],
    workflows: [
      { id: openDeal, name: 'Открыть сделку', input: { rowTableId: dealsTableId, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: dealScreenId, record: { kind: 'current' } }] },
      { id: openRelatedDeal, name: 'Открыть сделку клиента', input: { rowTableId: dealsTableId, formId: null, screenTableId: clientsTableId }, steps: [{ id: newId('action'), type: 'open_screen', screenId: dealScreenId, record: { kind: 'current' } }] },
      { id: openClient, name: 'Открыть клиента', input: { rowTableId: clientsTableId, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: clientScreenId, record: { kind: 'current' } }] },
      { id: openCreateDeal, name: 'Новая сделка', input: { rowTableId: null, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: createDealScreenId, record: null }] },
      { id: openCreateClient, name: 'Новый клиент', input: { rowTableId: null, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: createClientScreenId, record: null }] },
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
      { id: saveContact, name: 'Добавить запись', input: { rowTableId: dealsTableId, formId: contactFormId, screenTableId: dealsTableId }, steps: [
        { id: newId('action'), type: 'update_row', tableId: dealsTableId, target: { kind: 'current' }, values: Object.fromEntries(contactUpdateFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: contactFormId, fieldId }])) },
        { id: logContactStep, type: 'create_row', tableId: contactsTableId, values: {
          [contactSummary]: { kind: 'form', formId: contactFormId, fieldId: note },
          [contactDeal]: { kind: 'record_ids', tableId: dealsTableId, record: { kind: 'row' } },
          [contactClient]: { kind: 'row', fieldId: clientRelation },
          [contactNextDue]: { kind: 'form', formId: contactFormId, fieldId: due },
        } },
        // Clear draft text so the next open starts a new entry (history already kept the line).
        { id: newId('action'), type: 'update_row', tableId: dealsTableId, target: { kind: 'current' }, values: { [note]: { kind: 'literal', value: '' } } },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Запись добавлена в историю общения.' } },
      ] },
      // Pencil edit: stage/due/sum only — no history append, no assignee override.
      { id: saveDealEdit, name: 'Изменить сделку', input: { rowTableId: dealsTableId, formId: dealEditFormId, screenTableId: dealsTableId }, steps: [
        { id: newId('action'), type: 'update_row', tableId: dealsTableId, target: { kind: 'current' }, values: Object.fromEntries(dealEditFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: dealEditFormId, fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Сделка обновлена.' } },
      ] },
      { id: saveClientEdit, name: 'Изменить клиента', input: { rowTableId: clientsTableId, formId: clientEditFormId, screenTableId: clientsTableId }, steps: [
        { id: newId('action'), type: 'update_row', tableId: clientsTableId, target: { kind: 'current' }, values: Object.fromEntries(clientEditFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: clientEditFormId, fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Клиент обновлён.' } },
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
        { tableId: contactsTableId, grants: [
          grant(team, {
            read: { fieldIds: columns(contactsTableId).map(item => item.id), rows: { kind: 'all' } },
            create: { fieldIds: contactCreateFields },
          }),
        ] },
      ],
      workflows: [
        { workflowId: openDeal, audience: team },
        { workflowId: openRelatedDeal, audience: team },
        { workflowId: openClient, audience: team },
        { workflowId: openCreateDeal, audience: team },
        { workflowId: openCreateClient, audience: team },
        { workflowId: createDeal, audience: team },
        { workflowId: createClient, audience: team },
        { workflowId: saveContact, audience: team },
        { workflowId: saveDealEdit, audience: team },
        { workflowId: saveClientEdit, audience: team },
      ],
    },
    crm,
  }
  return app
}
