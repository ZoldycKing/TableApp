import { createHash } from 'node:crypto'
import { apps, db, importRuns, tables as dbTables } from '@tableapp/db'
import { readAppDefinition, validateAppV2Definition } from '@tableapp/schema/app-definition'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Transaction } from './db-transaction'
import type { Member } from './session'
import { lockAppSlugs, uniqueSlug } from './app-slug'
import { loadBuilderV2Catalog, newBuilderV2App } from './builder-v2'
import { configureBuilderV2Read, syncBuilderV2CardAccess } from './builder-v2-read-access'
import { buildBuilderV2Starter } from './builder-v2-starter'
import { writeRows } from './row-mutations'

type ImportAuthor = Pick<Member, 'workspaceId' | 'userId' | 'email'>
export const validBuilderImportRun = (runId: unknown): runId is string => typeof runId === 'string' && /^run_[a-z0-9]{12,32}$/.test(runId)

/** The durable import receipt, never the table IDs supplied by the browser, is the source of truth. */
export async function importedBuilderTables(runId: string, author: ImportAuthor, connection: Transaction | typeof db = db) {
  if (!validBuilderImportRun(runId)) return []
  const receipts = await connection.select().from(importRuns).where(and(eq(importRuns.workspaceId, author.workspaceId), eq(importRuns.actorId, author.userId), eq(importRuns.runId, runId))).orderBy(asc(importRuns.createdAt), asc(importRuns.id))
  if (!receipts.some(receipt => receipt.mode === 'create') || receipts.some(receipt => !receipt.tableId) || receipts.length > 20) return []
  const ids = [...new Set(receipts.map(receipt => receipt.tableId!))]
  if (!ids.length) return []
  const own = await connection.select({ id: dbTables.id, name: dbTables.name }).from(dbTables).where(and(eq(dbTables.workspaceId, author.workspaceId), inArray(dbTables.id, ids)))
  if (own.length !== ids.length) return []
  return ids.map(id => own.find(table => table.id === id)!)
}

export async function prepareImportedBuilderApp(runId: string, primaryTableId: string | undefined, author: ImportAuthor): Promise<{ ok: true; appId: string } | { ok: false; error: string }> {
  if (!validBuilderImportRun(runId) || primaryTableId !== undefined && (typeof primaryTableId !== 'string' || primaryTableId.length > 200)) return { ok: false, error: 'Не удалось найти результат загрузки' }
  // One app per author and import run. This key survives retries, remounts and reloads.
  const appId = `app_${createHash('sha256').update(JSON.stringify([author.workspaceId, author.userId, runId])).digest('hex').slice(0, 24)}`
  return writeRows(author.workspaceId, async ({ tx }) => {
    await lockAppSlugs(tx)
    const [existing] = await tx.select().from(apps).where(eq(apps.id, appId))
    if (existing) {
      const read = readAppDefinition(existing.draft)
      return existing.workspaceId === author.workspaceId && read.ok && read.formatVersion === 2 && read.app.id === existing.id && read.app.workspaceId === author.workspaceId
        ? { ok: true as const, appId: existing.id }
        : { ok: false as const, error: 'Не удалось открыть черновик приложения' }
    }
    const imported = await importedBuilderTables(runId, author, tx)
    if (!imported.length) return { ok: false as const, error: 'Нет новых таблиц из этой загрузки. Откройте таблицы пространства или загрузите файл ещё раз.' }
    const main = primaryTableId ?? imported[0]!.id
    if (!imported.some(table => table.id === main)) return { ok: false as const, error: 'Первый раздел не относится к этой загрузке' }
    // Keep deletion and schema changes from invalidating the starter during creation.
    await tx.select({ id: dbTables.id }).from(dbTables).where(and(eq(dbTables.workspaceId, author.workspaceId), inArray(dbTables.id, imported.map(table => table.id)))).for('share')
    const metadata = await loadBuilderV2Catalog(author.workspaceId, tx)
    const sources = imported.flatMap(table => metadata.tables.find(source => source.id === table.id) ?? [])
    if (sources.length !== imported.length || sources.some(table => !table.fields.length)) return { ok: false as const, error: 'В одной из загруженных таблиц нет колонок. Добавьте их и повторите подготовку.' }
    const slug = await uniqueSlug(appId.replace('_', '-'), undefined, tx)
    const starter = buildBuilderV2Starter(newBuilderV2App({ id: appId, workspaceId: author.workspaceId, name: imported.length === 1 ? imported[0]!.name : 'Моё приложение', slug, email: author.email }), sources, main)
    // The draft is private and only the importing author has the owner role.
    const app = sources.reduce((draft, table) => configureBuilderV2Read(draft, table.id, { kind: 'roles', roleIds: ['owner'] }, table.fields.map(field => field.id), { kind: 'all' }), syncBuilderV2CardAccess(starter))
    const valid = validateAppV2Definition(app, metadata.catalog)
    if (!valid.ok) return { ok: false as const, error: valid.issues[0]!.message }
    await tx.insert(apps).values({ id: app.id, workspaceId: author.workspaceId, name: app.name, slug, theme: app.theme, homeScreenId: app.homeScreenId, accessMode: 'allowlist', draft: app, published: null })
    return { ok: true as const, appId: app.id }
  })
}
