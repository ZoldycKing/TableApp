import type { Field, InventoryConfig, ProductionConfig } from '@tableapp/schema'
import { inventoryBinding } from './order-stock-contract'

export type ProductionStockContract = {
  production: ProductionConfig
  inventory: InventoryConfig
  materialMovements: { tableId: string; rowId: string; materialId: string; quantity: number }[]
}

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, part]) => [key, canonical(part)])) : value

/** Screen names, layout and staff grants may change; accepted stock coordinates may not. */
export function productionStockBinding(config: ProductionConfig): string {
  const stock = (config as ProductionConfig & { stock?: { itemsTableId: string } | null }).stock
  const { name, unit, opening, movements } = config.material
  return JSON.stringify(canonical([config.tables, config.run, config.norm, config.movement, { name, unit, opening, movements }, config.movementKindId, stock ?? null]))
}

export function retainedProductionStockFieldError(contract: ProductionStockContract, original: Field, next: Field | null): string | null {
  const { production: p, inventory: i } = contract
  const materialStock = (p as ProductionConfig & { stock?: { materialStockFieldId?: string } | null }).stock?.materialStockFieldId
  const ids = [...Object.values(p.run), ...Object.values(p.norm), ...Object.values(p.movement), p.material.name, p.material.unit, p.material.opening, p.material.movements,
    materialStock, i.item.opening, i.item.movements, i.item.stock, ...Object.values(i.movement), ...Object.values(i.operations?.fields ?? {})]
  const stockSum = original.type === 'rollup' && original.tableId === i.tables.items && original.options.relationFieldId === i.item.movements &&
    original.options.targetFieldId === i.movement.qty && original.options.fn === 'sum'
  const materialSum = original.type === 'rollup' && original.tableId === p.tables.materials && original.options.relationFieldId === p.material.movements &&
    original.options.targetFieldId === p.movement.qty && original.options.fn === 'sum'
  if (!ids.includes(original.id) && !stockSum && !materialSum) return null
  if (!next) return 'Поле используется выпуском продукции и его складской историей. Сохраните его.'
  if (original.type !== next.type) return 'Тип поля сохранённого выпуска или его складского движения нельзя изменить.'
  if (next.type === 'relation' && original.type === 'relation' &&
    (next.options.tableId !== original.options.tableId || next.options.allowMultiple !== original.options.allowMultiple)) return 'Связь сохранённого выпуска или складского движения нельзя перенастроить.'
  if (stockSum && next.type === 'rollup' &&
    (next.options.relationFieldId !== i.item.movements || next.options.targetFieldId !== i.movement.qty || next.options.fn !== 'sum')) return 'Сохраните суммирование движений общего склада.'
  if (materialSum && next.type === 'rollup' &&
    (next.options.relationFieldId !== p.material.movements || next.options.targetFieldId !== p.movement.qty || next.options.fn !== 'sum')) return 'Сохраните суммирование производственных движений материала.'
  if (next.type === 'formula' && original.type === 'formula' && next.options.expression !== original.options.expression) return 'Формула остатка используется складской историей выпуска и должна сохранять прежний расчёт.'
  if (next.type === 'single_select') {
    const required = original.id === p.movement.kind ? [p.movementKindId] : original.id === i.operations?.fields.kind ? Object.values(i.operations.kinds) : []
    if (required.some(id => !next.options.choices.some(choice => choice.id === id))) return 'Этот вид движения используется сохранённым выпуском. Название можно изменить, идентификатор нужно сохранить.'
  }
  return null
}

type StockApp = { production?: ProductionConfig | null; inventory?: InventoryConfig | null }
export function retainedProductionStockAppError(app: StockApp, contract: ProductionStockContract, previous?: StockApp | null): string | null {
  const retainedProduction = app.production?.tables.production === contract.production.tables.production || previous?.production?.tables.production === contract.production.tables.production
  if (retainedProduction && (!app.production || productionStockBinding(app.production) !== productionStockBinding(contract.production)))
    return 'Привязки выпуска и материалов используются складской историей. Сохраните их; названия, экраны и рабочие права можно менять.'
  const retainedInventory = app.inventory?.tables.items === contract.inventory.tables.items || previous?.inventory?.tables.items === contract.inventory.tables.items
  if (retainedInventory && (!app.inventory || inventoryBinding(app.inventory) !== inventoryBinding(contract.inventory)))
    return 'Каталог уже принимает продукцию производства. Сохраните его журнал и правила остатка.'
  return null
}
