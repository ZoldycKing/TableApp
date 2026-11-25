'use server'

import { createHash } from 'node:crypto'
import { apps, fields, orderDeliveries, rows, tables, views, workspaceClientApps } from '@tableapp/db'
import { appSchema, normalizeFieldOptions, type App, type Field, type View } from '@tableapp/schema'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { authorizeApp } from '@/lib/authorize'
import { generateApp } from '@/lib/app-builder'
import { checkAppReferences, type AppReferenceCatalog } from '@/lib/app-references'
import { legacyAppModules } from '@/lib/app-modules'
import { composeModules, ModuleCompositionError, scopeModuleAccess } from '@/lib/module-composition'
import { availableModuleStarters, moduleStarter } from '@/lib/module-options'
import { conversationResource } from '@/lib/conversation-resource'
import { buildTemplate } from '@/lib/templates/build'
import { findTemplate } from '@/lib/templates/catalog'
import { templatePreset } from '@/lib/templates/presets'
import { assertCanIncreaseUsage, isPlanLimitError, previewIncrease } from '@/lib/limits'
import { RowWriteError, writeRows, type RowTransaction } from '@/lib/row-mutations'
import { moduleOwnershipError } from '@/lib/module-lifecycle'
import { connectSalesInventory } from '@/lib/sales-inventory-connection'
import { connectProductionInventory } from '@/lib/production-inventory-connection'
import { checkpointBeforeChange, recordConfigVersion } from '@/lib/app-config-history'

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const ownedApp = (record: typeof apps.$inferSelect): App => appSchema.parse({ ...appSchema.parse(record.draft), id: record.id, workspaceId: record.workspaceId, slug: record.slug })
const targetKind = (templateId: string) => moduleStarter(templateId)?.kind ?? null

async function catalog(context: RowTransaction): Promise<AppReferenceCatalog> {
  const scoped = context.tx.select({ id: tables.id }).from(tables).where(eq(tables.workspaceId, context.workspaceId))
  const [tableRows, fieldRows, viewRows] = await Promise.all([scoped,
    context.tx.select().from(fields).where(inArray(fields.tableId, scoped)), context.tx.select().from(views).where(inArray(views.tableId, scoped))])
  return { tableIds: new Set(tableRows.map(table => table.id)), fields: new Map(fieldRows.map(field => [field.id, { ...field, options: normalizeFieldOptions(field.type as Field['type'], field.options) } as unknown as Field])), views: new Map(viewRows.map(view => [view.id, view])) }
}

async function prepare(context: RowTransaction, record: typeof apps.$inferSelect, templateId: string, ownerEmail: string, sourceAppId?: string) {
  const base = ownedApp(record), kind = targetKind(templateId)
  if (!kind) throw new RowWriteError('invalid', 'Выберите поддерживаемую возможность приложения')
  const modules = base.modules ?? legacyAppModules(base)
  if (modules.some(module => module.kind === kind)) return { already: true as const, app: base, tables: [], fields: [], views: [], source: null }
  if (!modules.length || !availableModuleStarters(modules.map(module => module.kind)).some(starter => starter.kind === kind)) throw new RowWriteError('invalid', 'Это сочетание требует отдельной интеграции склада или производства. Текущие возможности сохранены.')
  const existing = await catalog(context)
  const referenceError = checkAppReferences(base, existing)
  if (referenceError) throw new RowWriteError('invalid', referenceError)
  if (kind === 'inventory') {
    if (sourceAppId) throw new RowWriteError('invalid', 'Перенос существующего склада выполняется отдельно, чтобы сохранить его товары и остатки.')
    const salesTable = modules.find(module => module.kind === 'sales')?.source
    if (salesTable?.type === 'customer') {
      const active = await context.tx.select({ contract: orderDeliveries.contract, data: rows.data }).from(orderDeliveries)
        .innerJoin(rows, and(eq(rows.tableId, orderDeliveries.deliveryTableId), eq(rows.id, orderDeliveries.deliveryRowId)))
        .where(and(eq(orderDeliveries.workspaceId, context.workspaceId), eq(orderDeliveries.orderTableId, salesTable.tableId), isNull(rows.deletedAt)))
      if (active.some(link => {
        const c = link.contract.delivery, logistics = c.logistics
        return logistics?.kind === 'delivery' && ![c.cancelStatus, logistics.deliveredStatus, logistics.returnedStatus].includes(String((link.data as Record<string, unknown>)[c.statusFieldId]))
      })) throw new RowWriteError('invalid', 'Сначала завершите уже переданные доставки. Подключение склада к действующим отправкам требует отдельного переноса, чтобы сохранить их историю.')
    }
    const [last] = await context.tx.select({ position: tables.position }).from(tables).where(eq(tables.workspaceId, context.workspaceId)).orderBy(desc(tables.position)).limit(1)
    return connectSalesInventory(base, ownerEmail, existing.fields, existing.views, last?.position ?? null)
  }
  if (kind === 'production') {
    if (sourceAppId) throw new RowWriteError('invalid', 'Перенос существующего производства выполняется отдельно, чтобы сохранить выпуски, нормы и складскую историю.')
    const [last] = await context.tx.select({ position: tables.position }).from(tables).where(eq(tables.workspaceId, context.workspaceId)).orderBy(desc(tables.position)).limit(1)
    return connectProductionInventory(base, ownerEmail, existing.fields, existing.views, last?.position ?? null)
  }
  if (sourceAppId) {
    const [source] = await context.tx.select().from(apps).where(and(eq(apps.id, sourceAppId), eq(apps.workspaceId, context.workspaceId))).limit(1)
    if (!source || source.id === record.id || source.published) throw new RowWriteError('invalid', 'Для повторного использования выберите своё неопубликованное приложение. Перенос действующих приложений будет отдельной операцией.')
    const addition = ownedApp(source)
    const sourceModules = addition.modules ?? legacyAppModules(addition)
    if (sourceModules.length !== 1 || sourceModules[0]!.kind !== kind) throw new RowWriteError('invalid', 'Источник использует другой рабочий сценарий')
    const sourceError = checkAppReferences(addition, existing)
    if (sourceError) throw new RowWriteError('invalid', sourceError)
    return { already: false as const, app: composeModules(base, addition, existing.views), tables: [], fields: [], views: [], source: source.id }
  }
  const [last] = await context.tx.select({ position: tables.position }).from(tables).where(eq(tables.workspaceId, context.workspaceId)).orderBy(desc(tables.position)).limit(1)
  const built = buildTemplate({ template: findTemplate(templateId)!, workspaceId: context.workspaceId, afterPosition: last?.position ?? null })
  const table = built.tables.find(table => table.id === built.appTableId)!
  const generated = generateApp({ appId: base.id, workspaceId: base.workspaceId, name: built.appName, slug: base.slug,
    table, fields: built.fields.filter(field => field.tableId === table.id) as Field[], view: built.views.find(view => view.id === built.appViewId)! as View })
  const addition = templatePreset(generated, built)
  addition.allowlist = [{ email: ownerEmail, roleId: 'manager', company: '' }]
  for (const table of built.tables) existing.tableIds.add(table.id)
  for (const field of built.fields) existing.fields.set(field.id, field as Field)
  for (const view of built.views) existing.views.set(view.id, view)
  return { already: false as const, app: composeModules(base, addition, existing.views), tables: built.tables, fields: built.fields, views: built.views, source: null }
}

function message(error: unknown) {
  if (error instanceof RowWriteError || error instanceof ModuleCompositionError || isPlanLimitError(error)) return { ok: false as const, error: error.message }
  throw error
}

export async function previewModuleConnectionAction(appId: string, templateId: string, sourceAppId?: string) {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  try {
    return await writeRows(auth.member.workspaceId, async context => {
      const [record] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
      if (!record) throw new RowWriteError('missing', 'Приложение не найдено')
      const result = await prepare(context, record, templateId, auth.member.email, sourceAppId)
      const existing = await catalog(context)
      const error = checkAppReferences(result.app, {
        tableIds: new Set([...existing.tableIds, ...result.tables.map(table => table.id)]),
        fields: new Map([...existing.fields, ...result.fields.map(field => [field.id, field as Field] as const)]),
        views: new Map([...existing.views, ...result.views.map(view => [view.id, view] as const)]) })
      if (error) throw new RowWriteError('invalid', error)
      const ownershipError = await moduleOwnershipError(result.app, context.tx)
      if (ownershipError) throw new RowWriteError('invalid', ownershipError)
      const allowed = await previewIncrease({ workspaceId: context.workspaceId, resource: 'tables', amount: result.tables.length, tx: context.tx })
      if (!allowed.ok) throw new RowWriteError('invalid', allowed.error)
      return { ok: true as const, expectedHash: hash(record.draft), sourceHash: result.source ? hash((await context.tx.select({ draft: apps.draft }).from(apps).where(eq(apps.id, result.source)))[0]!.draft) : null,
        already: result.already, resources: result.tables.map(table => table.name), reused: Boolean(result.source), newTables: result.tables.length }
    })
  } catch (error) { return message(error) }
}

export async function connectModuleAction(appId: string, templateId: string, expectedHash: string, sourceAppId?: string, sourceHash?: string | null) {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  try {
    const outcome = await writeRows(auth.member.workspaceId, async context => {
      const [record] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
      if (!record) throw new RowWriteError('missing', 'Приложение не найдено')
      const result = await prepare(context, record, templateId, auth.member.email, sourceAppId)
      if (result.already) return { ok: true as const, already: true }
      if (hash(record.draft) !== expectedHash) throw new RowWriteError('conflict', 'Настройки изменились после проверки. Повторите предварительную проверку.')
      if (result.source) {
        const [source] = await context.tx.select({ draft: apps.draft }).from(apps).where(eq(apps.id, result.source)).for('update')
        if (!source || hash(source.draft) !== sourceHash) throw new RowWriteError('conflict', 'Источник изменился после проверки. Повторите предварительную проверку.')
      }
      const [primary] = await context.tx.select().from(workspaceClientApps).where(eq(workspaceClientApps.workspaceId, context.workspaceId))
      if (primary && primary.appId !== appId) throw new RowWriteError('invalid', 'У бизнеса выбрано другое основное приложение. Сначала явно выберите это приложение основным.')
      const ownershipError = await moduleOwnershipError(result.app, context.tx)
      if (ownershipError) throw new RowWriteError('invalid', ownershipError)
      await assertCanIncreaseUsage({ workspaceId: context.workspaceId, resource: 'tables', amount: result.tables.length, tx: context.tx })
      if (result.tables.length) {
        await context.tx.insert(tables).values(result.tables)
        await context.tx.insert(fields).values(result.fields)
        await context.tx.insert(views).values(result.views)
      }
      const error = checkAppReferences(result.app, await catalog(context))
      if (error) throw new RowWriteError('invalid', error)
      await context.tx.insert(workspaceClientApps).values({ workspaceId: context.workspaceId, appId }).onConflictDoNothing()
      await checkpointBeforeChange(context.tx, record, auth.member.userId)
      await context.tx.update(apps).set({ draft: result.app, updatedAt: new Date() }).where(eq(apps.id, appId))
      await recordConfigVersion(context.tx, record, result.app, 'module', auth.member.userId)
      return { ok: true as const, already: false }
    })
    revalidatePath(`/apps/${appId}`); revalidatePath('/apps')
    return outcome
  } catch (error) { return message(error) }
}

export async function enableModuleAccessAction(appId: string) {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  try {
    await writeRows(auth.member.workspaceId, async context => {
      const [record] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
      if (!record) throw new RowWriteError('missing', 'Приложение не найдено')
      const resources = await catalog(context), scoped = scopeModuleAccess(ownedApp(record), resources.views)
      const error = checkAppReferences(scoped, resources)
      if (error) throw new RowWriteError('invalid', error)
      await checkpointBeforeChange(context.tx, record, auth.member.userId)
      await context.tx.update(apps).set({ draft: scoped, updatedAt: new Date() }).where(eq(apps.id, appId))
      await recordConfigVersion(context.tx, record, scoped, 'access', auth.member.userId)
    })
    revalidatePath(`/apps/${appId}`)
    return { ok: true as const }
  } catch (error) { return message(error) }
}

export async function setModuleIntakeAction(appId: string, moduleId: string, enabled: boolean) {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  try {
    await writeRows(auth.member.workspaceId, async context => {
      const [record] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
      if (!record) throw new RowWriteError('missing', 'Приложение не найдено')
      const app = ownedApp(record), module = app.modules?.find(module => module.id === moduleId)
      if (!module || !['customer', 'booking'].includes(module.source.type)) throw new RowWriteError('invalid', 'Этот раздел не принимает клиентские оформления')
      module.intakeEnabled = enabled
      const error = checkAppReferences(app, await catalog(context))
      if (error) throw new RowWriteError('invalid', error)
      await checkpointBeforeChange(context.tx, record, auth.member.userId)
      await context.tx.update(apps).set({ draft: app, updatedAt: new Date() }).where(eq(apps.id, appId))
      await recordConfigVersion(context.tx, record, app, 'intake', auth.member.userId)
    })
    revalidatePath(`/apps/${appId}`)
    return { ok: true as const }
  } catch (error) { return message(error) }
}

export async function setCommunicationsAction(appId: string, enabled: boolean) {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  if (typeof enabled !== 'boolean') return { ok: false, error: 'Некорректный режим переписки' }
  try {
    await writeRows(auth.member.workspaceId, async context => {
      const [record] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
      if (!record) throw new RowWriteError('missing', 'Приложение не найдено')
      const app = ownedApp(record)
      const hasClientDetail = app.screens.some(screen => screen.type === 'detail' && screen.access.roles.includes('client'))
      const hasResource = app.screens.some(screen => screen.type === 'detail' && conversationResource(app, screen.tableId))
      if (!hasClientDetail) throw new RowWriteError('invalid', 'Для переписки нужна клиентская карточка записи: экран подробностей, открытый роли «Клиент».')
      if (!hasResource) throw new RowWriteError('invalid', 'Для переписки нужно поле почты клиента в сценарии (запись, заказ или ремонт) и кабинет с карточкой этого обращения.')
      app.communications = { enabled }
      await checkpointBeforeChange(context.tx, record, auth.member.userId)
      await context.tx.update(apps).set({ draft: app, updatedAt: new Date() }).where(eq(apps.id, appId))
      await recordConfigVersion(context.tx, record, app, 'module', auth.member.userId)
    })
    revalidatePath(`/apps/${appId}`)
    return { ok: true as const }
  } catch (error) { return message(error) }
}

export async function setPrimaryClientAppAction(appId: string) {
  const auth = await authorizeApp(appId)
  if (!auth.ok) return auth
  try {
    await writeRows(auth.member.workspaceId, async context => {
      const [record] = await context.tx.select().from(apps).where(and(eq(apps.id, appId), eq(apps.workspaceId, context.workspaceId))).for('update')
      if (!record) throw new RowWriteError('invalid', 'Выберите приложение с клиентским сценарием')
      // Builder v2 drafts (shop/CRM) are not legacy client cabinets.
      const parsed = appSchema.safeParse(record.draft)
      if (!parsed.success) throw new RowWriteError('invalid', 'Выберите приложение с клиентским сценарием')
      const candidate = { ...parsed.data, id: record.id, workspaceId: record.workspaceId, slug: record.slug }
      if (!(candidate.booking || candidate.customer) || !candidate.screens.some(screen => screen.access.public || screen.access.roles.includes('client'))) throw new RowWriteError('invalid', 'Выберите приложение с клиентским сценарием')
      await context.tx.insert(workspaceClientApps).values({ workspaceId: context.workspaceId, appId })
        .onConflictDoUpdate({ target: workspaceClientApps.workspaceId, set: { appId } })
    })
    revalidatePath(`/apps/${appId}`); revalidatePath('/apps')
    return { ok: true as const }
  } catch (error) { return message(error) }
}
