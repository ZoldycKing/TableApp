/** Добавляет в «Позиции» поле для фотографий — проверка загрузки файлов. */
import { newId, normalizeFieldOptions, positionBetween } from '@tableapp/schema'
import { asc, eq } from 'drizzle-orm'
import { db } from './client'
import { fields, tables } from './schema'

async function main() {
  const [items] = await db.select().from(tables).where(eq(tables.name, 'Позиции')).limit(1)
  if (!items) throw new Error('Таблица «Позиции» не найдена')

  const existing = await db.select().from(fields).where(eq(fields.tableId, items.id)).orderBy(asc(fields.position))
  if (existing.some((field) => field.name === 'Фото')) {
    console.log('Поле «Фото» уже есть. Сид пропущен.')
    return
  }

  await db.insert(fields).values({
    id: newId('field'),
    tableId: items.id,
    name: 'Фото',
    type: 'image',
    options: normalizeFieldOptions('image', { maxCount: 4 }),
    description: null,
    position: positionBetween(existing[existing.length - 1]?.position ?? null, null),
  })
  console.log('Поле «Фото» добавлено в «Позиции» (до 4 изображений).')
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
