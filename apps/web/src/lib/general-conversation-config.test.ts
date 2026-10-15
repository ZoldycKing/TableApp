import { describe, expect, it } from 'vitest'
import { generalChatAvailableApp } from './general-conversation-config'
import { templateExample } from './templates/presentation'

describe('general question availability', () => {
  it('supports public customer catalogs and booking while excluding internal apps and private catalogs', () => {
    for (const kind of ['zakazy', 'salon']) {
      const app = templateExample(kind).app
      expect(generalChatAvailableApp(app)).toBe(true)
      expect(generalChatAvailableApp({ ...app, screens: app.screens.map(screen => ({ ...screen, access: { ...screen.access, public: false } })) })).toBe(false)
      expect(generalChatAvailableApp({ ...app, roles: app.roles.map(role => ({ ...role, isDefault: role.id !== 'client' })) })).toBe(false)
      expect(generalChatAvailableApp({ ...app, roles: [{ id: 'private-default', name: 'Сотрудник', isDefault: true }, ...app.roles] })).toBe(false)
    }
    expect(generalChatAvailableApp(templateExample('crm').app)).toBe(false)
    expect(generalChatAvailableApp(templateExample('sklad').app)).toBe(false)
  })

  it('retains structural eligibility when new messages are disabled so existing history can be read', () => {
    const app = templateExample('zakazy').app
    expect(generalChatAvailableApp({ ...app, communications: { enabled: false } })).toBe(true)
  })
})
