import type { AppV2 } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'

export function isBuilderV2ContactTable(table?: BuilderV2Table) {
  return Boolean(table && /^(клиенты|контакты|customers|clients|contacts)$/iu.test(table.name.trim()))
}

export function isBuilderV2OrderTable(table?: BuilderV2Table) {
  return Boolean(table && /^(заказы|позиции заказов|orders|order items)$/iu.test(table.name.trim()))
}

export function isBuilderV2ContactProfile(app: AppV2, screenId: string, tables: readonly BuilderV2Table[]) {
  const screen = app.screens.find(screen => screen.id === screenId)
  return Boolean(screen?.recordTitleFieldId && isBuilderV2ContactTable(tables.find(table => table.id === screen.contextTableId)))
}

export function builderV2Initials(name: string) {
  return name.trim().split(/\s+/u, 2).map(word => Array.from(word)[0] ?? '').join('').toLocaleUpperCase('ru-RU')
}

export function builderV2RecordTone(id: string) {
  let hash = 0
  for (const letter of id) hash = (Math.imul(hash, 31) + letter.codePointAt(0)!) >>> 0
  return ['sky', 'violet', 'mint', 'amber', 'rose'][hash % 5]
}

export function builderV2StatusTone(label: string) {
  const value = label.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е')
  if (/^(?:доставлен[оа]?|выполнен[оа]?|завершен[оа]?|выдан[оа]?|оплачен[оа]?|delivered|completed|done|paid)$/u.test(value)) return 'mint'
  if (/^(?:отменен[оа]?|отказ|отмен[аы]|возврат|cancelled|canceled|returned)$/u.test(value)) return 'rose'
  if (/^(?:в работе|собирается|ожидает(?: .+)?|ожидание|pending|processing|in progress)$/u.test(value)) return 'amber'
  if (/^(?:отправлен[оа]?|в пути|в доставке|shipped|in transit)$/u.test(value)) return 'sky'
  return 'neutral'
}

export function builderV2ContactHref(type: string | undefined, value: unknown) {
  if (typeof value !== 'string') return
  const normalized = value.trim()
  if (type === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    return `mailto:${encodeURIComponent(normalized).replace('%40', '@')}`
  }
  if (type === 'phone' && /^\+?[\d\s().-]+$/u.test(normalized)) {
    const number = normalized.replace(/[^\d+]/gu, '')
    if (/^\+?\d{5,15}$/u.test(number)) return `tel:${number}`
  }
}
