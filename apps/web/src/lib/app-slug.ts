import { apps, db } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { Transaction } from './db-transaction'

/** All slug writers take this after the workspace usage lock, until commit. */
export async function lockAppSlugs(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('tableapp:app-slug'))`)
}

/** Свободный адрес приложения: к занятому названию дописывается суффикс. */
export async function uniqueSlug(base: string, exceptAppId?: string, connection: Transaction | typeof db = db): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const [taken] = await connection
      .select({ id: apps.id })
      .from(apps)
      .where(exceptAppId ? and(eq(apps.slug, candidate), ne(apps.id, exceptAppId)) : eq(apps.slug, candidate))
      .limit(1)
    if (!taken) return candidate
  }
  return `${base}-${newId('app').slice(4, 10)}`
}
