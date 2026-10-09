import { db, workspaces } from '@tableapp/db'
import { businessProfileSchema } from '@tableapp/schema'
import { eq } from 'drizzle-orm'

export async function loadBusinessProfile(workspaceId: string) {
  const [workspace] = await db.select({ profile: workspaces.businessProfile }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
  const parsed = businessProfileSchema.safeParse(workspace?.profile)
  return parsed.success ? parsed.data : null
}
