import { byPosition, isComputed, parseCellValue, type App, type Field, type View } from '@tableapp/schema'
import { ANONYMOUS, asRole, companyOf, visibleScreensFor, writableFields } from './app-roles'
import { projectRuntime, type RuntimeSourceRow } from './runtime-project'

export const DEMO_CLIENT_EMAIL = 'petrov@example.ru'
export type DemoWorkspace = {
  app: App
  tables: { id: string; name: string; primaryFieldId: string | null }[]
  fields: Field[]
  views: Record<string, View>
  rows: RuntimeSourceRow[]
  now: Date
  order: { tableId: string; title: string; status: string; amount: string; email: string; rowId: string; editable: string[] }
}

function assertSynthetic(data: DemoWorkspace) {
  if (data.app.workspaceId !== 'demo_fixture_workspace') throw new Error('Interactive demo accepts synthetic fixtures only')
}
function visitorForDemo(data: DemoWorkspace, role: string) {
  return role === 'anonymous' ? ANONYMOUS : asRole(role, role === 'client' ? DEMO_CLIENT_EMAIL : null, companyOf(data.app, DEMO_CLIENT_EMAIL))
}

/** Same projection as the live app, over an explicitly public fictional dataset. */
export function projectDemoWorkspace(data: DemoWorkspace, role: string, rows = data.rows) {
  assertSynthetic(data)
  const visitor = visitorForDemo(data, role)
  const fields = new Map(data.tables.map(table => [table.id, data.fields.filter(field => field.tableId === table.id).sort(byPosition)]))
  const app = { ...data.app, screens: visibleScreensFor(data.app, visitor) }
  const runtime = projectRuntime(app, visitor, data.views, data.tables, fields, rows,
    new Map(data.tables.map(table => [table.id, table.primaryFieldId])), { now: data.now })
  runtime.app.theme.accent = 'green'
  // This first visit demonstrates one complete operation, not a long intake form.
  runtime.app.screens = runtime.app.screens.map(screen => screen.type === 'form' && screen.mode === 'edit' && screen.tableId === data.order.tableId
    ? { ...screen, components: screen.components.filter(component => component.type === 'form_field' && data.order.editable.includes(component.fieldId)) } : screen)
  return runtime
}

export type DemoEdit = { tableId: string; rowId: string; values: Record<string, unknown> }
export type DemoEditResult = { ok: true; rows: RuntimeSourceRow[] } | { ok: false; error: string }

/** Pure browser-only edit. No action, API, persistence, email or tenant data. */
export function editDemoOrder(data: DemoWorkspace, rows: RuntimeSourceRow[], role: string, edit: DemoEdit): DemoEditResult {
  assertSynthetic(data)
  if (edit.tableId !== data.order.tableId) return { ok: false, error: 'В этом примере можно изменить статус, сумму и оплату заказа.' }
  const runtime = projectDemoWorkspace(data, role, rows)
  const row = runtime.tables[edit.tableId]?.rows.find(row => row.id === edit.rowId)
  const allowed = writableFields(runtime.app, edit.tableId, visitorForDemo(data, role), 'update')
  if (!row || !allowed.size) return { ok: false, error: 'Изменять заказы можно в роли сотрудника.' }
  const clean: Record<string, unknown> = {}
  for (const field of data.fields.filter(field => field.tableId === edit.tableId && allowed.has(field.id) && !isComputed(field.type))) {
    if (!Object.hasOwn(edit.values, field.id)) continue
    try {
      const value = parseCellValue(field, edit.values[field.id])
      if (field.type === 'single_select' && value !== null && !field.options.choices.some(choice => choice.id === value)) throw new Error('choice')
      clean[field.id] = value
    } catch { return { ok: false, error: `Проверьте поле «${field.name}».` } }
  }
  if (!Object.keys(clean).length) return { ok: false, error: 'Выберите новый статус заказа.' }
  return { ok: true, rows: rows.map(row => row.tableId === edit.tableId && row.id === edit.rowId
    ? { ...row, version: row.version + 1, data: { ...row.data, ...clean } } : row) }
}
