import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const envFile = resolve(import.meta.dirname, '../../../.env')
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile)

const { sql } = await import('@tableapp/db')
const { tickProkatHoldCancellations } = await import('../src/lib/prokat-hold-worker')
const once = process.argv.includes('--once')
const stop = new AbortController()
process.once('SIGINT', () => stop.abort())
process.once('SIGTERM', () => stop.abort())

if (!once) console.log('Служба автоотмены непрокатанных броней запущена.')
try {
  do {
    try {
      const result = await tickProkatHoldCancellations()
      if (once || Object.values(result).some(Boolean)) console.log(JSON.stringify(result))
    } catch (error) {
      if (once) throw error
      console.error('Не удалось обработать автоотмену броней:', error instanceof Error ? error.name : 'Unknown error')
    }
    if (once || stop.signal.aborted) break
    await delay(60_000, undefined, { signal: stop.signal }).catch(() => {})
  } while (!stop.signal.aborted)
} finally {
  await sql.end()
}
