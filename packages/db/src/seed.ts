/**
 * Демонстрационные данные: сквозной путь CSV -> импортёр -> база.
 * Заодно служит проверкой слоя данных: если сид прошёл, цепочка работает.
 */
import { buildFromCsv } from '@tableapp/import'
import { defaultViewConfig, newId, positionBetween, positionSequence } from '@tableapp/schema'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { fields, rows, tables, users, views, workspaceMembers, workspaces } from './schema'

const DEMO_EMAIL = 'demo@tableapp.ru'

const DEMO_CSV = [
  'Клиент;Телефон;Сумма;Оплачено;Срок;Статус',
  'ООО «Ромашка»;+7 495 123-45-67;1 250 000,50;да;14.03.2026;Новая',
  'ИП Иванов;+7 916 555-11-22;89 900;нет;15.03.2026;В работе',
  'ООО «Вектор»;+7 812 777-33-44;430 000;да;16.03.2026;Готово',
  'ЗАО «Полюс»;+7 343 222-88-99;15 000;нет;17.03.2026;Новая',
  'ИП Петрова;+7 921 444-66-77;235 500;да;18.03.2026;В работе',
  'ООО «Сфера»;+7 383 111-99-00;72 300;нет;19.03.2026;Готово',
  'ООО «Кристалл»;+7 863 333-55-11;510 000;да;20.03.2026;Новая',
].join('\n')

async function main() {
  const existing = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1)
  if (existing[0]) {
    console.log(`Демо-пользователь уже есть: ${existing[0].id}. Сид пропущен.`)
    return
  }

  const userId = newId('user')
  const workspaceId = newId('workspace')
  const tableId = newId('table')

  await db.insert(users).values({ id: userId, email: DEMO_EMAIL, name: 'Демо' })
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Демо-воркспейс',
    slug: 'demo',
    ownerId: userId,
  })
  await db.insert(workspaceMembers).values({
    workspaceId,
    userId,
    role: 'owner',
    acceptedAt: new Date(),
  })

  const imported = buildFromCsv(DEMO_CSV, { tableId })
  console.log('Импортёр определил типы:')
  for (const field of imported.fields) {
    console.log(`  ${field.name.padEnd(12)} -> ${field.type}`)
  }

  await db.insert(tables).values({
    id: tableId,
    workspaceId,
    name: 'Заявки',
    icon: 'table',
    position: positionBetween(null, null),
    primaryFieldId: imported.fields[0]?.id ?? null,
  })

  await db.insert(fields).values(
    imported.fields.map((field) => ({
      id: field.id,
      tableId,
      name: field.name,
      type: field.type,
      options: field.options,
      description: field.description,
      position: field.position,
    })),
  )

  const positions = positionSequence(imported.rows.length)
  await db.insert(rows).values(
    imported.rows.map((data, index) => ({
      id: newId('row'),
      tableId,
      data,
      position: positions[index]!,
      createdBy: userId,
      updatedBy: userId,
    })),
  )

  await db.insert(views).values({
    id: newId('view'),
    tableId,
    name: 'Все заявки',
    type: 'grid',
    config: defaultViewConfig('grid', newId('filter')),
    position: positionBetween(null, null),
  })

  console.log(`\nСоздано: воркспейс ${workspaceId}, таблица ${tableId}, строк ${imported.rows.length}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
