'use client'
import type { AppV2TeamCalendarData } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import ui from './view.module.css'
import { CalendarField, CalendarSettingsStack, CalendarViewField, calendarWeekNames, weekdayValues } from './team-calendar-setting-controls'

export function CalendarHoursSettings({
  data, tables, onUpdate,
}: {
  data: AppV2TeamCalendarData | null
  tables: readonly BuilderV2Table[]
  onUpdate: (patch: Partial<AppV2TeamCalendarData>) => void
}) {
  const resources = tables.find(item => item.id === data?.resources.tableId)
  const hours = tables.find(item => item.id === data?.hours?.tableId)
  const selectHours = (id: string) => {
    const table = tables.find(item => item.id === id)
    const relation = table?.fields.find(field => field.type === 'relation' && field.relationTableId === resources?.id)
    const text = table?.fields.filter(field => field.type === 'text') ?? []
    if (!table || !relation || text.length < 2) {
      onUpdate({ hours: null })
      return
    }
    const start = text.find(field => /начал|start/i.test(field.name)) ?? text[0]!
    const end = text.find(field => field.id !== start.id && /конец|оконч|end/i.test(field.name)) ?? text.find(field => field.id !== start.id)!
    const weekday = table.fields.find(field => /день недели|weekday/i.test(field.name) && ['text', 'number', 'single_select'].includes(field.type))
    const date = table.fields.find(field => field.type === 'date')
    onUpdate({
      hours: {
        tableId: id,
        viewId: null,
        resourceFieldId: relation.id,
        startFieldId: start.id,
        endFieldId: end.id,
        weekdayFieldId: weekday?.id ?? null,
        dateFieldId: date?.id ?? null,
        closedFieldId: table.fields.find(field => field.type === 'checkbox')?.id ?? null,
        weekdays: weekdayValues(weekday),
      },
    })
  }
  if (!data) return <p className={ui.hint}>Сначала выберите таблицу записей.</p>
  const candidates = tables.filter(table =>
    table.fields.some(field => field.type === 'relation' && field.relationTableId === resources?.id)
    && table.fields.filter(field => field.type === 'text').length >= 2
    && table.fields.some(field => field.type === 'date' || /день недели|weekday/i.test(field.name)),
  )
  return (
    <CalendarSettingsStack>
      <label>
        Таблица рабочих часов
        <select value={data.hours?.tableId ?? ''} onChange={event => selectHours(event.target.value)}>
          <option value="">Без рабочих часов</option>
          {candidates.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}
        </select>
      </label>
      {data.hours && (
        <fieldset>
          <legend>Рабочие часы</legend>
          <CalendarViewField table={hours} value={data.hours.viewId} onChange={id => onUpdate({ hours: { ...data.hours!, viewId: id } })} />
          <CalendarField label="Сотрудник в рабочих часах" value={data.hours.resourceFieldId} fields={hours?.fields.filter(field => field.type === 'relation' && field.relationTableId === resources?.id)} onChange={id => onUpdate({ hours: { ...data.hours!, resourceFieldId: id } })} />
          <CalendarField label="Начало работы (ЧЧ:ММ)" value={data.hours.startFieldId} fields={hours?.fields.filter(field => field.type === 'text')} onChange={id => onUpdate({ hours: { ...data.hours!, startFieldId: id } })} />
          <CalendarField label="Окончание работы (ЧЧ:ММ)" value={data.hours.endFieldId} fields={hours?.fields.filter(field => field.type === 'text')} onChange={id => onUpdate({ hours: { ...data.hours!, endFieldId: id } })} />
          <CalendarField
            label="День недели"
            value={data.hours.weekdayFieldId}
            fields={hours?.fields.filter(field => ['single_select', 'text', 'number'].includes(field.type))}
            optional
            onChange={id => onUpdate({ hours: { ...data.hours!, weekdayFieldId: id || null, weekdays: weekdayValues(hours?.fields.find(field => field.id === id)) } })}
          />
          {data.hours.weekdayFieldId && [1, 2, 3, 4, 5, 6, 0].map(index => {
            const field = hours?.fields.find(item => item.id === data.hours!.weekdayFieldId)
            const change = (next: string) => onUpdate({
              hours: { ...data.hours!, weekdays: data.hours!.weekdays.map((value, i) => i === index ? next : value) },
            })
            return (
              <label key={index}>
                {calendarWeekNames[index]}
                {field?.choices ? (
                  <select aria-label={`Значение дня: ${calendarWeekNames[index]}`} value={data.hours!.weekdays[index]} onChange={event => change(event.target.value)}>
                    <option value="">Выберите вариант</option>
                    {field.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
                  </select>
                ) : (
                  <input aria-label={`Значение дня: ${calendarWeekNames[index]}`} value={data.hours!.weekdays[index]} onChange={event => change(event.target.value)} />
                )}
              </label>
            )
          })}
          <CalendarField label="Отдельная дата" value={data.hours.dateFieldId} fields={hours?.fields.filter(field => field.type === 'date')} optional onChange={id => onUpdate({ hours: { ...data.hours!, dateFieldId: id || null } })} />
          <CalendarField label="Выходной" value={data.hours.closedFieldId} fields={hours?.fields.filter(field => field.type === 'checkbox')} optional onChange={id => onUpdate({ hours: { ...data.hours!, closedFieldId: id || null } })} />
        </fieldset>
      )}
    </CalendarSettingsStack>
  )
}
