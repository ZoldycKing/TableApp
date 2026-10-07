/** Добавляет в «Заявки» поле ответственного, чтобы проверить правила видимости строк. */
import { newId, normalizeFieldOptions, positionBetween } from '@tableapp/schema'
import { asc, eq } from 'drizzle-orm'
import { db } from './client'
import { fields, rows, tables } from './schema'

const OWNERS = ['anna@example.ru', 'boris@example.ru']

async function main() {
  const [orders] = await db.select().from(tables).where(eq(tables.name, 'Заявки')).limit(1)
  if (!orders) throw new Error('Таблица «Заявки» не найдена')

  const existing = await db.select().from(fields).where(eq(fields.tableId, orders.id)).orderBy(asc(fields.position))
  if (existing.some((field) => field.name === 'Ответственный')) {
    console.log('Поле «Ответственный» уже есть. Сид пропущен.')
    return
  }

  const fieldId = newId('field')
  await db.insert(fields).values({
    id: fieldId,
    tableId: orders.id,
    name: 'Ответственный',
    type: 'email',
    options: normalizeFieldOptions('email'),
    description: null,
    position: positionBetween(existing[existing.length - 1]?.position ?? null, null),
  })

  const orderRows = await db.select().from(rows).where(eq(rows.tableId, orders.id)).orderBy(asc(rows.position))
  for (const [index, row] of orderRows.entries()) {
    await db
      .update(rows)
      .set({ data: { ...(row.data as Record<string, unknown>), [fieldId]: OWNERS[index % OWNERS.length]! } })
      .where(eq(rows.id, row.id))
  }

  const counts = OWNERS.map((email, i) => `${email}: ${orderRows.filter((_, index) => index % OWNERS.length === i).length}`)
  console.log(`Поле «Ответственный» добавлено. ${counts.join(', ')}`)
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
