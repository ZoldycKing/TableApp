import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const envFile = resolve(import.meta.dirname, '../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const { sql } = await import('@tableapp/db')
const { tickStockAutomations } = await import('../src/lib/stock-automation-worker')
const once = process.argv.includes('--once')
const stop = new AbortController()
process.once('SIGINT', () => stop.abort())
process.once('SIGTERM', () => stop.abort())

if (!once) console.log('Служба проверок остатков запущена.')
try {
  do {
    try {
      const result = await tickStockAutomations()
      if (once || Object.values(result).some(Boolean)) console.log(JSON.stringify(result))
    } catch (error) {
      if (once) throw error
      console.error('Не удалось обработать очередь проверок:', error instanceof Error ? error.name : 'Unknown error')
    }
    if (once || stop.signal.aborted) break
    await delay(15_000, undefined, { signal: stop.signal }).catch(() => {})
  } while (!stop.signal.aborted)
} finally {
  await sql.end()
}
