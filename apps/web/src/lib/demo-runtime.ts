import { appSchema, byPosition, instantToWallClock, newId, type Field, type View } from '@tableapp/schema'
import { generateApp } from './app-builder'
import { visibleScreensFor, type Visitor } from './app-roles'
import { buildTemplate } from './templates/build'
import { portal } from './templates/defs/portal'
import { asPortal } from './templates/portal-app'
import { projectRuntime } from './runtime-project'

/** Fictional customer used by the features-page role illustration. Not a live account. */
export const DEMO_CLIENT_EMAIL = 'petrov@example.ru'
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
/** Role illustration for the features page. Rows are projected before they leave the server. */
export function loadDemoRuntime(visitor: Visitor) {
  const { app, built, fields, views, now } = fixture()
  const visible = { ...app, screens: visibleScreensFor(app, visitor) }
  const byTable = new Map(built.tables.map((table) => [table.id, fields.filter((field) => field.tableId === table.id).sort(byPosition)]))
  return projectRuntime(visible, visitor, Object.fromEntries(views.map((view) => [view.id, view])), built.tables, byTable,
    built.rows.map((row) => ({ ...row, version: 0, createdAt: now, updatedAt: now, createdBy: null, updatedBy: null })),
    new Map(built.tables.map((table) => [table.id, table.primaryFieldId])))
}
