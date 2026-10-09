'use server'

import { db, workspaces } from '@tableapp/db'
import { businessProfileSchema } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { authorizeWorkspace } from '@/lib/authorize'

export async function saveBusinessProfileAction(value: unknown) {
  const auth = await authorizeWorkspace()
  if (!auth.ok) return auth
  const parsed = businessProfileSchema.safeParse(value)
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Проверьте данные бизнеса' }
  await db.update(workspaces).set({ businessProfile: parsed.data }).where(eq(workspaces.id, auth.member.workspaceId))
  revalidatePath('/', 'layout')
  return { ok: true as const }
}
