'use server'

import { isDeepStrictEqual } from 'node:util'
import { apps, fields, tables, views } from '@tableapp/db'
import { appSchema, normalizeFieldOptions, normalizeView, type App, type Field } from '@tableapp/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { authorizeApp } from '@/lib/authorize'
import { publishTable } from '@/lib/live'
import { writeRows } from '@/lib/row-mutations'
import { DispatchSetupError } from '@/lib/templates/dispatch-app'
import { prepareDispatchUpgrade } from '@/lib/templates/dispatch-upgrade'

export async function enableDispatchAction(appId: string, tableId: string, expectedDraft: unknown): Promise<{ ok: true; app: App } | { ok: false; error: string }> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  const expected = appSchema.safeParse(expectedDraft)
  if (!expected.success) return { ok: false, error: 'Черновик не прошёл проверку' }
  let changed = false
  try {
    const app = await writeRows(auth.member.workspaceId, async context => {
      const { tx } = context
      const [record] = await tx.select().from(apps).where(eq(apps.id, appId)).for('update')
      if (!record || record.workspaceId !== auth.member.workspaceId) throw new DispatchSetupError('Приложение недоступно')
      const draft = { ...appSchema.parse(record.draft), id: record.id, workspaceId: record.workspaceId }
      if (!isDeepStrictEqual(draft, expected.data)) throw new DispatchSetupError('Черновик изменился в другой вкладке. Обновите страницу и повторите настройку.')
      const [table] = await tx.select().from(tables).where(and(eq(tables.id, tableId), eq(tables.workspaceId, auth.member.workspaceId))).for('update')
      if (!table) throw new DispatchSetupError('Таблица недоступна')
      const fieldRows = await tx.select().from(fields).where(eq(fields.tableId, tableId)).for('update')
      const normalize = (field: typeof fieldRows[number]) => ({ ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) }) as unknown as Field
      const ownFields = fieldRows.map(normalize)
      const relation = ownFields.find(field => field.name === 'Клиент' && field.type === 'relation')
      const clientId = relation?.type === 'relation' ? relation.options.tableId : null
      const [clients] = clientId ? await tx.select().from(tables).where(and(eq(tables.id, clientId), eq(tables.workspaceId, auth.member.workspaceId))).for('update') : []
      const clientFields = clients ? (await tx.select().from(fields).where(eq(fields.tableId, clients.id)).for('update')).map(normalize) : []
      const viewRows = await tx.select().from(views).where(inArray(views.tableId, [tableId, ...(clients ? [clients.id] : [])]))
      const upgrade = prepareDispatchUpgrade(draft, table, ownFields, viewRows.map(normalizeView), clients ?? null, clientFields)
      if (upgrade.app === draft) return draft
      if (upgrade.fields.length) await tx.insert(fields).values(upgrade.fields)
      await tx.update(apps).set({ draft: upgrade.app, homeScreenId: upgrade.app.homeScreenId, updatedAt: new Date() }).where(eq(apps.id, appId))
      changed = true
      return upgrade.app
    })
    if (changed) publishTable(tableId, 'structure')
    revalidatePath(`/apps/${appId}`)
    return { ok: true, app }
  } catch (error) {
    if (error instanceof DispatchSetupError) return { ok: false, error: error.message }
    throw error
  }
}
