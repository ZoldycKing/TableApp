'use client'

import type { App, Component, Screen } from '@tableapp/schema'
import { PartAccess } from './part-access'

/** Кому положен компонент карточки или формы. Общая часть — в `PartAccess`. */
export function ComponentAccess({
  app,
  screen,
  component,
  onChange,
}: {
  app: App
  screen: Screen
  component: Component
  onChange: (component: Component) => void
}) {
  const hint =
    component.type === 'form_field'
      ? 'Остальные роли не смогут записать это поле — даже запросом мимо приложения: сервер его не примет.'
      : component.type === 'field'
        ? 'Остальным ролям значение этого поля не придёт в браузер вовсе, а не спрячется в интерфейсе.'
        : undefined

  return (
    <PartAccess
      app={app}
      screenRoles={screen.access.roles}
      roles={component.roles}
      hint={hint}
      onChange={(roles) => onChange({ ...component, roles } as Component)}
    />
  )
}
