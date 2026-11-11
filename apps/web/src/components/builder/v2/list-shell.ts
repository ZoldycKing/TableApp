import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2DataPage, BuilderV2DataRecord } from '@/lib/builder-v2-data-types'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { purchaseMoney } from '@/lib/purchase-format'
import type { ShellMetric, ShellTab } from './layout-shell'

export type ListShellKind =
  | 'inventory-items'
  | 'inventory-movements'
  | 'inventory-purchases'
  | 'inventory-suppliers'
  | 'inventory-counts'
  | 'crm-board'
  | 'crm-clients'
  | 'shop-orders'

const INVENTORY_KINDS = new Set<ListShellKind>([
  'inventory-items',
  'inventory-movements',
  'inventory-purchases',
  'inventory-suppliers',
  'inventory-counts',
])

/** Maps a published list screen to the shared layout skeleton kind. */
export function listShellScreen(app: AppV2, screenId: string): ListShellKind | null {
  const inv = app.inventory
  if (inv) {
    if (screenId === inv.itemsScreenId) return 'inventory-items'
    if (screenId === inv.movementsScreenId) return 'inventory-movements'
    if (screenId === inv.purchasesScreenId) return 'inventory-purchases'
    if (screenId === inv.suppliersScreenId) return 'inventory-suppliers'
    if (screenId === inv.countsScreenId) return 'inventory-counts'
  }
  const crm = app.crm
  if (crm) {
    if (screenId === crm.boardScreenId) return 'crm-board'
    if (screenId === crm.clientsScreenId) return 'crm-clients'
  }
  const shop = app.shop
  if (shop?.ordersScreenId && screenId === shop.ordersScreenId) return 'shop-orders'
  return null
}

export function listShellTitle(kind: ListShellKind): string {
  switch (kind) {
    case 'inventory-items': return 'Товары'
    case 'inventory-movements': return 'Движения'
    case 'inventory-purchases': return 'Закупки'
    case 'inventory-suppliers': return 'Поставщики'
    case 'inventory-counts': return 'Инвентаризация'
    case 'crm-board': return 'Сделки'
    case 'crm-clients': return 'Клиенты'
    case 'shop-orders': return 'Заказы'
  }
}

export function formatShellCount(value: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.trunc(value))
  const mod10 = n % 10
  const mod100 = n % 100
  const word = mod100 >= 11 && mod100 <= 14 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many
  return `${n.toLocaleString('ru-RU')} ${word}`
}

export function formatShellMoney(value: number): string {
  return purchaseMoney(value)
}

type ShellMetricsInput = {
  kind: ListShellKind
  page?: BuilderV2DataPage
  rows?: readonly AppV2Record[]
  inventory?: NonNullable<AppV2['inventory']>
  table?: BuilderV2Table
  lowStockCount?: number | null
  supplierPurchasedTotal?: number
  supplierOrdersTotal?: number
}

function rowsOf(input: ShellMetricsInput): readonly AppV2Record[] {
  return input.rows ?? input.page?.rows ?? []
}

export function buildListShellMetrics(input: ShellMetricsInput): ShellMetric[] {
  const { kind, page, inventory, table, lowStockCount } = input
  const rows = rowsOf(input)
  const total = page?.total ?? rows.length

  if (kind === 'inventory-items' && inventory) {
    let stockValue = 0
    let low = 0
    const warehouses = new Set<string>()
    for (const row of rows) {
      if (row.values[inventory.itemLowFieldId] === true) low += 1
      const stock = Number(row.values[inventory.itemStockFieldId])
      const cost = Number(row.values[inventory.itemCostFieldId])
      if (Number.isFinite(stock) && Number.isFinite(cost)) stockValue += stock * cost
      const wh = row.values[inventory.itemWarehouseFieldId]
      const whKey = typeof wh === 'string' ? wh : Array.isArray(wh) ? wh.find((id): id is string => typeof id === 'string') : ''
      if (whKey) warehouses.add(whKey)
    }
    const below = lowStockCount != null ? lowStockCount : low
    return [
      { key: 'value', value: stockValue > 0 ? formatShellMoney(stockValue) : '—', caption: 'Стоимость остатка' },
      {
        key: 'low',
        value: String(below),
        caption: 'Ниже минимума',
        ...(below > 0 ? { pill: 'Нужно заказать', tone: 'rose' as const } : {}),
      },
      {
        key: 'wh',
        value: String(warehouses.size || total),
        caption: warehouses.size ? 'Складов' : 'Товаров в списке',
      },
    ]
  }

  if (kind === 'inventory-movements' && inventory) {
    const byType = new Map<string, number>()
    for (const row of rows) {
      const typeRaw = row.values[inventory.movementTypeFieldId]
      const key = typeof typeRaw === 'string' ? typeRaw : String(typeRaw ?? 'other')
      byType.set(key, (byType.get(key) ?? 0) + 1)
    }
    const typeField = table?.fields.find(field => field.id === inventory.movementTypeFieldId)
    const labels = new Map(typeField?.choices?.map(choice => [choice.id, choice.name]) ?? [])
    const top = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
    const metrics: ShellMetric[] = [
      { key: 'ops', value: formatShellCount(total, 'операция', 'операции', 'операций'), caption: 'Всего' },
    ]
    for (const [id, count] of top) {
      metrics.push({ key: id, value: String(count), caption: labels.get(id) ?? 'Операции' })
    }
    while (metrics.length < 3) metrics.push({ key: `pad-${metrics.length}`, value: '—', caption: 'По типу' })
    return metrics.slice(0, 4)
  }

  if (kind === 'inventory-purchases' && inventory) {
    let amount = 0
    const statuses = new Map<string, number>()
    for (const row of rows) {
      const status = inventory.purchaseStatusFieldId ? String(row.values[inventory.purchaseStatusFieldId] ?? '') : ''
      if (status) statuses.set(status, (statuses.get(status) ?? 0) + 1)
      const totalRaw = inventory.purchaseTotalFieldId ? row.values[inventory.purchaseTotalFieldId] : null
      if (typeof totalRaw === 'number' && Number.isFinite(totalRaw)) amount += totalRaw
    }
    const statusField = table?.fields.find(field => field.id === inventory.purchaseStatusFieldId)
    const active = statusField?.choices?.find(choice => /заказ/i.test(choice.name))
    const activeCount = active ? (statuses.get(active.id) ?? 0) : 0
    return [
      { key: 'orders', value: formatShellCount(total, 'заказ', 'заказа', 'заказов'), caption: 'Всего' },
      { key: 'active', value: String(activeCount), caption: active?.name ?? 'В работе' },
      { key: 'sum', value: amount > 0 ? formatShellMoney(amount) : '—', caption: 'Сумма в списке' },
    ]
  }

  if (kind === 'inventory-suppliers') {
    const orders = input.supplierOrdersTotal ?? 0
    const purchased = input.supplierPurchasedTotal ?? 0
    return [
      { key: 'suppliers', value: formatShellCount(total, 'поставщик', 'поставщика', 'поставщиков'), caption: 'В базе' },
      { key: 'orders', value: String(orders), caption: 'Заказов всего' },
      { key: 'sum', value: purchased > 0 ? formatShellMoney(purchased) : '—', caption: 'Закуплено' },
    ]
  }

  if (kind === 'inventory-counts' && inventory) {
    let draft = 0
    let posted = 0
    for (const row of rows) {
      const status = inventory.countStatusFieldId ? String(row.values[inventory.countStatusFieldId] ?? '') : ''
      if (inventory.countStatusDraft && status === inventory.countStatusDraft) draft += 1
      else if (inventory.countStatusPosted && status === inventory.countStatusPosted) posted += 1
    }
    return [
      { key: 'total', value: formatShellCount(total, 'документ', 'документа', 'документов'), caption: 'Инвентаризаций' },
      { key: 'draft', value: String(draft), caption: 'Черновики' },
      { key: 'posted', value: String(posted), caption: 'Проведено' },
    ]
  }

  if (kind === 'crm-board') {
    const columns = page?.board?.columns
    if (columns?.length) {
      const open = columns.reduce((sum, col) => sum + col.total, 0)
      const won = columns.find(col => /выигр|успех|закрыт/i.test(col.name))?.total ?? 0
      return [
        { key: 'deals', value: formatShellCount(open, 'сделка', 'сделки', 'сделок'), caption: 'На воронке' },
        { key: 'cols', value: String(columns.length), caption: 'Этапов' },
        { key: 'won', value: String(won), caption: 'Выиграно' },
      ]
    }
    return [{ key: 'deals', value: formatShellCount(total, 'сделка', 'сделки', 'сделок'), caption: 'Сделок' }]
  }

  if (kind === 'crm-clients') {
    const withPhone = rows.filter(row => Object.values(row.values).some(value => typeof value === 'string' && /\+?\d[\d\s()-]{6,}/.test(value))).length
    return [
      { key: 'clients', value: formatShellCount(total, 'клиент', 'клиента', 'клиентов'), caption: 'В базе' },
      { key: 'loaded', value: String(rows.length), caption: 'В текущем списке' },
      ...(withPhone ? [{ key: 'phone', value: String(withPhone), caption: 'С телефоном' }] : []),
    ]
  }

  if (kind === 'shop-orders') {
    let amount = 0
    for (const row of rows) {
      const summary = (row as BuilderV2DataRecord).summary
      if (summary?.amount != null && Number.isFinite(summary.amount)) amount += summary.amount
    }
    return [
      { key: 'orders', value: formatShellCount(total, 'заказ', 'заказа', 'заказов'), caption: 'В списке' },
      { key: 'sum', value: amount > 0 ? formatShellMoney(amount) : '—', caption: 'Сумма заказов' },
    ]
  }

  return []
}

export function buildListShellMeta(input: ShellMetricsInput): string | undefined {
  const { kind, page, inventory } = input
  const rows = rowsOf(input)
  const total = page?.total ?? rows.length
  if (kind === 'inventory-items' && inventory) {
    const warehouses = new Set<string>()
    for (const row of rows) {
      const wh = row.values[inventory.itemWarehouseFieldId]
      const whKey = typeof wh === 'string' ? wh : Array.isArray(wh) ? wh.find((id): id is string => typeof id === 'string') : ''
      if (whKey) warehouses.add(whKey)
    }
    const whCount = warehouses.size
    return `${formatShellCount(total, 'товар', 'товара', 'товаров')}${whCount ? ` · ${whCount} ${whCount === 1 ? 'склад' : whCount < 5 ? 'склада' : 'складов'}` : ''}`
  }
  if (INVENTORY_KINDS.has(kind)) {
    return `${total.toLocaleString('ru-RU')} записей`
  }
  return undefined
}

export function buildListShellTabs(input: ShellMetricsInput & { activeTab: string }): { tabs: ShellTab[]; defaultTab: string } | null {
  const { kind, page, inventory, table, activeTab, lowStockCount } = input
  const rows = rowsOf(input)

  if (kind === 'inventory-items' && inventory) {
    const low = lowStockCount ?? rows.filter(row => row.values[inventory.itemLowFieldId] === true).length
    return {
      defaultTab: 'all',
      tabs: [
        { id: 'all', label: 'Все', count: page?.total ?? rows.length },
        { id: 'low', label: 'Ниже минимума', count: low },
      ],
    }
  }

  if (kind === 'inventory-movements' && inventory) {
    const typeField = table?.fields.find(field => field.id === inventory.movementTypeFieldId)
    const choices = (typeField?.choices ?? []).filter(choice => ['Приход', 'Расход', 'Списание', 'Перемещение'].includes(choice.name))
    if (!choices.length) return null
    const byType = new Map<string, number>()
    for (const row of rows) {
      const typeRaw = row.values[inventory.movementTypeFieldId]
      const key = typeof typeRaw === 'string' ? typeRaw : ''
      if (key) byType.set(key, (byType.get(key) ?? 0) + 1)
    }
    return {
      defaultTab: 'all',
      tabs: [
        { id: 'all', label: 'Все', count: page?.total ?? rows.length },
        ...choices.map(choice => ({ id: choice.id, label: choice.name, count: byType.get(choice.id) ?? 0 })),
      ],
    }
  }

  if (kind === 'inventory-purchases' && inventory?.purchaseStatusFieldId) {
    const statusField = table?.fields.find(field => field.id === inventory.purchaseStatusFieldId)
    const choices = statusField?.choices ?? []
    if (choices.length < 2) return null
    const byStatus = new Map<string, number>()
    for (const row of rows) {
      const status = String(row.values[inventory.purchaseStatusFieldId] ?? '')
      if (status) byStatus.set(status, (byStatus.get(status) ?? 0) + 1)
    }
    return {
      defaultTab: activeTab && (activeTab === 'all' || byStatus.has(activeTab)) ? activeTab : 'all',
      tabs: [
        { id: 'all', label: 'Все', count: page?.total ?? rows.length },
        ...choices.map(choice => ({ id: choice.id, label: choice.name, count: byStatus.get(choice.id) ?? 0 })),
      ],
    }
  }

  if (kind === 'inventory-counts' && inventory?.countStatusFieldId) {
    let draft = 0
    let posted = 0
    for (const row of rows) {
      const status = String(row.values[inventory.countStatusFieldId] ?? '')
      if (inventory.countStatusDraft && status === inventory.countStatusDraft) draft += 1
      else if (inventory.countStatusPosted && status === inventory.countStatusPosted) posted += 1
    }
    return {
      defaultTab: 'all',
      tabs: [
        { id: 'all', label: 'Все', count: page?.total ?? rows.length },
        { id: 'draft', label: 'Черновики', count: draft },
        { id: 'posted', label: 'Проведено', count: posted },
      ],
    }
  }

  return null
}

/** Client-side tab filter applied to collection rows inside the shell. */
export function filterListShellRows(
  kind: ListShellKind,
  tab: string,
  rows: readonly AppV2Record[],
  inventory?: NonNullable<AppV2['inventory']>,
): readonly AppV2Record[] {
  if (tab === 'all' || !tab) return rows
  if (kind === 'inventory-items' && inventory) {
    return tab === 'low' ? rows.filter(row => row.values[inventory.itemLowFieldId] === true) : rows
  }
  if (kind === 'inventory-movements' && inventory) {
    return rows.filter(row => row.values[inventory.movementTypeFieldId] === tab)
  }
  if (kind === 'inventory-purchases' && inventory?.purchaseStatusFieldId) {
    const statusFieldId = inventory.purchaseStatusFieldId
    return rows.filter(row => String(row.values[statusFieldId] ?? '') === tab)
  }
  if (kind === 'inventory-counts' && inventory?.countStatusFieldId) {
    const statusFieldId = inventory.countStatusFieldId
    if (tab === 'draft' && inventory.countStatusDraft) {
      return rows.filter(row => String(row.values[statusFieldId] ?? '') === inventory.countStatusDraft)
    }
    if (tab === 'posted' && inventory.countStatusPosted) {
      return rows.filter(row => String(row.values[statusFieldId] ?? '') === inventory.countStatusPosted)
    }
  }
  return rows
}

export function aggregateSupplierStats(stats: Map<string, { orders: number; purchased: number }>): { orders: number; purchased: number } {
  let orders = 0
  let purchased = 0
  for (const value of stats.values()) {
    orders += value.orders
    purchased += value.purchased
  }
  return { orders, purchased }
}
