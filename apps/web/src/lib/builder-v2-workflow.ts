import { appV2NavigationUrl, authorizeAppV2Write, canOpenAppV2Screen, evaluateAppV2Condition, resolveAppV2Binding, type AppV2, type AppV2Actor, type AppV2Binding, type AppV2Context, type AppV2Json, type AppV2Record, type AppV2Step, type AppV2Target } from '@tableapp/schema/app-v2'
import { createRow, updateRow, deleteRow, RowWriteError, type RowTransaction, type StoredRow } from './row-mutations'
import {dependentRows} from './production-cascade'
import {builderV2Revision} from './builder-v2-revision'
import type {BuilderV2WorkflowConfirmation} from './builder-v2-workflow-types'
import { workingBuilderV2Record } from './builder-v2-working'
import { builderV2Json, deriveBuilderV2Rows, loadBuilderV2ReadMetadata } from './builder-v2-row-data'
import { builderV2CalculationPlan } from './builder-v2-read-plan'
import { PlanLimitError } from './limits'
import { builderV2ExecutableWorkflow, builderV2StepLabel, builderV2WorkflowSteps, type BuilderV2Workflow, type BuilderV2WorkflowEffect, type BuilderV2WorkflowTrace } from './builder-v2-workflow-types'
import { builderV2WorkflowValues } from './builder-v2-workflow-values'
import {derivePublishedV2Rows,canReadPublishedV2Row} from './builder-v2-published-rows'

export class BuilderV2WorkflowError extends Error {
  readonly trace: BuilderV2WorkflowTrace
  readonly stale: boolean
  constructor(cause: unknown, stepId: string, label: string, trace: BuilderV2WorkflowTrace) {
    super(cause instanceof RowWriteError || cause instanceof PlanLimitError ? cause.message : 'Не удалось выполнить шаг. Изменения отменены.')
    this.trace = [...trace.map(item => ({ ...item, status: item.status === 'done' ? 'rolled_back' as const : item.status })), { stepId, label, status: 'failed', detail: this.message }]
    this.stale = cause instanceof RowWriteError && cause.code === 'conflict'
  }
}
/** Carries a preview out of the savepoint; no mutation, receipt or journal entry is committed. */
export class BuilderV2WorkflowConfirmationRequired extends Error {
  constructor(readonly confirmation:BuilderV2WorkflowConfirmation){super('Подтвердите удаление записей')}
}

/** Executes the complete validated definition. Effects are returned only after its transaction commits. */
export async function executeBuilderV2Workflow(options: { write: RowTransaction; app: AppV2; actor: AppV2Actor; userId: string; flow: BuilderV2Workflow; tables: readonly { id: string; name: string }[]; selected?: StoredRow; screenSelected?:StoredRow|null; form?: { id: string; tableId: string; values: Record<string, AppV2Json> }; primaryStepId?: string; published?:boolean; confirmation?:string }) {
  const { write, app, actor, userId, flow, tables, selected, form, primaryStepId } = options
  if (!builderV2ExecutableWorkflow(flow)) throw new RowWriteError('invalid', 'В этом действии есть шаг, который пока нельзя выполнить')
  const all = builderV2WorkflowSteps(flow.steps), roots = [...new Set([...(selected ? [selected.tableId] : []),...(options.screenSelected?[options.screenSelected.tableId]:[]), ...all.flatMap(step => 'tableId' in step ? [step.tableId] : [])])]
  const meta = await loadBuilderV2ReadMetadata(write.tx, app.workspaceId, roots), needed = new Map<string, Set<string>>()
  const need = (id: string) => { const field = meta.allFields.find(field => field.id === id); if (field) { const ids = needed.get(field.tableId) ?? new Set<string>(); ids.add(id); needed.set(field.tableId, ids) } }
  const scan = (value: unknown): void => { if (!value || typeof value !== 'object') return; if (Array.isArray(value)) { value.forEach(scan); return } const object = value as Record<string, unknown>; if (object.kind === 'literal') return; if (typeof object.fieldId === 'string') need(object.fieldId); Object.values(object).forEach(scan) }
  scan(flow.steps); scan(app.policy.tables);for(const step of all)if(step.type==='delete_row'){const primary=meta.primaryByTable.get(step.tableId);if(primary)need(primary)}
  const plan = builderV2CalculationPlan(meta.fieldsByTable, meta.primaryByTable, needed), asOf = Date.now()
  const record = async (row: StoredRow): Promise<AppV2Record> => { const roots=[{...row,data:row.data as Record<string,unknown>}];const [derived] = options.published?await derivePublishedV2Rows(meta,app,actor,roots,asOf):await deriveBuilderV2Rows(meta,roots,plan,asOf); return { id: row.id, tableId: row.tableId, values: builderV2Json(derived?.data??{}) as Record<string, AppV2Json> } }
  const initial = selected ? await record(selected) : undefined, screenInitial=options.screenSelected===undefined?initial:options.screenSelected?await record(options.screenSelected):undefined, results = new Map<string, AppV2Record>(), effects: BuilderV2WorkflowEffect[] = [], trace: BuilderV2WorkflowTrace = []
  const context: AppV2Context = { actor, row: initial, screenRow: screenInitial, forms: new Map(form ? [[form.id, { tableId: form.tableId, values: form.values }]] : []), results }
  const created=new Map<string,string>(),deleted=new Set<string>(),deletions:{stepId:string;tableId:string;recordKey:string;version:number;recordLabel:string;tableName:string}[]=[]
  const resolve = (binding: AppV2Binding): AppV2Json => { const result = resolveAppV2Binding(binding, context); if (!result.ok) throw new RowWriteError('invalid', result.error); return result.value }
  const target = (value: AppV2Target): AppV2Record => { const result = value.kind === 'current' ? context.row : results.get(value.stepId); if (!result) throw new RowWriteError('invalid', 'Запись недоступна на этом шаге'); return result }
  const condition = (value: Parameters<typeof evaluateAppV2Condition>[0]) => { const result = evaluateAppV2Condition(value, context); if (!result.ok) throw new RowWriteError('invalid', result.error); return result.value }
  const run = async (steps: readonly AppV2Step[]): Promise<void> => {
    for (const step of steps) {
      const label = builderV2StepLabel(step, tables, app.screens)
      try {
        if (step.type === 'branch') {
          const yes = condition(step.condition)
          trace.push({ stepId: step.id, label, status: 'done', detail: yes ? 'Условие выполнено' : 'Условие не выполнено' })
          const active = yes ? step.then : step.else, skipped = yes ? step.else : step.then
          for (const item of builderV2WorkflowSteps(skipped)) trace.push({ stepId: item.id, label: builderV2StepLabel(item, tables, app.screens), status: 'skipped' })
          await run(active); continue
        }
        if (step.type === 'require') { if (!condition(step.condition)) throw new RowWriteError('invalid', step.message) }
        else if (step.type === 'create_row' || step.type === 'update_row') {
          const values = await builderV2WorkflowValues(meta, step.tableId, Object.fromEntries(Object.entries(step.values).map(([id, value]) => [id, resolve(value)])),options.published?{app,actor}:undefined), row = step.type === 'update_row' ? target(step.target) : undefined
          if (row && row.tableId !== step.tableId) throw new RowWriteError('denied', 'Запись относится к другой таблице')
          const stored = row ? await workingBuilderV2Record(write.tx, row.tableId, row.id, true) : undefined, current = stored ? options.published?{id:stored.id,tableId:stored.tableId,values:stored.data as Record<string,AppV2Json>}:await record(stored) : undefined
          const permission = authorizeAppV2Write(app, actor, current ? { operation: 'update', row: current, values } : { operation: 'create', tableId: step.tableId, values })
          if (!permission.ok) throw new RowWriteError('denied', permission.error)
          let id: string
          if (stored) { await updateRow(write, stored.tableId, stored.id, values, { id: userId, kind: options.published?'app_user':'member' }, { baseVersion: stored.version }); id = stored.id }
          else {id = (await createRow(write, step.tableId, { ...values, ...permission.ownerValues }, { id: userId, kind: options.published?'app_user':'member' },options.published?{origin:'runtime'}:undefined)).id;created.set(id,step.id)}
          const next = await record(await workingBuilderV2Record(write.tx, step.tableId, id))
          results.set(step.id, next)
          if (context.row?.id === id && context.row.tableId === step.tableId) context.row = next
          if (context.screenRow?.id === id && context.screenRow.tableId === step.tableId) context.screenRow = next
        } else if(step.type==='delete_row'){
          const row=target(step.target)
          if(row.tableId!==step.tableId)throw new RowWriteError('denied','Запись относится к другой таблице')
          const stored=await workingBuilderV2Record(write.tx,row.tableId,row.id,true)
          if(options.published&&!canReadPublishedV2Row(app,actor,stored as import('./runtime-project').RuntimeSourceRow))throw new RowWriteError('denied','Запись недоступна')
          const permission=authorizeAppV2Write(app,actor,{operation:'delete',row:{id:stored.id,tableId:stored.tableId,values:stored.data as Record<string,AppV2Json>}})
          if(!permission.ok)throw new RowWriteError('denied',permission.error)
          if((await dependentRows(stored.tableId,stored.id,write.tx,true))?.rows.length)throw new RowWriteError('invalid','У записи есть зависимые данные. Удаление доступно через соответствующий раздел учёта.')
          const safe=await record(stored),primary=meta.primaryByTable.get(stored.tableId),value=primary?safe.values[primary]:null
          const recordLabel=created.has(stored.id)?'Новая запись из этого действия':typeof value==='string'||typeof value==='number'?String(value).slice(0,200)||'Без названия':'Запись'
          deletions.push({stepId:step.id,tableId:stored.tableId,recordKey:created.has(stored.id)?`created:${created.get(stored.id)}`:stored.id,version:stored.version,recordLabel,tableName:tables.find(table=>table.id===stored.tableId)?.name??'Таблица'})
          await deleteRow(write,stored.tableId,stored.id,{id:userId,kind:options.published?'app_user':'member'},{baseVersion:stored.version});deleted.add(stored.id)
        } else if (step.type === 'notify') {
          const message = resolve(step.message)
          if (typeof message !== 'string' || !message.trim() || message.length > 1000) throw new RowWriteError('invalid', 'Сообщение должно содержать от 1 до 1000 символов')
          effects.push({ type: 'notify', message })
        } else if (step.type === 'open_url') {
          const url=appV2NavigationUrl(resolve(step.value))
          if(!url||url.length>4096)throw new RowWriteError('invalid','Укажите ссылку на страницу HTTP или HTTPS')
          effects.push({type:'open_url',url})
        } else if (step.type === 'copy_value') {
          const value=resolve(step.value)
          if(value===null||!['string','number','boolean'].includes(typeof value)||String(value)==='')throw new RowWriteError('invalid','Нечего копировать. Выберите заполненное поле.')
          if(String(value).length>10000)throw new RowWriteError('invalid','Для копирования выберите значение до 10 000 символов')
          effects.push({type:'copy_value',value:String(value)})
        } else if (step.type === 'go_back') {
          const home=app.screens.find(screen=>screen.id===app.homeScreenId&&!screen.contextTableId&&canOpenAppV2Screen(app,actor,screen.id))??app.screens.find(screen=>!screen.contextTableId&&canOpenAppV2Screen(app,actor,screen.id))
          if(!home)throw new RowWriteError('denied','Нет доступного экрана для возврата')
          effects.push({type:'go_back',screenId:home.id})
        } else if (step.type === 'open_screen') {
          const screen = app.screens.find(screen => screen.id === step.screenId), row = step.record ? target(step.record) : undefined
          if (!screen || !canOpenAppV2Screen(app, actor, screen.id) || screen.contextTableId !== (row?.tableId ?? null)) throw new RowWriteError('denied', 'Этот экран недоступен вашей роли или записи')
          if (row) {const stored=await workingBuilderV2Record(write.tx, row.tableId, row.id);if(options.published&&!canReadPublishedV2Row(app,actor,stored as import('./runtime-project').RuntimeSourceRow))throw new RowWriteError('denied','Запись недоступна')}
          effects.push({ type: 'open_screen', screenId: screen.id, ...(row ? { recordId: row.id } : {}) })
        } else throw new RowWriteError('invalid', 'Этот шаг пока не поддерживается')
        trace.push({ stepId: step.id, label, status: 'done',...(step.type==='copy_value'?{detail:'Значение подготовлено для копирования в браузере'}:step.type==='open_url'||step.type==='go_back'?{detail:'Переход подготовлен для браузера'}:{}) })
      } catch (error) { if (error instanceof BuilderV2WorkflowError) throw error; throw new BuilderV2WorkflowError(error, step.id, label, trace) }
    }
  }
  await run(flow.steps)
  const finalFailure=(message:string,conflict=false):never=>{throw new BuilderV2WorkflowError(new RowWriteError(conflict?'conflict':'invalid',message),all.at(-1)?.id??'finish','Завершить действие',trace)}
  if(effects.some(effect=>effect.type==='open_screen'&&effect.recordId&&deleted.has(effect.recordId)))finalFailure('Нельзя открыть удалённую запись. Выберите другой экран после удаления.')
  if(options.confirmation&&!deletions.length)finalFailure('Условия действия изменились. Обновите данные и запустите его заново.',true)
  if(deletions.length){
    const fingerprint=builderV2Revision(['workflow-delete',app.id,flow,actor,selected?[selected.id,selected.version]:null,screenInitial?.id,form?.values,deletions])
    if(options.confirmation!==fingerprint)throw new BuilderV2WorkflowConfirmationRequired({fingerprint,records:deletions.map(({tableName,recordLabel})=>({tableName,recordLabel}))})
    if(screenInitial&&deleted.has(screenInitial.id)&&!effects.some(effect=>['open_screen','go_back','open_url'].includes(effect.type))){const home=app.screens.find(screen=>screen.id===app.homeScreenId&&!screen.contextTableId&&canOpenAppV2Screen(app,actor,screen.id))??app.screens.find(screen=>!screen.contextTableId&&canOpenAppV2Screen(app,actor,screen.id));if(home)effects.push({type:'open_screen',screenId:home.id})}
  }
  const primary = primaryStepId ? results.get(primaryStepId) : context.row ?? results.values().next().value
  if (primaryStepId && !primary) throw new RowWriteError('invalid', 'Действие не сохранило форму')
  return { ...(primary ? { rowId: primary.id, tableId: primary.tableId } : {}), effects, trace }
}
