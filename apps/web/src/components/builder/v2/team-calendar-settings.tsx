'use client'
import { useState } from 'react'
import type { AppV2, AppV2Node, AppV2TeamCalendarData } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'
import ui from './view.module.css'
import { CalendarDataSettings } from './team-calendar-data-settings'
import { CalendarHoursSettings } from './team-calendar-hours-settings'
import { CalendarActionSettings } from './team-calendar-action-settings'
import { teamCalendarDefaults, weekdayValues } from './team-calendar-setting-controls'

type Node = Extract<AppV2Node, { type: 'team_calendar' }>

export { teamCalendarDefaults }

export function TeamCalendarSettings({
  app, node, tables, onChange,
}: {
  app: AppV2
  node: Node
  tables: readonly BuilderV2Table[]
  onChange: (node: Node) => void
}) {
  const [tab, setTab] = useState('data')
  const [notice, setNotice] = useState('')
  const data = node.data
  const update = (patch: Partial<AppV2TeamCalendarData>) => {
    if (data) onChange({ ...node, data: { ...data, ...patch } })
  }
  return (
    <section aria-label="Настройки календаря команды">
      <div className={`${ui.inspectorTabs} ${ui.calendarTabs}`} role="group" aria-label="Настройки календаря">
        {([['data', 'Данные'], ['hours', 'Часы'], ['view', 'Вид'], ['actions', 'Действия']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {notice && <p className={ui.hint} role="status">{notice}</p>}
      {tab === 'data' && (
        <CalendarDataSettings
          node={node}
          tables={tables}
          onChange={onChange}
          onNotice={setNotice}
        />
      )}
      {tab === 'hours' && <CalendarHoursSettings data={data} tables={tables} onUpdate={update} />}
      {tab === 'view' && (
        <div className={ui.calendarSettings}>
          <label>Один сотрудник<input value={node.resourceLabel} maxLength={40} onChange={event => onChange({ ...node, resourceLabel: event.target.value })} /></label>
          <label>Вся команда<input value={node.resourcesLabel} maxLength={40} onChange={event => onChange({ ...node, resourcesLabel: event.target.value })} /></label>
          <label><input type="checkbox" checked={node.showMetrics} onChange={event => onChange({ ...node, showMetrics: event.target.checked })} />Показывать показатели</label>
        </div>
      )}
      {tab === 'actions' && <CalendarActionSettings app={app} node={node} onChange={onChange} />}
    </section>
  )
}

export { weekdayValues }
