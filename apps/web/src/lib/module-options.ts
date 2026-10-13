import { compatibleModuleKinds, type ModuleKind } from '@tableapp/schema'

/** Technical installation choices; onboarding presentation is a separate stage. */
export const MODULE_STARTERS = [
  { kind: 'booking', templateId: 'salon', name: 'Запись на услуги' },
  { kind: 'sales', templateId: 'zakazy', name: 'Продажа товаров' },
  { kind: 'repair', templateId: 'service', name: 'Ремонт' },
  { kind: 'delivery', templateId: 'dostavka', name: 'Доставка' },
  { kind: 'field_service', templateId: 'zayavki', name: 'Заявки и выезды' },
  { kind: 'property', templateId: 'nedvizhimost', name: 'Недвижимость' },
  { kind: 'crm', templateId: 'crm', name: 'Клиенты и сделки' },
  { kind: 'inventory', templateId: 'sklad', name: 'Склад и остатки' },
] as const satisfies readonly { kind: ModuleKind; templateId: string; name: string }[]

export function moduleStarter(templateId: string) {
  return MODULE_STARTERS.find(starter => starter.templateId === (templateId === 'katalog' ? 'zakazy' : templateId))
}
export function availableModuleStarters(kinds: readonly ModuleKind[]) {
  if (kinds.includes('inventory') && !kinds.includes('sales')) return []
  return MODULE_STARTERS.filter(starter => !kinds.includes(starter.kind) && compatibleModuleKinds([...kinds, starter.kind]))
}
