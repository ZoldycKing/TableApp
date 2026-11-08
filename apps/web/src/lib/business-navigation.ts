import { apps, db, tables, workspaceMembers, workspaces } from '@tableapp/db'
import { businessProfileSchema } from '@tableapp/schema'
import { and, asc, eq, sql } from 'drizzle-orm'
import { isKnownRole } from './roles'
import { currentMember } from './session'
import type { BusinessNavigation } from './business-navigation-types'
import { restrictedTables,tablePermission } from './table-permissions'

export type { BusinessNavigation } from './business-navigation-types'

/** The session, rather than a caller-supplied user id, scopes every query. */
export async function loadBusinessNavigation(): Promise<BusinessNavigation[]> {
  const member = await currentMember()
  if (!member) return []

  const [memberships, tableRows, appRows] = await Promise.all([
    db.select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      businessProfile: workspaces.businessProfile,
      role: workspaceMembers.role,
      tableAccess:workspaceMembers.tableAccess,
    }).from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, member.userId))
      .orderBy(asc(workspaceMembers.createdAt), asc(workspaces.id)),
    db.select({ workspaceId: tables.workspaceId, id: tables.id, name: tables.name, icon: tables.icon })
      .from(tables)
      .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, tables.workspaceId), eq(workspaceMembers.userId, member.userId)))
      .orderBy(asc(tables.position), asc(tables.createdAt), asc(tables.id)),
    db.select({ workspaceId: apps.workspaceId, id: apps.id, name: apps.name, published: sql<boolean>`${apps.published} is not null` })
      .from(apps)
      .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, apps.workspaceId), eq(workspaceMembers.userId, member.userId)))
      .orderBy(asc(apps.createdAt), asc(apps.id)),
  ])

  const result: BusinessNavigation[] = []
  const byWorkspace = new Map<string, BusinessNavigation>()
  for (const membership of memberships) {
    if (!isKnownRole(membership.role)) continue
    const profile = businessProfileSchema.safeParse(membership.businessProfile)
    const business: BusinessNavigation = {
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspaceName,
      businessName: profile.success ? profile.data.name : membership.workspaceName,
      role: membership.role,
      ...(restrictedTables(membership)?{tableLimited:true}:{}),
      tables: [],
      apps: [],
    }
    result.push(business)
    byWorkspace.set(business.workspaceId, business)
  }
  for (const { workspaceId, ...table } of tableRows){const membership=memberships.find(item=>item.workspaceId===workspaceId);if(membership&&tablePermission(membership,table.id)!=='none')byWorkspace.get(workspaceId)?.tables.push(table)}
  for (const { workspaceId, ...app } of appRows){const membership=memberships.find(item=>item.workspaceId===workspaceId);if(membership&&!restrictedTables(membership))byWorkspace.get(workspaceId)?.apps.push(app)}
  return result
}
