'use client'
import { isComputed } from '@tableapp/schema'
import type { AppV2, AppV2Binding } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { BUILDER_V2_FORM_TYPES, builderV2FormInputs, type BuilderV2Input } from '@/lib/builder-v2-form-types'
import ui from './view.module.css'
import { nodeContext } from './model'

export function BuilderV2InputSettings({ app, input, screenId, tables, onChange }: { app: AppV2; input: BuilderV2Input; screenId: string; tables: readonly BuilderV2Table[]; onChange: (input: BuilderV2Input) => void }) {
  const context = nodeContext(app, screenId, input.id), form = app.nodes.find(node => node.id === context.formId), screen = app.screens.find(screen => screen.id === screenId)
  const table = tables.find(table => table.id === (form?.type === 'form' ? form.tableId : null)), field = table?.fields.find(field => field.id === input.fieldId), screenTable = tables.find(table => table.id === screen?.contextTableId)
  const used = new Set(form?.type === 'form' ? builderV2FormInputs(app, form).filter(node => node.id !== input.id).map(node => node.fieldId) : [])
  const value = input.initialValue, scalar = Boolean(field && ['text', 'long_text', 'email', 'phone', 'url'].includes(field.type)), linked = field?.type === 'relation' && field.relationTableId === screenTable?.id
  const source = !value ? 'empty' : value.kind === 'literal' ? 'literal' : value.kind === 'record_ids' && value.record.kind === 'screen' ? 'record' : value.kind === 'user' ? 'user' : value.kind === 'screen_row' ? 'field' : 'custom'
  const initial = (initialValue: AppV2Binding | null) => onChange({ ...input, initialValue })
  const changeSource = (kind: string) => {
    if (kind === 'empty') initial(null)
    else if (kind === 'record' && screenTable) onChange({ ...input, readOnly: true, initialValue: { kind: 'record_ids', tableId: screenTable.id, record: { kind: 'screen' } } })
    else if (kind === 'user') initial({ kind: 'user', property: 'email' })
    else if (kind === 'field' && screenTable?.fields.length) { const match = screenTable.fields.find(candidate => candidate.type === field?.type); if (match) initial({ kind: 'screen_row', fieldId: match.id }) }
    else initial({ kind: 'literal', value: field?.type === 'number' ? null : field?.type === 'checkbox' ? false : field?.type === 'multi_select' ? [] : '' })
  }
  const matching = screenTable?.fields.filter(candidate => candidate.type === field?.type) ?? []
  return <>
    <label>Поле таблицы<select value={input.fieldId} onChange={event => { const next = table?.fields.find(field => field.id === event.target.value); if (next) onChange({ ...input, fieldId: next.id, name: next.name, label: next.name, initialValue: null, readOnly: false }) }}>{table?.fields.filter(field => field.id === input.fieldId || !isComputed(field.type) && !used.has(field.id) && BUILDER_V2_FORM_TYPES.includes(field.type)).map(field => <option value={field.id} key={field.id}>{field.name}</option>)}</select></label>
    {form?.type === 'form' && form.mode === 'edit' ? <p className={ui.hint}>При открытии формы подставится текущее значение записи.</p> : <>
      <label>Начальное значение<select value={source} onChange={event => changeSource(event.target.value)}><option value="empty">Без начального значения</option>{field && !['relation', 'attachment', 'image', 'member'].includes(field.type) && <option value="literal">Задать значение</option>}{linked && <option value="record">Открытая запись: {screenTable?.name}</option>}{scalar && <option value="user">Данные пользователя</option>}{matching.length > 0 && !['relation','image','attachment'].includes(field?.type??'') && <option value="field">Поле открытой записи</option>}{source === 'custom' && <option value="custom" disabled>Настроенное значение</option>}</select></label>
      {value?.kind === 'literal' && field && (field.type === 'single_select' || field.type === 'multi_select' ? <label>Значение<select multiple={field.type === 'multi_select'} value={field.type === 'multi_select' ? Array.isArray(value.value) ? value.value as string[] : [] : String(value.value ?? '')} onChange={event => initial({ kind: 'literal', value: field.type === 'multi_select' ? Array.from(event.target.selectedOptions).map(option => option.value) : event.target.value || null })}>{field.type === 'single_select' && <option value="">Не выбрано</option>}{field.choices?.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label> : field.type === 'checkbox' ? <label>Значение<select value={String(value.value === true)} onChange={event => initial({ kind: 'literal', value: event.target.value === 'true' })}><option value="false">Нет</option><option value="true">Да</option></select></label> : <label>Значение<input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={String(value.value ?? '')} maxLength={10000} onChange={event => initial({ kind: 'literal', value: field.type === 'number' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value })} /></label>)}
      {value?.kind === 'user' && <label>Что подставить<select value={value.property} onChange={event => initial({ kind: 'user', property: event.target.value as 'email' | 'id' | 'name' | 'company' })}><option value="email">Почту пользователя</option><option value="name">Имя пользователя</option><option value="id">Идентификатор пользователя</option><option value="company">Организацию пользователя</option></select></label>}
      {value?.kind === 'screen_row' && <label>Поле открытой записи<select value={value.fieldId} onChange={event => initial({ kind: 'screen_row', fieldId: event.target.value })}>{matching.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>}
    </>}
    <label className={ui.inlineCheck}><input type="checkbox" checked={Boolean(input.readOnly)} onChange={event => onChange({ ...input, readOnly: event.target.checked })} />Не разрешать менять значение</label>
  </>
}
