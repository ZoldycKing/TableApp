import { strict as assert } from 'node:assert'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

const root = resolve(import.meta.dirname, '../../..')
if (!process.env.DATABASE_URL && existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'))
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const sourceUrl = new URL(process.env.DATABASE_URL)
const source = postgres(sourceUrl.toString(), { max: 1, onnotice: () => {} })
const adminUrl = new URL(sourceUrl); adminUrl.pathname = '/postgres'
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} })
const targetName = `tableapp_verify_${Date.now()}_${randomBytes(4).toString('hex')}`
const targetUrl = new URL(sourceUrl); targetUrl.pathname = `/${targetName}`
const target = postgres(targetUrl.toString(), { max: 1, onnotice: () => {} })
const { create, restore } = await import('../../../scripts/backup.mts')
let created = false

async function inventory(connection: postgres.Sql | postgres.TransactionSql) {
  const tables = await connection<{ schema: string; name: string }[]>`
    select schemaname as schema, tablename as name from pg_tables
    where schemaname not in ('pg_catalog', 'information_schema') and schemaname not like 'pg_toast%'
    order by schemaname, tablename`
  const result = []
  for (const table of tables) {
    // Hash every row, then sort hashes: order and physical row layout do not matter.
    const [value] = await connection`
      select count(*)::text as count,
        md5(coalesce(string_agg(value, '' order by value), '')) as digest
      from (select md5(to_jsonb(t)::text) as value from ${connection(table.schema)}.${connection(table.name)} t) hashed`
    result.push({ ...table, count: value!.count, digest: value!.digest })
  }
  const constraints = await connection`
    select n.nspname as schema, c.relname as name, con.conname, con.contype, con.convalidated,
      pg_get_constraintdef(con.oid) as definition
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
    order by n.nspname, c.relname, con.conname`
  const indexes = await connection`
    select schemaname, tablename, indexname, indexdef from pg_indexes
    where schemaname not in ('pg_catalog', 'information_schema')
    order by schemaname, tablename, indexname`
  const triggers = await connection`
    select n.nspname as schema, c.relname as name, t.tgname, pg_get_triggerdef(t.oid) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and n.nspname not in ('pg_catalog', 'information_schema')
    order by n.nspname, c.relname, t.tgname`
  const functions = await connection`
    select n.nspname as schema, p.proname as name, pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema') and p.prokind='f'
    order by n.nspname, p.proname, p.oid::regprocedure::text`
  return { tables: result, constraints: [...constraints], indexes: [...indexes], triggers: [...triggers], functions: [...functions] }
}

try {
  // pg_dump and the comparison read exactly the same committed snapshot.
  await source.begin('isolation level repeatable read read only', async (tx) => {
    const [snapshot] = await tx`select pg_export_snapshot() as id`
    const before = await inventory(tx)
    const file = await create(snapshot!.id)
    await restore(file, targetName, () => { created = true })
    const after = await inventory(target)
    assert.deepEqual(after, before, 'Restored records, constraints or indexes differ')
    // Guard regression: a second restore must refuse and preserve the first copy.
    await assert.rejects(() => restore(file, targetName))
    assert.deepEqual(await inventory(target), after, 'Existing restore target was changed')
    await assert.rejects(() => restore(file, decodeURIComponent(sourceUrl.pathname.slice(1))))
    console.log(JSON.stringify({ status: 'passed', file, tables: before.tables.length,
      rows: before.tables.reduce((total, table) => total + Number(table.count), 0),
      constraints: before.constraints.length, indexes: before.indexes.length, triggers: before.triggers.length, functions: before.functions.length,
      checked: ['snapshot', 'all row digests', 'constraints', 'indexes', 'triggers', 'functions', 'existing target refused', 'source refused'] }))
  })
} finally {
  await target.end()
  // Only the database created by this invocation may be removed.
  if (created) await admin.unsafe(`drop database "${targetName}"`)
  await source.end(); await admin.end()
}
