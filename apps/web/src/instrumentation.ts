/**
 * Next.js process bootstrap. Starts the Прокат hold auto-cancel loop with the
 * web server so ops do not need a separate `prokat:hold` process for correctness.
 * Lazy catch-up on desk list/timeline still covers a missed tick.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return
  const { startProkatHoldScheduler } = await import('./lib/prokat-hold-scheduler')
  startProkatHoldScheduler()
}
