import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const envFile = resolve(import.meta.dirname, '../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const { migrateSettings } = await import('../src/lib/settings-migration')
const { sql } = await import('@tableapp/db')
try {
  const run = process.argv.includes('--run')
  const arg = process.argv.find((value) => value.startsWith('--workspace='))
  const workspaceId = arg?.slice('--workspace='.length)
  if (arg && !workspaceId) throw new Error('Specify a workspace ID')
  console.log(JSON.stringify({ mode: run ? 'migrate' : 'preview', ...await migrateSettings({ run, workspaceId }) }))
} finally { await sql.end() }
