import { db, stockAutomations, stockAutomationRuns } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import { and, asc, eq, lte } from 'drizzle-orm'
import { isPlanLimitError } from './limits'
import { RowWriteError, writeRows } from './row-mutations'
import { executeStockCheck, stockAutomationScope, stockRunScope, type StockAutomationRun } from './stock-automation'
import { nextStockCheck } from './stock-automation-time'

const batch = 12

/** Enqueue one due run per schedule. A restart advances past missed days in one pass. */
async function enqueueDue(now: Date) {
  return db.transaction(async tx => {
    const due = await tx.select().from(stockAutomations).where(lte(stockAutomations.nextRunAt, now))
      .orderBy(asc(stockAutomations.nextRunAt), asc(stockAutomations.appId)).limit(batch).for('update', { skipLocked: true })
    for (const schedule of due) {
      const { workspaceId, appId, localTime, timeZone, nextRunAt } = schedule
      await tx.insert(stockAutomationRuns).values({ id: newId('run'), workspaceId, appId, trigger: 'schedule',
        scheduledFor: nextRunAt!, readyAt: now }).onConflictDoNothing()
      await tx.update(stockAutomations).set({ nextRunAt: nextStockCheck(now, localTime, timeZone) }).where(stockAutomationScope(schedule))
    }
    return due.length
  })
}

type Candidate = Pick<StockAutomationRun, 'id' | 'workspaceId' | 'appId'>

async function processRun(candidate: Candidate, now: Date) {
  return writeRows(candidate.workspaceId, async context => {
    const { tx } = context
    const [schedule] = await tx.select().from(stockAutomations).where(stockAutomationScope(candidate)).for('update')
    if (!schedule) return null
    const key = and(stockRunScope(candidate), eq(stockAutomationRuns.id, candidate.id))
    const [run] = await tx.select().from(stockAutomationRuns)
      .where(and(key, eq(stockAutomationRuns.status, 'queued'), lte(stockAutomationRuns.readyAt, now))).for('update')
    if (!run) return null
    const attempts = run.attempts + 1
    try {
      const outcome = await tx.transaction(async inner => {
        const nested = { ...context, tx: inner, fieldCache: new Map(), changed: new Set<string>() }
        const result = await executeStockCheck(nested, schedule)
        return { result, changed: nested.changed }
      })
      await tx.update(stockAutomationRuns).set({ ...outcome.result, attempts, status: 'succeeded', error: null, finishedAt: now }).where(key)
      for (const id of outcome.changed) context.changed.add(id)
      return 'succeeded' as const
    } catch (error) {
      const known = error instanceof RowWriteError || isPlanLimitError(error)
      const retry = !known && attempts < 3
      const message = known ? error.message : 'Проверку остатков прервала ошибка сервера.'
      await tx.update(stockAutomationRuns).set({ attempts, status: retry ? 'queued' : 'failed',
        error: message, ...(retry ? { readyAt: new Date(now.getTime() + attempts * 60_000) } : { finishedAt: now }) }).where(key)
      return retry ? 'retried' as const : 'failed' as const
    }
  })
}

export async function tickStockAutomations(now = new Date()) {
  const enqueued = await enqueueDue(now)
  const pending = await db.select({ id: stockAutomationRuns.id, appId: stockAutomationRuns.appId, workspaceId: stockAutomationRuns.workspaceId })
    .from(stockAutomationRuns).where(and(eq(stockAutomationRuns.status, 'queued'), lte(stockAutomationRuns.readyAt, now)))
    .orderBy(asc(stockAutomationRuns.readyAt), asc(stockAutomationRuns.id)).limit(batch)
  const totals = { enqueued, succeeded: 0, retried: 0, failed: 0 }
  for (const candidate of pending) {
    const result = await processRun(candidate, now).catch(error => {
      // Deletion can win between selecting candidates and opening its workspace transaction.
      console.error('stock automation transaction failed', candidate.id, error instanceof Error ? error.name : '')
      return null
    })
    if (result) totals[result]++
  }
  return totals
}
