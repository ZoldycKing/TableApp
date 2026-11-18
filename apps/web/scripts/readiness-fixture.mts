import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Db } from '@tableapp/db'
const root = resolve(import.meta.dirname, '../../..')
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'))
const { db: database, sql, users, workspaces, workspaceMembers, tables, fields, rows, views, sessions, authTokens, authEvents, workspaceUsage } = await import('@tableapp/db')
const db: Db = database
const { defaultViewConfig, newId } = await import('@tableapp/schema')
const { eq } = await import('drizzle-orm')
const { hashToken } = await import('../src/lib/auth')

export async function createReadinessFixture(count = 600) {
  const ids = { user: newId('user'), workspace: newId('workspace'), table: newId('table'),
    text: newId('field'), date: newId('field'), system: newId('field'), view: newId('view') }
  const email = `readiness-${ids.user}@example.invalid`
  const session = randomBytes(32).toString('base64url'), token = randomBytes(32).toString('base64url')
  const recordIds = Array.from({ length: count }, () => newId('row'))
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: ids.user, email, name: 'Проверка Scatta' })
    await tx.insert(workspaces).values({ id: ids.workspace, ownerId: ids.user, name: 'Проверка готовности', slug: `readiness-${ids.workspace}` })
    await tx.insert(workspaceMembers).values({ workspaceId: ids.workspace, userId: ids.user, role: 'owner', acceptedAt: new Date() })
    await tx.insert(sessions).values({ id: session, userId: ids.user, expiresAt: new Date(Date.now() + 1800000) })
    await tx.insert(authTokens).values({ id: newId('token'), email, tokenHash: hashToken(token), purpose: 'workspace_login', intent: 'owner',
      expiresAt: new Date(Date.now() + 1800000), delivered: true })
    await tx.insert(tables).values({ id: ids.table, workspaceId: ids.workspace, name: 'Проверочные записи', position: 'a1', primaryFieldId: ids.text })
    await tx.insert(fields).values([
      { id: ids.text, tableId: ids.table, name: 'Название', type: 'text', position: 'a1' },
      { id: ids.date, tableId: ids.table, name: 'Дата', type: 'date', position: 'a2' },
      { id: ids.system, tableId: ids.table, name: 'ID записи', type: 'row_id', position: 'a3' },
    ])
    await tx.insert(views).values({ id: ids.view, tableId: ids.table, name: 'Все записи', type: 'grid', position: 'a1', config: defaultViewConfig('grid', newId('filter')) })
    await tx.insert(rows).values(recordIds.map((id, index) => ({ id, tableId: ids.table, position: `a${String(index).padStart(4, '0')}`,
      data: { [ids.text]: `Проверочная запись ${index + 1}`, [ids.date]: '2026-03-13T21:00:00.000Z' }, createdBy: ids.user, updatedBy: ids.user })))
  })
  return { ids, email, session, token, recordIds }
}
export type ReadinessFixture = Awaited<ReturnType<typeof createReadinessFixture>>
export async function removeReadinessFixture(fixture: ReadinessFixture) {
  await db.transaction(async (tx) => {
    await tx.delete(workspaces).where(eq(workspaces.id, fixture.ids.workspace))
    await tx.delete(authTokens).where(eq(authTokens.email, fixture.email))
    await tx.delete(authEvents).where(eq(authEvents.email, fixture.email))
    await tx.delete(users).where(eq(users.id, fixture.ids.user))
  })
}
export { db, sql, rows, workspaceUsage }

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const file = resolve(root, 'backups/readiness-browser-fixture.json')
  try {
    if (process.argv[2] === 'create') {
      if (existsSync(file)) throw new Error('Browser fixture already exists; clean it up first')
      const fixture = await createReadinessFixture(8)
      writeFileSync(file, JSON.stringify(fixture), { flag: 'wx' })
      console.log(JSON.stringify({ login: `http://127.0.0.1:3101/auth?token=${fixture.token}`, table: fixture.ids.table, workspace: fixture.ids.workspace }))
    } else if (process.argv[2] === 'cleanup') {
      const fixture = JSON.parse(readFileSync(file, 'utf8')) as ReadinessFixture
      await removeReadinessFixture(fixture); unlinkSync(file)
      console.log('Browser fixture removed')
    } else throw new Error('Use create or cleanup')
  } finally { await sql.end() }
}
