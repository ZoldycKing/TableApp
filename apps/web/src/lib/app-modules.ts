import { MODULE_DEFINITIONS, compatibleModuleKinds, customerWorkflows, type App, type AppModule, type Field, type FieldType, type ModuleKind } from '@tableapp/schema'
import { checkModuleAccess } from './module-access'

type Catalog = { tableIds: ReadonlySet<string>; fields: ReadonlyMap<string, Field> }
type FieldRequirement = { name: string; tableId: string; fieldId: string; types: readonly FieldType[]; relationTableId?: string }
export type ModuleContract = {
  tables: Record<string, string>
  fields: FieldRequirement[]
  /** Tables whose lifecycle rules this engine owns; catalog tables may be shared. */
  writeTables: string[]
}

export function moduleSourceKey(source: AppModule['source']): string {
  return source.type === 'customer' ? `customer:${source.tableId}` : source.type
}

const templateKinds: Partial<Record<string, ModuleKind>> = {
  zakazy: 'sales', katalog: 'sales', dostavka: 'delivery', service: 'repair', nedvizhimost: 'property', zayavki: 'field_service', crm: 'crm', portal: 'requests',
}

/** A deterministic, read-only adapter. Reading an old app never persists a manifest or changes its permissions. */
export function legacyAppModules(app: App, templateByTable: ReadonlyMap<string, string> = new Map()): AppModule[] {
  const modules: AppModule[] = []
  const add = (kind: ModuleKind, source: AppModule['source'], resourceId: string) => {
    const module: AppModule = { id: `mod_${kind}_${resourceId}`, kind, version: 1, source, dependsOn: [], intakeEnabled: true }
    modules.push(module)
    return module
  }
  if (app.booking) add('booking', { type: 'booking' }, app.booking.tables.visits)
  for (const config of customerWorkflows(app)) {
    const kind = config.parent ? 'support' : config.crm ? 'crm' : config.cart ? 'sales' : config.approval ? 'repair' : config.appointment ? 'property'
      : templateKinds[templateByTable.get(config.tableId) ?? ''] ?? 'requests'
    add(kind, { type: 'customer', tableId: config.tableId }, config.tableId)
  }
  if (app.inventory) add('inventory', { type: 'inventory' }, app.inventory.tables.movements)
  if (app.production) add('production', { type: 'production' }, app.production.tables.production)
  for (const module of modules) {
    const source = module.source
    if (source.type !== 'customer') continue
    const config = customerWorkflows(app).find(config => config.tableId === source.tableId)
    if (!config?.parent) continue
    const parent = modules.find(candidate => candidate.source.type === 'customer' && candidate.source.tableId === config.parent!.tableId)
    if (parent) module.dependsOn = [parent.id]
  }
  return modules
}

export function appModules(app: App): AppModule[] { return app.modules ?? legacyAppModules(app) }

/** A saved manifest cannot be removed to bypass the new compatibility checks. */
export function checkModuleModelTransition(next: App, ...previous: unknown[]): string | null {
  for (const value of previous) {
    if (next.modules && value && typeof value === 'object' && 'modules' in value && Array.isArray(value.modules) && value.modules.some(module => module && typeof module.id === 'string' && !next.modules!.some(candidate => candidate.id === module.id))) return 'Не удаляйте установленный модуль: прекратите новые оформления в разделе возможностей приложения'
  }
  if (!next.moduleAccess && previous.some(value => value !== null && typeof value === 'object' && 'moduleAccess' in value && value.moduleAccess)) return 'Сохраните рабочие права модулей: возврат к общим ролям не поддерживается'
  if (next.modules !== undefined) return null
  const alreadyModular = previous.some(value => value !== null && typeof value === 'object' && 'modules' in value && Array.isArray(value.modules))
  return alreadyModular ? 'Сохраните список модулей приложения: возврат к старой модели настроек не поддерживается' : null
}

/** Derive bindings from the authoritative engine configuration, never from field names or guessed tables. */
export function moduleContract(app: App, module: AppModule): ModuleContract | null {
  const tables: Record<string, string> = {}, fields: FieldRequirement[] = [], writeTables: string[] = []
  const add = (name: string, tableId: string, fieldId: string | null | undefined, types: readonly FieldType[], relationTableId?: string) => {
    if (fieldId !== null && fieldId !== undefined) fields.push({ name, tableId, fieldId, types, ...(relationTableId ? { relationTableId } : {}) })
  }
  const group = (tableId: string, values: Record<string, string>, types: Record<string, readonly FieldType[]>, targets: Record<string, string> = {}) => {
    for (const [name, id] of Object.entries(values)) add(name, tableId, id, types[name] ?? ['text', 'long_text'], targets[name])
  }
  switch (module.source.type) {
    case 'booking': {
      const c = app.booking
      if (!c) return null
      Object.assign(tables, c.tables); writeTables.push(c.tables.visits, c.tables.masters, c.tables.schedule)
      group(c.tables.services, c.service, { price: ['number'], minutes: ['number'], active: ['checkbox'] })
      group(c.tables.masters, c.master, { email: ['email'], services: ['relation'], active: ['checkbox'] }, { services: c.tables.services })
      group(c.tables.schedule, c.schedule, { master: ['relation'], weekday: ['single_select'], date: ['date'], closed: ['checkbox'] }, { master: c.tables.masters })
      group(c.tables.visits, c.visit, { phone: ['phone'], email: ['email'], service: ['relation'], master: ['relation'], masterEmail: ['email'], price: ['number'], minutes: ['number'], start: ['datetime'], status: ['single_select'] }, { service: c.tables.services, master: c.tables.masters })
      break
    }
    case 'customer': {
      const tableId = module.source.tableId
      const c = customerWorkflows(app).find(config => config.tableId === tableId)
      if (!c) return null
      tables.records = tableId; writeTables.push(tableId)
      add('customerEmail', tableId, c.emailFieldId, ['email']); add('status', tableId, c.statusFieldId, ['single_select'])
      add('assignedEmail', tableId, c.assignmentFieldId, ['email']); add('created', tableId, c.createdFieldId, ['datetime']); add('submission', tableId, c.submissionFieldId, ['text'])
      if (c.profile) { add('customerName', tableId, c.profile.nameFieldId, ['text']); add('customerPhone', tableId, c.profile.phoneFieldId, ['phone']) }
      if (c.crm) {
        const crm = c.crm
        tables.clients = crm.clientsTableId; writeTables.push(crm.clientsTableId)
        add('crmClient', tableId, crm.relationFieldId, ['relation'], crm.clientsTableId)
        add('crmClientEmail', crm.clientsTableId, crm.emailFieldId, ['email'])
        add('crmClientName', crm.clientsTableId, crm.nameFieldId, ['text'])
        add('crmClientPhone', crm.clientsTableId, crm.phoneFieldId, ['phone'])
      }
      if (c.logistics) {
        add('deliveryAddress', tableId, c.logistics.addressFieldId, ['text'])
        if (c.logistics.kind === 'delivery') add('deliveryContents', tableId, c.logistics.contentsFieldId, ['text', 'long_text'])
      }
      if (c.catalog) {
        const cat = c.catalog
        tables.catalog = cat.tableId
        add('catalogTitle', cat.tableId, cat.titleFieldId, ['text', 'long_text']); add('catalogActive', cat.tableId, cat.activeFieldId, ['checkbox'])
        add('selectedItem', tableId, cat.selectionFieldId, ['relation'], cat.tableId)
      }
      if (c.cart) {
        const cart = c.cart
        if (!c.catalog) return null
        tables.positions = cart.itemsTableId; writeTables.push(cart.itemsTableId)
        add('cart', tableId, cart.fieldId, ['long_text']); add('positions', tableId, cart.positionsFieldId, ['relation'], cart.itemsTableId)
        add('price', c.catalog.tableId, cart.priceFieldId, ['number'])
        add('product', cart.itemsTableId, cart.productFieldId, ['relation'], c.catalog.tableId)
        group(cart.itemsTableId, { name: cart.nameFieldId, qty: cart.quantityFieldId, price: cart.itemPriceFieldId, email: cart.itemEmailFieldId, assigned: cart.itemAssignmentFieldId }, { qty: ['number'], price: ['number'], email: ['email'], assigned: ['email'] })
      }
      if (c.approval) { add('estimate', tableId, c.approval.priceFieldId, ['number']); add('approvedEstimate', tableId, c.approval.approvedPriceFieldId, ['number']) }
      if (c.appointment) add('appointment', tableId, c.appointment.fieldId, ['datetime'])
      if (c.parent) {
        tables.parent = c.parent.tableId
        add('parent', tableId, c.parent.relationFieldId, ['relation'], c.parent.tableId); add('parentOwner', c.parent.tableId, c.parent.emailFieldId, ['email'])
      }
      break
    }
    case 'inventory': {
      const c = app.inventory
      if (!c) return null
      Object.assign(tables, c.tables); writeTables.push(c.tables.items, c.tables.movements)
      group(c.tables.items, { name: c.item.name, opening: c.item.opening, movements: c.item.movements, stock: c.item.stock }, { opening: ['number'], movements: ['relation'], stock: ['formula'] }, { movements: c.tables.movements })
      add('image', c.tables.items, c.item.image, ['image', 'attachment']); add('sku', c.tables.items, c.item.sku, ['text'])
      group(c.tables.movements, c.movement, { item: ['relation'], qty: ['number'], date: ['datetime'], author: ['email'] }, { item: c.tables.items })
      if (c.operations) group(c.tables.movements, c.operations.fields, { kind: ['single_select'], before: ['number'], after: ['number'] })
      break
    }
    case 'production': {
      const c = app.production
      if (!c) return null
      Object.assign(tables, c.tables); writeTables.push(c.tables.production, c.tables.movements)
      group(c.tables.production, c.run, { date: ['date', 'datetime'], product: ['relation'], qty: ['number'], defects: ['number'], shift: ['single_select'] })
      group(c.tables.norms, c.norm, { product: ['relation'], material: ['relation'], perUnit: ['number'], active: ['checkbox'] }, { material: c.tables.materials })
      group(c.tables.movements, c.movement, { date: ['date', 'datetime'], material: ['relation'], kind: ['single_select'], qty: ['number'], run: ['relation'] }, { material: c.tables.materials, run: c.tables.production })
      group(c.tables.materials, c.material, { unit: ['single_select'], opening: ['number'], movements: ['relation'] }, { movements: c.tables.movements })
      // Products are addressed by the existing relation, not a guessed table name.
      break
    }
  }
  return { tables, fields, writeTables }
}

/** V1 supports the installed presets and their support section. New compositions require the role/composition stages. */
export function checkAppModules(app: App, catalog: Catalog): string | null {
  const accessError = checkModuleAccess(app)
  if (accessError) return accessError
  if (!app.modules) return null
  const modules = app.modules
  const byId = new Map(modules.map(module => [module.id, module]))
  if (byId.size !== modules.length) return 'Идентификатор модуля повторяется'
  const sources = new Set<string>(), writers = new Set<string>()
  for (const module of modules) {
    const definition = MODULE_DEFINITIONS[module.kind]
    if (module.version !== definition.version) return `Версия модуля «${definition.name}» не поддерживается`
    if (module.source.type !== definition.engine) return `Модуль «${definition.name}» подключён к неподходящему сценарию`
    const key = moduleSourceKey(module.source)
    if (sources.has(key)) return 'Один сценарий не может принадлежать двум модулям'
    sources.add(key)
    const contract = moduleContract(app, module)
    if (!contract) return `Не найдены настройки модуля «${definition.name}»`
    for (const tableId of contract.writeTables) {
      if (writers.has(tableId)) return 'Несколько модулей задают правила для одних записей'
      writers.add(tableId)
    }
    for (const tableId of Object.values(contract.tables)) if (!catalog.tableIds.has(tableId)) return `Модуль «${definition.name}» ссылается на недоступную таблицу`
    for (const requirement of contract.fields) {
      const field = catalog.fields.get(requirement.fieldId)
      if (!field || field.tableId !== requirement.tableId || !requirement.types.includes(field.type)) return `В модуле «${definition.name}» несовместимое поле «${requirement.name}»`
      if (requirement.relationTableId && (field.type !== 'relation' || field.options.tableId !== requirement.relationTableId)) return `В модуле «${definition.name}» изменена связь «${requirement.name}»`
      if (field.type === 'relation' && !catalog.tableIds.has(field.options.tableId)) return `Модуль «${definition.name}» использует недоступную связанную таблицу`
    }
    if (module.source.type === 'production') {
      const c = app.production!, runProduct = catalog.fields.get(c.run.product), normProduct = catalog.fields.get(c.norm.product)
      if (runProduct?.type !== 'relation' || normProduct?.type !== 'relation' || runProduct.options.tableId !== normProduct.options.tableId) return 'Выпуск и нормы производства должны ссылаться на один каталог продукции'
    }
    for (const id of module.dependsOn) if (id === module.id || !byId.has(id)) return `Не найдена зависимость модуля «${definition.name}»`
    if (module.source.type === 'customer') {
      const tableId = module.source.tableId, config = customerWorkflows(app).find(config => config.tableId === tableId)!
      const specialized = config.parent ? 'support' : config.crm ? 'crm' : config.cart ? 'sales' : config.logistics?.kind === 'delivery' ? 'delivery' : config.approval ? 'repair' : config.appointment ? 'property' : null
      if (specialized && module.kind !== specialized || !specialized && ['support', 'sales', 'repair', 'property'].includes(module.kind)) return `Тип модуля «${definition.name}» не соответствует его правилам`
      if (config.parent) {
        const parent = modules.find(candidate => candidate.source.type === 'customer' && candidate.source.tableId === config.parent!.tableId)
        if (!parent || !module.dependsOn.includes(parent.id)) return 'Модуль вопросов требует подключённый сценарий своих заказов'
      }
    }
  }
  const expected = legacyAppModules(app).map(module => moduleSourceKey(module.source))
  if (expected.length !== sources.size || expected.some(key => !sources.has(key))) return 'Не все рабочие сценарии приложения привязаны к модулям'
  const visiting = new Set<string>(), visited = new Set<string>()
  const cycle = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    if (byId.get(id)!.dependsOn.some(cycle)) return true
    visiting.delete(id); visited.add(id)
    return false
  }
  if (modules.some(module => cycle(module.id))) return 'Зависимости модулей образуют цикл'
  const base = modules.filter(module => module.kind !== 'support')
  if (base.length > 1 && !(app.moduleAccess && app.catalogScreenIds?.length && compatibleModuleKinds(modules.map(module => module.kind)))) return 'Это сочетание модулей ещё не поддерживается: сначала требуется настройка отдельных рабочих ролей и общего интерфейса'
  if (app.catalogScreenIds && (!app.moduleAccess || new Set(app.catalogScreenIds).size !== app.catalogScreenIds.length || !app.catalogScreenIds.includes(app.homeScreenId ?? '') || app.catalogScreenIds.some(id => {
    const screen = app.screens.find(screen => screen.id === id)
    return !screen || !['list', 'tiles'].includes(screen.type) || !screen.access.public
  }))) return 'Общий каталог должен использовать публичные каталоги подключённых модулей'
  if (base.length > 1 && base.some(module => {
    const count = app.catalogScreenIds!.filter(id => module.screenIds?.includes(id)).length
    const publicScreens = app.screens.some(screen => module.screenIds?.includes(screen.id) && screen.access.public)
    return count !== (module.kind === 'inventory' || module.kind === 'crm' && !publicScreens ? 0 : 1)
  })) return 'Общий каталог должен показывать каталог каждого внешнего модуля; внутренние экраны CRM остаются закрытыми'
  return null
}
