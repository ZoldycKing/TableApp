import { strict as assert } from 'node:assert'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import postgres from 'postgres'
const root = resolve(import.meta.dirname, '../../..')
if (!process.env.DATABASE_URL && existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'))
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const source = new URL(process.env.DATABASE_URL)
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname), 'Migration check must use a local server')
const adminUrl = new URL(source); adminUrl.pathname = '/postgres'
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} })
const name = `tableapp_migrations_${Date.now()}_${randomBytes(4).toString('hex')}`
const targetUrl = new URL(source); targetUrl.pathname = `/${name}`
const target = postgres(targetUrl.toString(), { max: 1, onnotice: () => {} })
let created = false
async function migrate() {
  await new Promise<void>((done, fail) => {
    const child = spawn(process.execPath, [resolve(root, 'packages/db/node_modules/drizzle-kit/bin.cjs'), 'migrate'], {
      cwd: resolve(root, 'packages/db'), env: { ...process.env, DATABASE_URL: targetUrl.toString() }, stdio: 'pipe',
    })
    child.stdout.resume(); child.stderr.resume()
    child.on('error', fail)
    child.on('close', (code) => code === 0 ? done() : fail(new Error(`Migration command failed (${code})`)))
  })
}
try {
  await admin.unsafe(`create database "${name}"`); created = true
  await migrate()
  const journal = JSON.parse(readFileSync(resolve(root, 'packages/db/migrations/meta/_journal.json'), 'utf8'))
  const applied = await target`select hash, created_at from drizzle.__drizzle_migrations order by created_at`
  assert.equal(applied.length, journal.entries.length)
  assert.ok(await target`select sync_revision from public.rows limit 0`)
  assert.ok(await target`select state from public.attachments limit 0`)
  assert.ok(await target`select business_profile from public.workspaces limit 0`)
  assert.ok(await target`select workspace_id, app_id from public.workspace_client_apps limit 0`)
  assert.ok(await target`select workspace_id, email, name, phone from public.business_customers limit 0`)
  assert.ok(await target`select workspace_id, customer_id, app_id from public.business_customer_apps limit 0`)
  const tableCount = await target`select count(*)::int as value from pg_tables where schemaname = 'public'`
  await migrate()
  assert.deepEqual([...(await target`select hash, created_at from drizzle.__drizzle_migrations order by created_at`)], [...applied])
  console.log(JSON.stringify({ status: 'passed', migrations: applied.length, tables: tableCount[0]!.value,
    checked: ['empty database', 'sync revision', 'attachment state', 'business profile', 'business client app', 'business customer profiles', 'scoped customer app links', 'second run unchanged'] }))
} finally {
  await target.end()
  if (created) await admin.unsafe(`drop database "${name}"`)
  await admin.end()
}
