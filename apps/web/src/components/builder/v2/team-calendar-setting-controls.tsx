'use client'
import type { ReactNode } from 'react'
import type { AppV2TeamCalendarData } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import ui from './view.module.css'

const numberTypes = ['number', 'formula', 'rollup']

export function teamCalendarDefaults(table: BuilderV2Table, tables: readonly BuilderV2Table[]): AppV2TeamCalendarData | null {
  const start = table.fields.find(field => field.type === 'datetime')
  const end = table.fields.find(field => field.type === 'datetime' && field.id !== start?.id)
  const duration = table.fields.find(field => numberTypes.includes(field.type) && /длит|минут|duration|minutes/i.test(field.name))
    ?? table.fields.find(field => numberTypes.includes(field.type))
  const relations = table.fields.filter(field => field.type === 'relation' && tables.some(item => item.id === field.relationTableId))
  const relation = relations.find(field => /мастер|сотрудник|исполн|ответств|employee|staff|resource/i.test(field.name)) ?? relations[0]
  const resources = tables.find(item => item.id === relation?.relationTableId)
  if (!start || !resources || !relation || (!end && !duration) || !resources.fields.length) return null
  const title = table.fields.find(field => /услуга|название|name|title|событие/i.test(field.name))
    ?? table.fields.find(field => field.id === table.primaryFieldId)
    ?? table.fields[0]!
  return {
    tableId: table.id,
    viewId: null,
    titleFieldId: title.id,
    subtitleFieldId: null,
    startFieldId: start.id,
    endFieldId: end?.id ?? null,
    durationFieldId: end ? null : duration!.id,
    resourceFieldId: relation.id,
    statusFieldId: table.fields.find(field => field.type === 'single_select')?.id ?? null,
    amountFieldId: null,
    statusValues: {},
    resources: {
      tableId: resources.id,
      viewId: null,
      titleFieldId: resources.primaryFieldId ?? resources.fields[0]!.id,
      photoFieldId: resources.fields.find(field => field.type === 'image')?.id ?? null,
      ownerEmailFieldId: null,
    },
    hours: null,
  }
}

export const calendarWeekNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

export function weekdayValues(field: BuilderV2Table['fields'][number] | undefined) {
  return calendarWeekNames.map((name, index) => {
    const choice = field?.choices?.find(item =>
      item.name.toLocaleLowerCase('ru-RU').startsWith(name.slice(0, 3).toLocaleLowerCase('ru-RU')),
    )
    if (choice) return choice.id
    if (field?.choices?.length) return ''
    if (field?.type === 'number') return String(index)
    return name
  })
}

export function CalendarSettingsStack({ children }: { children: ReactNode }) {
  return <div className={ui.calendarSettings}>{children}</div>
}

export function CalendarField({
  label, value, fields, onChange, optional = false,
}: {
  label: string
  value: string | null | undefined
  fields: BuilderV2Table['fields'] | undefined
  onChange: (id: string) => void
  optional?: boolean
}) {
  return (
    <label>
      {label}
      <select value={value ?? ''} onChange={event => onChange(event.target.value)}>
        {optional && <option value="">Не использовать</option>}
        {fields?.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}
      </select>
    </label>
  )
}

export function CalendarViewField({
  table, value, onChange,
}: {
  table: BuilderV2Table | undefined
  value: string | null
  onChange: (id: string | null) => void
}) {
  return (
    <label>
      Представление
      <select value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
        <option value="">Все доступные записи</option>
        {table?.views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
      </select>
    </label>
  )
}
