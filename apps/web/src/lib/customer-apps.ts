import { apps, appUsers, db, workspaces } from '@tableapp/db'
import { appSchema, businessProfileSchema } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { and, eq, isNotNull } from 'drizzle-orm'
import { asRole, canEnter, defaultRole, visitorFor } from './app-roles'
import { normalizeEmail } from './auth'
import { publishedV2Roles } from './builder-v2-published'
import { grantedRoles } from './module-access'

export type AccessibleApp = { slug: string; name: string; businessName: string; businessId: string }

/** Working (non-client) roles only — platform «Мои приложения» must not list end-client businesses. */
function isWorkingVisitor(roleIds: readonly string[], clientRole: string | null) {
  if (!roleIds.length) return false
  if (!clientRole) return true
  return roleIds.some(id => id !== clientRole)
}

function isWorkingV2(roleIds: readonly string[]) {
  return roleIds.some(id => id === 'owner' || id === 'staff')
}

/**
 * Apps the person may open.
 *
 * - With `workspaceId`: same-business directory (sections of this workspace) — clients included.
 * - Without `workspaceId`: platform staff directory — only working roles; client-only enrolments stay hidden.
 */
export async function listAccessibleApps(email: string, workspaceId?: string): Promise<AccessibleApp[]> {
  const address = normalizeEmail(email)
  const platform = !workspaceId
  const records = await db.select({ id: apps.id, slug: apps.slug, published: apps.published, workspaceId: apps.workspaceId,
    profile: workspaces.businessProfile, known: appUsers.id, enrolledRole: appUsers.roleId }).from(apps)
    .innerJoin(workspaces, eq(apps.workspaceId, workspaces.id))
    .leftJoin(appUsers, and(eq(appUsers.appId, apps.id), eq(appUsers.email, address)))
    .where(workspaceId ? and(eq(apps.workspaceId, workspaceId), isNotNull(apps.published)) : isNotNull(apps.published))
  return records.flatMap(record => {
    const profile = businessProfileSchema.safeParse(record.profile)
    const businessName = profile.success ? profile.data.name : undefined
    const definition = readAppDefinition(record.published)
    if (definition.ok && definition.formatVersion === 2) {
      const app = definition.app
      const { roleIds } = publishedV2Roles(app, address)
      const invited = app.authentication.members.some(member => normalizeEmail(member.email) === address)
      if (!workspaceId && !invited && !record.known) return []
      if (!roleIds.length) return []
      if (platform && !isWorkingV2(roleIds)) return []
      if (!platform && !roleIds.length) return []
      return [{ slug: record.slug, name: app.name, businessName: businessName ?? app.name, businessId: record.workspaceId }]
    }
    const parsed = appSchema.safeParse(record.published)
    if (!parsed.success) return []
    const app = parsed.data
    const invited = app.moduleAccess ? grantedRoles(app, address).length > 0 : app.allowlist.some(entry => normalizeEmail(entry.email) === address)
    if (!workspaceId && !invited && !record.known) return []
    let visitor = visitorFor(app, address)
    if (!visitor.authenticated && record.enrolledRole && record.enrolledRole === defaultRole(app)) visitor = asRole(record.enrolledRole, address, '', true)
    if (!visitor.authenticated || !canEnter(app, visitor)) return []
    const roles = visitor.roleIds?.length ? visitor.roleIds : visitor.roleId ? [visitor.roleId] : []
    if (platform && !isWorkingVisitor(roles, defaultRole(app))) return []
    return [{ slug: record.slug, name: app.name, businessName: businessName ?? app.name, businessId: record.workspaceId }]
  })
}
