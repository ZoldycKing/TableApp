import { type CustomerWorkflow, type InventoryConfig, type Field } from '@tableapp/schema'

export type StockContract = { order: CustomerWorkflow; inventory: InventoryConfig }
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, part]) => [key, canonical(part)])) : value
/** Only lifecycle bindings are fixed; names, screens and staff assignments may change. */
export function inventoryBinding(c: InventoryConfig) {
  return JSON.stringify(canonical([c.tables, c.item.opening, c.item.movements, c.item.stock, c.movement,
    c.operations && [c.operations.fields, c.operations.kinds]]))
}
export function orderBinding(c: CustomerWorkflow) {
  return JSON.stringify(canonical([c.tableId, c.emailFieldId, c.statusFieldId, c.initialStatus, c.cancelStatus,
    [...c.cancellableStatuses].sort(), [...c.terminalStatuses].sort(), c.stock, c.logistics,
    c.catalog?.tableId, c.cart && [c.cart.itemsTableId, c.cart.positionsFieldId, c.cart.productFieldId,
      c.cart.nameFieldId, c.cart.quantityFieldId, c.cart.itemPriceFieldId, c.cart.itemEmailFieldId]]))
}

export function retainedStockFieldError(contract: StockContract, original: Field, next: Field | null): string | null {
  const { order: o, inventory: i } = contract, cart = o.cart!
  const ids = [o.emailFieldId, o.statusFieldId, cart.positionsFieldId, cart.productFieldId, cart.nameFieldId,
    cart.quantityFieldId, cart.itemPriceFieldId, cart.itemEmailFieldId, i.item.opening, i.item.movements, i.item.stock,
    ...Object.values(i.movement), ...Object.values(i.operations!.fields)]
  const journalSum = original.type === 'rollup' && original.tableId === i.tables.items && original.options.relationFieldId === i.item.movements && original.options.targetFieldId === i.movement.qty && original.options.fn === 'sum'
  if (!ids.includes(original.id) && !journalSum) return null
  if (!next) return 'Поле используется подтверждёнными заказами и складской историей. Сохраните его.'
  if (original.type !== next.type) return 'Тип поля подтверждённого заказа или склада не может быть изменён.'
  if (journalSum && next.type === 'rollup' && (next.options.relationFieldId !== i.item.movements || next.options.targetFieldId !== i.movement.qty || next.options.fn !== 'sum')) return 'Сумма движений используется складской историей. Сохраните связь с журналом и суммирование количества.'
  if (next.type === 'relation' && original.type === 'relation' && (next.options.tableId !== original.options.tableId || next.options.allowMultiple !== original.options.allowMultiple)) return 'Связь подтверждённого заказа или движения склада нельзя перенастроить.'
  if (next.type === 'formula' && original.type === 'formula' && next.options.expression !== original.options.expression) return 'Формула остатка используется подтверждёнными заказами и должна сохранять прежний расчёт.'
  if (next.type === 'single_select') {
    const required = original.id === o.statusFieldId ? [o.initialStatus, o.cancelStatus, o.stock!.confirmedStatus, ...(o.stock!.returnedStatus ? [o.stock!.returnedStatus] : []), ...o.cancellableStatuses, ...o.terminalStatuses, o.logistics!.shippedStatus, o.logistics!.deliveredStatus]
      : original.id === i.operations!.fields.kind ? Object.values(i.operations!.kinds) : []
    if (required.some(id => !next.options.choices.some(choice => choice.id === id))) return 'Этот статус используется подтверждённым заказом или складом. Название можно изменить, идентификатор нужно сохранить.'
  }
  return null
}
