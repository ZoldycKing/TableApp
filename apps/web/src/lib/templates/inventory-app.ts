import { appSchema, newId, positionSequence, type App, type Component, type Screen } from '@tableapp/schema'
import type { BuiltTemplate } from './build'

/** A usable warehouse preset, with prices confined to the owner screens. */
export function asInventory(app: App, built: BuiltTemplate): App {
  const config = built.inventory
  if (!config) return app
  const owner = 'manager', worker = 'staff', both = [owner, worker]
  const access = (roles: string[]) => ({ public: false, publicFields: [], roles, allowDelete: false })
  const list = app.screens.find(s => s.type === 'list')!
  const detail = app.screens.find(s => s.type === 'detail')!
  const receiptId = newId('screen')
  const receiptFields = [config.movement.item, config.movement.qty, config.movement.note]
  const receipt: Screen = {
    id: receiptId, appId: app.id, position: 'a', name: 'Приёмка товара', tab: null,
    type: 'form', tableId: config.tables.movements, mode: 'create', access: access(both),
    submitLabel: 'Принять товар', successScreenId: list.id, successText: '',
    components: receiptFields.map((fieldId, index) => ({ id: newId('component'), position: positionSequence(receiptFields.length)[index]!,
      type: 'form_field', fieldId, roles: null, visibleWhen: null, label: null, required: index < 2, placeholder: null })),
  }
  const safe = new Set([config.item.name, config.item.stock, config.item.sku, config.item.image])
  const components = detail.type === 'detail' ? detail.components.flatMap((c): Component[] => {
    if (c.type === 'button') {
      const action = c.action
      return action.type === 'open_screen' && app.screens.some(screen => screen.id === action.screenId && screen.type === 'form' && screen.mode === 'edit' && screen.tableId === config.tables.items)
        ? [{ ...c, roles: [owner] }] : []
    }
    if (c.type === 'field') return safe.has(c.fieldId) ? [c] : []
    return c.type === 'heading' || c.type === 'image' ? [c] : []
  }) : []
  const receive: Component = { id: newId('component'), position: 'zz', type: 'button', roles: null, visibleWhen: null,
    label: 'Принять товар', style: 'primary', action: { id: newId('action'), type: 'open_screen', screenId: receiptId } }
  const journal: Screen = {
    id: newId('screen'), appId: app.id, position: 'a', name: 'Приёмки', tab: { icon: 'truck', label: 'Приёмки' },
    type: 'list', access: access([owner]), source: { viewId: config.views.movements, extraFilter: null, searchFieldIds: [config.movement.name] },
    titleFieldId: config.movement.name, subtitleFieldId: config.movement.date, metaFieldId: config.movement.qty,
    imageFieldId: null, statusFieldId: null, onTapScreenId: null, components: [],
  }
  const screens: Screen[] = [
    ...app.screens.filter(s => s.type === 'dashboard').map(s => ({ ...s, access: access([owner]) })),
    { ...list, access: access(both), name: 'Товары', tab: { icon: 'box', label: 'Товары' },
      ...(list.type === 'list' ? { titleFieldId: config.item.name, subtitleFieldId: config.item.sku, metaFieldId: config.item.stock, imageFieldId: config.item.image } : {}) },
    { ...detail, access: access(both), ...(detail.type === 'detail' ? { components: [...components, receive] } : {}) },
    receipt, journal,
    ...app.screens.filter(s => s.type === 'form').map(s => ({ ...s, access: access([owner]),
      components: s.type === 'form' ? s.components.filter(c => c.type !== 'form_field' || c.fieldId !== config.item.movements) : [] })),
  ]
  const positions = positionSequence(screens.length)
  return appSchema.parse({ ...app, roles: [
    { id: worker, name: 'Кладовщик', isDefault: true }, { id: owner, name: 'Владелец', isDefault: false },
  ], screens: screens.map((s, index) => ({ ...s, position: positions[index] })), homeScreenId: list.id,
    inventory: { ...config, receiptScreenId: receiptId } })
}
