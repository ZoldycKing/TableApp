'use client'
import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import ui from './view.module.css'
import { CalendarSettingsStack } from './team-calendar-setting-controls'
import { SettingSwitch } from './setting-switch'

type Node = Extract<AppV2Node, { type: 'team_calendar' }>

const actions = [
  ['itemScreenId', 'Нажатие на запись'],
  ['createScreenId', 'Добавить запись'],
  ['configureScreenId', 'Настроить рабочие часы'],
  ['periodScreenId', 'Изменить рабочий период'],
] as const

export function CalendarActionSettings({
  app, node, onChange,
}: {
  app: AppV2
  node: Node
  onChange: (node: Node) => void
}) {
  const contextFor = (key: typeof actions[number][0]) => {
    if (key === 'itemScreenId') return node.data?.tableId ?? null
    if (key === 'periodScreenId') return node.data?.hours?.tableId ?? null
    return null
  }
  return (
    <CalendarSettingsStack>
      {actions.map(([key, label]) => (
        <label key={key}>
          {label}
          <select value={node.actions[key] ?? ''} onChange={event => onChange({ ...node, actions: { ...node.actions, [key]: event.target.value || null } })}>
            <option value="">Без действия</option>
            {app.screens.filter(screen => (screen.contextTableId ?? null) === contextFor(key)).map(screen => (
              <option key={screen.id} value={screen.id}>{screen.name}</option>
            ))}
          </select>
        </label>
      ))}
      <SettingSwitch
        label="Перенос записи мышью"
        checked={node.actions.allowMove !== false}
        onChange={allowMove => onChange({ ...node, actions: { ...node.actions, allowMove } })}
      />
      <fieldset>
        <legend>Кто может добавлять записи и менять часы</legend>
        {app.roles.map(role => (
          <label key={role.id}>
            <input
              type="checkbox"
              checked={node.actions.manageRoleIds.includes(role.id)}
              onChange={event => onChange({
                ...node,
                actions: {
                  ...node.actions,
                  manageRoleIds: event.target.checked
                    ? [...node.actions.manageRoleIds, role.id]
                    : node.actions.manageRoleIds.filter(id => id !== role.id),
                },
              })}
            />
            {role.name}
          </label>
        ))}
      </fieldset>
      <p className={ui.hint}>Календарь открывает выбранные экраны. Формы сохраняют данные по своим действиям и правам доступа. Перенос на компьютере можно выключить: тогда запись двигается только через форму.</p>
    </CalendarSettingsStack>
  )
}
