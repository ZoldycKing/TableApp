import { apps, db } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, eq, ne } from 'drizzle-orm'

/** Свободный адрес приложения: к занятому названию дописывается суффикс. */
export async function uniqueSlug(base: string, exceptAppId?: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const [taken] = await db
      .select({ id: apps.id })
      .from(apps)
      .where(exceptAppId ? and(eq(apps.slug, candidate), ne(apps.id, exceptAppId)) : eq(apps.slug, candidate))
      .limit(1)
    if (!taken) return candidate
  }
  return `${base}-${newId('app').slice(4, 10)}`
}
