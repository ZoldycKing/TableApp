'use client'
import type { AppV2Node, AppV2TeamCalendarData } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import ui from './view.module.css'
import { CalendarField, CalendarSettingsStack, CalendarViewField, teamCalendarDefaults } from './team-calendar-setting-controls'

type Node = Extract<AppV2Node, { type: 'team_calendar' }>
const numberTypes = ['number', 'formula', 'rollup']
const statusLabels = [
  ['booked', 'Предстоит'],
  ['arrived', 'Пришёл'],
  ['completed', 'Завершено'],
  ['noShow', 'Неявка'],
  ['cancelled', 'Отменено'],
] as const

export function CalendarDataSettings({
  node, tables, onChange, onNotice,
}: {
  node: Node
  tables: readonly BuilderV2Table[]
  onChange: (node: Node) => void
  onNotice: (message: string) => void
}) {
  const data = node.data
  const table = tables.find(item => item.id === data?.tableId)
  const resources = tables.find(item => item.id === data?.resources.tableId)
  const update = (patch: Partial<AppV2TeamCalendarData>) => {
    if (data) onChange({ ...node, data: { ...data, ...patch } })
  }
  const relationFields = table?.fields.filter(field => field.type === 'relation' && tables.some(item => item.id === field.relationTableId))
  const chooseResource = (id: string) => {
    if (!data) return
    const relation = relationFields?.find(field => field.id === id)
    const resource = tables.find(item => item.id === relation?.relationTableId)
    if (!resource?.fields.length) return
    const same = resource.id === data.resources.tableId
    if (!same) onNotice('Таблица сотрудников изменилась. Почта, фото и рабочие часы нужно выбрать заново.')
    const keep = (fieldId: string | null) => same && Boolean(fieldId && resource.fields.some(field => field.id === fieldId))
    update({
      resourceFieldId: id,
      resources: {
        tableId: resource.id,
        viewId: same ? data.resources.viewId : null,
        titleFieldId: keep(data.resources.titleFieldId) ? data.resources.titleFieldId : resource.primaryFieldId ?? resource.fields[0]!.id,
        photoFieldId: keep(data.resources.photoFieldId) ? data.resources.photoFieldId : null,
        ownerEmailFieldId: keep(data.resources.ownerEmailFieldId) ? data.resources.ownerEmailFieldId : null,
      },
      hours: same ? data.hours : null,
    })
  }
  return (
    <CalendarSettingsStack>
      <label>
        Таблица записей
        <select value={data?.tableId ?? ''} onChange={event => {
          const next = tables.find(item => item.id === event.target.value)
          if (next) onChange({ ...node, data: teamCalendarDefaults(next, tables) })
        }}>
          <option value="" disabled>Выберите таблицу</option>
          {tables.filter(item => teamCalendarDefaults(item, tables)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {!data && <p className={ui.hint}>Нужна таблица с датой и временем, окончанием или длительностью в минутах и связью с таблицей сотрудников.</p>}
      {data && (
        <>
          <CalendarViewField table={table} value={data.viewId} onChange={id => update({ viewId: id })} />
          <CalendarField label="Название записи" value={data.titleFieldId} fields={table?.fields} onChange={id => update({ titleFieldId: id })} />
          <CalendarField label="Подпись" value={data.subtitleFieldId} fields={table?.fields} optional onChange={id => update({ subtitleFieldId: id || null })} />
          <CalendarField label="Начало" value={data.startFieldId} fields={table?.fields.filter(field => field.type === 'datetime')} onChange={id => update({ startFieldId: id })} />
          <label>
            Как задаётся окончание
            <select
              value={data.endFieldId ? 'end' : 'duration'}
              onChange={event => update(event.target.value === 'end'
                ? { endFieldId: table?.fields.find(field => field.type === 'datetime' && field.id !== data.startFieldId)?.id ?? data.startFieldId, durationFieldId: null }
                : { endFieldId: null, durationFieldId: table?.fields.find(field => numberTypes.includes(field.type))?.id ?? null })}
            >
              <option value="duration" disabled={!table?.fields.some(field => numberTypes.includes(field.type))}>Длительность в минутах</option>
              <option value="end" disabled={(table?.fields.filter(field => field.type === 'datetime').length ?? 0) < 2}>Дата и время окончания</option>
            </select>
          </label>
          {data.endFieldId
            ? <CalendarField label="Окончание" value={data.endFieldId} fields={table?.fields.filter(field => field.type === 'datetime')} onChange={id => update({ endFieldId: id })} />
            : <CalendarField label="Длительность, минуты" value={data.durationFieldId} fields={table?.fields.filter(field => numberTypes.includes(field.type))} onChange={id => update({ durationFieldId: id })} />}
          <CalendarField label="Связь с сотрудником" value={data.resourceFieldId} fields={relationFields} onChange={chooseResource} />
          <fieldset>
            <legend>Сотрудники · {resources?.name}</legend>
            <CalendarViewField table={resources} value={data.resources.viewId} onChange={id => update({ resources: { ...data.resources, viewId: id } })} />
            <CalendarField label="Имя сотрудника" value={data.resources.titleFieldId} fields={resources?.fields} onChange={id => update({ resources: { ...data.resources, titleFieldId: id } })} />
            <CalendarField label="Фото сотрудника" value={data.resources.photoFieldId} fields={resources?.fields.filter(field => field.type === 'image' || field.type === 'url')} optional onChange={id => update({ resources: { ...data.resources, photoFieldId: id || null } })} />
            <CalendarField label="Показывать сотруднику только себя — поле почты" value={data.resources.ownerEmailFieldId} fields={resources?.fields.filter(field => field.type === 'email')} optional onChange={id => update({ resources: { ...data.resources, ownerEmailFieldId: id || null } })} />
          </fieldset>
          <CalendarField label="Статус" value={data.statusFieldId} fields={table?.fields.filter(field => field.type === 'single_select')} optional onChange={id => update({ statusFieldId: id || null, statusValues: {} })} />
          {data.statusFieldId && (
            <fieldset>
              <legend>Значения статусов</legend>
              {statusLabels.map(([key, label]) => (
                <label key={key}>
                  {label}
                  <select value={data.statusValues[key] ?? ''} onChange={event => update({ statusValues: { ...data.statusValues, [key]: event.target.value || undefined } })}>
                    <option value="">Не использовать</option>
                    {table?.fields.find(field => field.id === data.statusFieldId)?.choices?.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
                  </select>
                </label>
              ))}
            </fieldset>
          )}
          <CalendarField label="Стоимость" value={data.amountFieldId} fields={table?.fields.filter(field => numberTypes.includes(field.type))} optional onChange={id => update({ amountFieldId: id || null })} />
        </>
      )}
    </CalendarSettingsStack>
  )
}
