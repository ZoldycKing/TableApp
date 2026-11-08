/** Isolated UX prototype. It never reads or writes a workspace. */
export type Source = 'requests' | 'tasks'
export type Row = { id: string; title: string; status: string; assignee: string; amount: number; note: string }
export type Column = Exclude<keyof Row, 'id'>
export const SOURCES: Record<Source, string> = { requests: 'Заявки', tasks: 'Задачи' }
export const FIELDS: Record<Column, string> = { title: 'Название', status: 'Статус', assignee: 'Исполнитель', amount: 'Сумма', note: 'Описание' }
export const STATUSES = ['Новая', 'В работе', 'Готово']
export const PEOPLE = ['Анна Смирнова', 'Павел Орлов']
export type Kind = 'heading' | 'text' | 'metric' | 'collection' | 'fields' | 'button' | 'form' | 'divider' | 'columns'
export const KINDS: Record<Kind, { name: string; hint: string; icon: string }> = {
  heading: { name: 'Заголовок', hint: 'Название или начало раздела', icon: 'text' },
  text: { name: 'Текст', hint: 'Описание и пояснения', icon: 'text' },
  metric: { name: 'Показатель', hint: 'Количество или сумма', icon: 'gauge' },
  collection: { name: 'Список', hint: 'Данные из вашей таблицы', icon: 'table' },
  fields: { name: 'Поля записи', hint: 'Сведения о выбранной записи', icon: 'template' },
  button: { name: 'Кнопка', hint: 'Запуск выбранного действия', icon: 'plus' },
  form: { name: 'Форма', hint: 'Добавление новой записи', icon: 'table' },
  divider: { name: 'Разделитель', hint: 'Отделяет части страницы', icon: 'menu' },
  columns: { name: 'Колонки', hint: 'Элементы рядом на компьютере', icon: 'apps' },
}
export type Block = { id: string; kind: Kind; title: string; source: Source; text: string; field: Column; metric: 'count' | 'sum'; layout: 'list' | 'cards'; flowId: string; targetPage: string; children: Block[] }
export type Page = { id: string; name: string; icon: string; navigation?: boolean; blocks: Block[] }
export type Step = { id: string } & (
  { type: 'require'; field: Column; message: string } |
  { type: 'update'; field: Column; value: string } |
  { type: 'create' } | { type: 'history'; text: string } |
  { type: 'notify'; text: string } | { type: 'navigate'; pageId: string }
)
export const STEP_NAMES: Record<Step['type'], string> = { require: 'Проверить поле', update: 'Изменить значение', create: 'Создать запись', history: 'Добавить в историю', notify: 'Показать сообщение', navigate: 'Открыть экран' }
export type Flow = { id: string; name: string; steps: Step[] }
export type Document = { name: string; home: string; pages: Page[]; flows: Flow[] }
export type Data = { rows: Record<Source, Row[]>; history: { id: string; title: string; text: string }[]; executions: string[] }
export type Prototype = { version: 1; document: Document; data: Data }
export const STORAGE_KEY = 'tableapp.builder-prototype.v1'
export const uid = () => crypto.randomUUID()

export function makeBlock(kind: Kind, id = uid()): Block {
  return { id, kind, title: kind === 'heading' ? 'Новый заголовок' : kind === 'button' ? 'Завершить заявку' : KINDS[kind].name,
    source: 'requests', text: kind === 'text' ? 'Добавьте своё описание.' : '', field: 'amount', metric: 'count', layout: 'list', flowId: 'complete', targetPage: 'detail', children: [] }
}
export function seedPrototype(): Prototype {
  const block = (kind: Kind, id: string, patch: Partial<Block> = {}) => ({ ...makeBlock(kind, id), ...patch })
  return { version: 1, document: { name: 'Рабочие заявки', home: 'overview', pages: [
    { id: 'overview', name: 'Обзор', icon: 'home', blocks: [block('heading', 'welcome', { title: 'Всё под рукой', text: 'Заявки и задачи вашей команды.' }),
      block('columns', 'numbers', { children: [block('metric', 'request-count', { title: 'Всего заявок' }), block('metric', 'task-count', { title: 'Всего задач', source: 'tasks' })] }),
      block('collection', 'requests-list', { title: 'Заявки' }), block('collection', 'tasks-list', { title: 'Задачи', source: 'tasks', targetPage: 'task-detail' })] },
    { id: 'list', name: 'Заявки', icon: 'table', blocks: [block('heading', 'requests-heading', { title: 'Заявки' }), block('collection', 'all-requests', { title: 'Все заявки' })] },
    { id: 'detail', name: 'Карточка заявки', icon: 'template', navigation: false, blocks: [block('fields', 'request-fields', { title: 'Сведения о заявке' }), block('button', 'complete-button')] },
    { id: 'new', name: 'Новая заявка', icon: 'plus', blocks: [block('heading', 'new-heading', { title: 'Новая заявка' }), block('form', 'request-form', { title: 'Что нужно сделать?', flowId: 'create' })] },
    { id: 'task-detail', name: 'Карточка задачи', icon: 'template', navigation: false, blocks: [block('fields', 'task-fields', { title: 'Сведения о задаче', source: 'tasks' }), block('button', 'finish-task', { title: 'Завершить задачу', source: 'tasks', flowId: 'complete-task' })] },
  ], flows: [
    { id: 'complete', name: 'Завершить заявку', steps: [{ id: 'check', type: 'require', field: 'title', message: 'Заполните название заявки.' }, { id: 'status', type: 'update', field: 'status', value: 'Готово' }, { id: 'log', type: 'history', text: 'Заявка завершена' }, { id: 'notice', type: 'notify', text: 'Заявка завершена' }] },
    { id: 'create', name: 'Создать заявку', steps: [{ id: 'new-record', type: 'create' }, { id: 'new-log', type: 'history', text: 'Заявка создана' }, { id: 'new-notice', type: 'notify', text: 'Новая заявка добавлена' }, { id: 'open', type: 'navigate', pageId: 'detail' }] },
    { id: 'complete-task', name: 'Завершить задачу', steps: [{ id: 'task-status', type: 'update', field: 'status', value: 'Готово' }, { id: 'task-log', type: 'history', text: 'Задача завершена' }, { id: 'task-notice', type: 'notify', text: 'Задача завершена' }] },
  ] }, data: { rows: { requests: [
    { id: 'request-1', title: 'Ремонт ноутбука Lenovo', status: 'В работе', assignee: PEOPLE[0]!, amount: 8400, note: 'Проверить охлаждение и сохранить данные.' },
    { id: 'request-2', title: 'Обслуживание кондиционера', status: 'Новая', assignee: PEOPLE[1]!, amount: 3200, note: 'Согласовать удобное время приезда.' },
    { id: 'request-3', title: 'Замена разъёма питания', status: 'Готово', assignee: PEOPLE[0]!, amount: 2700, note: 'Можно передавать клиенту.' },
  ], tasks: [
    { id: 'task-1', title: 'Уточнить наличие деталей', status: 'В работе', assignee: PEOPLE[0]!, amount: 0, note: 'Позвонить поставщику.' },
    { id: 'task-2', title: 'Подготовить документы', status: 'Новая', assignee: PEOPLE[1]!, amount: 0, note: 'Акт по завершённым работам.' },
  ] }, history: [], executions: [] } }
}

export function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) { if (block.id === id) return block; const child = findBlock(block.children, id); if (child) return child }
}
export function updateBlock(blocks: Block[], id: string, patch: Partial<Block>): Block[] {
  return blocks.map(block => block.id === id ? { ...block, ...patch } : { ...block, children: updateBlock(block.children, id, patch) })
}
export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter(block => block.id !== id).map(block => ({ ...block, children: removeBlock(block.children, id) }))
}
export function addBlock(blocks: Block[], block: Block, parentId: string | null = null): Block[] {
  if (!parentId) return [...blocks, block]
  return blocks.map(item => item.id === parentId && item.kind === 'columns' ? { ...item, children: [...item.children, block] } : { ...item, children: addInto(item.children) })
  function addInto(items: Block[]): Block[] { return items.map(item => item.id === parentId && item.kind === 'columns' ? { ...item, children: [...item.children, block] } : { ...item, children: addInto(item.children) }) }
}
export function cloneBlock(block: Block): Block { return { ...block, id: uid(), children: block.children.map(cloneBlock) } }
/** Move only within the same parent. Cross-container placement is explicit. */
export function moveBlock(blocks: Block[], id: string, delta: number): Block[] {
  const index = blocks.findIndex(block => block.id === id), target = index + delta
  if (index >= 0) {
    if (target < 0 || target >= blocks.length) return blocks
    const next = [...blocks]; [next[index], next[target]] = [next[target]!, next[index]!]; return next
  }
  return blocks.map(block => ({ ...block, children: moveBlock(block.children, id, delta) }))
}
export function reorderBlocks(blocks: Block[], from: string, to: string): Block[] {
  const index = blocks.findIndex(item => item.id === from), target = blocks.findIndex(item => item.id === to)
  if (index >= 0 && target >= 0) { const next = [...blocks]; const [moved] = next.splice(index, 1); next.splice(target, 0, moved!); return next }
  return blocks.map(block => ({ ...block, children: reorderBlocks(block.children, from, to) }))
}
export function visibleRows(data: Data, source: Source, role: 'owner' | 'staff') { return role === 'owner' ? data.rows[source] : data.rows[source].filter(row => row.assignee === PEOPLE[0]) }

export type Execution = { ok: true; data: Data; notice: string; pageId?: string; rowId?: string } | { ok: false; error: string }
/** All changes are staged; a failed step leaves the supplied data untouched. */
export function executeFlow(document: Document, data: Data, flowId: string, context: { source: Source; rowId?: string; form?: Partial<Row>; role: 'owner' | 'staff'; requestId: string }): Execution {
  const flow = document.flows.find(item => item.id === flowId)
  if (!flow || !flow.steps.length) return { ok: false, error: 'Выберите действие с шагами.' }
  if (flow.steps.length > 20) return { ok: false, error: 'В проверочном действии доступно до 20 шагов.' }
  if (data.executions.includes(context.requestId)) return { ok: true, data, notice: 'Это действие уже выполнено.' }
  const staged = structuredClone(data)
  let row = staged.rows[context.source].find(item => item.id === context.rowId), notice = 'Действие выполнено', pageId: string | undefined
  if (row && context.role === 'staff' && row.assignee !== PEOPLE[0]) return { ok: false, error: 'Сотруднику доступна только назначенная ему запись.' }
  for (const step of flow.steps) {
    if (step.type === 'require') {
      const value = context.form?.[step.field] ?? row?.[step.field]
      if (value === undefined || value === null || String(value).trim() === '') return { ok: false, error: step.message.trim() || `Заполните поле «${FIELDS[step.field]}».` }
    } else if (step.type === 'update') {
      if (!row) return { ok: false, error: 'Откройте запись, к которой относится кнопка.' }
      if (step.field === 'amount') {
        const value = Number(step.value.replace(',', '.'))
        if (!step.value.trim() || !Number.isFinite(value)) return { ok: false, error: 'В поле «Сумма» нужно указать число.' }
        row.amount = value
      } else {
        const value = step.field === 'assignee' && step.value === '@me' ? PEOPLE[0]! : step.value
        if (step.field === 'status' && !STATUSES.includes(value)) return { ok: false, error: 'Выберите существующий статус.' }
        row[step.field] = value
      }
    } else if (step.type === 'create') {
      if (staged.rows[context.source].length >= 1000) return { ok: false, error: 'В проверочной таблице доступно до 1000 записей.' }
      if (!context.form?.title?.trim()) return { ok: false, error: 'Введите название новой записи.' }
      if (context.form.amount !== undefined && !Number.isFinite(Number(context.form.amount))) return { ok: false, error: 'В поле «Сумма» нужно указать число.' }
      row = { id: uid(), title: context.form.title.trim(), amount: Number(context.form.amount ?? 0), status: 'Новая', assignee: PEOPLE[0]!, note: context.form.note ?? '' }
      staged.rows[context.source].push(row)
    } else if (step.type === 'history') {
      if (!row) return { ok: false, error: 'Для истории сначала выберите или создайте запись.' }
      staged.history = [...staged.history.slice(-999), { id: uid(), title: row.title, text: step.text }]
    } else if (step.type === 'notify') notice = step.text || 'Действие выполнено'
    else if (step.type === 'navigate') {
      if (!document.pages.some(page => page.id === step.pageId)) return { ok: false, error: 'Экран для перехода удалён. Выберите другой экран.' }
      pageId = step.pageId
    }
  }
  staged.executions = [...staged.executions.slice(-99), context.requestId]
  return { ok: true, data: staged, notice, pageId, rowId: row?.id }
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
/** Treat local storage as untrusted; unknown versions and malformed graphs are discarded. */
export function restorePrototype(raw: string): Prototype | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!object(value) || value.version !== 1 || !object(value.document) || !object(value.data)) return null
    const doc = value.document, data = value.data
    if (typeof doc.name !== 'string' || !Array.isArray(doc.pages) || !doc.pages.length || doc.pages.length > 30 || !Array.isArray(doc.flows) || doc.flows.length > 50) return null
    const ids = new Set<string>(); let count = 0
    const validBlocks = (blocks: unknown, depth = 0): boolean => Array.isArray(blocks) && depth < 8 && blocks.every(block => {
      if (!object(block) || ++count > 150 || typeof block.id !== 'string' || ids.has(block.id) || typeof block.kind !== 'string' || !Object.hasOwn(KINDS, block.kind)) return false
      ids.add(block.id)
      return ['title', 'text', 'flowId', 'targetPage'].every(key => typeof block[key] === 'string') && (block.source === 'requests' || block.source === 'tasks') && typeof block.field === 'string' && Object.hasOwn(FIELDS, block.field) && ['count', 'sum'].includes(String(block.metric)) && ['list', 'cards'].includes(String(block.layout)) && validBlocks(block.children, depth + 1)
    })
    const pageIds = new Set<string>(), flowIds = new Set<string>()
    for (const page of doc.pages) {
      if (!object(page) || typeof page.id !== 'string' || pageIds.has(page.id) || typeof page.name !== 'string' || typeof page.icon !== 'string' || !validBlocks(page.blocks)) return null
      if (page.navigation !== undefined && typeof page.navigation !== 'boolean') return null
      pageIds.add(page.id)
    }
    if (typeof doc.home !== 'string' || !pageIds.has(doc.home)) return null
    for (const flow of doc.flows) {
      if (!object(flow) || typeof flow.id !== 'string' || flowIds.has(flow.id) || typeof flow.name !== 'string' || !Array.isArray(flow.steps) || flow.steps.length > 20) return null
      flowIds.add(flow.id)
      for (const step of flow.steps) {
        if (!object(step) || typeof step.id !== 'string') return null
        if (step.type === 'require' && typeof step.field === 'string' && Object.hasOwn(FIELDS, step.field) && typeof step.message === 'string') continue
        if (step.type === 'update' && typeof step.field === 'string' && Object.hasOwn(FIELDS, step.field) && typeof step.value === 'string') continue
        if (step.type === 'create') continue
        if ((step.type === 'history' || step.type === 'notify') && typeof step.text === 'string') continue
        if (step.type === 'navigate' && typeof step.pageId === 'string') continue
        return null
      }
    }
    if (!object(data.rows) || !Array.isArray(data.history) || data.history.length > 1000 || !Array.isArray(data.executions) || !data.executions.every(id => typeof id === 'string')) return null
    for (const source of ['requests', 'tasks']) {
      const rows = data.rows[source]
      if (!Array.isArray(rows) || rows.length > 1000 || rows.some(row => !object(row) || !['id', 'title', 'status', 'assignee', 'note'].every(key => typeof row[key] === 'string') || typeof row.amount !== 'number' || !Number.isFinite(row.amount))) return null
    }
    if (data.history.some(row => !object(row) || !['id', 'title', 'text'].every(key => typeof row[key] === 'string'))) return null
    return value as unknown as Prototype
  } catch { return null }
}
