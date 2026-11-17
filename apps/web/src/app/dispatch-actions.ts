'use server'
import { rows } from '@tableapp/db'
import { newId } from '@tableapp/schema'
import type { AppV2Json, AppV2Record } from '@tableapp/schema/app-v2'
import { and, eq, isNull } from 'drizzle-orm'
import { publishedV2Context, publishedV2Definition } from '@/lib/builder-v2-published'
import { guardDispatchCreate, guardDispatchUpdate, progressValues, seriesMutations } from '@/lib/dispatch-persist'
import { repeatName } from '@/lib/dispatch-stage2'
import { RowWriteError, createRow, mutationFields, updateRow, writeRows } from '@/lib/row-mutations'

type ProgressRequest = { kind: 'progress'; revision: string; screenId: string; recordId: string; status?: string; onSiteAt?: string | null; doneAt?: string | null; actualMinutes?: number | null; checklist?: string | null }
type SeriesRequest = { kind: 'series'; revision: string; screenId: string; recordId: string; rule: 'weekly' | 'biweekly' | 'monthly' | 'quarterly'; until?: string | null; count?: number | null; scope: 'one' | 'series' }

function readRequest(input: unknown): ProgressRequest | SeriesRequest | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  const common = typeof value.revision === 'string' && value.revision.length >= 8 && typeof value.screenId === 'string' && typeof value.recordId === 'string'
  if (!common) return null
  if (value.kind === 'progress') {
    const minutes = value.actualMinutes
    if (minutes != null && (typeof minutes !== 'number' || minutes < 0 || minutes > 24 * 60)) return null
    if (value.checklist != null && typeof value.checklist !== 'string') return null
    return value as ProgressRequest
  }
  if (value.kind === 'series' && (value.rule === 'weekly' || value.rule === 'biweekly' || value.rule === 'monthly' || value.rule === 'quarterly') && (value.scope === 'one' || value.scope === 'series')) {
    return value as SeriesRequest
  }
  return null
}

export async function savePublishedDispatchAction(slug: string, input: unknown): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = readRequest(input)
  if (!parsed) return { ok: false, error: 'Проверьте данные заявки.' }
  try {
    const definition = await publishedV2Definition(slug)
    if (!definition) throw new RowWriteError('missing', 'Приложение недоступно')
    return await writeRows(definition.app.workspaceId, async context => {
      const { app, actor, revision } = await publishedV2Context(slug, context.tx, true)
      if (revision !== parsed.revision) throw new RowWriteError('conflict', 'Приложение обновлено. Обновите страницу.')
      const dispatch = app.dispatch
      if (!dispatch) throw new RowWriteError('denied', 'Это не приложение заявок.')
      if (!actor.authenticated || !actor.id) throw new RowWriteError('denied', 'Для сохранения нужно войти')
      const [stored] = await context.tx.select().from(rows).where(and(eq(rows.id, parsed.recordId), eq(rows.tableId, dispatch.jobsTableId), isNull(rows.deletedAt))).limit(1)
      if (!stored) throw new RowWriteError('missing', 'Заявка не найдена.')
      const row: AppV2Record = { id: stored.id, tableId: stored.tableId, values: stored.data as Record<string, AppV2Json> }
      const actorRef = { id: actor.id, kind: 'app_user' as const }
      if (parsed.kind === 'progress') {
        const values = progressValues(dispatch.job, parsed)
        const decision = guardDispatchUpdate(app, actor, row, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, dispatch.jobsTableId, row.id, values, actorRef)
        return { ok: true as const, message: 'Заявка сохранена.' }
      }
      if (!actor.roleIds.includes('owner')) throw new RowWriteError('denied', 'Серию меняет диспетчер.')
      const fields = await mutationFields(context, dispatch.jobsTableId)
      const repeatField = fields.find(field => field.id === dispatch.job.repeat)
      const statusField = fields.find(field => field.id === dispatch.job.status)
      const choiceId = repeatField?.type === 'single_select' ? repeatField.options.choices.find(choice => choice.name === repeatName(parsed.rule))?.id : undefined
      if (!choiceId) throw new RowWriteError('invalid', 'Не найден вариант повтора.')
      const statusName = (value: unknown) => statusField?.type === 'single_select' && typeof value === 'string' ? statusField.options.choices.find(choice => choice.id === value)?.name ?? '' : ''
      const jobs = await context.tx.select().from(rows).where(and(eq(rows.tableId, dispatch.jobsTableId), isNull(rows.deletedAt)))
      const siblings = jobs.map(item => ({
        id: item.id,
        seriesId: String((item.data as Record<string, unknown>)[dispatch.job.seriesId!] ?? ''),
        when: (item.data as Record<string, unknown>)[dispatch.job.when],
        status: statusName((item.data as Record<string, unknown>)[dispatch.job.status]),
      }))
      const plan = seriesMutations({
        dispatch, seed: row, rule: parsed.rule, until: parsed.until ?? null, count: parsed.count ?? null,
        repeatChoiceId: choiceId, seriesId: String(row.values[dispatch.job.seriesId!] || `series_${newId('row').slice(-8)}`),
        scope: parsed.scope, siblings,
      })
      for (const update of plan.updates) {
        const current = jobs.find(item => item.id === update.id)
        if (!current) continue
        const target: AppV2Record = { id: current.id, tableId: current.tableId, values: current.data as Record<string, AppV2Json> }
        const decision = guardDispatchUpdate(app, actor, target, update.values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await updateRow(context, dispatch.jobsTableId, update.id, update.values, actorRef)
      }
      for (const values of plan.creates) {
        const decision = guardDispatchCreate(app, actor, dispatch.jobsTableId, values)
        if (!decision.ok) throw new RowWriteError('denied', decision.error)
        await createRow(context, dispatch.jobsTableId, values, actorRef, { origin: 'manual' })
      }
      return { ok: true as const, message: plan.creates.length ? 'Серия сохранена.' : 'Заявка сохранена.' }
    })
  } catch (error) {
    return { ok: false, error: error instanceof RowWriteError ? error.message : 'Не удалось сохранить заявку.' }
  }
}

