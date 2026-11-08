import type { AppV2, AppV2RowScope } from '@tableapp/schema/app-v2'

/** Explicit configuration may add fields, but must retain existing row ownership restrictions. */
export function grantBuilderV2Operation(app: AppV2, tableId: string, roleIds: readonly string[], operation: 'create' | 'update' | 'delete', fieldIds: string[] = []): AppV2['policy']['tables'] {
  const existing = app.policy.tables.find(rule => rule.tableId === tableId), grants = [...(existing?.grants ?? [])]
  for (const roleId of roleIds) {
    const own = grants.filter(grant => grant.audience.kind === 'roles' && grant.audience.roleIds.includes(roleId))
    if (operation === 'create') {
      if (!own.some(grant => grant.create && fieldIds.every(id => grant.create!.fieldIds.includes(id)))) grants.push({ audience: { kind: 'roles', roleIds: [roleId] }, create: { fieldIds } })
      continue
    }
    const prior = own.flatMap(grant => grant[operation] ? [grant[operation]!.rows] : [])
    const readable = own.flatMap(grant => grant.read ? [grant.read.rows] : [])
    const owner = own.find(grant => grant.create?.owner)?.create?.owner
    const scope: AppV2RowScope = prior.find(scope => scope.kind === 'owned') ?? prior[0] ?? readable.find(scope => scope.kind === 'owned') ?? (owner ? { kind: 'owned', ...owner } : { kind: 'all' })
    if (operation === 'delete') {
      if (!prior.length) grants.push({ audience: { kind: 'roles', roleIds: [roleId] }, delete: { rows: scope } })
    } else {
      if (scope.kind === 'owned' && fieldIds.includes(scope.fieldId)) throw new Error('Поле владельца нельзя менять этой формой. Отметьте для него «Не разрешать менять значение».')
      if (!own.some(grant => grant.update && fieldIds.every(id => grant.update!.fieldIds.includes(id)))) grants.push({ audience: { kind: 'roles', roleIds: [roleId] }, update: { fieldIds, rows: scope } })
    }
  }
  const rule = { tableId, grants }
  return existing ? app.policy.tables.map(current => current.tableId === tableId ? rule : current) : [...app.policy.tables, rule]
}
