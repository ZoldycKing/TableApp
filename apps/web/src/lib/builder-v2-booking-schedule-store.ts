import { newId } from '@tableapp/schema'
import { canInvokeAppV2Workflow, projectAppV2Row, type AppV2, type AppV2Actor, type AppV2Json, type AppV2Step } from '@tableapp/schema/app-v2'
import { bookingSchedulePlan, type BookingScheduleScope, type BookingScheduleRequest, type BookingScheduleRead } from './builder-v2-booking-schedule'
import { builderV2SaveFormAction } from './builder-v2-form-action'
import { builderV2FormInputs } from './builder-v2-form-types'
import { inspectPublishedV2Form } from './builder-v2-published-form'
import { publishedV2Context, publishedV2Definition } from './builder-v2-published'
import { builderV2Revision } from './builder-v2-revision'
import { builderV2WorkflowReceipt, commitBuilderV2Workflow } from './builder-v2-workflow-request'
import { loadBookingData } from './booking-store'
import { mutationFields, RowWriteError, writeRows } from './row-mutations'
import type { Transaction } from './db-transaction'
import type { BookingData } from './booking'

export function bookingScheduleForm(app: AppV2, scope: BookingScheduleScope) {
  const config = app.booking, node = app.nodes.find(node => node.id === scope.formId)
  if (!config || ![config.setupScreenId, config.periodScreenId].includes(scope.screenId) || node?.type !== 'form' || node.tableId !== config.tables.schedule || (node.mode === 'edit') !== Boolean(scope.recordId)) throw new RowWriteError('denied', 'Настройка рабочего времени недоступна на этом экране.')
  return node
}
export function bookingScheduleMasters(app: AppV2, actor: AppV2Actor, data: BookingData) {
  const config = app.booking!
  return data.masters.flatMap(row => {
    const values = projectAppV2Row(app, actor, { id: row.id, tableId: config.tables.masters, values: row.data as Record<string, AppV2Json> })
    return typeof values[config.master.name] === 'string' ? [{ id: row.id, name: String(values[config.master.name]) }] : []
  })
}
export async function inspectPublishedBookingSchedule(current: Awaited<ReturnType<typeof publishedV2Context>>, tx: Transaction, scope: BookingScheduleScope): Promise<BookingScheduleRead> {
  bookingScheduleForm(current.app, scope)
  const checked = await inspectPublishedV2Form(current, tx, { ...scope, mode: 'initial' })
  if (!checked.ok) return checked
  if (!('state' in checked) || !checked.state) throw new RowWriteError('invalid', 'Не удалось открыть рабочие часы.')
  const data = await loadBookingData(current.app.booking!, current.app.workspaceId, tx)
  if (!data) throw new RowWriteError('invalid', 'Проверьте таблицы расписания.')
  return { ok: true, state: { revision: current.revision, fingerprint: checked.state.fingerprint, values: checked.state.values, masters: bookingScheduleMasters(current.app, current.actor, data) } }
}

/** Server expands only the canonical schedule form; normal workflow grants and receipts remain in force. */
export async function savePublishedBookingSchedule(slug: string, request: BookingScheduleRequest) {
  const definition = await publishedV2Definition(slug)
  if (!definition) throw new RowWriteError('missing', 'Приложение недоступно.')
  return writeRows(definition.app.workspaceId, async context => {
    const current = await publishedV2Context(slug, context.tx, true), { app, actor, revision } = current
    if (revision !== request.revision) return { ok: false as const, stale: true, error: 'Приложение обновлено. Откройте рабочие часы заново.' }
    const form = bookingScheduleForm(app, request), action = builderV2SaveFormAction(app, form)
    if (!actor.authenticated || !actor.id || !action || !canInvokeAppV2Workflow(app, actor, action.flow.id)) throw new RowWriteError('denied', 'У вас нет доступа к изменению рабочего времени.')
    const hash = builderV2Revision(['published-booking-schedule', request])
    const receipt = await builderV2WorkflowReceipt(context, app.id, actor.id, request.requestId, hash, true)
    if (receipt) return { ok: true as const, repeated: true }
    const checked = await inspectPublishedBookingSchedule(current, context.tx, request)
    if (!checked.ok) return checked
    if (checked.state.fingerprint !== request.fingerprint) return { ok: false as const, stale: true, error: 'Рабочие часы изменились. Откройте форму заново.' }
    const master = checked.state.masters.find(master => master.id === request.input.masterId)
    if (!master) throw new RowWriteError('denied', 'Выберите доступного мастера.')
    const plan = bookingSchedulePlan(app.booking!, request.input, master.name)
    if (!plan.ok) return plan
    const fields = builderV2FormInputs(app, form)
    if (!['create_row', 'update_row'].includes(action.step.type) || plan.rows.some(values => Object.keys(values).some(id => !Object.hasOwn(action.step.values, id) || fields.some(field => field.fieldId === id && field.readOnly)))) throw new RowWriteError('invalid', 'Настройки формы изменены. Проверьте её поля в конструкторе.')
    await mutationFields(context, form.tableId)
    const selected = request.recordId ? (await import('./builder-v2-working')).workingBuilderV2Record : null
    const stored = selected ? await selected(context.tx, form.tableId, request.recordId, true) : undefined
    const steps: AppV2Step[] = action.flow.steps.flatMap(step => step.id !== action.step.id ? [step] : plan.rows.map((values, index) => {
      const base = { id: index === 0 ? step.id : newId('action'), tableId: form.tableId, values: Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { kind: 'literal' as const, value }])) }
      return index === 0 && stored ? { ...base, type: 'update_row' as const, target: { kind: 'current' as const } } : { ...base, type: 'create_row' as const }
    }))
    const result = await commitBuilderV2Workflow({ context, app, actor, userId: actor.id, flow: { ...action.flow, steps }, tables: current.tables, selected: stored, form: { id: form.id, tableId: form.tableId, values: plan.rows[0]! }, primaryStepId: action.step.id, nodeId: form.id, requestId: request.requestId, revision, hash, published: true })
    return result.ok ? { ok: true as const, repeated: result.repeated } : result
  })
}
