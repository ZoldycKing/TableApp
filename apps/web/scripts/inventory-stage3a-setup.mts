import { writeFileSync } from 'node:fs'
import { and, eq, isNull } from 'drizzle-orm'
import { db, apps, users, workspaces, workspaceMembers, sessions, staffSessions, rows } from '@tableapp/db'
import { readAppDefinition } from '@tableapp/schema/app-definition'
import { applyTemplateAction } from '../src/app/template-actions.ts'

const userId = 'usr_invvisual3a'
const workspaceId = 'wsp_invvisual3a'
const ownerEmail = 'owner-inv3a@example.invalid'
const staffEmail = 'kladovshik3a@example.invalid'
const ownerSessionId = 'ses_invvisual3a_owner'
const staffSessionId = 'ses_invvisual3a_staff'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Clean up existing data
await db.delete(apps).where(eq(apps.workspaceId, workspaceId))
await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId))
await db.delete(workspaces).where(eq(workspaces.id, workspaceId))
await db.delete(staffSessions).where(eq(staffSessions.email, ownerEmail))
await db.delete(staffSessions).where(eq(staffSessions.email, staffEmail))
await db.delete(sessions).where(eq(sessions.userId, userId))
await db.delete(users).where(eq(users.id, userId))

// Create user and workspace
await db.insert(users).values({ id: userId, email: ownerEmail })
await db.insert(workspaces).values({ 
  id: workspaceId, 
  ownerId: userId, 
  name: 'Inventory Stage 3a', 
  slug: 'inv-stage3a', 
  plan: 'business' 
})
await db.insert(workspaceMembers).values({ userId, workspaceId, role: 'owner' })
await db.insert(sessions).values({ 
  id: 'ses_invvisual3a_ws', 
  userId, 
  expiresAt: new Date(Date.now() + SESSION_TTL_MS) 
})
await db.insert(staffSessions).values([
  { id: ownerSessionId, email: ownerEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  { id: staffSessionId, email: staffEmail, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
])

// Mock session for applyTemplateAction
const mockSession = {
  member: { 
    userId, 
    workspaceId, 
    workspaceName: 'Inventory Stage 3a', 
    email: ownerEmail, 
    name: 'Иван Орлов', 
    role: 'owner' as const
  }
}

// Install template
const installed = await applyTemplateAction('sklad')
if (!installed.ok) throw new Error('Failed to install template')

const [record] = await db.select().from(apps).where(eq(apps.id, installed.appId))
const read = readAppDefinition(record!.draft)
if (!read.ok || read.formatVersion !== 2 || !read.app.inventory) throw new Error('bad inventory')

const inv = read.app.inventory
const published = {
  ...read.app,
  authentication: {
    ...read.app.authentication,
    members: [
      { email: ownerEmail, roleIds: ['owner'] as string[], company: '' },
      { email: staffEmail, roleIds: ['staff'] as string[], company: '' },
    ],
  },
}
await db.update(apps).set({ published, draft: published, publishedAt: new Date() }).where(eq(apps.id, installed.appId))

// Get draft count ИН-0001 which is seeded in the template
const counts = await db.select().from(rows).where(and(eq(rows.tableId, inv.inventoryCountsTableId!), isNull(rows.deletedAt)))
const draftCount = counts.find(row => {
  const data = row.data as Record<string, unknown>
  return data[inv.countNumberFieldId!] === 'ИН-0001' && data[inv.countStatusFieldId!] === inv.countStatusDraft
})

if (!draftCount) throw new Error('Draft count ИН-0001 not found')

// Write fixture
const fixture = {
  appId: installed.appId, 
  slug: installed.appSlug,
  ownerCookie: `tableapp_staff=${ownerSessionId}`,
  staffCookie: `tableapp_staff=${staffSessionId}`,
  countsUrl: `http://127.0.0.1:3210/a/${installed.appSlug}?screen=${inv.countsScreenId}`,
  countDraftUrl: `http://127.0.0.1:3210/a/${installed.appSlug}?screen=${inv.countScreenId}&row=${draftCount.id}`,
  reorderUrl: `http://127.0.0.1:3210/a/${installed.appSlug}?screen=${inv.reorderScreenId}`,
  movementsUrl: `http://127.0.0.1:3210/a/${installed.appSlug}?screen=${inv.movementsScreenId}`,
  purchasesUrl: `http://127.0.0.1:3210/a/${installed.appSlug}?screen=${inv.purchasesScreenId}`,
  draftCountId: draftCount.id,
}

writeFileSync('/tmp/inventory-visual-stage3a.json', JSON.stringify(fixture, null, 2))
console.log('Fixture created:', JSON.stringify(fixture, null, 2))
process.exit(0)
