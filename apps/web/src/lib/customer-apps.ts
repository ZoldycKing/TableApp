import { apps, appUsers, businessCustomers, db, workspaceClientApps, workspaces } from '@tableapp/db'
import { appSchema, businessProfileSchema } from '@tableapp/schema'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { and, eq, isNotNull } from 'drizzle-orm'
import { asRole, canEnter, defaultRole, visitorFor } from './app-roles'
import { normalizeEmail } from './auth'
import { builderV2LogoUrl } from './builder-v2-logo-types'
import { publishedV2Roles } from './builder-v2-published'
import { grantedRoles } from './module-access'

export type AccessibleApp = { slug: string; name: string; businessName: string; businessId: string }

/** Platform «Где вы клиент»: name + logo/icon only, no orders/statuses/messages. */
export type ClientBusiness = {
  businessId: string
  businessName: string
  slug: string
  logoUrl?: string
  /** ProtoIcon name when no logo — never a letter avatar. */
  icon: string
}

function clientDirectoryIcon(app: { name?: string; appearance?: { icon?: string }; purpose?: string; modules?: unknown }): string {
  const explicit = app.appearance?.icon
  if (explicit && explicit !== 'apps') return explicit
  const hay = `${app.name ?? ''} ${app.purpose ?? ''}`.toLowerCase()
  if (/салон|salon|красот|парикм/.test(hay)) return 'scissors'
  if (/сервис|ремонт|service|мастерск|wrench/.test(hay)) return 'wrench'
  if (/склад|товар|shop|магазин|продаж/.test(hay)) return 'box'
  if (/доставк|курьер|delivery/.test(hay)) return 'truck'
  if (/запис|booking|календар/.test(hay)) return 'calendar'
  if (Array.isArray(app.modules) && app.modules.length) return 'clipboard'
  return 'building'
}

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

/**
 * Businesses where this account has client activity.
 *
 * Activity = a `business_customers` profile exists for the email. That row is
 * created only when the person enters a business as a client (storefront intake,
 * question, enrolled cabinet, or authenticated client visit). Mere allowlist /
 * invite membership without a visit does not create a profile and must not appear.
 *
 * Platform directory returns name + logo + deep link only — never orders,
 * statuses, messages or counts.
 */
export async function listClientBusinesses(email: string): Promise<ClientBusiness[]> {
  const address = normalizeEmail(email)
  const profiles = await db.select({
    workspaceId: businessCustomers.workspaceId,
    profile: workspaces.businessProfile,
    clientAppId: workspaceClientApps.appId,
  }).from(businessCustomers)
    .innerJoin(workspaces, eq(workspaces.id, businessCustomers.workspaceId))
    .leftJoin(workspaceClientApps, eq(workspaceClientApps.workspaceId, businessCustomers.workspaceId))
    .where(eq(businessCustomers.email, address))

  const staffApps = await listAccessibleApps(address)
  const staffWorkspaces = new Set(staffApps.map(item => item.businessId))

  const result: ClientBusiness[] = []
  for (const entry of profiles) {
    if (staffWorkspaces.has(entry.workspaceId)) continue
    const published = await db.select({
      id: apps.id, slug: apps.slug, name: apps.name, published: apps.published, workspaceId: apps.workspaceId,
    }).from(apps).where(and(eq(apps.workspaceId, entry.workspaceId), isNotNull(apps.published)))

    const preferred = entry.clientAppId
      ? published.find(app => app.id === entry.clientAppId)
      : undefined
    const candidates = preferred ? [preferred, ...published.filter(app => app.id !== preferred.id)] : published

    let chosen: ClientBusiness | null = null
    for (const record of candidates) {
      const definition = readAppDefinition(record.published)
      if (definition.ok && definition.formatVersion === 2) {
        const app = { ...definition.app, id: record.id, workspaceId: record.workspaceId }
        const { roleIds } = publishedV2Roles(app, address)
        // Prefer a client-facing app; fall back to any published app with a slug.
        if (roleIds.includes('client') || roleIds.length === 0 || preferred?.id === record.id) {
          const profile = businessProfileSchema.safeParse(entry.profile)
          chosen = {
            businessId: entry.workspaceId,
            businessName: profile.success ? profile.data.name : app.name,
            slug: record.slug,
            logoUrl: builderV2LogoUrl(app),
            icon: clientDirectoryIcon(app),
          }
          break
        }
        if (!chosen) {
          const profile = businessProfileSchema.safeParse(entry.profile)
          chosen = {
            businessId: entry.workspaceId,
            businessName: profile.success ? profile.data.name : app.name,
            slug: record.slug,
            logoUrl: builderV2LogoUrl(app),
            icon: clientDirectoryIcon(app),
          }
        }
        continue
      }
      const parsed = appSchema.safeParse(record.published)
      if (!parsed.success) continue
      const app = parsed.data
      const client = defaultRole(app)
      const visitor = visitorFor(app, address)
      const isClient = visitor.authenticated && client !== null && (
        visitor.roleId === client || (visitor.roleIds?.includes(client) ?? false) || visitor.enrolled
      )
      if (isClient || preferred?.id === record.id || !chosen) {
        const profile = businessProfileSchema.safeParse(entry.profile)
        const next = {
          businessId: entry.workspaceId,
          businessName: profile.success ? profile.data.name : app.name,
          slug: record.slug,
          icon: clientDirectoryIcon(app),
        }
        if (isClient || preferred?.id === record.id) {
          chosen = next
          break
        }
        chosen = next
      }
    }
    if (chosen) result.push(chosen)
  }

  result.sort((a, b) => a.businessName.localeCompare(b.businessName, 'ru'))
  return result
}
