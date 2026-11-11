import { newId } from '@tableapp/schema'
import type { AppV2, AppV2Audience, AppV2Binding, AppV2Grant, AppV2InventoryOperation } from '@tableapp/schema/app-v2'
import type { BuiltTemplate } from './build'
import { INVENTORY_V2_COPY } from '../inventory-stock'

const writable = new Set(['text', 'long_text', 'number', 'email', 'phone', 'url', 'date', 'datetime', 'checkbox', 'single_select', 'multi_select', 'relation', 'image', 'attachment'])
const roles = { kind: 'roles' as const }
const team: AppV2Audience = { ...roles, roleIds: ['owner', 'staff'] }
const owners: AppV2Audience = { ...roles, roleIds: ['owner'] }

/** Warehouse starter installs as editable builder v2, same kit as shop/CRM. */
export function isInventoryTemplate(templateId: string) {
  return templateId === 'sklad'
}

/** Builds product list/card, movement journal, and stock operation forms on App V2. */
export function buildInventoryV2App(built: BuiltTemplate, meta: { id: string; workspaceId: string; name: string; slug: string; email: string }): AppV2 {
  const inventory = built.inventory
  if (!inventory) throw new Error('Шаблон склада не содержит учёт остатков')
  const itemsTableId = inventory.tables.items
  const movementsTableId = inventory.tables.movements
  const warehousesTableId = built.tables.find(table => table.name === 'Склады')?.id
  if (!warehousesTableId) throw new Error('В складе нет таблицы складов')

  const fieldByName = (tableId: string, name: string) => {
    const found = built.fields.find(field => field.tableId === tableId && field.name === name)
    if (!found) throw new Error(`В складе нет поля «${name}»`)
    return found.id
  }
  const choice = (tableId: string, fieldId: string, name: string) => {
    const column = built.fields.find(item => item.id === fieldId && item.tableId === tableId)
    const match = (column?.options as { choices?: { id: string; name: string }[] } | undefined)?.choices?.find(item => item.name === name)
    if (!match) throw new Error(`В складе нет вида «${name}»`)
    return match.id
  }

  const columns = (tableId: string) => built.fields.filter(item => item.tableId === tableId)
  const editable = (tableId: string) => columns(tableId).filter(item => writable.has(item.type)).map(item => item.id)
  const grant = (audience: AppV2Audience, permission: Omit<AppV2Grant, 'audience'>): AppV2Grant => ({ audience, ...permission })
  const node = (id: string, name: string, fieldId: string) => ({ id, name, type: 'field' as const, label: name, visibleTo: null, visibleWhen: null, value: { kind: 'row' as const, fieldId } })
  const input = (fieldId: string, name: string, required: boolean, initialValue: null | AppV2Binding = null) => ({
    id: newId('component'), name, type: 'input' as const, fieldId, label: name, required, visibleTo: null, visibleWhen: null, initialValue,
  })

  const itemName = inventory.item.name
  const itemSku = inventory.item.sku ?? fieldByName(itemsTableId, 'Артикул')
  const itemStock = inventory.item.stock
  const itemOpening = inventory.item.opening
  const itemMovements = inventory.item.movements
  const itemBarcode = fieldByName(itemsTableId, 'Штрихкод')
  const itemCategory = fieldByName(itemsTableId, 'Категория')
  const itemUnit = fieldByName(itemsTableId, 'Единица')
  const itemMin = fieldByName(itemsTableId, 'Минимальный остаток')
  const itemCost = fieldByName(itemsTableId, 'Цена')
  const itemWarehouse = fieldByName(itemsTableId, 'Склад')
  const itemLow = fieldByName(itemsTableId, 'Пора докупать')
  const itemPhoto = inventory.item.image

  const movementName = inventory.movement.name
  const movementItem = inventory.movement.item
  const movementQty = inventory.movement.qty
  const movementDate = inventory.movement.date
  const movementNote = inventory.movement.note
  const movementAuthor = inventory.movement.author
  const movementType = fieldByName(movementsTableId, 'Вид операции')
  const movementWarehouse = fieldByName(movementsTableId, 'Склад')
  const movementWarehouseTo = fieldByName(movementsTableId, 'Склад назначения')
  const movementBefore = fieldByName(movementsTableId, 'Остаток до')
  const movementAfter = fieldByName(movementsTableId, 'Остаток после')
  const warehouseName = fieldByName(warehousesTableId, 'Склад')

  const typeReceipt = choice(movementsTableId, movementType, 'Приход')
  const typeIssue = choice(movementsTableId, movementType, 'Расход')
  const typeWriteOff = choice(movementsTableId, movementType, 'Списание')
  const typeTransfer = choice(movementsTableId, movementType, 'Перемещение')

  const itemsScreenId = newId('screen'), itemScreenId = newId('screen'), movementsScreenId = newId('screen'), createItemScreenId = newId('screen')
  const itemsNode = newId('component'), movementsNode = newId('component'), historyNode = newId('component')
  const itemsSource = newId('component'), movementsSource = newId('component'), historySource = newId('component')
  const receiptFormId = newId('component'), issueFormId = newId('component'), writeOffFormId = newId('component'), transferFormId = newId('component')
  const itemEditFormId = newId('component'), createItemFormId = newId('component')
  const newItemButton = newId('component'), newOperationButton = newId('component')
  const openItem = newId('action'), openCreateItem = newId('action'), openItemsForOperation = newId('action')
  const saveReceipt = newId('action'), saveIssue = newId('action'), saveWriteOff = newId('action'), saveTransfer = newId('action')
  const saveItemEdit = newId('action'), createItem = newId('action')
  const receiptStep = newId('action'), issueStep = newId('action'), writeOffStep = newId('action'), transferStep = newId('action'), createItemStep = newId('action')

  const qtyInput = (label: string) => input(movementQty, label, true, { kind: 'literal', value: 1 })
  const dateInput = () => input(movementDate, 'Дата', true)
  const warehouseInput = (label: string) => input(movementWarehouse, label, true, { kind: 'screen_row', fieldId: itemWarehouse })
  const warehouseToInput = () => input(movementWarehouseTo, 'Куда', true)
  const receiptInputs = [qtyInput(INVENTORY_V2_COPY.receipt.quantity), warehouseInput('Склад'), dateInput(), input(movementNote, 'Комментарий', false)]
  const issueInputs = [qtyInput(INVENTORY_V2_COPY.issue.quantity), warehouseInput('Склад'), dateInput(), input(movementNote, 'Комментарий', false)]
  const writeOffInputs = [qtyInput(INVENTORY_V2_COPY.write_off.quantity), warehouseInput('Склад'), dateInput(), input(movementNote, 'Причина списания', true)]
  const transferInputs = [
    qtyInput(INVENTORY_V2_COPY.transfer.quantity),
    warehouseInput('Откуда'),
    warehouseToInput(),
    dateInput(),
    input(movementNote, 'Комментарий', false),
  ]
  const productFields = () => [
    input(itemName, 'Наименование', true),
    input(itemSku, 'Артикул', false),
    input(itemBarcode, 'Штрихкод', false),
    input(itemCategory, 'Категория', false),
    input(itemUnit, 'Единица', true),
    input(itemMin, 'Минимальный остаток', true),
    input(itemCost, 'Себестоимость, ₽', false),
    input(itemWarehouse, 'Склад', true),
    ...(itemPhoto ? [input(itemPhoto, 'Фото', false)] : []),
  ]
  const itemEditInputs = productFields()
  const createItemInputs = productFields()

  const identityFieldIds = [itemStock, itemLow, itemMin]
  const factFieldIds = [itemSku, itemBarcode, itemCategory, itemUnit, itemCost, itemWarehouse]

  const inventoryBlock: NonNullable<AppV2['inventory']> = {
    itemsTableId, movementsTableId, warehousesTableId,
    itemsScreenId, itemScreenId, movementsScreenId, createItemScreenId,
    receiptFormId, issueFormId, writeOffFormId, transferFormId, itemEditFormId, createItemFormId,
    itemNameFieldId: itemName, itemSkuFieldId: itemSku, itemBarcodeFieldId: itemBarcode,
    itemCategoryFieldId: itemCategory, itemUnitFieldId: itemUnit, itemMinFieldId: itemMin,
    itemCostFieldId: itemCost, itemWarehouseFieldId: itemWarehouse, itemStockFieldId: itemStock,
    itemLowFieldId: itemLow, itemMovementsFieldId: itemMovements, itemOpeningFieldId: itemOpening,
    movementNameFieldId: movementName, movementTypeFieldId: movementType, movementItemFieldId: movementItem,
    movementQtyFieldId: movementQty, movementWarehouseFieldId: movementWarehouse,
    movementWarehouseToFieldId: movementWarehouseTo, movementDateFieldId: movementDate,
    movementNoteFieldId: movementNote, movementAuthorFieldId: movementAuthor,
    movementBeforeFieldId: movementBefore, movementAfterFieldId: movementAfter,
    warehouseNameFieldId: warehouseName,
    typeReceipt, typeIssue, typeWriteOff, typeTransfer,
  }

  const movementFormValues = (formId: string, inputs: { fieldId: string }[]): Record<string, AppV2Binding> =>
    Object.fromEntries(inputs.map(item => [item.fieldId, { kind: 'form' as const, formId, fieldId: item.fieldId }]))

  const movementWorkflow = (id: string, name: string, formId: string, operation: AppV2InventoryOperation, stepId: string, inputs: { fieldId: string }[]) => ({
    id, name, input: { rowTableId: itemsTableId, formId, screenTableId: itemsTableId }, steps: [
      { id: stepId, type: 'record_inventory_movement' as const, operation, values: movementFormValues(formId, inputs) },
      { id: newId('action'), type: 'notify' as const, message: { kind: 'literal' as const, value: `${name} сохранено.` } },
    ],
  })

  const staffItemRead = columns(itemsTableId).map(item => item.id).filter(id => id !== itemCost && id !== fieldByName(itemsTableId, 'Стоимость остатка'))
  const ownerItemUpdate = editable(itemsTableId).filter(id => id !== itemMovements && id !== itemOpening)
  const itemCreateFields = createItemInputs.map(item => item.fieldId)
  const movementCreateFields = [movementName, movementType, movementItem, movementQty, movementWarehouse, movementWarehouseTo, movementDate, movementNote, movementAuthor, movementBefore, movementAfter]

  const app: AppV2 = {
    formatVersion: 2, id: meta.id, workspaceId: meta.workspaceId, name: meta.name, slug: meta.slug, purpose: 'business',
    appearance: { navigation: 'tabs', icon: 'box', density: 'regular', corners: 'rounded' },
    theme: { accent: 'green', scheme: 'light', logoKey: null, iconKey: null },
    roles: [{ id: 'owner', name: 'Владелец' }, { id: 'staff', name: 'Кладовщик' }],
    authentication: { mode: 'invite_only', defaultRoleId: null, members: [{ email: meta.email.trim().toLowerCase(), roleIds: ['owner'], company: '' }] },
    homeScreenId: itemsScreenId,
    screens: [
      { id: itemsScreenId, name: 'Товары', menuLabel: 'Товары', icon: 'box', navigation: true, audience: team, contextTableId: null, rootIds: [newItemButton, itemsNode], events: { enter: null } },
      { id: movementsScreenId, name: 'Движения', menuLabel: 'Движения', icon: 'truck', navigation: true, audience: team, contextTableId: null, rootIds: [newOperationButton, movementsNode], events: { enter: null } },
      { id: createItemScreenId, name: 'Новый товар', icon: 'box', navigation: false, audience: owners, contextTableId: null, rootIds: [createItemFormId], events: { enter: null } },
      { id: itemScreenId, name: 'Товар', icon: 'box', navigation: false, audience: team, contextTableId: itemsTableId, recordTitleFieldId: itemName, rootIds: [
        ...identityFieldIds.map(id => `item_${id}`),
        ...factFieldIds.map(id => `item_${id}`),
        historyNode, receiptFormId, issueFormId, writeOffFormId, transferFormId, itemEditFormId,
      ], events: { enter: null } },
    ],
    nodes: [
      { id: newItemButton, name: 'Новый товар', type: 'button', label: 'Новый товар', variant: 'primary', visibleTo: owners, visibleWhen: null, events: { press: openCreateItem } },
      { id: newOperationButton, name: 'Новая операция', type: 'button', label: 'Новая операция', variant: 'primary', visibleTo: team, visibleWhen: null, events: { press: openItemsForOperation } },
      { id: itemsNode, name: 'Товары', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: itemsSource, layout: 'list', titleFieldId: itemName, subtitleFieldId: itemSku, cardDetailFieldId: itemStock, itemIds: [], events: { itemPress: openItem } },
      { id: movementsNode, name: 'Движения', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: movementsSource, layout: 'list', titleFieldId: movementItem, subtitleFieldId: movementType, cardDetailFieldId: movementQty, itemIds: [], events: { itemPress: null } },
      ...[...identityFieldIds, ...factFieldIds].map(fieldId => {
        const column = columns(itemsTableId).find(item => item.id === fieldId)!
        const label = fieldId === itemCost ? 'Себестоимость, ₽' : column.name
        return node(`item_${fieldId}`, label, fieldId)
      }),
      { id: historyNode, name: 'История движений', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: historySource, layout: 'timeline', dateFieldId: movementDate, titleFieldId: movementType, subtitleFieldId: movementWarehouse, cardDetailFieldId: movementQty, itemIds: [], events: { itemPress: null } },
      { id: receiptFormId, name: INVENTORY_V2_COPY.receipt.name, type: 'form', visibleTo: team, visibleWhen: null, tableId: movementsTableId, mode: 'create', childIds: receiptInputs.map(item => item.id), events: { submit: saveReceipt }, submitLabel: INVENTORY_V2_COPY.receipt.action },
      ...receiptInputs,
      { id: issueFormId, name: INVENTORY_V2_COPY.issue.name, type: 'form', visibleTo: team, visibleWhen: null, tableId: movementsTableId, mode: 'create', childIds: issueInputs.map(item => item.id), events: { submit: saveIssue }, submitLabel: INVENTORY_V2_COPY.issue.action },
      ...issueInputs,
      { id: writeOffFormId, name: INVENTORY_V2_COPY.write_off.name, type: 'form', visibleTo: owners, visibleWhen: null, tableId: movementsTableId, mode: 'create', childIds: writeOffInputs.map(item => item.id), events: { submit: saveWriteOff }, submitLabel: INVENTORY_V2_COPY.write_off.action },
      ...writeOffInputs,
      { id: transferFormId, name: 'Переместить', type: 'form', visibleTo: team, visibleWhen: null, tableId: movementsTableId, mode: 'create', childIds: transferInputs.map(item => item.id), events: { submit: saveTransfer }, submitLabel: INVENTORY_V2_COPY.transfer.action },
      ...transferInputs,
      { id: itemEditFormId, name: 'Изменить товар', type: 'form', visibleTo: owners, visibleWhen: null, tableId: itemsTableId, mode: 'edit', childIds: itemEditInputs.map(item => item.id), events: { submit: saveItemEdit }, submitLabel: 'Сохранить' },
      ...itemEditInputs,
      { id: createItemFormId, name: 'Новый товар', type: 'form', visibleTo: owners, visibleWhen: null, tableId: itemsTableId, mode: 'create', childIds: createItemInputs.map(item => item.id), events: { submit: createItem }, submitLabel: 'Сохранить товар' },
      ...createItemInputs,
    ],
    sources: [
      { id: itemsSource, tableId: itemsTableId, viewId: null, filter: null, sorts: [], searchFieldIds: [itemName, itemSku], pageSize: 30 },
      { id: movementsSource, tableId: movementsTableId, viewId: null, filter: null, sorts: [{ fieldId: movementDate, direction: 'desc' }], searchFieldIds: [movementName, movementType], pageSize: 40 },
      { id: historySource, tableId: movementsTableId, screenTableId: itemsTableId, viewId: null, filter: { op: 'includes', left: { kind: 'row', fieldId: movementItem }, right: { kind: 'screen_row_id' } }, sorts: [{ fieldId: movementDate, direction: 'desc' }], searchFieldIds: [], pageSize: 30 },
    ],
    workflows: [
      { id: openItem, name: 'Открыть товар', input: { rowTableId: itemsTableId, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: itemScreenId, record: { kind: 'current' } }] },
      { id: openCreateItem, name: 'Новый товар', input: { rowTableId: null, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: createItemScreenId, record: null }] },
      { id: openItemsForOperation, name: 'Новая операция', input: { rowTableId: null, formId: null, screenTableId: null }, steps: [
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Откройте товар и выберите операцию.' } },
        { id: newId('action'), type: 'open_screen', screenId: itemsScreenId, record: null },
      ] },
      movementWorkflow(saveReceipt, 'Приход', receiptFormId, 'receipt', receiptStep, receiptInputs),
      movementWorkflow(saveIssue, 'Расход', issueFormId, 'issue', issueStep, issueInputs),
      movementWorkflow(saveWriteOff, 'Списание', writeOffFormId, 'write_off', writeOffStep, writeOffInputs),
      movementWorkflow(saveTransfer, 'Перемещение', transferFormId, 'transfer', transferStep, transferInputs),
      { id: saveItemEdit, name: 'Изменить товар', input: { rowTableId: itemsTableId, formId: itemEditFormId, screenTableId: itemsTableId }, steps: [
        { id: newId('action'), type: 'update_row', tableId: itemsTableId, target: { kind: 'current' }, values: Object.fromEntries(itemEditInputs.map(item => [item.fieldId, { kind: 'form' as const, formId: itemEditFormId, fieldId: item.fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Карточка товара обновлена.' } },
      ] },
      { id: createItem, name: 'Создать товар', input: { rowTableId: null, formId: createItemFormId, screenTableId: null }, steps: [
        { id: createItemStep, type: 'create_row', tableId: itemsTableId, values: Object.fromEntries(itemCreateFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: createItemFormId, fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Товар добавлен. Оформите приход, чтобы появился остаток.' } },
        { id: newId('action'), type: 'open_screen', screenId: itemScreenId, record: { kind: 'result', stepId: createItemStep } },
      ] },
    ],
    policy: {
      tables: [
        { tableId: itemsTableId, grants: [
          grant(owners, {
            read: { fieldIds: columns(itemsTableId).map(item => item.id), rows: { kind: 'all' } },
            create: { fieldIds: itemCreateFields },
            update: { fieldIds: ownerItemUpdate, rows: { kind: 'all' } },
          }),
          grant({ ...roles, roleIds: ['staff'] }, {
            read: { fieldIds: staffItemRead, rows: { kind: 'all' } },
          }),
        ] },
        { tableId: movementsTableId, grants: [
          grant(team, {
            read: { fieldIds: columns(movementsTableId).map(item => item.id), rows: { kind: 'all' } },
            create: { fieldIds: movementCreateFields },
          }),
        ] },
        { tableId: warehousesTableId, grants: [
          grant(team, { read: { fieldIds: columns(warehousesTableId).map(item => item.id), rows: { kind: 'all' } } }),
          grant(owners, {
            read: { fieldIds: columns(warehousesTableId).map(item => item.id), rows: { kind: 'all' } },
            create: { fieldIds: editable(warehousesTableId) },
            update: { fieldIds: editable(warehousesTableId), rows: { kind: 'all' } },
          }),
        ] },
      ],
      workflows: [
        { workflowId: openItem, audience: team },
        { workflowId: openCreateItem, audience: owners },
        { workflowId: openItemsForOperation, audience: team },
        { workflowId: saveReceipt, audience: team },
        { workflowId: saveIssue, audience: team },
        { workflowId: saveWriteOff, audience: owners },
        { workflowId: saveTransfer, audience: team },
        { workflowId: saveItemEdit, audience: owners },
        { workflowId: createItem, audience: owners },
      ],
    },
    inventory: inventoryBlock,
  }
  return app
}
