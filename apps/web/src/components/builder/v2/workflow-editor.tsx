'use client'
import { useState, type ReactNode } from 'react'
import { isComputed } from '@tableapp/schema'
import type { AppV2, AppV2Step } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { BUILDER_V2_FORM_TYPES, builderV2FormInputs, type BuilderV2Form } from '@/lib/builder-v2-form-types'
import { builderV2FormSaveWorkflow } from '@/lib/builder-v2-form-action'
import { builderV2StepLabel, builderV2WorkflowSteps, type BuilderV2Workflow } from '@/lib/builder-v2-workflow-types'
import { PrototypeDialog } from '../prototype/dialog'
import { ProtoIcon } from '../prototype/icons'
import { v2Id } from './model'
import { defaultWorkflowCondition, WorkflowCondition, WorkflowTarget, WorkflowValue, workflowConditionLabel, workflowDefaultValue, workflowTargets, workflowValueLabel, type WorkflowScope } from './workflow-values'
import styles from '../prototype/prototype.module.css'
import ui from './view.module.css'

const writable = (table?: BuilderV2Table) => table?.fields.filter(field => !isComputed(field.type) && BUILDER_V2_FORM_TYPES.includes(field.type)) ?? []
export function BuilderV2WorkflowEditor({ app, form, workflow, tables, onSave, onClose,itemContext=false }: { app: AppV2; form?: BuilderV2Form; workflow?: BuilderV2Workflow;itemContext?:boolean; tables: readonly BuilderV2Table[]; onSave: (flow: BuilderV2Workflow) => string | null; onClose: () => void }) {
  const action = form ? builderV2FormSaveWorkflow(app, form) : null, [flow, setFlow] = useState<BuilderV2Workflow>(structuredClone(workflow ?? action!.flow)), [error, setError] = useState(''), [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const rootScope: WorkflowScope = { tables, form, inputs: form ? builderV2FormInputs(app, form) : [], rowTableId: flow.input.rowTableId, screenTableId:flow.input.screenTableId, rowLabel:itemContext?'Строка списка':undefined, available: [], primaryStepId: action?.step.id }
  const change = (steps: AppV2Step[]) => { setFlow({ ...flow, steps }); setError('') }
  const updateStep = (steps: readonly AppV2Step[], id: string, next: AppV2Step): AppV2Step[] => steps.map(step => step.id === id ? next : step.type === 'branch' ? { ...step, then: updateStep(step.then, id, next), else: updateStep(step.else, id, next) } : step)
  const add = (steps: readonly AppV2Step[], type: string, scope: WorkflowScope): AppV2Step[] => {
    const id = v2Id(), table = tables.find(table => table.id === (form?.tableId ?? flow.input.rowTableId)) ?? tables.find(table=>!['update_row','delete_row'].includes(type)||workflowTargets(scope,table.id).length)
    let step: AppV2Step
    if (type === 'require') step = { id, type, condition: defaultWorkflowCondition(scope), message: 'Проверьте введённые данные' }
    else if (type === 'branch') step = { id, type, condition: defaultWorkflowCondition(scope), then: [], else: [] }
    else if (type === 'notify') step = { id, type, message: { kind: 'literal', value: 'Сохранено' } }
    else if(type==='go_back')step={id,type}
    else if(type==='open_url'||type==='copy_value')step={id,type,value:{kind:'literal',value:''}}
    else if (type === 'open_screen') { const screen = app.screens.find(screen => !screen.contextTableId) ?? app.screens[0]!; step = { id, type, screenId: screen.id, record: screen.contextTableId ? workflowTargets(scope, screen.contextTableId)[0]?.value ?? null : null } }
    else {
      if (!table) return [...steps]
      const field = writable(table)[0], values = field ? { [field.id]: workflowDefaultValue(scope, field) } : {}
      step = type==='delete_row'?{id,type,tableId:table.id,target:workflowTargets(scope,table.id)[0]?.value??{kind:'current'},confirm:true}:type === 'update_row' ? { id, type, tableId: table.id, target: workflowTargets(scope, table.id)[0]?.value ?? { kind: 'current' }, values } : { id, type: 'create_row', tableId: table.id, values }
    }
    setSelectedStepId(id)
    return [...steps, step]
  }
  const summary = (step: AppV2Step, scope: WorkflowScope): string => {
    if (step.id === action?.step.id) return `Заполненные поля → ${tables.find(table => table.id === form?.tableId)?.name ?? 'Таблица'}`
    if (step.type === 'require' || step.type === 'branch') return workflowConditionLabel(scope, step.condition)
    if (step.type === 'notify') return workflowValueLabel(scope, step.message)
    if(step.type==='open_url'||step.type==='copy_value')return workflowValueLabel(scope,step.value)
    if(step.type==='go_back')return 'Предыдущий экран приложения. Если его нет, стартовый экран.'
    if (step.type === 'create_row' || step.type === 'update_row') return Object.entries(step.values).map(([id, value]) => {const field=tables.find(table=>table.id===step.tableId)?.fields.find(field=>field.id===id);return `${field?.name??'Поле'} ← ${workflowValueLabel(scope,value,field)}`}).join(' · ') || 'Выберите поля для сохранения'
    if(step.type==='delete_row')return `${workflowTargets(scope,step.tableId).find(target=>JSON.stringify(target.value)===JSON.stringify(step.target))?.label??'Выберите запись'} · С подтверждением`
    if (step.type === 'open_screen') return step.record ? workflowTargets(scope, app.screens.find(screen => screen.id === step.screenId)?.contextTableId ?? '').find(target => JSON.stringify(target.value) === JSON.stringify(step.record))?.label ?? 'Выберите запись' : 'Без привязки к записи'
    return ''
  }
  const stepList = (steps: readonly AppV2Step[], scope: WorkflowScope, onSteps: (steps: AppV2Step[]) => void, depth = 0): ReactNode => <>
    <ol className={ui.workflowSteps}>{steps.map((step, index) => {
      const own = { ...scope, available: [...scope.available, ...steps.slice(0, index)] }, main = step.id === action?.step.id, table = 'tableId' in step ? tables.find(table => table.id === step.tableId) : undefined
      const expanded = selectedStepId === step.id || step.type === 'branch' && builderV2WorkflowSteps([...step.then, ...step.else]).some(child => child.id === selectedStepId)
      const update = (next: AppV2Step) => change(updateStep(flow.steps, step.id, next))
      const move = (delta: number) => { const next = [...steps]; [next[index], next[index + delta]] = [next[index + delta]!, next[index]!]; onSteps(next) }
      return <li key={step.id} className={ui.workflowStep} data-editing={expanded}><header><strong>{index + 1}. {main ? 'Сохранить форму' : builderV2StepLabel(step, tables, app.screens)}</strong><div className={ui.stepButtons}>{!main && <button type="button" className={ui.stepConfigure} aria-label={`${expanded ? 'Готово' : 'Настроить'}: шаг ${index + 1}`} aria-expanded={expanded} onClick={() => setSelectedStepId(expanded ? null : step.id)}>{expanded ? 'Готово' : 'Настроить'}</button>}<button type="button" className={styles.iconButton} aria-label={`Поднять шаг ${index + 1}`} disabled={!index} onClick={() => move(-1)}><ProtoIcon name="up" size={16} /></button><button type="button" className={styles.iconButton} aria-label={`Опустить шаг ${index + 1}`} disabled={index === steps.length - 1} onClick={() => move(1)}><ProtoIcon name="down" size={16} /></button>{!main && <button type="button" className={styles.iconButton} aria-label={`Удалить шаг ${index + 1}`} onClick={() => { onSteps(steps.filter(item => item.id !== step.id)); if (expanded) setSelectedStepId(null) }}><ProtoIcon name="trash" size={16} /></button>}</div></header>
        {!expanded && <div className={ui.workflowSummary}><p>{summary(step, own)}</p>{step.type === 'branch' && <><p>Если да: {step.then.map(child => summary(child, own) || builderV2StepLabel(child, tables, app.screens)).join('; ') || 'Продолжить'}</p><p>Если нет: {step.else.map(child => summary(child, own) || builderV2StepLabel(child, tables, app.screens)).join('; ') || 'Продолжить'}</p></>}</div>}
        {!main && expanded && <>
        {(step.type === 'require' || step.type === 'branch') && <WorkflowCondition scope={own} value={step.condition} onChange={condition => update({ ...step, condition })} />}
        {step.type === 'require' && <label>Если условие не выполнено<input maxLength={500} value={step.message} onChange={event => update({ ...step, message: event.target.value })} /></label>}
        {(step.type === 'create_row' || step.type === 'update_row') && <>
          <label>Таблица<select value={step.tableId} onChange={event => { const next = tables.find(table => table.id === event.target.value)!, field = writable(next)[0]; update({ ...step, tableId: next.id, values: field ? { [field.id]: workflowDefaultValue(own, field) } : {}, ...(step.type === 'update_row' ? { target: workflowTargets(own, next.id)[0]?.value ?? { kind: 'current' as const } } : {}) }) }}>{tables.filter(table => writable(table).length && (step.type === 'create_row' || workflowTargets(own, table.id).length)).map(table => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
          {step.type === 'update_row' && <WorkflowTarget scope={own} tableId={step.tableId} value={step.target} onChange={target => update({ ...step, target })} />}
          {Object.entries(step.values).map(([id, value]) => <div key={id} className={ui.workflowMapping}><label>Поле<select value={id} onChange={event => { const field = table?.fields.find(field => field.id === event.target.value); if (!field) return; const next = { ...step.values }; delete next[id]; next[field.id] = workflowDefaultValue(own, field); update({ ...step, values: next }) }}>{writable(table).filter(field => field.id === id || !Object.hasOwn(step.values, field.id)).map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><label>Значение<WorkflowValue scope={own} value={value} field={table?.fields.find(field => field.id === id)} onChange={value => update({ ...step, values: { ...step.values, [id]: value } })} /></label><button type="button" className={styles.textButton} onClick={() => { const values = { ...step.values }; delete values[id]; update({ ...step, values }) }}>Убрать поле</button></div>)}
          <button type="button" className={styles.secondary} disabled={!writable(table).some(field => !Object.hasOwn(step.values, field.id))} onClick={() => { const field = writable(table).find(field => !Object.hasOwn(step.values, field.id)); if (field) update({ ...step, values: { ...step.values, [field.id]: workflowDefaultValue(own, field) } }) }}>Добавить поле</button>
        </>}
        {step.type==='delete_row'&&<><label>Таблица<select value={step.tableId} onChange={event=>{const tableId=event.target.value;update({...step,tableId,target:workflowTargets(own,tableId)[0]?.value??{kind:'current'},confirm:true})}}>{tables.filter(table=>workflowTargets(own,table.id).length).map(table=><option key={table.id} value={table.id}>{table.name}</option>)}</select></label><WorkflowTarget scope={own} tableId={step.tableId} value={step.target} onChange={target=>update({...step,target,confirm:true})}/><p className={ui.hint}>Перед выполнением появится окно с названием записи. Без подтверждения всё действие будет отменено.</p></>}
        {step.type === 'notify' && <label>Сообщение<WorkflowValue scope={own} field={{ id: 'message', name: 'Сообщение', type: 'text' }} value={step.message} onChange={message => update({ ...step, message })} /></label>}
        {(step.type==='open_url'||step.type==='copy_value')&&<label>{step.type==='open_url'?'Адрес страницы':'Что скопировать'}<WorkflowValue scope={own} field={step.type==='open_url'?{id:'url',name:'Ссылка',type:'url'}:undefined} value={step.value} onChange={value=>update({...step,value})}/>{step.type==='open_url'&&<small className={ui.hint}>Откроется в этой вкладке. Можно указать адрес или взять его из поля.</small>}</label>}
        {step.type==='go_back'&&<p className={ui.hint}>Возвращает на предыдущий экран приложения. При входе по прямой ссылке открывает стартовый экран.</p>}
        {step.type === 'open_screen' && <><label>Экран<select value={step.screenId} onChange={event => { const screen = app.screens.find(screen => screen.id === event.target.value)!; update({ ...step, screenId: screen.id, record: screen.contextTableId ? workflowTargets(own, screen.contextTableId)[0]?.value ?? null : null }) }}>{app.screens.map(screen => <option key={screen.id} value={screen.id}>{screen.name}</option>)}</select></label>{app.screens.find(screen => screen.id === step.screenId)?.contextTableId && <WorkflowTarget scope={own} tableId={app.screens.find(screen => screen.id === step.screenId)!.contextTableId!} value={step.record} onChange={record => update({ ...step, record })} />}</>}
        {step.type === 'branch' && <div className={ui.workflowBranches}><section aria-label="Если да"><h3>Если да</h3>{stepList(step.then, own, then => update({ ...step, then }), depth + 1)}</section><section aria-label="Если нет"><h3>Если нет</h3>{stepList(step.else, own, otherwise => update({ ...step, else: otherwise }), depth + 1)}</section></div>}
        </>}
      </li>
    })}</ol>
    <label>Добавить шаг<select aria-label={depth ? 'Добавить шаг в ветку' : 'Добавить шаг'} value="" disabled={builderV2WorkflowSteps(flow.steps).length >= 30} onChange={event => { if (event.target.value) onSteps(add(steps, event.target.value, { ...scope, available: [...scope.available, ...steps] })) }}><option value="">Выберите действие</option><option value="require">Проверить условие</option><option value="create_row">Добавить запись в таблицу</option><option value="update_row" disabled={![...tables].some(table => workflowTargets({ ...scope, available: [...scope.available, ...steps] }, table.id).length)}>Изменить запись</option><option value="delete_row" disabled={!tables.some(table=>workflowTargets({...scope,available:[...scope.available,...steps]},table.id).length)}>Удалить запись</option><option value="branch" disabled={depth >= 3}>Выбрать по условию</option><option value="notify">Показать сообщение</option><option value="open_screen">Открыть экран</option><option value="go_back">Назад</option><option value="open_url">Открыть ссылку</option><option value="copy_value">Скопировать значение</option></select></label>
  </>
  return <PrototypeDialog title="Шаги действия" onClose={onClose}><div className={ui.workflowEditor}><label>Название действия<input maxLength={100} value={flow.name} onChange={event => setFlow({ ...flow, name: event.target.value })} /></label>{stepList(flow.steps, rootScope, change)}{error && <p role="alert" className={ui.dataError}>{error}</p>}<div className={ui.dataControls}><button type="button" className={styles.secondary} onClick={onClose}>Отмена</button><button type="button" className={styles.primary} onClick={() => { const error = onSave(flow); if (error) setError(error); else onClose() }}>Сохранить шаги</button></div></div></PrototypeDialog>
}
