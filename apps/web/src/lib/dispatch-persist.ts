import { authorizeAppV2Write, type AppV2, type AppV2Actor, type AppV2Json, type AppV2Record } from '@tableapp/schema/app-v2'
import { parseChecklist, recurrenceOccurrences, serializeChecklist, seriesEditIds, type RepeatRule } from './dispatch-stage2'

export type DispatchApp = NonNullable<AppV2['dispatch']>

/** Fields a technician or dispatcher may change while a visit is in progress. */
export function progressValues(job: DispatchApp['job'], input: {
  status?: string
  onSiteAt?: string | null
  doneAt?: string | null
  actualMinutes?: number | null
  checklist?: string | null
}): Record<string, AppV2Json> {
  const values: Record<string, AppV2Json> = {}
  const put = (key: string | undefined, value: string | number | null | undefined) => {
    if (!key || value == null || value === undefined) return
    values[key] = value
  }
  put(job.status, input.status)
  put(job.onSiteAt, input.onSiteAt)
  put(job.doneAt, input.doneAt)
  put(job.actualMinutes, input.actualMinutes)
  put(job.checklist, input.checklist)
  return values
}

export function guardDispatchUpdate(app: AppV2, actor: AppV2Actor, row: AppV2Record, values: Record<string, AppV2Json>) {
  return authorizeAppV2Write(app, actor, { operation: 'update', row, values })
}

export function guardDispatchCreate(app: AppV2, actor: AppV2Actor, tableId: string, values: Record<string, AppV2Json>) {
  return authorizeAppV2Write(app, actor, { operation: 'create', tableId, values })
}

export function seriesMutations(input: {
  dispatch: DispatchApp
  seed: AppV2Record
  rule: RepeatRule
  until: string | null
  count: number | null
  repeatChoiceId: string
  seriesId: string
  scope: 'one' | 'series'
  siblings: { id: string; seriesId: string; when: unknown; status: string }[]
}): { updates: { id: string; values: Record<string, AppV2Json> }[]; creates: Record<string, AppV2Json>[] } {
  const job = input.dispatch.job
  const dates = recurrenceOccurrences({ start: String(input.seed.values[job.when] ?? ''), rule: input.rule, until: input.until, count: input.count })
  const patch: Record<string, AppV2Json> = { [job.repeat!]: input.repeatChoiceId, [job.seriesId!]: input.seriesId }
  if (job.repeatUntil) patch[job.repeatUntil] = input.until
  if (job.repeatCount && input.count != null) patch[job.repeatCount] = input.count
  const existingSeries = String(input.seed.values[job.seriesId!] ?? '')
  const targets = existingSeries ? seriesEditIds(input.siblings, input.seed.id, input.scope) : [input.seed.id]
  const updates = targets.map(id => ({ id, values: patch }))
  if (existingSeries || input.scope === 'one') return { updates, creates: [] }
  const checklist = job.checklist ? serializeChecklist(parseChecklist(input.seed.values[job.checklist]).map(item => ({ ...item, done: false }))) : ''
  const copyKeys = [job.what, job.client, job.site, job.type, job.priority, job.master, job.masterEmail, job.technician, job.minutes, job.price, job.paid, job.comment, job.works, job.materials]
  const creates = dates.slice(1).map(when => {
    const values: Record<string, AppV2Json> = { ...patch, [job.when]: when, [job.date]: when, [job.status]: input.dispatch.statuses.assigned }
    for (const key of copyKeys) if (key && input.seed.values[key] !== undefined) values[key] = input.seed.values[key]
    if (job.checklist) values[job.checklist] = checklist
    if (job.report) values[job.report] = ''
    return values
  })
  return { updates, creates }
}
