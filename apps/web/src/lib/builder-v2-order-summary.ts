import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import type { BuilderV2OrderSummary } from './builder-v2-data-types'

type Column = { id: string; name: string; type: string }

export const builderV2StatusColumn = (field: Column) =>
  ['text', 'single_select'].includes(field.type) && /^(?:статус|status)$/iu.test(field.name.trim())

export function builderV2OrderLineFields(node: AppV2Node, source: AppV2['sources'][number], columns: readonly Column[]) {
  if (node.type !== 'collection' || node.layout !== 'list' || node.recordGroup ||
    source.screenTableId !== source.tableId || source.searchFieldIds.length) return
  const amount = columns.find(field => field.id === node.subtitleFieldId && ['number', 'formula', 'rollup'].includes(field.type) &&
    /^(?:сумма (?:позиции|строки)|line (?:total|amount))(?:\s|[,(_]|$)/iu.test(field.name.trim()))
  if (amount) return { amount, status: columns.find(builderV2StatusColumn) }
}

export function builderV2OrderAccumulator(fields: NonNullable<ReturnType<typeof builderV2OrderLineFields>>) {
  let count = 0, sum = 0, amountsKnown = true, statusesKnown = true, mixed = false, status: string | undefined
  return {
    add(data: Record<string, unknown>, display: Record<string, string>) {
      count++
      const amount = data[fields.amount.id]
      if (typeof amount === 'number' && Number.isFinite(amount)) sum += amount
      else amountsKnown = false
      const label = fields.status && display[fields.status.id]?.trim()
      if (!label) statusesKnown = false
      else if (status === undefined) status = label
      else if (status !== label) mixed = true
    },
    result(): BuilderV2OrderSummary {
      return {
        amount: count && amountsKnown && Number.isFinite(sum) ? sum : null,
        ...(count && statusesKnown && status ? { status: mixed ? { kind: 'mixed' } : { kind: 'same', label: status } } : {}),
      }
    },
  }
}
