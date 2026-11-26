'use client'
import { PEOPLE, STATUSES, STEP_NAMES, uid, type Document, type Flow, type Step } from './model'
import { FieldSelect } from './inspector'
import { ProtoIcon } from './icons'
import styles from './prototype.module.css'

export function PrototypeWorkflows({ document, flowId, onSelect, onUpdate, onCreate }: { document: Document; flowId: string; onSelect: (id: string) => void; onUpdate: (flow: Flow) => void; onCreate: () => void }) {
  const flow = document.flows.find(item => item.id === flowId) ?? document.flows[0]
  const add = (type: Step['type']) => {
    if (!flow || flow.steps.length >= 20) return
    const id = uid()
    const step: Step = type === 'require' ? { id, type, field: 'title', message: 'Заполните название.' } : type === 'update' ? { id, type, field: 'status', value: 'Готово' } : type === 'navigate' ? { id, type, pageId: document.home } : type === 'create' ? { id, type } : { id, type, text: type === 'notify' ? 'Действие выполнено' : 'Данные обновлены' }
    onUpdate({ ...flow, steps: [...flow.steps, step] })
  }
  const change = (index: number, step: Step) => { if (flow) onUpdate({ ...flow, steps: flow.steps.map((item, i) => i === index ? step : item) }) }
  const move = (index: number, direction: number) => {
    if (!flow || index + direction < 0 || index + direction >= flow.steps.length) return
    const steps = [...flow.steps]; [steps[index], steps[index + direction]] = [steps[index + direction]!, steps[index]!]; onUpdate({ ...flow, steps })
  }
  return <div className={styles.workflowWorkspace}><aside className={styles.sidebar}><div className={styles.panelHeading}><h2>Действия</h2><button type="button" aria-label="Добавить действие" className={styles.iconButton} onClick={onCreate}><ProtoIcon name="plus" /></button></div>
    {document.flows.map(item => <button key={item.id} type="button" className={styles.treePage} aria-current={item.id === flow?.id ? 'true' : undefined} onClick={() => onSelect(item.id)}><ProtoIcon name="action" /><span>{item.name}</span></button>)}
  </aside><main id="builder-main" className={styles.workflowMain}>{flow ? <div className={styles.flowContent}><div className={styles.flowTitle}><span className={styles.overline}>Действие</span><input aria-label="Название действия" value={flow.name} onChange={event => onUpdate({ ...flow, name: event.target.value })} /></div>
    <div className={styles.trigger}><span className={styles.elementMark}><ProtoIcon name="action" /></span><div><strong>Когда запускают действие</strong><p>Кнопка или форма, для которой оно выбрано</p></div></div>
    <ol className={styles.steps}>{flow.steps.map((step, index) => <li key={step.id}><span className={styles.stepNumber}>{index + 1}</span><article className={styles.stepCard}><header><h3>{STEP_NAMES[step.type]}</h3><div><button type="button" aria-label={`Поднять шаг ${index + 1}`} className={styles.iconButton} disabled={index === 0} onClick={() => move(index, -1)}><ProtoIcon name="up" size={16} /></button><button type="button" aria-label={`Опустить шаг ${index + 1}`} className={styles.iconButton} disabled={index === flow.steps.length - 1} onClick={() => move(index, 1)}><ProtoIcon name="down" size={16} /></button><button type="button" aria-label={`Удалить шаг ${index + 1}`} className={styles.iconButton} onClick={() => onUpdate({ ...flow, steps: flow.steps.filter((_, i) => i !== index) })}><ProtoIcon name="trash" size={16} /></button></div></header>
      {step.type === 'require' && <><FieldSelect label="Поле должно быть заполнено" value={step.field} onChange={field => change(index, { ...step, field })} /><label>Иначе остановиться и показать<input value={step.message} onChange={event => change(index, { ...step, message: event.target.value })} /></label></>}
      {step.type === 'update' && <div className={styles.stepFields}><FieldSelect value={step.field} onChange={field => change(index, { ...step, field, value: field === 'status' ? 'Готово' : field === 'assignee' ? '@me' : '' })} /><label>Новое значение{step.field === 'status' ? <select value={step.value} onChange={event => change(index, { ...step, value: event.target.value })}>{STATUSES.map(value => <option key={value}>{value}</option>)}</select> : step.field === 'assignee' ? <select value={step.value} onChange={event => change(index, { ...step, value: event.target.value })}><option value="@me">Текущий сотрудник</option>{PEOPLE.map(value => <option key={value}>{value}</option>)}</select> : <input value={step.value} onChange={event => change(index, { ...step, value: event.target.value })} />}</label></div>}
      {step.type === 'create' && <p className={styles.help}>Добавить в выбранную таблицу значения, введённые в форме.</p>}
      {(step.type === 'history' || step.type === 'notify') && <label>Текст<input value={step.text} onChange={event => change(index, { ...step, text: event.target.value })} /></label>}
      {step.type === 'navigate' && <label>Экран<select value={step.pageId} onChange={event => change(index, { ...step, pageId: event.target.value })}>{document.pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}</select></label>}
    </article></li>)}</ol>
    <label className={styles.addStep}>Добавить шаг<select aria-label="Добавить шаг" value="" onChange={event => { if (event.target.value) add(event.target.value as Step['type']) }} disabled={flow.steps.length >= 20}><option value="">Выберите, что сделать</option>{Object.entries(STEP_NAMES).map(([type, name]) => <option value={type} key={type}>{name}</option>)}</select></label>
  </div> : <div className={styles.empty}>Добавьте действие, затем выберите его для кнопки.</div>}</main></div>
}
