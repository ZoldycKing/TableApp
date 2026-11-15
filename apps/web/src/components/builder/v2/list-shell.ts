import type { AppV2, AppV2Record } from '@tableapp/schema/app-v2'
import type { BuilderV2DataPage, BuilderV2DataRecord } from '@/lib/builder-v2-data-types'
import type { BuilderV2Table } from '@/lib/builder-v2'
import { purchaseMoney } from '@/lib/purchase-format'
import type { ShellMetric, ShellTab } from './layout-shell'
import type { ListFilterDef } from './list-filters'

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
    case 'inventory-movements': return 'История склада'
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

function metricVisible(value: ShellMetric['value']): boolean {
  return value != null && value !== '' && value !== '—'
}

type ShellMetricsInput = {
  kind: ListShellKind
  page?: BuilderV2DataPage
  rows?: readonly AppV2Record[]
  inventory?: NonNullable<AppV2['inventory']>
  crm?: NonNullable<AppV2['crm']>
  shop?: NonNullable<AppV2['shop']>
  table?: BuilderV2Table
  lowStockCount?: number | null
  supplierPurchasedTotal?: number
  supplierOrdersTotal?: number
  openPurchaseTotal?: number | null
  clientOpenDeals?: number
  clientPipelineAmount?: number
  clientDueToday?: number
  clientDueOverdue?: number
}

function rowsOf(input: ShellMetricsInput): readonly AppV2Record[] {
  return input.rows ?? input.page?.rows ?? []
}

export function buildListShellMetrics(input: ShellMetricsInput): ShellMetric[] {
  const { kind, page, inventory, crm, shop, table, lowStockCount, openPurchaseTotal, clientOpenDeals, clientPipelineAmount } = input
  const rows = rowsOf(input)
  const total = page?.total ?? rows.length

  if (kind === 'inventory-items' && inventory) {
    let stockValue = 0
    let low = 0
    for (const row of rows) {
      if (row.values[inventory.itemLowFieldId] === true) low += 1
      const stock = Number(row.values[inventory.itemStockFieldId])
      const cost = Number(row.values[inventory.itemCostFieldId])
      if (Number.isFinite(stock) && Number.isFinite(cost)) stockValue += stock * cost
    }
    const below = lowStockCount != null ? lowStockCount : low
    const metrics: ShellMetric[] = []
    if (stockValue > 0) {
      metrics.push({ key: 'value', value: formatShellMoney(stockValue), caption: 'Стоимость остатка' })
    }
    metrics.push({
      key: 'low',
      value: String(below),
      caption: 'Ниже минимума',
      ...(below > 0 ? { pill: 'Заказать ›', tone: 'rose' as const } : {}),
    })
    metrics.push({
      key: 'open_po',
      value: formatShellMoney(openPurchaseTotal != null && openPurchaseTotal > 0 ? openPurchaseTotal : 0),
      caption: 'В заказах поставщикам',
    })
    return metrics
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
    return metrics.filter(metric => metricVisible(metric.value))
  }

  if (kind === 'inventory-purchases' && inventory) {
    const statuses = new Map<string, number>()
    let orderedAmount = 0
    let receivedThisMonth = 0
    const monthAgo = Date.now() - 30 * 86_400_000
    for (const row of rows) {
      const status = inventory.purchaseStatusFieldId ? String(row.values[inventory.purchaseStatusFieldId] ?? '') : ''
      if (status) statuses.set(status, (statuses.get(status) ?? 0) + 1)
      const totalRaw = inventory.purchaseTotalFieldId ? row.values[inventory.purchaseTotalFieldId] : null
      const totalValue = typeof totalRaw === 'number' && Number.isFinite(totalRaw) ? totalRaw : 0
      if (inventory.statusOrdered && status === inventory.statusOrdered) orderedAmount += totalValue
      if (inventory.statusReceived && status === inventory.statusReceived) {
        const dateRaw = inventory.purchaseDateFieldId ? row.values[inventory.purchaseDateFieldId] : null
        const ms = typeof dateRaw === 'string' || typeof dateRaw === 'number' ? Date.parse(String(dateRaw)) : NaN
        if (Number.isFinite(ms) && ms >= monthAgo) receivedThisMonth += 1
      }
    }
    const draftCount = inventory.statusDraft ? (statuses.get(inventory.statusDraft) ?? 0) : 0
    return [
      { key: 'awaiting', value: formatShellMoney(orderedAmount), caption: 'Ожидается поставок' },
      { key: 'drafts', value: String(draftCount), caption: 'Черновики' },
      { key: 'received_month', value: String(receivedThisMonth), caption: 'Получено за месяц' },
    ]
  }

  if (kind === 'inventory-suppliers') {
    const orders = input.supplierOrdersTotal ?? 0
    const purchased = input.supplierPurchasedTotal ?? 0
    return [
      { key: 'suppliers', value: formatShellCount(total, 'поставщик', 'поставщика', 'поставщиков'), caption: 'В базе' },
      { key: 'orders', value: String(orders), caption: 'Заказов всего' },
      ...(purchased > 0 ? [{ key: 'sum', value: formatShellMoney(purchased), caption: 'Закуплено' }] : []),
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
      let pipeline = 0
      for (const row of rows) {
        const sum = crm ? Number(row.values[crm.sumFieldId]) : NaN
        if (Number.isFinite(sum)) pipeline += sum
      }
      return [
        { key: 'deals', value: formatShellCount(open, 'сделка', 'сделки', 'сделок'), caption: 'На воронке' },
        ...(pipeline > 0 ? [{ key: 'pipe', value: formatShellMoney(pipeline), caption: 'Сумма в воронке' }] : []),
        { key: 'won', value: String(won), caption: 'Выиграно' },
      ]
    }
    return [{ key: 'deals', value: formatShellCount(total, 'сделка', 'сделки', 'сделок'), caption: 'Сделок' }]
  }

  if (kind === 'crm-clients') {
    const dueToday = input.clientDueToday ?? 0
    const dueOverdue = input.clientDueOverdue ?? 0
    const dueLabel = dueOverdue > 0
      ? `${dueOverdue} просрочено`
      : dueToday > 0
        ? `${dueToday} сегодня`
        : 'нет'
    return [
      ...(clientPipelineAmount != null && clientPipelineAmount > 0 ? [{ key: 'pipe', value: formatShellMoney(clientPipelineAmount), caption: 'Сумма сделок' }] : []),
      ...(clientOpenDeals != null && clientOpenDeals > 0
        ? [{ key: 'open', value: formatShellCount(clientOpenDeals, 'сделка', 'сделки', 'сделок'), caption: 'Открытых сделок' }]
        : []),
      {
        key: 'due',
        value: dueOverdue > 0 ? String(dueOverdue) : dueToday > 0 ? String(dueToday) : '—',
        caption: 'След. контакт',
        note: dueLabel,
        ...(dueOverdue > 0 ? { tone: 'rose' as const } : dueToday > 0 ? { tone: 'amber' as const } : {}),
      },
    ]
  }

  if (kind === 'shop-orders') {
    let amount = 0
    let openCount = 0
    let counted = 0
    const statusField = shop?.statusFieldId ? table?.fields.find(field => field.id === shop.statusFieldId) : undefined
    const terminal = new Set(shop?.terminalStatuses ?? [])
    const totalFieldId = resolveShopOrderTotalFieldId(shop, table)
    for (const row of rows) {
      const summary = (row as BuilderV2DataRecord).summary
      let rowAmount: number | null = summary?.amount != null && Number.isFinite(summary.amount) ? summary.amount : null
      if (rowAmount == null && totalFieldId) {
        const raw = row.values[totalFieldId]
        if (typeof raw === 'number' && Number.isFinite(raw)) rowAmount = raw
      }
      if (rowAmount != null) {
        amount += rowAmount
        counted += 1
      }
      const status = shop?.statusFieldId ? String(row.values[shop.statusFieldId] ?? '') : ''
      if (status && !terminal.has(status)) openCount += 1
      else if (!status) openCount += 1
    }
    const avg = counted > 0 ? amount / counted : 0
    return [
      ...(amount > 0 ? [{ key: 'sum', value: formatShellMoney(amount), caption: 'Сумма заказов' }] : []),
      ...(openCount > 0 ? [{ key: 'open', value: String(openCount), caption: 'В работе' }] : []),
      ...(avg > 0 ? [{ key: 'avg', value: formatShellMoney(avg), caption: 'Средний чек' }] : []),
    ].filter(metric => metricVisible(metric.value))
  }

  return []
}

export function resolveShopOrderTotalFieldId(shop?: NonNullable<AppV2['shop']>, table?: BuilderV2Table): string | undefined {
  if (!table) return undefined
  if (shop?.orderTitleFieldId) {
    const byBinding = table.fields.find(field => field.id !== shop.orderTitleFieldId && /^(?:сумма|итого|total)$/iu.test(field.name.trim()))
    if (byBinding) return byBinding.id
  }
  return table.fields.find(field =>
    ['number', 'formula', 'rollup'].includes(field.type) && /^(?:сумма(?: заказа)?|итого|total)(?:\s|[,(_]|$)/iu.test(field.name.trim())
      && !/^(?:сумма (?:позиции|строки))/iu.test(field.name.trim())
  )?.id
}

export function resolveShopOrderCustomerFieldId(table?: BuilderV2Table): string | undefined {
  // Prefer «Имя клиента» / requestName over empty «Покупатель» leftover columns.
  return table?.fields.find(field => /^(?:имя(?:\s+клиента|\s+заказчика)?|request\s*name)$/iu.test(field.name.trim()))?.id
    ?? table?.fields.find(field => /^(?:клиент|покупатель)$/iu.test(field.name.trim()))?.id
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
    return `${formatShellCount(total, 'товар', 'товара', 'товаров')}${whCount ? ` · ${formatShellCount(whCount, 'склад', 'склада', 'складов')}` : ''}`
  }
  if (kind === 'crm-clients') {
    return formatShellCount(total, 'клиент', 'клиента', 'клиентов')
  }
  if (kind === 'shop-orders') {
    return formatShellCount(total, 'заказ', 'заказа', 'заказов')
  }
  if (kind === 'crm-board') {
    return formatShellCount(total, 'сделка', 'сделки', 'сделок')
  }
  if (kind === 'inventory-purchases' && inventory) {
    const suppliers = new Set<string>()
    for (const row of rows) {
      const raw = inventory.purchaseSupplierFieldId ? row.values[inventory.purchaseSupplierFieldId] : null
      const id = typeof raw === 'string' ? raw
        : Array.isArray(raw) ? raw.find((value): value is string => typeof value === 'string' && Boolean(value))
          : undefined
      if (id) suppliers.add(id)
    }
    const supplierCount = suppliers.size
    return `${formatShellCount(total, 'заказ', 'заказа', 'заказов')}${
      supplierCount ? ` · ${formatShellCount(supplierCount, 'поставщик', 'поставщика', 'поставщиков')}` : ''
    }`
  }
  if (INVENTORY_KINDS.has(kind)) {
    return formatShellCount(total, 'запись', 'записи', 'записей')
  }
  return undefined
}

export function buildListShellTabs(input: ShellMetricsInput & { activeTab: string }): { tabs: ShellTab[]; defaultTab: string } | null {
  const { kind, page, inventory, table, activeTab, lowStockCount } = input
  const rows = rowsOf(input)

  if (kind === 'inventory-items' && inventory) {
    const low = lowStockCount ?? rows.filter(row => row.values[inventory.itemLowFieldId] === true).length
    const categoryField = table?.fields.find(field => field.id === inventory.itemCategoryFieldId)
    const categories = (categoryField?.choices ?? []).filter(choice => choice.name)
    const byCategory = new Map<string, number>()
    for (const row of rows) {
      const key = String(row.values[inventory.itemCategoryFieldId] ?? '')
      if (key) byCategory.set(key, (byCategory.get(key) ?? 0) + 1)
    }
    return {
      defaultTab: 'all',
      tabs: [
        { id: 'all', label: 'Все', count: page?.total ?? rows.length },
        { id: 'low', label: 'Ниже минимума', count: low },
        ...categories.map(choice => ({ id: choice.id, label: choice.name, count: byCategory.get(choice.id) ?? 0 })),
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
    // Hide empty terminal tabs like «Отменено 0» — they add noise without a filter target.
    const visibleChoices = choices.filter(choice => {
      const count = byStatus.get(choice.id) ?? 0
      if (count > 0) return true
      if (/отмен/i.test(choice.name)) return false
      return true
    })
    return {
      defaultTab: activeTab && (activeTab === 'all' || byStatus.has(activeTab)) ? activeTab : 'all',
      tabs: [
        { id: 'all', label: 'Все', count: page?.total ?? rows.length },
        ...visibleChoices.map(choice => ({ id: choice.id, label: choice.name, count: byStatus.get(choice.id) ?? 0 })),
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
    if (tab === 'low') return rows.filter(row => row.values[inventory.itemLowFieldId] === true)
    return rows.filter(row => String(row.values[inventory.itemCategoryFieldId] ?? '') === tab)
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

export function filterInventoryItemRows(
  rows: readonly AppV2Record[],
  inventory: NonNullable<AppV2['inventory']>,
  options: { warehouse?: string; category?: string },
): readonly AppV2Record[] {
  return rows.filter(row => {
    if (options.warehouse && options.warehouse !== 'all') {
      const wh = String(row.values[inventory.itemWarehouseFieldId] ?? '')
      if (wh !== options.warehouse) return false
    }
    if (options.category && options.category !== 'all') {
      const cat = String(row.values[inventory.itemCategoryFieldId] ?? '')
      if (cat !== options.category) return false
    }
    return true
  })
}

const ALL = 'all'

function cellId(row: AppV2Record, fieldId: string | undefined): string {
  if (!fieldId) return ''
  const raw = row.values[fieldId]
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw.find((value): value is string => typeof value === 'string' && Boolean(value)) ?? ''
  return String(raw ?? '')
}

/** Default filter values for a shell kind (all → no filter). */
export function defaultListShellFilters(defs: readonly ListFilterDef[]): Record<string, string> {
  const next: Record<string, string> = {}
  for (const filter of defs) next[filter.id] = filter.allId ?? ALL
  return next
}

/** Build Glide panel filters from fields already present on each list. */
export function buildListShellFilters(input: ShellMetricsInput & {
  supplierOrderCounts?: ReadonlyMap<string, number>
  clientDealCounts?: ReadonlyMap<string, number>
}): ListFilterDef[] {
  const { kind, page, inventory, shop, table, lowStockCount, supplierOrderCounts, clientDealCounts } = input
  const rows = rowsOf(input)
  const total = page?.total ?? rows.length
  const defs: ListFilterDef[] = []

  if (kind === 'inventory-items' && inventory) {
    const low = lowStockCount ?? rows.filter(row => row.values[inventory.itemLowFieldId] === true).length
    defs.push({
      id: 'stock',
      label: 'Остаток',
      options: [
        { id: ALL, label: 'Все', count: total },
        { id: 'low', label: 'Ниже минимума', count: low },
      ],
    })
    const warehouses = new Map<string, { label: string; count: number }>()
    for (const row of rows) {
      const id = cellId(row, inventory.itemWarehouseFieldId)
      if (!id) continue
      const label = (row as BuilderV2DataRecord).display?.[inventory.itemWarehouseFieldId] || id
      const prev = warehouses.get(id)
      warehouses.set(id, { label, count: (prev?.count ?? 0) + 1 })
    }
    if (warehouses.size > 1) {
      defs.push({
        id: 'warehouse',
        label: 'Склад',
        options: [
          { id: ALL, label: 'Все', count: total },
          ...[...warehouses.entries()].map(([id, value]) => ({ id, label: value.label, count: value.count })),
        ],
      })
    }
    const categoryField = table?.fields.find(field => field.id === inventory.itemCategoryFieldId)
    const categories = (categoryField?.choices ?? []).filter(choice => choice.name)
    if (categories.length > 1) {
      const byCategory = new Map<string, number>()
      for (const row of rows) {
        const key = String(row.values[inventory.itemCategoryFieldId] ?? '')
        if (key) byCategory.set(key, (byCategory.get(key) ?? 0) + 1)
      }
      defs.push({
        id: 'category',
        label: 'Категория',
        options: [
          { id: ALL, label: 'Все', count: total },
          ...categories.map(choice => ({ id: choice.id, label: choice.name, count: byCategory.get(choice.id) ?? 0 })),
        ],
      })
    }
    return defs
  }

  if (kind === 'inventory-movements' && inventory) {
    const typeField = table?.fields.find(field => field.id === inventory.movementTypeFieldId)
    const choices = (typeField?.choices ?? []).filter(choice => ['Приход', 'Расход', 'Списание', 'Перемещение'].includes(choice.name))
    if (choices.length) {
      const byType = new Map<string, number>()
      for (const row of rows) {
        const key = typeof row.values[inventory.movementTypeFieldId] === 'string' ? String(row.values[inventory.movementTypeFieldId]) : ''
        if (key) byType.set(key, (byType.get(key) ?? 0) + 1)
      }
      defs.push({
        id: 'type',
        label: 'Тип',
        options: [
          { id: ALL, label: 'Все', count: total },
          ...choices.map(choice => ({ id: choice.id, label: choice.name, count: byType.get(choice.id) ?? 0 })),
        ],
      })
    }
    return defs
  }

  if (kind === 'inventory-purchases' && inventory?.purchaseStatusFieldId) {
    const statusField = table?.fields.find(field => field.id === inventory.purchaseStatusFieldId)
    const choices = (statusField?.choices ?? []).filter(choice => {
      const count = rows.filter(row => String(row.values[inventory.purchaseStatusFieldId!] ?? '') === choice.id).length
      if (count > 0) return true
      return !/отмен/i.test(choice.name)
    })
    if (choices.length >= 2) {
      const byStatus = new Map<string, number>()
      for (const row of rows) {
        const status = String(row.values[inventory.purchaseStatusFieldId] ?? '')
        if (status) byStatus.set(status, (byStatus.get(status) ?? 0) + 1)
      }
      defs.push({
        id: 'status',
        label: 'Статус',
        options: [
          { id: ALL, label: 'Все', count: total },
          ...choices.map(choice => ({ id: choice.id, label: choice.name, count: byStatus.get(choice.id) ?? 0 })),
        ],
      })
    }
    return defs
  }

  if (kind === 'inventory-counts' && inventory?.countStatusFieldId) {
    let draft = 0
    let posted = 0
    for (const row of rows) {
      const status = String(row.values[inventory.countStatusFieldId] ?? '')
      if (inventory.countStatusDraft && status === inventory.countStatusDraft) draft += 1
      else if (inventory.countStatusPosted && status === inventory.countStatusPosted) posted += 1
    }
    defs.push({
      id: 'status',
      label: 'Статус',
      options: [
        { id: ALL, label: 'Все', count: total },
        { id: 'draft', label: 'Черновики', count: draft },
        { id: 'posted', label: 'Проведено', count: posted },
      ],
    })
    return defs
  }

  if (kind === 'inventory-suppliers') {
    let withOrders = 0
    for (const row of rows) {
      if ((supplierOrderCounts?.get(row.id) ?? 0) > 0) withOrders += 1
    }
    defs.push({
      id: 'activity',
      label: 'Активность',
      options: [
        { id: ALL, label: 'Все', count: total },
        { id: 'with-orders', label: 'С заказами', count: withOrders },
        { id: 'without-orders', label: 'Без заказов', count: Math.max(0, total - withOrders) },
      ],
    })
    return defs
  }

  if (kind === 'crm-clients') {
    let withDeals = 0
    for (const row of rows) {
      if ((clientDealCounts?.get(row.id) ?? 0) > 0) withDeals += 1
    }
    defs.push({
      id: 'deals',
      label: 'Сделки',
      options: [
        { id: ALL, label: 'Все', count: total },
        { id: 'with-deals', label: 'Со сделками', count: withDeals },
        { id: 'without-deals', label: 'Без сделок', count: Math.max(0, total - withDeals) },
      ],
    })
    return defs
  }

  if (kind === 'shop-orders' && shop?.statusFieldId) {
    const statusField = table?.fields.find(field => field.id === shop.statusFieldId)
    const choices = statusField?.choices ?? []
    if (choices.length >= 2) {
      const byStatus = new Map<string, number>()
      for (const row of rows) {
        const status = String(row.values[shop.statusFieldId] ?? '')
        if (status) byStatus.set(status, (byStatus.get(status) ?? 0) + 1)
      }
      defs.push({
        id: 'status',
        label: 'Статус',
        options: [
          { id: ALL, label: 'Все', count: total },
          ...choices.map(choice => ({ id: choice.id, label: choice.name, count: byStatus.get(choice.id) ?? 0 })),
        ],
      })
    }
    return defs
  }

  return defs
}

/** Apply Glide panel values to loaded list rows. */
export function applyListShellFilters(
  kind: ListShellKind,
  filters: Record<string, string>,
  rows: readonly AppV2Record[],
  options?: {
    inventory?: NonNullable<AppV2['inventory']>
    shop?: NonNullable<AppV2['shop']>
    supplierOrderCounts?: ReadonlyMap<string, number>
    clientDealCounts?: ReadonlyMap<string, number>
  },
): readonly AppV2Record[] {
  const inventory = options?.inventory
  let next = rows

  if (kind === 'inventory-items' && inventory) {
    const stock = filters.stock ?? ALL
    const warehouse = filters.warehouse ?? ALL
    const category = filters.category ?? ALL
    if (stock === 'low') next = next.filter(row => row.values[inventory.itemLowFieldId] === true)
    next = filterInventoryItemRows(next, inventory, { warehouse, category })
    return next
  }

  if (kind === 'inventory-movements' && inventory) {
    const type = filters.type ?? ALL
    if (type !== ALL) next = next.filter(row => row.values[inventory.movementTypeFieldId] === type)
    return next
  }

  if (kind === 'inventory-purchases' && inventory?.purchaseStatusFieldId) {
    const status = filters.status ?? ALL
    if (status !== ALL) {
      const statusFieldId = inventory.purchaseStatusFieldId
      next = next.filter(row => String(row.values[statusFieldId] ?? '') === status)
    }
    return next
  }

  if (kind === 'inventory-counts' && inventory?.countStatusFieldId) {
    const status = filters.status ?? ALL
    const statusFieldId = inventory.countStatusFieldId
    if (status === 'draft' && inventory.countStatusDraft) {
      next = next.filter(row => String(row.values[statusFieldId] ?? '') === inventory.countStatusDraft)
    } else if (status === 'posted' && inventory.countStatusPosted) {
      next = next.filter(row => String(row.values[statusFieldId] ?? '') === inventory.countStatusPosted)
    }
    return next
  }

  if (kind === 'inventory-suppliers') {
    const activity = filters.activity ?? ALL
    if (activity === 'with-orders') {
      next = next.filter(row => (options?.supplierOrderCounts?.get(row.id) ?? 0) > 0)
    } else if (activity === 'without-orders') {
      next = next.filter(row => (options?.supplierOrderCounts?.get(row.id) ?? 0) <= 0)
    }
    return next
  }

  if (kind === 'crm-clients') {
    const deals = filters.deals ?? ALL
    if (deals === 'with-deals') {
      next = next.filter(row => (options?.clientDealCounts?.get(row.id) ?? 0) > 0)
    } else if (deals === 'without-deals') {
      next = next.filter(row => (options?.clientDealCounts?.get(row.id) ?? 0) <= 0)
    }
    return next
  }

  if (kind === 'shop-orders' && options?.shop?.statusFieldId) {
    const status = filters.status ?? ALL
    if (status !== ALL) {
      const statusFieldId = options.shop.statusFieldId
      next = next.filter(row => String(row.values[statusFieldId] ?? '') === status)
    }
    return next
  }

  return next
}

/** Map desktop quick-tab click onto panel filter values. */
export function listShellTabToFilters(
  kind: ListShellKind,
  tab: string,
  current: Record<string, string>,
): Record<string, string> {
  if (kind === 'inventory-items') {
    if (tab === ALL) return { ...current, stock: ALL, category: ALL }
    if (tab === 'low') return { ...current, stock: 'low', category: ALL }
    return { ...current, stock: ALL, category: tab }
  }
  if (kind === 'inventory-movements') return { ...current, type: tab }
  if (kind === 'inventory-purchases' || kind === 'inventory-counts' || kind === 'shop-orders') {
    return { ...current, status: tab }
  }
  return current
}

export function listShellFiltersToTab(kind: ListShellKind, filters: Record<string, string>): string {
  if (kind === 'inventory-items') {
    if ((filters.stock ?? ALL) === 'low') return 'low'
    const category = filters.category ?? ALL
    if (category !== ALL) return category
    return ALL
  }
  if (kind === 'inventory-movements') return filters.type ?? ALL
  if (kind === 'inventory-purchases' || kind === 'inventory-counts' || kind === 'shop-orders') {
    return filters.status ?? ALL
  }
  return ALL
}

export function listShellMetaForCount(kind: ListShellKind, count: number): string {
  switch (kind) {
    case 'inventory-items': return formatShellCount(count, 'товар', 'товара', 'товаров')
    case 'crm-clients': return formatShellCount(count, 'клиент', 'клиента', 'клиентов')
    case 'shop-orders':
    case 'inventory-purchases': return formatShellCount(count, 'заказ', 'заказа', 'заказов')
    case 'crm-board': return formatShellCount(count, 'сделка', 'сделки', 'сделок')
    case 'inventory-suppliers': return formatShellCount(count, 'поставщик', 'поставщика', 'поставщиков')
    case 'inventory-counts': return formatShellCount(count, 'документ', 'документа', 'документов')
    case 'inventory-movements': return formatShellCount(count, 'операция', 'операции', 'операций')
  }
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

export function inventoryStockListFooter(rows: readonly AppV2Record[], inventory: NonNullable<AppV2['inventory']>): { label: string; units: string; total?: string } | null {
  if (!rows.length) return null
  let units = 0
  let total = 0
  for (const row of rows) {
    const stock = Number(row.values[inventory.itemStockFieldId])
    const cost = Number(row.values[inventory.itemCostFieldId])
    if (Number.isFinite(stock)) units += stock
    if (Number.isFinite(stock) && Number.isFinite(cost)) total += stock * cost
  }
  return {
    label: formatShellCount(rows.length, 'товар', 'товара', 'товаров'),
    units: `${units.toLocaleString('ru-RU')} шт.`,
    ...(total > 0 ? { total: `Итого ${formatShellMoney(total)}` } : {}),
  }
}
