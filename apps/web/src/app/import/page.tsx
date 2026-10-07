import { db, fields as fieldsTable, tables } from '@tableapp/db'
import type { Field } from '@tableapp/schema'
import { byPosition, normalizeFieldOptions } from '@tableapp/schema'
import { asc, eq } from 'drizzle-orm'
import { ImportScreen, type ImportTarget } from '@/components/import/import-screen'
import { AppChrome } from '@/components/app-chrome'
import { listMemberships, requireMember } from '@/lib/session'
import { PRIVATE_PAGE } from '@/lib/seo'

/*
 * В поиске этой странице делать нечего: за ней рабочее пространство.
 * Запрет в robots.txt обход закрывает, но не индексацию — адрес, на который
 * кто-то сослался, попадает в выдачу и без обхода. Отказ говорится здесь.
 */
export const metadata = PRIVATE_PAGE

export const dynamic = 'force-dynamic'

/**
 * Импорт.
 *
 * Без параметра создаёт новую таблицу из файла. С `?table=` грузит строки
 * в уже существующую — так шаблон наполняется своими данными, а не остаётся
 * витриной с примерами.
 */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>
}) {
  const member = await requireMember()
  const { table: tableId } = await searchParams

  /*
   * Все таблицы пространства с их колонками: книга из нескольких листов
   * может лечь и в новые таблицы, и в существующие, причём у каждого листа
   * своя. Чужие сюда не попадают — выбор идёт по одному пространству.
   */
  const own = await db
    .select()
    .from(tables)
    .where(eq(tables.workspaceId, member.workspaceId))
    .orderBy(asc(tables.position))

  const columns = await db
    .select()
    .from(fieldsTable)
    .innerJoin(tables, eq(tables.id, fieldsTable.tableId))
    .where(eq(tables.workspaceId, member.workspaceId))
    .orderBy(asc(fieldsTable.position))

  const fieldsOf = (id: string): Field[] =>
    columns
      .filter((row) => row.fields.tableId === id)
      .map((row) => ({
        ...row.fields,
        options: normalizeFieldOptions(row.fields.type as Field['type'], row.fields.options),
      }) as unknown as Field)
      .sort(byPosition)

  const targets: ImportTarget[] = own.map((table) => ({
    id: table.id,
    name: table.name,
    fields: fieldsOf(table.id),
  }))

  // Чужая таблица открывается как обычный импорт: молча грузить в неё нельзя.
  const target = tableId ? targets.find((item) => item.id === tableId) : undefined

  return (
    <AppChrome
      member={{ email: member.email, workspaceName: member.workspaceName, role: member.role }}
      memberships={await listMemberships(member.userId)}
      activeWorkspaceId={member.workspaceId}
    >
      <ImportScreen tables={targets} target={target} />
    </AppChrome>
  )
}
