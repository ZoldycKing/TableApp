import type { InventoryConfig, InventoryOperation } from '@tableapp/schema'

export const INVENTORY_COPY = {
  receipt: { name: 'Приёмка', action: 'Принять товар', quantity: 'Сколько поступило, шт.', done: 'Принято', note: 'Комментарий', reason: false, sign: 1 },
  issue: { name: 'Выдача', action: 'Выдать товар', quantity: 'Сколько выдать, шт.', done: 'Выдано', note: 'Кому или для чего', reason: false, sign: -1 },
  writeOff: { name: 'Списание', action: 'Списать товар', quantity: 'Сколько списать, шт.', done: 'Списано', note: 'Причина списания', reason: true, sign: -1 },
  returnIn: { name: 'Возврат на склад', action: 'Вернуть на склад', quantity: 'Сколько вернули, шт.', done: 'Возвращено на склад', note: 'От кого вернули', reason: false, sign: 1 },
  returnOut: { name: 'Возврат поставщику', action: 'Вернуть поставщику', quantity: 'Сколько вернуть, шт.', done: 'Возвращено поставщику', note: 'Поставщик или причина', reason: false, sign: -1 },
  stocktake: { name: 'Инвентаризация', action: 'Сохранить фактический остаток', quantity: 'Фактически на складе, шт.', done: 'Пересчитано', note: 'Причина корректировки', reason: true, sign: 0 },
} as const

export function inventoryScreen(config: InventoryConfig, operation: InventoryOperation): string | null {
  return operation === 'receipt' ? config.receiptScreenId : config.operations?.screens[operation] ?? null
}

export function inventoryOperation(config: InventoryConfig, screenId: string): InventoryOperation | null {
  if (config.receiptScreenId === screenId) return 'receipt'
  return (Object.entries(config.operations?.screens ?? {}) as [InventoryOperation, string][]).find(([, id]) => id === screenId)?.[0] ?? null
}
