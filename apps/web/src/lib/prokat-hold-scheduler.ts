/**
 * In-process hold auto-cancel loop for normal Next.js boot (dev + next start).
 * Optional separate `pnpm prokat:hold` remains for ops that want an isolated worker.
 */
import { tickProkatHoldCancellations } from './prokat-hold-worker'

const INTERVAL_MS = 60_000
const g = globalThis as typeof globalThis & {
  __tableappProkatHoldScheduler?: { timer?: ReturnType<typeof setInterval>; startedAt?: number }
}

export function startProkatHoldScheduler() {
  if (process.env.PROKAT_HOLD_SCHEDULER === '0') return
  if (!process.env.DATABASE_URL) return
  const state = g.__tableappProkatHoldScheduler ?? (g.__tableappProkatHoldScheduler = {})
  if (state.timer) return

  const run = () => {
    void tickProkatHoldCancellations().catch(error => {
      console.error(
        'prokat hold scheduler tick failed',
        error instanceof Error ? error.name : 'Unknown error',
      )
    })
  }

  // First pass shortly after boot so statuses catch up without waiting a full minute.
  setTimeout(run, 2_000)
  state.timer = setInterval(run, INTERVAL_MS)
  state.startedAt = Date.now()
  if (process.env.NODE_ENV !== 'test') {
    console.log('Служба автоотмены непрокатанных броней подключена к процессу приложения.')
  }
}

export function isProkatHoldSchedulerRunning() {
  return Boolean(g.__tableappProkatHoldScheduler?.timer)
}
