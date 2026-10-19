'use server'

import { apps, db, tables, workspaceMembers, workspaces } from '@tableapp/db'
import { businessProfileSchema, newId } from '@tableapp/schema'
import { and, eq } from 'drizzle-orm'
import { isKnownRole } from '@/lib/roles'
import { currentMember } from '@/lib/session'
import type { BusinessNavigationResult, BusinessResourceDestination } from '@/lib/business-navigation-types'
import { switchWorkspaceAction } from './team-actions'

const IDENTIFIER = /^[a-zA-Z0-9_-]{1,200}$/
const COLLECTION_PATHS = {
  home: '/app', tables: '/tables', apps: '/apps', messages: '/messages',
  team: '/team', usage: '/usage', templates: '/templates',
} as const

function parseDestination(value: unknown): BusinessResourceDestination | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => key !== 'kind' && key !== 'id')) return null
  if (input.kind === 'table' || input.kind === 'app') {
    return typeof input.id === 'string' && IDENTIFIER.test(input.id)
      ? { kind: input.kind, id: input.id } : null
  }
  if (typeof input.kind !== 'string' || !Object.hasOwn(COLLECTION_PATHS, input.kind) || input.id !== undefined) return null
  return { kind: input.kind as keyof typeof COLLECTION_PATHS }
}

/** Validate the resource before changing the active business cookie. */
export async function navigateBusinessResourceAction(
  workspaceId: string,
  destination: BusinessResourceDestination,
): Promise<BusinessNavigationResult> {
  const member = await currentMember()
  if (!member) return { ok: false, error: 'Нужно войти в систему' }
  const target = parseDestination(destination)
  if (typeof workspaceId !== 'string' || !IDENTIFIER.test(workspaceId) || !target) {
    return { ok: false, error: 'Неизвестный раздел бизнеса' }
  }
  const [membership] = await db.select({ role: workspaceMembers.role }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, member.userId))).limit(1)
  if (!membership || !isKnownRole(membership.role)) return { ok: false, error: 'У вас нет доступа к этому бизнесу' }

  let href: string
  if (target.kind === 'table') {
    const [table] = await db.select({ id: tables.id }).from(tables)
      .where(and(eq(tables.workspaceId, workspaceId), eq(tables.id, target.id))).limit(1)
    if (!table) return { ok: false, error: 'Таблица не найдена в этом бизнесе' }
    href = `/tables/${encodeURIComponent(table.id)}`
  } else if (target.kind === 'app') {
    const [app] = await db.select({ id: apps.id }).from(apps)
      .where(and(eq(apps.workspaceId, workspaceId), eq(apps.id, target.id))).limit(1)
    if (!app) return { ok: false, error: 'Приложение не найдено в этом бизнесе' }
    href = `/apps/${encodeURIComponent(app.id)}`
  } else {
    href = COLLECTION_PATHS[target.kind]
  }
  const switched = await switchWorkspaceAction(workspaceId)
  return switched.ok ? { ok: true, href } : switched
}

/** Each business starts on its own free plan, just like the first signup. */
export async function createBusinessAction(
  name: string,
): Promise<BusinessNavigationResult | { ok: true; href: string; workspaceId: string }> {
  const member = await currentMember()
  if (!member) return { ok: false, error: 'Нужно войти в систему' }
  const parsed = businessProfileSchema.shape.name.safeParse(name)
  if (!parsed.success || /[\u0000-\u001f\u007f]/.test(parsed.data)) {
    return { ok: false, error: 'Укажите название бизнеса от 1 до 100 символов' }
  }
  const workspaceId = newId('workspace')
  await db.transaction(async tx => {
    await tx.insert(workspaces).values({
      id: workspaceId, name: parsed.data, slug: `business-${workspaceId}`, ownerId: member.userId,
      businessProfile: { name: parsed.data, location: '', phone: '' },
    })
    await tx.insert(workspaceMembers).values({ workspaceId, userId: member.userId, role: 'owner', acceptedAt: new Date() })
  })
  const switched = await switchWorkspaceAction(workspaceId)
  return switched.ok ? { ok: true, workspaceId, href: '/app' } : switched
}
