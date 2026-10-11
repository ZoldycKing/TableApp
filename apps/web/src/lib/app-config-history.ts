import { createHash } from 'node:crypto'
import { appConfigVersions, apps } from '@tableapp/db'
import { appSchema, newId, type App } from '@tableapp/schema'
import { and, desc, eq } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import { appModules, checkModuleModelTransition, moduleContract } from './app-modules'

export type VersionKind = 'baseline' | 'published' | 'before-change' | 'module' | 'access' | 'intake' | 'restored'

// JSONB rearranges object keys. A fingerprint must survive a database round trip.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
export const configFingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')
export const configStateFingerprint = (record: Pick<typeof apps.$inferSelect, 'draft' | 'published' | 'slug'>) => configFingerprint({ draft: record.draft, published: record.published, slug: record.slug })

/** Caller holds the workspace write lock and the app row lock. Consecutive identical checkpoints coalesce. */
export async function recordConfigVersion(tx: Transaction, record: Pick<typeof apps.$inferSelect, 'id' | 'workspaceId'>, definition: unknown, kind: VersionKind, authorId: string | null) {
  const parsed = appSchema.safeParse(definition)
  if (!parsed.success) return
  const safe = { ...parsed.data, id: record.id, workspaceId: record.workspaceId }
  const fingerprint = configFingerprint(safe)
  const [last] = await tx.select().from(appConfigVersions).where(and(eq(appConfigVersions.appId, record.id), eq(appConfigVersions.workspaceId, record.workspaceId))).orderBy(desc(appConfigVersions.number)).limit(1)
  if (last?.fingerprint === fingerprint && (kind !== 'published' || last.kind === kind)) return
  await tx.insert(appConfigVersions).values({ id: newId('appConfigVersion'), workspaceId: record.workspaceId, appId: record.id, number: (last?.number ?? 0) + 1, definition: safe, fingerprint, kind, authorId })
}

export async function checkpointBeforeChange(tx: Transaction, record: typeof apps.$inferSelect, authorId: string | null) {
  const [existing] = await tx.select({ id: appConfigVersions.id }).from(appConfigVersions).where(and(eq(appConfigVersions.appId, record.id), eq(appConfigVersions.workspaceId, record.workspaceId))).limit(1)
  if (!existing && record.published) await recordConfigVersion(tx, record, record.published, 'baseline', authorId)
  await recordConfigVersion(tx, record, record.draft, existing ? 'before-change' : 'baseline', authorId)
}

/** Restore presentation/workflow settings, keep the current identity, URL and access assignments. */
export function restoredConfig(record: Pick<typeof apps.$inferSelect, 'id' | 'workspaceId' | 'slug' | 'draft' | 'published'>, snapshot: unknown): { ok: true; app: App } | { ok: false; error: string } {
  const previous = appSchema.safeParse(snapshot), current = appSchema.safeParse(record.draft)
  if (!previous.success || !current.success) return { ok: false, error: 'Эта версия содержит несовместимые настройки.' }
  const candidate = { ...previous.data, id: record.id, workspaceId: record.workspaceId, slug: record.slug,
    publishedAt: current.data.publishedAt,
    accessMode: current.data.accessMode, allowlist: current.data.allowlist, roles: current.data.roles,
    rowAccessRules: current.data.rowAccessRules, moduleAccess: current.data.moduleAccess }
  const modelError = checkModuleModelTransition(candidate, record.draft, record.published)
  if (modelError) return { ok: false, error: `Восстановление недоступно: ${modelError}. Выберите версию после подключения текущих возможностей.` }
  for (const module of appModules(current.data)) {
    const restored = appModules(candidate).find(previous => previous.id === module.id)
    if (!restored || configFingerprint(moduleContract(current.data, module)?.tables) !== configFingerprint(moduleContract(candidate, restored)?.tables)) return { ok: false, error: 'Восстановление недоступно: в этой версии используются другие таблицы рабочего сценария. Текущие записи должны оставаться в своём кабинете.' }
  }
  return { ok: true, app: candidate }
}

export function configChanges(before: unknown, after: App): string[] {
  const current = appSchema.parse(before), changes: string[] = []
  if (current.name !== after.name) changes.push(`Название: «${current.name}» → «${after.name}»`)
  if (configFingerprint(current.theme) !== configFingerprint(after.theme)) changes.push('Оформление приложения')
  const next = new Map(after.screens.map(screen => [screen.id, screen]))
  for (const screen of current.screens) {
    const restored = next.get(screen.id)
    if (!restored) changes.push(`Экран «${screen.name}» будет убран из интерфейса; его данные сохранятся`)
    else if (configFingerprint(screen) !== configFingerprint(restored)) {
      changes.push(`Настройки экрана «${screen.name}»`)
      if (configFingerprint(screen.access) !== configFingerprint(restored.access)) changes.push(`Видимость экрана «${screen.name}» для посетителей и ролей`)
    }
  }
  for (const screen of after.screens) if (!current.screens.some(previous => previous.id === screen.id)) changes.push(`Будет добавлен экран «${screen.name}»`)
  for (const [key, label] of [['booking', 'Правила записи на услуги'], ['customer', 'Правила клиентских обращений и заказов'], ['customerSections', 'Дополнительные разделы клиентского кабинета'], ['inventory', 'Правила складских операций'], ['production', 'Правила производства'], ['modules', 'Настройки возможностей и приёма оформлений'], ['homeScreenId', 'Начальный экран'], ['catalogScreenIds', 'Общий каталог']] as const) {
    if (configFingerprint(current[key]) !== configFingerprint(after[key])) changes.push(label)
  }
  return changes
}
