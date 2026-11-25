import { CELL_VALUE } from '../values'
import { isComputed, type FieldType } from '../fields'
import { appV2ChildIds, type AppV2, type AppV2Audience, type AppV2RowScope, type AppV2Step, type AppV2Target } from './schema'
import type { AppV2Binding, AppV2Condition } from './values'
import { appV2NavigationUrl } from './values'
import { validateTeamCalendar } from './team-calendar-validate'

export const appV2ListGroupFieldTypes: ReadonlySet<FieldType> = new Set(['single_select', 'text', 'checkbox', 'date', 'datetime'])

/** The server builds this catalog from the authoritative workspace, never from a browser payload. */
export type AppV2Catalog = {
  workspaceId: string
  tables: ReadonlyMap<string, { workspaceId: string }>
  fields: ReadonlyMap<string, { tableId: string; type: FieldType; relationTableId?: string; choiceIds?: readonly string[] }>
  views: ReadonlyMap<string, { tableId: string }>
}
export type AppV2Issue = { code: string; path: string; message: string }
type Context = { screenTableId?: string | null; rowTableId: string | null; formId: string | null; results: ReadonlyMap<string, string> }
const noResults = new Map<string, string>()

/** Semantic validation follows finite schema parsing. Errors are for the author, not runtime visitors. */
export function validateAppV2(app: AppV2, catalog: AppV2Catalog, options: { mode?: 'draft' | 'publish' } = {}): AppV2Issue[] {
  const issues: AppV2Issue[] = []
  const issue = (code: string, path: string, message: string) => { if (issues.length < 100) issues.push({ code, path, message }) }
  if (app.workspaceId !== catalog.workspaceId) issue('workspace_mismatch', 'workspaceId', 'Описание приложения относится к другому пространству')
  const index = <T extends { id: string }>(items: readonly T[], path: string) => {
    const map = new Map<string, T>()
    for (const item of items) { if (map.has(item.id)) issue('duplicate_id', path, `Идентификатор «${item.id}» повторяется`); map.set(item.id, item) }
    return map
  }
  const roles = index(app.roles, 'roles'), screens = index(app.screens, 'screens'), nodes = index(app.nodes, 'nodes')
  const sources = index(app.sources, 'sources'), flows = index(app.workflows, 'workflows')
  if (roles.has('guest')) issue('reserved_role', 'roles', 'Посетитель без входа не является рабочей ролью')
  const role = (id: string, path: string) => { if (!roles.has(id)) issue('missing_role', path, `Роль «${id}» не существует`) }
  const unique = (ids: readonly string[], path: string) => { if (new Set(ids).size !== ids.length) issue('duplicate_reference', path, 'Ссылка повторяется') }
  const audience = (value: AppV2Audience, path: string) => { if (value.kind === 'roles') { unique(value.roleIds, path); value.roleIds.forEach(id => role(id, path)) } }
  const table = (id: string, path: string): boolean => {
    if (catalog.tables.get(id)?.workspaceId !== catalog.workspaceId) { issue('unavailable_table', path, `Таблица «${id}» недоступна этому пространству`); return false }
    return true
  }
  const field = (id: string, tableId: string | null, path: string, writable = false) => {
    const found = catalog.fields.get(id)
    if (!found || !tableId || found.tableId !== tableId || catalog.tables.get(tableId)?.workspaceId !== catalog.workspaceId) { issue('unavailable_field', path, `Поле «${id}» не принадлежит таблице этого контекста`); return undefined }
    if (writable && isComputed(found.type)) issue('readonly_field', path, `Поле «${id}» вычисляется автоматически`)
    return found
  }
  if (app.authentication.defaultRoleId) role(app.authentication.defaultRoleId, 'authentication.defaultRoleId')
  const emails = new Set<string>()
  for (const [i, member] of app.authentication.members.entries()) {
    const path = `authentication.members.${i}`, email = member.email.trim().toLowerCase()
    if (emails.has(email)) issue('duplicate_member', path, 'Адрес участника повторяется')
    emails.add(email); unique(member.roleIds, path); member.roleIds.forEach(id => role(id, path))
  }
  if (app.homeScreenId && !screens.has(app.homeScreenId)) issue('missing_screen', 'homeScreenId', 'Стартовый экран удалён')
  if (options.mode === 'publish' && (!app.screens.length || !app.homeScreenId)) issue('missing_home', 'homeScreenId', 'Выберите стартовый экран перед публикацией')

  const formFields = new Map<string, Set<string>>()
  for (const form of app.nodes.filter(node => node.type === 'form')) {
    const fields = new Set<string>(), visited = new Set<string>(), pending = [...appV2ChildIds(form)]
    while (pending.length) {
      const id = pending.pop()!
      if (visited.has(id)) continue
      visited.add(id)
      const node = nodes.get(id)
      if (node?.type === 'input') { if (fields.has(node.fieldId)) issue('duplicate_input', `nodes.${form.id}`, 'Поле повторяется в одной форме'); fields.add(node.fieldId) }
      if (node && node.type !== 'form') pending.push(...appV2ChildIds(node))
    }
    formFields.set(form.id, fields)
  }
  const binding = (value: AppV2Binding, context: Context, path: string) => {
    if (value.kind === 'record_ids') {
      table(value.tableId, path)
      const target = value.record.kind === 'screen' ? context.screenTableId : value.record.kind === 'row' ? context.rowTableId : context.results.get(value.record.stepId)
      if (!target || target !== value.tableId) issue('relation_record_context', path, 'Связанная запись должна относиться к выбранной таблице')
    } else if (value.kind === 'screen_row') field(value.fieldId, context.screenTableId ?? null, path)
    else if (value.kind === 'screen_row_id' && !context.screenTableId) issue('missing_screen_context', path, 'Для этого значения нужна открытая запись экрана')
    else if (value.kind === 'row') field(value.fieldId, context.rowTableId, path)
    else if (value.kind === 'row_id' && !context.rowTableId) issue('missing_row_context', path, 'Для этого значения нужна выбранная запись')
    else if (value.kind === 'form') {
      const form = nodes.get(value.formId)
      if (context.formId !== value.formId || form?.type !== 'form') issue('invalid_form_context', path, 'Значение относится к другой форме')
      else { field(value.fieldId, form.tableId, path); if (!formFields.get(form.id)?.has(value.fieldId)) issue('missing_form_input', path, 'Этого поля нет в форме') }
    } else if (value.kind === 'result' || value.kind === 'result_id') {
      const tableId = context.results.get(value.stepId)
      if (!tableId) issue('unavailable_result', path, 'Результат шага недоступен на этом пути действия')
      else if (value.kind === 'result') field(value.fieldId, tableId, path)
    }
  }
  const family = (type: FieldType | undefined): string => {
    if (!type || type === 'formula' || type === 'rollup') return 'unknown'
    if (type === 'number' || type === 'count') return 'number'
    if (type === 'checkbox') return 'boolean'
    if (['relation', 'member', 'multi_select', 'attachment', 'image', 'lookup'].includes(type)) return 'array'
    return 'string'
  }
  const bindingFamily = (value: AppV2Binding, context: Context): string => {
    if (value.kind === 'record_ids') return 'array'
    if (value.kind === 'literal') return value.value === null ? 'null' : Array.isArray(value.value) ? 'array' : typeof value.value
    if (value.kind === 'user' || value.kind === 'row_id' || value.kind === 'screen_row_id' || value.kind === 'result_id') return 'string'
    return family(catalog.fields.get(value.fieldId)?.type)
  }
  const condition = (value: AppV2Condition, context: Context, path: string, depth = 0): void => {
    if (depth > 8) { issue('condition_depth', path, 'Слишком много вложенных условий'); return }
    if ('conditions' in value) value.conditions.forEach((item, i) => condition(item, context, `${path}.conditions.${i}`, depth + 1))
    else if ('value' in value) binding(value.value, context, `${path}.value`)
    else {
      binding(value.left, context, `${path}.left`); binding(value.right, context, `${path}.right`)
      const a = bindingFamily(value.left, context), b = bindingFamily(value.right, context)
      if (value.op === 'includes' && (value.left.kind === 'row' || value.left.kind === 'screen_row') && (value.right.kind === 'row_id' || value.right.kind === 'screen_row_id')) {
        const relation = catalog.fields.get(value.left.fieldId)
        const target = value.right.kind === 'screen_row_id' ? context.screenTableId : context.rowTableId
        if (relation?.relationTableId && relation.relationTableId !== target) issue('relation_context', path, 'Связь ведёт к другой таблице, а не к выбранной записи')
      }
      const wrong = (expected: string) => [a, b].some(type => type !== expected && type !== 'unknown')
      if (value.op === 'includes' && (a !== 'array' && a !== 'unknown' || ['array', 'object', 'null'].includes(b)) || ['gt', 'gte', 'lt', 'lte'].includes(value.op) && wrong('number') || value.op === 'contains' && wrong('string') || ['eq', 'ne'].includes(value.op) && ([a, b].some(type => type === 'array' || type === 'object') || a !== b && ![a, b].some(type => type === 'null' || type === 'unknown'))) issue('condition_type', path, 'Значения не подходят для выбранного сравнения')
    }
  }
  for (const source of app.sources) {
    const path = `sources.${source.id}`, context: Context = { screenTableId: source.screenTableId ?? null, rowTableId: source.tableId, formId: null, results: noResults }
    table(source.tableId, path)
    if (source.screenTableId) table(source.screenTableId, `${path}.screenTableId`)
    if (source.viewId && catalog.views.get(source.viewId)?.tableId !== source.tableId) issue('unavailable_view', path, 'Представление принадлежит другой таблице или удалено')
    if (source.filter) condition(source.filter, context, `${path}.filter`)
    source.sorts.forEach(sort => field(sort.fieldId, source.tableId, `${path}.sorts`))
    unique(source.searchFieldIds, `${path}.searchFieldIds`)
    source.searchFieldIds.forEach(id => field(id, source.tableId, `${path}.searchFieldIds`))
  }
  const event = (workflowId: string | null, context: Context, path: string) => {
    if (!workflowId) return
    const flow = flows.get(workflowId)
    if (!flow) issue('missing_workflow', path, 'Выбранное действие удалено')
    else if (flow.input.rowTableId !== context.rowTableId || flow.input.formId !== context.formId || flow.input.screenTableId && flow.input.screenTableId !== context.screenTableId) issue('workflow_context', path, 'Действию нужна другая запись или форма')
  }
  const reached = new Set<string>(), active = new Set<string>()
  const visit = (id: string, context: Context, path: string, depth: number, insideCollection = false): void => {
    if (active.has(id)) { issue('component_cycle', path, 'Элемент вложен сам в себя'); return }
    if (reached.has(id)) { issue('multiple_parents', path, 'Элемент нельзя разместить в двух местах одновременно'); return }
    const node = nodes.get(id)
    if (!node) { issue('missing_node', path, `Элемент «${id}» удалён`); return }
    if (depth > 12) { issue('component_depth', path, 'Слишком много вложенных элементов'); return }
    reached.add(id); active.add(id)
    const ownPath = `nodes.${id}`
    if (node.visibleTo) audience(node.visibleTo, `${ownPath}.visibleTo`)
    if (node.visibleWhen) condition(node.visibleWhen, context, `${ownPath}.visibleWhen`)
    if ('value' in node) binding(node.value, context, `${ownPath}.value`)
    if (node.type === 'profile') {
      binding(node.title, context, `${ownPath}.title`)
      if (node.subtitle) binding(node.subtitle, context, `${ownPath}.subtitle`)
      if (node.image) binding(node.image, context, `${ownPath}.image`)
      node.contacts.forEach((contact, i) => binding(contact.value, context, `${ownPath}.contacts.${i}`))
    }
    if (node.type === 'team_calendar') {
      if (insideCollection || context.formId || context.rowTableId) issue('team_calendar_placement', ownPath, 'Добавьте календарь команды на отдельный экран, вне формы и строк списка')
      for (const problem of validateTeamCalendar(app, node, catalog, options.mode === 'publish')) issue(problem.code, problem.path, problem.message)
    }
    if((node.type==='gallery'||node.type==='files')&&(node.value.kind==='row'||node.value.kind==='screen_row')){
      const selected=catalog.fields.get(node.value.fieldId)
      if(selected&&!['image','attachment','url','text','long_text'].includes(selected.type))issue('media_field_type',ownPath,'Выберите поле с фотографиями, файлами или ссылками')
    }
    if (node.type === 'button') event(node.events.press, context, `${ownPath}.events.press`)
    if (node.type === 'business') {
      if (insideCollection || context.formId) issue('business_placement', ownPath, 'Добавьте бизнес-операцию на экран или в карточку')
      if (node.target?.appId === app.id) issue('business_self_reference', ownPath, 'Выберите другое опубликованное приложение')
      if (!node.target && options.mode === 'publish') issue('missing_business_target', ownPath, 'Выберите рабочий сценарий и операцию')
    }
    let childrenContext = context
    if (node.type === 'collection' || node.type === 'metric' || node.type === 'chart') {
      const source = sources.get(node.sourceId)
      if (!source) issue('missing_source', ownPath, 'Источник данных удалён')
      else if (source.screenTableId && source.screenTableId !== context.screenTableId) issue('source_screen_context', ownPath, 'Источник относится к другой открытой записи экрана')
      if(source&&node.type==='chart'){
        if(insideCollection)issue('repeated_chart',ownPath,'Разместите диаграмму вне повторяющихся строк списка')
        const group=field(node.groupFieldId,source.tableId,ownPath)
        if(group&&!['text','long_text','single_select','checkbox','date','datetime'].includes(group.type))issue('chart_group_type',ownPath,'Выберите текст, статус или дату для категорий')
        if(node.chartType==='line'&&group&&!['date','datetime'].includes(group.type))issue('chart_line_date',ownPath,'Для линии выберите поле даты')
        if(node.chartType==='donut'&&node.operation==='avg')issue('chart_donut_average',ownPath,'Среднее показывайте столбцами или линией')
        if(node.operation!=='count'&&!node.fieldId)issue('missing_chart_value',ownPath,'Выберите числовое поле для диаграммы')
        if(node.fieldId){const value=field(node.fieldId,source.tableId,ownPath);if(value&&!['number','count','rollup','formula'].includes(value.type))issue('chart_value_type',ownPath,'Для расчёта нужно числовое поле')}
      }else if (source && node.type === 'metric') {
        if (node.operation !== 'count' && !node.fieldId) issue('missing_metric_field', ownPath, 'Выберите поле для расчёта')
        if (node.fieldId) {
          const found = field(node.fieldId, source.tableId, ownPath)
          if (node.operation !== 'count' && found && !['number', 'count', 'rollup', 'formula'].includes(found.type)) issue('metric_type', ownPath, 'Для этого расчёта нужно числовое поле')
        }
      } else if (source && node.type === 'collection') {
        field(node.titleFieldId, source.tableId, ownPath)
        if(node.dateFieldId){const found=field(node.dateFieldId,source.tableId,ownPath);if(found&&!['date','datetime'].includes(found.type))issue('calendar_field_type',ownPath,'Для календаря выберите поле даты')}
        if(node.groupFieldId){const found=field(node.groupFieldId,source.tableId,ownPath);if(found&&found.type!=='single_select')issue('board_field_type',ownPath,'Для колонок выберите поле с одним вариантом')}
        if (node.listGroupFieldId) {
          const found = field(node.listGroupFieldId, source.tableId, ownPath)
          if (node.layout === 'calendar' || node.layout === 'kanban' || (found && !appV2ListGroupFieldTypes.has(found.type))) issue('list_group_field', ownPath, 'Для группировки списка выберите поле с вариантом, текстом, отметкой или датой')
        }
        if (node.recordGroup) {
          const key = field(node.recordGroup.fieldId, source.tableId, ownPath)
          const amount = node.recordGroup.amountFieldId && field(node.recordGroup.amountFieldId, source.tableId, ownPath)
          if (node.layout !== 'list' || (key && !['text', 'number', 'single_select'].includes(key.type))) issue('record_group_field', ownPath, 'Для объединения строк списка выберите текст, число или один вариант')
          if (amount && !['number', 'count', 'rollup', 'formula'].includes(amount.type)) issue('record_group_amount', ownPath, 'Для суммы выберите числовое поле')
        }
        if(node.kanbanMoveRoleIds)for(const id of node.kanbanMoveRoleIds)if(!roles.has(id))issue('missing_role',ownPath,'Выберите существующую роль для смены статуса')
        if(node.layout==='calendar'&&!node.dateFieldId)issue('missing_calendar_field',ownPath,'Выберите поле даты для календаря')
        if(node.layout==='timeline'&&!node.dateFieldId)issue('missing_timeline_field',ownPath,'Выберите поле даты для ленты')
        if(node.layout==='history'&&!node.dateFieldId)issue('missing_history_field',ownPath,'Выберите дату события для истории')
        if(node.statusFieldId){const found=field(node.statusFieldId,source.tableId,ownPath);if(found&&found.type!=='single_select')issue('history_status_type',ownPath,'Для статуса выберите поле с одним вариантом')}
        if(node.historyNoteFieldId)field(node.historyNoteFieldId,source.tableId,ownPath)
        if(node.layout==='kanban'&&!node.groupFieldId)issue('missing_board_field',ownPath,'Выберите поле статуса для канбана')
        if (node.subtitleFieldId) field(node.subtitleFieldId, source.tableId, ownPath)
        if (node.cardImageFieldId) {
          const image = field(node.cardImageFieldId, source.tableId, ownPath)
          if (image && !['image', 'url'].includes(image.type)) issue('card_image_field', ownPath, 'Для фото карточки выберите поле с фото или ссылкой')
        }
        if (node.cardDetailFieldId) field(node.cardDetailFieldId, source.tableId, ownPath)
        childrenContext = { screenTableId: context.screenTableId, rowTableId: source.tableId, formId: null, results: noResults }
        event(node.events.itemPress, childrenContext, `${ownPath}.events.itemPress`)
      }
    }
    if (node.type === 'form') {
      table(node.tableId, ownPath)
      if (context.formId) issue('nested_form', ownPath, 'Форму нельзя поместить внутрь другой формы')
      if (node.mode === 'edit' && context.rowTableId !== node.tableId) issue('edit_form_context', ownPath, 'Форма редактирования должна получить запись своей таблицы')
      childrenContext = { ...context, formId: node.id }
      event(node.events.submit, childrenContext, `${ownPath}.events.submit`)
    }
    if (node.type === 'input') {
      const form = context.formId ? nodes.get(context.formId) : undefined
      if (form?.type !== 'form') issue('input_outside_form', ownPath, 'Поле ввода должно находиться в форме')
      else {
        field(node.fieldId, form.tableId, ownPath, true)
        if (insideCollection) issue('repeated_form_input', ownPath, 'Разместите форму отдельно от повторяющихся элементов списка')
      }
      if (node.initialValue) {
        const value = node.initialValue, path = `${ownPath}.initialValue`
        binding(value, { ...context, formId: null }, path)
        const found = catalog.fields.get(node.fieldId)
        if (found && value.kind === 'literal' && !CELL_VALUE[found.type].safeParse(value.value).success) issue('literal_type', path, 'Начальное значение не подходит типу поля')
        if (found && value.kind !== 'literal' && bindingFamily(value, context) !== family(found.type) && ![bindingFamily(value, context), family(found.type)].includes('unknown')) issue('binding_type', path, 'Начальное значение не подходит типу поля')
        if (value.kind === 'record_ids' && (found?.type !== 'relation' || found.relationTableId !== value.tableId)) issue('relation_target', path, 'Поле связи ведёт к другой таблице')
      }
    }
    const childIds = appV2ChildIds(node); unique(childIds, ownPath)
    childIds.forEach(childId => visit(childId, childrenContext, ownPath, depth + 1, insideCollection || node.type === 'collection'))
    active.delete(id)
  }
  for (const screen of app.screens) {
    const path = `screens.${screen.id}`, context: Context = { screenTableId: screen.contextTableId, rowTableId: screen.contextTableId, formId: null, results: noResults }
    audience(screen.audience, path)
    if (screen.contextTableId) table(screen.contextTableId, path)
    if (screen.recordTitleFieldId) {
      if (screen.contextTableId) field(screen.recordTitleFieldId, screen.contextTableId, path)
      else issue('record_title_context', path, 'Поле заголовка можно выбрать для карточки записи')
    }
    if (screen.catalog) {
      if (!screen.contextTableId) issue('catalog_context', path, 'Витрину можно выбрать для карточки записи')
      else {
        for (const fieldId of Object.values(screen.catalog)) if (fieldId) field(fieldId, screen.contextTableId, path)
        const image = screen.catalog.imageFieldId && field(screen.catalog.imageFieldId, screen.contextTableId, path)
        if (image && !['image', 'url'].includes(image.type)) issue('catalog_image_field', path, 'Выберите поле с фотографиями или ссылками')
      }
    }
    if (screen.contextTableId && (screen.navigation || screen.id === app.homeScreenId)) issue('navigation_context', path, 'Карточку выбранной записи открывают из списка, а не из главного меню')
    event(screen.events.enter, context, `${path}.events.enter`)
    unique(screen.rootIds, `${path}.rootIds`)
    screen.rootIds.forEach(id => visit(id, context, path, 0))
  }
  for (const node of app.nodes) if (!reached.has(node.id)) issue('orphan_node', `nodes.${node.id}`, 'Элемент не принадлежит ни одному экрану')
  const targetTable = (value: AppV2Target, context: Context, path: string): string | null => {
    const tableId = value.kind === 'current' ? context.rowTableId : context.results.get(value.stepId)
    if (!tableId) issue('missing_record_context', path, 'Запись недоступна на этом шаге')
    return tableId ?? null
  }
  for (const flow of app.workflows) {
    const path = `workflows.${flow.id}`, seen = new Set<string>(); let count = 0
    if (flow.input.screenTableId) table(flow.input.screenTableId, `${path}.input.screenTableId`)
    if (flow.input.rowTableId) table(flow.input.rowTableId, `${path}.input`)
    if (flow.input.formId && nodes.get(flow.input.formId)?.type !== 'form') issue('missing_form', `${path}.input`, 'Форма действия удалена')
    const steps = (items: readonly AppV2Step[], context: Context, parent: string, depth: number): void => {
      if (depth > 8) { issue('workflow_depth', parent, 'Слишком много вложенных ветвей'); return }
      const results = new Map(context.results), current = { ...context, results }
      for (const step of items) {
        const ownPath = `${parent}.${step.id}`
        if (++count > 200) { issue('workflow_size', parent, 'В одном действии доступно до 200 шагов'); return }
        if (seen.has(step.id)) issue('duplicate_step', ownPath, 'Идентификатор шага повторяется')
        seen.add(step.id)
        if (step.type === 'require' || step.type === 'branch') condition(step.condition, current, `${ownPath}.condition`)
        if (step.type === 'branch') {
          steps(step.then, current, `${ownPath}.then`, depth + 1); steps(step.else, current, `${ownPath}.else`, depth + 1)
          // A result created in one branch is not definitely available after that branch.
        } else if (step.type === 'order_purchase_order' || step.type === 'receive_purchase_order' || step.type === 'cancel_purchase_order') {
          const ordersId = app.inventory?.purchaseOrdersTableId
          if (!app.inventory || !ordersId) issue('missing_inventory', ownPath, 'Приёмка заказа доступна только в установленном складе')
          else if (current.rowTableId !== ordersId) issue('missing_record_context', ownPath, 'Откройте заказ поставщику')
          else { table(ordersId, ownPath); results.set(step.id, ordersId) }
        } else if (step.type === 'post_inventory_count' || step.type === 'cancel_inventory_count') {
          const countsId = app.inventory?.inventoryCountsTableId
          if (!app.inventory || !countsId) issue('missing_inventory', ownPath, 'Инвентаризация доступна только в установленном складе')
          else if (current.rowTableId !== countsId) issue('missing_record_context', ownPath, 'Откройте инвентаризацию')
          else { table(countsId, ownPath); results.set(step.id, countsId) }
        } else if (step.type === 'create_row' || step.type === 'update_row' || step.type === 'place_shop_order' || step.type === 'record_inventory_movement' || step.type === 'create_purchase_order' || step.type === 'update_purchase_order' || step.type === 'create_inventory_count' || step.type === 'update_inventory_count' || step.type === 'create_reorder_orders') {
          const writeTableId = step.type === 'record_inventory_movement' ? app.inventory?.movementsTableId : step.tableId
          if (step.type === 'record_inventory_movement') {
            if (!app.inventory) issue('missing_inventory', ownPath, 'Складское движение доступно только в установленном складе')
            else if (!writeTableId) issue('missing_inventory', ownPath, 'Таблица движений склада не настроена')
            else table(writeTableId, ownPath)
          } else {
            table(step.tableId, ownPath)
          }
          if (step.type === 'place_shop_order') {
            if (!app.shop) issue('missing_shop', ownPath, 'Оформление заказа доступно только в установленном магазине')
            else if (step.tableId !== app.shop.ordersTableId) issue('shop_order_table', ownPath, 'Оформление заказа записывает таблицу заказов')
            else if (step.values[app.shop.emailFieldId] || step.values[app.shop.statusFieldId] || step.values[app.shop.positionsFieldId]) issue('shop_server_field', ownPath, 'Почту, статус и состав заказа заполняет сервер')
            else if (step.values[app.shop.cartFieldId]?.kind !== 'form' || step.values[app.shop.submissionFieldId]?.kind !== 'form') issue('shop_cart_binding', ownPath, 'Корзина и ключ оформления берутся из формы')
          }
          if ((step.type === 'create_purchase_order' || step.type === 'update_purchase_order')) {
            const ordersId = app.inventory?.purchaseOrdersTableId
            if (!app.inventory || !ordersId) issue('missing_inventory', ownPath, 'Заказ поставщику доступен только в установленном складе')
            else if (step.tableId !== ordersId) issue('purchase_order_table', ownPath, 'Заказ поставщику записывает таблицу заказов')
            else {
              const inv = app.inventory
              const required = [inv.purchaseSupplierFieldId, inv.purchaseWarehouseFieldId, inv.purchaseDateFieldId, inv.purchaseCommentFieldId, inv.purchasePayloadFieldId]
              if (required.some(fieldId => !fieldId || step.values[fieldId]?.kind !== 'form')) issue('purchase_form_binding', ownPath, 'Поставщик, склад, дата, комментарий и состав берутся из формы')
              const serverFields = [inv.purchaseNameFieldId, inv.purchaseStatusFieldId, inv.purchaseLinesFieldId, inv.purchaseTotalFieldId, inv.purchaseCountFieldId]
              if (serverFields.some(fieldId => fieldId && step.values[fieldId])) issue('purchase_server_field', ownPath, 'Название, статус, позиции и сумму заполняет сервер')
              if (step.type === 'update_purchase_order' && current.rowTableId !== step.tableId) issue('missing_record_context', ownPath, 'Откройте заказ поставщику')
            }
          }
          if (step.type === 'create_inventory_count' || step.type === 'update_inventory_count') {
            const countsId = app.inventory?.inventoryCountsTableId
            if (!app.inventory || !countsId) issue('missing_inventory', ownPath, 'Инвентаризация доступна только в установленном складе')
            else if (step.tableId !== countsId) issue('inventory_count_table', ownPath, 'Инвентаризация записывает таблицу инвентаризаций')
            else {
              const inv = app.inventory
              if (step.type === 'create_inventory_count') {
                const required = [inv.countWarehouseFieldId, inv.countDateFieldId, inv.countPayloadFieldId]
                if (required.some(fieldId => !fieldId || step.values[fieldId]?.kind !== 'form')) issue('inventory_count_form', ownPath, 'Склад, дата и состав берутся из формы')
              } else {
                const required = [inv.countDateFieldId, inv.countPayloadFieldId]
                if (required.some(fieldId => !fieldId || step.values[fieldId]?.kind !== 'form')) issue('inventory_count_form', ownPath, 'Дата и состав берутся из формы')
                if (current.rowTableId !== step.tableId) issue('missing_record_context', ownPath, 'Откройте инвентаризацию')
              }
            }
          }
          if (step.type === 'create_reorder_orders') {
            const ordersId = app.inventory?.purchaseOrdersTableId
            const payloadId = app.inventory?.reorderPayloadFieldId ?? app.inventory?.purchasePayloadFieldId
            if (!app.inventory || !ordersId) issue('missing_inventory', ownPath, 'Заказ из остатков доступен только в установленном складе')
            else if (step.tableId !== ordersId) issue('reorder_order_table', ownPath, 'Заказы из остатков пишут таблицу заказов')
            else if (!payloadId || step.values[payloadId]?.kind !== 'form') issue('reorder_form_binding', ownPath, 'Список товаров берётся из формы')
          }
          if (step.type === 'record_inventory_movement' && app.inventory) {
            const inv = app.inventory
            const required = [inv.movementQtyFieldId, inv.movementWarehouseFieldId, inv.movementNoteFieldId, inv.movementDateFieldId]
            if (step.operation === 'transfer') required.push(inv.movementWarehouseToFieldId)
            for (const fieldId of required) {
              if (!step.values[fieldId] || step.values[fieldId]?.kind !== 'form') issue('inventory_form_binding', ownPath, 'Количество, склад, дата и комментарий берутся из формы')
            }
            for (const fieldId of [inv.movementTypeFieldId, inv.movementItemFieldId, inv.movementAuthorFieldId, inv.movementNameFieldId, inv.movementBeforeFieldId, inv.movementAfterFieldId]) {
              if (fieldId && step.values[fieldId]) issue('inventory_server_field', ownPath, 'Тип, товар, автора и остатки заполняет сервер')
            }
          }
          if (step.type === 'update_row' && targetTable(step.target, current, ownPath) !== step.tableId) issue('record_table_mismatch', ownPath, 'Запись относится к другой таблице')
          if (!Object.keys(step.values).length) issue('empty_write', ownPath, 'Укажите значения полей для изменения')
          for (const [id, value] of Object.entries(step.values)) {
            const found = writeTableId ? field(id, writeTableId, `${ownPath}.values.${id}`, true) : undefined
            binding(value, current, `${ownPath}.values.${id}`)
            if (value.kind === 'record_ids' && (found?.type !== 'relation' || found.relationTableId !== value.tableId)) issue('relation_target', `${ownPath}.values.${id}`, 'Поле связи ведёт к другой таблице')
            if (found && value.kind === 'literal' && !CELL_VALUE[found.type].safeParse(value.value).success) issue('literal_type', `${ownPath}.values.${id}`, 'Значение не соответствует типу поля')
            if (found && value.kind !== 'literal') {
              const sourceType = bindingFamily(value, current), targetType = family(found.type)
              if (sourceType !== targetType && sourceType !== 'unknown' && targetType !== 'unknown') issue('binding_type', `${ownPath}.values.${id}`, 'Источник значения не соответствует типу поля')
            }
          }
          if (writeTableId) results.set(step.id, writeTableId)
        } else if (step.type === 'delete_row') {
          table(step.tableId, ownPath)
          if (targetTable(step.target, current, ownPath) !== step.tableId) issue('record_table_mismatch', ownPath, 'Запись относится к другой таблице')
        } else if (step.type === 'open_screen') {
          const screen = screens.get(step.screenId)
          if (!screen) issue('missing_screen', ownPath, 'Экран перехода удалён')
          else if (screen.contextTableId !== (step.record ? targetTable(step.record, current, ownPath) : null)) issue('screen_context', ownPath, 'Экрану нужна запись другой таблицы')
        } else if (step.type === 'notify') binding(step.message, current, ownPath)
        else if (step.type === 'open_url' || step.type === 'copy_value') {
          binding(step.value, current, ownPath)
          if (step.type === 'open_url' && step.value.kind === 'literal' && appV2NavigationUrl(step.value.value) === null) issue('unsafe_url', ownPath, 'Укажите адрес страницы HTTP или HTTPS')
        }
      }
    }
    steps(flow.steps, { ...flow.input, results: noResults }, `${path}.steps`, 0)
  }
  const tables = new Set<string>()
  const rowScope = (value: AppV2RowScope, tableId: string, path: string) => {
    if (value.kind === 'owned') {
      const found = field(value.fieldId, tableId, path)
      if (found && !['text', 'email', 'created_by', 'updated_by'].includes(found.type)) issue('owner_field_type', path, 'Для владельца записи нужно текстовое поле или почта')
    }
  }
  if (app.booking) {
    const booking = app.booking, path = 'booking'
    for (const [key, values] of [["services", booking.service], ["masters", booking.master], ["schedule", booking.schedule], ["visits", booking.visit]] as const) {
      table(booking.tables[key], path)
      for (const fieldId of Object.values(values)) {
        const column = catalog.fields.get(fieldId)
        if (!column || column.tableId !== booking.tables[key]) issue('booking_field', path, 'Поле записи относится к другой таблице или удалено')
      }
    }
    for (const screenId of [booking.catalogScreenId, booking.serviceScreenId, booking.mastersScreenId, booking.masterScreenId, booking.visitScreenId, booking.clientScreenId, booking.listScreenId, booking.formScreenId, booking.rescheduleScreenId, booking.setupScreenId]) if (!screenId || !screens.has(screenId)) issue('booking_screen', path, 'Экран онлайн-записи удалён')
    for (const formId of [booking.createFormId, booking.rescheduleFormId, booking.statusFormId, ...(booking.ownerCreateFormId ? [booking.ownerCreateFormId] : [])]) if (nodes.get(formId)?.type !== 'form') issue('booking_form', path, 'Форма онлайн-записи удалена')
    if (booking.periodScreenId && !screens.has(booking.periodScreenId)) issue('booking_screen', path, 'Экран рабочего времени удалён')
    if (booking.clients) {
      const clients = booking.clients
      table(clients.tableId, path)
      for (const id of [clients.name, clients.phone, clients.email, clients.note, clients.photo, clients.telegram, clients.whatsapp, clients.max, clients.otherMessengerLabel, clients.otherMessengerValue]) if (id) field(id, clients.tableId, path)
      const relation = field(clients.linkFieldId, booking.tables.visits, path)
      if (relation && (relation.type !== 'relation' || relation.relationTableId !== clients.tableId)) issue('booking_client_relation', path, 'Визит должен ссылаться на таблицу клиентов')
      for (const id of [booking.customersScreenId,booking.customerScreenId]) if (!id || !screens.has(id)) issue('booking_screen', path, 'Экран клиентов удалён')
      for (const id of [booking.customerCreateFormId,booking.customerEditFormId]) if (!id || nodes.get(id)?.type !== 'form') issue('booking_form', path, 'Форма клиента удалена')
    }
    for (const [fieldId, tableId] of [[booking.servicePhotoFieldId, booking.tables.services], [booking.serviceDescriptionFieldId, booking.tables.services], [booking.masterPhotoFieldId, booking.tables.masters], [booking.masterDescriptionFieldId, booking.tables.masters], [booking.masterRoleFieldId, booking.tables.masters]]) if (fieldId && catalog.fields.get(fieldId)?.tableId !== tableId) issue('booking_field', path, 'Поле карточки относится к другой таблице')
  }
  if (app.dispatch) {
    const dispatch = app.dispatch, path = 'dispatch'
    table(dispatch.jobsTableId, path); table(dispatch.clientsTableId, path); table(dispatch.mastersTableId, path); table(dispatch.notesTableId, path)
    const group = (tableId: string, values: Record<string, string | undefined>) => {
      for (const fieldId of Object.values(values)) if (fieldId) field(fieldId, tableId, path)
    }
    group(dispatch.jobsTableId, dispatch.job)
    group(dispatch.clientsTableId, dispatch.client)
    group(dispatch.mastersTableId, dispatch.master)
    group(dispatch.notesTableId, dispatch.note)
    const technician = field(dispatch.job.technician, dispatch.jobsTableId, path)
    if (technician && technician.relationTableId && technician.relationTableId !== dispatch.mastersTableId) issue('dispatch_technician', path, 'Заявка должна ссылаться на таблицу мастеров')
    const client = field(dispatch.job.client, dispatch.jobsTableId, path)
    if (client && client.relationTableId && client.relationTableId !== dispatch.clientsTableId) issue('dispatch_client', path, 'Заявка должна ссылаться на таблицу клиентов')
    for (const screenId of [dispatch.overviewScreenId, dispatch.boardScreenId, dispatch.jobScreenId, dispatch.clientsScreenId, dispatch.clientScreenId, dispatch.technicianScreenId, dispatch.mastersScreenId]) if (!screens.has(screenId)) issue('dispatch_screen', path, 'Экран заявок удалён')
    for (const formId of [dispatch.createJobFormId, dispatch.assignFormId, dispatch.noteFormId, dispatch.completeFormId, dispatch.progressFormId, dispatch.billingFormId, dispatch.repeatFormId]) if (formId && nodes.get(formId)?.type !== 'form') issue('dispatch_form', path, 'Форма заявок удалена')
    if (dispatch.typesTableId) {
      table(dispatch.typesTableId, path)
      const relation = dispatch.job.type ? catalog.fields.get(dispatch.job.type) : undefined
      if (relation && relation.relationTableId && relation.relationTableId !== dispatch.typesTableId) issue('dispatch_type', path, 'Тип работы должен ссылаться на справочник типов')
    }
    const calendar = nodes.get(dispatch.calendarNodeId)
    if (calendar?.type !== 'team_calendar') issue('dispatch_calendar', path, 'Доска дня должна быть календарём команды')
  }
  if (app.support) {
    const support = app.support, path = 'support'
    table(support.ticketsTableId, path); table(support.clientsTableId, path); table(support.operatorsTableId, path)
    table(support.categoriesTableId, path); table(support.repliesTableId, path); table(support.notesTableId, path)
    const group = (tableId: string, values: Record<string, string | undefined>) => {
      for (const fieldId of Object.values(values)) if (fieldId) field(fieldId, tableId, path)
    }
    group(support.ticketsTableId, support.ticket)
    group(support.clientsTableId, support.client)
    group(support.operatorsTableId, support.operator)
    group(support.categoriesTableId, support.category)
    group(support.repliesTableId, support.reply)
    group(support.notesTableId, support.note)
    const client = field(support.ticket.client, support.ticketsTableId, path)
    if (client && client.relationTableId && client.relationTableId !== support.clientsTableId) issue('support_client', path, 'Обращение должно ссылаться на клиентов')
    const assignee = field(support.ticket.assignee, support.ticketsTableId, path)
    if (assignee && assignee.relationTableId && assignee.relationTableId !== support.operatorsTableId) issue('support_assignee', path, 'Ответственный должен ссылаться на операторов')
    const category = field(support.ticket.category, support.ticketsTableId, path)
    if (category && category.relationTableId && category.relationTableId !== support.categoriesTableId) issue('support_category', path, 'Категория обращения должна ссылаться на справочник')
    const replyTicket = field(support.reply.ticket, support.repliesTableId, path)
    if (replyTicket && replyTicket.relationTableId && replyTicket.relationTableId !== support.ticketsTableId) issue('support_reply', path, 'Ответ должен ссылаться на обращение')
    const noteTicket = field(support.note.ticket, support.notesTableId, path)
    if (noteTicket && noteTicket.relationTableId && noteTicket.relationTableId !== support.ticketsTableId) issue('support_note', path, 'Заметка должна ссылаться на обращение')
    if (support.repliesTableId === support.notesTableId) issue('support_notes_table', path, 'Внутренние заметки хранятся отдельно от ответов клиенту')
    if (support.eventsTableId) {
      table(support.eventsTableId, path)
      if (support.event) group(support.eventsTableId, support.event)
    }
    if (support.slaTableId) {
      table(support.slaTableId, path)
      if (support.slaFields) group(support.slaTableId, support.slaFields)
    }
    if (support.dashboardScreenId && !screens.has(support.dashboardScreenId)) issue('support_screen', path, 'Экран обращений удалён')
    if (support.boardScreenId && !screens.has(support.boardScreenId)) issue('support_screen', path, 'Экран обращений удалён')
    if (support.clientScreenId && !screens.has(support.clientScreenId)) issue('support_screen', path, 'Экран обращений удалён')
    if (support.teamScreenId && !screens.has(support.teamScreenId)) issue('support_screen', path, 'Экран обращений удалён')
    const statusIds = [support.statuses.fresh, support.statuses.progress, support.statuses.waiting, support.statuses.resolved, support.statuses.closed]
    if (new Set(statusIds).size !== statusIds.length) issue('support_status', path, 'Статусы обращения должны различаться')
    for (const screenId of [support.queueScreenId, support.ticketScreenId, support.clientListScreenId, support.clientTicketScreenId, support.clientsScreenId, support.settingsScreenId]) if (!screens.has(screenId)) issue('support_screen', path, 'Экран обращений удалён')
    for (const formId of [support.createFormId, support.operatorCreateFormId, support.replyFormId, support.noteFormId, support.assignFormId, support.categoryFormId]) if (nodes.get(formId)?.type !== 'form') issue('support_form', path, 'Форма обращений удалена')
    const clientTicket = screens.get(support.clientTicketScreenId)
    const clientList = screens.get(support.clientListScreenId)
    if (clientTicket?.audience.kind === 'public' || clientList?.audience.kind === 'public') issue('support_client_public', path, 'Кабинет обращений не бывает публичным')
    const noteOnClient = app.sources.some(source => source.tableId === support.notesTableId && app.nodes.some(node => node.type === 'collection' && node.sourceId === source.id && clientTicket?.rootIds.includes(node.id)))
    if (noteOnClient) issue('support_client_notes', path, 'Экран клиента не показывает внутренние заметки')
    const eventOnClient = Boolean(support.eventsTableId && app.sources.some(source => source.tableId === support.eventsTableId && app.nodes.some(node => node.type === 'collection' && node.sourceId === source.id && (clientTicket?.rootIds.includes(node.id) || clientList?.rootIds.includes(node.id)))))
    if (eventOnClient) issue('support_client_events', path, 'Экран клиента не показывает служебные события')
  }
  if (app.service) {
    const service = app.service, path = 'service'
    table(service.repairsTableId, path); table(service.clientsTableId, path); table(service.mastersTableId, path)
    table(service.repliesTableId, path); table(service.notesTableId, path)
    const group = (tableId: string, values: Record<string, string | undefined>) => {
      for (const fieldId of Object.values(values)) if (fieldId) field(fieldId, tableId, path)
    }
    group(service.repairsTableId, service.repair)
    group(service.clientsTableId, service.client)
    group(service.mastersTableId, service.master)
    group(service.repliesTableId, service.reply)
    group(service.notesTableId, service.note)
    const client = field(service.repair.client, service.repairsTableId, path)
    if (client && client.relationTableId && client.relationTableId !== service.clientsTableId) issue('service_client', path, 'Ремонт должен ссылаться на клиентов')
    const master = field(service.repair.master, service.repairsTableId, path)
    if (master && master.relationTableId && master.relationTableId !== service.mastersTableId) issue('service_master', path, 'Мастер должен ссылаться на справочник мастеров')
    const replyRepair = field(service.reply.repair, service.repliesTableId, path)
    if (replyRepair && replyRepair.relationTableId && replyRepair.relationTableId !== service.repairsTableId) issue('service_reply', path, 'Ответ должен ссылаться на ремонт')
    const noteRepair = field(service.note.repair, service.notesTableId, path)
    if (noteRepair && noteRepair.relationTableId && noteRepair.relationTableId !== service.repairsTableId) issue('service_note', path, 'Заметка должна ссылаться на ремонт')
    if (service.repliesTableId === service.notesTableId) issue('service_notes_table', path, 'Внутренние заметки хранятся отдельно от ответов клиенту')
    const statusIds = [service.statuses.fresh, service.statuses.progress, service.statuses.waitingParts, service.statuses.ready, service.statuses.done, service.statuses.cancelled]
    if (new Set(statusIds).size !== statusIds.length) issue('service_status', path, 'Статусы ремонта должны различаться')
    for (const screenId of [service.dashboardScreenId, service.repairsScreenId, service.repairScreenId, service.clientsScreenId, service.clientScreenId, service.mastersScreenId, service.clientListScreenId, service.clientRepairScreenId]) {
      if (!screens.has(screenId)) issue('service_screen', path, 'Экран сервиса удалён')
    }
    for (const formId of [service.createFormId, service.replyFormId, service.noteFormId, service.assignFormId]) {
      if (nodes.get(formId)?.type !== 'form') issue('service_form', path, 'Форма сервиса удалена')
    }
    const clientRepair = screens.get(service.clientRepairScreenId)
    const clientList = screens.get(service.clientListScreenId)
    if (clientRepair?.audience.kind === 'public' || clientList?.audience.kind === 'public') issue('service_client_public', path, 'Кабинет сервиса не бывает публичным')
    const noteOnClient = app.sources.some(source => source.tableId === service.notesTableId && app.nodes.some(node => node.type === 'collection' && node.sourceId === source.id && clientRepair?.rootIds.includes(node.id)))
    if (noteOnClient) issue('service_client_notes', path, 'Экран клиента не показывает внутренние заметки')
  }
  if (app.prokat) {
    const prokat = app.prokat, path = 'prokat'
    table(prokat.bookingsTableId, path); table(prokat.clientsTableId, path); table(prokat.staffTableId, path); table(prokat.itemsTableId, path)
    const group = (tableId: string, values: Record<string, string | undefined>) => {
      for (const fieldId of Object.values(values)) if (fieldId) field(fieldId, tableId, path)
    }
    group(prokat.bookingsTableId, prokat.booking)
    group(prokat.clientsTableId, prokat.client)
    group(prokat.staffTableId, prokat.staff)
    group(prokat.itemsTableId, prokat.item)
    const client = field(prokat.booking.client, prokat.bookingsTableId, path)
    if (client && client.relationTableId && client.relationTableId !== prokat.clientsTableId) issue('prokat_client', path, 'Бронь должна ссылаться на клиентов')
    const staffRel = field(prokat.booking.staff, prokat.bookingsTableId, path)
    if (staffRel && staffRel.relationTableId && staffRel.relationTableId !== prokat.staffTableId) issue('prokat_staff', path, 'Сотрудник должен ссылаться на справочник сотрудников')
    const itemsRel = field(prokat.booking.items, prokat.bookingsTableId, path)
    if (itemsRel && itemsRel.relationTableId && itemsRel.relationTableId !== prokat.itemsTableId) issue('prokat_items', path, 'Предметы брони должны ссылаться на каталог предметов')
    const statusIds = [prokat.statuses.request, prokat.statuses.confirmed, prokat.statuses.issued, prokat.statuses.returned, prokat.statuses.overdue, prokat.statuses.cancelled]
    if (new Set(statusIds).size !== statusIds.length) issue('prokat_status', path, 'Статусы брони должны различаться')
    const itemStatusIds = [prokat.itemStatuses.free, prokat.itemStatuses.rented, prokat.itemStatuses.service, prokat.itemStatuses.writtenOff]
    if (new Set(itemStatusIds).size !== itemStatusIds.length) issue('prokat_item_status', path, 'Статусы предметов должны различаться')
    for (const screenId of [prokat.dashboardScreenId, prokat.bookingsScreenId, prokat.bookingScreenId, prokat.itemsScreenId, prokat.itemScreenId, prokat.timelineScreenId, prokat.clientsScreenId, prokat.clientScreenId, prokat.catalogScreenId, prokat.clientListScreenId, prokat.clientBookingScreenId, ...(prokat.settingsScreenId ? [prokat.settingsScreenId] : [])]) {
      if (!screens.has(screenId)) issue('prokat_screen', path, 'Экран проката удалён')
    }
    for (const formId of [prokat.createFormId, prokat.issueFormId, prokat.returnFormId, prokat.clientRequestFormId]) {
      if (nodes.get(formId)?.type !== 'form') issue('prokat_form', path, 'Форма проката удалена')
    }
    const clientBooking = screens.get(prokat.clientBookingScreenId)
    const clientList = screens.get(prokat.clientListScreenId)
    const catalog = screens.get(prokat.catalogScreenId)
    if (clientBooking?.audience.kind === 'public' || clientList?.audience.kind === 'public' || catalog?.audience.kind === 'public') {
      issue('prokat_client_public', path, 'Кабинет проката не бывает публичным')
    }
  }
  if (app.projects) {
    const projects = app.projects, path = 'projects'
    table(projects.projectsTableId, path); table(projects.tasksTableId, path); table(projects.peopleTableId, path)
    table(projects.clientsTableId, path); table(projects.commentsTableId, path); table(projects.eventsTableId, path); table(projects.stagesTableId, path)
    if (projects.timeTableId) table(projects.timeTableId, path)
    if (projects.linksTableId) table(projects.linksTableId, path)
    if (projects.templatesTableId) table(projects.templatesTableId, path)
    if (projects.sharesTableId) table(projects.sharesTableId, path)
    const group = (tableId: string, values: Record<string, string | undefined>) => {
      for (const fieldId of Object.values(values)) if (fieldId) field(fieldId, tableId, path)
    }
    group(projects.projectsTableId, projects.project)
    group(projects.tasksTableId, projects.task)
    group(projects.peopleTableId, projects.person)
    group(projects.clientsTableId, projects.client)
    group(projects.commentsTableId, projects.comment)
    group(projects.eventsTableId, projects.event)
    group(projects.stagesTableId, projects.stage)
    if (projects.timeTableId && projects.time) group(projects.timeTableId, projects.time)
    if (projects.linksTableId && projects.link) group(projects.linksTableId, projects.link)
    if (projects.templatesTableId && projects.template) group(projects.templatesTableId, projects.template)
    if (projects.sharesTableId && projects.share) group(projects.sharesTableId, projects.share)
    const client = field(projects.project.client, projects.projectsTableId, path)
    if (client && client.relationTableId && client.relationTableId !== projects.clientsTableId) issue('projects_client', path, 'Проект должен ссылаться на клиентов')
    const owner = field(projects.project.owner, projects.projectsTableId, path)
    if (owner && owner.relationTableId && owner.relationTableId !== projects.peopleTableId) issue('projects_owner', path, 'Ответственный должен ссылаться на сотрудников')
    const taskProject = field(projects.task.project, projects.tasksTableId, path)
    if (taskProject && taskProject.relationTableId && taskProject.relationTableId !== projects.projectsTableId) issue('projects_task', path, 'Задача должна ссылаться на проект')
    const assignee = field(projects.task.assignee, projects.tasksTableId, path)
    if (assignee && assignee.relationTableId && assignee.relationTableId !== projects.peopleTableId) issue('projects_assignee', path, 'Исполнитель должен ссылаться на сотрудников')
    const parent = field(projects.task.parent, projects.tasksTableId, path)
    if (parent && parent.relationTableId && parent.relationTableId !== projects.tasksTableId) issue('projects_parent', path, 'Подзадача должна ссылаться на задачу')
    const stageLink = field(projects.task.stage, projects.tasksTableId, path)
    if (stageLink && stageLink.relationTableId && stageLink.relationTableId !== projects.stagesTableId) issue('projects_stage', path, 'Этап задачи должен ссылаться на этапы')
    const stageProject = field(projects.stage.project, projects.stagesTableId, path)
    if (stageProject && stageProject.relationTableId && stageProject.relationTableId !== projects.projectsTableId) issue('projects_stage_project', path, 'Этап должен ссылаться на проект')
    const mentions = field(projects.comment.mentions, projects.commentsTableId, path)
    if (mentions && mentions.relationTableId && mentions.relationTableId !== projects.peopleTableId) issue('projects_mentions', path, 'Упоминание должно ссылаться на сотрудников')
    if (projects.task.author) {
      const author = field(projects.task.author, projects.tasksTableId, path)
      if (author && author.relationTableId && author.relationTableId !== projects.peopleTableId) issue('projects_author', path, 'Постановщик должен ссылаться на сотрудников')
    }
    if (projects.task.observers) {
      const observers = field(projects.task.observers, projects.tasksTableId, path)
      if (observers && observers.relationTableId && observers.relationTableId !== projects.peopleTableId) issue('projects_observers', path, 'Наблюдатели должны ссылаться на сотрудников')
    }
    if (projects.comment.replyTo) {
      const reply = field(projects.comment.replyTo, projects.commentsTableId, path)
      if (reply && reply.relationTableId && reply.relationTableId !== projects.commentsTableId) issue('projects_reply', path, 'Ответ должен ссылаться на комментарии')
    }
    if (projects.linksTableId && projects.link) {
      const from = field(projects.link.from, projects.linksTableId, path)
      const to = field(projects.link.to, projects.linksTableId, path)
      if (from && from.relationTableId && from.relationTableId !== projects.tasksTableId) issue('projects_link_from', path, 'Зависимость должна ссылаться на задачи')
      if (to && to.relationTableId && to.relationTableId !== projects.tasksTableId) issue('projects_link_to', path, 'Зависимость должна ссылаться на задачи')
    }
    for (const screenId of [projects.mineScreenId, projects.boardScreenId, projects.projectsScreenId, projects.projectScreenId, projects.taskScreenId, projects.peopleScreenId, projects.clientsScreenId, projects.ganttScreenId, projects.workloadScreenId, projects.templatesScreenId, projects.clientScreenId]) {
      if (screenId && !screens.has(screenId)) issue('projects_screen', path, 'Экран проектов удалён')
    }
    for (const formId of [projects.createTaskFormId, projects.editTaskFormId, projects.createProjectFormId, projects.editProjectFormId, projects.commentFormId]) if (nodes.get(formId)?.type !== 'form') issue('projects_form', path, 'Форма проектов удалена')
  }
  if (app.shop) {
    const shop = app.shop, path = 'shop'
    table(shop.catalogTableId, path); table(shop.ordersTableId, path); table(shop.itemsTableId, path)
    if (catalog.views.get(shop.catalogViewId)?.tableId !== shop.catalogTableId) issue('shop_catalog_view', path, 'Витрина магазина ссылается на чужое представление')
    for (const screenId of [shop.catalogScreenId, shop.detailScreenId, shop.basketScreenId, shop.ordersScreenId, shop.orderScreenId]) if (!screens.has(screenId)) issue('shop_screen', path, 'Экран магазина удалён')
    if (nodes.get(shop.checkoutFormId)?.type !== 'form') issue('shop_form', path, 'Форма оформления заказа удалена')
    const product = (fieldId: string, tableId: string) => field(fieldId, tableId, path)
    product(shop.activeFieldId, shop.catalogTableId); product(shop.productTitleFieldId, shop.catalogTableId); product(shop.priceFieldId, shop.catalogTableId)
    if (shop.imageFieldId) { const image = product(shop.imageFieldId, shop.catalogTableId); if (image && !['image', 'url'].includes(image.type)) issue('shop_image', path, 'Фото каталога должно быть изображением или ссылкой') }
    if (shop.descriptionFieldId) product(shop.descriptionFieldId, shop.catalogTableId)
    if (shop.stockFieldId) { const stock = product(shop.stockFieldId, shop.catalogTableId); if (stock && !['number', 'formula', 'rollup'].includes(stock.type)) issue('shop_stock', path, 'Остаток каталога должен быть числом') }
    if (shop.categoryFieldId) product(shop.categoryFieldId, shop.catalogTableId)
    for (const fieldId of [shop.emailFieldId, shop.statusFieldId, shop.assignmentFieldId, shop.submissionFieldId, shop.createdFieldId, shop.cartFieldId, shop.positionsFieldId, shop.orderTitleFieldId, shop.addressFieldId]) product(fieldId, shop.ordersTableId)
    for (const fieldId of [shop.itemNameFieldId, shop.itemQtyFieldId, shop.itemPriceFieldId, shop.itemEmailFieldId, shop.itemAssignmentFieldId, shop.productFieldId]) product(fieldId, shop.itemsTableId)
    const productRelation = catalog.fields.get(shop.productFieldId)
    if (productRelation && productRelation.relationTableId !== shop.catalogTableId) issue('shop_product_relation', path, 'Позиция заказа должна ссылаться на каталог')
    const positions = catalog.fields.get(shop.positionsFieldId)
    if (positions && positions.relationTableId !== shop.itemsTableId) issue('shop_positions_relation', path, 'Состав заказа должен ссылаться на позиции')
  }
  if (app.crm) {
    const crm = app.crm, path = 'crm'
    table(crm.dealsTableId, path); table(crm.clientsTableId, path)
    if (crm.contactsTableId) table(crm.contactsTableId, path)
    for (const screenId of [crm.boardScreenId, crm.dealScreenId, crm.clientsScreenId, crm.clientScreenId, crm.calendarScreenId, ...(crm.createDealScreenId ? [crm.createDealScreenId] : []), ...(crm.createClientScreenId ? [crm.createClientScreenId] : [])]) if (!screens.has(screenId)) issue('crm_screen', path, 'Экран CRM удалён')
    for (const formId of [crm.createDealFormId, crm.createClientFormId, crm.contactFormId, ...(crm.dealEditFormId ? [crm.dealEditFormId] : [])]) if (nodes.get(formId)?.type !== 'form') issue('crm_form', path, 'Форма CRM удалена')
    const deal = (fieldId: string) => field(fieldId, crm.dealsTableId, path)
    const client = (fieldId: string) => field(fieldId, crm.clientsTableId, path)
    for (const fieldId of [crm.titleFieldId, crm.stageFieldId, crm.dueFieldId, crm.noteFieldId, crm.sumFieldId, crm.clientRelationFieldId, crm.assignmentFieldId, crm.clientNameFieldId]) deal(fieldId)
    for (const fieldId of [crm.clientTitleFieldId, crm.clientPhoneFieldId, crm.clientEmailFieldId, crm.clientNoteFieldId]) client(fieldId)
    if (crm.contactsTableId) {
      const contact = (fieldId: string | undefined) => { if (fieldId) field(fieldId, crm.contactsTableId!, path) }
      contact(crm.contactSummaryFieldId); contact(crm.contactLoggedAtFieldId); contact(crm.contactDealFieldId); contact(crm.contactClientFieldId); contact(crm.contactNextDueFieldId)
      const dealLink = crm.contactDealFieldId ? catalog.fields.get(crm.contactDealFieldId) : undefined
      if (dealLink && dealLink.relationTableId !== crm.dealsTableId) issue('crm_contact_deal', path, 'Контакт должен ссылаться на сделки')
      const clientLink = crm.contactClientFieldId ? catalog.fields.get(crm.contactClientFieldId) : undefined
      if (clientLink && clientLink.relationTableId !== crm.clientsTableId) issue('crm_contact_client', path, 'Контакт должен ссылаться на клиентов')
    }
    const relation = catalog.fields.get(crm.clientRelationFieldId)
    if (relation && relation.relationTableId !== crm.clientsTableId) issue('crm_client_relation', path, 'Сделка должна ссылаться на клиентов')
    const stage = catalog.fields.get(crm.stageFieldId)
    if (stage && stage.type !== 'single_select') issue('crm_stage_type', path, 'Этап сделки должен быть одиночным выбором')
  }
  if (app.inventory) {
    const inv = app.inventory, path = 'inventory'
    table(inv.itemsTableId, path); table(inv.movementsTableId, path); table(inv.warehousesTableId, path)
    const purchaseIds = [
      inv.suppliersTableId, inv.purchaseOrdersTableId, inv.purchaseLinesTableId,
      inv.purchasesScreenId, inv.purchaseScreenId, inv.createPurchaseScreenId, inv.suppliersScreenId, inv.supplierScreenId, inv.createSupplierScreenId,
      inv.createPurchaseFormId, inv.editPurchaseFormId, inv.createSupplierFormId, inv.editSupplierFormId,
      inv.supplierNameFieldId, inv.supplierContactFieldId, inv.supplierPhoneFieldId, inv.supplierCommentFieldId,
      inv.purchaseNameFieldId, inv.purchaseSupplierFieldId, inv.purchaseWarehouseFieldId, inv.purchaseDateFieldId, inv.purchaseStatusFieldId,
      inv.purchaseTotalFieldId, inv.purchaseCommentFieldId, inv.purchaseLinesFieldId, inv.purchaseCountFieldId, inv.purchasePayloadFieldId,
      inv.lineNameFieldId, inv.lineOrderFieldId, inv.lineProductFieldId, inv.lineQtyFieldId, inv.linePriceFieldId, inv.lineTotalFieldId,
      inv.statusDraft, inv.statusOrdered, inv.statusReceived, inv.statusCancelled,
    ]
    const countIds = [
      inv.typeInventory, inv.inventoryCountsTableId, inv.inventoryCountLinesTableId,
      inv.countsScreenId, inv.countScreenId, inv.createCountScreenId, inv.reorderScreenId,
      inv.createCountFormId, inv.editCountFormId, inv.reorderFormId,
      inv.countNameFieldId, inv.countNumberFieldId, inv.countWarehouseFieldId, inv.countDateFieldId, inv.countStatusFieldId,
      inv.countAuthorFieldId, inv.countLinesFieldId, inv.countProductCountFieldId, inv.countDiscrepancyCountFieldId,
      inv.countShortageFieldId, inv.countSurplusFieldId, inv.countPayloadFieldId,
      inv.countLineNameFieldId, inv.countLineCountFieldId, inv.countLineProductFieldId,
      inv.countLineSystemFieldId, inv.countLineActualFieldId, inv.countLineDiffFieldId, inv.countLineAmountFieldId,
      inv.countStatusDraft, inv.countStatusPosted, inv.countStatusCancelled, inv.reorderPayloadFieldId,
    ]
    const purchasesOn = purchaseIds.some(Boolean)
    const purchasesReady = purchaseIds.every(Boolean)
    if (purchasesOn && !purchasesReady) issue('inventory_purchases', path, 'Закупки настроены не полностью')
    const countsOn = countIds.some(Boolean)
    const countsReady = countIds.every(Boolean)
    if (countsOn && !countsReady) issue('inventory_counts', path, 'Инвентаризация настроена не полностью')
    for (const screenId of [inv.itemsScreenId, inv.itemScreenId, inv.movementsScreenId, ...(inv.createItemScreenId ? [inv.createItemScreenId] : []), ...(purchasesReady ? [inv.purchasesScreenId!, inv.purchaseScreenId!, inv.createPurchaseScreenId!, inv.suppliersScreenId!, inv.supplierScreenId!, inv.createSupplierScreenId!] : []), ...(countsReady ? [inv.countsScreenId!, inv.countScreenId!, inv.createCountScreenId!, inv.reorderScreenId!] : [])]) {
      if (!screens.has(screenId)) issue('inventory_screen', path, 'Экран склада удалён')
    }
    for (const formId of [inv.receiptFormId, inv.issueFormId, inv.writeOffFormId, inv.transferFormId, inv.itemEditFormId, ...(inv.createItemFormId ? [inv.createItemFormId] : []), ...(purchasesReady ? [inv.createPurchaseFormId!, inv.editPurchaseFormId!, inv.createSupplierFormId!, inv.editSupplierFormId!] : []), ...(countsReady ? [inv.createCountFormId!, inv.editCountFormId!, inv.reorderFormId!] : [])]) {
      if (nodes.get(formId)?.type !== 'form') issue('inventory_form', path, 'Форма склада удалена')
    }
    const item = (fieldId: string) => field(fieldId, inv.itemsTableId, path)
    const movement = (fieldId: string) => field(fieldId, inv.movementsTableId, path)
    const warehouse = (fieldId: string) => field(fieldId, inv.warehousesTableId, path)
    for (const fieldId of [inv.itemNameFieldId, inv.itemSkuFieldId, inv.itemCategoryFieldId, inv.itemUnitFieldId, inv.itemMinFieldId, inv.itemCostFieldId, inv.itemWarehouseFieldId, inv.itemStockFieldId, inv.itemLowFieldId, inv.itemMovementsFieldId, inv.itemOpeningFieldId]) item(fieldId)
    if (inv.itemBarcodeFieldId) item(inv.itemBarcodeFieldId)
    if (inv.itemPhotoFieldId) {
      const photo = item(inv.itemPhotoFieldId)
      if (photo && !['image', 'url'].includes(photo.type)) issue('inventory_photo', path, 'Фото товара должно быть изображением или ссылкой')
    }
    for (const fieldId of [inv.movementNameFieldId, inv.movementTypeFieldId, inv.movementItemFieldId, inv.movementQtyFieldId, inv.movementWarehouseFieldId, inv.movementWarehouseToFieldId, inv.movementDateFieldId, inv.movementNoteFieldId, inv.movementAuthorFieldId]) movement(fieldId)
    if (inv.movementBeforeFieldId) movement(inv.movementBeforeFieldId)
    if (inv.movementAfterFieldId) movement(inv.movementAfterFieldId)
    warehouse(inv.warehouseNameFieldId)
    const itemLink = catalog.fields.get(inv.movementItemFieldId)
    if (itemLink && itemLink.relationTableId !== inv.itemsTableId) issue('inventory_item_relation', path, 'Движение должно ссылаться на товары')
    const fromWarehouse = catalog.fields.get(inv.movementWarehouseFieldId)
    if (fromWarehouse && fromWarehouse.relationTableId !== inv.warehousesTableId) issue('inventory_warehouse_relation', path, 'Склад движения должен ссылаться на склады')
    const toWarehouse = catalog.fields.get(inv.movementWarehouseToFieldId)
    if (toWarehouse && toWarehouse.relationTableId !== inv.warehousesTableId) issue('inventory_warehouse_relation', path, 'Склад назначения должен ссылаться на склады')
    const productWarehouse = catalog.fields.get(inv.itemWarehouseFieldId)
    if (productWarehouse && productWarehouse.relationTableId !== inv.warehousesTableId) issue('inventory_item_warehouse', path, 'Склад товара должен ссылаться на склады')
    const kind = catalog.fields.get(inv.movementTypeFieldId)
    if (kind && kind.type !== 'single_select') issue('inventory_type_field', path, 'Вид движения должен быть одиночным выбором')
    if (purchasesReady) {
      table(inv.suppliersTableId!, path); table(inv.purchaseOrdersTableId!, path); table(inv.purchaseLinesTableId!, path)
      const supplier = (fieldId: string) => field(fieldId, inv.suppliersTableId!, path)
      const order = (fieldId: string) => field(fieldId, inv.purchaseOrdersTableId!, path)
      const line = (fieldId: string) => field(fieldId, inv.purchaseLinesTableId!, path)
      for (const fieldId of [inv.supplierNameFieldId!, inv.supplierContactFieldId!, inv.supplierPhoneFieldId!, inv.supplierCommentFieldId!]) supplier(fieldId)
      for (const fieldId of [inv.purchaseNameFieldId!, inv.purchaseSupplierFieldId!, inv.purchaseWarehouseFieldId!, inv.purchaseDateFieldId!, inv.purchaseStatusFieldId!, inv.purchaseTotalFieldId!, inv.purchaseCommentFieldId!, inv.purchaseLinesFieldId!, inv.purchaseCountFieldId!, inv.purchasePayloadFieldId!]) order(fieldId)
      for (const fieldId of [inv.lineNameFieldId!, inv.lineOrderFieldId!, inv.lineProductFieldId!, inv.lineQtyFieldId!, inv.linePriceFieldId!, inv.lineTotalFieldId!]) line(fieldId)
      const supplierLink = catalog.fields.get(inv.purchaseSupplierFieldId!)
      if (supplierLink && supplierLink.relationTableId !== inv.suppliersTableId) issue('purchase_supplier_relation', path, 'Заказ должен ссылаться на поставщиков')
      const warehouseLink = catalog.fields.get(inv.purchaseWarehouseFieldId!)
      if (warehouseLink && warehouseLink.relationTableId !== inv.warehousesTableId) issue('purchase_warehouse_relation', path, 'Склад заказа должен ссылаться на склады')
      const linesLink = catalog.fields.get(inv.purchaseLinesFieldId!)
      if (linesLink && linesLink.relationTableId !== inv.purchaseLinesTableId) issue('purchase_lines_relation', path, 'Состав заказа должен ссылаться на позиции')
      const orderLink = catalog.fields.get(inv.lineOrderFieldId!)
      if (orderLink && orderLink.relationTableId !== inv.purchaseOrdersTableId) issue('purchase_line_order', path, 'Позиция должна ссылаться на заказ поставщику')
      const productLink = catalog.fields.get(inv.lineProductFieldId!)
      if (productLink && productLink.relationTableId !== inv.itemsTableId) issue('purchase_line_product', path, 'Позиция должна ссылаться на товары')
      const status = catalog.fields.get(inv.purchaseStatusFieldId!)
      if (status && status.type !== 'single_select') issue('purchase_status_type', path, 'Статус заказа должен быть одиночным выбором')
      const total = catalog.fields.get(inv.purchaseTotalFieldId!)
      if (total && !['number', 'formula'].includes(total.type)) issue('purchase_total_type', path, 'Сумма заказа должна быть числом или формулой')
      const payload = catalog.fields.get(inv.purchasePayloadFieldId!)
      if (payload && payload.type !== 'long_text') issue('purchase_payload_type', path, 'Состав заказа в форме должен быть длинным текстом')
      const lineTotal = catalog.fields.get(inv.lineTotalFieldId!)
      if (lineTotal && lineTotal.type !== 'formula') issue('purchase_line_total', path, 'Сумма позиции считается формулой')
      const statuses = [inv.statusDraft!, inv.statusOrdered!, inv.statusReceived!, inv.statusCancelled!]
      if (new Set(statuses).size !== statuses.length) issue('purchase_status_ids', path, 'Статусы заказа должны различаться')
    }
  }
  for (const rule of app.policy.tables) {
    const path = `policy.tables.${rule.tableId}`
    if (tables.has(rule.tableId)) issue('duplicate_table_policy', path, 'Правила одной таблицы должны находиться в одном разделе')
    tables.add(rule.tableId); table(rule.tableId, path)
    for (const [i, grant] of rule.grants.entries()) {
      const ownPath = `${path}.grants.${i}`
      audience(grant.audience, ownPath)
      for (const [operation, permission] of [['read', grant.read], ['create', grant.create], ['update', grant.update]] as const) {
        if (!permission) continue
        unique(permission.fieldIds, `${ownPath}.${operation}`)
        permission.fieldIds.forEach(id => field(id, rule.tableId, `${ownPath}.${operation}`, operation !== 'read'))
        if ('rows' in permission) rowScope(permission.rows, rule.tableId, ownPath)
      }
      if (grant.delete) rowScope(grant.delete.rows, rule.tableId, ownPath)
      if (grant.create?.owner) {
        field(grant.create.owner.fieldId, rule.tableId, ownPath, true)
        rowScope({ kind: 'owned', ...grant.create.owner }, rule.tableId, ownPath)
        if (grant.create.fieldIds.includes(grant.create.owner.fieldId)) issue('editable_owner', ownPath, 'Владелец новой записи задаётся сервером, а не формой')
      }
    }
  }
  for (const [i, grant] of app.policy.workflows.entries()) {
    const path = `policy.workflows.${i}`
    if (!flows.has(grant.workflowId)) issue('missing_workflow', path, 'Действие из правил доступа удалено')
    audience(grant.audience, path)
  }
  return issues
}
