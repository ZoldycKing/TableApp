'use server'

import { isDeepStrictEqual } from 'node:util'
import { apps, fields, tables } from '@tableapp/db'
import { appSchema, normalizeFieldOptions, type App, type Field } from '@tableapp/schema'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { authorizeApp } from '@/lib/authorize'
import { writeRows } from '@/lib/row-mutations'
import { preparePortalUpgrade } from '@/lib/templates/portal-upgrade'

export async function enableRepeatRequestsAction(appId: string, tableId: string, expectedDraft: unknown): Promise<{ ok: true; app: App } | { ok: false; error: string }> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  const expected = appSchema.safeParse(expectedDraft)
  if (!expected.success) return { ok: false, error: 'Черновик не прошёл проверку' }
  try {
    const app = await writeRows(auth.member.workspaceId, async ({ tx }) => {
      const [record] = await tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, auth.member.workspaceId))).for('update')
      if (!record) throw new Error('Приложение недоступно')
      const draft = { ...appSchema.parse(record.draft), id: record.id, workspaceId: record.workspaceId }
      if (!isDeepStrictEqual(draft, expected.data)) throw new Error('Черновик изменился в другой вкладке. Обновите страницу.')
      const [table] = await tx.select().from(tables).where(and(eq(tables.id, tableId), eq(tables.workspaceId, record.workspaceId))).for('update')
      if (!table) throw new Error('Таблица недоступна')
      const columns = (await tx.select().from(fields).where(eq(fields.tableId, tableId)).for('update')).map(field =>
        ({ ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) }) as unknown as Field)
      const upgrade = preparePortalUpgrade(draft, table, columns)
      for (const field of upgrade.fields) await tx.update(fields).set({ options: field.options }).where(eq(fields.id, field.id))
      await tx.update(apps).set({ draft: upgrade.app, updatedAt: new Date() }).where(eq(apps.id, appId))
      return upgrade.app
    })
    revalidatePath(`/apps/${appId}`)
    return { ok: true, app }
  } catch (error) {
    if (error instanceof Error && ['Портал доработан.', 'Черновик изменился', 'Таблица недоступна', 'Приложение недоступно'].some(prefix => error.message.startsWith(prefix))) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}
