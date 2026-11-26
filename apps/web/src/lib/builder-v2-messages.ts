import { MESSAGES_SCREEN } from '@/lib/conversation-types'
import type { AppV2, AppV2Actor } from '@tableapp/schema/app-v2'

export { MESSAGES_SCREEN }

/** Inbox tab for App V2 service/support/prokat kits with an authenticated visitor. */
export function v2MessagesAvailable(app: Pick<AppV2, 'service' | 'support' | 'prokat'>, actor: Pick<AppV2Actor, 'authenticated'>) {
  return Boolean(actor.authenticated && (app.service || app.support || app.prokat))
}

export function v2MessagesOperator(actor: Pick<AppV2Actor, 'roleIds'>) {
  return actor.roleIds.some(id => id === 'owner' || id === 'staff')
}

export function v2MessagesLabel(actor: Pick<AppV2Actor, 'roleIds'>) {
  return v2MessagesOperator(actor) ? 'Сообщения' : 'Чат'
}

/** Virtual nav screen injected into the published frame; not stored in the schema. */
export function v2MessagesScreen(app: AppV2, actor: AppV2Actor): AppV2['screens'][number] {
  const label = v2MessagesLabel(actor)
  return {
    id: MESSAGES_SCREEN,
    name: label,
    menuLabel: label,
    icon: 'chat',
    navigation: true,
    audience: { kind: 'roles', roleIds: [...actor.roleIds] },
    contextTableId: null,
    rootIds: [],
    events: { enter: null },
  }
}

export function withV2MessagesNav(app: AppV2, actor: AppV2Actor): AppV2 {
  if (!v2MessagesAvailable(app, actor)) return app
  if (app.screens.some(screen => screen.id === MESSAGES_SCREEN)) return app
  const tab = v2MessagesScreen(app, actor)
  // After the five desk tabs so the phone bar keeps Клиенты visible: Главная, Брони, Занятость, Предметы, Клиенты.
  if (app.prokat && v2MessagesOperator(actor)) {
    const after = app.prokat.clientsScreenId
    const index = app.screens.findIndex(screen => screen.id === after)
    if (index >= 0) {
      const screens = [...app.screens]
      screens.splice(index + 1, 0, tab)
      return { ...app, screens }
    }
  }
  return { ...app, screens: [...app.screens, tab] }
}
