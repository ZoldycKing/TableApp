import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const envFile = resolve(import.meta.dirname, '../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)
const { cleanupFiles } = await import('../src/lib/file-cleanup')
const { sql } = await import('@tableapp/db')
try {
  const run = process.argv.includes('--run')
  const workspaceArg = process.argv.find((arg) => arg.startsWith('--workspace='))
  const workspaceId = workspaceArg?.slice('--workspace='.length)
  if (workspaceArg && !workspaceId) throw new Error('Specify a workspace ID')
  const result = await cleanupFiles({ run, workspaceId })
  console.log(JSON.stringify({ mode: run ? 'cleanup' : 'preview', ...result }))
  if (result.failed) process.exitCode = 1
} finally { await sql.end() }
