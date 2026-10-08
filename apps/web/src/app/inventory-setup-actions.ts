'use server'

import { apps, fields, tables, views } from '@tableapp/db'
import { appSchema, normalizeFieldOptions, normalizeView, type App, type Field } from '@tableapp/schema'
import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { authorizeApp } from '@/lib/authorize'
import { assertCanIncreaseUsage, isPlanLimitError } from '@/lib/limits'
import { writeRows } from '@/lib/row-mutations'
import { InventorySetupError, prepareInventoryUpgrade } from '@/lib/templates/inventory-upgrade'

export async function enableInventoryAction(appId: string, tableId: string): Promise<{ ok: true; app: App } | { ok: false; error: string }> {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  try {
    const app = await writeRows(auth.member.workspaceId, async context => {
      const { tx } = context
      const [record] = await tx.select().from(apps).where(eq(apps.id, appId)).for('update')
      if (!record || record.workspaceId !== auth.member.workspaceId) throw new InventorySetupError('Приложение недоступно')
      const draft = { ...appSchema.parse(record.draft), id: record.id, workspaceId: record.workspaceId }
      if (draft.inventory) return draft
      const [table] = await tx.select().from(tables).where(and(eq(tables.id, tableId), eq(tables.workspaceId, auth.member.workspaceId))).for('update')
      if (!table) throw new InventorySetupError('Таблица недоступна')
      const fieldRows = await tx.select().from(fields).where(eq(fields.tableId, tableId)).for('update')
      const viewRows = await tx.select().from(views).where(eq(views.tableId, tableId))
      const [last] = await tx.select({ position: tables.position }).from(tables).where(eq(tables.workspaceId, auth.member.workspaceId)).orderBy(desc(tables.position)).limit(1)
      const upgrade = prepareInventoryUpgrade(draft, table,
        fieldRows.map(field => ({ ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) }) as unknown as Field), viewRows.map(normalizeView), last?.position ?? null)
      await assertCanIncreaseUsage({ workspaceId: auth.member.workspaceId, resource: 'tables', amount: upgrade.tables.length, tx })
      await tx.insert(tables).values(upgrade.tables)
      await tx.update(fields).set({ name: 'Начальный остаток', description: 'Сохранённый остаток до подключения приёмок. Поступления записывайте через карточку товара.' }).where(eq(fields.id, upgrade.opening.id))
      await tx.insert(fields).values(upgrade.fields)
      await tx.insert(views).values(upgrade.views)
      await tx.update(apps).set({ draft: upgrade.app, homeScreenId: upgrade.app.homeScreenId, updatedAt: new Date() }).where(eq(apps.id, appId))
      context.changed.add(tableId)
      return upgrade.app
    })
    revalidatePath(`/apps/${appId}`)
    return { ok: true, app }
  } catch (error) {
    if (isPlanLimitError(error) || error instanceof InventorySetupError) return { ok: false, error: error.message }
    throw error
  }
}
