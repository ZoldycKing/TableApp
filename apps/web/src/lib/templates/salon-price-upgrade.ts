import { fieldSchema, normalizeFieldOptions, type Field } from '@tableapp/schema'

export const PRICE_SNAPSHOT_HELP = 'Согласованная цена посещения. Если оставить пустой, при сохранении возьмётся текущая цена услуги. Изменение прайса не меняет сохранённую цену. При замене услуги проверьте сумму.'

/** Preserve the current visible amount and all IDs. Historical agreed prices cannot be reconstructed from a live lookup. */
export function planSalonPriceUpgrade(fields: readonly Field[], services: readonly { id: string; data: Record<string, unknown> }[],
  visits: readonly { id: string; data: Record<string, unknown> }[], sourcePrice?: Field) {
  const price = fields.find(field => field.name === 'Цена')
  if (price?.type === 'number' && price.options.initialFrom) return null
  if (price?.type !== 'lookup') throw new Error('Цена посещения доработана: автоматический перенос недоступен')
  const relation = fields.find(field => field.id === price.options.relationFieldId)
  if (relation?.type !== 'relation' || relation.options.allowMultiple) throw new Error('Ожидалась связь с одной услугой')
  if (sourcePrice && (sourcePrice.type !== 'number' || sourcePrice.id !== price.options.targetFieldId)) throw new Error('Ожидалась числовая цена услуги')
  const data = visits.map(visit => {
    const ids = visit.data[relation.id]
    if (!Array.isArray(ids) || ids.length !== 1) throw new Error('У посещения не выбрана одна услуга: проверьте цены вручную')
    const source = services.find(service => service.id === ids[0])
    const value = source?.data[price.options.targetFieldId]
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Цена услуги отсутствует: проверьте посещения вручную')
    return { id: visit.id, data: { ...visit.data, [price.id]: value } }
  })
  const next = fieldSchema.parse({ ...price, type: 'number', description: PRICE_SNAPSHOT_HELP,
    options: normalizeFieldOptions('number', { ...(sourcePrice?.type === 'number' ? sourcePrice.options : { format: 'currency', precision: 0, currency: 'RUB' }),
      initialFrom: { relationFieldId: relation.id, targetFieldId: price.options.targetFieldId } }) })
  return { field: next, relation, data, note: 'Фиксируются цены, видимые сейчас. Это не восстановление исторически согласованных цен; старые суммы нужно сверить с квитанциями.' }
}
