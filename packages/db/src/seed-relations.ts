/**
 * Демонстрация связей: таблица «Позиции», связь из «Заявок»,
 * Lookup названий и Rollup суммы. Проверяет вычисления на реальных данных.
 */
import { defaultViewConfig, newId, normalizeFieldOptions, positionBetween, positionSequence } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { fields, rows, tables, views } from './schema'

const ITEMS = [
  { title: 'Монтаж оборудования', price: 450000 },
  { title: 'Пусконаладка', price: 180000 },
  { title: 'Обучение персонала', price: 95000 },
  { title: 'Годовое обслуживание', price: 320000 },
  { title: 'Доставка', price: 25000 },
]

async function main() {
  const [orders] = await db.select().from(tables).where(eq(tables.name, 'Заявки')).limit(1)
  if (!orders) throw new Error('Таблица «Заявки» не найдена — сначала выполните pnpm db:seed')

  const existing = await db.select().from(tables).where(eq(tables.name, 'Позиции')).limit(1)
  if (existing[0]) {
    console.log('Таблица «Позиции» уже есть. Сид пропущен.')
    return
  }

  const itemsTableId = newId('table')
  const [titleId, priceId] = [newId('field'), newId('field')]
  const [titlePos, pricePos] = positionSequence(2) as [string, string]

  await db.insert(tables).values({
    id: itemsTableId,
    workspaceId: orders.workspaceId,
    name: 'Позиции',
    icon: 'table',
    position: positionBetween(orders.position, null),
    primaryFieldId: titleId,
  })

  await db.insert(fields).values([
    { id: titleId, tableId: itemsTableId, name: 'Наименование', type: 'text', options: normalizeFieldOptions('text'), description: null, position: titlePos },
    { id: priceId, tableId: itemsTableId, name: 'Цена', type: 'number', options: normalizeFieldOptions('number', { format: 'currency' }), description: null, position: pricePos },
  ])

  const itemPositions = positionSequence(ITEMS.length)
  const itemIds = ITEMS.map(() => newId('row'))
  await db.insert(rows).values(
    ITEMS.map((item, index) => ({
      id: itemIds[index]!,
      tableId: itemsTableId,
      data: { [titleId]: item.title, [priceId]: item.price },
      position: itemPositions[index]!,
    })),
  )

  await db.insert(views).values({
    id: newId('view'),
    tableId: itemsTableId,
    name: 'Все позиции',
    type: 'grid',
    config: defaultViewConfig('grid', newId('filter')),
    position: positionBetween(null, null),
  })

  // Связь и производные поля в «Заявках».
  const orderFields = await db.select().from(fields).where(eq(fields.tableId, orders.id))
  const lastPosition = orderFields.map((f) => f.position).sort().at(-1) ?? null
  const [relPos, lookupPos, rollupPos, countPos] = positionSequence(4, null).map((_, i, all) =>
    all.slice(0, i + 1).reduce((prev) => positionBetween(prev, null), lastPosition),
  ) as [string, string, string, string]

  const relationId = newId('field')
  await db.insert(fields).values([
    {
      id: relationId, tableId: orders.id, name: 'Позиции', type: 'relation',
      options: { tableId: itemsTableId, allowMultiple: true, symmetricFieldId: null },
      description: null, position: relPos,
    },
    {
      id: newId('field'), tableId: orders.id, name: 'Что заказано', type: 'lookup',
      options: { relationFieldId: relationId, targetFieldId: titleId },
      description: null, position: lookupPos,
    },
    {
      id: newId('field'), tableId: orders.id, name: 'Итого по позициям', type: 'rollup',
      options: { relationFieldId: relationId, targetFieldId: priceId, fn: 'sum' },
      description: null, position: rollupPos,
    },
    {
      id: newId('field'), tableId: orders.id, name: 'Позиций', type: 'count',
      options: { relationFieldId: relationId },
      description: null, position: countPos,
    },
  ])

  // Раскидываем позиции по заявкам, чтобы суммы отличались.
  const orderRows = await db.select().from(rows).where(eq(rows.tableId, orders.id))
  const assignment = [[0, 1], [2], [0, 3, 4], [4], [1, 2, 3], [], [0, 2]]
  for (const [index, order] of orderRows.entries()) {
    const picks = assignment[index % assignment.length]!
    await db
      .update(rows)
      .set({ data: { ...(order.data as Record<string, unknown>), [relationId]: picks.map((i) => itemIds[i]!) } })
      .where(eq(rows.id, order.id))
  }

  console.log(`Создана таблица «Позиции» (${ITEMS.length} строк) и связь из «Заявок» с Lookup, Rollup и счётчиком.`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
