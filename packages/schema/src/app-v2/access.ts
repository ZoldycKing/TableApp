import type { AppV2, AppV2Audience, AppV2RowScope } from './schema'
import type { AppV2Actor, AppV2Json, AppV2Record } from './values'

/** Actor identity/roles come from the verified server session, never from event arguments. */
export function matchesAppV2Audience(audience: AppV2Audience, actor: AppV2Actor): boolean {
  return audience.kind === 'public' || actor.authenticated && audience.roleIds.some(id => actor.roleIds.includes(id))
}
function ownerValue(actor: AppV2Actor, property: 'id' | 'email' | 'company'): string | null {
  const value = actor[property]
  if (!actor.authenticated || typeof value !== 'string' || !value.trim()) return null
  return property === 'email' ? value.trim().toLowerCase() : value.trim()
}
function inScope(scope: AppV2RowScope, row: AppV2Record, actor: AppV2Actor): boolean {
  if (scope.kind === 'all') return true
  const own = ownerValue(actor, scope.property), value = Object.hasOwn(row.values, scope.fieldId) ? row.values[scope.fieldId] : null
  return own !== null && typeof value === 'string' && (scope.property === 'email' ? value.trim().toLowerCase() : value.trim()) === own
}

/** These helpers consume a validated definition; component trees are deliberately not consulted. */
export function readableAppV2Fields(app: AppV2, actor: AppV2Actor, row: AppV2Record): ReadonlySet<string> {
  const result = new Set<string>()
  for (const grant of app.policy.tables.find(rule => rule.tableId === row.tableId)?.grants ?? []) {
    if (grant.read && matchesAppV2Audience(grant.audience, actor) && inScope(grant.read.rows, row, actor)) grant.read.fieldIds.forEach(id => result.add(id))
  }
  return result
}
export function projectAppV2Row(app: AppV2, actor: AppV2Actor, row: AppV2Record): Record<string, AppV2Json> {
  const fields = readableAppV2Fields(app, actor, row)
  return Object.fromEntries([...fields].filter(id => Object.hasOwn(row.values, id)).map(id => [id, row.values[id]!]))
}
export function canInvokeAppV2Workflow(app: AppV2, actor: AppV2Actor, workflowId: string): boolean {
  return app.workflows.some(flow => flow.id === workflowId) && app.policy.workflows.some(grant => grant.workflowId === workflowId && matchesAppV2Audience(grant.audience, actor))
}
export function canOpenAppV2Screen(app: AppV2, actor: AppV2Actor, screenId: string): boolean {
  const screen = app.screens.find(item => item.id === screenId)
  return Boolean(screen && matchesAppV2Audience(screen.audience, actor))
}
export type AppV2WriteDecision = { ok: true; ownerValues: Record<string, string> } | { ok: false; error: string }
export type AppV2WriteRequest =
  | { operation: 'create'; tableId: string; values: Readonly<Record<string, AppV2Json>> }
  | { operation: 'update'; row: AppV2Record; values: Readonly<Record<string, AppV2Json>> }
  | { operation: 'delete'; row: AppV2Record }

/** Permission decision only: loading/locking the row and applying values belongs to the server executor. */
export function authorizeAppV2Write(app: AppV2, actor: AppV2Actor, request: AppV2WriteRequest): AppV2WriteDecision {
  if (!actor.authenticated) return { ok: false, error: 'Для изменения данных нужно войти' }
  const tableId = request.operation === 'create' ? request.tableId : request.row.tableId
  const grants = app.policy.tables.find(rule => rule.tableId === tableId)?.grants ?? []
  const permitted = new Set<string>(), ownerValues: Record<string, string> = {}
  let matched = false
  for (const grant of grants) {
    if (!matchesAppV2Audience(grant.audience, actor)) continue
    if (request.operation === 'delete') {
      if (grant.delete && inScope(grant.delete.rows, request.row, actor)) matched = true
    } else if (request.operation === 'update') {
      if (!grant.update || !inScope(grant.update.rows, request.row, actor)) continue
      matched = true
      for (const id of grant.update.fieldIds) if (grant.update.rows.kind !== 'owned' || id !== grant.update.rows.fieldId) permitted.add(id)
    } else if (grant.create) {
      const owner = grant.create.owner, value = owner ? ownerValue(actor, owner.property) : null
      if (owner && value === null) continue
      if (owner) {
        if (Object.hasOwn(ownerValues, owner.fieldId) && ownerValues[owner.fieldId] !== value) return { ok: false, error: 'Правила владельца новой записи противоречат друг другу' }
        ownerValues[owner.fieldId] = value!
      }
      matched = true; grant.create.fieldIds.forEach(id => permitted.add(id))
    }
  }
  if (!matched) return { ok: false, error: 'Эта операция с записью недоступна' }
  if (request.operation !== 'delete') {
    const ids = Object.keys(request.values)
    if (!ids.length || ids.some(id => !permitted.has(id) || Object.hasOwn(ownerValues, id))) return { ok: false, error: 'Одно из полей недоступно для изменения' }
  }
  return { ok: true, ownerValues }
}
