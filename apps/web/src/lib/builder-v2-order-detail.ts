import type { AppV2, AppV2Node } from '@tableapp/schema/app-v2'
import type { BuilderV2Table } from '@/lib/builder-v2'

export type OrderDetailFactKind = 'contact' | 'delivery' | 'note' | 'reply' | 'other'

const CONTACT = /^(?:имя(?: клиента)?|телефон(?: клиента)?|email|e-mail|почта|клиент|customer|client|phone|name|контактное лицо|город)$/iu
const DELIVERY = /^(?:адрес(?: доставки| получения)?|дата отгрузки|доставка|address|shipping|delivery|вернуться к разговору)$/iu
const NOTE = /^(?:комментарий|примечание|заметки|что обсудили|comment|note)$/iu
const REPLY = /^(?:ответ клиенту|сообщение(?: магазина| клиенту)?|reply|response)$/iu

export function builderV2OrderFactKind(label: string): OrderDetailFactKind {
  const value = label.trim()
  if (CONTACT.test(value)) return 'contact'
  if (DELIVERY.test(value)) return 'delivery'
  if (NOTE.test(value)) return 'note'
  if (REPLY.test(value)) return 'reply'
  return 'other'
}

export function builderV2OrderDetailParts(args: {
  app: AppV2
  rootIds: readonly string[]
  nodes: Map<string, AppV2Node>
  recordTable?: BuilderV2Table
  statusFieldId?: string
  amountFieldId?: string
  positionsFieldId?: string
  statusFormId?: string
}) {
  const fieldIds: string[] = []
  const collectionIds: string[] = []
  const buttonIds: string[] = []
  const otherIds: string[] = []
  let processingFormId = args.statusFormId
  for (const id of args.rootIds) {
    const node = args.nodes.get(id)
    if (!node) continue
    if (processingFormId && id === processingFormId) continue
    if (node.type === 'form' && !processingFormId && node.tableId === args.recordTable?.id) {
      processingFormId = id
      continue
    }
    if (node.type === 'field') {
      const fieldId = 'fieldId' in node.value ? node.value.fieldId : undefined
      if (fieldId && (fieldId === args.statusFieldId || fieldId === args.amountFieldId)) continue
      fieldIds.push(id)
      continue
    }
    if (node.type === 'collection') { collectionIds.push(id); continue }
    if (node.type === 'button') { buttonIds.push(id); continue }
    otherIds.push(id)
  }
  const positionsNodeId = fieldIds.find(id => {
    const node = args.nodes.get(id)
    return node?.type === 'field' && 'fieldId' in node.value && node.value.fieldId === args.positionsFieldId
  })
  const factIds = fieldIds.filter(id => id !== positionsNodeId)
  return { factIds, collectionIds, buttonIds, otherIds, positionsNodeId, processingFormId }
}

/** First related product id from an order-item relation cell (string or string[]). */
export function builderV2OrderLineProductId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const id = value.trim()
    return id || undefined
  }
  if (!Array.isArray(value)) return undefined
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (id) return id
  }
}

export function builderV2StatusProgress(choices: readonly { id: string; label: string }[], currentId: string | null | undefined, terminalIds: readonly string[] = []) {
  const active = typeof currentId === 'string' ? currentId : null
  const successTerminal = terminalIds[0]
  // Alternate terminals (cancel/return) are not a linear next step — hide progress rather than invent a path.
  if (active && terminalIds.includes(active) && active !== successTerminal) return []
  const alternate = new Set(terminalIds.slice(1))
  const pipeline = choices.filter(choice => !alternate.has(choice.id))
  const index = active == null ? -1 : pipeline.findIndex(choice => choice.id === active)
  return pipeline.map((choice, at) => ({
    id: choice.id,
    label: choice.label,
    state: index < 0 ? 'todo' as const : at < index ? 'done' as const : at === index ? 'current' as const : 'todo' as const,
  }))
}
