import { customerWorkflows, type App, type AppModule, type ModuleAccess } from '@tableapp/schema'
import type { Visitor } from './app-roles'

export type ModuleAccessApp = Pick<App, 'id' | 'accessMode' | 'allowlist' | 'roles' | 'modules' | 'moduleAccess'>

export function hasRole(visitor: Visitor, roleId: string): boolean {
  return visitor.authenticated && (visitor.roleIds ?? (visitor.roleId ? [visitor.roleId] : [])).includes(roleId)
}

export function grantedRoles(app: Pick<App, 'modules' | 'moduleAccess' | 'roles'>, email: string): string[] {
  const normalized = email.trim().toLowerCase()
  return [...new Set((app.moduleAccess?.grants ?? []).filter(grant => grant.email.trim().toLowerCase() === normalized &&
    app.modules?.some(module => module.id === grant.moduleId && Object.values(module.roles ?? {}).includes(grant.roleId)) &&
    app.roles.some(role => role.id === grant.roleId && !role.isDefault)).map(grant => grant.roleId))]
}

export function moduleForTable(app: App, tableId: string): AppModule | undefined {
  return app.modules?.find(module => module.source.type === 'booking' ? Object.values(app.booking?.tables ?? {}).includes(tableId)
    : module.source.type === 'customer' ? module.source.tableId === tableId || customerWorkflows(app).some(config => module.source.type === 'customer' && config.tableId === module.source.tableId && (config.cart?.itemsTableId === tableId || config.crm?.clientsTableId === tableId))
    : module.source.type === 'inventory' ? Object.values(app.inventory?.tables ?? {}).includes(tableId)
    : Object.values(app.production?.tables ?? {}).includes(tableId))
}

export function workflowRole(app: App, tableId: string, role: string): string {
  return moduleForTable(app, tableId)?.roles?.[role] ?? role
}

export function acceptsModuleIntake(app: App, tableId: string): boolean {
  const module = moduleForTable(app, tableId)
  if (!module || module.intakeEnabled !== false) return true
  if (module.source.type === 'booking') return tableId !== app.booking?.tables.visits
  return module.source.type !== 'customer'
}

export function checkModuleAccess(app: App): string | null {
  if (!app.moduleAccess) return null
  if (!app.modules?.length) return 'Для рабочих прав требуется список модулей'
  const privateRoles = new Set<string>(), screenIds = new Set<string>()
  for (const module of app.modules) {
    if (!module.roles || !module.screenIds) return 'Для модуля не настроены рабочие роли и экраны'
    const ownedRoles = Object.values(module.roles)
    for (const role of ownedRoles) {
      if (privateRoles.has(role) || !app.roles.some(candidate => candidate.id === role && !candidate.isDefault)) return 'Рабочая роль должна принадлежать одному модулю'
      privateRoles.add(role)
    }
    for (const id of module.screenIds) {
      const screen = app.screens.find(screen => screen.id === id)
      if (!screen || screenIds.has(id)) return 'Экран должен принадлежать одному модулю'
      screenIds.add(id)
      if (screen.access.roles.some(role => !app.roles.some(candidate => candidate.id === role && candidate.isDefault) && !ownedRoles.includes(role))) return 'Экран использует рабочую роль другого модуля'
    }
  }
  if (app.screens.some(screen => !screenIds.has(screen.id))) return 'Не все экраны принадлежат модулям'
  const assignments = new Set<string>()
  for (const grant of app.moduleAccess.grants) {
    const key = `${grant.email.trim().toLowerCase()}:${grant.moduleId}`
    if (assignments.has(key)) return 'У сотрудника должно быть одно рабочее назначение на модуль'
    assignments.add(key)
    const module = app.modules.find(module => module.id === grant.moduleId)
    if (!module || !Object.values(module.roles!).includes(grant.roleId)) return 'Назначение использует роль другого модуля'
  }
  return null
}

/** Remove/revoke an exact assignment only; no matching by names or default role. */
export function setModuleGrant(access: ModuleAccess, email: string, moduleId: string, roleId: string | null): ModuleAccess {
  const normalized = email.trim().toLowerCase()
  return { grants: [...access.grants.filter(grant => grant.email.trim().toLowerCase() !== normalized || grant.moduleId !== moduleId), ...(roleId ? [{ email: normalized, moduleId, roleId }] : [])] }
}
