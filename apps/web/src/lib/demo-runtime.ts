import { appSchema, byPosition, instantToWallClock, newId, type Field, type View } from '@tableapp/schema'
import { generateApp } from './app-builder'
import { visibleScreensFor, type Visitor } from './app-roles'
import { buildTemplate } from './templates/build'
import { portal } from './templates/defs/portal'
import { asPortal } from './templates/portal-app'
import { projectRuntime } from './runtime-project'
import { DEMO_CLIENT_EMAIL, type DemoWorkspace } from './demo-workspace'

export { DEMO_CLIENT_EMAIL } from './demo-workspace'
let cache: { day: string; fixture: ReturnType<typeof buildDemoFixture> } | undefined

/** Demo has no database IDs, tenant configuration or storage objects. */
function buildDemoFixture(now: Date) {
  const workspaceId = 'demo_fixture_workspace'
  const built = buildTemplate({ template: portal, workspaceId, now })
  const fields = built.fields as Field[]
  const views = built.views as unknown as View[]
  const table = built.tables.find((item) => item.id === built.appTableId)!
  const app = appSchema.parse(asPortal(generateApp({ appId: newId('app'), workspaceId, slug: 'demo-fixture',
    name: 'Мастерская', table, fields: fields.filter((field) => field.tableId === table.id),
    view: views.find((item) => item.id === built.appViewId)! }), built.portal!))
  return { app, built, fields, views, now }
}
function fixture() {
  const now = new Date(), day = instantToWallClock(now)!.date
  if (!cache || cache.day !== day) cache = { day, fixture: buildDemoFixture(now) }
  return structuredClone(cache.fixture)
}
export function loadDemoApp() { return fixture().app }
/** Only generated sample data can cross this boundary into the interactive demo. */
export function loadDemoWorkspace(): DemoWorkspace {
  const { app, built, fields, views, now } = fixture()
  const tableId = built.portal!.tableId
  const field = (name: string) => fields.find(field => field.tableId === tableId && field.name === name)!.id
  const rowId = built.rows.find(row => row.tableId === tableId && row.data[built.portal!.emailFieldId] === DEMO_CLIENT_EMAIL)!.id
  return {
    app, fields, tables: built.tables.map(({ id, name, primaryFieldId }) => ({ id, name, primaryFieldId })),
    views: Object.fromEntries(views.map(view => [view.id, view])), now,
    rows: built.rows.map(row => ({ ...row, version: 0, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null })),
    order: { tableId, title: built.tables.find(table => table.id === tableId)!.primaryFieldId!, status: field('Статус'), amount: field('Сумма'),
      email: built.portal!.emailFieldId, rowId, editable: [field('Статус'), field('Сумма'), field('Оплачен')] },
  }
}
export function loadDemoRuntime(visitor: Visitor) {
  const { app, built, fields, views, now } = fixture()
  const visible = { ...app, screens: visibleScreensFor(app, visitor) }
  const byTable = new Map(built.tables.map((table) => [table.id, fields.filter((field) => field.tableId === table.id).sort(byPosition)]))
  return projectRuntime(visible, visitor, Object.fromEntries(views.map((view) => [view.id, view])), built.tables, byTable,
    built.rows.map((row) => ({ ...row, version: 0, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null })),
    new Map(built.tables.map((table) => [table.id, table.primaryFieldId])))
}
