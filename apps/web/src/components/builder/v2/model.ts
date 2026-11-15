import { isComputed, type FieldType } from '@tableapp/schema'
import { appV2ChildIds, appV2ComponentCatalog, type AppV2, type AppV2Node, type AppV2Step } from '@tableapp/schema/app-v2'
import { BUILDER_V2_FORM_TYPES } from '@/lib/builder-v2-form-types'
import { collectionCardScreen } from './collection-navigation'
import type { BuilderV2Table } from '@/lib/builder-v2'

export const NODE_KINDS = appV2ComponentCatalog
export const v2Id = () => `node_${crypto.randomUUID().replaceAll('-', '')}`
export const newScreen = (app: AppV2, name: string): AppV2 => { const id = v2Id(); return { ...app, homeScreenId: app.homeScreenId ?? id, screens: [...app.screens, { id, name, icon: 'apps', navigation: true, audience: { kind: 'roles', roleIds: app.roles.map(role => role.id) }, contextTableId: null, rootIds: [], events: { enter: null } }] } }
export function editorCatalog(app: AppV2, tables: readonly BuilderV2Table[]) { return { workspaceId: app.workspaceId, tables: new Map(tables.map(table => [table.id, { workspaceId: app.workspaceId }])), fields: new Map(tables.flatMap(table => table.fields.map(field => [field.id, { tableId: table.id, type: field.type, ...(field.relationTableId ? { relationTableId: field.relationTableId } : {}), ...(field.choices ? { choiceIds: field.choices.map(choice => choice.id) } : {}) }] as const))), views: new Map(tables.flatMap(table => table.views.map(view => [view.id, { tableId: table.id }] as const))) } }

export function replaceNode(app: AppV2, next: AppV2Node): AppV2 { return { ...app, nodes: app.nodes.map(node => node.id === next.id ? next : node) } }
export type BuilderV2SourcePatch = Partial<Omit<AppV2['sources'][number], 'id' | 'tableId'>>
/** Old drafts and duplicated components may share a source. Editing settings must affect only this block. */
export function updateNodeSource(app: AppV2, nodeId: string, patch: BuilderV2SourcePatch): AppV2 {
  const node = app.nodes.find(node => node.id === nodeId)
  if (!node || !('sourceId' in node)) return app
  const source = app.sources.find(source => source.id === node.sourceId)
  if (!source) return app
  const shared = app.nodes.some(other => other.id !== node.id && 'sourceId' in other && other.sourceId === source.id)
  const next = { ...source, ...patch, id: shared ? v2Id() : source.id }
  return replaceNode({ ...app, sources: shared ? [...app.sources, next] : app.sources.map(source => source.id === next.id ? next : source) }, { ...node, sourceId: next.id })
}
function withChildren(node: AppV2Node, ids: string[]): AppV2Node { return node.type === 'collection' ? { ...node, itemIds: ids } : 'childIds' in node ? { ...node, childIds: ids } : node }
export function nodeContext(app: AppV2, screenId: string, nodeId?: string | null): { rowTableId: string | null; formId: string | null } {
  const screen = app.screens.find(screen => screen.id === screenId), visited = new Set<string>()
  const find = (ids: readonly string[], rowTableId: string | null, formId: string | null): ReturnType<typeof nodeContext> | undefined => {
    for (const id of ids) {
      if (visited.has(id)) continue
      visited.add(id)
      const node = app.nodes.find(node => node.id === id)
      if (!node) continue
      const nextTable = node.type === 'collection' ? app.sources.find(source => source.id === node.sourceId)?.tableId ?? null : rowTableId
      const nextForm = node.type === 'form' ? node.id : formId
      if (id === nodeId) return { rowTableId: nextTable, formId: nextForm }
      const found = find(appV2ChildIds(node), nextTable, nextForm)
      if (found) return found
    }
  }
  return find(screen?.rootIds ?? [], screen?.contextTableId ?? null, null) ?? { rowTableId: screen?.contextTableId ?? null, formId: null }
}
export function nodeDescendants(app: AppV2, id: string): Set<string> {
  const result = new Set<string>(), queue = [id]
  while (queue.length) { const current = queue.pop()!; if (result.has(current)) continue; result.add(current); const node = app.nodes.find(node => node.id === current); if (node) queue.push(...appV2ChildIds(node)) }
  return result
}
export function placeNode(app: AppV2, screenId: string, nodeId: string, parentId: string | null): AppV2 {
  if (parentId && nodeDescendants(app, nodeId).has(parentId)) throw new Error('Элемент нельзя поместить внутрь самого себя')
  const parent = parentId ? app.nodes.find(node => node.id === parentId) : null
  if (parentId && (!parent || !('childIds' in parent) && parent.type !== 'collection')) throw new Error('Выберите группу, колонки, форму или список')
  return { ...app, screens: app.screens.map(screen => ({ ...screen, rootIds: [...screen.rootIds.filter(id => id !== nodeId), ...(!parentId && screen.id === screenId ? [nodeId] : [])] })), nodes: app.nodes.map(node => withChildren(node, [...appV2ChildIds(node).filter(id => id !== nodeId), ...(node.id === parentId ? [nodeId] : [])])) }
}
export function moveNode(app: AppV2, nodeId: string, delta: number): AppV2 {
  const move = (ids: readonly string[]) => { const next = [...ids], i = next.indexOf(nodeId); if (i >= 0 && i + delta >= 0 && i + delta < next.length) [next[i], next[i + delta]] = [next[i + delta]!, next[i]!]; return next }
  return { ...app, screens: app.screens.map(screen => ({ ...screen, rootIds: move(screen.rootIds) })), nodes: app.nodes.map(node => withChildren(node, move(appV2ChildIds(node)))) }
}
function cleanReferences(app: AppV2, removedForms: ReadonlySet<string>, removedScreens = new Set<string>()): AppV2 {
  const steps = (items: AppV2Step[]): AppV2Step[] => items.filter(step => step.type !== 'open_screen' || !removedScreens.has(step.screenId)).map(step => step.type === 'branch' ? { ...step, then: steps(step.then), else: steps(step.else) } : step)
  const workflows = app.workflows.filter(flow => !flow.input.formId || !removedForms.has(flow.input.formId)).map(flow => ({ ...flow, steps: steps(flow.steps) })).filter(flow => flow.steps.length)
  const valid = new Set(workflows.map(flow => flow.id)), flowId = (id: string | null) => id && valid.has(id) ? id : null
  const sourceIds = new Set(app.nodes.flatMap(node => 'sourceId' in node ? [node.sourceId] : []))
  return { ...app, workflows, sources: app.sources.filter(source => sourceIds.has(source.id)), policy: { ...app.policy, workflows: app.policy.workflows.filter(grant => valid.has(grant.workflowId)) }, screens: app.screens.map(screen => ({ ...screen, events: { enter: flowId(screen.events.enter) } })), nodes: app.nodes.map(node => node.type === 'button' ? { ...node, events: { press: flowId(node.events.press) } } : node.type === 'form' ? { ...node, events: { submit: flowId(node.events.submit) } } : node.type === 'collection' ? { ...node, events: { itemPress: flowId(node.events.itemPress) } } : node) }
}
export function removeNode(app: AppV2, nodeId: string): AppV2 {
  const ids = nodeDescendants(app, nodeId)
  const removedForms = new Set(app.nodes.filter(node => node.type === 'form' && ids.has(node.id)).map(node => node.id))
  // Deleting a form input detaches its submit workflow, rather than leaving an invalid hidden input binding.
  const removedInputs = new Set(app.nodes.filter(node => node.type === 'input' && ids.has(node.id)).map(node => node.id))
  for (const form of app.nodes.filter(node => node.type === 'form')) if ([...nodeDescendants(app, form.id)].some(id => removedInputs.has(id))) removedForms.add(form.id)
  return cleanReferences({ ...app, nodes: app.nodes.filter(node => !ids.has(node.id)).map(node => withChildren(node, appV2ChildIds(node).filter(id => !ids.has(id)))), screens: app.screens.map(screen => ({ ...screen, rootIds: screen.rootIds.filter(id => !ids.has(id)) })) }, removedForms)
}
export function removeScreen(app: AppV2, screenId: string): AppV2 {
  if (app.screens.length < 2) throw new Error('Оставьте хотя бы один экран')
  const screen = app.screens.find(screen => screen.id === screenId)
  let next = app
  for (const id of screen?.rootIds ?? []) next = removeNode(next, id)
  const screens = next.screens.filter(screen => screen.id !== screenId)
  return cleanReferences({ ...next, screens, homeScreenId: app.homeScreenId === screenId ? screens.find(screen => !screen.contextTableId)?.id ?? null : app.homeScreenId }, new Set(), new Set([screenId]))
}
export function duplicateNode(app: AppV2, screenId: string, nodeId: string): { app: AppV2; id: string } {
  const selected = nodeDescendants(app, nodeId), ids = new Map([...selected].map(id => [id, v2Id()]))
  const forms = new Set(app.nodes.filter(node => selected.has(node.id) && node.type === 'form').map(node => node.id))
  const workflowIds = new Map(app.workflows.filter(flow => flow.input.formId && forms.has(flow.input.formId)).map(flow => [flow.id, v2Id()]))
  function remap(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(remap)
    const object = value as Record<string, unknown>
    if (object.kind === 'literal') return object
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, key === 'formId' && typeof item === 'string' ? ids.get(item) ?? item : remap(item)]))
  }
  const copies = app.nodes.filter(node => selected.has(node.id)).map(node => {
    let copy = withChildren({ ...node, id: ids.get(node.id)!, name: node.id === nodeId ? `${node.name.slice(0, 112)} (копия)` : node.name }, appV2ChildIds(node).map(id => ids.get(id)!))
    if (copy.type === 'form') copy = { ...copy, events: { submit: workflowIds.get(copy.events.submit ?? '') ?? copy.events.submit } }
    if (copy.type === 'button') copy = { ...copy, events: { press: workflowIds.get(copy.events.press ?? '') ?? copy.events.press } }
    return copy
  })
  const workflows = app.workflows.filter(flow => workflowIds.has(flow.id)).map(flow => ({ ...(remap(flow) as typeof flow), id: workflowIds.get(flow.id)! }))
  const parent = app.nodes.find(node => appV2ChildIds(node).includes(nodeId))
  let next = placeNode({ ...app, nodes: [...app.nodes, ...copies], workflows: [...app.workflows, ...workflows], policy: { ...app.policy, workflows: [...app.policy.workflows, ...app.policy.workflows.filter(grant => workflowIds.has(grant.workflowId)).map(grant => ({ ...grant, workflowId: workflowIds.get(grant.workflowId)! }))] } }, screenId, ids.get(nodeId)!, parent?.id ?? null)
  const siblings = parent ? appV2ChildIds(next.nodes.find(node => node.id === parent.id)!) : next.screens.find(screen => screen.id === screenId)!.rootIds
  const copiedIndex = siblings.indexOf(ids.get(nodeId)!), originalIndex = siblings.indexOf(nodeId)
  for (let i = copiedIndex; i > originalIndex + 1; i--) next = moveNode(next, ids.get(nodeId)!, -1)
  return { app: next, id: ids.get(nodeId)! }
}

export function addNode(app: AppV2, screenId: string, type: AppV2Node['type'], tables: readonly BuilderV2Table[], parentId: string | null, tableId: string, inputFieldId?: string, options?: { editCurrentRecord?: boolean; history?: boolean }): { app: AppV2; id: string } {
  if(type==='chart'&&parentId&&app.nodes.some(node=>node.type==='collection'&&nodeDescendants(app,node.id).has(parentId)))throw new Error('Разместите диаграмму вне строк списка')
  const id = v2Id(), base = { id, name: NODE_KINDS[type][0], visibleTo: null, visibleWhen: null }, context = nodeContext(app, screenId, parentId)
  const table = tables.find(table => table.id === tableId), form = app.nodes.find(node => node.id === context.formId)
  let next = app, node: AppV2Node
  if (type === 'heading') node = { ...base, type, value: { kind: 'literal', value: 'Новый заголовок' }, size: 'm' }
  else if (type === 'team_calendar') {
    if (context.rowTableId || context.formId) throw new Error('Добавьте календарь команды на отдельный экран')
    node = { ...base, type, name: 'Расписание', data: null, resourceLabel: 'Сотрудник', resourcesLabel: 'Сотрудники', showMetrics: true, defaultView: 'day', actions: { itemScreenId: null, createScreenId: null, configureScreenId: null, periodScreenId: null, manageRoleIds: app.roles.some(role=>role.id==='owner')?['owner']:[], allowMove: true } }
  }
  else if (type === 'profile') {
    const own = tables.find(table => table.id === context.rowTableId), fields = own?.fields ?? []
    const title = fields.find(field => /имя|название|name/i.test(field.name)) ?? fields.find(field => field.id === own?.primaryFieldId) ?? fields[0]
    const image = fields.find(field => field.type === 'image')
    node = { ...base, type, title: title ? { kind: 'row', fieldId: title.id } : { kind: 'literal', value: 'Новый профиль' }, subtitle: null, image: image ? { kind: 'row', fieldId: image.id } : null, contacts: fields.filter(field => ['phone','email'].includes(field.type)).slice(0,8).map(field => ({ label: field.name, kind: field.type as 'phone'|'email', value: { kind: 'row' as const, fieldId: field.id } })), childIds: [] }
  }
  else if (type === 'text') node = { ...base, type, value: { kind: 'literal', value: 'Добавьте свой текст' } }
  else if(type==='gallery'||type==='files'){const columns=tables.find(table=>table.id===context.rowTableId)?.fields??[],field=columns.find(field=>field.type===(type==='gallery'?'image':'attachment'))??columns.find(field=>['image','attachment'].includes(field.type));const value=field?{kind:'row' as const,fieldId:field.id}:{kind:'literal' as const,value:''};node=type==='gallery'?{...base,type,value,caption:'',columns:3}:{...base,type,value,caption:''}}
  else if(type==='video')node={...base,type,value:{kind:'literal',value:''},caption:''}
  else if (type === 'image') node = { ...base, type, value: { kind: 'literal', value: '' }, alt: '' }
  else if (type === 'button') node = { ...base, type, label: 'Кнопка', variant: 'primary', events: { press: null } }
  else if (type === 'business') node = { ...base, type, target: null }
  else if (type === 'divider') node = { ...base, type }
  else if (type === 'group') node = { ...base, type, appearance: 'card', childIds: [] }
  else if (type === 'columns') node = { ...base, type, columns: 2, childIds: [] }
  else if (type === 'input') {
    const inputTable = form?.type === 'form' ? tables.find(table => table.id === form.tableId) : null
    const field = inputTable?.fields.find(field => (!inputFieldId || field.id === inputFieldId) && BUILDER_V2_FORM_TYPES.includes(field.type) && !app.nodes.some(node => node.type === 'input' && node.fieldId === field.id && nodeDescendants(app, form!.id).has(node.id)))
    if (!field) throw new Error('Сначала добавьте форму с доступным полем')
    const screenTableId = app.screens.find(screen => screen.id === screenId)?.contextTableId
    const autoLink = form?.type === 'form' && form.mode === 'create' && field.type === 'relation' && screenTableId && field.relationTableId === screenTableId
    node = { ...base, name: field.name, type, fieldId: field.id, label: field.name, required: false, initialValue: autoLink ? { kind: 'record_ids', tableId: screenTableId, record: { kind: 'screen' } } : null, ...(autoLink ? { readOnly: true } : {}) }
  } else if (type === 'field') {
    const ownTable = tables.find(table => table.id === context.rowTableId), field = ownTable?.fields.find(field => field.id === ownTable.primaryFieldId) ?? ownTable?.fields[0]
    if (!field) throw new Error('Добавьте поле в карточку записи или шаблон списка')
    node = { ...base, type, label: field.name, value: { kind: 'row', fieldId: field.id } }
  } else {
    if (!table || !table.fields.length) throw new Error('Выберите таблицу с полями')
    if (type === 'form') {
      if (context.formId) throw new Error('Форму нельзя вложить в другую форму')
      const screenTableId = app.screens.find(screen => screen.id === screenId)?.contextTableId
      const edit = options?.editCurrentRecord && screenTableId === table.id
      const relations = table.fields.filter(field => field.type === 'relation' && field.relationTableId === screenTableId), automatic = !edit && screenTableId && relations.length === 1 ? relations[0] : undefined
      const chosen = [...table.fields.filter(field => BUILDER_V2_FORM_TYPES.includes(field.type)).slice(0, 3)]
      if (automatic && !chosen.some(field => field.id === automatic.id)) chosen.push(automatic)
      const inputs: AppV2Node[] = chosen.map(field => ({ id: v2Id(), name: field.name, visibleTo: null, visibleWhen: null, type: 'input', fieldId: field.id, label: field.name, required: field.id === table.primaryFieldId, initialValue: field.id === automatic?.id ? { kind: 'record_ids', tableId: screenTableId!, record: { kind: 'screen' } } : null, ...(field.id === automatic?.id ? { readOnly: true } : {}) }))
      node = { ...base, name: edit ? 'Изменить запись' : 'Новая запись', type, tableId: table.id, mode: edit ? 'edit' : 'create', submitLabel: 'Сохранить', childIds: inputs.map(node => node.id), events: { submit: null } }
      next = { ...next, nodes: [...next.nodes, ...inputs] }
    } else {
      const screenTableId = app.screens.find(screen => screen.id === screenId)?.contextTableId
      const relations = table.fields.filter(field => field.type === 'relation' && field.relationTableId === screenTableId)
      const source: AppV2['sources'][number] = { id: v2Id(), tableId: table.id, viewId: null, filter: null, sorts: [], searchFieldIds: [table.primaryFieldId ?? table.fields[0]!.id], pageSize: 30 }
      if (screenTableId && relations.length === 1) { source.screenTableId = screenTableId; source.filter = { op: 'includes', left: { kind: 'row', fieldId: relations[0]!.id }, right: { kind: 'screen_row_id' } } }
      next = { ...next, sources: [...next.sources, source] }
      if(type==='chart'){const group=table.fields.find(field=>field.type==='single_select')??table.fields.find(field=>['date','datetime'].includes(field.type))??table.fields.find(field=>['text','long_text','checkbox'].includes(field.type));if(!group)throw new Error('Для диаграммы добавьте поле с текстом, статусом или датой');node={...base,type,sourceId:source.id,chartType:'bar',groupFieldId:group.id,operation:'count',fieldId:null,dateGrouping:'month',limit:10}}
      else node = type === 'collection' ? { ...base, type, sourceId: source.id, layout: 'list', titleFieldId: table.fields.find(field => field.id === table.primaryFieldId)?.id ?? table.fields[0]!.id, subtitleFieldId: null, itemIds: [], events: { itemPress: null } } : { ...base, type: 'metric', sourceId: source.id, operation: 'count', fieldId: null }
    }
  }
  if (node.type === 'collection' && options?.history) {
    const date = table?.fields.find(field => ['date','datetime'].includes(field.type))
    if (!date) throw new Error('Для истории нужна таблица с датой события')
    node = { ...node, name: 'История', layout: 'history', dateFieldId: date.id, statusFieldId: table?.fields.find(field => field.type === 'single_select')?.id, cardDetailFieldId: table?.fields.find(field => field.type === 'number')?.id }
    next = { ...next, sources: next.sources.map(source => source.id === (node as Extract<AppV2Node,{type:'collection'}>).sourceId ? { ...source, sorts: [{ fieldId: date.id, direction: 'desc' }] } : source) }
  }
  return { app: placeNode({ ...next, nodes: [...next.nodes, node] }, screenId, id, parentId), id }
}

/** Link only this collection. Existing custom workflows and their grants are never rewritten. */
export function setCollectionCard(app: AppV2, nodeId: string, screenId: string | null): AppV2 {
  const node = app.nodes.find(node => node.id === nodeId)
  if (node?.type !== 'collection') return app
  const oldId = node.events.itemPress
  if (collectionCardScreen(app, node) && oldId && !app.policy.workflows.some(grant => grant.workflowId === oldId) && !app.nodes.some(other => other.id !== nodeId && 'events' in other && Object.values(other.events).includes(oldId)) && !app.screens.some(screen => screen.events.enter === oldId)) app = { ...app, workflows: app.workflows.filter(flow => flow.id !== oldId) }
  if (!screenId) return replaceNode(app, { ...node, events: { itemPress: null } })
  const tableId = app.sources.find(source => source.id === node.sourceId)?.tableId
  if (!tableId || app.screens.find(screen => screen.id === screenId)?.contextTableId !== tableId) throw new Error('Выберите карточку этой таблицы')
  const flow = { id: v2Id(), name: 'Открыть карточку', input: { rowTableId: tableId, formId: null }, steps: [{ id: v2Id(), type: 'open_screen' as const, screenId, record: { kind: 'current' as const } }] }
  return replaceNode({ ...app, workflows: [...app.workflows, flow] }, { ...node, events: { itemPress: flow.id } })
}
export function createCollectionCard(app: AppV2, nodeId: string, tables: readonly BuilderV2Table[], catalog?: AppV2['screens'][number]['catalog']): { app: AppV2; screenId: string } {
  const node = app.nodes.find(node => node.id === nodeId), source = node?.type === 'collection' ? app.sources.find(source => source.id === node.sourceId) : null
  const table = tables.find(table => table.id === source?.tableId)
  if (!table?.fields.length) throw new Error('Выберите таблицу с полями')
  const screenId = v2Id(), primary = table.primaryFieldId ?? table.fields[0]!.id
  const fields = catalog ? table.fields.filter(field => !Object.values(catalog).includes(field.id)).slice(0, 12) : table.fields.slice(0, 6)
  const nodes: AppV2Node[] = fields.map(field => ({ id: v2Id(), name: field.name, visibleTo: null, visibleWhen: null, ...(field.id === primary && !catalog ? { type: 'heading' as const, size: 'm' as const, value: { kind: 'row' as const, fieldId: field.id } } : field.type==='image'?{type:'gallery' as const,caption:field.name,columns:3,value:{kind:'row' as const,fieldId:field.id}}:field.type==='attachment'?{type:'files' as const,caption:field.name,value:{kind:'row' as const,fieldId:field.id}}:{ type: 'field' as const, label: field.name, value: { kind: 'row' as const, fieldId: field.id } }) }))
  const next: AppV2 = { ...app, nodes: [...app.nodes, ...nodes], screens: [...app.screens, { id: screenId, name: table.name, icon: 'template', navigation: false, audience: { kind: 'roles', roleIds: app.roles.map(role => role.id) }, contextTableId: table.id, ...(catalog ? { catalog } : {}), rootIds: nodes.map(node => node.id), events: { enter: null } }] }
  return { app: setCollectionCard(next, nodeId, screenId), screenId }
}
