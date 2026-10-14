import type { Field, ProductionConfig } from '@tableapp/schema'
import { describe, expect, it } from 'vitest'
import { templateExample } from './templates/presentation'
import { productionStockBinding, retainedProductionStockAppError, retainedProductionStockFieldError, type ProductionStockContract } from './production-stock-contract'

function fixture() {
  const production = templateExample('proizvodstvo'), warehouse = templateExample('sklad')
  const p = structuredClone(production.app.production!), i = structuredClone(warehouse.app.inventory!)
  const materialStock = production.fields.find(field => field.tableId === p.tables.materials && field.type === 'formula')!
  Object.assign(p, { stock: { itemsTableId: i.tables.items, materialStockFieldId: materialStock.id } })
  const contract: ProductionStockContract = { production: p, inventory: i,
    materialMovements: [{ tableId: p.tables.movements, rowId: 'row_consumption', materialId: 'row_material', quantity: 0.012 }] }
  return { contract, fields: [...production.fields, ...warehouse.fields] as Field[], materialStock }
}

describe('retained production stock contracts', () => {
  it('keeps factory defaults and UI/grant changes outside the retained lifecycle binding', () => {
    const { contract } = fixture(), next = structuredClone(contract.production)
    next.formScreenId = 'screen_changed'; next.movementScreenId = 'screen_another'
    expect(productionStockBinding(next)).toBe(productionStockBinding(contract.production))
    expect(retainedProductionStockAppError({ production: next, inventory: contract.inventory }, contract)).toBeNull()
  })

  it('rejects rebinding production or its shared warehouse after accepted runs', () => {
    const { contract } = fixture(), production = structuredClone(contract.production), inventory = structuredClone(contract.inventory)
    production.run.product = 'field_another_product'
    expect(retainedProductionStockAppError({ production, inventory }, contract)).toContain('Привязки выпуска')
    inventory.movement.qty = 'field_another_qty'
    expect(retainedProductionStockAppError({ production: contract.production, inventory }, contract)).toContain('журнал')
    const changedStock = structuredClone(contract.production) as ProductionConfig & { stock: { materialStockFieldId: string } }
    changedStock.stock.materialStockFieldId = 'field_hidden_stock'
    expect(productionStockBinding(changedStock)).not.toBe(productionStockBinding(contract.production))
  })

  it('cannot hide retained history by changing all source table IDs in the originating publication', () => {
    const { contract } = fixture(), production = structuredClone(contract.production), inventory = structuredClone(contract.inventory)
    production.tables.production = 'table_unrelated_runs'
    inventory.tables.items = 'table_unrelated_products'
    const previous = { production: contract.production, inventory: contract.inventory }
    expect(retainedProductionStockAppError({ production, inventory }, contract, previous)).toContain('Привязки выпуска')
    expect(retainedProductionStockAppError({ production: contract.production, inventory }, contract, previous)).toContain('журнал')
    expect(retainedProductionStockAppError({ production: null, inventory: null }, contract, previous)).toContain('Привязки выпуска')
  })

  it('permits field labels but preserves linked production data types and relation targets', () => {
    const { contract, fields } = fixture(), qty = fields.find(field => field.id === contract.production.run.qty)!, relation = fields.find(field => field.id === contract.production.run.product)!
    expect(retainedProductionStockFieldError(contract, qty, { ...qty, name: 'Готово, шт.' })).toBeNull()
    expect(retainedProductionStockFieldError(contract, qty, null)).toContain('Сохраните')
    expect(retainedProductionStockFieldError(contract, qty, { ...qty, type: 'text', options: {} })).toContain('Тип')
    if (relation.type !== 'relation') throw new Error('Expected product relation')
    expect(retainedProductionStockFieldError(contract, relation, { ...relation, options: { ...relation.options, tableId: 'table_other' } })).toContain('Связь')
  })

  it('retains both stock formulas and their journal sums after the source app is gone', () => {
    const { contract, fields, materialStock } = fixture(), stock = fields.find(field => field.id === contract.inventory.item.stock)!
    for (const field of [stock, materialStock] as Field[]) {
      if (field.type !== 'formula') throw new Error('Expected stock formula')
      expect(retainedProductionStockFieldError(contract, field, { ...field, options: { ...field.options, expression: '0' } })).toContain('Формула')
    }
    for (const [tableId, relationFieldId, targetFieldId] of [[contract.inventory.tables.items, contract.inventory.item.movements, contract.inventory.movement.qty],
      [contract.production.tables.materials, contract.production.material.movements, contract.production.movement.qty]]) {
      const sum = fields.find(field => field.type === 'rollup' && field.tableId === tableId && field.options.relationFieldId === relationFieldId && field.options.targetFieldId === targetFieldId)!
      if (sum.type !== 'rollup') throw new Error('Expected journal sum')
      expect(retainedProductionStockFieldError(contract, sum, null)).toContain('Сохраните')
      expect(retainedProductionStockFieldError(contract, sum, { ...sum, options: { ...sum.options, fn: 'max' } })).toContain('суммирование')
    }
  })

  it('permits renaming the production movement kind while retaining its ID', () => {
    const { contract, fields } = fixture(), field = fields.find(field => field.id === contract.production.movement.kind)!
    if (field.type !== 'single_select') throw new Error('Expected movement kinds')
    expect(retainedProductionStockFieldError(contract, field, { ...field, options: { ...field.options,
      choices: field.options.choices.map(choice => ({ ...choice, name: 'Другое название' })) } })).toBeNull()
    expect(retainedProductionStockFieldError(contract, field, { ...field, options: { ...field.options,
      choices: field.options.choices.filter(choice => choice.id !== contract.production.movementKindId) } })).toContain('идентификатор')
  })
})
