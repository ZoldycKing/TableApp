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

  const suppliersTableId = built.tables.find(table => table.name === 'Поставщики')?.id
  const purchaseOrdersTableId = built.tables.find(table => table.name === 'Заказы поставщикам')?.id
  const purchaseLinesTableId = built.tables.find(table => table.name === 'Позиции заказа')?.id
  if (!suppliersTableId || !purchaseOrdersTableId || !purchaseLinesTableId) throw new Error('В складе нет таблиц закупок')
  const supplierName = fieldByName(suppliersTableId, 'Название')
  const supplierContact = fieldByName(suppliersTableId, 'Контакт')
  const supplierPhone = fieldByName(suppliersTableId, 'Телефон')
  const supplierComment = fieldByName(suppliersTableId, 'Комментарий')
  const purchaseName = fieldByName(purchaseOrdersTableId, 'Заказ')
  const purchaseNumber = fieldByName(purchaseOrdersTableId, 'Номер')
  const purchaseSupplier = fieldByName(purchaseOrdersTableId, 'Поставщик')
  const purchaseWarehouse = fieldByName(purchaseOrdersTableId, 'Склад')
  const purchaseDate = fieldByName(purchaseOrdersTableId, 'Дата')
  const purchaseStatus = fieldByName(purchaseOrdersTableId, 'Статус')
  const purchaseTotal = fieldByName(purchaseOrdersTableId, 'Сумма')
  const purchaseComment = fieldByName(purchaseOrdersTableId, 'Комментарий')
  const purchaseLines = fieldByName(purchaseOrdersTableId, 'Позиции')
  const purchaseCount = fieldByName(purchaseOrdersTableId, 'Позиций')
  const purchasePayload = fieldByName(purchaseOrdersTableId, 'Состав заказа')
  const purchaseCreatedAt = fieldByName(purchaseOrdersTableId, 'Создан')
  const purchaseCreatedBy = fieldByName(purchaseOrdersTableId, 'Создал')
  const purchaseOrderedAt = fieldByName(purchaseOrdersTableId, 'Заказан')
  const purchaseOrderedBy = fieldByName(purchaseOrdersTableId, 'Заказал')
  const purchaseReceivedAt = fieldByName(purchaseOrdersTableId, 'Получен')
  const purchaseReceivedBy = fieldByName(purchaseOrdersTableId, 'Получил')
  const purchaseCancelledAt = fieldByName(purchaseOrdersTableId, 'Отменён')
  const purchaseCancelledBy = fieldByName(purchaseOrdersTableId, 'Отменил')
  const lineName = fieldByName(purchaseLinesTableId, 'Позиция')
  const lineOrder = fieldByName(purchaseLinesTableId, 'Заказ')
  const lineProduct = fieldByName(purchaseLinesTableId, 'Товар')
  const lineQty = fieldByName(purchaseLinesTableId, 'Количество')
  const linePrice = fieldByName(purchaseLinesTableId, 'Цена')
  const lineTotal = fieldByName(purchaseLinesTableId, 'Сумма позиции')
  const statusDraft = choice(purchaseOrdersTableId, purchaseStatus, 'Черновик')
  const statusOrdered = choice(purchaseOrdersTableId, purchaseStatus, 'Заказано')
  const statusReceived = choice(purchaseOrdersTableId, purchaseStatus, 'Получено')
  const statusCancelled = choice(purchaseOrdersTableId, purchaseStatus, 'Отменено')
  const whenStatus = (...ids: string[]) => ids.length === 1
    ? { op: 'eq' as const, left: { kind: 'row' as const, fieldId: purchaseStatus }, right: { kind: 'literal' as const, value: ids[0]! } }
    : { op: 'or' as const, conditions: ids.map(value => ({ op: 'eq' as const, left: { kind: 'row' as const, fieldId: purchaseStatus }, right: { kind: 'literal' as const, value } })) }

  const itemsScreenId = newId('screen'), itemScreenId = newId('screen'), movementsScreenId = newId('screen'), createItemScreenId = newId('screen')
  const purchasesScreenId = newId('screen'), purchaseScreenId = newId('screen'), createPurchaseScreenId = newId('screen')
  const suppliersScreenId = newId('screen'), supplierScreenId = newId('screen'), createSupplierScreenId = newId('screen')
  const itemsNode = newId('component'), movementsNode = newId('component'), historyNode = newId('component')
  const itemsSource = newId('component'), movementsSource = newId('component'), historySource = newId('component')
  const purchasesNode = newId('component'), purchaseLinesNode = newId('component'), suppliersNode = newId('component'), supplierOrdersNode = newId('component')
  const purchasesSource = newId('component'), purchaseLinesSource = newId('component'), suppliersSource = newId('component'), supplierOrdersSource = newId('component')
  const receiptFormId = newId('component'), issueFormId = newId('component'), writeOffFormId = newId('component'), transferFormId = newId('component')
  const itemEditFormId = newId('component'), createItemFormId = newId('component')
  const createPurchaseFormId = newId('component'), editPurchaseFormId = newId('component')
  const createSupplierFormId = newId('component'), editSupplierFormId = newId('component')
  const newItemButton = newId('component'), newOperationButton = newId('component')
  const newPurchaseButton = newId('component'), suppliersButton = newId('component'), newSupplierButton = newId('component')
  const orderPurchaseButton = newId('component'), receivePurchaseButton = newId('component'), cancelPurchaseButton = newId('component')
  const openItem = newId('action'), openCreateItem = newId('action'), openItemsForOperation = newId('action')
  const openPurchase = newId('action'), openCreatePurchase = newId('action'), openSuppliers = newId('action'), openSupplier = newId('action'), openCreateSupplier = newId('action')
  const savePurchase = newId('action'), createPurchase = newId('action'), markOrdered = newId('action'), receivePurchase = newId('action'), cancelPurchase = newId('action')
  const saveSupplier = newId('action'), createSupplier = newId('action')
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
    ...(itemPhoto ? [input(itemPhoto, 'Фото', false)] : []),
    input(itemBarcode, 'Штрихкод', false),
    input(itemCategory, 'Категория', false),
    input(itemUnit, 'Единица', true),
    input(itemMin, 'Минимальный остаток', true),
    input(itemCost, 'Себестоимость, ₽', false),
    input(itemWarehouse, 'Склад', true),
  ]
  const itemEditInputs = productFields()
  const createItemInputs = productFields()
  const purchaseFields = () => [
    input(purchaseSupplier, 'Поставщик', true),
    input(purchaseWarehouse, 'Склад', true),
    input(purchaseDate, 'Дата', true),
    input(purchaseComment, 'Комментарий', false),
    input(purchasePayload, 'Состав заказа', false),
  ]
  const supplierFields = () => [
    input(supplierName, 'Название', true),
    input(supplierContact, 'Контакт', false),
    input(supplierPhone, 'Телефон', false),
    input(supplierComment, 'Комментарий', false),
  ]
  const createPurchaseInputs = purchaseFields()
  const editPurchaseInputs = purchaseFields()
  const createSupplierInputs = supplierFields()
  const editSupplierInputs = supplierFields()
  const purchaseUserFields = [purchaseSupplier, purchaseWarehouse, purchaseDate, purchaseComment, purchasePayload]
  const supplierUserFields = [supplierName, supplierContact, supplierPhone, supplierComment]
  const createPurchaseStep = newId('action')

  const identityFieldIds = [itemStock, itemLow, itemMin]
  const factFieldIds = [itemSku, itemBarcode, itemCategory, itemUnit, itemCost, itemWarehouse]

  const inventoryBlock: NonNullable<AppV2['inventory']> = {
    itemsTableId, movementsTableId, warehousesTableId,
    itemsScreenId, itemScreenId, movementsScreenId, createItemScreenId,
    receiptFormId, issueFormId, writeOffFormId, transferFormId, itemEditFormId, createItemFormId,
    itemNameFieldId: itemName, itemSkuFieldId: itemSku, itemBarcodeFieldId: itemBarcode,
    itemCategoryFieldId: itemCategory, itemUnitFieldId: itemUnit, itemMinFieldId: itemMin,
    itemCostFieldId: itemCost, itemWarehouseFieldId: itemWarehouse,
    ...(itemPhoto ? { itemPhotoFieldId: itemPhoto } : {}),
    itemStockFieldId: itemStock,
    itemLowFieldId: itemLow, itemMovementsFieldId: itemMovements, itemOpeningFieldId: itemOpening,
    movementNameFieldId: movementName, movementTypeFieldId: movementType, movementItemFieldId: movementItem,
    movementQtyFieldId: movementQty, movementWarehouseFieldId: movementWarehouse,
    movementWarehouseToFieldId: movementWarehouseTo, movementDateFieldId: movementDate,
    movementNoteFieldId: movementNote, movementAuthorFieldId: movementAuthor,
    movementBeforeFieldId: movementBefore, movementAfterFieldId: movementAfter,
    warehouseNameFieldId: warehouseName,
    typeReceipt, typeIssue, typeWriteOff, typeTransfer,
    suppliersTableId, purchaseOrdersTableId, purchaseLinesTableId,
    purchasesScreenId, purchaseScreenId, createPurchaseScreenId,
    suppliersScreenId, supplierScreenId, createSupplierScreenId,
    createPurchaseFormId, editPurchaseFormId, createSupplierFormId, editSupplierFormId,
    supplierNameFieldId: supplierName, supplierContactFieldId: supplierContact, supplierPhoneFieldId: supplierPhone, supplierCommentFieldId: supplierComment,
    purchaseNameFieldId: purchaseName, purchaseNumberFieldId: purchaseNumber, purchaseSupplierFieldId: purchaseSupplier, purchaseWarehouseFieldId: purchaseWarehouse,
    purchaseDateFieldId: purchaseDate, purchaseStatusFieldId: purchaseStatus, purchaseTotalFieldId: purchaseTotal,
    purchaseCommentFieldId: purchaseComment, purchaseLinesFieldId: purchaseLines, purchaseCountFieldId: purchaseCount, purchasePayloadFieldId: purchasePayload,
    purchaseCreatedAtFieldId: purchaseCreatedAt, purchaseCreatedByFieldId: purchaseCreatedBy,
    purchaseOrderedAtFieldId: purchaseOrderedAt, purchaseOrderedByFieldId: purchaseOrderedBy,
    purchaseReceivedAtFieldId: purchaseReceivedAt, purchaseReceivedByFieldId: purchaseReceivedBy,
    purchaseCancelledAtFieldId: purchaseCancelledAt, purchaseCancelledByFieldId: purchaseCancelledBy,
    lineNameFieldId: lineName, lineOrderFieldId: lineOrder, lineProductFieldId: lineProduct, lineQtyFieldId: lineQty, linePriceFieldId: linePrice, lineTotalFieldId: lineTotal,
    statusDraft, statusOrdered, statusReceived, statusCancelled,
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
      { id: purchasesScreenId, name: 'Закупки', menuLabel: 'Закупки', icon: 'clipboard', navigation: true, audience: team, contextTableId: null, rootIds: [suppliersButton, newPurchaseButton, purchasesNode], events: { enter: null } },
      // Deep-link screen; list toolbar opens the same form node in a centred dialog (not dual-rooted).
      { id: createItemScreenId, name: 'Новый товар', icon: 'box', navigation: false, audience: owners, contextTableId: null, rootIds: [createItemFormId], events: { enter: null } },
      { id: createPurchaseScreenId, name: 'Новый заказ', icon: 'clipboard', navigation: false, audience: team, contextTableId: null, rootIds: [createPurchaseFormId], events: { enter: null } },
      { id: purchaseScreenId, name: 'Заказ поставщику', icon: 'clipboard', navigation: false, audience: team, contextTableId: purchaseOrdersTableId, recordTitleFieldId: purchaseNumber, rootIds: [purchaseLinesNode, editPurchaseFormId, orderPurchaseButton, receivePurchaseButton, cancelPurchaseButton], events: { enter: null } },
      { id: suppliersScreenId, name: 'Поставщики', icon: 'truck', navigation: false, audience: team, contextTableId: null, rootIds: [newSupplierButton, suppliersNode], events: { enter: null } },
      { id: createSupplierScreenId, name: 'Новый поставщик', icon: 'truck', navigation: false, audience: owners, contextTableId: null, rootIds: [createSupplierFormId], events: { enter: null } },
      { id: supplierScreenId, name: 'Поставщик', icon: 'truck', navigation: false, audience: team, contextTableId: suppliersTableId, recordTitleFieldId: supplierName, rootIds: [`supplier_${supplierContact}`, `supplier_${supplierPhone}`, `supplier_${supplierComment}`, supplierOrdersNode, editSupplierFormId], events: { enter: null } },
      { id: itemScreenId, name: 'Товар', icon: 'box', navigation: false, audience: team, contextTableId: itemsTableId, recordTitleFieldId: itemName, rootIds: [
        ...identityFieldIds.map(id => `item_${id}`),
        ...factFieldIds.map(id => `item_${id}`),
        historyNode, receiptFormId, issueFormId, writeOffFormId, transferFormId, itemEditFormId,
      ], events: { enter: null } },
    ],
    nodes: [
      // Folded into the list search toolbar; opens createItemScreenId as a centred dialog.
      { id: newItemButton, name: 'Новый товар', type: 'button', label: 'Новый товар', variant: 'primary', visibleTo: owners, visibleWhen: null, events: { press: openCreateItem } },
      { id: newOperationButton, name: 'Новая операция', type: 'button', label: 'Новая операция', variant: 'primary', visibleTo: team, visibleWhen: null, events: { press: openItemsForOperation } },
      { id: itemsNode, name: 'Товары', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: itemsSource, layout: 'list', titleFieldId: itemName, subtitleFieldId: itemSku, ...(itemPhoto ? { cardImageFieldId: itemPhoto } : {}), cardDetailFieldId: itemStock, itemIds: [], events: { itemPress: openItem } },
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
      { id: suppliersButton, name: 'Поставщики', type: 'button', label: 'Поставщики', variant: 'secondary', visibleTo: team, visibleWhen: null, events: { press: openSuppliers } },
      { id: newPurchaseButton, name: 'Новый заказ', type: 'button', label: 'Новый заказ', variant: 'primary', visibleTo: team, visibleWhen: null, events: { press: openCreatePurchase } },
      { id: newSupplierButton, name: 'Новый поставщик', type: 'button', label: 'Новый поставщик', variant: 'primary', visibleTo: owners, visibleWhen: null, events: { press: openCreateSupplier } },
      { id: purchasesNode, name: 'Закупки', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: purchasesSource, layout: 'list', titleFieldId: purchaseNumber, subtitleFieldId: purchaseSupplier, dateFieldId: purchaseDate, groupFieldId: purchaseStatus, cardDetailFieldId: purchaseTotal, itemIds: [], events: { itemPress: openPurchase } },
      { id: purchaseLinesNode, name: 'Позиции', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: purchaseLinesSource, layout: 'list', titleFieldId: lineName, subtitleFieldId: lineQty, cardDetailFieldId: lineTotal, itemIds: [], events: { itemPress: null } },
      { id: suppliersNode, name: 'Поставщики', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: suppliersSource, layout: 'list', titleFieldId: supplierName, subtitleFieldId: supplierContact, cardDetailFieldId: supplierPhone, itemIds: [], events: { itemPress: openSupplier } },
      { id: supplierOrdersNode, name: 'Заказы', type: 'collection', visibleTo: null, visibleWhen: null, sourceId: supplierOrdersSource, layout: 'list', titleFieldId: purchaseNumber, subtitleFieldId: purchaseStatus, dateFieldId: purchaseDate, cardDetailFieldId: purchaseTotal, itemIds: [], events: { itemPress: openPurchase } },
      node(`supplier_${supplierContact}`, 'Контакт', supplierContact),
      node(`supplier_${supplierPhone}`, 'Телефон', supplierPhone),
      node(`supplier_${supplierComment}`, 'Комментарий', supplierComment),
      { id: orderPurchaseButton, name: 'Заказать', type: 'button', label: 'Заказать', variant: 'primary', visibleTo: team, visibleWhen: whenStatus(statusDraft), events: { press: markOrdered } },
      { id: receivePurchaseButton, name: 'Получить', type: 'button', label: 'Получить', variant: 'primary', visibleTo: team, visibleWhen: whenStatus(statusOrdered), events: { press: receivePurchase } },
      { id: cancelPurchaseButton, name: 'Отменить', type: 'button', label: 'Отменить', variant: 'secondary', visibleTo: owners, visibleWhen: whenStatus(statusReceived), events: { press: cancelPurchase } },
      { id: createPurchaseFormId, name: 'Новый заказ', type: 'form', visibleTo: team, visibleWhen: null, tableId: purchaseOrdersTableId, mode: 'create', childIds: createPurchaseInputs.map(item => item.id), events: { submit: createPurchase }, submitLabel: 'Сохранить заказ' },
      ...createPurchaseInputs,
      { id: editPurchaseFormId, name: 'Изменить заказ', type: 'form', visibleTo: team, visibleWhen: whenStatus(statusDraft, statusOrdered), tableId: purchaseOrdersTableId, mode: 'edit', childIds: editPurchaseInputs.map(item => item.id), events: { submit: savePurchase }, submitLabel: 'Сохранить' },
      ...editPurchaseInputs,
      { id: createSupplierFormId, name: 'Новый поставщик', type: 'form', visibleTo: owners, visibleWhen: null, tableId: suppliersTableId, mode: 'create', childIds: createSupplierInputs.map(item => item.id), events: { submit: createSupplier }, submitLabel: 'Сохранить поставщика' },
      ...createSupplierInputs,
      { id: editSupplierFormId, name: 'Изменить поставщика', type: 'form', visibleTo: owners, visibleWhen: null, tableId: suppliersTableId, mode: 'edit', childIds: editSupplierInputs.map(item => item.id), events: { submit: saveSupplier }, submitLabel: 'Сохранить' },
      ...editSupplierInputs,
    ],
    sources: [
      { id: itemsSource, tableId: itemsTableId, viewId: null, filter: null, sorts: [], searchFieldIds: [itemName, itemSku], pageSize: 30 },
      { id: movementsSource, tableId: movementsTableId, viewId: null, filter: null, sorts: [{ fieldId: movementDate, direction: 'desc' }], searchFieldIds: [movementName, movementType], pageSize: 40 },
      { id: historySource, tableId: movementsTableId, screenTableId: itemsTableId, viewId: null, filter: { op: 'includes', left: { kind: 'row', fieldId: movementItem }, right: { kind: 'screen_row_id' } }, sorts: [{ fieldId: movementDate, direction: 'desc' }], searchFieldIds: [], pageSize: 30 },
      { id: purchasesSource, tableId: purchaseOrdersTableId, viewId: null, filter: null, sorts: [{ fieldId: purchaseDate, direction: 'desc' }, { fieldId: purchaseTotal, direction: 'desc' }, { fieldId: purchaseCount, direction: 'desc' }], searchFieldIds: [purchaseNumber, purchaseName, purchaseSupplier], pageSize: 30 },
      { id: purchaseLinesSource, tableId: purchaseLinesTableId, screenTableId: purchaseOrdersTableId, viewId: null, filter: { op: 'includes', left: { kind: 'row', fieldId: lineOrder }, right: { kind: 'screen_row_id' } }, sorts: [], searchFieldIds: [], pageSize: 50 },
      { id: suppliersSource, tableId: suppliersTableId, viewId: null, filter: null, sorts: [{ fieldId: supplierName, direction: 'asc' }], searchFieldIds: [supplierName, supplierContact], pageSize: 30 },
      { id: supplierOrdersSource, tableId: purchaseOrdersTableId, screenTableId: suppliersTableId, viewId: null, filter: { op: 'includes', left: { kind: 'row', fieldId: purchaseSupplier }, right: { kind: 'screen_row_id' } }, sorts: [{ fieldId: purchaseDate, direction: 'desc' }], searchFieldIds: [purchaseNumber, purchaseName], pageSize: 30 },
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
      { id: openPurchase, name: 'Открыть заказ', input: { rowTableId: purchaseOrdersTableId, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: purchaseScreenId, record: { kind: 'current' } }] },
      { id: openCreatePurchase, name: 'Новый заказ', input: { rowTableId: null, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: createPurchaseScreenId, record: null }] },
      { id: openSuppliers, name: 'Поставщики', input: { rowTableId: null, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: suppliersScreenId, record: null }] },
      { id: openSupplier, name: 'Открыть поставщика', input: { rowTableId: suppliersTableId, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: supplierScreenId, record: { kind: 'current' } }] },
      { id: openCreateSupplier, name: 'Новый поставщик', input: { rowTableId: null, formId: null, screenTableId: null }, steps: [{ id: newId('action'), type: 'open_screen', screenId: createSupplierScreenId, record: null }] },
      { id: createPurchase, name: 'Создать заказ поставщику', input: { rowTableId: null, formId: createPurchaseFormId, screenTableId: null }, steps: [
        { id: createPurchaseStep, type: 'create_purchase_order', tableId: purchaseOrdersTableId, values: Object.fromEntries(purchaseUserFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: createPurchaseFormId, fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Заказ сохранён как черновик.' } },
        { id: newId('action'), type: 'open_screen', screenId: purchaseScreenId, record: { kind: 'result', stepId: createPurchaseStep } },
      ] },
      { id: savePurchase, name: 'Изменить заказ поставщику', input: { rowTableId: purchaseOrdersTableId, formId: editPurchaseFormId, screenTableId: purchaseOrdersTableId }, steps: [
        { id: newId('action'), type: 'update_purchase_order', tableId: purchaseOrdersTableId, values: Object.fromEntries(purchaseUserFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: editPurchaseFormId, fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Заказ обновлён.' } },
      ] },
      { id: markOrdered, name: 'Отметить заказ заказанным', input: { rowTableId: purchaseOrdersTableId, formId: null, screenTableId: purchaseOrdersTableId }, steps: [
        { id: newId('action'), type: 'order_purchase_order' },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Статус: заказано.' } },
      ] },
      { id: receivePurchase, name: 'Принять заказ поставщика', input: { rowTableId: purchaseOrdersTableId, formId: null, screenTableId: purchaseOrdersTableId }, steps: [
        { id: newId('action'), type: 'receive_purchase_order' },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Заказ получен. Остатки на складе увеличены.' } },
      ] },
      { id: cancelPurchase, name: 'Отменить полученный заказ', input: { rowTableId: purchaseOrdersTableId, formId: null, screenTableId: purchaseOrdersTableId }, steps: [
        { id: newId('action'), type: 'cancel_purchase_order' },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Заказ отменён. Приходы сторнированы, остатки уменьшены.' } },
      ] },
      { id: createSupplier, name: 'Создать поставщика', input: { rowTableId: null, formId: createSupplierFormId, screenTableId: null }, steps: [
        { id: createSupplier, type: 'create_row', tableId: suppliersTableId, values: Object.fromEntries(supplierUserFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: createSupplierFormId, fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Поставщик добавлен.' } },
        { id: newId('action'), type: 'open_screen', screenId: supplierScreenId, record: { kind: 'result', stepId: createSupplier } },
      ] },
      { id: saveSupplier, name: 'Изменить поставщика', input: { rowTableId: suppliersTableId, formId: editSupplierFormId, screenTableId: suppliersTableId }, steps: [
        { id: newId('action'), type: 'update_row', tableId: suppliersTableId, target: { kind: 'current' }, values: Object.fromEntries(supplierUserFields.map(fieldId => [fieldId, { kind: 'form' as const, formId: editSupplierFormId, fieldId }])) },
        { id: newId('action'), type: 'notify', message: { kind: 'literal', value: 'Карточка поставщика обновлена.' } },
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
        { tableId: suppliersTableId, grants: [
          grant(team, { read: { fieldIds: columns(suppliersTableId).map(item => item.id), rows: { kind: 'all' } } }),
          grant(owners, {
            create: { fieldIds: supplierUserFields },
            update: { fieldIds: supplierUserFields, rows: { kind: 'all' } },
          }),
        ] },
        { tableId: purchaseOrdersTableId, grants: [
          grant(team, {
            read: { fieldIds: columns(purchaseOrdersTableId).map(item => item.id), rows: { kind: 'all' } },
            create: { fieldIds: purchaseUserFields },
            update: { fieldIds: purchaseUserFields, rows: { kind: 'all' } },
          }),
        ] },
        { tableId: purchaseLinesTableId, grants: [
          grant(team, { read: { fieldIds: columns(purchaseLinesTableId).map(item => item.id), rows: { kind: 'all' } } }),
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
        { workflowId: openPurchase, audience: team },
        { workflowId: openCreatePurchase, audience: team },
        { workflowId: openSuppliers, audience: team },
        { workflowId: openSupplier, audience: team },
        { workflowId: openCreateSupplier, audience: owners },
        { workflowId: createPurchase, audience: team },
        { workflowId: savePurchase, audience: team },
        { workflowId: markOrdered, audience: team },
        { workflowId: receivePurchase, audience: team },
        { workflowId: cancelPurchase, audience: owners },
        { workflowId: createSupplier, audience: owners },
        { workflowId: saveSupplier, audience: owners },
      ],
    },
    inventory: inventoryBlock,
  }
  return app
}
