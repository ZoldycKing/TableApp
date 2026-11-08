import {validateBuilderV2Attachments} from './builder-v2-attachment-values'
import { db, rows } from '@tableapp/db'
import { emptyValue, fieldTimeZone, isComputed, parseCellValue, type Field } from '@tableapp/schema'
import { resolveAppV2Binding, type AppV2, type AppV2Context, type AppV2Json, type AppV2Actor } from '@tableapp/schema/app-v2'
import { and, asc, eq, gt, ilike, inArray, isNull, sql } from 'drizzle-orm'
import { builderV2ScreenNodes, builderV2DataNodes } from './builder-v2-data-types'
import { BUILDER_V2_FORM_TYPES, builderV2FormInputs, type BuilderV2FormRequest, type BuilderV2FormResult, type BuilderV2FormState, type BuilderV2FormOptionsResult } from './builder-v2-form-types'
import { builderV2CalculationPlan } from './builder-v2-read-plan'
import { builderV2ScreenFields } from './builder-v2-record'
import { builderV2Revision } from './builder-v2-revision'
import { builderV2Json, deriveBuilderV2Rows, loadBuilderV2ReadMetadata } from './builder-v2-row-data'
import { formatCell } from './format'
import { withInitialValues } from './initial-values'
import { RowWriteError } from './row-mutations'
import type { RuntimeSourceRow } from './runtime-project'
import type { Member } from './session'
import type { Transaction } from './db-transaction'
import { restrictedTables, tablePermission } from './table-permissions'

const blank = (value: unknown) => value === null || value === undefined || typeof value === 'string' && !value.trim() || Array.isArray(value) && value.length === 0
const error = (message: string): never => { throw new RowWriteError('invalid', message) }

/** Shared validation; preview uses a read-only transaction, execution supplies its atomic transaction. */
export async function inspectBuilderV2Form(app: AppV2, member: Member, request: BuilderV2FormRequest, options?: { transaction: Transaction; actor: AppV2Actor }): Promise<BuilderV2FormResult | BuilderV2FormOptionsResult> {
  const screen = app.screens.find(screen => screen.id === request.screenId), form = app.nodes.find(node => node.id === request.formId)
  if (!screen || form?.type !== 'form' || !builderV2ScreenNodes(app, screen.id).some(node => node.id === form.id) || member.workspaceId !== app.workspaceId || restrictedTables(member) || tablePermission(member, form.tableId) === 'none') throw new RowWriteError('denied', 'Форма недоступна')
  if (screen.contextTableId && !request.recordId) error('Сначала откройте запись из списка')
  if (!screen.contextTableId && request.recordId) error('Этой форме не нужна выбранная запись')
  const inspect = async (tx: Transaction): Promise<BuilderV2FormResult | BuilderV2FormOptionsResult> => {
    if (builderV2DataNodes(app, form).some(node => node.visibleWhen || node.visibleTo)) error('Условная видимость элементов формы пока не поддерживается. Уберите условие для проверки формы.')
    const inputs = builderV2FormInputs(app, form), meta = await loadBuilderV2ReadMetadata(tx, member.workspaceId, [form.tableId, ...(screen.contextTableId ? [screen.contextTableId] : [])])
    if (!inputs.length) error('Добавьте в форму хотя бы одно поле')
    const columns = meta.fieldsByTable.get(form.tableId) ?? [], fields = inputs.map(input => columns.find(field => field.id === input.fieldId)!)
    if (fields.some(field => !field || isComputed(field.type))) error('Поля формы изменились. Обновите редактор.')
    const now = new Date(), context: AppV2Context = { actor: options?.actor ?? { authenticated: true, roleIds: [], id: member.userId, email: member.email, name: member.name, company: '' } }
    let selectedVersion: number | null = null
    if (screen.contextTableId) {
      const [selected] = await tx.select().from(rows).where(and(eq(rows.tableId, screen.contextTableId), eq(rows.id, request.recordId!), isNull(rows.deletedAt))).limit(1)
      if (!selected) throw new RowWriteError('missing', 'Открытая запись удалена или больше недоступна')
      selectedVersion = selected.version
      const needed = builderV2ScreenFields(app, screen.id)
      if (form.mode === 'edit') fields.forEach(field => needed.add(field.id))
      const plan = builderV2CalculationPlan(meta.fieldsByTable, meta.primaryByTable, new Map([[selected.tableId, needed]]))
      const [derived] = await deriveBuilderV2Rows(meta, [selected as RuntimeSourceRow], plan, now.getTime())
      context.row = context.screenRow = { id: selected.id, tableId: selected.tableId, values: builderV2Json(derived!.data) as Record<string, AppV2Json> }
    }
    const initial: Record<string, unknown> = {}
    for (const input of inputs) {
      const field = fields.find(field => field.id === input.fieldId)!
      if (input.initialValue) {
        const result = resolveAppV2Binding(input.initialValue, context)
        if (!result.ok) error(`Поле «${input.label || field.name}»: ${result.error}`)
        else initial[field.id] = result.value
      } else if (form.mode === 'edit') initial[field.id] = context.row?.values[field.id] ?? emptyValue(field.type)
      else initial[field.id] = emptyValue(field.type)
    }
    const defaults = await withInitialValues(fields, initial, async (tableId, rowId, fieldId) => {
      if (!meta.fieldsByTable.get(tableId)?.some(field => field.id === fieldId && field.type === 'number')) return undefined
      const [related] = await tx.select({ data: rows.data }).from(rows).where(and(eq(rows.id, rowId), eq(rows.tableId, tableId), isNull(rows.deletedAt))).limit(1)
      return (related?.data as Record<string, unknown> | undefined)?.[fieldId]
    }, { creating: form.mode === 'create', now })
    const fingerprint = builderV2Revision([app.id, member.userId, screen.id, form, inputs, fields, selectedVersion, request.recordId ?? null, context.actor])
    if (request.mode === 'options') {
      const input = inputs.find(input => input.fieldId === request.fieldId), field = fields.find(field => field.id === request.fieldId)
      if (!input || input.readOnly || field?.type !== 'relation' || !meta.fieldsByTable.has(field.options.tableId)) error('Для этого поля выбор записей недоступен')
      const target = (field as Extract<Field, { type: 'relation' }>).options.tableId, primaryId = meta.primaryByTable.get(target), targetFields = meta.fieldsByTable.get(target) ?? [], primary = targetFields.find(field => field.id === primaryId) ?? targetFields[0]
      if (!primary || isComputed(primary.type) || !['text', 'long_text', 'email', 'phone', 'url', 'number'].includes(primary.type)) error('Для поиска связанных записей выберите обычное главное поле таблицы')
      const search = request.search.replace(/[\\%_]/g, '\\$&')
      const records = await tx.select({ id: rows.id, data: rows.data }).from(rows).where(and(eq(rows.tableId, target), isNull(rows.deletedAt), request.after ? gt(rows.id, request.after) : undefined, search ? ilike(sql`${rows.data}->>${primary!.id}`, `%${search}%`) : undefined)).orderBy(asc(rows.id)).limit(31)
      return { ok: true, options: records.slice(0, 30).map(row => ({ id: row.id, label: formatCell(primary!, (row.data as Record<string, unknown>)[primary!.id]) || 'Без названия' })), next: records.length > 30 ? records[29]!.id : null }
    }
    if (request.mode === 'check' && request.fingerprint !== fingerprint) return { ok: false, stale: true, error: 'Настройки формы или открытая запись изменились. Обновите форму.' }
    if (request.mode === 'check' && Object.keys(request.values).some(id => !inputs.some(input => input.fieldId === id && !input.readOnly))) error('Форма содержит недоступное поле')
    const values = { ...defaults, ...(request.mode === 'check' ? request.values : {}) }, errors: Record<string, string> = {}, labels: Record<string, string> = {}
    for (const input of inputs) {
      const field = fields.find(field => field.id === input.fieldId)!, label = input.label || field.name, value = values[field.id]
      if (!BUILDER_V2_FORM_TYPES.includes(field.type)) { if (request.mode === 'check') errors[input.id] = 'Этот тип поля пока не поддерживается формой'; continue }
      try { values[field.id] = parseCellValue(field, value); await validateBuilderV2Attachments(field,values[field.id],tx) } catch { errors[input.id] = `Проверьте поле «${label}»`; continue }
      const parsed = values[field.id]
      if (request.mode === 'check' && input.required && (blank(parsed) || field.type === 'checkbox' && parsed !== true)) errors[input.id] = field.type === 'checkbox' ? 'Установите отметку' : `Заполните поле «${label}»`
      if ((field.type === 'single_select' || field.type === 'multi_select') && !blank(parsed)) {
        const ids = Array.isArray(parsed) ? parsed : [parsed]
        if (ids.some(id => !field.options.choices.some(choice => choice.id === id))) errors[input.id] = 'Выберите значение из списка'
      }
      if (field.type === 'email' && !blank(parsed) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(parsed))) errors[input.id] = 'Введите почту в формате name@example.ru'
      if (field.type === 'url' && !blank(parsed)) { try { const url = new URL(String(parsed)); if (!['https:', 'http:'].includes(url.protocol)) throw new Error() } catch { errors[input.id] = 'Введите ссылку, начинающуюся с https:// или http://' } }
      if (field.type !== 'relation') labels[field.id] = formatCell(field, parsed)
      if (field.type === 'relation' && Array.isArray(parsed)) {
        if (!field.options.allowMultiple && parsed.length > 1 || new Set(parsed).size !== parsed.length) { errors[input.id] = 'Выберите одну запись'; continue }
        const target = field.options.tableId
        if (!meta.fieldsByTable.has(target)) { errors[input.id] = 'Связанная таблица недоступна'; continue }
        const found = parsed.length ? await tx.select().from(rows).where(and(eq(rows.tableId, target), inArray(rows.id, parsed as string[]), isNull(rows.deletedAt))) : []
        if (found.length !== parsed.length) errors[input.id] = 'Связанная запись удалена или недоступна'
        const targetFields = meta.fieldsByTable.get(target) ?? [], primary = targetFields.find(field => field.id === meta.primaryByTable.get(target)) ?? targetFields[0]
        const plan = builderV2CalculationPlan(meta.fieldsByTable, meta.primaryByTable, new Map([[target, new Set(primary ? [primary.id] : [])]]))
        const derived = await deriveBuilderV2Rows(meta, found as RuntimeSourceRow[], plan, now.getTime())
        labels[field.id] = (parsed as string[]).map(id => derived.find(row => row.id === id)?.display[primary?.id ?? ''] ?? 'Недоступная запись').join(', ')
      }
    }
    if (Object.keys(errors).length) return { ok: false, error: request.mode === 'check' ? 'Проверьте отмеченные поля' : 'Проверьте начальные значения формы', errors }
    const state: BuilderV2FormState = { values: builderV2Json(values) as Record<string, AppV2Json>, labels, fingerprint, fields: inputs.map(input => { const field = fields.find(field => field.id === input.fieldId)!; return { nodeId: input.id, fieldId: field.id, label: input.label || field.name, type: field.type, required: input.required, readOnly: Boolean(input.readOnly), supported: BUILDER_V2_FORM_TYPES.includes(field.type), ...('choices' in field.options ? { choices: field.options.choices } : {}), ...(field.type === 'relation' ? { allowMultiple: field.options.allowMultiple } : {}), ...(field.type==='image'||field.type==='attachment'?{maxCount:field.options.maxCount}:{}), ...(field.type === 'date' || field.type === 'datetime' ? { timeZone: fieldTimeZone(field) } : {}) } }) }
    return { ok: true, state }
  }
  return options ? inspect(options.transaction) : db.transaction(inspect, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
