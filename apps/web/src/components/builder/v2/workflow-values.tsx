'use client'
import type { AppV2Binding, AppV2Condition, AppV2Step, AppV2Target } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import type { BuilderV2Form, BuilderV2Input } from '@/lib/builder-v2-form-types'
import ui from './view.module.css'

export type WorkflowField = BuilderV2Table['fields'][number]
export type WorkflowScope = { tables: readonly BuilderV2Table[]; form?: BuilderV2Form; inputs: BuilderV2Input[]; rowTableId: string | null;screenTableId?:string|null;rowLabel?:string; available: readonly AppV2Step[]; primaryStepId?: string }
export const workflowFamily = (type: string) => ['number', 'formula', 'count', 'rollup'].includes(type) ? 'number' : ['single_select', 'multi_select', 'relation', 'date', 'datetime', 'checkbox', 'image', 'attachment'].includes(type) ? type : 'text'
const code = (value: AppV2Binding | AppV2Target) => JSON.stringify(value)
export function workflowSources(scope: WorkflowScope, field?: WorkflowField) {
  const choices: { binding: AppV2Binding; label: string; field?: WorkflowField }[] = [], formTable = scope.tables.find(table => table.id === scope.form?.tableId)
  const push = (binding: AppV2Binding, label: string, candidate?: WorkflowField) => { if (!field || candidate && workflowFamily(field.type) === workflowFamily(candidate.type) && (field.type !== 'relation' || candidate.relationTableId === field.relationTableId) && (!['image','attachment'].includes(field.type)||candidate.id===field.id)) choices.push({ binding, label, field: candidate }) }
  for (const input of scope.inputs) { const own = formTable?.fields.find(field => field.id === input.fieldId); if (own && scope.form) push({ kind: 'form', formId: scope.form.id, fieldId: own.id }, `Из формы: ${input.label || own.name}`, own) }
  const row = scope.tables.find(table => table.id === scope.rowTableId)
  for (const own of row?.fields ?? []) push({ kind: 'row', fieldId: own.id }, `${scope.rowLabel??'Открытая запись'}: ${own.name}`, own)
  if (field?.type === 'relation' && row && row.id === field.relationTableId) choices.push({ binding: { kind: 'record_ids', tableId: row.id, record: { kind: 'row' } }, label: `Связь с открытой записью: ${row.name}` })
  if(scope.rowLabel&&scope.screenTableId){const screen=scope.tables.find(table=>table.id===scope.screenTableId)
    for(const own of screen?.fields??[])push({kind:'screen_row',fieldId:own.id},`Открытая карточка: ${own.name}`,own)
    if(field?.type==='relation'&&screen&&screen.id===field.relationTableId)choices.push({binding:{kind:'record_ids',tableId:screen.id,record:{kind:'screen'}},label:`Связь с открытой карточкой: ${screen.name}`})
  }
  for (const [index, step] of scope.available.entries()) if (step.type === 'create_row' || step.type === 'update_row') {
    const table = scope.tables.find(table => table.id === step.tableId)
    for (const own of table?.fields ?? []) push({ kind: 'result', stepId: step.id, fieldId: own.id }, `${step.id === scope.primaryStepId ? 'Сохранённая запись' : `Шаг ${index + 1}, ${table?.name}`}: ${own.name}`, own)
    if (field?.type === 'relation' && table && field.relationTableId === table.id) choices.push({ binding: { kind: 'record_ids', tableId: table.id, record: { kind: 'result', stepId: step.id } }, label: step.id === scope.primaryStepId ? `Связь с сохранённой записью: ${table.name}` : `Связь с результатом шага ${index + 1}: ${table.name}` })
  }
  if (!field || workflowFamily(field.type) === 'text') for (const [property, label] of [['email', 'Почта пользователя'], ['name', 'Имя пользователя'], ['company', 'Организация пользователя']] as const) choices.push({ binding: { kind: 'user', property }, label })
  return choices
}
export function workflowDefaultValue(scope: WorkflowScope, field: WorkflowField): AppV2Binding {
  const choices = workflowSources(scope, field)
  return choices.find(choice => choice.field?.id === field.id)?.binding ?? choices.find(choice => choice.binding.kind === 'result')?.binding ?? choices[0]?.binding ?? { kind: 'literal', value: field.type === 'number' ? 0 : field.type === 'checkbox' ? false : ['relation', 'multi_select', 'image', 'attachment'].includes(field.type) ? [] : '' }
}
export function workflowValueLabel(scope: WorkflowScope, value: AppV2Binding, field?:WorkflowField): string {
  if(value.kind==='literal'&&(field?.type==='single_select'||field?.type==='multi_select'))return (Array.isArray(value.value)?value.value:[value.value]).filter(id=>id!==null&&id!=='').map(id=>field.choices?.find(choice=>choice.id===id)?.name??String(id)).join(', ')||'Не выбрано'
  if (value.kind === 'literal') return value.value === null || value.value === '' ? 'Не задано' : value.value === true ? 'Да' : value.value === false ? 'Нет' : Array.isArray(value.value) ? value.value.join(', ') || 'Пустой список' : String(value.value)
  return workflowSources(scope).find(choice => code(choice.binding) === code(value))?.label ?? (value.kind === 'record_ids' ? `Связь с записью: ${scope.tables.find(table => table.id === value.tableId)?.name ?? 'Таблица'}` : 'Значение из данных')
}
export function workflowConditionLabel(scope: WorkflowScope, value: AppV2Condition): string {
  if ('conditions' in value) return value.conditions.map(condition => workflowConditionLabel(scope, condition)).join(value.op === 'and' ? ' и ' : ' или ')
  const label = workflowValueLabel(scope, 'value' in value ? value.value : value.left)
  if ('value' in value) return `${label} ${value.op === 'empty' ? 'не заполнено' : 'заполнено'}`
  const operator = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'содержит', includes: 'содержит' }[value.op]
  return `${label} ${operator} ${workflowValueLabel(scope, value.right)}`
}
export function WorkflowLiteral({ value, field, onChange }: { value: Extract<AppV2Binding, {kind:'literal'}>['value']; field?: WorkflowField; onChange: (value: Extract<AppV2Binding, {kind:'literal'}>['value']) => void }) {
  if (field?.type === 'checkbox') return <select aria-label="Значение" value={String(value === true)} onChange={event => onChange(event.target.value === 'true')}><option value="true">Да</option><option value="false">Нет</option></select>
  if (field?.type === 'single_select' || field?.type === 'multi_select') return <select aria-label="Значение" multiple={field.type === 'multi_select'} value={field.type === 'multi_select' ? Array.isArray(value) ? value as string[] : [] : String(value ?? '')} onChange={event => onChange(field.type === 'multi_select' ? Array.from(event.target.selectedOptions).map(option => option.value) : event.target.value || null)}>{field.type === 'single_select' && <option value="">Не выбрано</option>}{field.choices?.map(choice => <option value={choice.id} key={choice.id}>{choice.name}</option>)}</select>
  if (field?.type==='image'||field?.type==='attachment') return <p className={ui.hint}>Без вложений. Чтобы сохранить выбранные файлы, используйте поле формы.</p>
  if (field?.type === 'relation') return <p className={ui.hint}>Пустая связь. Чтобы связать записи, выберите источник выше.</p>
  const numeric = field && workflowFamily(field.type) === 'number'
  return <input aria-label="Значение" type={numeric ? 'number' : field?.type === 'date' ? 'date' : field?.type === 'datetime' ? 'datetime-local' : 'text'} step={numeric ? 'any' : undefined} maxLength={1000} value={typeof value === 'string' || typeof value === 'number' ? value : ''} onChange={event => onChange(numeric ? event.target.value === '' ? null : Number(event.target.value) : event.target.value)} />
}
export function WorkflowValue({ scope, value, field, onChange }: { scope: WorkflowScope; value: AppV2Binding; field?: WorkflowField; onChange: (value: AppV2Binding) => void }) {
  const choices = workflowSources(scope, field), selected = value.kind === 'literal' ? 'literal' : code(value), known = choices.some(choice => code(choice.binding) === selected)
  return <div className={ui.workflowValue}><select aria-label="Источник значения" value={selected} onChange={event => onChange(event.target.value === 'literal' ? { kind: 'literal', value: field && workflowFamily(field.type) === 'number' ? 0 : field?.type === 'checkbox' ? false : field&&['relation','multi_select','image','attachment'].includes(field.type) ? [] : '' } : JSON.parse(event.target.value) as AppV2Binding)}><option value="literal">Своё значение</option>{!known && value.kind !== 'literal' && <option value={selected}>Источник недоступен</option>}{choices.map(choice => <option key={code(choice.binding)} value={code(choice.binding)}>{choice.label}</option>)}</select>{value.kind === 'literal' && <WorkflowLiteral field={field} value={value.value} onChange={next => onChange({ kind: 'literal', value: next })} />}</div>
}
export function WorkflowCondition({ scope, value, onChange }: { scope: WorkflowScope; value: AppV2Condition; onChange: (value: AppV2Condition) => void }) {
  if ('conditions' in value) return <p className={ui.hint}>Составное условие сохранено. Его можно заменить отдельным условием.<button type="button" onClick={() => onChange(defaultWorkflowCondition(scope))}>Заменить условие</button></p>
  const left = 'value' in value ? value.value : value.left, field = workflowSources(scope).find(choice => code(choice.binding) === code(left))?.field
  const changeLeft = (left: AppV2Binding) => { const next = workflowSources(scope).find(choice => code(choice.binding) === code(left))?.field; onChange('value' in value ? { ...value, value: left } : { ...value, left, right: { kind: 'literal', value: next && workflowFamily(next.type) === 'number' ? 0 : next?.type === 'checkbox' ? false : '' } }) }
  return <div className={ui.workflowValue}><label>Что проверить<WorkflowValue scope={scope} value={left} onChange={changeLeft} /></label><label>Условие<select value={value.op} onChange={event => onChange(event.target.value === 'empty' || event.target.value === 'not_empty' ? { op: event.target.value, value: left } : { op: event.target.value as 'eq', left, right: 'right' in value ? value.right : { kind: 'literal', value: field && workflowFamily(field.type) === 'number' ? 0 : field?.type === 'checkbox' ? false : '' } })}><option value="not_empty">Заполнено</option><option value="empty">Не заполнено</option><option value="eq">Равно</option><option value="ne">Не равно</option><option value="gt">Больше</option><option value="gte">Не меньше</option><option value="lt">Меньше</option><option value="lte">Не больше</option><option value="contains">Содержит текст</option><option value="includes">Список содержит значение</option></select></label>{'right' in value && <label>С чем сравнить<WorkflowValue scope={scope} field={field?.type === 'multi_select' ? { ...field, type: 'single_select' } : field} value={value.right} onChange={right => onChange({ ...value, right })} /></label>}</div>
}
export function defaultWorkflowCondition(scope: WorkflowScope): AppV2Condition { return { op: 'not_empty', value: workflowSources(scope)[0]?.binding ?? { kind: 'literal', value: '' } } }
export function workflowTargets(scope: WorkflowScope, tableId: string) { return [...(scope.rowTableId === tableId ? [{ value: { kind: 'current' as const }, label: scope.rowLabel??'Открытая запись' }] : []), ...scope.available.flatMap((step, index) => (step.type === 'create_row' || step.type === 'update_row') && step.tableId === tableId ? [{ value: { kind: 'result' as const, stepId: step.id }, label: step.id === scope.primaryStepId ? 'Сохранённая запись' : `Результат шага ${index + 1}` }] : [])] }
export function WorkflowTarget({ scope, tableId, value, onChange }: { scope: WorkflowScope; tableId: string; value: AppV2Target | null; onChange: (value: AppV2Target) => void }) { const choices = workflowTargets(scope, tableId); return <label>Какую запись<select value={value ? code(value) : ''} onChange={event => onChange(JSON.parse(event.target.value) as AppV2Target)}><option value="" disabled>Выберите запись</option>{value && !choices.some(choice => code(choice.value) === code(value)) && <option value={code(value)} disabled>Запись недоступна на этом шаге</option>}{choices.map(choice => <option key={code(choice.value)} value={code(choice.value)}>{choice.label}</option>)}</select></label> }
