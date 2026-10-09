import { apps, appUsers, db, workspaces } from '@tableapp/db'
import { appSchema, businessProfileSchema } from '@tableapp/schema'
import { and, eq, isNotNull } from 'drizzle-orm'
import { asRole, canEnter, defaultRole, visitorFor } from './app-roles'
import { normalizeEmail } from './auth'

/** Caller supplies an email established by the session or a verified login challenge. */
export async function listAccessibleApps(email: string, workspaceId?: string) {
  const address = normalizeEmail(email)
  const records = await db.select({ id: apps.id, slug: apps.slug, published: apps.published, workspaceId: apps.workspaceId,
    profile: workspaces.businessProfile, known: appUsers.id, enrolledRole: appUsers.roleId }).from(apps)
    .innerJoin(workspaces, eq(apps.workspaceId, workspaces.id))
    .leftJoin(appUsers, and(eq(appUsers.appId, apps.id), eq(appUsers.email, address)))
    .where(workspaceId ? and(eq(apps.workspaceId, workspaceId), isNotNull(apps.published)) : isNotNull(apps.published))
  return records.flatMap(record => {
    const parsed = appSchema.safeParse(record.published)
    if (!parsed.success) return []
    const app = parsed.data
    const invited = app.allowlist.some(entry => normalizeEmail(entry.email) === address)
    if (!workspaceId && !invited && !record.known) return []
    let visitor = visitorFor(app, address)
    if (!visitor.authenticated && record.enrolledRole && record.enrolledRole === defaultRole(app)) visitor = asRole(record.enrolledRole, address, '', true)
    if (!visitor.authenticated || !canEnter(app, visitor)) return []
    const profile = businessProfileSchema.safeParse(record.profile)
    return [{ slug: record.slug, name: app.name, businessName: profile.success ? profile.data.name : app.name, businessId: record.workspaceId }]
  })
}
