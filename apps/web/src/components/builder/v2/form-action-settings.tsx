'use client'
import type { AppV2 } from '@tableapp/schema/app-v2'
import { useState } from 'react'
import type { BuilderV2Form } from '@/lib/builder-v2-form-types'
import { builderV2SaveFormAction, builderV2FormSaveWorkflow } from '@/lib/builder-v2-form-action'
import ui from './view.module.css'
import styles from '../prototype/prototype.module.css'
import type { BuilderV2Table } from '@/lib/builder-v2'
import type { BuilderV2Workflow } from '@/lib/builder-v2-workflow-types'
import { BuilderV2WorkflowEditor } from './workflow-editor'
import { BuilderV2WorkflowHistory } from './workflow-history'

export function BuilderV2FormActionSettings({ app, form, tables, onConfigure, onOpen, onWorkflow }: { app: AppV2; form: BuilderV2Form; tables: readonly BuilderV2Table[]; onConfigure: (roles: string[] | null) => void; onOpen: () => void; onWorkflow?: (flow: BuilderV2Workflow) => string | null }) {
  const [stepsOpen, setStepsOpen] = useState(false), [historyOpen, setHistoryOpen] = useState(false)
  const action = builderV2FormSaveWorkflow(app, form), ready = builderV2SaveFormAction(app, form)
  const roles = action ? [...new Set(app.policy.workflows.filter(grant => grant.workflowId === action.flow.id && grant.audience.kind === 'roles').flatMap(grant => grant.audience.kind === 'roles' ? grant.audience.roleIds : []))] : []
  if (form.events.submit && !action) return <p className={ui.hint}>В действии есть шаг, который пока недоступен в рабочей форме. Описание сохранено без изменений.</p>
  return <section className={ui.formActionSettings} aria-label="Сохранение формы">
    <label>После отправки<select value={action ? 'save' : 'check'} disabled={!app.roles.length} onChange={event => onConfigure(event.target.value === 'save' ? [app.roles.find(role => role.id === 'owner')?.id ?? app.roles[0]!.id] : null)}><option value="check">Только проверка</option><option value="save">{form.mode === 'edit' ? 'Сохранить изменения записи' : 'Создать запись в таблице'}</option></select></label>
    {action && <><fieldset><legend>{form.mode === 'edit' ? 'Кто может изменять записи' : 'Кто может добавлять записи'}</legend>{app.roles.map(role => <label className={ui.inlineCheck} key={role.id}><input type="checkbox" checked={roles.includes(role.id)} onChange={event => { const next = event.target.checked ? [...roles, role.id] : roles.filter(id => id !== role.id); onConfigure(next.length ? next : null) }} />{role.name}</label>)}</fieldset>
    {!ready && <><p className={ui.hint}>Поля формы изменились. Подключите их к сохранению.</p><button type="button" className={styles.secondary} onClick={() => onConfigure(roles)}>Подключить поля</button></>}
    <button type="button" disabled={!ready} className={styles.secondary} onClick={onOpen}>Открыть рабочую форму</button>
    {ready && onWorkflow && <button type="button" className={styles.secondary} onClick={() => setStepsOpen(true)}>Настроить шаги ({action.flow.steps.length})</button>}
    <button type="button" className={styles.textButton} onClick={() => setHistoryOpen(true)}>История выполнений</button>
    <p className={ui.hint}>После публикации пользователи с выбранной ролью смогут сохранять данные этой формы в таблицу.</p>
    <p className={ui.hint}>Чтобы заменить подключённое поле, сначала выберите «Только проверка».</p></>}
    {stepsOpen && ready && onWorkflow && <BuilderV2WorkflowEditor app={app} form={form} tables={tables} onSave={onWorkflow} onClose={() => setStepsOpen(false)} />}
    {historyOpen && <BuilderV2WorkflowHistory appId={app.id} onClose={() => setHistoryOpen(false)} />}
  </section>
}
